const supabase = require('../config/supabase')
const { calcularDistanciaKm } = require('../utils/haversine')

const RADIO_BUSQUEDA_DEFAULT_KM = 10
const ESTADOS_TRABAJO_ACTIVO = ['asignado', 'en_progreso']

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

  const { data: ocupados, error: ocupadosError } = await supabase
    .from('trabajos')
    .select('trabajador_id')
    .in('estado', ESTADOS_TRABAJO_ACTIVO)
    .not('trabajador_id', 'is', null)

  if (ocupadosError) {
    throw { status: 500, message: 'Error al verificar disponibilidad.' }
  }

  const idsOcupados = new Set((ocupados ?? []).map((t) => t.trabajador_id))

  return (candidatos ?? [])
    .filter((candidato) => !idsOcupados.has(candidato.id))
    .map((candidato) => ({
      id:            candidato.id,
      userId:        candidato.user_id,
      nombre:        candidato.nombre,
      apellido:      candidato.apellido,
      reputacion:    candidato.reputacion ?? 0,
      radioMaximoKm: radioKm ?? candidato.radio_busqueda ?? RADIO_BUSQUEDA_DEFAULT_KM,
      distanciaKm:   calcularDistanciaKm(trabajo.latitud, trabajo.longitud, candidato.lat, candidato.lng),
    }))
    .filter((candidato) => candidato.distanciaKm <= candidato.radioMaximoKm)
    .sort((a, b) => b.reputacion - a.reputacion || a.distanciaKm - b.distanciaKm)
    .map(({ id, userId, nombre, apellido, reputacion, distanciaKm }) => ({
      id, userId, nombre, apellido, reputacion,
      distanciaKm: parseFloat(distanciaKm.toFixed(2)),
    }))
}

module.exports = { buscarTrabajadoresDisponibles }
