const crypto = require('crypto')

// Cliente mínimo de la API REST de MercadoPago (Checkout Pro + reembolsos).
// Se usa fetch directo en vez del SDK: son 4 endpoints y así no dependemos de
// los cambios de interfaz entre versiones del paquete `mercadopago`.

const MP_API = 'https://api.mercadopago.com'

// Cuánto tiempo tiene el empleador para completar el pago antes de que la
// preferencia expire (el poller cancela el trabajo pasado ese tiempo).
const MINUTOS_PARA_PAGAR = 30

// Modo simulado (demo): sin MP_ACCESS_TOKEN, o con PAGOS_SIMULADOS=true, no se llama
// nunca a MercadoPago. La preferencia no tiene checkout real (la app muestra su propia
// pantalla de pago), el pago lo aprueba POST /api/trabajos/:id/pago/simular y los
// reembolsos se registran sin mover plata. El resto del flujo (retención, comisión,
// liquidaciones, porcentajes de reembolso) es exactamente el mismo.
function pagosSimulados() {
  return process.env.PAGOS_SIMULADOS === 'true' || !process.env.MP_ACCESS_TOKEN
}

function accessToken() {
  const token = process.env.MP_ACCESS_TOKEN
  if (!token) throw { status: 503, message: 'Los pagos no están configurados (falta MP_ACCESS_TOKEN).' }
  return token
}

async function llamarMp(metodo, ruta, { body, idempotencyKey } = {}) {
  const headers = { Authorization: `Bearer ${accessToken()}` }
  if (body) headers['Content-Type'] = 'application/json'
  if (idempotencyKey) headers['X-Idempotency-Key'] = idempotencyKey

  const respuesta = await fetch(`${MP_API}${ruta}`, {
    method: metodo,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
  })

  const datos = await respuesta.json().catch(() => null)
  if (!respuesta.ok) {
    const detalle = datos?.message ?? datos?.error ?? respuesta.statusText
    throw { status: 502, message: `MercadoPago respondió ${respuesta.status}: ${detalle}` }
  }
  return datos
}

// La URL pública (https) del backend: MP solo puede avisar por webhook y
// redirigir de vuelta a una URL alcanzable desde internet.
function urlPublica() {
  return process.env.PUBLIC_API_URL?.replace(/\/$/, '') || null
}

async function crearPreferencia({ trabajoId, titulo, monto }) {
  if (pagosSimulados()) return { id: `sim-pref-${trabajoId}`, checkoutUrl: null }

  const base = urlPublica()
  const esHttps = base?.startsWith('https://')
  const vence = new Date(Date.now() + MINUTOS_PARA_PAGAR * 60 * 1000)

  const body = {
    items: [{
      id:          trabajoId,
      title:       `ChanguitApp: ${titulo}`.slice(0, 250),
      quantity:    1,
      unit_price:  monto,
      currency_id: 'ARS',
    }],
    external_reference: trabajoId,
    // Solo aprobado o rechazado, sin "pendiente": el trabajo no se puede publicar
    // con un pago que quizás se acredite en días.
    binary_mode: true,
    payment_methods: {
      // Rapipago/Pago Fácil/cajero tardan días en acreditarse: incompatibles con el flujo.
      excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }],
    },
    expires:            true,
    expiration_date_to: vence.toISOString(),
    statement_descriptor: 'CHANGUITAPP',
  }

  if (base) {
    const retorno = `${base}/api/pagos/retorno?trabajoId=${encodeURIComponent(trabajoId)}`
    body.back_urls = { success: retorno, failure: retorno, pending: retorno }
    // MP rechaza auto_return / notification_url si no son https.
    if (esHttps) {
      body.auto_return = 'approved'
      body.notification_url = `${base}/api/pagos/webhook`
    }
  }

  const preferencia = await llamarMp('POST', '/checkout/preferences', {
    body,
    idempotencyKey: `preferencia-${trabajoId}`,
  })

  // Con credenciales de prueba hay que mandar al usuario al checkout de sandbox.
  const esPrueba = accessToken().startsWith('TEST-')
  return {
    id:          preferencia.id,
    checkoutUrl: (esPrueba && preferencia.sandbox_init_point) || preferencia.init_point,
  }
}

async function obtenerPago(paymentId) {
  return llamarMp('GET', `/v1/payments/${encodeURIComponent(paymentId)}`)
}

// Para cuando el webhook no llega (típico en desarrollo local, sin URL pública):
// se busca el pago más reciente asociado al trabajo. Prioriza uno aprobado.
async function buscarPagoPorTrabajo(trabajoId) {
  if (pagosSimulados()) return null  // el pago simulado se aprueba por su endpoint, no hay nada que buscar
  const query = new URLSearchParams({
    external_reference: trabajoId, sort: 'date_created', criteria: 'desc',
  })
  const { results } = await llamarMp('GET', `/v1/payments/search?${query}`)
  return results?.find((p) => p.status === 'approved') ?? results?.[0] ?? null
}

// Sin monto = reembolso total. La idempotency key hace que reintentar el mismo
// reembolso (doble click, admin que reintenta) no devuelva la plata dos veces.
async function reembolsar(paymentId, monto, idempotencyKey) {
  if (pagosSimulados()) return { id: `sim-${idempotencyKey}`, amount: monto, status: 'approved' }
  return llamarMp('POST', `/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
    body: monto == null ? {} : { amount: monto },
    idempotencyKey,
  })
}

// Valida el header x-signature de los webhooks de MP:
//   x-signature: ts=<epoch>,v1=<hmac-sha256 hex>
//   manifest:    id:<data.id>;request-id:<x-request-id>;ts:<ts>;
// https://www.mercadopago.com.ar/developers/es/docs/your-integrations/notifications/webhooks
function firmaWebhookValida({ firma, requestId, dataId }) {
  const secreto = process.env.MP_WEBHOOK_SECRET
  if (!secreto || !firma) return false

  const partes = Object.fromEntries(
    firma.split(',').map((p) => p.trim().split('=')).filter((p) => p.length === 2),
  )
  if (!partes.ts || !partes.v1) return false

  // MP firma el id en minúsculas cuando es alfanumérico.
  const id = typeof dataId === 'string' ? dataId.toLowerCase() : dataId
  let manifest = ''
  if (id)        manifest += `id:${id};`
  if (requestId) manifest += `request-id:${requestId};`
  manifest += `ts:${partes.ts};`

  const esperado = crypto.createHmac('sha256', secreto).update(manifest).digest('hex')
  const a = Buffer.from(esperado)
  const b = Buffer.from(partes.v1)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

module.exports = {
  MINUTOS_PARA_PAGAR, pagosSimulados,
  crearPreferencia, obtenerPago, buscarPagoPorTrabajo, reembolsar, firmaWebhookValida,
}
