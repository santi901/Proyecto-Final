const { redis, redisDisponible } = require('../config/redis')

const TTL_SEGUNDOS = 120
const PREFIJO = 'ubicacion:trabajador:'

async function guardarUbicacionEfimera(workerId, lat, lng) {
  if (!redisDisponible()) return  // ya se avisó una vez en config/redis.js
  try {
    await redis.set(
      `${PREFIJO}${workerId}`,
      JSON.stringify({ lat, lng, actualizadoEn: new Date().toISOString() }),
      'EX', TTL_SEGUNDOS,
    )
  } catch (error) {
    console.error(`Error guardando ubicación efímera en Redis (workerId=${workerId}): ${error.message ?? error}`)
  }
}

async function obtenerUbicacionEfimera(workerId) {
  if (!redisDisponible()) return null
  try {
    const valor = await redis.get(`${PREFIJO}${workerId}`)
    return valor ? JSON.parse(valor) : null
  } catch (error) {
    console.error(`Error leyendo ubicación efímera de Redis (workerId=${workerId}): ${error.message ?? error}`)
    return null
  }
}

module.exports = { guardarUbicacionEfimera, obtenerUbicacionEfimera }
