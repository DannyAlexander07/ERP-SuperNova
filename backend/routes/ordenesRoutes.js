// Ubicacion: SuperNova/backend/routes/ordenesRoutes.js
const express = require('express');
const router = express.Router();
const ordenesController = require('../controllers/ordenesController');
const { checkAuth, checkRole } = require('../middleware/auth'); 

// ==========================================
// 1. RUTAS INTERNAS (ERP SUPERNOVA)
// ==========================================

// 👁️ VISIBILIDAD AMPLIADA: Listar todas (Ahora incluye gerentes, finanzas y directores)
router.get('/', checkAuth, checkRole(['admin', 'superadmin', 'compras', 'logistica', 'gerente', 'finanzas', 'director']), ordenesController.obtenerOrdenesInternas);

// 🚀 CREACIÓN MÁGICA: Sin multer. El frontend manda JSON y el backend dibuja el PDF.
router.post('/', checkAuth, checkRole(['admin', 'superadmin', 'compras', 'logistica']), ordenesController.crearOrdenCompra);

// Cambiar estado (Anular, Marcar como facturada, etc)
router.put('/:id/estado', checkAuth, checkRole(['admin', 'superadmin', 'compras', 'logistica']), ordenesController.actualizarEstadoOC);

// ==========================================
// 2. RUTAS B2B (PORTAL PROVEEDORES)
// ==========================================

// El proveedor solo puede hacer GET (leer) de sus propias órdenes.
router.get('/b2b/mis-ordenes', checkAuth, ordenesController.obtenerOrdenesB2B);

// Validar OC desde el B2B antes de facturar (El Botón Mágico)
router.get('/validar-b2b/:codigo', checkAuth, ordenesController.validarOrdenCompraB2B);

module.exports = router;