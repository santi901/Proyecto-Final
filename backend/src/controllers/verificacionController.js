const { RekognitionClient, CompareFacesCommand } = require('@aws-sdk/client-rekognition')
const { guardarImagen } = require('../utils/storage')

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

async function compararCaras(req, res) {
  const imagenes = req.files
  const userId = req.usuario?.id ?? req.body.userId ?? 'sin-id'

  if (!imagenes || imagenes.length < 2) {
    console.error(`Verificación rechazada (userId=${userId}): se recibieron ${imagenes?.length ?? 0} imágenes, se esperaban 2 (dni + selfie).`)
    return res.status(400).json({ error: 'Tenés que enviar exactamente dos imágenes: la foto del DNI y una selfie.' })
  }

  const dni    = imagenes.find(f => f.fieldname === 'dni')    ?? imagenes[0]
  const selfie = imagenes.find(f => f.fieldname === 'selfie') ?? imagenes[1]

  if (!dni || !selfie) {
    console.error(`Verificación rechazada (userId=${userId}): falta el campo 'dni' o 'selfie' en el multipart recibido.`)
    return res.status(400).json({ error: 'Falta la foto del DNI o la selfie.' })
  }

  if (dni.buffer.equals(selfie.buffer)) {
    console.error(`Verificación rechazada (userId=${userId}): la foto de DNI y la selfie son el mismo archivo (bytes idénticos).`)
    return res.status(400).json({ error: 'El DNI y la selfie no pueden ser la misma imagen.' })
  }

  try {
    const [rutaDni, rutaSelfie] = await Promise.all([
      guardarImagen(dni.buffer, 'dni', userId),
      guardarImagen(selfie.buffer, 'selfie', userId),
    ])

    const respuesta = await rekognition.send(new CompareFacesCommand({
      SourceImage: { Bytes: dni.buffer },
      TargetImage: { Bytes: selfie.buffer },
      SimilarityThreshold: 80,
    }))

    const coincidencias = respuesta.FaceMatches ?? []
    const similitud = coincidencias[0]?.Similarity ?? 0
    const coinciden = similitud >= 90

    return res.json({
      coinciden,
      similitud,
      estado: coinciden ? 'aprobado' : 'rechazado',
      mensaje: coinciden
        ? 'Identidad verificada'
        : 'Las caras no coinciden. El DNI y la selfie deben ser de la misma persona.',
      archivos: { dni: rutaDni, selfie: rutaSelfie },
    })
  } catch (err) {
    if (err.name === 'InvalidParameterException') {
      console.error(`Verificación fallida (userId=${userId}): Rekognition no detectó una cara en el DNI o en la selfie. ${err.message}`)
      return res.status(400).json({ error: 'No se detectó una cara en el DNI o en la selfie. Asegurate de que las fotos sean claras.' })
    }
    console.error(`Error inesperado en verificación (userId=${userId}, tipo=${err.name ?? 'desconocido'}): ${err.message ?? err}`)
    return res.status(500).json({ error: 'Error al procesar las imágenes. Intentá de nuevo.' })
  }
}

module.exports = { compararCaras }
