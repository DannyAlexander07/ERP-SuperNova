// Ubicacion: SuperNova/backend/routes/ventasRoutes.js
const express = require('express');
const router = express.Router();
const ventasController = require('../controllers/ventasController');
const { checkAuth, checkRole } = require('../middleware/auth');

// 1. Registrar Nueva Venta
router.post('/', checkAuth, ventasController.registrarVenta);

// 2. Obtener Historial Completo
router.get('/historial', checkAuth, ventasController.obtenerHistorialVentas);

// 3. Obtener Detalle de una Venta (Para el botón de Lupa) 🔍
// 🚨 ESTA ES LA RUTA QUE FALTABA O DEBES VERIFICAR
router.get('/detalle/:id', checkAuth, ventasController.obtenerDetalleVenta);

// 4. Eliminar Venta (Solo Admin)
router.delete('/:id', checkAuth, checkRole(['admin', 'administrador']), ventasController.eliminarVenta);

module.exports = router;