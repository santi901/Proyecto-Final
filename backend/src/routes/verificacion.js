const express = require('express')
const multer  = require('multer')
const router  = express.Router()
const { compararCaras } = require('../controllers/verificacionController')

const upload = multer({ storage: multer.memoryStorage() })

// Sin autenticar: se usa durante el registro, antes de que exista un usuario/token.
router.post(
  '/comparar-caras',
  upload.fields([{ name: 'dni', maxCount: 1 }, { name: 'selfie', maxCount: 1 }]),
  (req, res, next) => {
    req.files = [...(req.files?.dni ?? []), ...(req.files?.selfie ?? [])]
    next()
  },
  compararCaras,
)

module.exports = router
