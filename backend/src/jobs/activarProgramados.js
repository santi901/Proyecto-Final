const supabase = require('../config/supabase')
const { notificarEmpleador, notificarNuevoTrabajo } = require('../services/notificacionesService')
const { faltaMigracion } = require('../services/cuentasService')
const pagos = require('../services/pagosService')
const { emitirFinTrabajo } = require('../realtime/socket')
const { ANTICIPACION_PUBLICACION_MINUTOS } = require('../utils/programacion')

// Sprint 6 — activación de trabajos programados.
//
// Ciclo de un programado: se crea en 'pago_pendiente' como cualquier trabajo; cuando se
// acredita el pago, pagosService lo deja en 'programado' (pagado, esperando su fecha:
// nadie lo ve, nadie es notificado). Este poller, ANTICIPACION_PUBLICACION_MINUTOS antes
// de trabajos.programado_para, lo pasa a 'pendiente' con una ventana de solicitud nueva y
// notifica a los candidatos, igual que si se acabara de pagar. Desde ahí sigue el flujo de
// siempre (aceptar → PIN → completar) y, si nadie lo toma, lo agarra reasignarTrabajos.js.
//
// Por qué setInterval en el mismo proceso (como reasignarTrabajos.js) y no node-cron /
// pg_cron / una cola: no suma dependencias ni infraestructura y con una instancia alcanza.
// Igual es seguro con varias: cada UPDATE es condicional (.eq('estado', 'programado')),
// así que si dos procesos agarran el mismo trabajo solo uno lo actualiza y solo ese notifica.

const INTERVALO_MS              = 60 * 1000 // precisión de ~1 minuto
const MINUTOS_SOLICITUD         = 15        // misma ventana que un trabajo recién pagado
const TOLERANCIA_ATRASO_MINUTOS = 30        // fecha pasada hace más que esto → se cancela

async function activarProgramadosVencidos(ahora = new Date()) {
  const limite = new Date(ahora.getTime() + ANTICIPACION_PUBLICACION_MINUTOS * 60 * 1000)

  const { data: listos, error } = await supabase
    .from('trabajos')
    .select('id, titulo, categoria, empleador_id, programado_para')
    .eq('estado', 'programado')
    .lte('programado_para', limite.toISOString())

  if (error) {
    // Base sin la migración del Sprint 6: no hay programados que activar, no es un error.
    if (!faltaMigracion(error) && error.code !== '22P02') {
      console.error(`Error buscando trabajos programados para activar: ${error.message ?? error}`)
    }
    return
  }

  for (const trabajo of listos ?? []) {
    const atrasoMs = ahora.getTime() - new Date(trabajo.programado_para).getTime()
    if (atrasoMs > TOLERANCIA_ATRASO_MINUTOS * 60 * 1000) await cancelarPorVencido(trabajo, ahora)
    else await activarTrabajo(trabajo, ahora)
  }
}

async function activarTrabajo(trabajo, ahora) {
  const cambios = {
    estado:                'pendiente',
    solicitud_expira_en:   new Date(ahora.getTime() + MINUTOS_SOLICITUD * 60 * 1000).toISOString(),
    intentos_reasignacion: 0,
    activado_en:           ahora.toISOString(),
  }
  const actualizar = () => supabase
    .from('trabajos').update(cambios).eq('id', trabajo.id).eq('estado', 'programado').select('id')

  let { data: actualizados, error } = await actualizar()
  if (error && faltaMigracion(error)) {  // sin la columna activado_en
    delete cambios.activado_en;
    ({ data: actualizados, error } = await actualizar())
  }
  if (error) {
    console.error(`Error activando trabajo programado (trabajoId=${trabajo.id}): ${error.message ?? error}`)
    return
  }
  if (!actualizados?.length) return  // lo canceló el empleador o lo activó otra instancia

  console.log(`Trabajo programado activado (trabajoId=${trabajo.id}, programado_para=${trabajo.programado_para}).`)

  notificarNuevoTrabajo(trabajo)
  notificarEmpleador(trabajo.empleador_id, {
    tipo:      'cambio_estado',
    titulo:    'Buscando trabajador',
    mensaje:   `Ya estamos buscando a alguien para "${trabajo.titulo}".`,
    trabajoId: trabajo.id,
  })
}

// Caso borde: el backend estuvo apagado y la hora del trabajo ya pasó hace rato.
// Publicarlo ahora sería mandar a alguien a un trabajo que ya no se espera: se
// cancela (por el sistema: no penaliza a nadie) y se devuelve el 100% del pago.
async function cancelarPorVencido(trabajo, ahora) {
  const { data: actualizados, error } = await supabase
    .from('trabajos')
    .update({
      estado:             'cancelado',
      cancelado_por:      'sistema',
      cancelado_en:       ahora.toISOString(),
      motivo_cancelacion: 'La fecha programada pasó sin que se pudiera publicar el trabajo',
    })
    .eq('id', trabajo.id)
    .eq('estado', 'programado')
    .select('id')

  if (error) {
    console.error(`Error cancelando programado vencido (trabajoId=${trabajo.id}): ${error.message ?? error}`)
    return
  }
  if (!actualizados?.length) return

  console.error(`Trabajo programado vencido sin activar, se canceló y reembolsa (trabajoId=${trabajo.id}, programado_para=${trabajo.programado_para}).`)

  await pagos.reembolsarTrabajo({ trabajoId: trabajo.id, porcentaje: 100 })

  emitirFinTrabajo(trabajo.id, { estado: 'cancelado', motivo: 'programado_vencido' })
  notificarEmpleador(trabajo.empleador_id, {
    tipo:      'cambio_estado',
    titulo:    'Trabajo programado cancelado',
    mensaje:   `No pudimos publicar "${trabajo.titulo}" a tiempo para la fecha que elegiste. Te devolvimos el pago completo.`,
    trabajoId: trabajo.id,
  })
}

function iniciarActivacionProgramados() {
  const correr = () => activarProgramadosVencidos().catch((error) => {
    console.error('Error activando trabajos programados:', error.message ?? error)
  })
  correr() // una pasada al arrancar: si el server estuvo caído, se pone al día
  setInterval(correr, INTERVALO_MS)
}

module.exports = { iniciarActivacionProgramados, activarProgramadosVencidos, activarTrabajo }
