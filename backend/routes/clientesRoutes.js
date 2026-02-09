// Ubicacion: SuperNova/backend/routes/clientesRoutes.js
const express = require('express');
const router = express.Router();
const clientesController = require('../controllers/clientesController');
// CAMBIO CLAVE: Importamos el objeto y desestructuramos checkAuth
const { checkAuth } = require('../middleware/auth'); 

// Rutas protegidas con token
router.get('/', checkAuth, clientesController.obtenerClientes);       // Leer (Lista)
router.post('/', checkAuth, clientesController.crearCliente);         // Crear
router.put('/:id', checkAuth, clientesController.actualizarCliente);  // Actualizar
router.delete('/:id', checkAuth, clientesController.eliminarCliente); // Eliminar
router.get('/consulta-identidad', checkAuth, clientesController.buscarIdentidad); // Consulta DNI/RUC

module.exports = router;