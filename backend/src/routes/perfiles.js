const express = require('express')
const router  = express.Router()
const { obtenerPerfil, actualizarPerfil } = require('../controllers/perfilesController')
const { autenticar, soloEmpleador } = require('../middleware/auth')
const { validar } = require('../middleware/validar')
const esquemas = require('../validacion/esquemas')

router.get('/perfil', autenticar, soloEmpleador, obtenerPerfil)
router.put('/perfil', autenticar, soloEmpleador, validar(esquemas.perfilEmpleador), actualizarPerfil)

module.exports = router
