const Redis = require('ioredis')

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
