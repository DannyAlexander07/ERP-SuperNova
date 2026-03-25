// Ubicación: SuperNova/backend/routes/facturasRoutes.js
const express = require('express');
const router = express.Router();
const facturasController = require('../controllers/facturasController');
const { checkAuth, checkRole } = require('../middleware/auth'); 
const multer = require('multer');

// 🔥 IMPORTAMOS CLOUDINARY Y CONFIGURAMOS CREDENCIALES 🔥
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

const { CloudinaryStorage } = require('multer-storage-cloudinary');

// --- Configuración Avanzada de Multer para CLOUDINARY ---
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        const nombreReal = Buffer.from(file.originalname, 'latin1').toString('utf8');
        const partes = nombreReal.split('.');
        const extension = partes.pop().toLowerCase(); 
        const nombreBase = partes.join('.'); 
        
        let nombreLimpio = nombreBase.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        nombreLimpio = nombreLimpio.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
        
        const codigoCorto = Math.random().toString(36).substring(2, 6);
        
        const esImagen = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extension);
        const idFinal = esImagen 
            ? `${nombreLimpio}-${codigoCorto}` 
            : `${nombreLimpio}-${codigoCorto}.${extension}`;
        
        return {
            folder: 'supernova_facturas', 
            resource_type: 'auto',
            public_id: idFinal 
        };
    }
});

const upload = multer({ storage: storage });

// 🔥 CONFIGURACIÓN DE MULTER MULTIPLE PARA B2B (Múltiples archivos)
const uploadFieldsB2B = upload.fields([
    { name: 'pdf', maxCount: 1 }, 
    { name: 'xml', maxCount: 1 },
    { name: 'pdf_oc', maxCount: 1 } // Soporte para la Orden de Compra
]);

// ==========================================
// 1. RUTAS DE GASTOS / FACTURAS
// ==========================================

router.get('/', checkAuth, facturasController.obtenerFacturas);
router.post('/', checkAuth, upload.single('evidencia'), facturasController.crearFactura);
router.put('/:id', checkAuth, upload.single('evidencia'), facturasController.actualizarFactura);
router.post('/pago/:id', checkAuth, facturasController.pagarFactura);

// Ruta con Depurador Integrado
router.post('/upload/:id', checkAuth, (req, res, next) => {
    const uploadHandler = upload.single('archivo');
    uploadHandler(req, res, function (err) {
        if (err) {
            console.error("\n🚨 [DEBUG CLOUDINARY/MULTER] ERROR DETALLADO:");
            console.error(err); 
            return res.status(500).json({ msg: 'Error al subir a Cloudinary', detalle: err });
        }
        next();
    });
}, facturasController.subirArchivo);

router.delete('/:id', checkAuth, checkRole(['admin', 'superadmin']), facturasController.eliminarFactura);
router.get('/kpis/resumen-pagos', checkAuth, facturasController.obtenerKpisPagos);

// ==========================================
// 2. PROGRAMACIÓN DE TESORERÍA (PAGOS DE HOY)
// ==========================================
router.get('/programacion/hoy', checkAuth, facturasController.obtenerFacturasProgramadas);
router.get('/programacion/resumen', checkAuth, facturasController.obtenerResumenTesoria);
router.put('/:id/programar', checkAuth, facturasController.alternarProgramacion);

// ==========================================
// 3. FLUJO DE APROBACIÓN Y NOTIFICACIONES
// ==========================================
router.post('/aprobar-individual', checkAuth, checkRole(['admin', 'superadmin']), facturasController.aprobarFacturaIndividual);
router.post('/aprobar-masiva', checkAuth, checkRole(['admin', 'superadmin']), facturasController.aprobarFacturasMasiva);
router.post('/enviar-plan-pagos', checkAuth, facturasController.notificarPlanPagos);

// ==========================================
// 4. HISTORIAL Y MODAL "VER"
// ==========================================
router.put('/:id/estado', checkAuth, facturasController.cambiarEstadoAprobacion);
router.get('/:id/pagos', checkAuth, facturasController.obtenerHistorialPagos);
router.get('/:id/documentos', checkAuth, facturasController.obtenerDocumentos);
router.post('/:id/documentos', checkAuth, upload.single('archivo'), facturasController.subirDocumentoExtra);
router.delete('/documentos/:docId', checkAuth, facturasController.eliminarDocumento);

// ==========================================
// 5. RUTAS B2B (PORTAL DE PROVEEDORES)
// ==========================================

// ✅ Recepción de Facturas con los 3 archivos (Corregido y Unificado)
router.post('/b2b/recepcion', checkAuth, uploadFieldsB2B, facturasController.recepcionarFacturaB2B);

router.get('/b2b/mis-comprobantes', checkAuth, facturasController.obtenerMisComprobantesB2B);
router.get('/b2b/dashboard', checkAuth, facturasController.obtenerDashboardB2B);

// Ruta para el Botón Mágico del Portal B2B
router.get('/validar-b2b/:codigo', checkAuth, facturasController.validarOrdenCompraB2B);
// --- NOTIFICACIONES B2B ---
router.get('/b2b/notificaciones', checkAuth, facturasController.obtenerNotificacionesB2B);
router.put('/b2b/notificaciones/leer', checkAuth, facturasController.marcarLeidasB2B);

// --- COMUNICADOS B2B ---
router.get('/b2b/comunicado', checkAuth, facturasController.obtenerComunicadoB2B);

module.exports = router;