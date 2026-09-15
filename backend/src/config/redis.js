const Redis = require('ioredis')

// Almacenamiento efímero de ubicaciones (Sprint 4). Si no hay REDIS_URL o Redis
// no está disponible, se loguea una sola vez y se sigue funcionando: igual que
// notificar() en trabajosController, esto nunca debe frenar el flujo principal
// (el upsert a la tabla worker_locations en Supabase sigue andando solo).
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'

const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
})

let avisado = false
function avisarSoloUnaVez(motivo) {
  if (avisado) return
  avisado = true
  console.error(`Redis no disponible (${motivo}). Se omite el cacheo efímero de ubicaciones.`)
}

redis.on('error', (err) => avisarSoloUnaVez(err.message ?? err))

redis.connect().catch((err) => avisarSoloUnaVez(err.message ?? err))

module.exports = { redis }
