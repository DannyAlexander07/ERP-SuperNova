//Ubicacion: backend/routes/prestamosRoutes.js

const express = require('express');
const router = express.Router();
const prestamosController = require('../controllers/prestamosController');
const { checkAuth } = require('../middleware/auth');

// Rutas base
router.get('/', checkAuth, prestamosController.obtenerPrestamos);
router.post('/', checkAuth, prestamosController.crearPrestamo);
router.get('/:id', checkAuth, prestamosController.obtenerDetallePrestamo);

// NUEVAS RUTAS (Agrega estas)
router.post('/simular', checkAuth, prestamosController.simularPrestamo); // Para el botón "Simular"
router.post('/cuota/:id/pagar', checkAuth, prestamosController.pagarCuota); // Para pagar una cuota específica

router.get('/:id/contrato', checkAuth, prestamosController.generarContrato);

// Editar
router.put('/:id', checkAuth, prestamosController.actualizarPrestamo);

// Eliminar
router.delete('/:id', checkAuth, prestamosController.eliminarPrestamo);

module.exports = router;