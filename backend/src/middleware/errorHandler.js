function errorHandler(err, req, res, next) {
  console.error(`Error no manejado en ${req.method} ${req.originalUrl} (tipo=${err.name ?? 'desconocido'}): ${err.message ?? err}`)

  // Errores de express.json(): JSON mal formado (400) o body más grande que el límite (413).
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'El cuerpo de la solicitud no es JSON válido' })
  if (err.type === 'entity.too.large')    return res.status(413).json({ error: 'La solicitud es demasiado grande' })

  res.status(500).json({ error: 'Error interno del servidor' })
}

module.exports = errorHandler
