const express = require('express')
const router  = express.Router()
const { obtenerPerfil, actualizarPerfil } = require('../controllers/empleadosController')
const { autenticar, soloEmpleado } = require('../middleware/auth')

router.get('/perfil', autenticar, soloEmpleado, obtenerPerfil)
router.put('/perfil', autenticar, soloEmpleado, actualizarPerfil)

module.exports = router
