const supabase = require('../config/supabase')
const { guardarImagen, obtenerUrlFirmada } = require('../utils/storage')
const { tipoPorContenido } = require('../utils/imagenes')
const { esParticipanteTrabajo } = require('../utils/participantes')
const { faltaMigracion } = require('../services/cuentasService')
const { notificar, notificarEmpleador, notificarEmpleado } = require('../services/notificacionesService')

// Sprint 6 — disputas: cualquiera de las dos partes de un trabajo reporta un problema
// (motivo + descripción + foto opcional). Queda en la tabla `disputas` como 'abierta' y
// aparece en el panel de admin (pestaña "Disputas"), donde se revisa y se resuelve o
// rechaza. Cada cambio se le notifica a quien reportó.
//
// El contrato es el que ya usa el front (AppEmployee/AppEmployer lib/disputas.ts):
//   POST /api/trabajos/:id/disputas  multipart { motivo, descripcion, foto? }
//   201 { disputa: { id, estado: 'abierta', creado_en, ... } }
// y `motivo` es uno de los textos de MOTIVOS_DISPUTA de esa app (por eso acá son textos
// y no códigos: si cambian allá, hay que cambiarlos acá).
//
// Ciclo: abierta → en_revision → resuelta | rechazada (las dos últimas son finales).
// Sin la tabla en la base (no se corrió la migración del Sprint 6): 503.

const MOTIVOS_DISPUTA = [
  'El trabajo no se hizo o quedó incompleto',
  'Problema con el pago',
  'La otra persona no se presentó',
  'Daños o problemas de seguridad',
  'Trato inadecuado',
  'Otro',
]

// Desde que alguien aceptó: antes no hay "otra parte" con quien tener un problema.
const ESTADOS_CON_DISPUTA = ['asignado', 'en_progreso', 'completado', 'cancelado']
const DIAS_PARA_REPORTAR  = 7
const MIN_DESCRIPCION     = 10
const MAX_DESCRIPCION     = 1000

const TRANSICIONES = {
  abierta:     ['en_revision', 'resuelta', 'rechazada'],
  en_revision: ['resuelta', 'rechazada'],
  resuelta:    [],
  rechazada:   [],
}

const CAMPOS_DISPUTA = 'id, trabajo_id, reportado_por, rol_reportante, motivo, descripcion, foto_s3_key, estado, resolucion, resuelto_en, creado_en, actualizado_en'
const SIN_TABLA = { status: 503, error: 'Los reportes todavía no están disponibles. Probá más tarde.' }

function responderErrorTabla(res, contexto, error) {
  if (faltaMigracion(error)) {
    console.error(`Disputas no disponibles (${contexto}): falta la tabla disputas. Correr migrations/sprint6_programados_cancelaciones_disputas.sql.`)
    return res.status(SIN_TABLA.status).json({ error: SIN_TABLA.error })
  }
  console.error(`Error en disputas (${contexto}): ${error.message ?? error}`)
  return res.status(500).json({ error: 'Error procesando el reporte' })
}

// URL firmada (1h) de la foto, si hay. Si falla la firma, la disputa se muestra igual.
async function conFoto(disputa) {
  if (!disputa.foto_s3_key) return { ...disputa, fotoUrl: null }
  try {
    return { ...disputa, fotoUrl: await obtenerUrlFirmada(disputa.foto_s3_key) }
  } catch (error) {
    console.error(`Error firmando la foto de la disputa ${disputa.id}: ${error.message ?? error}`)
    return { ...disputa, fotoUrl: null }
  }
}

