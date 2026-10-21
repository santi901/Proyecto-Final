const { uuid } = require('../validacion/esquemas')

function describirErrores(error) {
  return error.issues.map((i) => ({ campo: i.path.join('.') || '(raíz)', mensaje: i.message }))
}

// validar(esquema)          → valida req.body y lo reemplaza por el resultado parseado
//                             (con trims/coerciones aplicadas y, en z.object, sin campos extra)
// validar(esquema, 'query') → valida req.query sin reemplazarlo (en Express 5 es de solo lectura)
function validar(esquema, fuente = 'body') {
  return (req, res, next) => {
    const resultado = esquema.safeParse(req[fuente] ?? {})

    if (!resultado.success) {
      const detalles = describirErrores(resultado.error)
      console.error(`Validación rechazada (${req.method} ${req.originalUrl}): ${detalles.map((d) => `${d.campo}: ${d.mensaje}`).join('; ')}`)
      return res.status(400).json({
        error: `Datos inválidos: ${detalles[0].campo} — ${detalles[0].mensaje}`,
        detalles,
      })
    }

    if (fuente === 'body') req.body = resultado.data
    next()
  }
}

// Para router.param('id', validarIdParam): rechaza ids que no son uuid antes de
// que lleguen a Supabase (que si no responde con un error de Postgres → 500).
function validarIdParam(req, res, next, valor, nombre) {
  if (!uuid.safeParse(valor).success) {
    console.error(`Parámetro inválido (${req.method} ${req.originalUrl}): ${nombre}='${valor}' no es un uuid.`)
    return res.status(400).json({ error: `El parámetro ${nombre} no es válido` })
  }
  next()
}

module.exports = { validar, validarIdParam }
