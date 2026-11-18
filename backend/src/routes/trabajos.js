const express = require('express')
const multer  = require('multer')
const router  = express.Router()
const {
  cotizarTrabajo, crearTrabajo, obtenerEstadoPago, simularPago, listarTrabajos, misTrabajos, obtenerTrabajo,
  aceptarTrabajo, validarPinTrabajo, completarTrabajo, calificarTrabajo,
  cancelarTrabajo, obtenerCandidatos, obtenerCalificacion, historialTrabajos,
  motivosCancelacion,
} = require('../controllers/trabajosController')
const { crearDisputa } = require('../controllers/disputasController')
const { enviarMensaje, listarMensajes } = require('../controllers/mensajesController')
const { subirEvidencia, listarEvidencia } = require('../controllers/evidenciaController')
const { obtenerUbicacionTrabajador } = require('../controllers/ubicacionController')
const { listarProgramados, reprogramarTrabajo } = require('../controllers/programacionController')
const { autenticar, soloEmpleado, soloEmpleador } = require('../middleware/auth')
const { validar, validarIdParam } = require('../middleware/validar')
const { limites } = require('../middleware/seguridad')
const esquemas = require('../validacion/esquemas')

router.param('id', validarIdParam)

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// Sprint 6 — foto opcional de una disputa. Un error de multer (ej. más de 10 MB) vuelve
// como 400 con mensaje claro en vez de caer en el errorHandler como 500.
const fotoDisputa = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 5 } })
  .single('foto')
function recibirFotoDisputa(req, res, next) {
  fotoDisputa(req, res, (error) => {
    if (!error) return next()
    console.error(`Foto de disputa rechazada: ${error.code ?? ''} ${error.message}`)
    res.status(400).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'La foto puede pesar hasta 10 MB.' : 'No pudimos leer la foto enviada.' })
  })
}

router.get('/',                     autenticar, listarTrabajos)
router.get('/historial',            autenticar, historialTrabajos)
router.get('/mios',                 autenticar, misTrabajos)
router.get('/programados',          autenticar, validar(esquemas.programadosQuery, 'query'), listarProgramados)
router.get('/motivos-cancelacion',  autenticar, motivosCancelacion)
router.post('/cotizar',             autenticar, soloEmpleador, limites.cotizar, validar(esquemas.cotizar), cotizarTrabajo)
router.get('/:id',                  autenticar, obtenerTrabajo)
router.get('/:id/pago',             autenticar, soloEmpleador, obtenerEstadoPago)
router.post('/:id/pago/simular',    autenticar, soloEmpleador, simularPago)
router.get('/:id/candidatos',       autenticar, soloEmpleador, validar(esquemas.candidatosQuery, 'query'), obtenerCandidatos)
router.post('/',                    autenticar, soloEmpleador, limites.crearTrabajo, validar(esquemas.crearTrabajo), crearTrabajo)
router.post('/:id/aceptar',         autenticar, soloEmpleado,  aceptarTrabajo)
router.post('/:id/validar-pin',     autenticar, soloEmpleado,  limites.pin, validar(esquemas.validarPin), validarPinTrabajo)
router.post('/:id/completar',       autenticar, completarTrabajo)
router.put('/:id/programacion',     autenticar, soloEmpleador, validar(esquemas.reprogramar), reprogramarTrabajo)
router.post('/:id/cancelar',       autenticar, validar(esquemas.cancelar), cancelarTrabajo)
router.post('/:id/calificar',       autenticar, soloEmpleador, validar(esquemas.calificar), calificarTrabajo)
router.get('/:id/calificacion',     autenticar, obtenerCalificacion)
router.post('/:id/mensajes',        autenticar, validar(esquemas.mensaje), enviarMensaje)
router.get('/:id/mensajes',         autenticar, listarMensajes)
router.post('/:id/evidencia',       autenticar, soloEmpleado,  upload.single('foto'), subirEvidencia)
router.get('/:id/evidencia',        autenticar, listarEvidencia)
router.post('/:id/disputas',        autenticar, recibirFotoDisputa, crearDisputa)
router.get('/:id/ubicacion-trabajador', autenticar, soloEmpleador, obtenerUbicacionTrabajador)

module.exports = router
