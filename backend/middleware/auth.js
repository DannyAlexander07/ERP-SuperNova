// Ubicacion: SuperNova/backend/middleware/auth.js
const jwt = require('jsonwebtoken');

// 1. Función principal de autenticación
const checkAuth = function(req, res, next) {
    const token = req.header('x-auth-token');

    if (!token) {
        return res.status(401).json({ msg: 'No hay token, permiso denegado' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretoseguro');
        req.usuario = decoded.usuario; 
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token no válido' });
    }
};

// 2. Función de verificación de rol
const checkRole = (allowedRoles) => (req, res, next) => {
    if (!req.usuario || !allowedRoles.includes(req.usuario.rol)) {
        console.warn(`[AUTH] Acceso denegado a ${req.usuario?.correo || 'desconocido'}. Rol: ${req.usuario?.rol}.`);
        return res.status(403).json({ msg: 'Acceso Denegado. Se requiere un rol de administrador o superior.' });
    }
    next();
};

// 3. EXPORTAMOS AMBAS EN UN OBJETO
module.exports = {
    checkAuth,
    checkRole
};