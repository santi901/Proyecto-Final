const express = require('express')
const router  = express.Router()
const {
  resumen, listarUsuarios,
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
router.get('/trabajos',                    validar(esquemas.trabajosAdminQuery, 'query'), listarTrabajos)
router.get('/transacciones',               validar(esquemas.transaccionesQuery, 'query'), listarTransacciones)

module.exports = router
