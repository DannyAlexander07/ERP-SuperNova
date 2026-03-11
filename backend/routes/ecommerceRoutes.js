// UBICACIÓN: backend/routes/ecommerceRoutes.js
const express = require('express');
const router = express.Router();
const ecommerceController = require('../controllers/ecommerceController');
const { checkAuth } = require('../middleware/auth'); // Usamos tu misma seguridad

// --- RUTAS INTERNAS PARA EL ERP (Requieren sesión de cajero) ---

// Obtener la lista de pedidos web pendientes (Pestaña 1)
router.get('/pedidos', checkAuth, ecommerceController.obtenerPedidosWeb);

// Marcar un pedido como entregado (Botón verde)
router.put('/pedidos/:id/entregar', checkAuth, ecommerceController.entregarPedidoWeb);

// 🔥 NUEVA RUTA: Obtener el historial completo de ventas web (Pestaña 2)
router.get('/historial', checkAuth, ecommerceController.obtenerHistorialWeb);

// Obtener el detalle de los productos de un pedido específico (Para el Modal)
router.get('/pedidos/:id/detalle', checkAuth, ecommerceController.obtenerDetallePedidoWeb);

// Ruta para que el Ecommerce verifique stock antes de vender
router.get('/stock/:producto_id/:sede_id', ecommerceController.consultarStockEcommerce);

module.exports = router;