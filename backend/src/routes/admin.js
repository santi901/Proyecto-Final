const express = require('express')
const router  = express.Router()
const {
  resumen, listarUsuarios, cambiarSuspension, cambiarVerificacion,
  listarTrabajos, listarTransacciones,
} = require('../controllers/adminController')
const { soloAdmin } = require('../middleware/admin')
const { validar, validarIdParam } = require('../middleware/validar')
const { limites } = require('../middleware/seguridad')
const esquemas = require('../validacion/esquemas')

// Todo /api/admin/* va con la clave compartida (header x-admin-key). El limitador va
// antes para que no se pueda adivinar la clave a fuerza bruta.
router.use(limites.admin, soloAdmin)
router.param('id', validarIdParam)

router.get('/resumen',                     resumen)
router.get('/usuarios',                    validar(esquemas.usuariosQuery, 'query'), listarUsuarios)
router.post('/usuarios/:id/suspension',    validar(esquemas.suspension), cambiarSuspension)
router.post('/usuarios/:id/verificacion',  validar(esquemas.verificacion), cambiarVerificacion)
router.get('/trabajos',                    validar(esquemas.trabajosAdminQuery, 'query'), listarTrabajos)
router.get('/transacciones',               validar(esquemas.transaccionesQuery, 'query'), listarTransacciones)

module.exports = router
