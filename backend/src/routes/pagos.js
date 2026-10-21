const express = require('express')
const router  = express.Router()
const {
  recibirWebhook, retornoCheckout, misLiquidaciones, listarLiquidacionesAdmin, marcarLiquidacionPagada,
} = require('../controllers/pagosController')
const { autenticar, soloEmpleado } = require('../middleware/auth')
const { soloAdmin } = require('../middleware/admin')
const { validar, validarIdParam } = require('../middleware/validar')
const esquemas = require('../validacion/esquemas')

router.param('id', validarIdParam)

// Públicas: las llama MercadoPago (el webhook se valida por firma).
router.post('/webhook', recibirWebhook)
router.get('/retorno',  retornoCheckout)

router.get('/mis-liquidaciones', autenticar, soloEmpleado, misLiquidaciones)

// Admin (header x-admin-key): transferencias manuales a los trabajadores.
router.get('/admin/liquidaciones',            soloAdmin, validar(esquemas.liquidacionesQuery, 'query'), listarLiquidacionesAdmin)
router.post('/admin/liquidaciones/:id/pagar', soloAdmin, validar(esquemas.marcarLiquidacion), marcarLiquidacionPagada)

module.exports = router
