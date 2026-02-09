// Ubicacion: backend/routes/facturacionRoutes.js
const express = require('express');
const router = express.Router();
const facturacionController = require('../controllers/facturacionController');
const { checkAuth } = require('../middleware/auth');  // Tu middleware de seguridad

// Ruta: POST /api/facturacion/emitir
router.post('/emitir', checkAuth, facturacionController.emitirComprobante);

router.post('/reenviar-email', checkAuth, facturacionController.reenviarCorreoPropio);

module.exports = router;