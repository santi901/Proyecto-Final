const express = require('express')
const router  = express.Router()
const { obtenerPerfil, actualizarPerfil, reputacionEmpleado } = require('../controllers/empleadosController')
const { autenticar, soloEmpleado } = require('../middleware/auth')

router.get('/perfil', autenticar, soloEmpleado, obtenerPerfil)
router.put('/perfil', autenticar, soloEmpleado, actualizarPerfil)
router.get('/:id/reputacion', autenticar, reputacionEmpleado)

module.exports = router
