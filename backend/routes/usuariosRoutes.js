// UBICACIÓN: SuperNova/backend/routes/usuariosRoutes.js

const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { checkAuth, checkRole } = require('../middleware/auth'); 
const multer = require('multer');
const path = require('path');

// Configuración de Multer (Imágenes)
const storage = multer.diskStorage({
    destination: function (req, file, cb) { cb(null, 'backend/uploads/'); },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'foto-' + uniqueSuffix + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// --- RUTAS (EN ORDEN CORRECTO) ---

// 1. Crear usuario
router.post('/', checkAuth, checkRole(['superadmin', 'admin', 'administrador', 'gerente']), upload.single('foto'), usuariosController.crearUsuario);

// 2. Listar usuarios
router.get('/', checkAuth, checkRole(['superadmin', 'admin', 'administrador', 'gerente']), usuariosController.obtenerUsuarios);

// 3. Obtener Sedes (Específico va PRIMERO)
router.get('/sedes', checkAuth, usuariosController.obtenerSedes);

// 🔥 4. RUTAS DE PERFIL (Específico va ANTES que /:id)
// ¡ESTO SOLUCIONA TU ERROR! Antes estaba debajo y por eso fallaba.
router.get('/perfil', checkAuth, usuariosController.obtenerPerfil);
router.put('/perfil', checkAuth, usuariosController.actualizarPerfil);

// 5. Rutas dinámicas por ID (Genérico va AL FINAL)
// Como esto captura cualquier cosa (/:id), si lo pones antes, se "roba" la palabra 'perfil'.
router.get('/:id', checkAuth, checkRole(['superadmin', 'admin', 'gerente']), usuariosController.obtenerUsuarioPorId);
router.put('/:id', checkAuth, checkRole(['superadmin', 'admin', 'administrador', 'gerente']), upload.single('foto'), usuariosController.actualizarUsuario);
router.delete('/:id', checkAuth, checkRole(['superadmin', 'admin']), usuariosController.eliminarUsuario);

module.exports = router;