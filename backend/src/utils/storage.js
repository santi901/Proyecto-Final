const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3')
const { v4: uuidv4 } = require('uuid')

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

module.exports = { guardarImagen }
