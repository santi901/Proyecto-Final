const supabase = require('../config/supabase')
const { calcularDistanciaKm } = require('../utils/haversine')
const { obtenerReputaciones } = require('./reputacionService')

const RADIO_BUSQUEDA_DEFAULT_KM = 10
const ESTADOS_TRABAJO_ACTIVO = ['asignado', 'en_progreso']

// Puerto de src/matching/matching.service.ts (proyecto NestJS raíz) a backend/,
// que es el único backend al que hablan las apps. Mismo criterio: categoría del
// trabajo, radio de búsqueda del candidato (o el pasado por query), que no esté
// ya ocupado en otro trabajo activo, ordenado por score de reputación desc (Sprint 5,
// ver reputacionService.js) y distancia asc.
async function buscarTrabajadoresDisponibles(trabajoId, radioKm) {
  if (!trabajoId) {
    throw { status: 400, message: 'trabajoId es requerido.' }
  }

  const { data: trabajo, error: trabajoError } = await supabase
    .from('trabajos').select('id, categoria, latitud, longitud').eq('id', trabajoId).maybeSingle()

  if (trabajoError || !trabajo) {
    throw { status: 400, message: 'No se encontró el trabajo.' }
  }

  if (trabajo.latitud == null || trabajo.longitud == null) {
    throw { status: 400, message: 'Este trabajo no tiene una ubicación cargada.' }
  }

  const { data: candidatos, error: candidatosError } = await supabase
    .from('empleados')
    .select('id, user_id, nombre, apellido, lat, lng, radio_busqueda, categorias, reputacion')
    .contains('categorias', [trabajo.categoria])
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  if (candidatosError) {
    throw { status: 500, message: 'Error al buscar trabajadores.' }
  }

  // "Disponible" también significa que no está en medio de otro trabajo.
  const { data: ocupados, error: ocupadosError } = await supabase
    .from('trabajos')
    .select('trabajador_id')
    .in('estado', ESTADOS_TRABAJO_ACTIVO)
    .not('trabajador_id', 'is', null)

  if (ocupadosError) {
    throw { status: 500, message: 'Error al verificar disponibilidad.' }
  }

  const idsOcupados = new Set((ocupados ?? []).map((t) => t.trabajador_id))

  const enRango = (candidatos ?? [])
    .filter((candidato) => !idsOcupados.has(candidato.id))
    .map((candidato) => ({
      id:            candidato.id,
      userId:        candidato.user_id,
      nombre:        candidato.nombre,
      apellido:      candidato.apellido,
      radioMaximoKm: radioKm ?? candidato.radio_busqueda ?? RADIO_BUSQUEDA_DEFAULT_KM,
      distanciaKm:   calcularDistanciaKm(trabajo.latitud, trabajo.longitud, candidato.lat, candidato.lng),
    }))
    .filter((candidato) => candidato.distanciaKm <= candidato.radioMaximoKm)

  const reputaciones = await obtenerReputaciones(enRango.map((c) => c.id))

  return enRango
    .map((c) => ({ ...c, reputacion: reputaciones[c.id]?.promedio ?? null, score: reputaciones[c.id]?.score ?? 0 }))
    .sort((a, b) => b.score - a.score || a.distanciaKm - b.distanciaKm)
    .map(({ id, userId, nombre, apellido, reputacion, score, distanciaKm }) => ({
      id, userId, nombre, apellido, reputacion, score,
      distanciaKm: parseFloat(distanciaKm.toFixed(2)),
    }))
}

module.exports = { buscarTrabajadoresDisponibles }
