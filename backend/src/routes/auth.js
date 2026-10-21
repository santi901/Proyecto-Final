const express = require('express')
const router  = express.Router()
const { registrarEmpleado, registrarEmpleador, login, refresh, logout } = require('../controllers/authController')
const { autenticar } = require('../middleware/auth')
const { validar } = require('../middleware/validar')
const { limites } = require('../middleware/seguridad')
const esquemas = require('../validacion/esquemas')

router.post('/registrar-empleado',  limites.registro, validar(esquemas.registrarEmpleado),  registrarEmpleado)
router.post('/registrar-empleador', limites.registro, validar(esquemas.registrarEmpleador), registrarEmpleador)
router.post('/login',   limites.login,   validar(esquemas.login),   login)
router.post('/refresh', limites.refresh, validar(esquemas.refresh), refresh)
router.post('/logout',  autenticar, validar(esquemas.logout), logout)

module.exports = router
