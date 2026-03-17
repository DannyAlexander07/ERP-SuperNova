// Ubicacion: SuperNova/backend/routes/ordenesRoutes.js
const express = require('express');
const router = express.Router();
const ordenesController = require('../controllers/ordenesController');
const { checkAuth, checkRole } = require('../middleware/auth'); 

// Importar configuración de Cloudinary (Asegúrate de que la ruta sea correcta según tu proyecto)
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

// Configuración rápida de almacenamiento para PDFs de Órdenes de Compra
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'supernova_ordenes_compra',
        resource_type: 'auto' // Permite PDFs
    }
});
const upload = multer({ storage: storage });

// ==========================================
// 1. RUTAS INTERNAS (ERP SUPERNOVA)
// ==========================================
// Listar todas
router.get('/', checkAuth, checkRole(['admin', 'superadmin', 'compras']), ordenesController.obtenerOrdenesInternas);
// Crear OC subiendo el PDF
router.post('/', checkAuth, checkRole(['admin', 'superadmin', 'compras']), upload.single('pdf'), ordenesController.crearOrdenCompra);
// Cambiar estado (Anular, Marcar como facturada, etc)
router.put('/:id/estado', checkAuth, checkRole(['admin', 'superadmin', 'compras']), ordenesController.actualizarEstadoOC);

// ==========================================
// 2. RUTAS B2B (PORTAL PROVEEDORES)
// ==========================================
// El proveedor solo puede hacer GET (leer) de sus propias órdenes. La seguridad la pone 'checkAuth'
router.get('/b2b/mis-ordenes', checkAuth, ordenesController.obtenerOrdenesB2B);

module.exports = router;