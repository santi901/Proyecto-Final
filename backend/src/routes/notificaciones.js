const express = require('express')
const router  = express.Router()
const { registrarToken, listarNotificaciones } = require('../controllers/notificacionesController')
const { autenticar } = require('../middleware/auth')

router.get('/',                 autenticar, listarNotificaciones)
router.post('/registrar-token', autenticar, registrarToken)

module.exports = router
