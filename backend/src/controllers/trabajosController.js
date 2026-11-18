const supabase = require('../config/supabase')
const { generarPin, hashearPin, validarPin } = require('../utils/pin')
const { notificarEmpleador, notificarEmpleado, notificarNuevoTrabajo } = require('../services/notificacionesService')
const { buscarTrabajadoresDisponibles } = require('../services/matchingService')
const { emitirFinTrabajo } = require('../realtime/socket')
const { obtenerReputacion, actualizarReputacion, obtenerReputacionEmpleador } = require('../services/reputacionService')
const { calcularPrecio, obtenerTarifario } = require('../services/preciosService')
const {
  MOTIVOS_CANCELACION, validarMotivo, calcularPeso, registrarCancelacion, verificarBloqueo,
} = require('../services/cancelacionesService')
const { ANTICIPACION_MINUTOS } = require('../jobs/activarProgramados')

const CAMPOS_PUBLICOS = 'id, titulo, descripcion, categoria, nivel_dificultad, precio, estado, latitud, longitud, creado_en, solicitud_expira_en, iniciado_en, finalizado_en, confirmado_empleado_en, confirmado_empleador_en, cancelado_por, fecha_programada, motivo_cancelacion, motivo_cancelacion_codigo'

// 'programado' (Sprint 6): el empleador lo puede cancelar mientras espera su fecha.
const ESTADOS_CANCELABLES = ['programado', 'pendiente', 'asignado']

const MAX_LARGO_COMENTARIO = 500

// Trabajos programados: como mínimo con la misma anticipación con la que el poller
// los publica (si no, se activarían apenas creados: para eso está el inmediato) y
// como máximo a 30 días.
const MIN_ANTICIPACION_MINUTOS = ANTICIPACION_MINUTOS
const MAX_DIAS_PROGRAMACION    = 30
const VENTANA_SOLICITUD_MIN    = 15
const HORAS_VALIDEZ_PIN        = 24

// Columnas que necesita el historial (Sprint 5): estado, fechas, duración y monto.
const CAMPOS_HISTORIAL = 'id, titulo, categoria, estado, precio, creado_en, iniciado_en, finalizado_en, cancelado_en, cancelado_por, fecha_programada, motivo_cancelacion'

function calcularDuracionSegundos(trabajo) {
  if (!trabajo.iniciado_en || !trabajo.finalizado_en) return null
  return Math.round((new Date(trabajo.finalizado_en) - new Date(trabajo.iniciado_en)) / 1000)
}

