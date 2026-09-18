const supabase = require('../config/supabase')
const { buscarTrabajadoresDisponibles } = require('./matchingService')

const NACHO_API_URL = process.env.NACHO_API_URL || 'http://localhost:3001'

async function notificar(destinatarioId, { tipo, mensaje, titulo, trabajoId }) {
  if (!destinatarioId) return
  try {
    const respuesta = await fetch(`${NACHO_API_URL}/notificaciones`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ destinatarioId, tipo, mensaje, titulo, trabajoId }),
    })
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '')
      console.error(`Notificación rechazada por Nacho (destinatarioId=${destinatarioId}, tipo=${tipo}): ${respuesta.status} ${detalle}`)
    }
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

async function notificarNuevoTrabajo(trabajo) {
  try {
    const candidatos = await buscarTrabajadoresDisponibles(trabajo.id)

    await Promise.all(candidatos.map((candidato) => notificar(candidato.userId, {
      tipo:    'nueva_oferta',
      titulo:  'Nuevo trabajo disponible',
      mensaje: `Hay un nuevo trabajo de ${trabajo.categoria} cerca tuyo: "${trabajo.titulo}"`,
      trabajoId: trabajo.id,
    })))
  } catch (error) {
    console.error('Error buscando trabajadores para notificar:', error.message ?? error)
  }
}

module.exports = { notificar, notificarEmpleador, notificarEmpleado, notificarNuevoTrabajo }
