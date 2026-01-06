// Ubicacion: SuperNova/backend/routes/usuariosRoutes.js
const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
// Corregir la importación para desestructurar ambas funciones del middleware
const { checkAuth, checkRole } = require('../middleware/auth'); 
const multer = require('multer');
const path = require('path');

// --- 1. CONFIGURACIÓN DE MULTER (Gestor de Archivos) ---
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        // Guardamos en la carpeta que creaste
        cb(null, 'backend/uploads/'); 
    },
    filename: function (req, file, cb) {
        // Generamos nombre único: foto-123456789.jpg
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'foto-' + uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// --- 2. RUTAS ---

// Crear usuario: SOLO PERMITIDO PARA ADMIN
// Middleware: checkAuth (Autentica token) -> checkRole (Verifica que sea 'admin')
router.post('/', checkAuth, checkRole(['admin']), upload.single('foto'), usuariosController.crearUsuario);

// Obtener lista (Usada en Configuración): SOLO PERMITIDO PARA ADMIN
router.get('/', checkAuth, checkRole(['admin']), usuariosController.obtenerUsuarios);

// Obtener sedes: Necesario para crear/editar usuarios o perfiles. Accesible por cualquiera.
router.get('/sedes', checkAuth, usuariosController.obtenerSedes);

// Actualizar usuario (Perfil): Permitido para el propio usuario o admin.
// La lógica de validación (req.usuario.id === id) está en el controlador.
router.put('/:id', checkAuth, upload.single('foto'), usuariosController.actualizarUsuario);

module.exports = router;