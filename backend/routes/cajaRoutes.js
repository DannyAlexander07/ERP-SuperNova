// Ubicacion: SuperNova/backend/routes/cajaRoutes.js
const express = require('express');
const router = express.Router();
const cajaController = require('../controllers/cajaController');
const { checkAuth } = require('../middleware/auth'); 

// 1. Obtener Movimientos (Historial)
router.get('/', checkAuth, cajaController.obtenerMovimientos);

// 2. Registrar Movimiento Manual (Ingreso/Egreso)
router.post('/', checkAuth, cajaController.registrarMovimiento);

// 3. Obtener Resumen del Día (Saldo y KPIs)
router.get('/resumen', checkAuth, cajaController.obtenerResumenCaja);

// 🔥 4. NUEVA RUTA: Autorizar Tope de Efectivo (Para quitar la alerta roja)
router.post('/autorizar-tope', checkAuth, cajaController.autorizarTope);

module.exports = router;