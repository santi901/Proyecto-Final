const supabase = require('../config/supabase')
const mp = require('./mercadoPagoService')
const pagos = require('./pagosService')
const { faltaMigracion } = require('./cuentasService')

// Registro de las notificaciones (webhooks) de MercadoPago en la tabla `webhooks_mp`
// (ver "Schema" en backend/CLAUDE.md): cuándo llegó cada una, si la firma era válida, y si se pudo
// procesar o con qué error. Sirve para auditar y para reprocesar desde el panel de
// admin una que falló (por ejemplo, si Supabase o MP estaban caídos en ese momento).
//
// Es best-effort: si la tabla no existe o el insert falla, el webhook se procesa
// igual. Nunca tiene que ser la razón por la que un pago no se acredita.

let avisoMostrado = false

async function registrarEvento({ tipo, dataId, requestId, firmaValida, estado }) {
  const { data, error } = await supabase
    .from('webhooks_mp')
    .insert({ tipo, data_id: String(dataId), request_id: requestId ?? null, firma_valida: firmaValida, estado })
    .select('id')
    .single()

  if (error) {
    if (!faltaMigracion(error) && error.code !== '42P01' && error.code !== 'PGRST205') {
      console.error(`Error registrando webhook de MP (paymentId=${dataId}): ${error.message ?? error}`)
    } else if (!avisoMostrado) {
      avisoMostrado = true
      console.error('Los webhooks de MP no se registran: falta la tabla webhooks_mp en Supabase.')
    }
    return null
  }
  return data.id
}

async function actualizarEvento(eventoId, campos) {
  if (!eventoId) return
  const { error } = await supabase.from('webhooks_mp').update(campos).eq('id', eventoId)
  if (error) console.error(`Error actualizando webhook registrado (id=${eventoId}): ${error.message ?? error}`)
}

// Pide el pago a MP (nunca se confía en el body del webhook) y lo procesa.
// Idempotente: procesarPagoMp no publica ni reembolsa dos veces.
async function procesarEvento(eventoId, paymentId) {
  try {
    const pagoMp = await mp.obtenerPago(paymentId)
    await pagos.procesarPagoMp(pagoMp)
    await actualizarEvento(eventoId, {
      estado:       'procesado',
      mp_estado:    pagoMp.status ?? null,
      trabajo_id:   pagoMp.external_reference ?? null,
      error:        null,
      procesado_en: new Date().toISOString(),
    })
    return { ok: true, mpEstado: pagoMp.status }
  } catch (error) {
    const mensaje = String(error.message ?? error).slice(0, 500)
    console.error(`Error procesando webhook de MP (paymentId=${paymentId}): ${mensaje}`)
    await actualizarEvento(eventoId, { estado: 'error', error: mensaje, procesado_en: new Date().toISOString() })
    return { ok: false, error: mensaje }
  }
}

module.exports = { registrarEvento, actualizarEvento, procesarEvento }
