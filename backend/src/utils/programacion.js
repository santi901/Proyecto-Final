// Trabajos programados: el empleador elige una fecha y hora futura para el trabajo.
//
// Acá solo están los límites de la fecha (se usan al crear y al reprogramar). Qué
// pasa cuando llega esa fecha (activarlo, avisar, reabrir la búsqueda) no está
// implementado en esta parte: ver "Trabajos programados" en backend/CLAUDE.md.

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

module.exports = { MIN_ANTICIPACION_MINUTOS, MAX_ANTICIPACION_DIAS, errorFechaProgramada }
