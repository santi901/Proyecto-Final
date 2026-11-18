const express = require('express')
const router  = express.Router()
const { listarDisputasAdmin, obtenerDisputaAdmin, actualizarDisputaAdmin } = require('../controllers/disputasController')
const { soloAdmin } = require('../middleware/admin')

// Sprint 6 — API del panel de admin. Todo protegido con x-admin-key (ver middleware/admin.js).
router.use(soloAdmin)

router.get('/disputas',       listarDisputasAdmin)
router.get('/disputas/:id',   obtenerDisputaAdmin)
router.patch('/disputas/:id', actualizarDisputaAdmin)

module.exports = router
