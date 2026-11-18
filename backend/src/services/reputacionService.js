const supabase = require('../config/supabase')

// Sprint 5 — reputación del trabajador (+ Sprint 6: penalización ponderada por
// cancelaciones y score del empleador).
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
//     3. Tasa de cancelación: pesoCancelaciones / (completados + pesoCancelaciones).
//        El score se multiplica por (1 - PENALIZACION_MAXIMA × tasa): con 100% de
//        cancelaciones el score queda a la mitad. Sprint 6: ya no se cuentan las
//        cancelaciones "a secas" sino la suma de sus pesos (tabla `cancelaciones`,
//        ver cancelacionesService.js): una tardía pesa 1.5, una dentro de los 2
//        minutos de aceptar 0.5. Solo cuentan las del propio trabajador.
//
//     score = promedioBayesianoPonderado × (1 − 0.5 × tasaCancelacion)
//
// Empleador (Sprint 6): a los empleadores no se los califica, así que su score
// arranca en SCORE_MAXIMO_EMPLEADOR (5) y solo lo bajan sus propias cancelaciones,
// con la misma fórmula de tasa. El trabajador lo ve antes de aceptar un trabajo.

const PROMEDIO_PREVIO     = 3
const PESO_PREVIO         = 2
const VIDA_MEDIA_DIAS     = 180
const PENALIZACION_MAXIMA = 0.5
const ULTIMAS_CALIFICACIONES = 5
const SCORE_MAXIMO_EMPLEADOR = 5

const MS_POR_DIA = 24 * 60 * 60 * 1000

function redondear(n) {
  return Math.round(n * 100) / 100
}

// Tasa de cancelación ponderada. `cancelaciones` = filas de la tabla con { peso }.
function calcularTasaCancelacion(trabajosCompletados, cancelaciones) {
  const pesoCancelaciones = cancelaciones.reduce((s, c) => s + Number(c.peso), 0)
  const base = trabajosCompletados + pesoCancelaciones
  return {
    pesoCancelaciones: redondear(pesoCancelaciones),
    // Solo las que penalizan (peso > 0): cancelar algo que nadie aceptó no cuenta.
    cancelaciones: cancelaciones.filter(c => Number(c.peso) > 0).length,
    tasaCancelacion: base ? pesoCancelaciones / base : 0,
  }
}

// Cálculo puro (sin base de datos), para poder reusarlo en lote desde el matching.
//   calificaciones: [{ puntaje, creado_en }]
//   trabajos:       [{ estado }]   (los del trabajador)
//   cancelaciones:  [{ peso }]     (las que hizo el trabajador)
function calcularDesdeDatos(calificaciones, trabajos, cancelaciones = [], ahora = Date.now()) {
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
  const tasa = calcularTasaCancelacion(trabajosCompletados, cancelaciones)

  const score = promedioBayesiano * (1 - PENALIZACION_MAXIMA * tasa.tasaCancelacion)

  return {
    promedio,
    score: redondear(score),
    cantidadCalificaciones,
    trabajosCompletados,
    cancelaciones: tasa.cancelaciones,
    pesoCancelaciones: tasa.pesoCancelaciones,
    tasaCancelacion: redondear(tasa.tasaCancelacion),
  }
}

// Reputación completa de un trabajador (empleados.id), para mostrar en el perfil.
async function obtenerReputacion(empleadoId) {
  const [
    { data: calificaciones, error: errCal },
    { data: trabajos, error: errTrab },
    { data: cancelaciones, error: errCanc },
  ] = await Promise.all([
    supabase.from('calificaciones')
      .select('puntaje, comentario, creado_en')
      .eq('calificado_id', empleadoId)
      .order('creado_en', { ascending: false }),
    supabase.from('trabajos')
      .select('estado')
      .eq('trabajador_id', empleadoId)
      .eq('estado', 'completado'),
    supabase.from('cancelaciones')
      .select('peso')
      .eq('cancelado_por', 'empleado')
      .eq('perfil_id', empleadoId),
  ])

  if (errCal || errTrab || errCanc) {
    const error = errCal ?? errTrab ?? errCanc
    console.error(`Error calculando reputación (empleadoId=${empleadoId}): ${error.message ?? error}`)
    throw { status: 500, message: 'Error calculando la reputación' }
  }

  return {
    ...calcularDesdeDatos(calificaciones ?? [], trabajos ?? [], cancelaciones ?? []),
    ultimasCalificaciones: (calificaciones ?? []).slice(0, ULTIMAS_CALIFICACIONES),
  }
}

