const express = require('express')
const router  = express.Router()
const {
  obtenerPerfil, actualizarPerfil, reputacionEmpleado, obtenerMetodoCobro, guardarMetodoCobro,
} = require('../controllers/empleadosController')
const { autenticar, soloEmpleado } = require('../middleware/auth')
const { validar } = require('../middleware/validar')
const esquemas = require('../validacion/esquemas')

router.get('/perfil', autenticar, soloEmpleado, obtenerPerfil)
router.put('/perfil', autenticar, soloEmpleado, validar(esquemas.perfilEmpleado), actualizarPerfil)
router.get('/metodo-cobro', autenticar, soloEmpleado, obtenerMetodoCobro)
router.put('/metodo-cobro', autenticar, soloEmpleado, validar(esquemas.metodoCobro), guardarMetodoCobro)
router.get('/:id/reputacion', autenticar, reputacionEmpleado)

module.exports = router
