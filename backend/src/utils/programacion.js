// Trabajos programados: el empleador elige una fecha y hora futura para el trabajo.
//
// Acá están los límites de la fecha (se usan al crear y al reprogramar) y la regla de
// cuándo se publica (Sprint 6, ver jobs/activarProgramados.js).

// El pago tiene 30 min de plazo y después hay que encontrar a alguien: con menos
// de una hora de anticipación no tiene sentido programarlo.
const MIN_ANTICIPACION_MINUTOS = 60
const MAX_ANTICIPACION_DIAS    = 30

// Devuelve un mensaje de error para el usuario, o null si la fecha sirve.
function errorFechaProgramada(fecha, ahora = Date.now()) {
  const ms = new Date(fecha).getTime()
  if (Number.isNaN(ms)) return 'La fecha no es válida'
  if (ms < ahora + MIN_ANTICIPACION_MINUTOS * 60 * 1000) {
    return `Programalo con al menos ${MIN_ANTICIPACION_MINUTOS} minutos de anticipación`
  }
  if (ms > ahora + MAX_ANTICIPACION_DIAS * 24 * 60 * 60 * 1000) {
    return `Se puede programar hasta ${MAX_ANTICIPACION_DIAS} días hacia adelante`
  }
  return null
}

// Sprint 6 — cuánto antes de la fecha se le muestra el trabajo a los trabajadores.
// Es la misma anticipación mínima para programar: el trabajador tiene que verlo,
// aceptarlo (ventana de 15 min + reintentos) y llegar.
const ANTICIPACION_PUBLICACION_MINUTOS = MIN_ANTICIPACION_MINUTOS

// Con el pago acreditado, ¿el trabajo se publica ya ('pendiente') o espera su fecha
// ('programado')? Inmediato o fecha cercana → se publica.
function estadoAlPublicar(programadoPara, ahora = Date.now()) {
  if (!programadoPara) return 'pendiente'
  const falta = new Date(programadoPara).getTime() - ahora
  return falta > ANTICIPACION_PUBLICACION_MINUTOS * 60 * 1000 ? 'programado' : 'pendiente'
}

module.exports = {
  MIN_ANTICIPACION_MINUTOS, MAX_ANTICIPACION_DIAS, ANTICIPACION_PUBLICACION_MINUTOS,
  errorFechaProgramada, estadoAlPublicar,
}
