// Ubicación: SuperNova/backend/routes/facturasRoutes.js
const express = require('express');
const router = express.Router();
const facturasController = require('../controllers/facturasController');
const { checkAuth, checkRole } = require('../middleware/auth'); 
const multer = require('multer');
const path = require('path');
const mime = require('mime-types');

// --- Configuración Avanzada de Multer (Manejo de Archivos) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads/');
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        let fileExtension = path.extname(file.originalname);

        if (!fileExtension && file.mimetype) {
            const inferredExt = mime.extension(file.mimetype);
            if (inferredExt) {
                fileExtension = `.${inferredExt}`;
            }
        }
        
        const originalNameSanitized = path.basename(file.originalname, path.extname(file.originalname)).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        cb(null, `${originalNameSanitized}-${uniqueSuffix}${fileExtension}`);
    }
});

const upload = multer({ storage: storage });

// ==========================================
// 1. RUTAS DE GASTOS / FACTURAS
// ==========================================

// Obtener lista de facturas (GET)
router.get('/', checkAuth, facturasController.obtenerFacturas);

// Crear nueva factura con evidencia (POST)
router.post('/', checkAuth, upload.single('evidencia'), facturasController.crearFactura);

// Actualizar factura existente (PUT)
router.put('/:id', checkAuth, upload.single('evidencia'), facturasController.actualizarFactura);

// Registrar PAGO de factura (Parcial o Total) (POST)
router.post('/pago/:id', checkAuth, facturasController.pagarFactura);

// Subir archivo faltante a una factura (POST)
router.post('/upload/:id', checkAuth, upload.single('archivo'), facturasController.subirArchivo);

// Eliminar factura (DELETE) - Solo Admins por seguridad financiera
router.delete('/:id', checkAuth, checkRole(['admin', 'superadmin']), facturasController.eliminarFactura);

router.get('/kpis/resumen-pagos', checkAuth, facturasController.obtenerKpisPagos);


module.exports = router;