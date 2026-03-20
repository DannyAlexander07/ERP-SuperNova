// Ubicacion: SuperNova/backend/routes/proveedoresRoutes.js
const express = require('express');
const router = express.Router();
const proveedoresController = require('../controllers/proveedoresController');
// CAMBIO CLAVE: Importamos el objeto y desestructuramos checkAuth
const { checkAuth, checkRole } = require('../middleware/auth');

// Rutas protegidas
router.get('/', checkAuth, proveedoresController.obtenerProveedores);
router.post('/', checkAuth, proveedoresController.crearProveedor);
router.put('/:id', checkAuth, proveedoresController.actualizarProveedor);
router.delete('/:id', checkAuth, proveedoresController.eliminarProveedor);
router.get('/b2b/mi-perfil', checkAuth, proveedoresController.obtenerMiPerfilB2B);
router.put('/b2b/mi-perfil', checkAuth, proveedoresController.actualizarMiPerfilB2B);
router.put('/:id/generar-codigo', checkAuth, checkRole(['superadmin', 'admin', 'logistica', 'gerente', 'finanzas']), proveedoresController.generarCodigoAcceso);

// 🔥 NUEVA RUTA: Forzar Contraseña B2B
router.post('/:id/forzar-password', checkAuth, checkRole(['superadmin', 'admin', 'logistica', 'gerente', 'finanzas']), proveedoresController.forzarPasswordB2B);

// ==========================================
// RUTAS ONBOARDING (INVITACIÓN B2B)
// ==========================================
router.post('/generar-invitacion', checkAuth, checkRole(['superadmin', 'admin', 'logistica', 'gerente', 'finanzas']), proveedoresController.generarCodigoInvitacion);

module.exports = router;