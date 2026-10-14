const supabase = require('../config/supabase')
const { esExpoPushToken } = require('../services/notificacionesService')

// POST /api/notificaciones/registrar-token — la app lo llama después del login
// con el token que le dio expo-notifications. Un token por usuario (upsert).
async function registrarToken(req, res) {
  const { id: usuarioId } = req.usuario
  const { expoPushToken } = req.body

  if (!esExpoPushToken(expoPushToken)) {
    console.error(`Registro de push token rechazado (usuarioId=${usuarioId}): token inválido '${expoPushToken}'.`)
    return res.status(400).json({ error: 'El expoPushToken no es válido' })
  }

  const { error } = await supabase
    .from('push_tokens')
    .upsert({ usuario_id: usuarioId, expo_push_token: expoPushToken }, { onConflict: 'usuario_id' })

  if (error) {
    console.error(`Error registrando push token (usuarioId=${usuarioId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error registrando el token' })
  }

  res.json({ message: 'Token registrado' })
}

// GET /api/notificaciones — historial de notificaciones del usuario logueado.
async function listarNotificaciones(req, res) {
  const { id: usuarioId } = req.usuario

  const { data, error } = await supabase
    .from('notificaciones')
    .select('id, tipo, trabajo_id, titulo, mensaje, estado_envio, enviado_en')
    .eq('destinatario_id', usuarioId)
    .order('enviado_en', { ascending: false })

  if (error) {
    console.error(`Error listando notificaciones (usuarioId=${usuarioId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando notificaciones' })
  }

  res.json({ notificaciones: data })
}

module.exports = { registrarToken, listarNotificaciones }
