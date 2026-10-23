const express = require('express')
const router  = express.Router()
const { obtenerPerfil, actualizarPerfil, reputacionEmpleado } = require('../controllers/empleadosController')
const { autenticar, soloEmpleado } = require('../middleware/auth')
const { validar } = require('../middleware/validar')
const esquemas = require('../validacion/esquemas')

router.get('/perfil', autenticar, soloEmpleado, obtenerPerfil)
router.put('/perfil', autenticar, soloEmpleado, validar(esquemas.perfilEmpleado), actualizarPerfil)
router.get('/:id/reputacion', autenticar, reputacionEmpleado)

module.exports = router
