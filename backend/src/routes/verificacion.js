const express = require('express')
const multer  = require('multer')
const router  = express.Router()
const { compararCaras } = require('../controllers/verificacionController')
const { limites } = require('../middleware/seguridad')

// Rekognition acepta hasta 5 MB por imagen y solo JPEG o PNG.
const MAX_BYTES_IMAGEN = 5 * 1024 * 1024
const TIPOS_IMAGEN = ['image/jpeg', 'image/png']

// Las fotos pueden llegar de dos formas:
//   - JSON { dni, selfie, userId } con cada imagen en base64 — lo que mandan las apps.
//     Antes mandaban multipart con objetos `File` de expo-file-system, y según qué
//     fetch estuviera activo las dos partes llegaban con los mismos bytes.
//   - multipart con los campos `dni` y `selfie` (lo que se usaba antes; queda por compatibilidad).
// Las dos terminan en req.files = [{ fieldname, buffer, mimetype }, ...].

const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_BYTES_IMAGEN, files: 2, fields: 5 },
}).fields([{ name: 'dni', maxCount: 1 }, { name: 'selfie', maxCount: 1 }])

function recibirMultipart(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next()
    const mensaje = error.code === 'LIMIT_FILE_SIZE' ? 'Cada imagen puede pesar hasta 5 MB' : error.message
    console.error(`Subida de verificación rechazada: ${error.code ?? 'tipo'} ${error.message}`)
    res.status(400).json({ error: mensaje })
  })
}

// Este router se monta antes del express.json global (que corta en 100 kb): las dos
// fotos en base64 pesan varios MB.
const recibirJson = express.json({ limit: '15mb' })

// Por los primeros bytes, no por lo que diga el cliente.
function tipoPorContenido(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg'
  if (buffer.length >= 4 && buffer.readUInt32BE(0) === 0x89504e47) return 'image/png'
  return null
}

function normalizarImagenes(req, res, next) {
  let imagenes

  if (req.files && !Array.isArray(req.files)) {
    imagenes = [...(req.files.dni ?? []), ...(req.files.selfie ?? [])]
  } else {
    imagenes = []
    for (const campo of ['dni', 'selfie']) {
      const valor = req.body?.[campo]
      if (typeof valor !== 'string' || !valor) continue
      // Acepta tanto base64 pelado como un data URI ("data:image/jpeg;base64,...").
      const base64 = valor.includes(',') ? valor.slice(valor.indexOf(',') + 1) : valor
      imagenes.push({ fieldname: campo, buffer: Buffer.from(base64, 'base64') })
    }
  }

  for (const imagen of imagenes) {
    if (!imagen.buffer?.length) {
      console.error(`Verificación rechazada: la imagen '${imagen.fieldname}' llegó vacía.`)
      return res.status(400).json({ error: 'Una de las fotos llegó vacía. Volvé a elegirla.' })
    }
    if (imagen.buffer.length > MAX_BYTES_IMAGEN) {
      console.error(`Verificación rechazada: la imagen '${imagen.fieldname}' pesa ${imagen.buffer.length} bytes.`)
      return res.status(400).json({ error: 'Cada imagen puede pesar hasta 5 MB' })
    }
    const tipo = tipoPorContenido(imagen.buffer)
    if (!TIPOS_IMAGEN.includes(tipo)) {
      console.error(`Verificación rechazada: la imagen '${imagen.fieldname}' no es JPG ni PNG (primeros bytes ${imagen.buffer.subarray(0, 4).toString('hex')}).`)
      return res.status(400).json({ error: 'Las fotos tienen que ser JPG o PNG' })
    }
    imagen.mimetype = tipo
  }

  req.files = imagenes
  next()
}

// Sin autenticar: se usa durante el registro, antes de que exista un usuario/token.
router.post('/comparar-caras', limites.verificacion, recibirMultipart, recibirJson, normalizarImagenes, compararCaras)

module.exports = router
