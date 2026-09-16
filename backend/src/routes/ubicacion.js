const express = require('express')
const router  = express.Router()
const { calcularViaje, actualizarUbicacion } = require('../controllers/ubicacionController')
const { autenticar } = require('../middleware/auth')

router.get('/calcular-viaje',        autenticar, calcularViaje)
router.post('/actualizar-ubicacion', autenticar, actualizarUbicacion)

module.exports = router
