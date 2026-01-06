// Ubicacion: SuperNova/backend/routes/sedesRoutes.js
const express = require('express');
const router = express.Router();
const sedesController = require('../controllers/sedesController');

// 👇 IMPORTACIÓN CORRECTA: Usamos destructuración porque auth.js exporta un objeto { checkAuth, ... }
const { checkAuth } = require('../middleware/auth'); 

// 1. Obtener todas las sedes
// Usamos 'checkAuth' porque así se llama la función que importamos
router.get('/', checkAuth, sedesController.obtenerSedes);

// 2. Obtener salones por ID de sede
router.get('/salones/:sedeId', checkAuth, sedesController.obtenerSalonesPorSede);

module.exports = router;