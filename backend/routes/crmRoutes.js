// Ubicacion: SuperNova/backend/routes/crmRoutes.js
const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const { checkAuth } = require('../middleware/auth');

router.get('/', checkAuth, crmController.obtenerLeads);
router.post('/', checkAuth, crmController.crearLead);
router.put('/:id', checkAuth, crmController.actualizarLead);
router.delete('/:id', checkAuth, crmController.eliminarLead);

router.put('/:id/estado', checkAuth, crmController.actualizarEstado);

router.get('/eventos/todos', checkAuth, crmController.obtenerEventos);

router.post('/:id/cobrar', checkAuth, crmController.cobrarSaldo);

module.exports = router;
