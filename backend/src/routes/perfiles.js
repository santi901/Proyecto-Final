const express = require('express')
const router  = express.Router()
const { obtenerPerfil, actualizarPerfil } = require('../controllers/perfilesController')
const { autenticar, soloEmpleador } = require('../middleware/auth')

router.get('/perfil', autenticar, soloEmpleador, obtenerPerfil)
router.put('/perfil', autenticar, soloEmpleador, actualizarPerfil)

module.exports = router
