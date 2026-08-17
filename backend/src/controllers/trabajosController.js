const supabase = require('../config/supabase')
const { generarPin, hashearPin, validarPin } = require('../utils/pin')

const CAMPOS_PUBLICOS = 'id, titulo, descripcion, categoria, nivel_dificultad, precio, estado, creado_en'

// Backend NestJS de Nacho (verificación, ubicación, matching, notificaciones).
const NACHO_API_URL = process.env.NACHO_API_URL || 'http://localhost:3001'

// Nunca debe frenar el flujo del trabajo: si el servicio de notificaciones
// está caído o el usuario no tiene push token, esto solo loguea y sigue.
async function notificar(destinatarioId, { tipo, mensaje, titulo, trabajoId }) {
  if (!destinatarioId) return
  try {
    await fetch(`${NACHO_API_URL}/notificaciones`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ destinatarioId, tipo, mensaje, titulo, trabajoId }),
    })
  } catch (error) {
    console.error('Error mandando notificación:', error.message)
  }
}

async function notificarEmpleador(perfilId, payload) {
  const { data } = await supabase.from('perfiles').select('user_id').eq('id', perfilId).maybeSingle()
  if (data?.user_id) await notificar(data.user_id, payload)
}

async function notificarEmpleado(empleadoId, payload) {
  const { data } = await supabase.from('empleados').select('user_id').eq('id', empleadoId).maybeSingle()
  if (data?.user_id) await notificar(data.user_id, payload)
}

// Le pide a /matching quiénes son los trabajadores que matchean (categoría +
// distancia + disponibilidad) y les manda la notificación de nueva oferta.
async function notificarNuevoTrabajo(trabajo) {
  try {
    const respuesta = await fetch(
      `${NACHO_API_URL}/matching/trabajadores-disponibles?trabajoId=${trabajo.id}`,
    )
    if (!respuesta.ok) return
    const candidatos = await respuesta.json()

    await Promise.all(candidatos.map((candidato) => notificar(candidato.userId, {
      tipo:    'nueva_oferta',
      titulo:  'Nuevo trabajo disponible',
      mensaje: `Hay un nuevo trabajo de ${trabajo.categoria} cerca tuyo: "${trabajo.titulo}"`,
      trabajoId: trabajo.id,
    })))
  } catch (error) {
    console.error('Error buscando trabajadores para notificar:', error.message)
  }
}

async function crearTrabajo(req, res) {
  const { id: usuarioId } = req.usuario
  const { titulo, descripcion, categoria, nivelDificultad, precio } = req.body

  if (!titulo || !descripcion || !categoria || precio == null) {
    return res.status(400).json({ error: 'Faltan campos: titulo, descripcion, categoria, precio' })
  }

  // Buscar perfil del empleador
  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()

  if (!perfil) {
    return res.status(400).json({ error: 'Completá tu perfil antes de crear un trabajo' })
  }

  const pin     = generarPin()
  const pinHash = await hashearPin(pin)
  const expira  = new Date(); expira.setHours(expira.getHours() + 24)

  const { data: trabajo, error } = await supabase
    .from('trabajos')
    .insert({
      empleador_id:     perfil.id,
      titulo, descripcion, categoria,
      nivel_dificultad: nivelDificultad ?? null,
      precio,
      estado:           'pendiente',
      pin_hash:         pinHash,
      pin_expira_en:    expira.toISOString(),
    })
    .select(CAMPOS_PUBLICOS)
    .single()

  if (error) {
    console.error('Error creando trabajo:', error)
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

  // Empleado: ver trabajos disponibles
  const { data: trabajos, error } = await supabase
    .from('trabajos').select(CAMPOS_PUBLICOS)
    .eq('estado', 'pendiente')
    .order('creado_en', { ascending: false })

  if (error) return res.status(500).json({ error: 'Error listando trabajos' })
  res.json({ trabajos })
}

async function obtenerTrabajo(req, res) {
  const { id: trabajoId } = req.params

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select(`${CAMPOS_PUBLICOS}, trabajador_id, empleador_id`)
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  res.json({ trabajo })
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
    .from('trabajos').select('id, estado, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.estado !== 'pendiente') {
    return res.status(409).json({ error: 'El trabajo ya no está disponible' })
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

  await supabase.from('trabajos').update({ estado: 'en_progreso' }).eq('id', trabajoId)

  res.json({ success: true, message: 'PIN validado. Trabajo iniciado.' })

  notificarEmpleador(trabajo.empleador_id, {
    tipo:    'cambio_estado',
    titulo:  'Trabajo iniciado',
    mensaje: 'El trabajador validó el PIN y arrancó el trabajo.',
    trabajoId,
  })
}

async function completarTrabajo(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId, tipo } = req.usuario

  const { data: trabajo } = await supabase
    .from('trabajos')
    .select('id, estado, trabajador_id, empleador_id')
    .eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })
  if (trabajo.estado !== 'en_progreso') {
    return res.status(400).json({ error: 'El trabajo no está en progreso' })
  }

  if (tipo === 'empleado') {
    const { data: empleado } = await supabase
      .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()
    if (!empleado || trabajo.trabajador_id !== empleado.id) {
      return res.status(403).json({ error: 'No tenés asignado este trabajo' })
    }
  }

  await supabase.from('trabajos').update({ estado: 'completado' }).eq('id', trabajoId)

  res.json({ message: 'Trabajo completado exitosamente' })

  // Se avisa a la otra parte, no a quien acaba de marcar el trabajo como completado.
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

module.exports = {
  crearTrabajo, listarTrabajos, obtenerTrabajo,
  aceptarTrabajo, validarPinTrabajo, completarTrabajo,
}
