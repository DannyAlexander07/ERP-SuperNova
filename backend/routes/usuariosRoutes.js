// UBICACIÓN: SuperNova/backend/routes/usuariosRoutes.js

const express = require('express');
const router = express.Router();
const usuariosController = require('../controllers/usuariosController');
const { checkAuth, checkRole } = require('../middleware/auth'); 

// 🔥 1. IMPORTAMOS NUESTRO PUENTE HACIA LA NUBE (CLOUDINARY)
const { uploadCloud } = require('../utils/cloudinaryConfig'); 

// 1. Crear usuario 
router.post('/', checkAuth, checkRole(['superadmin', 'admin', 'administrador', 'gerente']), uploadCloud.single('foto'), usuariosController.crearUsuario);

// 2. Listar usuarios
router.get('/', checkAuth, checkRole(['superadmin', 'admin', 'administrador', 'gerente']), usuariosController.obtenerUsuarios);

// 3. Obtener Sedes (Específico va PRIMERO)
router.get('/sedes', checkAuth, usuariosController.obtenerSedes);

// 4. RUTAS DE PERFIL (Específico va ANTES que /:id)
router.get('/perfil', checkAuth, usuariosController.obtenerPerfil);
router.put('/perfil', checkAuth, usuariosController.actualizarPerfil);

// 5. Rutas dinámicas por ID (Genérico va AL FINAL)
router.get('/:id', checkAuth, checkRole(['superadmin', 'admin', 'gerente']), usuariosController.obtenerUsuarioPorId);

// Actualizar usuario
router.put('/:id', checkAuth, checkRole(['superadmin', 'admin', 'administrador', 'gerente']), uploadCloud.single('foto'), usuariosController.actualizarUsuario);

// Eliminar usuario
router.delete('/:id', checkAuth, checkRole(['superadmin', 'admin']), usuariosController.eliminarUsuario);

module.exports = router;