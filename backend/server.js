require('dotenv').config()
const express = require('express')
const cors    = require('cors')
const http    = require('http')

const authRoutes         = require('./src/routes/auth')
const empleadosRoutes    = require('./src/routes/empleados')
const perfilesRoutes     = require('./src/routes/perfiles')
const trabajosRoutes     = require('./src/routes/trabajos')
const verificacionRoutes = require('./src/routes/verificacion')
const ubicacionRoutes    = require('./src/routes/ubicacion')
const pagosRoutes        = require('./src/routes/pagos')
const notificacionesRoutes = require('./src/routes/notificaciones')
const errorHandler       = require('./src/middleware/errorHandler')
const { configurarProxy, forzarHttps, headersSeguridad, limites } = require('./src/middleware/seguridad')
const { iniciarReasignacionAutomatica } = require('./src/jobs/reasignarTrabajos')
const { configurarSocket } = require('./src/realtime/socket')
const { pagosSimulados } = require('./src/services/mercadoPagoService')

const app  = express()
const PORT = process.env.PORT || 3000

configurarProxy(app)
app.use(forzarHttps)
app.use(headersSeguridad)

// Las apps nativas no mandan Origin, así que esto solo afecta a la versión web.
// Sin CORS_ORIGINS (desarrollo) se acepta cualquier origen.
const origenes = process.env.CORS_ORIGINS?.split(',').map((o) => o.trim()).filter(Boolean)
app.use(cors(origenes?.length ? { origin: origenes } : undefined))

app.use(limites.general)
// Verificación de identidad tiene su propio parser con límite más alto (las fotos
// viajan en base64): ver src/routes/verificacion.js.
const jsonChico = express.json({ limit: '100kb' })
app.use((req, res, next) => (req.path.startsWith('/api/verificacion/') ? next() : jsonChico(req, res, next)))

app.use('/api/auth',         authRoutes)
app.use('/api/empleados',    empleadosRoutes)
app.use('/api/perfiles',     perfilesRoutes)
app.use('/api/trabajos',     trabajosRoutes)
app.use('/api/verificacion', verificacionRoutes)
app.use('/api/ubicacion',    ubicacionRoutes)
app.use('/api/pagos',        pagosRoutes)
app.use('/api/notificaciones', notificacionesRoutes)

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.use(errorHandler)

// http.Server explícito (en vez de app.listen) porque socket.io necesita
// engancharse al mismo servidor HTTP que Express (Sprint 4 — WebSocket).
const httpServer = http.createServer(app)
configurarSocket(httpServer)
iniciarReasignacionAutomatica()

httpServer.listen(PORT, () => {
  console.log(`ChanguitApp backend corriendo en http://localhost:${PORT}`)
  if (pagosSimulados()) console.log('Pagos en modo SIMULADO: no se llama a MercadoPago (ver mercadoPagoService.js).')
})

module.exports = app
