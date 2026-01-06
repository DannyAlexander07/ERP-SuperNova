// Ubicacion: SuperNova/backend/routes/facturasRoutes.js
const express = require('express');
const router = express.Router();
const facturasController = require('../controllers/facturasController');
// 🚨 IMPORTACIÓN CORREGIDA
const { checkAuth, checkRole } = require('../middleware/auth'); 
const multer = require('multer');
const path = require('path');
const mime = require('mime-types');

// --- Configuración Avanzada de Multer (Sin cambios) ---
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


// Rutas protegidas
router.get('/', checkAuth, facturasController.obtenerFacturas);       // Leer (Lista)

router.post('/', checkAuth, upload.single('evidencia'), facturasController.crearFactura);         // Crear

// 🚨 CORRECCIÓN CRÍTICA: Añadir Multer para parsear FormData en el PUT
router.put('/:id', checkAuth, upload.single('evidencia'), facturasController.actualizarFactura);  // Actualizar (EDITAR)

// 🚨 SEGURIDAD CRÍTICA: Solo Administradores pueden eliminar registros financieros
router.delete('/:id', checkAuth, checkRole(['admin']), facturasController.eliminarFactura); // Eliminar

router.post('/pago/:id', checkAuth, facturasController.pagarFactura);      // Registrar Pago (función corregida)

router.post('/upload/:id', checkAuth, upload.single('archivo'), facturasController.subirArchivo); // Subir archivo de evidencia


module.exports = router;