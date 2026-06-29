const { RekognitionClient, CompareFacesCommand } = require('@aws-sdk/client-rekognition')
const { TextractClient, DetectDocumentTextCommand } = require('@aws-sdk/client-textract')
const { guardarImagen } = require('../utils/storage')

const rekognition = new RekognitionClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

const textract = new TextractClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

async function validarDni(dniBuffer) {
  let respuesta
  try {
    respuesta = await textract.send(new DetectDocumentTextCommand({
      Document: { Bytes: dniBuffer },
    }))
  } catch {
    throw { status: 400, message: 'No se pudo leer el DNI. Asegurate de que la foto sea clara y esté bien iluminada.' }
  }

  const texto = respuesta.Blocks
    ?.filter(b => b.BlockType === 'LINE')
    .map(b => b.Text?.toUpperCase() ?? '')
    .join(' ') ?? ''

  const palabrasClave = ['ARGENTINA', 'DOCUMENTO', 'DNI', 'IDENTIDAD', 'NACIONAL', 'TRAMITE']
  if (!palabrasClave.some(p => texto.includes(p))) {
    throw { status: 400, message: 'La imagen no parece ser un DNI válido. Enviá una foto clara del frente de tu DNI.' }
  }
}

async function compararCaras(req, res) {
  const imagenes = req.files
  const userId = req.usuario?.id ?? req.body.userId ?? 'sin-id'

  if (!imagenes || imagenes.length < 2) {
    return res.status(400).json({ error: 'Tenés que enviar exactamente dos imágenes: la foto del DNI y una selfie.' })
  }

  const dni    = imagenes.find(f => f.fieldname === 'dni')    ?? imagenes[0]
  const selfie = imagenes.find(f => f.fieldname === 'selfie') ?? imagenes[1]

  if (!dni || !selfie) {
    return res.status(400).json({ error: 'Falta la foto del DNI o la selfie.' })
  }

  if (dni.buffer.equals(selfie.buffer)) {
    return res.status(400).json({ error: 'El DNI y la selfie no pueden ser la misma imagen.' })
  }

  try {
    await validarDni(dni.buffer)
  } catch (err) {
    return res.status(err.status ?? 400).json({ error: err.message })
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
      return res.status(400).json({ error: 'No se detectó una cara en el DNI o en la selfie. Asegurate de que las fotos sean claras.' })
    }
    console.error('Error en verificacion:', err)
    return res.status(500).json({ error: 'Error al procesar las imágenes. Intentá de nuevo.' })
  }
}

module.exports = { compararCaras }
