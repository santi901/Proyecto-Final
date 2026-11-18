require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const http    = require('http')
const path    = require('path')

const authRoutes         = require('./src/routes/auth')
const empleadosRoutes    = require('./src/routes/empleados')
const perfilesRoutes     = require('./src/routes/perfiles')
const trabajosRoutes     = require('./src/routes/trabajos')
const verificacionRoutes = require('./src/routes/verificacion')
const ubicacionRoutes    = require('./src/routes/ubicacion')
const notificacionesRoutes = require('./src/routes/notificaciones')
const adminRoutes        = require('./src/routes/admin')
const errorHandler       = require('./src/middleware/errorHandler')
const { configurarSocket } = require('./src/realtime/socket')
const { iniciarReasignacionAutomatica } = require('./src/jobs/reasignarTrabajos')
const { iniciarActivacionProgramados } = require('./src/jobs/activarProgramados')

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
app.use('/api/notificaciones', notificacionesRoutes)
app.use('/api/admin',        adminRoutes)

// Sprint 6 — panel de admin (disputas): una página estática que consume /api/admin/*.
// La página en sí no tiene datos; todo lo sensible pide la clave x-admin-key.
app.get('/admin', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')))

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use(errorHandler)

// http.Server explícito (en vez de app.listen) porque socket.io necesita
// engancharse al mismo servidor HTTP que Express (Sprint 4 — WebSocket).
const httpServer = http.createServer(app)
configurarSocket(httpServer)
iniciarReasignacionAutomatica()
iniciarActivacionProgramados()

httpServer.listen(PORT, () => {
  console.log(`ChanguitApp backend corriendo en http://localhost:${PORT}`)
})

module.exports = app