// "13/11 a las 18:30", en hora argentina (el server puede correr en UTC).
function formatearFechaHora(iso) {
  return new Date(iso).toLocaleString('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(', ', ' a las ')
}

function mensajeBloqueo(bloqueo, accion) {
  return `Cancelaste varios trabajos en los últimos días, así que no podés ${accion} hasta el ${formatearFechaHora(bloqueo.hasta)}.`
}

// Valida fechaProgramada (opcional). Devuelve un Date, null si no vino, o tira { status, message }.
function validarFechaProgramada(fechaProgramada, ahora = Date.now()) {
  if (fechaProgramada == null || fechaProgramada === '') return null

  const fecha = new Date(fechaProgramada)
  if (typeof fechaProgramada !== 'string' || Number.isNaN(fecha.getTime())) {
    throw { status: 400, message: 'fechaProgramada tiene que ser una fecha ISO 8601 (ej. 2026-11-20T15:30:00-03:00)' }
  }
  if (fecha.getTime() < ahora + MIN_ANTICIPACION_MINUTOS * 60 * 1000) {
    throw { status: 400, message: `Un trabajo programado tiene que ser al menos ${MIN_ANTICIPACION_MINUTOS} minutos en el futuro. Para antes, publicalo como inmediato.` }
  }
  if (fecha.getTime() > ahora + MAX_DIAS_PROGRAMACION * 24 * 60 * 60 * 1000) {
    throw { status: 400, message: `Se puede programar hasta ${MAX_DIAS_PROGRAMACION} días adelante` }
  }
  return fecha
}

// GET /api/trabajos/precios — el tarifario completo (categorías, dificultades,
// precios base y multiplicadores) para que la app arme el formulario.
function tarifario(_req, res) {
  res.json(obtenerTarifario())
}

// GET /api/trabajos/cotizar?categoria=&nivelDificultad= — el precio que se va a
// cobrar, ANTES de publicar. No guarda nada.
function cotizarTrabajo(req, res) {
  const { categoria, nivelDificultad } = req.query
  try {
    res.json({ cotizacion: calcularPrecio(categoria, nivelDificultad) })
  } catch (error) {
    console.error(`Cotización rechazada (categoria=${categoria}, nivelDificultad=${nivelDificultad}): ${error.message}`)
    res.status(error.status ?? 500).json({ error: error.message ?? 'Error calculando el precio' })
  }
}

// GET /api/trabajos/motivos-cancelacion — los motivos válidos para el rol del que pregunta.
function motivosCancelacion(req, res) {
  const rol = req.usuario.tipo === 'empleado' ? 'empleado' : 'empleador'
  res.json({
    motivos: Object.entries(MOTIVOS_CANCELACION[rol]).map(([codigo, texto]) => ({ codigo, texto })),
  })
}

async function crearTrabajo(req, res) {
  const { id: usuarioId } = req.usuario
  const { titulo, descripcion, categoria, nivelDificultad, precio, latitud, longitud, fechaProgramada } = req.body

  if (!titulo || !descripcion || !categoria || !nivelDificultad || latitud == null || longitud == null) {
    console.error(`Creación de trabajo rechazada (usuarioId=${usuarioId}): faltan campos obligatorios.`)
    return res.status(400).json({ error: 'Faltan campos: titulo, descripcion, categoria, nivelDificultad, latitud, longitud' })
  }

  // Sprint 6: el precio lo calcula el backend. Si la app manda el que le mostró al
  // empleador y no coincide (cambió el tarifario mientras tanto), se rechaza para que
  // el empleador confirme el nuevo: nunca se cobra un precio distinto del que vio.
  let cotizacion
  let fecha
  try {
    cotizacion = calcularPrecio(categoria, nivelDificultad)
    fecha = validarFechaProgramada(fechaProgramada)
  } catch (error) {
    console.error(`Creación de trabajo rechazada (usuarioId=${usuarioId}): ${error.message}`)
    return res.status(error.status ?? 400).json({ error: error.message })
  }

  if (precio != null && Number(precio) !== cotizacion.precio) {
    console.error(`Creación de trabajo rechazada (usuarioId=${usuarioId}): precio ${precio} no coincide con el calculado ${cotizacion.precio}.`)
    return res.status(409).json({ error: 'El precio se actualizó. Revisalo y confirmá de nuevo.', cotizacion })
  }

  // Buscar perfil del empleador
  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!perfil) {
    console.error(`Creación de trabajo rechazada (usuarioId=${usuarioId}): no tiene perfil de empleador creado.`)
    return res.status(400).json({ error: 'Completá tu perfil antes de crear un trabajo' })
  }

  // Sprint 6: consecuencia de cancelar demasiado — bloqueo temporal para publicar.
  const bloqueo = await verificarBloqueo('empleador', perfil.id)
  if (bloqueo.bloqueado) {
    console.error(`Creación de trabajo rechazada (empleadorId=${perfil.id}): bloqueado por cancelaciones hasta ${bloqueo.hasta}.`)
    return res.status(403).json({ error: mensajeBloqueo(bloqueo, 'publicar trabajos'), bloqueadoHasta: bloqueo.hasta })
  }

  const ahora = new Date()
  const pin     = generarPin()
  const pinHash = await hashearPin(pin)
  // El PIN vale 24h desde que el trabajo puede empezar: para un programado, desde
  // su fecha (si no, uno programado a 3 días tendría el PIN vencido al llegar).
  const expira = new Date((fecha ?? ahora).getTime() + HORAS_VALIDEZ_PIN * 60 * 60 * 1000)

  // Inmediato → 'pendiente' con ventana de 15 min para que alguien acepte.
  // Programado → 'programado' sin ventana: la abre el poller cuando lo activa.
  const programado = !!fecha
  const solicitudExpira = programado ? null : new Date(ahora.getTime() + VENTANA_SOLICITUD_MIN * 60 * 1000)

  const { data: trabajo, error } = await supabase
    .from('trabajos')
    .insert({
      empleador_id:         perfil.id,
      titulo, descripcion, categoria,
      nivel_dificultad:     nivelDificultad,
      precio:               cotizacion.precio,
      latitud,
      longitud,
      estado:               programado ? 'programado' : 'pendiente',
      fecha_programada:     fecha?.toISOString() ?? null,
      pin_hash:             pinHash,
      pin_expira_en:        expira.toISOString(),
      solicitud_expira_en:  solicitudExpira?.toISOString() ?? null,
    })
    .select(CAMPOS_PUBLICOS)
    .single()

  if (error) {
    console.error(`Error creando trabajo (empleadorId=${perfil.id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error creando trabajo' })
  }

  // PIN se retorna SOLO aquí — el empleador lo muestra al empleado al llegar
  res.status(201).json({ trabajo, pin, cotizacion })

  // No se espera esta llamada: no debe demorar la respuesta ni fallar la creación del trabajo.
  // Un programado no se notifica ahora: lo hace activarProgramados.js cuando llega su hora.
  if (!programado) notificarNuevoTrabajo(trabajo)
}

async function listarTrabajos(req, res) {
  const { id: usuarioId, tipo } = req.usuario

  if (tipo === 'empleador') {
    const { data: perfil } = await supabase
      .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

    if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' })

    const { data: trabajos, error } = await supabase
      .from('trabajos').select(CAMPOS_PUBLICOS)
      .eq('empleador_id', perfil.id)
      .order('creado_en', { ascending: false })

    if (error) return res.status(500).json({ error: 'Error listando trabajos' })
    return res.json({ trabajos })
  }

  // Empleado: ver trabajos disponibles. Se excluyen los 'pendiente' cuya solicitud
  // ya expiró (chequeo lazy, igual que el PIN: no hay cron que los cancele).
  const { data: trabajos, error } = await supabase
    .from('trabajos').select(`${CAMPOS_PUBLICOS}, empleador_id`)
    .eq('estado', 'pendiente')
    .gt('solicitud_expira_en', new Date().toISOString())
    .order('creado_en', { ascending: false })

  if (error) return res.status(500).json({ error: 'Error listando trabajos' })

  // Sprint 6: el trabajador ve el score del empleador (lo bajan sus cancelaciones)
  // antes de aceptar. Una consulta por empleador distinto, no por trabajo.
  const reputaciones = await reputacionesDeEmpleadores((trabajos ?? []).map(t => t.empleador_id))
  res.json({
    trabajos: (trabajos ?? []).map(({ empleador_id, ...t }) => ({ ...t, empleador: { reputacion: reputaciones[empleador_id] ?? null } })),
  })
}

// { [perfilId]: reputación } — si una falla, ese empleador queda en null y listo.
async function reputacionesDeEmpleadores(perfilIds) {
  const unicos = [...new Set(perfilIds.filter(Boolean))]
  const pares = await Promise.all(unicos.map(async (id) => {
    try { return [id, await obtenerReputacionEmpleador(id)] } catch { return [id, null] }
  }))
  return Object.fromEntries(pares)
}

// GET /api/trabajos/mios — a diferencia de listarTrabajos (que para un empleado
// muestra los 'pendiente' disponibles para tomar), esto devuelve los trabajos
// propios del usuario en cualquier estado: los que publicó (empleador) o los
// que tiene asignados/en curso/completados (empleado).
async function misTrabajos(req, res) {
  const { id: usuarioId, tipo } = req.usuario

  if (tipo === 'empleador') {
    const { data: perfil } = await supabase
      .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

    if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' })

    const { data: trabajos, error } = await supabase
      .from('trabajos').select(CAMPOS_PUBLICOS)
      .eq('empleador_id', perfil.id)
      .order('creado_en', { ascending: false })

    if (error) {
      console.error(`Error listando trabajos propios (empleadorId=${perfil.id}): ${error.message ?? error}`)
      return res.status(500).json({ error: 'Error listando trabajos' })
    }
    return res.json({ trabajos })
  }

  const { data: empleado } = await supabase
    .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!empleado) return res.status(404).json({ error: 'Perfil no encontrado' })

  const { data: trabajos, error } = await supabase
    .from('trabajos').select(CAMPOS_PUBLICOS)
    .eq('trabajador_id', empleado.id)
    .order('creado_en', { ascending: false })

  if (error) {
    console.error(`Error listando trabajos propios (empleadoId=${empleado.id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando trabajos' })
  }
  res.json({ trabajos })
}

async function obtenerTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { tipo } = req.usuario

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select(`${CAMPOS_PUBLICOS}, trabajador_id, empleador_id`)
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  const duracionSegundos = calcularDuracionSegundos(trabajo)

  // Sprint 5: el empleador ve el nombre y la reputación del trabajador que lo tomó.
  let trabajador = null
  if (tipo === 'empleador' && trabajo.trabajador_id) {
    const { data: empleado } = await supabase
      .from('empleados').select('id, nombre, apellido, foto_url').eq('id', trabajo.trabajador_id).maybeSingle()
    if (empleado) {
      try {
        const { promedio, score, cantidadCalificaciones, trabajosCompletados } = await obtenerReputacion(empleado.id)
        trabajador = { ...empleado, reputacion: { promedio, score, cantidadCalificaciones, trabajosCompletados } }
      } catch {
        trabajador = { ...empleado, reputacion: null }
      }
    }
  }

  // Sprint 6: y el trabajador ve el score del empleador.
  let empleador
  if (tipo === 'empleado') {
    const reputaciones = await reputacionesDeEmpleadores([trabajo.empleador_id])
    empleador = { reputacion: reputaciones[trabajo.empleador_id] ?? null }
  }

  res.json({ trabajo: { ...trabajo, duracionSegundos, trabajador, empleador } })
}

async function aceptarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario

  const { data: empleado } = await supabase
    .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!empleado) {
    return res.status(400).json({ error: 'Completá tu perfil antes de aceptar trabajos' })
  }

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, estado, empleador_id, solicitud_expira_en').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.estado !== 'pendiente') {
    return res.status(409).json({ error: 'El trabajo ya no está disponible' })
  }
  if (trabajo.solicitud_expira_en && new Date(trabajo.solicitud_expira_en) < new Date()) {
    console.error(`Aceptar trabajo rechazado (trabajoId=${trabajoId}): la solicitud expiró.`)
    return res.status(409).json({ error: 'La solicitud para este trabajo expiró' })
  }

  // Sprint 6: consecuencia de cancelar demasiado — bloqueo temporal para aceptar.
  const bloqueo = await verificarBloqueo('empleado', empleado.id)
  if (bloqueo.bloqueado) {
    console.error(`Aceptar trabajo rechazado (empleadoId=${empleado.id}): bloqueado por cancelaciones hasta ${bloqueo.hasta}.`)
    return res.status(403).json({ error: mensajeBloqueo(bloqueo, 'aceptar trabajos'), bloqueadoHasta: bloqueo.hasta })
  }

  // UPDATE condicional (estado sigue 'pendiente'): si dos trabajadores aceptan a la
  // vez, solo a uno le devuelve la fila; el otro recibe 409 en vez de pisarlo.
  // asignado_en (Sprint 6) sirve para el período de gracia al cancelar.
  const { data: actualizados, error } = await supabase
    .from('trabajos')
    .update({ trabajador_id: empleado.id, estado: 'asignado', asignado_en: new Date().toISOString() })
    .eq('id', trabajoId)
    .eq('estado', 'pendiente')
    .select('id')

  if (error) {
    console.error(`Error aceptando trabajo (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error aceptando trabajo' })
  }
  if (!actualizados?.length) {
    console.error(`Aceptar trabajo rechazado (trabajoId=${trabajoId}): otro trabajador lo aceptó primero.`)
    return res.status(409).json({ error: 'El trabajo ya no está disponible' })
  }

  res.json({ message: 'Trabajo aceptado. El empleador te dará el PIN para iniciar.' })

  notificarEmpleador(trabajo.empleador_id, {
    tipo:    'cambio_estado',
    titulo:  'Trabajo aceptado',
    mensaje: 'Un trabajador aceptó tu trabajo. Compartile el PIN cuando llegue.',
    trabajoId,
  })
}

async function validarPinTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { pin } = req.body
  const { id: usuarioId } = req.usuario

  if (!pin) return res.status(400).json({ error: 'PIN requerido' })

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select('id, estado, pin_hash, pin_expira_en, trabajador_id, empleador_id')
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.estado !== 'asignado') {
    return res.status(400).json({ error: 'El trabajo no está en estado asignado' })
  }
  if (new Date(trabajo.pin_expira_en) < new Date()) {
    return res.status(400).json({ error: 'El PIN expiró' })
  }

  const { data: empleado } = await supabase
    .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!empleado || trabajo.trabajador_id !== empleado.id) {
    return res.status(403).json({ error: 'No tenés asignado este trabajo' })
  }

  const pinValido = await validarPin(pin, trabajo.pin_hash)
  if (!pinValido) return res.status(401).json({ error: 'PIN incorrecto' })

  await supabase
    .from('trabajos')
    .update({ estado: 'en_progreso', iniciado_en: new Date().toISOString() })
    .eq('id', trabajoId)

  res.json({ success: true, message: 'PIN validado. Trabajo iniciado.' })

  notificarEmpleador(trabajo.empleador_id, {
    tipo:    'cambio_estado',
    titulo:  'Trabajo iniciado',
    mensaje: 'El trabajador validó el PIN y arrancó el trabajo.',
    trabajoId,
  })
}

// Sprint 3 — "Confirmación de finalización por ambas partes antes de liberar el
// pago": ninguna de las dos partes puede completar el trabajo unilateralmente.
// Cada una llama este mismo endpoint (ya lo hacían ambas apps) y solo cuando
// las dos confirmaron el estado pasa a 'completado' — recién ahí se habilita
// calificar (que es, hoy, lo que gatea "liberar" algo en este proyecto).
async function completarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId, tipo } = req.usuario

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select('id, estado, trabajador_id, empleador_id, iniciado_en, confirmado_empleado_en, confirmado_empleador_en')
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.estado !== 'en_progreso') {
    return res.status(400).json({ error: 'El trabajo no está en progreso' })
  }

  if (tipo === 'empleado') {
    const { data: empleado } = await supabase
      .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()
    if (!empleado || trabajo.trabajador_id !== empleado.id) {
      console.error(`Completar trabajo rechazado (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleado asignado.`)
      return res.status(403).json({ error: 'No tenés asignado este trabajo' })
    }
  } else {
    const { data: perfil } = await supabase
      .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()
    if (!perfil || trabajo.empleador_id !== perfil.id) {
      console.error(`Completar trabajo rechazado (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleador dueño del trabajo.`)
      return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
    }
  }

  // Idempotente: si esta misma parte ya había confirmado, no hace nada de nuevo.
  const yaConfirmoEstaParte = tipo === 'empleado' ? trabajo.confirmado_empleado_en : trabajo.confirmado_empleador_en
  if (yaConfirmoEstaParte) {
    return res.json({
      message: 'Ya confirmaste la finalización. Esperando confirmación de la otra parte.',
      estado: 'en_progreso',
      esperandoConfirmacion: true,
    })
  }

  const ahora = new Date().toISOString()
  const campoConfirmacion = tipo === 'empleado' ? 'confirmado_empleado_en' : 'confirmado_empleador_en'
  const otraParteYaConfirmo = tipo === 'empleado' ? trabajo.confirmado_empleador_en : trabajo.confirmado_empleado_en

  if (!otraParteYaConfirmo) {
    // Primera confirmación: solo se registra, el trabajo sigue en_progreso.
    await supabase.from('trabajos').update({ [campoConfirmacion]: ahora }).eq('id', trabajoId)

    res.json({
      message: 'Confirmaste la finalización. Esperando confirmación de la otra parte.',
      estado: 'en_progreso',
      esperandoConfirmacion: true,
    })

    const payload = {
      tipo:    'cambio_estado',
      titulo:  'Confirmación pendiente',
      mensaje: 'La otra parte marcó el trabajo como completado. Confirmalo vos para cerrarlo.',
      trabajoId,
    }
    if (tipo === 'empleado') {
      notificarEmpleador(trabajo.empleador_id, payload)
    } else if (trabajo.trabajador_id) {
      notificarEmpleado(trabajo.trabajador_id, payload)
    }
    return
  }

  // Segunda confirmación: ya confirmaron ambas partes, se cierra el trabajo.
  const finalizadoEn = ahora
  await supabase
    .from('trabajos')
    .update({ estado: 'completado', finalizado_en: finalizadoEn, [campoConfirmacion]: ahora })
    .eq('id', trabajoId)

  const duracionSegundos = calcularDuracionSegundos({ ...trabajo, finalizado_en: finalizadoEn })

  res.json({ message: 'Trabajo completado exitosamente', estado: 'completado', duracionSegundos })

  emitirFinTrabajo(trabajoId, { estado: 'completado' })

  const payload = {
    tipo:    'cambio_estado',
    titulo:  'Trabajo completado',
    mensaje: 'El trabajo se marcó como completado.',
    trabajoId,
  }
  if (tipo === 'empleado') {
    notificarEmpleador(trabajo.empleador_id, payload)
  } else if (trabajo.trabajador_id) {
    notificarEmpleado(trabajo.trabajador_id, payload)
  }
}

// Sprint 3 — estado 'cancelado'. Solo mientras nadie empezó a trabajar de verdad
// (programado/pendiente/asignado); una vez que se validó el PIN (en_progreso) ya no
// se puede cancelar por acá — para eso está la disputa.
//
// Sprint 6: el motivo es obligatorio (código de una lista cerrada + detalle libre,
// obligatorio si el código es 'otro') y la cancelación queda registrada en la tabla
// `cancelaciones` con un peso que baja el score de quien canceló y puede bloquearlo
// temporalmente (ver cancelacionesService.js). Body: { motivo, detalle? }.
async function cancelarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId, tipo } = req.usuario
  const { motivo, detalle } = req.body ?? {}
  const rol = tipo === 'empleado' ? 'empleado' : 'empleador'

  let motivoValidado
  try {
    motivoValidado = validarMotivo(rol, motivo, detalle)
  } catch (error) {
    console.error(`Cancelación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): ${error.message}`)
    return res.status(error.status ?? 400).json({ error: error.message })
  }

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select('id, titulo, estado, empleador_id, trabajador_id, asignado_en, fecha_programada')
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  // perfilId = empleados.id o perfiles.id de quien cancela (para la tabla de cancelaciones).
  let perfilId
  if (tipo === 'empleado') {
    // Sprint 5: el trabajador puede bajarse de un trabajo que aceptó, pero solo antes
    // de arrancarlo (asignado). Cuenta para su tasa de cancelación (reputacionService).
    const { data: empleado } = await supabase
      .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()
    if (!empleado || trabajo.trabajador_id !== empleado.id) {
      console.error(`Cancelación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleado asignado.`)
      return res.status(403).json({ error: 'No tenés asignado este trabajo' })
    }
    if (trabajo.estado !== 'asignado') {
      console.error(`Cancelación de empleado rechazada (trabajoId=${trabajoId}): estado actual '${trabajo.estado}'.`)
      return res.status(409).json({ error: 'Solo podés cancelar un trabajo antes de empezarlo' })
    }
    perfilId = empleado.id
  } else {
    const { data: perfil } = await supabase
      .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()
    if (!perfil) return res.status(400).json({ error: 'Completá tu perfil antes de cancelar trabajos' })
    if (trabajo.empleador_id !== perfil.id) {
      console.error(`Cancelación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleador dueño del trabajo.`)
      return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
    }
    if (!ESTADOS_CANCELABLES.includes(trabajo.estado)) {
      console.error(`Cancelación rechazada (trabajoId=${trabajoId}): estado actual '${trabajo.estado}' no es cancelable.`)
      return res.status(409).json({ error: 'El trabajo ya no se puede cancelar (está en curso o finalizado)' })
    }
    perfilId = perfil.id
  }

  const ahora = new Date()
  const peso = calcularPeso({
    estadoPrevio:    trabajo.estado,
    asignadoEn:      trabajo.asignado_en,
    fechaProgramada: trabajo.fecha_programada,
  }, ahora.getTime())

  // Condicional sobre el estado leído: si en el medio el trabajador validó el PIN
  // (pasó a en_progreso), no se cancela algo que ya arrancó.
  const { data: actualizados, error } = await supabase
    .from('trabajos')
    .update({
      estado:                    'cancelado',
      cancelado_por:             rol,
      cancelado_en:              ahora.toISOString(),
      motivo_cancelacion:        motivoValidado.texto,
      motivo_cancelacion_codigo: motivoValidado.codigo,
    })
    .eq('id', trabajoId)
    .eq('estado', trabajo.estado)
    .select('id')

  if (error) {
    console.error(`Error cancelando trabajo (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error cancelando trabajo' })
  }
  if (!actualizados?.length) {
    console.error(`Cancelación rechazada (trabajoId=${trabajoId}): el estado cambió mientras se cancelaba.`)
    return res.status(409).json({ error: 'El trabajo cambió de estado. Actualizá la pantalla e intentá de nuevo.' })
  }

  await registrarCancelacion({
    trabajoId, rol, usuarioId, perfilId,
    estadoPrevio: trabajo.estado,
    codigo:       motivoValidado.codigo,
    detalle:      motivoValidado.detalle,
    peso,
  })

  // Se le informa al que canceló cómo le afectó (el bloqueo se calcula ya contando esta).
  const bloqueo = peso > 0 ? await verificarBloqueo(rol, perfilId) : null

  res.json({
    message: 'Trabajo cancelado',
    penalizacion: {
      peso,
      penaliza: peso > 0,
      bloqueadoHasta: bloqueo?.bloqueado ? bloqueo.hasta : null,
    },
  })

  emitirFinTrabajo(trabajoId, { estado: 'cancelado' })

  if (tipo === 'empleado') {
    notificarEmpleador(trabajo.empleador_id, {
      tipo:    'cambio_estado',
      titulo:  'El trabajador canceló',
      mensaje: `El trabajador ya no puede hacer "${trabajo.titulo}" (${motivoValidado.texto}). Podés volver a publicarlo.`,
      trabajoId,
    })
  } else if (trabajo.trabajador_id) {
    notificarEmpleado(trabajo.trabajador_id, {
      tipo:    'cambio_estado',
      titulo:  'Trabajo cancelado',
      mensaje: `El empleador canceló "${trabajo.titulo}": ${motivoValidado.texto}.`,
      trabajoId,
    })
  }
}

// Expone el matching portado (matchingService.js) para que el empleador pueda
// ver quién matchea con su trabajo, sin esperar al ciclo de notificación.
async function obtenerCandidatos(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario
  const { radioKm } = req.query

  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!perfil) return res.status(400).json({ error: 'Completá tu perfil antes de ver candidatos' })

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.empleador_id !== perfil.id) {
    return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
  }

  try {
    const candidatos = await buscarTrabajadoresDisponibles(trabajoId, radioKm ? Number(radioKm) : undefined)
    res.json({ candidatos })
  } catch (error) {
    console.error(`Error buscando candidatos (trabajoId=${trabajoId}): ${error.message ?? error}`)
    res.status(error.status ?? 500).json({ error: error.message ?? 'Error buscando candidatos' })
  }
}

