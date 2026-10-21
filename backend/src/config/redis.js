const Redis = require('ioredis')

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379'
const REINTENTO_MS = 30000

// Redis es opcional (solo cachea ubicaciones efímeras). Si no está corriendo, el
// backend sigue igual: redisDisponible() da false, los que lo usan se saltean el
// caché sin loguear nada, y se reintenta conectar cada 30s por si lo levantan después.
const redis = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  // Sin cola offline: si no está conectado, un comando falla al toque en vez de esperar.
  enableOfflineQueue: false,
  retryStrategy: () => REINTENTO_MS,
})

let avisado = false
function avisarSoloUnaVez(motivo) {
  if (avisado) return
  avisado = true
  console.error(`Redis no disponible (${motivo}). Se omite el cacheo efímero de ubicaciones; se reintenta cada ${REINTENTO_MS / 1000}s.`)
}

redis.on('error', (err) => avisarSoloUnaVez(err.message ?? err))
redis.on('ready', () => {
  if (avisado) console.log('Redis conectado: se reanuda el cacheo efímero de ubicaciones.')
  avisado = false  // si se vuelve a caer, se avisa de nuevo (una vez)
})

redis.connect().catch((err) => avisarSoloUnaVez(err.message ?? err))

function redisDisponible() {
  return redis.status === 'ready'
}

module.exports = { redis, redisDisponible }
