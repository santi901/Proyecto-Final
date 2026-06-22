const express = require('express')
const router  = express.Router()
const { registrarEmpleado, registrarEmpleador, login, refresh, logout } = require('../controllers/authController')
const { autenticar } = require('../middleware/auth')

router.post('/registrar-empleado',  registrarEmpleado)
router.post('/registrar-empleador', registrarEmpleador)
router.post('/login',   login)
router.post('/refresh', refresh)
router.post('/logout',  autenticar, logout)

module.exports = router
