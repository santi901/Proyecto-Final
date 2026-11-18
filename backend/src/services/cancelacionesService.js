const supabase = require('../config/supabase')
const { faltaMigracion } = require('./cuentasService')

// Sprint 6 — cancelaciones con motivo y consecuencias para quien cancela.
//
// Cada cancelación hecha por una persona (no las automáticas del sistema) deja una
// fila en la tabla `cancelaciones` con un PESO: cuánto cuenta en contra de quien
// canceló. Ese peso tiene dos consecuencias:
//
//   1. Score: la tasa de cancelación de reputacionService suma pesos en vez de contar
//      cancelaciones. Afecta al trabajador (el score con el que lo ordena el matching)
//      y al empleador (score propio que el trabajador ve antes de aceptar).
//   2. Bloqueo temporal: si alguien suma LIMITE_PESO_SEMANAL en los últimos 7 días, no
//      puede aceptar (trabajador) / publicar (empleador) trabajos durante HORAS_BLOQUEO
//      desde su última cancelación.
//
// Pesos:
//   · 0    → nadie lo había aceptado (pago_pendiente/programado/pendiente): no se
//            perjudicó a nadie. Se registra igual, para tener el motivo.
//   · 0.5  → dentro de VENTANA_GRACIA_SEG desde que el trabajador aceptó. Es la misma
//            ventana en la que pagosService devuelve el 100% al empleador: una sola
//            regla de "arrepentimiento" para la plata y para el score.
//   · 1    → cancelación normal de un trabajo asignado.
//   · 1.5  → tardía: trabajo programado al que le faltan menos de HORAS_CANCELACION_TARDIA.
//
// Igual que las columnas de suspensión (cuentasService), si la tabla no existe en la base
// (no se corrió migrations/sprint6_programados_cancelaciones_disputas.sql) nada se rompe:
// no se registra, no se bloquea y la reputación cuenta las cancelaciones como antes.

const VENTANA_GRACIA_SEG        = 90
const HORAS_CANCELACION_TARDIA  = 2
const LIMITE_PESO_SEMANAL       = 3
const HORAS_BLOQUEO             = 24
const DIAS_VENTANA_BLOQUEO      = 7

const PESO_SIN_ASIGNAR = 0
const PESO_GRACIA      = 0.5
const PESO_NORMAL      = 1
const PESO_TARDIA      = 1.5

const MS_POR_HORA = 60 * 60 * 1000
const MS_POR_DIA  = 24 * MS_POR_HORA

// Lista cerrada por rol: se pueden contar/analizar (texto libre no). 'otro' exige detalle.
const MOTIVOS_CANCELACION = {
  empleado: {
    emergencia:          'Tuve una emergencia',
    problema_transporte: 'Problema con el transporte',
    no_llego_a_tiempo:   'No llego a tiempo',
    trabajo_distinto:    'El trabajo no es lo que decía la publicación',
    me_equivoque:        'Lo acepté por error',
    otro:                'Otro motivo',
  },
  empleador: {
    ya_no_lo_necesito:      'Ya no lo necesito',
    lo_resolvi:             'Lo resolví de otra forma',
    cambio_de_fecha:        'Necesito cambiar la fecha',
    trabajador_no_responde: 'El trabajador no responde',
    error_al_publicar:      'Me equivoqué al publicarlo',
    otro:                   'Otro motivo',
  },
}

// La forma (motivo string, detalle string ≤ 300) ya la valida zod (esquemas.cancelar).
// Acá va lo que depende del rol. Devuelve { codigo, detalle, texto } o tira { status, message }.
function validarMotivo(rol, motivo, detalle) {
  const motivos = MOTIVOS_CANCELACION[rol]
  if (!Object.hasOwn(motivos, motivo)) {
    throw { status: 400, message: `Elegí un motivo de cancelación válido: ${Object.keys(motivos).join(', ')}` }
  }
  const detalleLimpio = detalle?.trim() || null
  if (motivo === 'otro' && (!detalleLimpio || detalleLimpio.length < 5)) {
    throw { status: 400, message: 'Si el motivo es "Otro", contanos brevemente qué pasó' }
  }
  return {
    codigo:  motivo,
    detalle: detalleLimpio,
    texto:   detalleLimpio ? `${motivos[motivo]}: ${detalleLimpio}` : motivos[motivo],
  }
}

