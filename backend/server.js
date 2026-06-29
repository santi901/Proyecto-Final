require('dotenv').config()
const express = require('express')
const cors    = require('cors')

const authRoutes         = require('./src/routes/auth')
const empleadosRoutes    = require('./src/routes/empleados')
const perfilesRoutes     = require('./src/routes/perfiles')
const trabajosRoutes     = require('./src/routes/trabajos')
const verificacionRoutes = require('./src/routes/verificacion')
const ubicacionRoutes    = require('./src/routes/ubicacion')
const errorHandler       = require('./src/middleware/errorHandler')

const app  = express()
const PORT = process.env.PORT || 3000

app.use(cors())
app.use(express.json())

app.use('/api/auth',         authRoutes)
app.use('/api/empleados',    empleadosRoutes)
app.use('/api/perfiles',     perfilesRoutes)
app.use('/api/trabajos',     trabajosRoutes)
app.use('/api/verificacion', verificacionRoutes)
app.use('/api/ubicacion',    ubicacionRoutes)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use(errorHandler)

app.listen(PORT, () => {
  console.log(`ChanguitApp backend corriendo en http://localhost:${PORT}`)
})

module.exports = app
