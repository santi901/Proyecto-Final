const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3')
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')
const { v4: uuidv4 } = require('uuid')

const URL_FIRMADA_EXPIRA_SEGUNDOS = 3600

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
})

async function guardarImagen(buffer, tipo, userId) {
  const nombreArchivo = `${userId}/${tipo}-${uuidv4()}.jpg`

  await s3.send(new PutObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: nombreArchivo,
    Body: buffer,
    ContentType: 'image/jpeg',
  }))

  return nombreArchivo
}

// El bucket es privado: la app necesita una URL firmada (temporal, 1h) para
// poder mostrar la imagen — la key sola no es accesible desde afuera.
async function obtenerUrlFirmada(key) {
  return getSignedUrl(s3, new GetObjectCommand({
    Bucket: process.env.AWS_BUCKET_NAME,
    Key: key,
  }), { expiresIn: URL_FIRMADA_EXPIRA_SEGUNDOS })
}

module.exports = { guardarImagen, obtenerUrlFirmada }
