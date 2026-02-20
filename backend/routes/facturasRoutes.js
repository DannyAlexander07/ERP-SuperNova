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

// Obtener lista de facturas pendientes (GET)
router.get('/', checkAuth, facturasController.obtenerFacturas);

// Crear nueva factura con evidencia y clasificación (POST)
router.post('/', checkAuth, upload.single('evidencia'), facturasController.crearFactura);

// Actualizar factura existente (PUT)
router.put('/:id', checkAuth, upload.single('evidencia'), facturasController.actualizarFactura);

// Registrar PAGO de factura (POST) - Ahora resetea programación automáticamente
router.post('/pago/:id', checkAuth, facturasController.pagarFactura);

// Subir archivo faltante a una factura (POST)
router.post('/upload/:id', checkAuth, upload.single('archivo'), facturasController.subirArchivo);

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

module.exports = router;