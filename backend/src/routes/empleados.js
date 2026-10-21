const express = require('express')
const router  = express.Router()
const { obtenerPerfil, actualizarPerfil } = require('../controllers/empleadosController')
const { autenticar, soloEmpleado } = require('../middleware/auth')
const { validar } = require('../middleware/validar')
const esquemas = require('../validacion/esquemas')

router.get('/perfil', autenticar, soloEmpleado, obtenerPerfil)
router.put('/perfil', autenticar, soloEmpleado, validar(esquemas.perfilEmpleado), actualizarPerfil)

module.exports = router
