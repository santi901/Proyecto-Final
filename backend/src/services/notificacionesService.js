const supabase = require('../config/supabase')
const { buscarTrabajadoresDisponibles } = require('./matchingService')

// Notificaciones push (Expo) + historial, portado del backend NestJS
// (src/notificaciones). Se usa directamente la API HTTP de Expo en vez de
// expo-server-sdk para no sumar otra dependencia.
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

function esExpoPushToken(token) {
  return typeof token === 'string' && /^(ExponentPushToken|ExpoPushToken)\[.+\]$/.test(token)
}

async function buscarToken(usuarioId) {
  const { data } = await supabase
    .from('push_tokens').select('expo_push_token').eq('usuario_id', usuarioId).maybeSingle()
  return data?.expo_push_token ?? null
}

async function intentarEnviarPush(push) {
  try {
    const respuesta = await fetch(EXPO_PUSH_URL, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body:    JSON.stringify(push),
    })
    const cuerpo = await respuesta.json().catch(() => null)
    // Expo no devuelve error HTTP por token inválido/no registrado: hay que
    // revisar el "ticket" de la respuesta, no alcanza con que la llamada ande.
    const ticket = Array.isArray(cuerpo?.data) ? cuerpo.data[0] : cuerpo?.data
    if (!respuesta.ok || ticket?.status !== 'ok') {
      console.error(`Push rechazado por Expo (to=${push.to}): ${respuesta.status} ${JSON.stringify(ticket?.details ?? ticket?.message ?? cuerpo)}`)
      return 'fallido'
    }
    return 'enviado'
  } catch (error) {
    console.error('Error mandando push a Expo:', error.message)
    return 'fallido'
  }
}

// Nunca debe frenar el flujo del trabajo: si algo falla (DB, Expo, el usuario
// no tiene push token), esto solo loguea y sigue. Siempre queda una fila en
// 'notificaciones' — se registra como 'pendiente' ANTES de mandar el push, así
// nunca hay un push real sin rastro en el historial.
async function notificar(destinatarioId, { tipo, mensaje, titulo, trabajoId }) {
  if (!destinatarioId) return
  try {
    const { data: registro, error: errorInsert } = await supabase
      .from('notificaciones')
      .insert({
        destinatario_id: destinatarioId,
        tipo,
        trabajo_id:      trabajoId ?? null,
        titulo:          titulo ?? 'ChanguitApp',
        mensaje,
        estado_envio:    'pendiente',
      })
      .select('id')
      .single()

    if (errorInsert || !registro) {
      console.error(`Error registrando notificación (destinatarioId=${destinatarioId}, tipo=${tipo}): ${errorInsert?.message ?? 'sin fila'}`)
      return
    }

    const token = await buscarToken(destinatarioId)
    let estadoEnvio = 'fallido'
    if (esExpoPushToken(token)) {
      estadoEnvio = await intentarEnviarPush({
        to:    token,
        sound: 'default',
        title: titulo ?? 'ChanguitApp',
        body:  mensaje,
        data:  { tipo, trabajoId },
      })
    } else {
      console.error(`Push no enviado (destinatarioId=${destinatarioId}, tipo=${tipo}): el usuario no registró un push token.`)
    }

    await supabase.from('notificaciones').update({ estado_envio: estadoEnvio }).eq('id', registro.id)
  } catch (error) {
    console.error('Error mandando notificación:', error.message)
  }
}

async function notificarEmpleador(perfilId, payload) {
  const { data } = await supabase.from('perfiles').select('user_id').eq('id', perfilId).maybeSingle()
  if (data?.user_id) await notificar(data.user_id, payload)
}

async function notificarEmpleado(empleadoId, payload) {
  const { data } = await supabase.from('empleados').select('user_id').eq('id', empleadoId).maybeSingle()
  if (data?.user_id) await notificar(data.user_id, payload)
}

// Busca (localmente, con matchingService) quiénes son los trabajadores que
// matchean con el trabajo (categoría + distancia + disponibilidad) y les manda
// la notificación de nueva oferta. La usan tanto crearTrabajo como el poller de
// reasignación (reasignarTrabajos.js) cuando reintenta.
async function notificarNuevoTrabajo(trabajo) {
  try {
    const candidatos = await buscarTrabajadoresDisponibles(trabajo.id)

    await Promise.all(candidatos.map((candidato) => notificar(candidato.userId, {
      tipo:    'nueva_oferta',
      titulo:  'Nuevo trabajo disponible',
      mensaje: `Hay un nuevo trabajo de ${trabajo.categoria} cerca tuyo: "${trabajo.titulo}"`,
      trabajoId: trabajo.id,
    })))
  } catch (error) {
    console.error('Error buscando trabajadores para notificar:', error.message ?? error)
  }
}

module.exports = {
  notificar, notificarEmpleador, notificarEmpleado, notificarNuevoTrabajo, esExpoPushToken,
}
