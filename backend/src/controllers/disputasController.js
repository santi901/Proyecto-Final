const supabase = require('../config/supabase')
const { guardarImagen, obtenerUrlFirmada } = require('../utils/storage')
const { esParticipanteTrabajo } = require('../utils/participantes')
const { notificar, notificarEmpleador, notificarEmpleado } = require('../services/notificacionesService')

// Sprint 6 — disputas: cualquiera de las dos partes de un trabajo reporta un
// problema (motivo + descripción + foto opcional). El reporte queda en la tabla
// `disputas` con estado 'abierta' y aparece en el panel de admin (GET /admin),
// donde alguien del equipo lo revisa y lo resuelve o lo rechaza. Cada cambio de
// estado se le notifica a quien reportó.
//
// Ciclo de vida:  abierta → en_revision → resuelta | rechazada
//                 abierta ───────────────→ resuelta | rechazada
// resuelta y rechazada son finales.

const MOTIVOS_DISPUTA = {
  no_se_presento:     'La otra parte no se presentó',
  trabajo_incompleto: 'El trabajo quedó incompleto',
  mala_calidad:       'El trabajo se hizo mal',
  danos:              'Hubo daños o roturas',
  problema_pago:      'Problema con el pago',
  conducta:           'Mala conducta o trato',
  otro:               'Otro problema',
}

// Desde que alguien aceptó (antes no hay "otra parte" con quien tener un problema).
const ESTADOS_CON_DISPUTA = ['asignado', 'en_progreso', 'completado', 'cancelado']
// Un trabajo cerrado se puede reportar hasta una semana después.
const DIAS_PARA_REPORTAR = 7
const MIN_LARGO_DESCRIPCION = 10
const MAX_LARGO_DESCRIPCION = 1000
const MAX_LARGO_RESOLUCION  = 1000

const ESTADOS_DISPUTA = ['abierta', 'en_revision', 'resuelta', 'rechazada']
const TRANSICIONES = {
  abierta:     ['en_revision', 'resuelta', 'rechazada'],
  en_revision: ['resuelta', 'rechazada'],
  resuelta:    [],
  rechazada:   [],
}

const CAMPOS_DISPUTA = 'id, trabajo_id, reportado_por, rol_reportante, motivo, descripcion, foto_s3_key, estado, resolucion, resuelto_en, creado_en, actualizado_en'

// Agrega la URL firmada (1h) de la foto, si hay. Si falla la firma no rompe el listado.
async function conFoto(disputa) {
  let fotoUrl = null
  if (disputa.foto_s3_key) {
    try {
      fotoUrl = await obtenerUrlFirmada(disputa.foto_s3_key)
    } catch (error) {
      console.error(`Error firmando foto de disputa (disputaId=${disputa.id}): ${error.message ?? error}`)
    }
  }
  return { ...disputa, motivoTexto: MOTIVOS_DISPUTA[disputa.motivo] ?? disputa.motivo, fotoUrl }
}

// GET /api/trabajos/motivos-disputa
function motivosDisputa(_req, res) {
  res.json({ motivos: Object.entries(MOTIVOS_DISPUTA).map(([codigo, texto]) => ({ codigo, texto })) })
}

