const supabase = require('../config/supabase')
const { pesosPorPerfil } = require('./cancelacionesService')

// Sprint 5 — reputación del trabajador (+ Sprint 6: cancelaciones ponderadas y score
// del empleador).
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
//        cancelaciones el score queda a la mitad. Solo cuentan las del propio
//        trabajador. Sprint 6: cada cancelación pesa según cuándo se hizo (tabla
//        `cancelaciones`, ver cancelacionesService.js: 0.5 en la ventana de gracia,
//        1 normal, 1.5 tardía). Si esa tabla no existe en la base, cada cancelación
//        del trabajador cuenta 1, como en el Sprint 5.
//
//     score = promedioBayesianoPonderado × (1 − 0.5 × tasaCancelacion)
//
// Empleador (Sprint 6): no se lo califica, así que su score arranca en
// SCORE_MAXIMO_EMPLEADOR y solo lo bajan sus cancelaciones, con la misma fórmula de
// tasa. El trabajador lo ve antes de aceptar.

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

// Tasa ponderada. `cancelaciones` = [{ peso }]; las de peso 0 no cuentan como cancelación.
function calcularTasaCancelacion(trabajosCompletados, cancelaciones) {
  const pesoCancelaciones = cancelaciones.reduce((s, c) => s + Number(c.peso), 0)
  const base = trabajosCompletados + pesoCancelaciones
  return {
    cancelaciones:     cancelaciones.filter(c => Number(c.peso) > 0).length,
    pesoCancelaciones: redondear(pesoCancelaciones),
    tasaCancelacion:   base ? pesoCancelaciones / base : 0,
  }
}

// Sin tabla `cancelaciones`: cada trabajo que canceló el trabajador pesa 1 (Sprint 5).
function cancelacionesDesdeTrabajos(trabajos) {
  return trabajos.filter(t => t.estado === 'cancelado' && t.cancelado_por === 'empleado').map(() => ({ peso: 1 }))
}

// Cálculo puro (sin base de datos), para poder reusarlo en lote desde el matching.
//   calificaciones: [{ puntaje, creado_en }]
//   trabajos:       [{ estado, cancelado_por }] del trabajador
//   cancelaciones:  [{ peso }] hechas por el trabajador, o null → se deducen de `trabajos`
function calcularDesdeDatos(calificaciones, trabajos, cancelaciones = null, ahora = Date.now()) {
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
  const tasa = calcularTasaCancelacion(trabajosCompletados, cancelaciones ?? cancelacionesDesdeTrabajos(trabajos))

  const score = promedioBayesiano * (1 - PENALIZACION_MAXIMA * tasa.tasaCancelacion)

  return {
    promedio,
    score: redondear(score),
    cantidadCalificaciones,
    trabajosCompletados,
    cancelaciones:     tasa.cancelaciones,
    pesoCancelaciones: tasa.pesoCancelaciones,
    tasaCancelacion:   redondear(tasa.tasaCancelacion),
  }
}

// Reputación completa de un trabajador (empleados.id), para mostrar en el perfil.
async function obtenerReputacion(empleadoId) {
  const reputaciones = await leerReputaciones([empleadoId], { conComentarios: true })
  return reputaciones[empleadoId]
}

// Score de varios trabajadores a la vez (para ordenar candidatos en el matching
// sin hacer queries por candidato). Devuelve { [empleadoId]: reputación }.
async function obtenerReputaciones(empleadoIds) {
  if (!empleadoIds.length) return {}
  return leerReputaciones(empleadoIds, { conComentarios: false })
}

async function leerReputaciones(empleadoIds, { conComentarios }) {
  let cancelaciones, calificaciones, trabajos
  try {
    const [cal, trab, canc] = await Promise.all([
      supabase.from('calificaciones')
        .select(conComentarios ? 'calificado_id, puntaje, comentario, creado_en' : 'calificado_id, puntaje, creado_en')
        .in('calificado_id', empleadoIds)
        .order('creado_en', { ascending: false }),
      supabase.from('trabajos').select('trabajador_id, estado, cancelado_por')
        .in('trabajador_id', empleadoIds).in('estado', ['completado', 'cancelado']),
      pesosPorPerfil('empleado', empleadoIds),
    ])
    if (cal.error || trab.error) throw cal.error ?? trab.error
    calificaciones = cal.data ?? []
    trabajos = trab.data ?? []
    cancelaciones = canc
  } catch (error) {
    console.error(`Error calculando reputación (empleadoIds=${empleadoIds.join(',')}): ${error.message ?? error}`)
    throw { status: 500, message: 'Error calculando la reputación' }
  }

  const resultado = {}
  for (const id of empleadoIds) {
    const propias = calificaciones.filter(c => c.calificado_id === id)
    resultado[id] = calcularDesdeDatos(propias, trabajos.filter(t => t.trabajador_id === id), cancelaciones?.[id] ?? null)
    if (conComentarios) {
      resultado[id].ultimasCalificaciones = propias.slice(0, ULTIMAS_CALIFICACIONES)
        .map(({ puntaje, comentario, creado_en }) => ({ puntaje, comentario, creado_en }))
    }
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

// ── Empleador (Sprint 6) ─────────────────────────────────────────────────────

function calcularEmpleadorDesdeDatos(trabajos, cancelaciones = null) {
  const trabajosCompletados = trabajos.filter(t => t.estado === 'completado').length
  const propias = cancelaciones
    ?? trabajos.filter(t => t.estado === 'cancelado' && t.cancelado_por === 'empleador' && t.trabajador_id).map(() => ({ peso: 1 }))
  const tasa = calcularTasaCancelacion(trabajosCompletados, propias)
  return {
    score: redondear(SCORE_MAXIMO_EMPLEADOR * (1 - PENALIZACION_MAXIMA * tasa.tasaCancelacion)),
    trabajosCompletados,
    cancelaciones:     tasa.cancelaciones,
    pesoCancelaciones: tasa.pesoCancelaciones,
    tasaCancelacion:   redondear(tasa.tasaCancelacion),
  }
}

// { [perfilId]: reputación } de varios empleadores (perfiles.id). Si algo falla, null:
// es información de contexto para el trabajador, no tiene que romper el listado.
async function obtenerReputacionesEmpleadores(perfilIds) {
  const ids = [...new Set(perfilIds.filter(Boolean))]
  if (!ids.length) return {}
  try {
    const [trab, canc] = await Promise.all([
      supabase.from('trabajos').select('empleador_id, trabajador_id, estado, cancelado_por')
        .in('empleador_id', ids).in('estado', ['completado', 'cancelado']),
      pesosPorPerfil('empleador', ids),
    ])
    if (trab.error) throw trab.error
    return Object.fromEntries(ids.map(id => [id, calcularEmpleadorDesdeDatos(
      (trab.data ?? []).filter(t => t.empleador_id === id),
      canc?.[id] ?? null,
    )]))
  } catch (error) {
    console.error(`Error calculando reputación de empleadores: ${error.message ?? error}`)
    return Object.fromEntries(ids.map(id => [id, null]))
  }
}

module.exports = {
  calcularDesdeDatos, obtenerReputacion, obtenerReputaciones, actualizarReputacion,
  calcularEmpleadorDesdeDatos, obtenerReputacionesEmpleadores, calcularTasaCancelacion,
  PROMEDIO_PREVIO, PESO_PREVIO, VIDA_MEDIA_DIAS, PENALIZACION_MAXIMA, SCORE_MAXIMO_EMPLEADOR,
}
