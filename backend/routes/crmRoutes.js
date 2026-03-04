// UBICACIÓN: SuperNova/backend/routes/crmRoutes.js

const express = require('express');
const router = express.Router();
const crmController = require('../controllers/crmController');
const { checkAuth } = require('../middleware/auth'); 

// --- RUTAS DE CONSULTA Y CATÁLOGOS ---
router.get('/', checkAuth, crmController.obtenerLeads);
router.get('/eventos/todos', checkAuth, crmController.obtenerEventos);
router.get('/salones', checkAuth, crmController.obtenerSalonesPorSede);

// 🔥 NUEVA RUTA: HISTORIAL DE PAGOS
// Esta es fundamental para alimentar el botón de "Ver Pagos" que quieres poner
router.get('/:id/pagos', checkAuth, crmController.obtenerPagosLead);

// --- RUTAS DE OPERACIÓN (POST/PUT/DELETE) ---
router.post('/', checkAuth, crmController.crearLead);
router.put('/:id', checkAuth, crmController.actualizarLead);
router.delete('/:id', checkAuth, crmController.eliminarLead);
router.put('/:id/estado', checkAuth, crmController.actualizarEstado);

// --- RUTAS DE TRANSACCIÓN FINANCIERA ---

// ADELANTO / RESERVA (Modal Verde)
router.post('/leads/:id/pagar', checkAuth, crmController.registrarPagoLead);

// COBRO FINAL (Modal Finalizar)
router.post('/leads/:id/cobrar-saldo', checkAuth, crmController.cobrarSaldoLead);

module.exports = router;