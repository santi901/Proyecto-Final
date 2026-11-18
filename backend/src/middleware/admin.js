const crypto = require('crypto')

// Sprint 6 — acceso al panel de admin (disputas).
//
// No hay un tipo de usuario 'admin' en `usuarios` (solo empleado/empleador, y el
// registro de las apps no tiene por qué saber crear admins). Para un panel interno
// usado por el equipo alcanza con una clave compartida en el .env (ADMIN_API_KEY)
// que se manda en el header `x-admin-key`. Si no está configurada, el panel queda
// cerrado (fail-closed), nunca abierto.
//
// La comparación es en tiempo constante (timingSafeEqual sobre los SHA-256, que
// siempre miden lo mismo) para no filtrar por tiempo de respuesta cuántos
// caracteres de la clave son correctos.

function hash(valor) {
  return crypto.createHash('sha256').update(String(valor)).digest()
}

function soloAdmin(req, res, next) {
  const clave = process.env.ADMIN_API_KEY
  if (!clave) {
    console.error('Acceso al panel de admin rechazado: ADMIN_API_KEY no está configurada en el .env.')
    return res.status(503).json({ error: 'El panel de admin no está configurado' })
  }

  const recibida = req.headers['x-admin-key']
  if (!recibida || !crypto.timingSafeEqual(hash(recibida), hash(clave))) {
    console.error(`Acceso al panel de admin rechazado (ip=${req.ip}): clave inválida.`)
    return res.status(401).json({ error: 'Clave de admin inválida' })
  }

  next()
}

module.exports = { soloAdmin }
