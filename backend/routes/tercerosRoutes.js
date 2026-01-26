//Ubicacion: backend/routes/tercerosRoutes.js

const express = require('express');
const router = express.Router();
const tercerosController = require('../controllers/tercerosController');

// Aquí mantengo tu estilo "{ checkAuth }" por si acaso, pero revisa si te da error 500.
const { checkAuth } = require('../middleware/auth'); 
// Si te da error de "checkAuth is not a function", cambia la línea anterior por:
// const auth = require('../middleware/auth'); y reemplaza 'checkAuth' por 'auth' abajo.

// Prefijo: /api/terceros

// 1. Gestión de Canales
router.get('/canales', checkAuth, tercerosController.obtenerCanales);
router.post('/canales', checkAuth, tercerosController.crearCanal);

// 2. Acuerdos y Carga (Backoffice)
// 🔥 ESTA ERA LA RUTA QUE FALTABA PARA LA TABLA (GET)
router.get('/acuerdos', checkAuth, tercerosController.listarAcuerdos); 
router.post('/acuerdos', checkAuth, tercerosController.crearAcuerdo);
router.delete('/acuerdos/:id', checkAuth, tercerosController.eliminarAcuerdo); // <--- AGREGAR ESTA LÍNEA 🔥
router.post('/codigos/carga-masiva', checkAuth, tercerosController.cargarCodigos);
router.get('/acuerdos/:id/detalle', checkAuth, tercerosController.obtenerDetalleAcuerdo);
router.get('/acuerdos/:id/codigos', checkAuth, tercerosController.listarCodigosPorAcuerdo);

router.get('/acuerdos/:id/cuotas', checkAuth, tercerosController.obtenerCuotasAcuerdo);
router.post('/cuotas/:id/pagar', checkAuth, tercerosController.pagarCuota);

router.get('/historial-total', checkAuth, tercerosController.obtenerHistorialTotal);
router.put('/cuotas/:id', checkAuth, tercerosController.editarCuota);
// 3. Operación (Caja y Validación)
router.post('/validar', checkAuth, tercerosController.validarYCanjear);
// 🔥 ESTA ERA LA RUTA QUE FALTABA PARA EL HISTORIAL (GET)
router.get('/historial', checkAuth, tercerosController.obtenerHistorialCanjes);

module.exports = router;