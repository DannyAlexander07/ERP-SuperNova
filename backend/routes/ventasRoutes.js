// UBICACIÓN: SuperNova/backend/routes/ventasRoutes.js
const express = require('express');
const router = express.Router();
const ventasController = require('../controllers/ventasController');
const { checkAuth, checkRole } = require('../middleware/auth');

// 1. Obtener lista de trabajadores (PARA EL SELECT DE VENDEDORES)
// 🔥 ESTA ES LA NUEVA RUTA NECESARIA
router.get('/vendedores', checkAuth, ventasController.obtenerVendedores);

// 2. Registrar Nueva Venta
router.post('/', checkAuth, ventasController.registrarVenta);

// 3. Obtener Historial Completo
router.get('/historial', checkAuth, ventasController.obtenerHistorialVentas);

// 4. Obtener Detalle de una Venta (Para el botón de Lupa 🔍)
router.get('/detalle/:id', checkAuth, ventasController.obtenerDetalleVenta);

// 5. Eliminar Venta (Solo Admin)
router.delete('/:id', checkAuth, checkRole(['admin', 'administrador', 'superadmin']), ventasController.eliminarVenta);

module.exports = router;