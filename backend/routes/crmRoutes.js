// Ubicacion: SuperNova/backend/routes/crmRoutes.js
const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const { checkAuth } = require('../middleware/auth'); // Asegúrate que tu middleware se llame así (o 'auth')

// Rutas de Leads (CRM Clásico)
router.get('/', checkAuth, crmController.obtenerLeads);
router.post('/', checkAuth, crmController.crearLead);
router.put('/:id', checkAuth, crmController.actualizarLead);
router.delete('/:id', checkAuth, crmController.eliminarLead);
router.put('/:id/estado', checkAuth, crmController.actualizarEstado);

// Rutas de Calendario / Eventos
router.get('/eventos/todos', checkAuth, crmController.obtenerEventos);

// 🔥 NUEVA RUTA: Obtener Salones (Filtrados por Sede)
router.get('/salones', checkAuth, crmController.obtenerSalonesPorSede);

// Rutas Financieras del CRM
router.post('/:id/cobrar', checkAuth, crmController.cobrarSaldo);

module.exports = router;