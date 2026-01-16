// Ubicacion: SuperNova/backend/routes/inventarioRoutes.js
const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventarioController');
const { checkAuth } = require('../middleware/auth'); // Importamos como checkAuth

// 1. Obtener lista de productos
router.get('/', checkAuth, inventarioController.obtenerProductos);

// 2. Obtener Kardex
router.get('/kardex', checkAuth, inventarioController.obtenerKardex);

// 3. Crear Producto Nuevo
router.post('/', checkAuth, inventarioController.crearProducto);

// 4. Actualizar Producto
router.put('/:id', checkAuth, inventarioController.actualizarProducto);

// 5. Ajustar Stock
router.put('/:id/stock', checkAuth, inventarioController.ajustarStock);

// 6. Eliminar Producto
router.delete('/:id', checkAuth, inventarioController.eliminarProducto);

// 7. Obtener Receta Combo (CORREGIDO)
router.get('/:id/receta', checkAuth, inventarioController.obtenerRecetaCombo); // <--- Usamos checkAuth

module.exports = router;