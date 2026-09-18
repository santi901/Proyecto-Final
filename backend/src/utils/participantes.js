const supabase = require('../config/supabase')

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
