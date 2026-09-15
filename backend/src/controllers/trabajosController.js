const supabase = require('../config/supabase')
const { generarPin, hashearPin, validarPin } = require('../utils/pin')
const { notificarEmpleador, notificarEmpleado, notificarNuevoTrabajo } = require('../services/notificacionesService')
const { buscarTrabajadoresDisponibles } = require('../services/matchingService')
const { emitirFinTrabajo } = require('../realtime/socket')

const CAMPOS_PUBLICOS = 'id, titulo, descripcion, categoria, nivel_dificultad, precio, estado, latitud, longitud, creado_en, solicitud_expira_en, iniciado_en, finalizado_en'

const ESTADOS_CANCELABLES = ['pendiente', 'asignado']

// Backend NestJS de Nacho: solo calificaciones sigue viviendo ahí (matching y
// notificaciones se resolvieron aparte — ver services/matchingService.js y
// services/notificacionesService.js).
const NACHO_API_URL = process.env.NACHO_API_URL || 'http://localhost:3001'

function calcularDuracionSegundos(trabajo) {
  if (!trabajo.iniciado_en || !trabajo.finalizado_en) return null
  return Math.round((new Date(trabajo.finalizado_en) - new Date(trabajo.iniciado_en)) / 1000)
}

async function crearTrabajo(req, res) {
  const { id: usuarioId } = req.usuario
  const { titulo, descripcion, categoria, nivelDificultad, precio, latitud, longitud } = req.body

  if (!titulo || !descripcion || !categoria || precio == null || latitud == null || longitud == null) {
    console.error(`Creación de trabajo rechazada (usuarioId=${usuarioId}): faltan campos obligatorios.`)
    return res.status(400).json({ error: 'Faltan campos: titulo, descripcion, categoria, precio, latitud, longitud' })
  }

  // Buscar perfil del empleador
  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!perfil) {
    console.error(`Creación de trabajo rechazada (usuarioId=${usuarioId}): no tiene perfil de empleador creado.`)
    return res.status(400).json({ error: 'Completá tu perfil antes de crear un trabajo' })
  }

  const pin     = generarPin()
  const pinHash = await hashearPin(pin)
  const expira  = new Date(); expira.setHours(expira.getHours() + 24)

  // Tiempo límite para que algún candidato acepte antes de que la solicitud expire.
  const solicitudExpira = new Date(); solicitudExpira.setMinutes(solicitudExpira.getMinutes() + 15)

  const { data: trabajo, error } = await supabase
    .from('trabajos')
    .insert({
      empleador_id:         perfil.id,
      titulo, descripcion, categoria,
      nivel_dificultad:     nivelDificultad ?? null,
      precio,
      latitud,
      longitud,
      estado:               'pendiente',
      pin_hash:             pinHash,
      pin_expira_en:        expira.toISOString(),
      solicitud_expira_en:  solicitudExpira.toISOString(),
    })
    .select(CAMPOS_PUBLICOS)
    .single()

  if (error) {
    console.error(`Error creando trabajo (empleadorId=${perfil.id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error creando trabajo' })
  }

  // PIN se retorna SOLO aquí — el empleador lo muestra al empleado al llegar
  res.status(201).json({ trabajo, pin })

  // No se espera esta llamada: no debe demorar la respuesta ni fallar la creación del trabajo.
  notificarNuevoTrabajo(trabajo)
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
    .from('trabajos').select(CAMPOS_PUBLICOS)
    .eq('estado', 'pendiente')
    .gt('solicitud_expira_en', new Date().toISOString())
    .order('creado_en', { ascending: false })

  if (error) return res.status(500).json({ error: 'Error listando trabajos' })
  res.json({ trabajos })
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

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select(`${CAMPOS_PUBLICOS}, trabajador_id, empleador_id`)
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  const duracionSegundos = calcularDuracionSegundos(trabajo)

  res.json({ trabajo: { ...trabajo, duracionSegundos } })
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

  const { error } = await supabase
    .from('trabajos')
    .update({ trabajador_id: empleado.id, estado: 'asignado' })
    .eq('id', trabajoId)

  if (error) return res.status(500).json({ error: 'Error aceptando trabajo' })

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

// Sprint 3 — estado 'cancelado'. Solo el empleador dueño puede cancelar, y solo
// mientras nadie empezó a trabajar de verdad (pendiente/asignado); una vez que
// se validó el PIN (en_progreso) ya no se puede cancelar por acá.
async function cancelarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario
  const { motivo } = req.body

  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!perfil) return res.status(400).json({ error: 'Completá tu perfil antes de cancelar trabajos' })

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, estado, empleador_id, trabajador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.empleador_id !== perfil.id) {
    console.error(`Cancelación rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleador dueño del trabajo.`)
    return res.status(403).json({ error: 'No sos el empleador de este trabajo' })
  }
  if (!ESTADOS_CANCELABLES.includes(trabajo.estado)) {
    console.error(`Cancelación rechazada (trabajoId=${trabajoId}): estado actual '${trabajo.estado}' no es cancelable.`)
    return res.status(409).json({ error: 'El trabajo ya no se puede cancelar (está en curso o finalizado)' })
  }

  const { error } = await supabase
    .from('trabajos')
    .update({
      estado: 'cancelado',
      cancelado_por: 'empleador',
      cancelado_en: new Date().toISOString(),
      motivo_cancelacion: motivo ?? null,
    })
    .eq('id', trabajoId)

  if (error) {
    console.error(`Error cancelando trabajo (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error cancelando trabajo' })
  }

  res.json({ message: 'Trabajo cancelado' })

  emitirFinTrabajo(trabajoId, { estado: 'cancelado' })

  if (trabajo.trabajador_id) {
    notificarEmpleado(trabajo.trabajador_id, {
      tipo:    'cambio_estado',
      titulo:  'Trabajo cancelado',
      mensaje: 'El empleador canceló este trabajo.',
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

// El empleador califica al empleado una vez completado el trabajo (empleados.reputacion
// se recalcula del lado de Nacho — ver src/calificaciones — así que solo se califica
// en ese sentido, no al revés).
async function calificarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId } = req.usuario
  const { puntaje, comentario } = req.body

  if (!Number.isInteger(puntaje) || puntaje < 1 || puntaje > 5) {
    return res.status(400).json({ error: 'El puntaje debe ser un entero entre 1 y 5' })
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

  res.json({ message: 'Calificación enviada' })

  // No se espera esta llamada: no debe frenar la respuesta ni fallar si el llamado falla
  // (mismo patrón best-effort que notificar() en services/notificacionesService.js).
  fetch(`${NACHO_API_URL}/calificaciones`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({
      trabajoId,
      calificadorId: perfil.id,
      calificadoId:  trabajo.trabajador_id,
      puntaje,
      comentario,
    }),
  }).catch((error) => console.error('Error mandando calificación:', error.message))
}

module.exports = {
  crearTrabajo, listarTrabajos, misTrabajos, obtenerTrabajo,
  aceptarTrabajo, validarPinTrabajo, completarTrabajo, calificarTrabajo,
  cancelarTrabajo, obtenerCandidatos,
}