// Cálculo puro del peso (tabla de arriba). `ahora` inyectable para probarlo.
function calcularPeso({ estadoPrevio, asignadoEn, programadoPara }, ahora = Date.now()) {
  if (estadoPrevio !== 'asignado') return PESO_SIN_ASIGNAR

  if (programadoPara && new Date(programadoPara).getTime() - ahora < HORAS_CANCELACION_TARDIA * MS_POR_HORA) {
    return PESO_TARDIA
  }
  if (asignadoEn && (ahora - new Date(asignadoEn).getTime()) / 1000 <= VENTANA_GRACIA_SEG) {
    return PESO_GRACIA
  }
  return PESO_NORMAL
}

let avisoMostrado = false
function avisarFaltaTabla(error) {
  if (avisoMostrado) return
  avisoMostrado = true
  console.error(`Falta la tabla cancelaciones en Supabase (${error.message}): las cancelaciones no se ponderan ni bloquean. Correr migrations/sprint6_programados_cancelaciones_disputas.sql.`)
}

// Inserta la fila. Si falla, solo loguea: el trabajo ya quedó cancelado.
async function registrarCancelacion({ trabajoId, rol, usuarioId, perfilId, estadoPrevio, codigo, detalle, peso }) {
  const { error } = await supabase.from('cancelaciones').insert({
    trabajo_id: trabajoId, cancelado_por: rol, usuario_id: usuarioId, perfil_id: perfilId,
    estado_previo: estadoPrevio, motivo_codigo: codigo, detalle, peso,
  })
  if (!error) return
  if (faltaMigracion(error)) avisarFaltaTabla(error)
  else console.error(`Error registrando cancelación (trabajoId=${trabajoId}, rol=${rol}): ${error.message ?? error}`)
}

// Pesos de cancelación por perfil: { [perfilId]: [{ peso }] }, o null si la tabla no
// existe (para que reputacionService use el conteo viejo).
async function pesosPorPerfil(rol, perfilIds) {
  const { data, error } = await supabase
    .from('cancelaciones').select('perfil_id, peso').eq('cancelado_por', rol).in('perfil_id', perfilIds)
  if (error) {
    if (faltaMigracion(error)) { avisarFaltaTabla(error); return null }
    throw error
  }
  const resultado = Object.fromEntries(perfilIds.map(id => [id, []]))
  for (const c of data ?? []) resultado[c.perfil_id]?.push(c)
  return resultado
}

// ¿Bloqueado por cancelar demasiado? { bloqueado, hasta, pesoSemana, limite }.
// Ante cualquier error NO bloquea (fail-open): mejor dejar pasar a alguien que trabar
// a todos por una falla de la base — mismo criterio que la suspensión de cuentas.
async function verificarBloqueo(rol, perfilId, ahora = Date.now()) {
  const sinBloqueo = { bloqueado: false, hasta: null, pesoSemana: 0, limite: LIMITE_PESO_SEMANAL }

  const { data, error } = await supabase
    .from('cancelaciones')
    .select('peso, creado_en')
    .eq('cancelado_por', rol)
    .eq('perfil_id', perfilId)
    .gte('creado_en', new Date(ahora - DIAS_VENTANA_BLOQUEO * MS_POR_DIA).toISOString())
    .order('creado_en', { ascending: false })

  if (error) {
    if (faltaMigracion(error)) avisarFaltaTabla(error)
    else console.error(`Error verificando bloqueo por cancelaciones (rol=${rol}, perfilId=${perfilId}): ${error.message ?? error}`)
    return sinBloqueo
  }

  const pesoSemana = (data ?? []).reduce((s, c) => s + Number(c.peso), 0)
  if (pesoSemana < LIMITE_PESO_SEMANAL || !data.length) return { ...sinBloqueo, pesoSemana }

  const hasta = new Date(new Date(data[0].creado_en).getTime() + HORAS_BLOQUEO * MS_POR_HORA)
  return { bloqueado: hasta.getTime() > ahora, hasta: hasta.toISOString(), pesoSemana, limite: LIMITE_PESO_SEMANAL }
}

module.exports = {
  MOTIVOS_CANCELACION, validarMotivo, calcularPeso, registrarCancelacion, pesosPorPerfil, verificarBloqueo,
  VENTANA_GRACIA_SEG, HORAS_CANCELACION_TARDIA, LIMITE_PESO_SEMANAL, HORAS_BLOQUEO,
  PESO_SIN_ASIGNAR, PESO_GRACIA, PESO_NORMAL, PESO_TARDIA,
}