// POST /api/trabajos/:id/disputas
async function crearDisputa(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId, tipo } = req.usuario
  const motivo      = typeof req.body?.motivo === 'string' ? req.body.motivo.trim() : ''
  const descripcion = typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : ''

  if (!MOTIVOS_DISPUTA.includes(motivo)) {
    console.error(`Disputa rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): motivo inválido ${JSON.stringify(motivo)}.`)
    return res.status(400).json({ error: 'Elegí qué tipo de problema tuviste.' })
  }
  if (descripcion.length < MIN_DESCRIPCION || descripcion.length > MAX_DESCRIPCION) {
    console.error(`Disputa rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): descripción de ${descripcion.length} caracteres.`)
    return res.status(400).json({ error: `Contanos qué pasó (entre ${MIN_DESCRIPCION} y ${MAX_DESCRIPCION} caracteres).` })
  }
  if (req.file && (!req.file.size || !tipoPorContenido(req.file.buffer))) {
    console.error(`Disputa rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): la foto no es JPG/PNG o llegó vacía (${req.file.size} bytes).`)
    return res.status(400).json({ error: 'La foto tiene que ser JPG o PNG.' })
  }

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select('id, titulo, estado, trabajador_id, empleador_id, finalizado_en, cancelado_en')
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  if (!(await esParticipanteTrabajo(trabajo, usuarioId, tipo))) {
    console.error(`Disputa rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no participa de este trabajo.`)
    return res.status(403).json({ error: 'No participás de este trabajo' })
  }
  if (!ESTADOS_CON_DISPUTA.includes(trabajo.estado) || !trabajo.trabajador_id) {
    console.error(`Disputa rechazada (trabajoId=${trabajoId}): estado '${trabajo.estado}', trabajador ${trabajo.trabajador_id ?? 'ninguno'}.`)
    return res.status(400).json({ error: 'Solo se puede reportar un problema de un trabajo que alguien aceptó.' })
  }
  const cerradoEn = trabajo.finalizado_en ?? trabajo.cancelado_en
  if (cerradoEn && Date.now() - new Date(cerradoEn).getTime() > DIAS_PARA_REPORTAR * 24 * 60 * 60 * 1000) {
    console.error(`Disputa rechazada (trabajoId=${trabajoId}): pasaron más de ${DIAS_PARA_REPORTAR} días del cierre.`)
    return res.status(400).json({ error: `Los problemas se pueden reportar hasta ${DIAS_PARA_REPORTAR} días después de terminado el trabajo.` })
  }

  // Una abierta por persona y trabajo: evita duplicados en el panel.
  const { data: abierta, error: errorAbierta } = await supabase
    .from('disputas').select('id')
    .eq('trabajo_id', trabajoId).eq('reportado_por', usuarioId)
    .in('estado', ['abierta', 'en_revision'])
    .limit(1)
  if (errorAbierta) return responderErrorTabla(res, `buscando duplicadas, trabajoId=${trabajoId}`, errorAbierta)
  if (abierta?.length) {
    return res.status(409).json({ error: 'Ya tenés un reporte abierto para este trabajo. Te avisamos cuando lo revisemos.' })
  }

  let fotoKey = null
  if (req.file) {
    try {
      fotoKey = await guardarImagen(req.file.buffer, 'disputa', trabajoId)
    } catch (error) {
      console.error(`Error subiendo foto de disputa a S3 (trabajoId=${trabajoId}): ${error.message ?? error}`)
      return res.status(502).json({ error: 'No pudimos subir la foto. Intentá de nuevo.' })
    }
  }

  const { data: disputa, error } = await supabase
    .from('disputas')
    .insert({
      trabajo_id: trabajoId, reportado_por: usuarioId,
      rol_reportante: tipo === 'empleado' ? 'empleado' : 'empleador',
      motivo, descripcion, foto_s3_key: fotoKey,
    })
    .select(CAMPOS_DISPUTA)
    .single()

  if (error) return responderErrorTabla(res, `guardando, trabajoId=${trabajoId}`, error)

  console.log(`Disputa nueva (disputaId=${disputa.id}, trabajoId=${trabajoId}): pendiente de revisión en el panel de admin.`)
  res.status(201).json({ disputa })

  // A la otra parte se le avisa que hay un reporte, sin el detalle (eso lo ve el admin).
  const aviso = {
    tipo: 'disputa', titulo: 'Se reportó un problema',
    mensaje: `Se abrió un reporte sobre "${trabajo.titulo}". Nuestro equipo lo va a revisar.`,
    trabajoId,
  }
  if (tipo === 'empleado') notificarEmpleador(trabajo.empleador_id, aviso)
  else notificarEmpleado(trabajo.trabajador_id, aviso)
}

// ─── Panel de admin ──────────────────────────────────────────────────────────

const POR_PAGINA_DEFAULT = 25

// GET /api/admin/disputas?estado=&pagina=&porPagina=
async function listarDisputasAdmin(req, res) {
  const pagina    = Number(req.query.pagina) || 1
  const porPagina = Number(req.query.porPagina) || POR_PAGINA_DEFAULT

  let consulta = supabase.from('disputas').select(CAMPOS_DISPUTA, { count: 'exact' })
    .order('creado_en', { ascending: false })
    .range((pagina - 1) * porPagina, pagina * porPagina - 1)
  if (req.query.estado) consulta = consulta.eq('estado', req.query.estado)

  const { data, count, error } = await consulta
  if (error) return responderErrorTabla(res, 'listado admin', error)

  // Contexto en lote (no una consulta por fila): título del trabajo y email del que reportó.
  const trabajoIds = [...new Set(data.map(d => d.trabajo_id))]
  const usuarioIds = [...new Set(data.map(d => d.reportado_por))]
  const [{ data: trabajos }, { data: usuarios }] = await Promise.all([
    trabajoIds.length ? supabase.from('trabajos').select('id, titulo, estado').in('id', trabajoIds) : { data: [] },
    usuarioIds.length ? supabase.from('usuarios').select('id, email').in('id', usuarioIds) : { data: [] },
  ])
  const trabajoPorId = Object.fromEntries((trabajos ?? []).map(t => [t.id, t]))
  const emailPorId   = Object.fromEntries((usuarios ?? []).map(u => [u.id, u.email]))

  const disputas = await Promise.all(data.map(async d => ({
    ...(await conFoto(d)),
    trabajo:  trabajoPorId[d.trabajo_id] ?? null,
    reportante: emailPorId[d.reportado_por] ?? null,
  })))

  res.json({ disputas, total: count ?? disputas.length, pagina, porPagina })
}

