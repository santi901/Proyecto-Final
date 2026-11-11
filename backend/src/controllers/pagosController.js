const supabase = require('../config/supabase')
const mp = require('../services/mercadoPagoService')
const webhooks = require('../services/webhooksService')

// POST /api/pagos/webhook — notificaciones de MercadoPago. Se responde enseguida
// (MP reintenta si tardamos o respondemos error) y se procesa después.
// El pago se vuelve a pedir a la API de MP: nunca se confía en el body.
// Cada notificación queda registrada en `webhooks_mp` (ver webhooksService.js).
async function recibirWebhook(req, res) {
  const tipo      = req.query.type ?? req.query.topic ?? req.body?.type
  const dataId    = req.query['data.id'] ?? req.body?.data?.id ?? req.query.id
  const requestId = req.headers['x-request-id']

  if (tipo !== 'payment' || !dataId) return res.sendStatus(200)

  let firmaValida = null  // null = no se pudo chequear (falta MP_WEBHOOK_SECRET)
  if (process.env.MP_WEBHOOK_SECRET) {
    firmaValida = mp.firmaWebhookValida({
      firma:     req.headers['x-signature'],
      requestId,
      dataId:    String(dataId),
    })
    if (!firmaValida) {
      console.error(`Webhook de MP rechazado (paymentId=${dataId}): firma inválida.`)
      res.sendStatus(401)
      await webhooks.registrarEvento({ tipo, dataId, requestId, firmaValida, estado: 'rechazado' })
      return
    }
  } else {
    console.error('Webhook de MP sin validar firma: falta MP_WEBHOOK_SECRET (no usar así en producción).')
  }

  res.sendStatus(200)

  const eventoId = await webhooks.registrarEvento({ tipo, dataId, requestId, firmaValida, estado: 'recibido' })
  await webhooks.procesarEvento(eventoId, dataId)
}

// GET /api/pagos/retorno — adonde MP redirige al terminar el checkout. Intenta
// volver a la app; si el deep link no abre (Expo Go, web), alcanza con cerrar
// el navegador: la app consulta GET /api/trabajos/:id/pago al volver.
function retornoCheckout(req, res) {
  const urlApp = process.env.APP_RETORNO_URL || 'appemployer://pago'
  const estado = req.query.collection_status ?? req.query.status
  const texto  = estado === 'approved'
    ? 'Pago recibido. Ya podés volver a ChanguitApp.'
    : 'No se completó el pago. Volvé a ChanguitApp para reintentarlo.'

  res.type('html').send(`<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="1;url=${urlApp}">
<title>ChanguitApp</title></head>
<body style="font-family:sans-serif;text-align:center;padding:48px 16px">
<p>${texto}</p><p><a href="${urlApp}">Volver a la app</a></p>
</body></html>`)
}

// GET /api/pagos/mis-liquidaciones — lo que la plataforma le debe / le pagó al trabajador.
async function misLiquidaciones(req, res) {
  const { id: usuarioId } = req.usuario

  const { data: empleado } = await supabase
    .from('empleados').select('id, alias_cobro').eq('user_id', usuarioId).maybeSingle()
  if (!empleado) return res.status(404).json({ error: 'Perfil no encontrado' })

  const { data: liquidaciones, error } = await supabase
    .from('liquidaciones')
    .select('id, trabajo_id, motivo, monto, estado, creado_en, pagada_en')
    .eq('empleado_id', empleado.id)
    .order('creado_en', { ascending: false })

  if (error) {
    console.error(`Error listando liquidaciones (empleadoId=${empleado.id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando liquidaciones' })
  }

  const pendiente = liquidaciones.filter((l) => l.estado === 'pendiente').reduce((t, l) => t + l.monto, 0)
  res.json({ liquidaciones, totalPendiente: pendiente, aliasCobro: empleado.alias_cobro })
}

// GET /api/pagos/admin/liquidaciones?estado=pendiente — para hacer las transferencias.
async function listarLiquidacionesAdmin(req, res) {
  const estado = req.query.estado ?? 'pendiente'

  const { data: liquidaciones, error } = await supabase
    .from('liquidaciones')
    .select('id, trabajo_id, empleado_id, motivo, monto, alias_cobro, estado, referencia, creado_en, pagada_en')
    .eq('estado', estado)
    .order('creado_en', { ascending: true })

  if (error) {
    console.error(`Error listando liquidaciones (admin, estado=${estado}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando liquidaciones' })
  }
  res.json({ liquidaciones })
}

// POST /api/pagos/admin/liquidaciones/:id/pagar { referencia } — se llama después
// de transferirle al trabajador; `referencia` es el nro. de operación.
async function marcarLiquidacionPagada(req, res) {
  const { id } = req.params
  const { referencia } = req.body

  const { data: pagadas, error } = await supabase
    .from('liquidaciones')
    .update({ estado: 'pagada', referencia, pagada_en: new Date().toISOString() })
    .eq('id', id)
    .eq('estado', 'pendiente')
    .select('id, trabajo_id, empleado_id, monto')

  if (error) {
    console.error(`Error marcando liquidación como pagada (id=${id}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error actualizando la liquidación' })
  }
  if (!pagadas?.length) {
    console.error(`Marcar liquidación rechazado (id=${id}): no existe o ya estaba pagada.`)
    return res.status(409).json({ error: 'La liquidación no existe o ya estaba pagada' })
  }
  res.json({ liquidacion: pagadas[0] })
}

module.exports = { recibirWebhook, retornoCheckout, misLiquidaciones, listarLiquidacionesAdmin, marcarLiquidacionPagada }
