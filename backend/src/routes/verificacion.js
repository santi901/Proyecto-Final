const express = require('express')
const multer  = require('multer')
const router  = express.Router()
const { compararCaras } = require('../controllers/verificacionController')
const { autenticar } = require('../middleware/auth')

const upload = multer({ storage: multer.memoryStorage() })

router.post(
  '/comparar-caras',
  autenticar,
  upload.fields([{ name: 'dni', maxCount: 1 }, { name: 'selfie', maxCount: 1 }]),
  (req, res, next) => {
    req.files = [...(req.files?.dni ?? []), ...(req.files?.selfie ?? [])]
    next()
  },
  compararCaras,
)

module.exports = router
