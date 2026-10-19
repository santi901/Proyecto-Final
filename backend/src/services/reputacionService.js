const supabase = require('../config/supabase')

// Sprint 5 — reputación del trabajador.
//
// Hay dos números:
//   · promedio: el promedio simple de las estrellas recibidas (1 a 5). Se guarda
//     desnormalizado en empleados.reputacion cada vez que entra una calificación.
//   · score: el número que usa el matching para ordenar candidatos. Se calcula al
//     vuelo (no hace falta columna nueva) a partir de tres pesos:
//
//     1. Antigüedad de cada calificación: pesa 0.5^(edad / VIDA_MEDIA_DIAS), o sea
//        que una calificación de hace 6 meses vale la mitad que una de hoy.
//     2. Cantidad de trabajos: se arranca con PESO_PREVIO calificaciones "ficticias"
//        de PROMEDIO_PREVIO estrellas (promedio bayesiano). Con pocas calificaciones
//        el score queda cerca de 3; recién con varios trabajos calificados se acerca
//        al promedio real. Así un trabajador con un solo 5 no le gana a uno con
//        cuarenta trabajos de 4.8.
//     3. Tasa de cancelación: cancelaciones del propio trabajador / (completados +
//        cancelaciones). El score se multiplica por (1 - PENALIZACION_MAXIMA × tasa):
//        con 100% de cancelaciones el score queda a la mitad. Solo cuentan las que
//        canceló el trabajador (cancelado_por = 'empleado'); las del empleador o las
//        automáticas del sistema no lo penalizan.
//
//     score = promedioBayesianoPonderado × (1 − 0.5 × tasaCancelacion)

const PROMEDIO_PREVIO     = 3
const PESO_PREVIO         = 2
const VIDA_MEDIA_DIAS     = 180
const PENALIZACION_MAXIMA = 0.5
const ULTIMAS_CALIFICACIONES = 5

const MS_POR_DIA = 24 * 60 * 60 * 1000

function redondear(n) {
  return Math.round(n * 100) / 100
}

// Cálculo puro (sin base de datos), para poder reusarlo en lote desde el matching.
function calcularDesdeDatos(calificaciones, trabajos, ahora = Date.now()) {
  const cantidadCalificaciones = calificaciones.length

  const promedio = cantidadCalificaciones
    ? redondear(calificaciones.reduce((s, c) => s + c.puntaje, 0) / cantidadCalificaciones)
    : null

  let sumaPesos = 0
  let sumaPonderada = 0
  for (const c of calificaciones) {
    const edadDias = Math.max(0, (ahora - new Date(c.creado_en).getTime()) / MS_POR_DIA)
    const peso = Math.pow(0.5, edadDias / VIDA_MEDIA_DIAS)
    sumaPesos += peso
    sumaPonderada += peso * c.puntaje
  }
  const promedioBayesiano = (PESO_PREVIO * PROMEDIO_PREVIO + sumaPonderada) / (PESO_PREVIO + sumaPesos)

  const trabajosCompletados = trabajos.filter(t => t.estado === 'completado').length
  const cancelaciones = trabajos.filter(t => t.estado === 'cancelado' && t.cancelado_por === 'empleado').length
  const cerrados = trabajosCompletados + cancelaciones
  const tasaCancelacion = cerrados ? cancelaciones / cerrados : 0

  const score = promedioBayesiano * (1 - PENALIZACION_MAXIMA * tasaCancelacion)

  return {
    promedio,
    score: redondear(score),
    cantidadCalificaciones,
    trabajosCompletados,
    cancelaciones,
    tasaCancelacion: redondear(tasaCancelacion),
  }
}

// Reputación completa de un trabajador (empleados.id), para mostrar en el perfil.
async function obtenerReputacion(empleadoId) {
  const [{ data: calificaciones, error: errCal }, { data: trabajos, error: errTrab }] = await Promise.all([
    supabase.from('calificaciones')
      .select('puntaje, comentario, creado_en')
      .eq('calificado_id', empleadoId)
      .order('creado_en', { ascending: false }),
    supabase.from('trabajos')
      .select('estado, cancelado_por')
      .eq('trabajador_id', empleadoId)
      .in('estado', ['completado', 'cancelado']),
  ])

  if (errCal || errTrab) {
    const error = errCal ?? errTrab
    console.error(`Error calculando reputación (empleadoId=${empleadoId}): ${error.message ?? error}`)
    throw { status: 500, message: 'Error calculando la reputación' }
  }

  return {
    ...calcularDesdeDatos(calificaciones ?? [], trabajos ?? []),
    ultimasCalificaciones: (calificaciones ?? []).slice(0, ULTIMAS_CALIFICACIONES),
  }
}

// Score de varios trabajadores a la vez (para ordenar candidatos en el matching
// sin hacer dos queries por candidato). Devuelve { [empleadoId]: reputación }.
async function obtenerReputaciones(empleadoIds) {
  const resultado = {}
  if (!empleadoIds.length) return resultado

  const [{ data: calificaciones, error: errCal }, { data: trabajos, error: errTrab }] = await Promise.all([
    supabase.from('calificaciones').select('calificado_id, puntaje, creado_en').in('calificado_id', empleadoIds),
    supabase.from('trabajos').select('trabajador_id, estado, cancelado_por')
      .in('trabajador_id', empleadoIds).in('estado', ['completado', 'cancelado']),
  ])

  if (errCal || errTrab) {
    const error = errCal ?? errTrab
    console.error(`Error calculando reputaciones en lote: ${error.message ?? error}`)
    throw { status: 500, message: 'Error calculando la reputación' }
  }

  for (const id of empleadoIds) {
    resultado[id] = calcularDesdeDatos(
      (calificaciones ?? []).filter(c => c.calificado_id === id),
      (trabajos ?? []).filter(t => t.trabajador_id === id),
    )
  }
  return resultado
}

// Recalcula y guarda el promedio simple en empleados.reputacion. Se llama al
// recibir una calificación. Devuelve la reputación completa.
async function actualizarReputacion(empleadoId) {
  const reputacion = await obtenerReputacion(empleadoId)
  const { error } = await supabase
    .from('empleados').update({ reputacion: reputacion.promedio }).eq('id', empleadoId)
  if (error) console.error(`Error guardando reputación (empleadoId=${empleadoId}): ${error.message ?? error}`)
  return reputacion
}

module.exports = {
  calcularDesdeDatos, obtenerReputacion, obtenerReputaciones, actualizarReputacion,
  PROMEDIO_PREVIO, PESO_PREVIO, VIDA_MEDIA_DIAS, PENALIZACION_MAXIMA,
}
