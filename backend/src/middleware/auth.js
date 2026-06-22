const { verificarAccessToken } = require('../utils/jwt')

function autenticar(req, res, next) {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) return res.status(401).json({ error: 'Token requerido' })

  try {
    req.usuario = verificarAccessToken(token)
    next()
  } catch {
    return res.status(403).json({ error: 'Token inválido o expirado' })
  }
}

function soloEmpleado(req, res, next) {
  if (req.usuario.tipo !== 'empleado') {
    return res.status(403).json({ error: 'Solo empleados pueden acceder a esta ruta' })
  }
  next()
}

function soloEmpleador(req, res, next) {
  if (req.usuario.tipo !== 'empleador') {
    return res.status(403).json({ error: 'Solo empleadores pueden acceder a esta ruta' })
  }
  next()
}

module.exports = { autenticar, soloEmpleado, soloEmpleador }
