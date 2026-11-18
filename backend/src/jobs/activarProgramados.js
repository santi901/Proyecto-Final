const supabase = require('../config/supabase')
const { notificarEmpleador, notificarNuevoTrabajo } = require('../services/notificacionesService')

// Sprint 6 — trabajos programados.
//
// Un trabajo programado se crea con estado 'programado' y una fecha_programada
// futura. Mientras está así no lo ve ningún trabajador y no se notifica a nadie.
// ANTICIPACION_MINUTOS antes de la fecha, este poller lo "activa": lo pasa a
// 'pendiente' con una ventana de solicitud nueva y dispara la notificación a los
// candidatos, exactamente como si el empleador lo acabara de publicar. De ahí en
// más sigue el flujo de siempre (aceptar → PIN → completar) y, si nadie lo toma,
// lo agarra el poller de reasignación (reasignarTrabajos.js).
//
// Por qué se activa ANTES de la fecha y no justo a la hora: el trabajador tiene que
// aceptarlo y llegar. Con una hora de margen hay tiempo para la ventana de 15 min
// de solicitud + algún reintento + el viaje.
//
// Por qué un setInterval en el mismo proceso (igual que reasignarTrabajos.js) y no
// node-cron / pg_cron / una cola: no suma dependencias ni infraestructura, y con
// una sola instancia del backend alcanza. Igual es seguro con varias instancias:
// el UPDATE es condicional (`.eq('estado', 'programado')`), así que si dos procesos
// agarran el mismo trabajo, solo uno lo actualiza y solo ese notifica.

const INTERVALO_MS          = 60 * 1000 // cada cuánto se revisa (la precisión es de ~1 minuto)
const ANTICIPACION_MINUTOS  = 60        // cuánto antes de la fecha se publica a los trabajadores
const VENTANA_SOLICITUD_MIN = 15        // misma ventana que un trabajo inmediato
const TOLERANCIA_ATRASO_MINUTOS = 30    // si la fecha ya pasó hace más que esto, se cancela

async function activarProgramadosVencidos(ahora = new Date()) {
  const limite = new Date(ahora.getTime() + ANTICIPACION_MINUTOS * 60 * 1000)

  const { data: listos, error } = await supabase
    .from('trabajos')
    .select('id, titulo, categoria, empleador_id, fecha_programada')
    .eq('estado', 'programado')
    .lte('fecha_programada', limite.toISOString())

  if (error) {
    console.error(`Error buscando trabajos programados para activar: ${error.message ?? error}`)
    return
  }

  for (const trabajo of listos ?? []) {
    const atrasoMs = ahora.getTime() - new Date(trabajo.fecha_programada).getTime()
    if (atrasoMs > TOLERANCIA_ATRASO_MINUTOS * 60 * 1000) {
      await cancelarPorVencido(trabajo, ahora)
    } else {
      await activarTrabajo(trabajo, ahora)
    }
  }
}

// Caso borde: el backend estuvo apagado y la hora del trabajo ya pasó hace rato.
// Publicarlo ahora sería mandar a alguien a un trabajo que ya no se espera: se
// cancela (por el sistema, no penaliza a nadie) y se le avisa al empleador.
async function cancelarPorVencido(trabajo, ahora) {
  const { data: actualizados, error } = await supabase
    .from('trabajos')
    .update({
      estado:                    'cancelado',
      cancelado_por:             'sistema',
      cancelado_en:              ahora.toISOString(),
      motivo_cancelacion:        'La fecha programada pasó sin que se pudiera publicar el trabajo',
      motivo_cancelacion_codigo: 'programado_vencido',
    })
    .eq('id', trabajo.id)
    .eq('estado', 'programado')
    .select('id')

  if (error) {
    console.error(`Error cancelando programado vencido (trabajoId=${trabajo.id}): ${error.message ?? error}`)
    return
  }
  if (!actualizados?.length) return

  console.error(`Trabajo programado vencido sin activar, se canceló (trabajoId=${trabajo.id}, fecha=${trabajo.fecha_programada}).`)

  notificarEmpleador(trabajo.empleador_id, {
    tipo:      'cambio_estado',
    titulo:    'Trabajo programado cancelado',
    mensaje:   `No pudimos publicar "${trabajo.titulo}" a tiempo para la fecha que elegiste. Publicalo de nuevo.`,
    trabajoId: trabajo.id,
  })
}

async function activarTrabajo(trabajo, ahora) {
  const expira = new Date(ahora.getTime() + VENTANA_SOLICITUD_MIN * 60 * 1000)

  // Condicional sobre el estado: si el empleador lo canceló justo ahora, o lo
  // activó otra instancia, no se toca (y `data` viene vacío).
  const { data: actualizados, error } = await supabase
    .from('trabajos')
    .update({
      estado:                'pendiente',
      activado_en:           ahora.toISOString(),
      solicitud_expira_en:   expira.toISOString(),
      intentos_reasignacion: 0,
    })
    .eq('id', trabajo.id)
    .eq('estado', 'programado')
    .select('id')

  if (error) {
    console.error(`Error activando trabajo programado (trabajoId=${trabajo.id}): ${error.message ?? error}`)
    return
  }
  if (!actualizados?.length) return

  console.log(`Trabajo programado activado (trabajoId=${trabajo.id}, fecha=${trabajo.fecha_programada}).`)

  notificarNuevoTrabajo(trabajo)
  notificarEmpleador(trabajo.empleador_id, {
    tipo:      'cambio_estado',
    titulo:    'Buscando trabajador',
    mensaje:   `Ya estamos buscando trabajador para "${trabajo.titulo}".`,
    trabajoId: trabajo.id,
  })
}

function iniciarActivacionProgramados() {
  const correr = () => activarProgramadosVencidos().catch((error) => {
    console.error('Error activando trabajos programados:', error.message ?? error)
  })
  // Una pasada al arrancar: si el server estuvo caído, se activa lo atrasado.
  correr()
  setInterval(correr, INTERVALO_MS)
}

module.exports = {
  iniciarActivacionProgramados, activarProgramadosVencidos,
  ANTICIPACION_MINUTOS,
}
