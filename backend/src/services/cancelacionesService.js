const supabase = require('../config/supabase')

// Sprint 6 — cancelaciones con motivo y consecuencias para quien cancela.
//
// Cada cancelación hecha por una persona (no las automáticas del sistema) deja una
// fila en la tabla `cancelaciones` con un PESO: cuánto cuenta en contra de quien
// canceló. Ese peso tiene dos consecuencias:
//
//   1. Score: la tasa de cancelación de reputacionService deja de contar
//      cancelaciones "a secas" y pasa a sumar sus pesos. Afecta al trabajador
//      (score con el que lo ordena el matching) y, desde este sprint, también al
//      empleador (score que ve el trabajador antes de aceptar).
//   2. Bloqueo temporal: si alguien suma LIMITE_PESO_SEMANAL en los últimos 7 días,
//      no puede aceptar (trabajador) / publicar (empleador) trabajos durante
//      HORAS_BLOQUEO desde su última cancelación.
//
// Cómo se calcula el peso:
//   · 0    → se canceló un trabajo que nadie había aceptado (pendiente/programado):
//            no se perjudicó a nadie. Se registra igual, para tener el motivo.
//   · 0.5  → se canceló dentro de los MINUTOS_GRACIA de aceptado: el trabajador
//            todavía no salió para allá (el "me equivoqué de trabajo").
//   · 1    → cancelación normal de un trabajo asignado.
//   · 1.5  → cancelación tardía: trabajo programado al que le faltan menos de
//            HORAS_CANCELACION_TARDIA para empezar. La otra parte ya se organizó.

const MINUTOS_GRACIA            = 2
const HORAS_CANCELACION_TARDIA  = 2
const LIMITE_PESO_SEMANAL       = 3
const HORAS_BLOQUEO             = 24
const DIAS_VENTANA_BLOQUEO      = 7
const MAX_LARGO_DETALLE         = 300
const MIN_LARGO_DETALLE_OTRO    = 5

const PESO_SIN_ASIGNAR = 0
const PESO_GRACIA      = 0.5
const PESO_NORMAL      = 1
const PESO_TARDIA      = 1.5

const MS_POR_MINUTO = 60 * 1000
const MS_POR_HORA   = 60 * MS_POR_MINUTO
const MS_POR_DIA    = 24 * MS_POR_HORA

// Lista cerrada de motivos por rol: así se pueden contar/analizar (texto libre no),
// y el "otro" obliga a escribir el detalle.
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

// Valida { motivo, detalle } del body. Devuelve { codigo, detalle, texto } o tira
// { status: 400, message }. `texto` es lo que se guarda en trabajos.motivo_cancelacion.
function validarMotivo(rol, motivo, detalle) {
  const motivos = MOTIVOS_CANCELACION[rol]
  if (!motivo || !Object.hasOwn(motivos, motivo)) {
    throw { status: 400, message: `Elegí un motivo de cancelación válido: ${Object.keys(motivos).join(', ')}` }
  }
  if (detalle != null && typeof detalle !== 'string') {
    throw { status: 400, message: 'El detalle tiene que ser texto' }
  }
  const detalleLimpio = detalle?.trim() || null
  if (detalleLimpio && detalleLimpio.length > MAX_LARGO_DETALLE) {
    throw { status: 400, message: `El detalle puede tener hasta ${MAX_LARGO_DETALLE} caracteres` }
  }
  if (motivo === 'otro' && (!detalleLimpio || detalleLimpio.length < MIN_LARGO_DETALLE_OTRO)) {
    throw { status: 400, message: 'Si el motivo es "Otro", contanos brevemente qué pasó' }
  }
  return {
    codigo: motivo,
    detalle: detalleLimpio,
    texto: detalleLimpio ? `${motivos[motivo]}: ${detalleLimpio}` : motivos[motivo],
  }
}

// Cálculo puro del peso (ver tabla arriba). `ahora` es inyectable para poder probarlo.
function calcularPeso({ estadoPrevio, asignadoEn, fechaProgramada }, ahora = Date.now()) {
  if (estadoPrevio !== 'asignado') return PESO_SIN_ASIGNAR

  if (fechaProgramada) {
    const faltaMs = new Date(fechaProgramada).getTime() - ahora
    if (faltaMs < HORAS_CANCELACION_TARDIA * MS_POR_HORA) return PESO_TARDIA
  }

  if (asignadoEn && ahora - new Date(asignadoEn).getTime() <= MINUTOS_GRACIA * MS_POR_MINUTO) {
    return PESO_GRACIA
  }

  return PESO_NORMAL
}

// Inserta la fila en `cancelaciones`. Si falla, solo loguea: el trabajo ya quedó
// cancelado y no queremos devolverle un 500 al usuario por la penalización.
async function registrarCancelacion({ trabajoId, rol, usuarioId, perfilId, estadoPrevio, codigo, detalle, peso }) {
  const { error } = await supabase.from('cancelaciones').insert({
    trabajo_id:    trabajoId,
    cancelado_por: rol,
    usuario_id:    usuarioId,
    perfil_id:     perfilId,
    estado_previo: estadoPrevio,
    motivo_codigo: codigo,
    detalle,
    peso,
  })
  if (error) {
    console.error(`Error registrando cancelación (trabajoId=${trabajoId}, rol=${rol}): ${error.message ?? error}`)
  }
}

// ¿Este usuario está bloqueado por cancelar demasiado? Devuelve
// { bloqueado, hasta, pesoSemana, limite }. Si la consulta falla NO bloquea
// (fail-open): preferimos dejar pasar a alguien antes que trabar a todos por un error.
async function verificarBloqueo(rol, perfilId, ahora = Date.now()) {
  const desde = new Date(ahora - DIAS_VENTANA_BLOQUEO * MS_POR_DIA).toISOString()

  const { data, error } = await supabase
    .from('cancelaciones')
    .select('peso, creado_en')
    .eq('cancelado_por', rol)
    .eq('perfil_id', perfilId)
    .gte('creado_en', desde)
    .order('creado_en', { ascending: false })

  if (error) {
    console.error(`Error verificando bloqueo por cancelaciones (rol=${rol}, perfilId=${perfilId}): ${error.message ?? error}`)
    return { bloqueado: false, hasta: null, pesoSemana: 0, limite: LIMITE_PESO_SEMANAL }
  }

  const pesoSemana = (data ?? []).reduce((s, c) => s + Number(c.peso), 0)
  if (pesoSemana < LIMITE_PESO_SEMANAL || !data.length) {
    return { bloqueado: false, hasta: null, pesoSemana, limite: LIMITE_PESO_SEMANAL }
  }

  const hasta = new Date(new Date(data[0].creado_en).getTime() + HORAS_BLOQUEO * MS_POR_HORA)
  return {
    bloqueado: hasta.getTime() > ahora,
    hasta: hasta.toISOString(),
    pesoSemana,
    limite: LIMITE_PESO_SEMANAL,
  }
}

module.exports = {
  MOTIVOS_CANCELACION, validarMotivo, calcularPeso, registrarCancelacion, verificarBloqueo,
  MINUTOS_GRACIA, HORAS_CANCELACION_TARDIA, LIMITE_PESO_SEMANAL, HORAS_BLOQUEO,
  PESO_SIN_ASIGNAR, PESO_GRACIA, PESO_NORMAL, PESO_TARDIA,
}
