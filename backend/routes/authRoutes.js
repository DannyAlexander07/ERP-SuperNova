// Ubicacion: SuperNova/backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Ruta: POST /api/auth/login
router.post('/login', authController.login);

router.post('/login-proveedor', authController.loginProveedor);

router.post('/proveedores/registro', authController.registrarProveedor);

module.exports = router;