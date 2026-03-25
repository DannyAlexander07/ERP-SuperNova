// UBICACIÓN: SuperNova/backend/routes/usuariosRoutes.js

const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { checkAuth, checkRole } = require('../middleware/auth'); 

// 🔥 1. IMPORTAMOS NUESTRO PUENTE HACIA LA NUBE (CLOUDINARY)
const { uploadCloud } = require('../utils/cloudinaryConfig'); 

// --- RUTAS PÚBLICAS (PARA CUALQUIER USUARIO LOGUEADO) ---

// 3. Obtener Sedes (Cualquier usuario necesita verlas para su perfil)
router.get('/sedes', checkAuth, usuariosController.obtenerSedes);

// 4. RUTAS DE PERFIL (ACCESO UNIVERSAL: Cualquier rol puede ver y editar su propio perfil)
router.get('/perfil', checkAuth, usuariosController.obtenerPerfil);

// 🚀 CAMBIO CLAVE: Agregamos uploadCloud para que todos puedan subir su foto
router.put('/perfil', checkAuth, uploadCloud.single('foto'), usuariosController.actualizarPerfil);


// --- RUTAS ADMINISTRATIVAS (SOLO ADMINS / GERENTES) ---

// 1. Crear usuario 
router.post('/', checkAuth, checkRole(['superadmin', 'admin', 'administrador', 'gerente']), uploadCloud.single('foto'), usuariosController.crearUsuario);

// 2. Listar usuarios
router.get('/', checkAuth, checkRole(['superadmin', 'admin', 'administrador', 'gerente']), usuariosController.obtenerUsuarios);

// 5. Rutas dinámicas por ID (Genérico va AL FINAL)
router.get('/:id', checkAuth, checkRole(['superadmin', 'admin', 'gerente']), usuariosController.obtenerUsuarioPorId);

// Actualizar OTRO usuario (Solo admins)
router.put('/:id', checkAuth, checkRole(['superadmin', 'admin', 'administrador', 'gerente']), uploadCloud.single('foto'), usuariosController.actualizarUsuario);

// Eliminar usuario
router.delete('/:id', checkAuth, checkRole(['superadmin', 'admin']), usuariosController.eliminarUsuario);

module.exports = router;