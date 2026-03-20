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
        // 1. Recuperar el nombre original traducido a UTF-8 (Para las tildes y la ñ)
        const nombreReal = Buffer.from(file.originalname, 'latin1').toString('utf8');
        
        // 2. Separar nombre y extensión de forma segura (por si el archivo se llama "reporte.final.xlsx")
        const partes = nombreReal.split('.');
        const extension = partes.pop().toLowerCase(); // Extrae "xlsx", "docx", "pdf"
        const nombreBase = partes.join('.'); 
        
        // 3. Normalizar solo el nombre (sin tocar la extensión)
        let nombreLimpio = nombreBase.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        nombreLimpio = nombreLimpio.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').toLowerCase();
        
        const codigoCorto = Math.random().toString(36).substring(2, 6);
        
        // 4. 🔥 MAGIA DE EXTENSIONES 🔥
        // Cloudinary a las imágenes les pone la extensión solo, pero a los documentos (raw) no.
        // Si no es imagen, le pegamos la extensión a la fuerza.
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

// ==========================================
// 1. RUTAS DE GASTOS / FACTURAS
// ==========================================

// Obtener lista de facturas pendientes (GET)
router.get('/', checkAuth, facturasController.obtenerFacturas);

// Crear nueva factura con evidencia y clasificación (POST)
router.post('/', checkAuth, upload.single('evidencia'), facturasController.crearFactura);

// Actualizar factura existente (PUT)
router.put('/:id', checkAuth, upload.single('evidencia'), facturasController.actualizarFactura);

// Registrar PAGO de factura (POST) - Ahora resetea programación automáticamente
router.post('/pago/:id', checkAuth, facturasController.pagarFactura);

// Subir archivo faltante a una factura (POST)
// Ruta con Depurador Integrado
router.post('/upload/:id', checkAuth, (req, res, next) => {
    const uploadHandler = upload.single('archivo');
    uploadHandler(req, res, function (err) {
        if (err) {
            console.error("\n🚨 [DEBUG CLOUDINARY/MULTER] ERROR DETALLADO:");
            console.error(err); // Imprime todo el objeto del error real
            return res.status(500).json({ msg: 'Error al subir a Cloudinary', detalle: err });
        }
        next();
    });
}, facturasController.subirArchivo);

// Eliminar factura (DELETE)
router.delete('/:id', checkAuth, checkRole(['admin', 'superadmin']), facturasController.eliminarFactura);

// KPIs Financieros Generales
router.get('/kpis/resumen-pagos', checkAuth, facturasController.obtenerKpisPagos);

// ==========================================
// 2. PROGRAMACIÓN DE TESORERÍA (PAGOS DE HOY)
// ==========================================

// Obtener lista de facturas marcadas para pagar hoy
router.get('/programacion/hoy', checkAuth, facturasController.obtenerFacturasProgramadas);

// Obtener los 3 bloques de resumen (Operativo, Implementación, Financiero)
router.get('/programacion/resumen', checkAuth, facturasController.obtenerResumenTesoria);

// Acción de Programar o Desprogramar (Mover entre ventanas)
router.put('/:id/programar', checkAuth, facturasController.alternarProgramacion);

// ==========================================
// 3. FLUJO DE APROBACIÓN Y NOTIFICACIONES (NUEVO 🚀)
// ==========================================

// Aprobar o Desaprobar una factura individualmente (POST)
router.post('/aprobar-individual', checkAuth, checkRole(['admin', 'superadmin']), facturasController.aprobarFacturaIndividual);

// Aprobar o Desaprobar todos los programados masivamente (POST)
router.post('/aprobar-masiva', checkAuth, checkRole(['admin', 'superadmin']), facturasController.aprobarFacturasMasiva);

// Enviar el Plan de Pagos por correo a Gerencia (POST)
router.post('/enviar-plan-pagos', checkAuth, facturasController.notificarPlanPagos);

// ==========================================
// 4. HISTORIAL Y MODAL "VER"
// ==========================================

// Cambiar estado del flujo (Programado, Pendiente, etc.)
router.put('/:id/estado', checkAuth, facturasController.cambiarEstadoAprobacion);

// Ver historial de pagos de una factura
router.get('/:id/pagos', checkAuth, facturasController.obtenerHistorialPagos);

// Ver todos los documentos extra de una factura
router.get('/:id/documentos', checkAuth, facturasController.obtenerDocumentos);

// Subir un documento nuevo a la factura
router.post('/:id/documentos', checkAuth, upload.single('archivo'), facturasController.subirDocumentoExtra);

// Eliminar un documento específico
router.delete('/documentos/:docId', checkAuth, facturasController.eliminarDocumento);

router.post('/b2b/recepcion', checkAuth, 
    upload.fields([
        { name: 'pdf', maxCount: 1 }, 
        { name: 'xml', maxCount: 1 }
    ]), 
    facturasController.recepcionarFacturaB2B
);

router.get('/b2b/mis-comprobantes', checkAuth, facturasController.obtenerMisComprobantesB2B);

router.get('/b2b/dashboard', checkAuth, facturasController.obtenerDashboardB2B);

// Ruta para el Botón Mágico del Portal B2B
router.get('/validar-b2b/:codigo', checkAuth, facturasController.validarOrdenCompraB2B);

module.exports = router;