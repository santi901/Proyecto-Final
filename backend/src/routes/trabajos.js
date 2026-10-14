const express = require('express')
const multer  = require('multer')
const router  = express.Router()
const {
  crearTrabajo, listarTrabajos, misTrabajos, obtenerTrabajo,
  aceptarTrabajo, validarPinTrabajo, completarTrabajo, calificarTrabajo,
  cancelarTrabajo, obtenerCandidatos, obtenerCalificacion,
} = require('../controllers/trabajosController')
const { enviarMensaje, listarMensajes } = require('../controllers/mensajesController')
const { subirEvidencia, listarEvidencia } = require('../controllers/evidenciaController')
const { obtenerUbicacionTrabajador } = require('../controllers/ubicacionController')
const { autenticar, soloEmpleado, soloEmpleador } = require('../middleware/auth')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

router.get('/',                         autenticar, listarTrabajos)
router.get('/mios',                     autenticar, misTrabajos)
router.get('/:id',                      autenticar, obtenerTrabajo)
router.get('/:id/candidatos',           autenticar, soloEmpleador, obtenerCandidatos)
router.post('/',                        autenticar, soloEmpleador, crearTrabajo)
router.post('/:id/aceptar',             autenticar, soloEmpleado,  aceptarTrabajo)
router.post('/:id/validar-pin',         autenticar, soloEmpleado,  validarPinTrabajo)
router.post('/:id/completar',           autenticar, completarTrabajo)
router.post('/:id/cancelar',            autenticar, soloEmpleador, cancelarTrabajo)
router.post('/:id/calificar',           autenticar, soloEmpleador, calificarTrabajo)
router.get('/:id/calificacion',         autenticar, obtenerCalificacion)
router.post('/:id/mensajes',            autenticar, enviarMensaje)
router.get('/:id/mensajes',             autenticar, listarMensajes)
router.post('/:id/evidencia',           autenticar, soloEmpleado,  upload.single('foto'), subirEvidencia)
router.get('/:id/evidencia',            autenticar, listarEvidencia)
router.get('/:id/ubicacion-trabajador', autenticar, soloEmpleador, obtenerUbicacionTrabajador)

module.exports = router
