// UBICACIÓN: backend/routes/ecommerceRoutes.js
const express = require('express');
const router = express.Router();
const ecommerceController = require('../controllers/ecommerceController');
const { checkAuth } = require('../middleware/auth'); // Usamos tu misma seguridad

// --- RUTAS INTERNAS PARA EL ERP (Requieren sesión de cajero) ---

// Obtener la lista de pedidos web para mostrarlos en la tabla
router.get('/pedidos', checkAuth, ecommerceController.obtenerPedidosWeb);

// Marcar un pedido como entregado (Botón verde)
router.put('/pedidos/:id/entregar', checkAuth, ecommerceController.entregarPedidoWeb);

module.exports = router;