// GET /api/admin/disputas/:id — todo para decidir: la disputa, el trabajo, la
// evidencia del trabajador y el chat entre las partes.
async function obtenerDisputaAdmin(req, res) {
  const { id } = req.params
  const { data: disputa, error } = await supabase.from('disputas').select(CAMPOS_DISPUTA).eq('id', id).maybeSingle()
  if (error) return responderErrorTabla(res, `detalle ${id}`, error)
  if (!disputa) return res.status(404).json({ error: 'Disputa no encontrada' })

  const [{ data: trabajo }, { data: evidencias }, { data: mensajes }] = await Promise.all([
    supabase.from('trabajos')
      .select('id, titulo, descripcion, categoria, nivel_dificultad, precio, estado, creado_en, iniciado_en, finalizado_en, cancelado_por, motivo_cancelacion')
      .eq('id', disputa.trabajo_id).maybeSingle(),
    supabase.from('evidencias_trabajo').select('id, s3_key, creado_en').eq('trabajo_id', disputa.trabajo_id),
    supabase.from('mensajes_chat').select('remitente_tipo, mensaje, enviado_en')
      .eq('trabajo_id', disputa.trabajo_id).order('enviado_en', { ascending: true }),
  ])

  let conUrl = []
  try {
    conUrl = await Promise.all((evidencias ?? []).map(async e => ({ ...e, url: await obtenerUrlFirmada(e.s3_key) })))
  } catch (errorFirma) {
    console.error(`Error firmando evidencias de la disputa ${id}: ${errorFirma.message ?? errorFirma}`)
  }

  res.json({ disputa: await conFoto(disputa), trabajo, evidencias: conUrl, mensajes: mensajes ?? [] })
}

// POST /api/admin/disputas/:id/estado { estado, resolucion }
async function cambiarEstadoDisputa(req, res) {
  const { id } = req.params
  const { estado } = req.body
  const resolucion = req.body.resolucion?.trim() || null

  const esFinal = estado === 'resuelta' || estado === 'rechazada'
  if (esFinal && !resolucion) {
    return res.status(400).json({ error: 'Para resolver o rechazar hay que escribir la resolución (se le muestra a quien reportó).' })
  }

  const { data: actual, error: errorLectura } = await supabase
    .from('disputas').select('id, estado, trabajo_id, reportado_por').eq('id', id).maybeSingle()
  if (errorLectura) return responderErrorTabla(res, `leyendo ${id}`, errorLectura)
  if (!actual) return res.status(404).json({ error: 'Disputa no encontrada' })

  if (!TRANSICIONES[actual.estado].includes(estado)) {
    console.error(`Cambio de disputa rechazado (disputaId=${id}): ${actual.estado} → ${estado} no es una transición válida.`)
    return res.status(409).json({ error: `No se puede pasar de '${actual.estado}' a '${estado}'.` })
  }

  const ahora = new Date().toISOString()
  // Condicional sobre el estado leído: si dos admins la tocan a la vez, gana uno.
  const { data: actualizadas, error } = await supabase
    .from('disputas')
    .update({ estado, resolucion, resuelto_en: esFinal ? ahora : null, actualizado_en: ahora })
    .eq('id', id).eq('estado', actual.estado)
    .select(CAMPOS_DISPUTA)

  if (error) return responderErrorTabla(res, `actualizando ${id}`, error)
  if (!actualizadas?.length) {
    return res.status(409).json({ error: 'La disputa cambió mientras la editabas. Recargá e intentá de nuevo.' })
  }

  res.json({ disputa: actualizadas[0] })

  const mensajes = {
    en_revision: 'Estamos revisando el problema que reportaste.',
    resuelta:    `Resolvimos tu reporte: ${resolucion}`,
    rechazada:   `Revisamos tu reporte y no corresponde: ${resolucion}`,
  }
  notificar(actual.reportado_por, {
    tipo: 'disputa', titulo: 'Actualización de tu reporte', mensaje: mensajes[estado], trabajoId: actual.trabajo_id,
  })
}

module.exports = {
  crearDisputa, listarDisputasAdmin, obtenerDisputaAdmin, cambiarEstadoDisputa,
  MOTIVOS_DISPUTA,
}
