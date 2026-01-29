const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const { checkAuth } = require('../middleware/auth'); // ✅ Usamos tu middleware como lo tienes

// Rutas de Leads (CRM Clásico)
router.get('/', checkAuth, crmController.obtenerLeads);
router.post('/', checkAuth, crmController.crearLead);
router.put('/:id', checkAuth, crmController.actualizarLead);
router.delete('/:id', checkAuth, crmController.eliminarLead);
router.put('/:id/estado', checkAuth, crmController.actualizarEstado);

// Rutas de Calendario / Eventos
router.get('/eventos/todos', checkAuth, crmController.obtenerEventos);

// Rutas de Inventario para CRM
router.get('/salones', checkAuth, crmController.obtenerSalonesPorSede);

// 🔥 RUTA DE COBRO FINAL (Correcta)
// Esta es la que llama tu Frontend (/api/crm/leads/:id/cobrar-saldo)
router.post('/leads/:id/cobrar-saldo', checkAuth, crmController.cobrarSaldoLead);

// ❌ HE BORRADO la ruta vieja router.post('/:id/cobrar'...) porque causaba el crash.

module.exports = router;