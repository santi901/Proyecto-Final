const { redis } = require('../config/redis')

const TTL_SEGUNDOS = 120 // la app manda ping cada 10s (ver AppEmployee/lib/ubicacion.ts) — 120s da margen de sobra
const PREFIJO = 'ubicacion:trabajador:'

// Best-effort: si Redis no está disponible esto no debe tirar la request abajo
// (mismo criterio que notificar() en trabajosController.js).
async function guardarUbicacionEfimera(workerId, lat, lng) {
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
  try {
    const valor = await redis.get(`${PREFIJO}${workerId}`)
    return valor ? JSON.parse(valor) : null
  } catch (error) {
    console.error(`Error leyendo ubicación efímera de Redis (workerId=${workerId}): ${error.message ?? error}`)
    return null
  }
}

module.exports = { guardarUbicacionEfimera, obtenerUbicacionEfimera }
