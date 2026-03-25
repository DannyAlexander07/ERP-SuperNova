// Ubicacion: SuperNova/backend/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');

// Ruta: POST /api/auth/login (Tu ERP Interno)
router.post('/login', authController.login);

// Rutas exclusivas del Portal B2B
router.post('/login-proveedor', authController.loginProveedor);
router.post('/registrar-proveedor', authController.registrarProveedor); 

// --- 🆕 RUTAS DE VERIFICACIÓN OTP ---
router.post('/solicitar-verificacion-email', authController.solicitarVerificacionEmail);
router.post('/validar-codigo-email', authController.validarCodigoEmail);

// Ruta para recuperar contraseña del portal B2B
router.post('/recuperar-clave', authController.recuperarClave);

module.exports = router;