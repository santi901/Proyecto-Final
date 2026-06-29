const { createClient } = require('@supabase/supabase-js')
const { calcularDistanciaKm } = require('../utils/haversine')

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

const PRECIO_NAFTA_ARS = 2070
const RENDIMIENTO_KM_POR_LITRO = 13

async function geocodificar(direccion) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(direccion)}&format=json&limit=1`
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ChanguitApp/1.0 (proyecto escolar)' },
  })

  if (!response.ok) throw { status: 500, message: 'Error al consultar el servicio de geocodificación.' }

  const data = await response.json()
  if (!data || data.length === 0) {
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
    return res.status(err.status ?? 500).json({ error: err.message ?? 'Error al calcular el viaje.' })
  }
}

async function actualizarUbicacion(req, res) {
  const { workerId, lat, lng, jobId } = req.body

  if (!workerId || lat == null || lng == null) {
    return res.status(400).json({ error: 'Faltan workerId, lat o lng.' })
  }

  const { error } = await supabase
    .from('worker_locations')
    .upsert({ worker_id: workerId, lat, lng, updated_at: new Date() })

  if (error) return res.status(500).json({ error: 'Error al guardar la ubicación.' })

  if (!jobId) return res.json({ mensaje: 'Ubicación actualizada' })

  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('lat, lng')
    .eq('id', jobId)
    .single()

  if (jobError || !job) return res.status(404).json({ error: 'No se encontró el trabajo.' })

  const distanciaKm = calcularDistanciaKm(lat, lng, job.lat, job.lng)
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

module.exports = { calcularViaje, actualizarUbicacion }
