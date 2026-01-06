// Ubicacion: SuperNova/backend/routes/inventarioRoutes.js
const express = require('express');
const router = express.Router();
const inventarioController = require('../controllers/inventarioController');
const { checkAuth } = require('../middleware/auth'); // Asegúrate de usar llaves {}

// 1. Obtener lista de productos (con stock de la sede)
router.get('/', checkAuth, inventarioController.obtenerProductos);

// 2. Obtener Kardex
router.get('/kardex', checkAuth, inventarioController.obtenerKardex);

// 3. Crear Producto Nuevo
router.post('/', checkAuth, inventarioController.crearProducto);

// 4. Actualizar Producto (Nombre, precio, etc.)
router.put('/:id', checkAuth, inventarioController.actualizarProducto);

// 5. Ajustar Stock (Entrada o Salida/Merma)
// 🚨 AQUÍ ESTABA EL ERROR: Antes llamabas a 'agregarStock', ahora es 'ajustarStock'
router.put('/:id/stock', checkAuth, inventarioController.ajustarStock);

// 6. Eliminar Producto
router.delete('/:id', checkAuth, inventarioController.eliminarProducto);

module.exports = router;