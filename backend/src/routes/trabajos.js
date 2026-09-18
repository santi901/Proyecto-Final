const express = require('express')
const router  = express.Router()
const {
  crearTrabajo, listarTrabajos, misTrabajos, obtenerTrabajo,
  aceptarTrabajo, validarPinTrabajo, completarTrabajo, calificarTrabajo,
} = require('../controllers/trabajosController')
const { enviarMensaje, listarMensajes } = require('../controllers/mensajesController')
const { obtenerUbicacionTrabajador } = require('../controllers/ubicacionController')
const { autenticar, soloEmpleado, soloEmpleador } = require('../middleware/auth')

router.get('/',                     autenticar, listarTrabajos)
router.get('/mios',                 autenticar, misTrabajos)
router.get('/:id',                  autenticar, obtenerTrabajo)
router.post('/',                    autenticar, soloEmpleador, crearTrabajo)
router.post('/:id/aceptar',         autenticar, soloEmpleado,  aceptarTrabajo)
router.post('/:id/validar-pin',     autenticar, soloEmpleado,  validarPinTrabajo)
router.post('/:id/completar',       autenticar, completarTrabajo)
router.post('/:id/calificar',       autenticar, soloEmpleador, calificarTrabajo)
router.post('/:id/mensajes',        autenticar, enviarMensaje)
router.get('/:id/mensajes',         autenticar, listarMensajes)
router.get('/:id/ubicacion-trabajador', autenticar, soloEmpleador, obtenerUbicacionTrabajador)

module.exports = router
