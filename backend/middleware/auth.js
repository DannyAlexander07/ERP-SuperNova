// Ubicacion: SuperNova/backend/middleware/auth.js
const jwt = require('jsonwebtoken');

// 1. Función principal de autenticación (Token)
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

// 2. Función de verificación de rol (CORREGIDA Y BLINDADA)
const checkRole = (allowedRoles) => (req, res, next) => {
    try {
        // A. LIMPIEZA DE DATOS (El secreto para que funcione)
        // Convertimos a minúsculas y quitamos espacios invisibles
        const userRole = req.usuario && req.usuario.rol 
                         ? req.usuario.rol.toLowerCase().trim() 
                         : '';

        // B. VERIFICACIÓN
        // Si el usuario no existe o su rol limpio no está en la lista permitida...
        if (!userRole || !allowedRoles.includes(userRole)) {
            console.warn(`[AUTH] ⛔ Acceso denegado. Rol detectado: '${userRole}' | Requeridos: ${allowedRoles}`);
            return res.status(403).json({ msg: 'Acceso Denegado. No tienes el nivel de permiso necesario.' });
        }

        // C. ÉXITO
        next();
        
    } catch (error) {
        console.error("[AUTH ERROR]", error);
        res.status(500).json({ msg: "Error al verificar permisos" });
    }
};

// 3. EXPORTAMOS AMBAS EN UN OBJETO
module.exports = {
    checkAuth,
    checkRole
};