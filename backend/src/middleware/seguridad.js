const helmet = require('helmet')
const { rateLimit } = require('express-rate-limit')

// ── HTTPS ────────────────────────────────────────────────────────────────────
// El TLS lo termina el hosting (Render, Railway, Fly, nginx...) y le pasa la
// request a Express por HTTP con `X-Forwarded-Proto`. Con TRUST_PROXY seteado
// Express confía en ese header (req.secure / req.ip correctos), y con
// FORZAR_HTTPS=true se rechaza cualquier request que no haya llegado por HTTPS.
// En desarrollo local se dejan los dos sin setear y todo sigue por HTTP.
function configurarProxy(app) {
  const valor = process.env.TRUST_PROXY
  if (!valor) return
  // "1" = un solo proxy delante (lo normal en un PaaS); también acepta true/false o IPs.
  app.set('trust proxy', /^\d+$/.test(valor) ? Number(valor) : valor === 'true' ? true : valor)
}

function forzarHttps(req, res, next) {
  if (process.env.FORZAR_HTTPS !== 'true' || req.secure) return next()
  // No se redirige: un POST redirigido a https pierde el body, y una app que
  // le pega por http tiene la URL mal configurada (mejor que falle visible).
  console.error(`Request rechazada por no usar HTTPS (${req.method} ${req.originalUrl}).`)
  res.status(403).json({ error: 'Se requiere HTTPS' })
}

// helmet: headers de seguridad estándar, incluido HSTS (el navegador recuerda
// usar siempre HTTPS; solo tiene efecto cuando la respuesta viaja por HTTPS).
const headersSeguridad = helmet()

// ── Rate limiting ─────────────────────────────────────────────────────────────
// Por IP y en memoria (se reinicia con el proceso; con más de una instancia
// habría que pasarle un store compartido, p. ej. Redis).
function limitador({ minutos, maximo, mensaje, ...opciones }) {
  return rateLimit({
    windowMs: minutos * 60 * 1000,
    limit: maximo,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res, _next, opts) => {
      console.error(`Rate limit superado (${req.method} ${req.originalUrl}, ip=${req.ip}).`)
      res.status(opts.statusCode).json({ error: mensaje })
    },
    ...opciones,
  })
}

const limites = {
  // Techo general. Holgado: el chat se consulta cada pocos segundos y la ubicación cada 10s.
  general: limitador({
    minutos: 15, maximo: 1000,
    mensaje: 'Demasiadas solicitudes, esperá unos minutos',
    // MP puede mandar ráfagas de webhooks; se validan por firma, no por IP.
    skip: (req) => req.path === '/api/pagos/webhook',
  }),
  // Fuerza bruta de contraseñas: solo cuentan los intentos fallidos.
  login: limitador({
    minutos: 15, maximo: 10, skipSuccessfulRequests: true,
    mensaje: 'Demasiados intentos de inicio de sesión, esperá 15 minutos',
  }),
  registro: limitador({ minutos: 60, maximo: 10, mensaje: 'Demasiados registros desde esta red, probá más tarde' }),
  refresh:  limitador({ minutos: 15, maximo: 60, mensaje: 'Demasiadas solicitudes, esperá unos minutos' }),
  // Cada llamada es una llamada paga a AWS Rekognition + 2 subidas a S3.
  verificacion: limitador({ minutos: 60, maximo: 10, mensaje: 'Demasiados intentos de verificación, probá en una hora' }),
  // Validar PIN: 6 dígitos son 900.000 combinaciones; esto lo hace inviable.
  pin:      limitador({ minutos: 15, maximo: 10, mensaje: 'Demasiados intentos de PIN, esperá 15 minutos' }),
  cotizar:  limitador({ minutos: 1, maximo: 30, mensaje: 'Demasiadas cotizaciones, esperá un minuto' }),
  crearTrabajo: limitador({ minutos: 10, maximo: 10, mensaje: 'Demasiados trabajos creados, esperá unos minutos' }),
}

module.exports = { configurarProxy, forzarHttps, headersSeguridad, limites }
