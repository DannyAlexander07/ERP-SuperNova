// Ubicacion: SuperNova/backend/routes/consultasRoutes.js
const express = require('express');
const router = express.Router();
const consultasController = require('../controllers/consultasController');
const { checkAuth } = require('../middleware/auth');// Solo usuarios logueados pueden consultar

// Endpoint unificado: Detecta automáticamente si es DNI o RUC por el largo
// GET /api/consultas/20131312955
router.get('/:numero', checkAuth, consultasController.consultarEntidad);

module.exports = router;