// El empleador califica al empleado una vez completado el trabajo. Portado del
// backend NestJS (src/calificaciones): inserta en 'calificaciones' y recalcula
// empleados.reputacion (promedio desnormalizado, que es lo que ordena el matching).
async function calificarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario
  const { puntaje, comentario } = req.body

  if (!Number.isInteger(puntaje) || puntaje < 1 || puntaje > 5) {
    console.error(`Calificación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): puntaje inválido ${JSON.stringify(puntaje)}.`)
    return res.status(400).json({ error: 'El puntaje debe ser un entero entre 1 y 5' })
  }
  if (comentario != null && typeof comentario !== 'string') {
    console.error(`Calificación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): comentario no es texto.`)
    return res.status(400).json({ error: 'El comentario tiene que ser texto' })
  }
  if (comentario && comentario.trim().length > MAX_LARGO_COMENTARIO) {
    console.error(`Calificación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): comentario de ${comentario.trim().length} caracteres.`)
    return res.status(400).json({ error: `El comentario puede tener hasta ${MAX_LARGO_COMENTARIO} caracteres` })
  }

  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!perfil) return res.status(400).json({ error: 'Completá tu perfil antes de calificar' })

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, estado, trabajador_id, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.empleador_id !== perfil.id) {
    console.error(`Calificación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleador dueño del trabajo.`)
    return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
  }
  if (trabajo.estado !== 'completado') {
    return res.status(400).json({ error: 'Solo se puede calificar un trabajo completado' })
  }
  if (!trabajo.trabajador_id) {
    return res.status(400).json({ error: 'Este trabajo no tiene trabajador asignado' })
  }

  // Un trabajo se califica una sola vez.
  const { data: yaCalificado } = await supabase
    .from('calificaciones').select('id').eq('trabajo_id', trabajoId).maybeSingle()

  if (yaCalificado) {
    return res.status(409).json({ error: 'Este trabajo ya fue calificado' })
  }

  const { data: calificacion, error } = await supabase
    .from('calificaciones')
    .insert({
      trabajo_id:     trabajoId,
      calificador_id: perfil.id,
      calificado_id:  trabajo.trabajador_id,
      puntaje,
      comentario:     comentario?.trim() || null,
    })
    .select()
    .single()

  if (error) {
    console.error(`Error guardando calificación (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'No se pudo registrar la calificación, intentá de nuevo' })
  }

  let reputacion = null
  try {
    reputacion = await actualizarReputacion(trabajo.trabajador_id)
  } catch {
    // La calificación ya quedó guardada; la reputación se vuelve a calcular en la próxima consulta.
  }

  res.json({ message: 'Calificación enviada', calificacion, reputacion })

  notificarEmpleado(trabajo.trabajador_id, {
    tipo:    'calificacion',
    titulo:  'Te calificaron',
    mensaje: `Recibiste ${puntaje} estrella${puntaje === 1 ? '' : 's'} por tu último trabajo.`,
    trabajoId,
  })
}

// GET /api/trabajos/:id/calificacion — para que la app sepa si ya se calificó.
async function obtenerCalificacion(req, res) {
  const { id: trabajoId } = req.params
  const { data, error } = await supabase
    .from('calificaciones').select('id, puntaje, comentario, creado_en').eq('trabajo_id', trabajoId).maybeSingle()

  if (error) {
    console.error(`Error obteniendo calificación (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error obteniendo la calificación' })
  }
  res.json({ calificacion: data })
}

// GET /api/trabajos/historial — Sprint 5. Todos los trabajos del usuario (los que
// tomó, si es empleado; los que publicó, si es empleador) con estado, fecha,
// duración y ganancia, más un resumen. La "ganancia" es el precio de los trabajos
// completados (lo que cobra el trabajador / lo que pagó el empleador); los
// cancelados y los que siguen abiertos van con 0.
async function historialTrabajos(req, res) {
  const { id: usuarioId, tipo } = req.usuario

  const tabla = tipo === 'empleado' ? 'empleados' : 'perfiles'
  const columna = tipo === 'empleado' ? 'trabajador_id' : 'empleador_id'

  const { data: perfil } = await supabase.from(tabla).select('id').eq('user_id', usuarioId).maybeSingle()
  if (!perfil) return res.status(404).json({ error: 'Perfil no encontrado' })

  const { data: filas, error } = await supabase
    .from('trabajos').select(CAMPOS_HISTORIAL).eq(columna, perfil.id).order('creado_en', { ascending: false })

  if (error) {
    console.error(`Error armando historial (${columna}=${perfil.id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error cargando el historial' })
  }

  const ids = (filas ?? []).map(t => t.id)
  const { data: calificaciones, error: errorCal } = ids.length
    ? await supabase.from('calificaciones').select('trabajo_id, puntaje, comentario').in('trabajo_id', ids)
    : { data: [], error: null }
  if (errorCal) console.error(`Error leyendo calificaciones del historial: ${errorCal.message ?? errorCal}`)
  const calificacionPorTrabajo = Object.fromEntries((calificaciones ?? []).map(c => [c.trabajo_id, c]))

  const trabajos = (filas ?? []).map(t => ({
    id:               t.id,
    titulo:           t.titulo,
    categoria:        t.categoria,
    estado:           t.estado,
    precio:           t.precio,
    // Un programado que todavía no pasó se muestra con la fecha para la que está agendado.
    fecha:            t.finalizado_en ?? t.cancelado_en ?? (t.estado === 'programado' ? t.fecha_programada : null) ?? t.creado_en,
    creado_en:        t.creado_en,
    iniciado_en:      t.iniciado_en,
    finalizado_en:    t.finalizado_en,
    fecha_programada: t.fecha_programada,
    cancelado_por:    t.cancelado_por,
    motivo_cancelacion: t.motivo_cancelacion,
    duracionSegundos: calcularDuracionSegundos(t),
    ganancia:         t.estado === 'completado' ? Number(t.precio) || 0 : 0,
    calificacion:     calificacionPorTrabajo[t.id] ?? null,
  })).sort((a, b) => new Date(b.fecha) - new Date(a.fecha))

  const completados = trabajos.filter(t => t.estado === 'completado')
  const inicioMes = new Date(); inicioMes.setDate(1); inicioMes.setHours(0, 0, 0, 0)

  res.json({
    trabajos,
    resumen: {
      total:                 trabajos.length,
      completados:           completados.length,
      cancelados:            trabajos.filter(t => t.estado === 'cancelado').length,
      enCurso:               trabajos.filter(t => ['asignado', 'en_progreso'].includes(t.estado)).length,
      programados:           trabajos.filter(t => t.estado === 'programado').length,
      gananciaTotal:         completados.reduce((s, t) => s + t.ganancia, 0),
      gananciaMes:           completados.filter(t => new Date(t.fecha) >= inicioMes).reduce((s, t) => s + t.ganancia, 0),
      duracionTotalSegundos: completados.reduce((s, t) => s + (t.duracionSegundos ?? 0), 0),
    },
  })
}

module.exports = {
  crearTrabajo, listarTrabajos, misTrabajos, obtenerTrabajo,
  aceptarTrabajo, validarPinTrabajo, completarTrabajo, calificarTrabajo,
  cancelarTrabajo, obtenerCandidatos, obtenerCalificacion, historialTrabajos,
  tarifario, cotizarTrabajo, motivosCancelacion,
  // exportadas para poder probarlas sin levantar Express
  validarFechaProgramada,
}
