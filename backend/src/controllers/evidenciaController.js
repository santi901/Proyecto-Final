const supabase = require('../config/supabase')
const { guardarImagen, obtenerUrlFirmada } = require('../utils/storage')
const { esParticipanteTrabajo } = require('../utils/participantes')
const { notificarEmpleador } = require('../services/notificacionesService')

// La foto de evidencia se sube al terminar el trabajo: mientras está en curso
// (antes/durante la doble confirmación) o ya completado.
const ESTADOS_CON_EVIDENCIA = ['en_progreso', 'completado']

async function conUrl(fila) {
  return { ...fila, url: await obtenerUrlFirmada(fila.s3_key) }
}

// POST /api/trabajos/:id/evidencia (multipart, campo 'foto') — solo el empleado asignado.
async function subirEvidencia(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId, tipo } = req.usuario

  if (!req.file) {
    console.error(`Evidencia rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no se recibió el campo 'foto'.`)
    return res.status(400).json({ error: 'Tenés que enviar una foto' })
  }
  if (req.file.size === 0) {
    console.error(`Evidencia rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): la foto llegó vacía (0 bytes). Revisar cómo arma el FormData la app.`)
    return res.status(400).json({ error: 'La foto llegó vacía. Volvé a sacarla e intentá de nuevo.' })
  }

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, estado, trabajador_id, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  if (tipo !== 'empleado' || !(await esParticipanteTrabajo(trabajo, usuarioId, tipo))) {
    console.error(`Evidencia rechazada (usuarioId=${usuarioId}, trabajoId=${trabajoId}): no es el empleado asignado.`)
    return res.status(403).json({ error: 'Solo el trabajador asignado puede subir evidencia' })
  }
  if (!ESTADOS_CON_EVIDENCIA.includes(trabajo.estado)) {
    console.error(`Evidencia rechazada (trabajoId=${trabajoId}): estado actual '${trabajo.estado}'.`)
    return res.status(400).json({ error: 'Solo podés subir evidencia de un trabajo en curso o terminado' })
  }

  try {
    const s3Key = await guardarImagen(req.file.buffer, 'evidencia', trabajoId)

    const { data: evidencia, error } = await supabase
      .from('evidencias_trabajo')
      .insert({ trabajo_id: trabajoId, s3_key: s3Key, subido_por: usuarioId })
      .select()
      .single()

    if (error) {
      console.error(`Error guardando evidencia (trabajoId=${trabajoId}): ${error.message ?? error}`)
      return res.status(500).json({ error: 'Error guardando la evidencia' })
    }

    res.status(201).json({ evidencia: await conUrl(evidencia) })

    notificarEmpleador(trabajo.empleador_id, {
      tipo:    'evidencia',
      titulo:  'Nueva foto del trabajo',
      mensaje: 'El trabajador subió una foto como evidencia del trabajo terminado.',
      trabajoId,
    })
  } catch (err) {
    console.error(`Error subiendo evidencia a S3 (trabajoId=${trabajoId}): ${err.message ?? err}`)
    return res.status(500).json({ error: 'Error subiendo la foto. Intentá de nuevo.' })
  }
}

// GET /api/trabajos/:id/evidencia — cualquiera de las dos partes del trabajo.
async function listarEvidencia(req, res) {
  const { id: trabajoId } = req.params
  const { id: usuarioId, tipo } = req.usuario

  const { data: trabajo } = await supabase
    .from('trabajos').select('id, trabajador_id, empleador_id').eq('id', trabajoId).maybeSingle()

  if (!trabajo) return res.status(404).json({ error: 'Trabajo no encontrado' })

  if (!(await esParticipanteTrabajo(trabajo, usuarioId, tipo))) {
    return res.status(403).json({ error: 'No participás de este trabajo' })
  }

  const { data, error } = await supabase
    .from('evidencias_trabajo')
    .select('id, trabajo_id, s3_key, subido_por, creado_en')
    .eq('trabajo_id', trabajoId)
    .order('creado_en', { ascending: false })

  if (error) {
    console.error(`Error listando evidencia (trabajoId=${trabajoId}): ${error.message ?? error}`)
    return res.status(500).json({ error: 'Error listando la evidencia' })
  }

  try {
    res.json({ evidencias: await Promise.all(data.map(conUrl)) })
  } catch (err) {
    console.error(`Error firmando URLs de evidencia (trabajoId=${trabajoId}): ${err.message ?? err}`)
    res.status(500).json({ error: 'Error obteniendo las fotos' })
  }
}

module.exports = { subirEvidencia, listarEvidencia }
