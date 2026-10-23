const supabase = require('../config/supabase')
const { notificarEmpleador, notificarNuevoTrabajo } = require('../services/notificacionesService')
const { emitirFinTrabajo } = require('../realtime/socket')
const pagos = require('../services/pagosService')

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

  const { data: actualizados, error } = await supabase
    .from('trabajos')
    .update({
      solicitud_expira_en: nuevaExpira.toISOString(),
      intentos_reasignacion: trabajo.intentos_reasignacion + 1,
    })
    .eq('id', trabajo.id)
    .eq('estado', 'pendiente')
    .select('id')

  if (error) {
    console.error(`Error reintentando reasignación (trabajoId=${trabajo.id}): ${error.message ?? error}`)
    return
  }
  if (!actualizados?.length) return  // alguien lo aceptó o se canceló mientras tanto

  notificarNuevoTrabajo(trabajo)
}

// Condicional sobre 'pendiente': si un trabajador lo aceptó entre la consulta
// y este update, no hay que cancelarlo (ni reembolsarlo).
async function cancelarPorFaltaDeCandidatos(trabajo) {
  const { data: cancelados, error } = await supabase
    .from('trabajos')
    .update({
      estado: 'cancelado',
      cancelado_por: 'sistema',
      cancelado_en: new Date().toISOString(),
      motivo_cancelacion: 'Nadie aceptó el trabajo a tiempo tras varios reintentos',
    })
    .eq('id', trabajo.id)
    .eq('estado', 'pendiente')
    .select('id')

  if (error) {
    console.error(`Error auto-cancelando trabajo sin candidatos (trabajoId=${trabajo.id}): ${error.message ?? error}`)
    return
  }
  if (!cancelados?.length) return

  // La cancelación automática siempre devuelve el 100%.
  await pagos.reembolsarTrabajo({ trabajoId: trabajo.id, porcentaje: 100 })

  emitirFinTrabajo(trabajo.id, { estado: 'cancelado', motivo: 'sin_candidatos' })

  notificarEmpleador(trabajo.empleador_id, {
    tipo:    'cambio_estado',
    titulo:  'Trabajo cancelado',
    mensaje: `Nadie aceptó "${trabajo.titulo}" a tiempo, así que se canceló automáticamente y te devolvimos el pago.`,
    trabajoId: trabajo.id,
  })
}

// Trabajos en 'pago_pendiente' cuyo plazo para pagar (solicitud_expira_en) venció.
async function procesarPagosVencidos() {
  const { data: vencidos, error } = await supabase
    .from('trabajos')
    .select('id')
    .eq('estado', 'pago_pendiente')
    .lt('solicitud_expira_en', new Date().toISOString())

  if (error) {
    console.error(`Error buscando trabajos con pago vencido: ${error.message ?? error}`)
    return
  }

  for (const { id } of vencidos ?? []) {
    // Por si pagó y el webhook nunca llegó: esto lo publica en vez de cancelarlo.
    await pagos.sincronizarPago(id)

    const { data: cancelados } = await supabase
      .from('trabajos')
      .update({
        estado: 'cancelado',
        cancelado_por: 'sistema',
        cancelado_en: new Date().toISOString(),
        motivo_cancelacion: 'No se completó el pago a tiempo',
      })
      .eq('id', id)
      .eq('estado', 'pago_pendiente')
      .select('id')

    if (cancelados?.length) await pagos.cancelarPagoPendiente(id)
  }
}

// MP es idempotente con la misma key, así que reintentar en cada vuelta no
// puede devolver la plata dos veces.
async function reintentarReembolsosFallidos() {
  const { data: fallidos, error } = await supabase
    .from('pagos').select('trabajo_id, reembolso_porcentaje').eq('estado', 'reembolso_fallido')

  if (error) {
    console.error(`Error buscando reembolsos fallidos: ${error.message ?? error}`)
    return
  }

  for (const pago of fallidos ?? []) {
    await pagos.reembolsarTrabajo({ trabajoId: pago.trabajo_id, porcentaje: pago.reembolso_porcentaje ?? 100 })
  }
}

async function procesarTodo() {
  await procesarPagosVencidos()
  await procesarReasignaciones()
  await reintentarReembolsosFallidos()
}

function iniciarReasignacionAutomatica() {
  setInterval(() => {
    procesarTodo().catch((error) => {
      console.error('Error procesando reasignaciones automáticas:', error.message ?? error)
    })
  }, INTERVALO_MS)
}

module.exports = { iniciarReasignacionAutomatica, procesarReasignaciones, procesarPagosVencidos, reintentarReembolsosFallidos }
