const supabase = require('../config/supabase')
const { notificarEmpleador, notificarNuevoTrabajo } = require('../services/notificacionesService')
const { emitirFinTrabajo } = require('../realtime/socket')

const INTERVALO_MS      = 5 * 60 * 1000  // cada cuánto se revisan trabajos vencidos
const EXTENSION_MINUTOS = 15             // ventana nueva por cada reintento (misma que al crear el trabajo)
const MAX_REINTENTOS    = 3              // después de esto se cancela solo

// Sprint 3 — "Lógica de reasignación automática si nadie acepta en el tiempo límite".
// pendiente + solicitud_expira_en vencida = nadie aceptó a tiempo. Se reintenta
// unas cuantas veces (nueva ventana + se vuelve a notificar a los candidatos) y,
// si se agotan los reintentos, se cancela el trabajo solo.
async function procesarReasignaciones() {
  const { data: vencidos, error } = await supabase
    .from('trabajos')
    .select('id, titulo, categoria, empleador_id, intentos_reasignacion')
    .eq('estado', 'pendiente')
    .lt('solicitud_expira_en', new Date().toISOString())

  if (error) {
    console.error(`Error buscando trabajos para reasignar: ${error.message ?? error}`)
    return
  }

  for (const trabajo of vencidos ?? []) {
    if (trabajo.intentos_reasignacion >= MAX_REINTENTOS) {
      await cancelarPorFaltaDeCandidatos(trabajo)
    } else {
      await reintentarBusqueda(trabajo)
    }
  }
}

async function reintentarBusqueda(trabajo) {
  const nuevaExpira = new Date()
  nuevaExpira.setMinutes(nuevaExpira.getMinutes() + EXTENSION_MINUTOS)

  const { error } = await supabase
    .from('trabajos')
    .update({
      solicitud_expira_en: nuevaExpira.toISOString(),
      intentos_reasignacion: trabajo.intentos_reasignacion + 1,
    })
    .eq('id', trabajo.id)

  if (error) {
    console.error(`Error reintentando reasignación (trabajoId=${trabajo.id}): ${error.message ?? error}`)
    return
  }

  notificarNuevoTrabajo(trabajo)
}

async function cancelarPorFaltaDeCandidatos(trabajo) {
  const { error } = await supabase
    .from('trabajos')
    .update({
      estado: 'cancelado',
      cancelado_por: 'sistema',
      cancelado_en: new Date().toISOString(),
      motivo_cancelacion: 'Nadie aceptó el trabajo a tiempo tras varios reintentos',
    })
    .eq('id', trabajo.id)

  if (error) {
    console.error(`Error auto-cancelando trabajo sin candidatos (trabajoId=${trabajo.id}): ${error.message ?? error}`)
    return
  }

  emitirFinTrabajo(trabajo.id, { estado: 'cancelado', motivo: 'sin_candidatos' })

  notificarEmpleador(trabajo.empleador_id, {
    tipo:    'cambio_estado',
    titulo:  'Trabajo cancelado',
    mensaje: `Nadie aceptó "${trabajo.titulo}" a tiempo, así que se canceló automáticamente.`,
    trabajoId: trabajo.id,
  })
}

function iniciarReasignacionAutomatica() {
  setInterval(() => {
    procesarReasignaciones().catch((error) => {
      console.error('Error procesando reasignaciones automáticas:', error.message ?? error)
    })
  }, INTERVALO_MS)
}

module.exports = { iniciarReasignacionAutomatica, procesarReasignaciones }
