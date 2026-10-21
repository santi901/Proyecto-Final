const crypto = require('crypto')
const supabase = require('../config/supabase')
const mp = require('./mercadoPagoService')
const { notificarEmpleador, notificarEmpleado, notificarNuevoTrabajo } = require('./notificacionesService')

// Modelo de custodia: el empleador le paga a la cuenta de MP de la plataforma y
// la plata queda RETENIDA ahí (pagos.estado = 'aprobado') hasta que:
//   - el trabajo se completa  → liberarPago: se genera una liquidación al trabajador
//                                por trabajos.monto_trabajador (precio - comisión)
//   - el trabajo se cancela   → reembolsarTrabajo: se devuelve todo o parte por la API de MP
//
// Todas las transiciones de `pagos.estado` son updates condicionales
// (.in('estado', [...])) para que el webhook y la sincronización por polling
// puedan correr a la vez sin publicar el trabajo ni reembolsar dos veces.

const MINUTOS_SOLICITUD = 15

async function obtenerPagoDeTrabajo(trabajoId) {
  const { data } = await supabase.from('pagos').select('*').eq('trabajo_id', trabajoId).maybeSingle()
  return data
}

// Crea la preferencia de Checkout Pro y la fila en `pagos`. Tira si MP falla:
// el que llama decide qué hacer con el trabajo recién creado.
async function iniciarCobro({ trabajo, empleadorId }) {
  const preferencia = await mp.crearPreferencia({
    trabajoId: trabajo.id, titulo: trabajo.titulo, monto: trabajo.precio,
  })

  const { data: pago, error } = await supabase
    .from('pagos')
    .insert({
      trabajo_id:       trabajo.id,
      empleador_id:     empleadorId,
      monto:            trabajo.precio,
      mp_preference_id: preferencia.id,
      mp_checkout_url:  preferencia.checkoutUrl,
    })
    .select('id, estado, monto, mp_checkout_url')
    .single()

  if (error) throw { status: 500, message: `Error guardando el pago: ${error.message ?? error}` }
  return pago
}

// Procesa un pago de MP (venga del webhook o de sincronizarPago). Idempotente.
async function procesarPagoMp(pagoMp) {
  const trabajoId = pagoMp.external_reference
  const pago = trabajoId ? await obtenerPagoDeTrabajo(trabajoId) : null

  if (!pago) {
    console.error(`Pago de MP sin trabajo asociado (paymentId=${pagoMp.id}, external_reference=${trabajoId}).`)
    return
  }

  await supabase.from('pagos').update({
    mp_payment_id:  String(pagoMp.id),
    mp_estado:      pagoMp.status,
    actualizado_en: new Date().toISOString(),
  }).eq('id', pago.id)

  if (pagoMp.status !== 'approved') return

  // Nunca confiar en que MP cobró lo que esperábamos sin chequearlo.
  if (Number(pagoMp.transaction_amount) !== pago.monto || pagoMp.currency_id !== 'ARS') {
    console.error(`Pago con monto inesperado (trabajoId=${trabajoId}): esperado ${pago.monto} ARS, MP informó ${pagoMp.transaction_amount} ${pagoMp.currency_id}.`)
    await supabase.from('pagos').update({ estado: 'monto_invalido' }).eq('id', pago.id).eq('estado', 'pendiente')
    return
  }

  // 'cancelado' también: el empleador pudo cancelar mientras pagaba.
  const { data: aprobado } = await supabase
    .from('pagos')
    .update({ estado: 'aprobado', aprobado_en: new Date().toISOString() })
    .eq('id', pago.id)
    .in('estado', ['pendiente', 'cancelado'])
    .select('id')

  if (!aprobado?.length) return  // ya lo procesó otro webhook / sincronización

  const solicitudExpira = new Date(Date.now() + MINUTOS_SOLICITUD * 60 * 1000)
  const { data: publicados } = await supabase
    .from('trabajos')
    .update({ estado: 'pendiente', solicitud_expira_en: solicitudExpira.toISOString() })
    .eq('id', trabajoId)
    .eq('estado', 'pago_pendiente')
    .select('id, titulo, categoria, empleador_id')

  const trabajo = publicados?.[0]
  if (!trabajo) {
    // El trabajo se canceló (o expiró) antes de que se acreditara el pago: se devuelve todo.
    console.error(`Pago acreditado para un trabajo que ya no espera pago (trabajoId=${trabajoId}): se reembolsa completo.`)
    await reembolsarTrabajo({ trabajoId, porcentaje: 100 })
    return
  }

  notificarNuevoTrabajo(trabajo)
  notificarEmpleador(trabajo.empleador_id, {
    tipo:    'pago',
    titulo:  'Pago acreditado',
    mensaje: `Recibimos tu pago. Ya estamos buscando a alguien para "${trabajo.titulo}".`,
    trabajoId,
  })
}

// Si el pago sigue pendiente de nuestro lado, le pregunta a MP. Es lo que
// permite que el flujo funcione en desarrollo local, donde el webhook no llega.
async function sincronizarPago(trabajoId) {
  const pago = await obtenerPagoDeTrabajo(trabajoId)
  if (!pago || pago.estado !== 'pendiente') return pago

  try {
    const pagoMp = await mp.buscarPagoPorTrabajo(trabajoId)
    if (pagoMp) await procesarPagoMp(pagoMp)
  } catch (error) {
    console.error(`Error sincronizando pago con MP (trabajoId=${trabajoId}): ${error.message ?? error}`)
  }
  return obtenerPagoDeTrabajo(trabajoId)
}

