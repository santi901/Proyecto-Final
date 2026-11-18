const express = require('express')
const multer  = require('multer')
const router  = express.Router()
const {
  crearTrabajo, listarTrabajos, misTrabajos, obtenerTrabajo,
  aceptarTrabajo, validarPinTrabajo, completarTrabajo, calificarTrabajo,
  cancelarTrabajo, obtenerCandidatos, obtenerCalificacion, historialTrabajos,
  tarifario, cotizarTrabajo, motivosCancelacion,
} = require('../controllers/trabajosController')
const { enviarMensaje, listarMensajes } = require('../controllers/mensajesController')
const { subirEvidencia, listarEvidencia } = require('../controllers/evidenciaController')
const { motivosDisputa, crearDisputa, listarMisDisputas } = require('../controllers/disputasController')
const { obtenerUbicacionTrabajador } = require('../controllers/ubicacionController')
const { autenticar, soloEmpleado, soloEmpleador } = require('../middleware/auth')

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } })

// Igual que upload.single(campo), pero un error de multer (ej. foto de más de 10MB)
// vuelve como 400 con mensaje claro en vez de caer en el errorHandler como 500.
function fotoOpcional(campo) {
  const middleware = upload.single(campo)
  return (req, res, next) => middleware(req, res, (err) => {
    if (!err) return next()
    console.error(`Upload rechazado en ${req.originalUrl}: ${err.code ?? ''} ${err.message}`)
    const mensaje = err.code === 'LIMIT_FILE_SIZE' ? 'La foto puede pesar hasta 10MB' : 'No pudimos leer la foto enviada'
    res.status(400).json({ error: mensaje })
  })
}

// Rutas fijas ANTES de '/:id' (si no, Express las toma como un id).
router.get('/',                         autenticar, listarTrabajos)
router.get('/historial',                autenticar, historialTrabajos)
router.get('/mios',                     autenticar, misTrabajos)
router.get('/precios',                  autenticar, tarifario)
router.get('/cotizar',                  autenticar, soloEmpleador, cotizarTrabajo)
router.get('/motivos-cancelacion',      autenticar, motivosCancelacion)
router.get('/motivos-disputa',          autenticar, motivosDisputa)
router.get('/:id',                      autenticar, obtenerTrabajo)
router.get('/:id/candidatos',           autenticar, soloEmpleador, obtenerCandidatos)
router.post('/',                        autenticar, soloEmpleador, crearTrabajo)
router.post('/:id/aceptar',             autenticar, soloEmpleado,  aceptarTrabajo)
router.post('/:id/validar-pin',         autenticar, soloEmpleado,  validarPinTrabajo)
router.post('/:id/completar',           autenticar, completarTrabajo)
router.post('/:id/cancelar',            autenticar, cancelarTrabajo)
router.post('/:id/calificar',           autenticar, soloEmpleador, calificarTrabajo)
router.get('/:id/calificacion',         autenticar, obtenerCalificacion)
router.post('/:id/mensajes',            autenticar, enviarMensaje)
router.get('/:id/mensajes',             autenticar, listarMensajes)
router.post('/:id/evidencia',           autenticar, soloEmpleado,  upload.single('foto'), subirEvidencia)
router.get('/:id/evidencia',            autenticar, listarEvidencia)
router.post('/:id/disputas',            autenticar, fotoOpcional('foto'), crearDisputa)
router.get('/:id/disputas',             autenticar, listarMisDisputas)
router.get('/:id/ubicacion-trabajador', autenticar, soloEmpleador, obtenerUbicacionTrabajador)

module.exports = router