// POST /api/trabajos/:id/disputas — multipart: motivo, descripcion, foto (opcional).
async function crearDisputa(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId, tipo } = req.usuario
  const { motivo } = req.body ?? {}
  const descripcion = typeof req.body?.descripcion === 'string' ? req.body.descripcion.trim() : ''

  if (!motivo || !Object.hasOwn(MOTIVOS_DISPUTA, motivo)) {
    console.error(`Disputa rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): motivo inválido ${JSON.stringify(motivo)}.`)
    return res.status(400).json({ error: `Elegí un motivo válido: ${Object.keys(MOTIVOS_DISPUTA).join(', ')}` })
  }
  if (descripcion.length < MIN_LARGO_DESCRIPCION || descripcion.length > MAX_LARGO_DESCRIPCION) {
    console.error(`Disputa rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): descripción de ${descripcion.length} caracteres.`)
    return res.status(400).json({ error: `Contanos qué pasó (entre ${MIN_LARGO_DESCRIPCION} y ${MAX_LARGO_DESCRIPCION} caracteres)` })
  }
  if (req.file && req.file.size === 0) {
    console.error(`Disputa rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): la foto llegó vacía (0 bytes).`)
    return res.status(400).json({ error: 'La foto llegó vacía. Volvé a elegirla e intentá de nuevo.' })
  }
  if (req.file && !req.file.mimetype?.startsWith('image/')) {
    console.error(`Disputa rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): archivo de tipo ${req.file.mimetype}.`)
    return res.status(400).json({ error: 'El archivo tiene que ser una imagen' })
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
    console.error(`Disputa rechazada (trabajoId=${trabajoId}): estado actual '${trabajo.estado}'.`)
    return res.status(400).json({ error: 'Solo se puede reportar un problema de un trabajo que alguien aceptó' })
  }

  const cerradoEn = trabajo.finalizado_en ?? trabajo.cancelado_en
  if (['completado', 'cancelado'].includes(trabajo.estado) && cerradoEn &&
      Date.now() - new Date(cerradoEn).getTime() > DIAS_PARA_REPORTAR * 24 * 60 * 60 * 1000) {
    console.error(`Disputa rechazada (trabajoId=${trabajoId}): pasaron más de ${DIAS_PARA_REPORTAR} días del cierre.`)
    return res.status(400).json({ error: `Los problemas se pueden reportar hasta ${DIAS_PARA_REPORTAR} días después de terminado el trabajo` })
  }

  // Una disputa abierta por persona y trabajo: si hay algo más que agregar, se
  // espera la resolución (evita que el panel se llene de duplicados).
  const { data: abierta } = await supabase
    .from('disputas').select('id')
    .eq('trabajo_id', trabajoId).eq('reportado_por', usuarioId)
    .in('estado', ['abierta', 'en_revision'])
    .maybeSingle()

  if (abierta) {
    return res.status(409).json({ error: 'Ya tenés un reporte abierto para este trabajo. Te avisamos cuando lo revisemos.' })
  }

  let fotoKey = null
  if (req.file) {
    try {
      fotoKey = await guardarImagen(req.file.buffer, 'disputa', trabajoId)
    } catch (error) {
      console.error(`Error subiendo foto de disputa a S3 (trabajoId=${trabajoId}): ${error.message ?? error}`)
      return res.status(500).json({ error: 'No pudimos subir la foto. Intentá de nuevo.' })
    }
  }

  const { data: disputa, error } = await supabase
    .from('disputas')
    .insert({
      trabajo_id:     trabajoId,
      reportado_por:  usuarioId,
      rol_reportante: tipo === 'empleado' ? 'empleado' : 'empleador',
      motivo,
      descripcion,
      foto_s3_key:    fotoKey,
    })
    .select(CAMPOS_DISPUTA)
    .single()

  if (error) {
    console.error(`Error guardando disputa (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'No pudimos registrar el reporte, intentá de nuevo' })
  }

  console.log(`Disputa nueva (disputaId=${disputa.id}, trabajoId=${trabajoId}, motivo=${motivo}) — pendiente de revisión en el panel de admin.`)

  res.status(201).json({ disputa: await conFoto(disputa) })

  // Se le avisa a la otra parte que hay un reporte (sin el detalle: lo ve el admin).
  const aviso = {
    tipo:      'disputa',
    titulo:    'Se reportó un problema',
    mensaje:   `Se abrió un reporte sobre "${trabajo.titulo}". Nuestro equipo lo va a revisar.`,
    trabajoId,
  }
  if (tipo === 'empleado') notificarEmpleador(trabajo.empleador_id, aviso)
  else notificarEmpleado(trabajo.trabajador_id, aviso)
}

// GET /api/trabajos/:id/disputas — los reportes que hizo el usuario sobre este trabajo.
async function listarMisDisputas(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario

  const { data, error } = await supabase
    .from('disputas').select(CAMPOS_DISPUTA)
    .eq('trabajo_id', trabajoId).eq('reportado_por', usuarioId)
    .order('creado_en', { ascending: false })

  if (error) {
    console.error(`Error listando disputas (trabajoId=${trabajoId}, usuarioId=${usuarioId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando tus reportes' })
  }
  res.json({ disputas: await Promise.all((data ?? []).map(conFoto)) })
}

// ─── Panel de admin ──────────────────────────────────────────────────────────

// GET /api/admin/disputas?estado=abierta
async function listarDisputasAdmin(req, res) {
  const { estado } = req.query

  let consulta = supabase.from('disputas').select(CAMPOS_DISPUTA).order('creado_en', { ascending: false }).limit(200)
  if (estado) {
    if (!ESTADOS_DISPUTA.includes(estado)) {
      return res.status(400).json({ error: `Estado inválido. Opciones: ${ESTADOS_DISPUTA.join(', ')}` })
    }
    consulta = consulta.eq('estado', estado)
  }

  const { data, error } = await consulta
  if (error) {
    console.error(`Error listando disputas para admin: ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando disputas' })
  }

  // Títulos de los trabajos en una sola consulta, para que la lista se lea sola.
  const ids = [...new Set((data ?? []).map(d => d.trabajo_id))]
  const { data: trabajos } = ids.length
    ? await supabase.from('trabajos').select('id, titulo, estado').in('id', ids)
    : { data: [] }
  const trabajoPorId = Object.fromEntries((trabajos ?? []).map(t => [t.id, t]))

  res.json({
    disputas: (data ?? []).map(d => ({
      ...d,
      motivoTexto: MOTIVOS_DISPUTA[d.motivo] ?? d.motivo,
      trabajo: trabajoPorId[d.trabajo_id] ?? null,
    })),
  })
}

// GET /api/admin/disputas/:id — todo lo que el admin necesita para decidir:
// la disputa con su foto, el trabajo, las fotos de evidencia y el chat.
async function obtenerDisputaAdmin(req, res) {
  const { id } = req.params

  const { data: disputa } = await supabase.from('disputas').select(CAMPOS_DISPUTA).eq('id', id).maybeSingle()
  if (!disputa) return res.status(404).json({ error: 'Disputa no encontrada' })

  const [{ data: trabajo }, { data: evidencias }, { data: mensajes }] = await Promise.all([
    supabase.from('trabajos')
      .select('id, titulo, descripcion, categoria, nivel_dificultad, precio, estado, creado_en, fecha_programada, iniciado_en, finalizado_en, cancelado_por, motivo_cancelacion')
      .eq('id', disputa.trabajo_id).maybeSingle(),
    supabase.from('evidencias_trabajo').select('id, s3_key, creado_en').eq('trabajo_id', disputa.trabajo_id),
    supabase.from('mensajes_chat').select('remitente_tipo, mensaje, enviado_en')
      .eq('trabajo_id', disputa.trabajo_id).order('enviado_en', { ascending: true }),
  ])

  let evidenciasConUrl = []
  try {
    evidenciasConUrl = await Promise.all((evidencias ?? []).map(async e => ({ ...e, url: await obtenerUrlFirmada(e.s3_key) })))
  } catch (error) {
    console.error(`Error firmando evidencias para la disputa ${id}: ${error.message ?? error}`)
  }

  res.json({ disputa: await conFoto(disputa), trabajo, evidencias: evidenciasConUrl, mensajes: mensajes ?? [] })
}

// PATCH /api/admin/disputas/:id — { estado, resolucion }
async function actualizarDisputaAdmin(req, res) {
  const { id } = req.params
  const { estado } = req.body ?? {}
  const resolucion = typeof req.body?.resolucion === 'string' ? req.body.resolucion.trim() : ''

  if (!ESTADOS_DISPUTA.includes(estado)) {
    return res.status(400).json({ error: `Estado inválido. Opciones: ${ESTADOS_DISPUTA.join(', ')}` })
  }
  const esFinal = estado === 'resuelta' || estado === 'rechazada'
  if (esFinal && !resolucion) {
    return res.status(400).json({ error: 'Para resolver o rechazar hay que escribir la resolución (se le muestra a quien reportó)' })
  }
  if (resolucion.length > MAX_LARGO_RESOLUCION) {
    return res.status(400).json({ error: `La resolución puede tener hasta ${MAX_LARGO_RESOLUCION} caracteres` })
  }

  const { data: actual } = await supabase.from('disputas').select('id, estado, trabajo_id, reportado_por').eq('id', id).maybeSingle()
  if (!actual) return res.status(404).json({ error: 'Disputa no encontrada' })

  if (!TRANSICIONES[actual.estado].includes(estado)) {
    console.error(`Cambio de disputa rechazado (disputaId=${id}): ${actual.estado} → ${estado} no es una transición válida.`)
    return res.status(409).json({ error: `No se puede pasar de '${actual.estado}' a '${estado}'` })
  }

  const ahora = new Date().toISOString()
  // Condicional sobre el estado leído: si dos admins la tocan a la vez, gana uno.
  const { data: actualizadas, error } = await supabase
    .from('disputas')
    .update({
      estado,
      resolucion:     resolucion || null,
      resuelto_en:    esFinal ? ahora : null,
      actualizado_en: ahora,
    })
    .eq('id', id)
    .eq('estado', actual.estado)
    .select(CAMPOS_DISPUTA)

  if (error) {
    console.error(`Error actualizando disputa (disputaId=${id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error actualizando la disputa' })
  }
  if (!actualizadas?.length) {
    return res.status(409).json({ error: 'La disputa cambió mientras la editabas. Recargá e intentá de nuevo.' })
  }

  res.json({ disputa: await conFoto(actualizadas[0]) })

  const mensajes = {
    en_revision: 'Estamos revisando el problema que reportaste.',
    resuelta:    `Resolvimos tu reporte: ${resolucion}`,
    rechazada:   `Revisamos tu reporte y no corresponde: ${resolucion}`,
  }
  notificar(actual.reportado_por, {
    tipo:      'disputa',
    titulo:    'Actualización de tu reporte',
    mensaje:   mensajes[estado],
    trabajoId: actual.trabajo_id,
  })
}

module.exports = {
  motivosDisputa, crearDisputa, listarMisDisputas,
  listarDisputasAdmin, obtenerDisputaAdmin, actualizarDisputaAdmin,
  MOTIVOS_DISPUTA,
}
