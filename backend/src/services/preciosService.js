const jwt = require('jsonwebtoken')
const supabase = require('../config/supabase')
const { buscarTrabajadoresCerca } = require('./matchingService')
const { calcularDistanciaKm } = require('../utils/haversine')

// ── Tarifas ──────────────────────────────────────────────────────────────────
// El precio lo fija el backend (antes lo mandaba la app y se guardaba tal cual).
//
//   precio = redondear_a_100( base_categoría × dificultad × demanda × horario )
//
// El empleador paga `precio`; la comisión se le descuenta al trabajador.

const BASE_POR_CATEGORIA = {
  Limpieza: 3000,
  Jardín:   3500,
  Pintura:  5000,
  Plomería: 5500,
  Mudanza:  6000,
  Otros:    3000,
}

// Mismas etiquetas que manda AppEmployer (DIFICULTADES en ofrecer.tsx).
const MULTIPLICADOR_DIFICULTAD = {
  Simple:     1.0,
  Intermedio: 1.6,
  Complejo:   2.5,
}

// Demanda: cuántos trabajos de la misma categoría hay esperando cerca, contra
// cuántos trabajadores libres de esa categoría hay en la zona.
const RADIO_DEMANDA_KM          = 10
const VENTANA_DEMANDA_MIN       = 60
const PENDIENTE_DEMANDA_POR_UNO = 0.25  // +25% por cada trabajo extra por trabajador
const TOPE_DEMANDA              = 1.5

// Horario: recargo de noche (22 a 7 hs) o domingo, en hora argentina.
const RECARGO_HORARIO = 1.2
const ZONA_HORARIA    = 'America/Argentina/Buenos_Aires'

// Comisión escalonada por precio: los trabajos chicos pagan proporcionalmente más.
const TRAMOS_COMISION = [
  { hasta: 5000,     porcentaje: 15 },
  { hasta: 10000,    porcentaje: 12 },
  { hasta: Infinity, porcentaje: 10 },
]

const VALIDEZ_COTIZACION = '10m'
const AUDIENCIA_COTIZACION = 'cotizacion'

const CATEGORIAS   = Object.keys(BASE_POR_CATEGORIA)
const DIFICULTADES = Object.keys(MULTIPLICADOR_DIFICULTAD)

// ── Cálculo puro (sin I/O) ───────────────────────────────────────────────────

function multiplicadorDemanda(trabajosPendientes, trabajadoresDisponibles) {
  // +1: el propio trabajo que se está cotizando también compite por trabajadores.
  const ratio = (trabajosPendientes + 1) / Math.max(trabajadoresDisponibles, 1)
  const mult  = 1 + PENDIENTE_DEMANDA_POR_UNO * (ratio - 1)
  return Math.min(Math.max(mult, 1), TOPE_DEMANDA)
}

function esHorarioConRecargo(fecha) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA_HORARIA, hour: 'numeric', hourCycle: 'h23', weekday: 'short',
  }).formatToParts(fecha)
  const hora = Number(partes.find((p) => p.type === 'hour').value)
  const dia  = partes.find((p) => p.type === 'weekday').value
  return dia === 'Sun' || hora >= 22 || hora < 7
}

function porcentajeComision(precio) {
  return TRAMOS_COMISION.find((t) => precio <= t.hasta).porcentaje
}

// Montos en pesos enteros: MP acepta decimales, pero redondear acá evita
// diferencias de centavos entre lo cobrado, lo reembolsado y lo liquidado.
function calcularPrecio({ categoria, nivelDificultad, trabajosPendientes, trabajadoresDisponibles, fecha = new Date() }) {
  const base       = BASE_POR_CATEGORIA[categoria]
  const dificultad = MULTIPLICADOR_DIFICULTAD[nivelDificultad]
  const demanda    = multiplicadorDemanda(trabajosPendientes, trabajadoresDisponibles)
  const horario    = esHorarioConRecargo(fecha) ? RECARGO_HORARIO : 1

  const precio             = Math.round((base * dificultad * demanda * horario) / 100) * 100
  const comisionPorcentaje = porcentajeComision(precio)
  const comisionMonto      = Math.round((precio * comisionPorcentaje) / 100)

  return {
    precio,
    comisionPorcentaje,
    comisionMonto,
    montoTrabajador: precio - comisionMonto,
    desglose: {
      base,
      multiplicadorDificultad: dificultad,
      multiplicadorDemanda:    Number(demanda.toFixed(2)),
      multiplicadorHorario:    horario,
      trabajosPendientes,
      trabajadoresDisponibles,
    },
  }
}

// ── Con datos reales ─────────────────────────────────────────────────────────

async function contarTrabajosPendientesCerca({ categoria, latitud, longitud }) {
  const desde = new Date(Date.now() - VENTANA_DEMANDA_MIN * 60 * 1000).toISOString()

  const { data, error } = await supabase
    .from('trabajos')
    .select('latitud, longitud')
    .eq('estado', 'pendiente')
    .eq('categoria', categoria)
    .gte('creado_en', desde)

  if (error) throw { status: 500, message: 'Error midiendo la demanda.' }

  return (data ?? []).filter((t) =>
    t.latitud != null && t.longitud != null &&
    calcularDistanciaKm(latitud, longitud, t.latitud, t.longitud) <= RADIO_DEMANDA_KM,
  ).length
}

async function cotizar({ categoria, nivelDificultad, latitud, longitud }) {
  const [trabajosPendientes, trabajadores] = await Promise.all([
    contarTrabajosPendientesCerca({ categoria, latitud, longitud }),
    buscarTrabajadoresCerca({ categoria, latitud, longitud }),
  ])

  return calcularPrecio({
    categoria, nivelDificultad,
    trabajosPendientes,
    trabajadoresDisponibles: trabajadores.length,
  })
}

// La cotización viaja firmada a la app y vuelve al crear el trabajo: así se
// cobra exactamente lo que el empleador vio, aunque la demanda cambie en el medio,
// y la app no puede inventar un precio.
function firmarCotizacion(usuarioId, datos, cotizacion) {
  const token = jwt.sign(
    { usuarioId, ...datos, ...cotizacion },
    process.env.JWT_SECRET,
    { expiresIn: VALIDEZ_COTIZACION, audience: AUDIENCIA_COTIZACION },
  )
  return { token, validaHasta: new Date(jwt.decode(token).exp * 1000).toISOString() }
}

// Tira si el token es inválido, expiró o es de otro usuario.
function verificarCotizacion(token, usuarioId) {
  const datos = jwt.verify(token, process.env.JWT_SECRET, { audience: AUDIENCIA_COTIZACION })
  if (datos.usuarioId !== usuarioId) throw new Error('La cotización es de otro usuario')
  return datos
}

module.exports = {
  CATEGORIAS, DIFICULTADES,
  calcularPrecio, cotizar, firmarCotizacion, verificarCotizacion,
}
