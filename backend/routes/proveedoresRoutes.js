// Ubicacion: SuperNova/backend/routes/proveedoresRoutes.js
const express = require('express');
const router = express.Router();
const proveedoresController = require('../controllers/proveedoresController');

// CAMBIO CLAVE: Importamos el objeto y desestructuramos checkAuth
const { checkAuth, checkRole } = require('../middleware/auth');

// 🔥 CORRECCIÓN: Importamos la configuración de Cloudinary
const { uploadCloud } = require('../utils/cloudinaryConfig');

// ==========================================
// 1. RUTAS ESTÁTICAS (Siempre arriba de los /:id)
// ==========================================

// Rutas protegidas generales
router.get('/', checkAuth, proveedoresController.obtenerProveedores);
router.post('/', checkAuth, proveedoresController.crearProveedor);

// Rutas B2B Básicas
router.get('/b2b/mi-perfil', checkAuth, proveedoresController.obtenerMiPerfilB2B);
router.put('/b2b/mi-perfil', checkAuth, proveedoresController.actualizarMiPerfilB2B);

// --- 🆕 RUTA PERFIL PREMIUM B2B (Maneja la foto) ---
router.put('/b2b/perfil', checkAuth, uploadCloud.single('foto'), proveedoresController.actualizarPerfilB2B);

// Rutas Onboarding (Invitación B2B)
router.post('/generar-invitacion', checkAuth, checkRole(['superadmin', 'admin', 'logistica', 'gerente', 'finanzas','director']), proveedoresController.generarCodigoInvitacion);

// ==========================================
// 2. RUTAS DINÁMICAS (Con /:id siempre al final)
// ==========================================

router.put('/:id', checkAuth, proveedoresController.actualizarProveedor);
router.delete('/:id', checkAuth, proveedoresController.eliminarProveedor);
router.put('/:id/generar-codigo', checkAuth, checkRole(['superadmin', 'admin', 'logistica', 'gerente', 'finanzas','director']), proveedoresController.generarCodigoAcceso);

// Ruta: Forzar Contraseña B2B
router.post('/:id/forzar-password', checkAuth, checkRole(['superadmin', 'admin', 'logistica', 'gerente', 'finanzas','director']), proveedoresController.forzarPasswordB2B);

// Ruta: Obtener un solo proveedor (SOLUCIONA EL ERROR 404 DE LOS BANCOS)
router.get('/:id', checkAuth, proveedoresController.obtenerProveedorPorId);

module.exports = router;