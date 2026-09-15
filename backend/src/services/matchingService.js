const supabase = require('../config/supabase')
const { calcularDistanciaKm } = require('../utils/haversine')

const RADIO_BUSQUEDA_DEFAULT_KM = 10
const ESTADOS_TRABAJO_ACTIVO = ['asignado', 'en_progreso']

// Puerto de src/matching/matching.service.ts (proyecto NestJS raíz) a backend/,
// que es el único backend al que hablan las apps. Mismo criterio: categoría del
// trabajo, radio de búsqueda del candidato (o el pasado por query), que no esté
// ya ocupado en otro trabajo activo, ordenado por reputación desc y distancia asc.
async function buscarTrabajadoresDisponibles(trabajoId, radioKm) {
  if (!trabajoId) {
    throw { status: 400, message: 'trabajoId es requerido.' }
  }

  const { data: trabajo, error: trabajoError } = await supabase
    .from('trabajos').select('id, categoria, empleador_id').eq('id', trabajoId).maybeSingle()

  if (trabajoError || !trabajo) {
    throw { status: 400, message: 'No se encontró el trabajo.' }
  }

  // El trabajo no guarda su propia lat/lng, así que se usa la ubicación del
  // perfil del empleador que lo publicó.
  const { data: empleador, error: empleadorError } = await supabase
    .from('perfiles').select('lat, lng').eq('id', trabajo.empleador_id).maybeSingle()

  if (empleadorError || !empleador || empleador.lat == null || empleador.lng == null) {
    throw { status: 400, message: 'El empleador de este trabajo no tiene una ubicación cargada.' }
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

  return (candidatos ?? [])
    .filter((candidato) => !idsOcupados.has(candidato.id))
    .map((candidato) => ({
      id:            candidato.id,
      userId:        candidato.user_id,
      nombre:        candidato.nombre,
      apellido:      candidato.apellido,
      reputacion:    candidato.reputacion ?? 0,
      radioMaximoKm: radioKm ?? candidato.radio_busqueda ?? RADIO_BUSQUEDA_DEFAULT_KM,
      distanciaKm:   calcularDistanciaKm(empleador.lat, empleador.lng, candidato.lat, candidato.lng),
    }))
    .filter((candidato) => candidato.distanciaKm <= candidato.radioMaximoKm)
    .sort((a, b) => b.reputacion - a.reputacion || a.distanciaKm - b.distanciaKm)
    .map(({ id, userId, nombre, apellido, reputacion, distanciaKm }) => ({
      id, userId, nombre, apellido, reputacion,
      distanciaKm: parseFloat(distanciaKm.toFixed(2)),
    }))
}

module.exports = { buscarTrabajadoresDisponibles }
