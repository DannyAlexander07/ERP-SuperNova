//Ubicacion: backend/routes/cajaChicaRoutes.js

const express = require('express');
const router = express.Router();
const cajaChicaController = require('../controllers/cajaChicaController');
const { checkAuth } = require('../middleware/auth');

router.get('/', checkAuth, cajaChicaController.obtenerResumen);
router.post('/', checkAuth, cajaChicaController.registrarMovimiento);

module.exports = router;