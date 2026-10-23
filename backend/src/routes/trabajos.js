const express = require('express')
const multer  = require('multer')
const router  = express.Router()
const {
  cotizarTrabajo, crearTrabajo, obtenerEstadoPago, simularPago, listarTrabajos, misTrabajos, obtenerTrabajo,
  aceptarTrabajo, validarPinTrabajo, completarTrabajo, calificarTrabajo,
  cancelarTrabajo, obtenerCandidatos, obtenerCalificacion, historialTrabajos,
} = require('../controllers/trabajosController')
const { enviarMensaje, listarMensajes } = require('../controllers/mensajesController')
const { subirEvidencia, listarEvidencia } = require('../controllers/evidenciaController')
const { obtenerUbicacionTrabajador } = require('../controllers/ubicacionController')
const { autenticar, soloEmpleado, soloEmpleador } = require('../middleware/auth')
const { validar, validarIdParam } = require('../middleware/validar')
const { limites } = require('../middleware/seguridad')
const esquemas = require('../validacion/esquemas')

router.param('id', validarIdParam)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

router.get('/',                     autenticar, listarTrabajos)
router.get('/historial',            autenticar, historialTrabajos)
router.get('/mios',                 autenticar, misTrabajos)
router.post('/cotizar',             autenticar, soloEmpleador, limites.cotizar, validar(esquemas.cotizar), cotizarTrabajo)
router.get('/:id',                  autenticar, obtenerTrabajo)
router.get('/:id/pago',             autenticar, soloEmpleador, obtenerEstadoPago)
router.post('/:id/pago/simular',    autenticar, soloEmpleador, simularPago)
router.get('/:id/candidatos',       autenticar, soloEmpleador, validar(esquemas.candidatosQuery, 'query'), obtenerCandidatos)
router.post('/',                    autenticar, soloEmpleador, limites.crearTrabajo, validar(esquemas.crearTrabajo), crearTrabajo)
router.post('/:id/aceptar',         autenticar, soloEmpleado,  aceptarTrabajo)
router.post('/:id/validar-pin',     autenticar, soloEmpleado,  limites.pin, validar(esquemas.validarPin), validarPinTrabajo)
router.post('/:id/completar',       autenticar, completarTrabajo)
router.post('/:id/cancelar',        autenticar, validar(esquemas.cancelar), cancelarTrabajo)
router.post('/:id/calificar',       autenticar, soloEmpleador, validar(esquemas.calificar), calificarTrabajo)
router.get('/:id/calificacion',     autenticar, obtenerCalificacion)
router.post('/:id/mensajes',        autenticar, validar(esquemas.mensaje), enviarMensaje)
router.get('/:id/mensajes',         autenticar, listarMensajes)
router.post('/:id/evidencia',       autenticar, soloEmpleado,  upload.single('foto'), subirEvidencia)
router.get('/:id/evidencia',        autenticar, listarEvidencia)
router.get('/:id/ubicacion-trabajador', autenticar, soloEmpleador, obtenerUbicacionTrabajador)

module.exports = router