// Score de varios trabajadores a la vez (para ordenar candidatos en el matching
// sin hacer tres queries por candidato). Devuelve { [empleadoId]: reputación }.
async function obtenerReputaciones(empleadoIds) {
  const resultado = {}
  if (!empleadoIds.length) return resultado

  const [
    { data: calificaciones, error: errCal },
    { data: trabajos, error: errTrab },
    { data: cancelaciones, error: errCanc },
  ] = await Promise.all([
    supabase.from('calificaciones').select('calificado_id, puntaje, creado_en').in('calificado_id', empleadoIds),
    supabase.from('trabajos').select('trabajador_id, estado')
      .in('trabajador_id', empleadoIds).eq('estado', 'completado'),
    supabase.from('cancelaciones').select('perfil_id, peso')
      .eq('cancelado_por', 'empleado').in('perfil_id', empleadoIds),
  ])

  if (errCal || errTrab || errCanc) {
    const error = errCal ?? errTrab ?? errCanc
    console.error(`Error calculando reputaciones en lote: ${error.message ?? error}`)
    throw { status: 500, message: 'Error calculando la reputación' }
  }

  for (const id of empleadoIds) {
    resultado[id] = calcularDesdeDatos(
      (calificaciones ?? []).filter(c => c.calificado_id === id),
      (trabajos ?? []).filter(t => t.trabajador_id === id),
      (cancelaciones ?? []).filter(c => c.perfil_id === id),
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

// Sprint 6 — cálculo puro del score del empleador.
function calcularEmpleadorDesdeDatos(trabajos, cancelaciones) {
  const trabajosCompletados = trabajos.filter(t => t.estado === 'completado').length
  const tasa = calcularTasaCancelacion(trabajosCompletados, cancelaciones)
  return {
    score: redondear(SCORE_MAXIMO_EMPLEADOR * (1 - PENALIZACION_MAXIMA * tasa.tasaCancelacion)),
    trabajosCompletados,
    cancelaciones: tasa.cancelaciones,
    pesoCancelaciones: tasa.pesoCancelaciones,
    tasaCancelacion: redondear(tasa.tasaCancelacion),
  }
}

// Reputación de un empleador (perfiles.id).
async function obtenerReputacionEmpleador(perfilId) {
  const [{ data: trabajos, error: errTrab }, { data: cancelaciones, error: errCanc }] = await Promise.all([
    supabase.from('trabajos').select('estado').eq('empleador_id', perfilId).eq('estado', 'completado'),
    supabase.from('cancelaciones').select('peso').eq('cancelado_por', 'empleador').eq('perfil_id', perfilId),
  ])

  if (errTrab || errCanc) {
    const error = errTrab ?? errCanc
    console.error(`Error calculando reputación de empleador (perfilId=${perfilId}): ${error.message ?? error}`)
    throw { status: 500, message: 'Error calculando la reputación' }
  }

  return calcularEmpleadorDesdeDatos(trabajos ?? [], cancelaciones ?? [])
}

module.exports = {
  calcularDesdeDatos, obtenerReputacion, obtenerReputaciones, actualizarReputacion,
  calcularEmpleadorDesdeDatos, obtenerReputacionEmpleador, calcularTasaCancelacion,
  PROMEDIO_PREVIO, PESO_PREVIO, VIDA_MEDIA_DIAS, PENALIZACION_MAXIMA, SCORE_MAXIMO_EMPLEADOR,
}
