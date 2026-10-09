const { Server } = require('socket.io')
const supabase = require('../config/supabase')
const { verificarAccessToken } = require('../utils/jwt')
const { esParticipanteTrabajo } = require('../utils/participantes')

let io = null

function nombreRoom(trabajoId) {
  return `trabajo:${trabajoId}`
}

// Activa el socket.io que ya estaba en package.json sin usarse (Sprint 4).
// Auth por el mismo access token JWT que usa el resto de la API; cada cliente
// se une "a mano" a la room de un trabajo puntual (unirse-trabajo) y se valida
// que sea empleado/empleador participante de ese trabajo, igual que el chat.
function configurarSocket(httpServer) {
  io = new Server(httpServer, { cors: { origin: '*' } })

  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token
      if (!token) throw new Error('Token requerido')
      socket.usuario = verificarAccessToken(token)
      next()
    } catch {
      next(new Error('No autorizado'))
    }
  })

  io.on('connection', (socket) => {
    socket.on('unirse-trabajo', async ({ trabajoId } = {}) => {
      if (!trabajoId) return

      const { data: trabajo } = await supabase
        .from('trabajos').select('id, trabajador_id, empleador_id').eq('id', trabajoId).maybeSingle()

      if (!trabajo) return

      const { id: usuarioId, tipo } = socket.usuario
      if (await esParticipanteTrabajo(trabajo, usuarioId, tipo)) {
        socket.join(nombreRoom(trabajoId))
      }
    })

    socket.on('salir-trabajo', ({ trabajoId } = {}) => {
      if (trabajoId) socket.leave(nombreRoom(trabajoId))
    })
  })

  return io
}

// Llamado desde ubicacionController al recibir un ping de GPS de un trabajador
// con un trabajo activo asociado.
function emitirUbicacion(trabajoId, payload) {
  io?.to(nombreRoom(trabajoId)).emit('ubicacion-trabajador', payload)
}

// Llamado al completar (con doble confirmación) o cancelar un trabajo — corta la
// emisión de ubicación echando a todos los sockets de la room (Sprint 4, último ítem).
function emitirFinTrabajo(trabajoId, payload) {
  const room = nombreRoom(trabajoId)
  io?.to(room).emit('trabajo-finalizado', payload)
  io?.socketsLeave(room)
}

module.exports = { configurarSocket, emitirUbicacion, emitirFinTrabajo }
