function errorHandler(err, req, res, next) {
  console.error(`Error no manejado en ${req.method} ${req.originalUrl} (tipo=${err.name ?? 'desconocido'}): ${err.message ?? err}`)
  res.status(500).json({ error: 'Error interno del servidor' })
}

module.exports = errorHandler
