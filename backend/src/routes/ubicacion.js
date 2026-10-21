const express = require('express')
const router  = express.Router()
const { calcularViaje, actualizarUbicacion, obtenerUbicacionCache } = require('../controllers/ubicacionController')
const { autenticar } = require('../middleware/auth')
const { validar, validarIdParam } = require('../middleware/validar')
const esquemas = require('../validacion/esquemas')

router.param('workerId', validarIdParam)

router.get('/calcular-viaje',        autenticar, validar(esquemas.calcularViajeQuery, 'query'), calcularViaje)
router.post('/actualizar-ubicacion', autenticar, validar(esquemas.actualizarUbicacion), actualizarUbicacion)
router.get('/:workerId',             autenticar, obtenerUbicacionCache)

module.exports = router
