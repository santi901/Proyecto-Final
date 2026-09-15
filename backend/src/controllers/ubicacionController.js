const supabase = require('../config/supabase')
const { calcularDistanciaKm } = require('../utils/haversine')
const { guardarUbicacionEfimera, obtenerUbicacionEfimera } = require('../services/ubicacionCacheService')
const { emitirUbicacion } = require('../realtime/socket')

const PRECIO_NAFTA_ARS = 2070
const RENDIMIENTO_KM_POR_LITRO = 13
const ESTADOS_TRABAJO_ACTIVO = ['asignado', 'en_progreso']

async function geocodificar(direccion) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(direccion)}&format=json&limit=1`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ChanguitApp/1.0 (proyecto escolar)' },
  })

  if (!response.ok) {
    console.error(`Geocodificación fallida para "${direccion}": Nominatim respondió ${response.status} ${response.statusText}.`)
    throw { status: 500, message: 'Error al consultar el servicio de geocodificación.' }
  }

  const data = await response.json()
  if (!data || data.length === 0) {
    console.error(`Geocodificación sin resultados para "${direccion}".`)
    throw { status: 400, message: `No se encontró la dirección: "${direccion}". Intentá con una dirección más completa.` }
  }

  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
}

async function calcularViaje(req, res) {
  const { direccionTrabajador, direccionEmpleador } = req.query

  if (!direccionTrabajador || !direccionEmpleador) {
    return res.status(400).json({ error: 'Faltan los parámetros direccionTrabajador y direccionEmpleador.' })
  }

  try {
    const [coordsTrabajador, coordsEmpleador] = await Promise.all([
      geocodificar(direccionTrabajador),
      geocodificar(direccionEmpleador),
    ])

    const distanciaKm = calcularDistanciaKm(coordsTrabajador.lat, coordsTrabajador.lng, coordsEmpleador.lat, coordsEmpleador.lng)
    const litros = distanciaKm / RENDIMIENTO_KM_POR_LITRO
    const costoARS = litros * PRECIO_NAFTA_ARS

    return res.json({
      distanciaKm: parseFloat(distanciaKm.toFixed(2)),
      nafta: {
        litros: parseFloat(litros.toFixed(3)),
        costoARS: Math.round(costoARS),
      },
    })
  } catch (err) {
    console.error(`Error calculando viaje (${direccionTrabajador} -> ${direccionEmpleador}): ${err.message ?? err}`)
    return res.status(err.status ?? 500).json({ error: err.message ?? 'Error al calcular el viaje.' })
  }
}

async function actualizarUbicacion(req, res) {
  const { workerId, lat, lng, jobId } = req.body

  if (!workerId || lat == null || lng == null) {
    console.error(`Actualización de ubicación rechazada: faltan datos (workerId=${workerId}, lat=${lat}, lng=${lng}).`)
    return res.status(400).json({ error: 'Faltan workerId, lat o lng.' })
  }

  const { error } = await supabase
    .from('worker_locations')
    .upsert({ worker_id: workerId, lat, lng, updated_at: new Date() })

  if (error) {
    console.error(`Error guardando ubicación en Supabase (workerId=${workerId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error al guardar la ubicación.' })
  }

  // Sprint 4 — almacenamiento efímero en Redis, además del upsert de arriba
  // (que queda como está). Best-effort: si Redis no está disponible esto no
  // frena la respuesta (ver services/ubicacionCacheService.js).
  guardarUbicacionEfimera(workerId, lat, lng)

  if (!jobId) return res.json({ mensaje: 'Ubicación actualizada' })

  const { data: job, error: jobError } = await supabase
    .from('trabajos')
    .select('latitud, longitud, estado')
    .eq('id', jobId)
    .single()

  if (jobError || !job) {
    console.error(`No se encontró el trabajo jobId=${jobId} al actualizar ubicación de workerId=${workerId}: ${jobError?.message ?? 'sin datos'}`)
    return res.status(404).json({ error: 'No se encontró el trabajo.' })
  }

  // Sprint 4 — WebSocket en tiempo real: mientras el trabajo está activo, se
  // comparte la ubicación por la room `trabajo:{jobId}` (ver realtime/socket.js).
  // Al completar/cancelar el trabajo se deja de emitir (emitirFinTrabajo saca a
  // todos de la room), así que no hace falta chequear el estado ahí también.
  if (ESTADOS_TRABAJO_ACTIVO.includes(job.estado)) {
    emitirUbicacion(jobId, { workerId, lat, lng, ts: Date.now() })
  }

  const distanciaKm = calcularDistanciaKm(lat, lng, job.latitud, job.longitud)
  const litros = distanciaKm / RENDIMIENTO_KM_POR_LITRO
  const costoARS = litros * PRECIO_NAFTA_ARS

  return res.json({
    distanciaRestanteKm: parseFloat(distanciaKm.toFixed(2)),
    nafta: {
      litros: parseFloat(litros.toFixed(3)),
      costoARS: Math.round(costoARS),
    },
  })
}

// Fallback por si el cliente no está conectado por WebSocket (o se perdió el
// evento): última ubicación conocida desde el cache efímero de Redis.
async function obtenerUbicacionCache(req, res) {
  const { workerId } = req.params

  const ubicacion = await obtenerUbicacionEfimera(workerId)
  if (!ubicacion) return res.status(404).json({ error: 'No hay ubicación reciente para este trabajador.' })

  res.json({ ubicacion })
}

module.exports = { calcularViaje, actualizarUbicacion, obtenerUbicacionCache }