// Modo simulado: arma un pago "aprobado" con la misma forma que devuelve la API de MP
// y lo pasa por procesarPagoMp, así publicar, notificar y retener funciona igual.
async function simularPagoAprobado(trabajoId) {
  if (!mp.pagosSimulados()) throw { status: 409, message: 'Los pagos simulados están desactivados.' }

  const pago = await obtenerPagoDeTrabajo(trabajoId)
  if (!pago) throw { status: 404, message: 'Este trabajo no tiene un pago asociado.' }
  if (pago.estado !== 'pendiente') throw { status: 409, message: 'Este trabajo ya no espera un pago.' }

  await procesarPagoMp({
    id:                 `sim-${crypto.randomUUID()}`,
    external_reference: trabajoId,
    status:             'approved',
    transaction_amount: pago.monto,
    currency_id:        'ARS',
  })
  return obtenerPagoDeTrabajo(trabajoId)
}

// Trabajo cancelado antes de pagar: no hay nada que devolver.
async function cancelarPagoPendiente(trabajoId) {
  await supabase.from('pagos')
    .update({ estado: 'cancelado', actualizado_en: new Date().toISOString() })
    .eq('trabajo_id', trabajoId)
    .eq('estado', 'pendiente')
}

function montoAReembolsar(pago, porcentaje) {
  return porcentaje === 100 ? pago.monto : Math.round((pago.monto * porcentaje) / 100)
}

// Devuelve `porcentaje`% del pago retenido. No tira: si MP falla, deja el pago
// en 'reembolso_fallido' (con el porcentaje guardado) para reintentarlo desde
// el endpoint admin, y devuelve { ok: false }.
async function reembolsarTrabajo({ trabajoId, porcentaje }) {
  const pago = await obtenerPagoDeTrabajo(trabajoId)
  if (!pago) return { ok: true, sinPago: true }

  if (pago.estado === 'pendiente') {
    await cancelarPagoPendiente(trabajoId)
    return { ok: true, sinPago: true }
  }

  // Un reintento usa el porcentaje original, no el que pida el que reintenta.
  if (pago.estado === 'reembolso_fallido') porcentaje = pago.reembolso_porcentaje ?? porcentaje
  else if (pago.estado !== 'aprobado') {
    return { ok: false, error: `El pago está en estado '${pago.estado}', no se puede reembolsar.` }
  }

  const monto = montoAReembolsar(pago, porcentaje)

  try {
    const reembolso = await mp.reembolsar(
      pago.mp_payment_id,
      porcentaje === 100 ? null : monto,
      `reembolso-${trabajoId}-${porcentaje}`,
    )
    await supabase.from('pagos').update({
      estado:               porcentaje === 100 ? 'reembolsado' : 'reembolsado_parcial',
      reembolso_porcentaje: porcentaje,
      monto_reembolsado:    monto,
      mp_refund_id:         reembolso?.id != null ? String(reembolso.id) : null,
      reembolsado_en:       new Date().toISOString(),
      ultimo_error:         null,
      actualizado_en:       new Date().toISOString(),
    }).eq('id', pago.id)
    return { ok: true, monto }
  } catch (error) {
    console.error(`Error reembolsando pago (trabajoId=${trabajoId}, porcentaje=${porcentaje}): ${error.message ?? error}`)
    await supabase.from('pagos').update({
      estado:               'reembolso_fallido',
      reembolso_porcentaje: porcentaje,
      ultimo_error:         String(error.message ?? error).slice(0, 500),
      actualizado_en:       new Date().toISOString(),
    }).eq('id', pago.id)
    return { ok: false, monto, error: 'No se pudo procesar el reembolso; lo vamos a reintentar.' }
  }
}

// El UNIQUE (trabajo_id, motivo) de la tabla hace que esto sea idempotente.
async function crearLiquidacion({ trabajoId, empleadoId, pagoId, motivo, monto }) {
  const { data: empleado } = await supabase
    .from('empleados').select('alias_cobro').eq('id', empleadoId).maybeSingle()

  const { error } = await supabase.from('liquidaciones').insert({
    trabajo_id:  trabajoId,
    empleado_id: empleadoId,
    pago_id:     pagoId,
    motivo,
    monto,
    alias_cobro: empleado?.alias_cobro ?? null,
  })

  if (error && error.code !== '23505') {  // 23505 = ya existía (unique violation)
    console.error(`Error creando liquidación (trabajoId=${trabajoId}, motivo=${motivo}): ${error.message ?? error}`)
    return false
  }
  if (!empleado?.alias_cobro) {
    console.error(`Liquidación sin método de cobro (trabajoId=${trabajoId}, empleadoId=${empleadoId}): el trabajador no cargó su alias/CBU.`)
  }
  return true
}

// Trabajo completado: la plata retenida pasa a deberse al trabajador.
async function liberarPago({ trabajoId, empleadoId, montoTrabajador }) {
  const { data: liberados } = await supabase
    .from('pagos')
    .update({ estado: 'liberado', actualizado_en: new Date().toISOString() })
    .eq('trabajo_id', trabajoId)
    .eq('estado', 'aprobado')
    .select('id')

  const pago = liberados?.[0]
  if (!pago) return  // trabajo sin pago (anterior al sprint 5) o ya liberado

  await crearLiquidacion({
    trabajoId, empleadoId, pagoId: pago.id, motivo: 'trabajo_completado', monto: montoTrabajador,
  })

  notificarEmpleado(empleadoId, {
    tipo:    'pago',
    titulo:  'Pago liberado',
    mensaje: `Se liberaron $${montoTrabajador} por el trabajo. Te los transferimos a tu alias/CBU.`,
    trabajoId,
  })
}

module.exports = {
  obtenerPagoDeTrabajo, iniciarCobro, procesarPagoMp, sincronizarPago, simularPagoAprobado,
  cancelarPagoPendiente, reembolsarTrabajo, crearLiquidacion, liberarPago, montoAReembolsar,
}
