const supabase = require('../config/supabase')

// Devuelve el id de perfil/empleado del usuario autenticado si participa de ese
// trabajo (como trabajador o como empleador), o null si no participa.
async function esParticipante(trabajo, usuarioId, tipo) {
  if (tipo === 'empleado') {
    const { data: empleado } = await supabase
      .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()
    return !!empleado && trabajo.trabajador_id === empleado.id
  }

  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()
  return !!perfil && trabajo.empleador_id === perfil.id
}

async function enviarMensaje(req, res) {
  const { id: trabajoId } = req.params
  const { mensaje } = req.body
  const { id: usuarioId, tipo } = req.usuario

  if (!mensaje || !mensaje.trim()) {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío' })
  }

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, estado, trabajador_id, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  if (!(await esParticipante(trabajo, usuarioId, tipo))) {
    console.error(`Mensaje rechazado (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no participa de este trabajo.`)
    return res.status(403).json({ error: 'No participás de este trabajo' })
  }

  // El chat solo está habilitado mientras el trabajo está activo (en_progreso);
  // una vez completado, listar sigue funcionando como historial pero no se puede mandar más.
  if (trabajo.estado !== 'en_progreso') {
    return res.status(400).json({ error: 'El chat solo está habilitado mientras el trabajo está en progreso' })
  }

  const { data: nuevoMensaje, error } = await supabase
    .from('mensajes_chat')
    .insert({
      trabajo_id:     trabajoId,
      remitente_id:   usuarioId,
      remitente_tipo: tipo,
      mensaje:        mensaje.trim(),
    })
    .select()
    .single()

  if (error) {
    console.error(`Error guardando mensaje (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error enviando mensaje' })
  }

  res.status(201).json({ mensaje: nuevoMensaje })
}

async function listarMensajes(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId, tipo } = req.usuario

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, estado, trabajador_id, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  if (!(await esParticipante(trabajo, usuarioId, tipo))) {
    return res.status(403).json({ error: 'No participás de este trabajo' })
  }

  const { data: mensajes, error } = await supabase
    .from('mensajes_chat')
    .select('id, remitente_id, remitente_tipo, mensaje, enviado_en')
    .eq('trabajo_id', trabajoId)
    .order('enviado_en', { ascending: true })

  if (error) {
    console.error(`Error listando mensajes (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando mensajes' })
  }

  res.json({ mensajes })
}

module.exports = { enviarMensaje, listarMensajes }
