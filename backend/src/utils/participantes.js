const supabase = require('../config/supabase')

// Devuelve true si usuarioId (con ese tipo) participa del trabajo dado, como
// trabajador o como empleador. Se usa tanto para el chat (mensajesController)
// como para autorizar el join a la room de un trabajo por WebSocket (realtime/socket.js).
async function esParticipanteTrabajo(trabajo, usuarioId, tipo) {
  if (tipo === 'empleado') {
    const { data: empleado } = await supabase
      .from('empleados').select('id').eq('user_id', usuarioId).maybeSingle()
    return !!empleado && trabajo.trabajador_id === empleado.id
  }

  const { data: perfil } = await supabase
    .from('perfiles').select('id').eq('user_id', usuarioId).maybeSingle()
  return !!perfil && trabajo.empleador_id === perfil.id
}

module.exports = { esParticipanteTrabajo }
