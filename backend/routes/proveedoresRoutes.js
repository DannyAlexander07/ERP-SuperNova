// Ubicacion: SuperNova/backend/routes/proveedoresRoutes.js
const express = require('express');
const router = express.Router();
const proveedoresController = require('../controllers/proveedoresController');
// CAMBIO CLAVE: Importamos el objeto y desestructuramos checkAuth
const { checkAuth } = require('../middleware/auth'); 

// Rutas protegidas
router.get('/', checkAuth, proveedoresController.obtenerProveedores);
router.post('/', checkAuth, proveedoresController.crearProveedor);
router.put('/:id', checkAuth, proveedoresController.actualizarProveedor);
router.delete('/:id', checkAuth, proveedoresController.eliminarProveedor);

module.exports = router;