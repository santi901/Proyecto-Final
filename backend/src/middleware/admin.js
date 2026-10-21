const crypto = require('crypto')

// No hay un tipo de usuario admin: las rutas de administración (marcar
// liquidaciones como pagadas) se protegen con una clave compartida en el
// header `x-admin-key`, comparada en tiempo constante.
function soloAdmin(req, res, next) {
  const esperada = process.env.ADMIN_API_KEY
  const recibida = req.headers['x-admin-key']

  if (!esperada) {
    console.error('Ruta admin rechazada: ADMIN_API_KEY no está configurada.')
    return res.status(503).json({ error: 'Administración no configurada' })
  }

  const a = Buffer.from(String(recibida ?? ''))
  const b = Buffer.from(esperada)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    console.error(`Ruta admin rechazada (${req.method} ${req.originalUrl}): clave inválida.`)
    return res.status(403).json({ error: 'No autorizado' })
  }
  next()
}

module.exports = { soloAdmin }
