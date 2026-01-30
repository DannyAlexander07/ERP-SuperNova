// Ubicacion: SuperNova/backend/middleware/auth.js
const jwt = require('jsonwebtoken');

/**
 * 1. FUNCIÓN DE AUTENTICACIÓN (BLINDADA)
 * Valida el token y asegura que el payload contenga la información de sede.
 */
const checkAuth = function(req, res, next) {
    // Soporte para ambos: header personalizado y el estándar Authorization Bearer
    const token = req.header('x-auth-token') || (req.header('Authorization') ? req.header('Authorization').replace('Bearer ', '') : null);

    if (!token) {
        return res.status(401).json({ msg: 'Acceso denegado. No se encontró una sesión activa.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secretoseguro');
        
        // 🛡️ REGLA DE ORO RETAIL: El usuario DEBE tener un ID y una Sede
        if (!decoded.usuario || !decoded.usuario.id || !decoded.usuario.sede_id) {
            throw new Error('Payload del token incompleto');
        }

        req.usuario = decoded.usuario; 
        next();
    } catch (err) {
        console.error(`[AUTH] Token inválido o expirado: ${err.message}`);
        res.status(401).json({ msg: 'Su sesión ha expirado o el token no es válido. Re-ingrese al sistema.' });
    }
};

/**
 * 2. FUNCIÓN DE VERIFICACIÓN DE ROL (EXTREMA)
 * Mantenemos tu lógica de limpieza pero añadimos trazabilidad.
 */
const checkRole = (allowedRoles) => (req, res, next) => {
    try {
        // A. LIMPIEZA DE DATOS (Mantenemos tu excelente práctica)
        const userRole = req.usuario && req.usuario.rol 
                         ? req.usuario.rol.toLowerCase().trim() 
                         : '';

        // Normalizamos los roles permitidos a minúsculas por seguridad
        const normalizedAllowed = allowedRoles.map(r => r.toLowerCase().trim());

        // B. VERIFICACIÓN
        if (!userRole || !normalizedAllowed.includes(userRole)) {
            console.warn(`[AUTH] ⛔ Acceso denegado a Usuario ID: ${req.usuario?.id}. Rol: '${userRole}' no permitido para esta ruta.`);
            return res.status(403).json({ 
                msg: 'Acceso Denegado. Su perfil de usuario no tiene autorización para realizar esta acción.' 
            });
        }

        // C. ÉXITO
        next();
        
    } catch (error) {
        console.error("[AUTH ERROR]", error);
        res.status(500).json({ msg: "Ocurrió un error al validar los permisos de seguridad." });
    }
};

// 3. EXPORTAMOS
module.exports = {
    checkAuth,
    checkRole
};