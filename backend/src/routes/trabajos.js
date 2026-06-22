const express = require('express')
const router  = express.Router()
const {
  crearTrabajo, listarTrabajos, obtenerTrabajo,
  aceptarTrabajo, validarPinTrabajo, completarTrabajo,
} = require('../controllers/trabajosController')
const { autenticar, soloEmpleado, soloEmpleador } = require('../middleware/auth')

router.get('/',                   autenticar, listarTrabajos)
router.get('/:id',                autenticar, obtenerTrabajo)
router.post('/',                  autenticar, soloEmpleador, crearTrabajo)
router.post('/:id/aceptar',       autenticar, soloEmpleado,  aceptarTrabajo)
router.post('/:id/validar-pin',   autenticar, soloEmpleado,  validarPinTrabajo)
router.post('/:id/completar',     autenticar, completarTrabajo)

module.exports = router
