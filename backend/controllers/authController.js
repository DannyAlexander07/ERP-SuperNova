// Ubicacion: SuperNova/backend/controllers/authController.js
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    const { email, password } = req.body;

    // Validación fail-fast para no tocar la DB si los campos vienen vacíos
    if (!email || !password) {
        return res.status(400).json({ msg: 'Por favor, ingrese correo y contraseña.' });
    }

    try {
        // 1. Verificar si el usuario existe y traer solo datos necesarios + validación de estado
        const result = await pool.query(
            'SELECT id, nombres, apellidos, clave, rol, sede_id, foto_url, estado FROM usuarios WHERE correo = $1', 
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ msg: 'Credenciales inválidas.' }); // Mensaje genérico por seguridad
        }

        const usuario = result.rows[0];

        // 🛡️ PROTECCIÓN DE ESTADO: Validar si el usuario está ACTIVO
        if (usuario.estado !== 'activo') {
            return res.status(403).json({ msg: 'Su cuenta está inhabilitada. Contacte al administrador.' });
        }

        // 2. Verificar contraseña
        const isMatch = await bcrypt.compare(password, usuario.clave);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Credenciales inválidas.' }); // Evitamos decir "contraseña incorrecta"
        }

        // 🛡️ VALIDACIÓN DE SEDE LOGÍSTICA
        if (!usuario.sede_id) {
            return res.status(403).json({ msg: 'Usuario sin Sede Logística asignada. No puede operar el sistema.' });
        }

        // 3. Crear Token (Payload robusto)
        const payload = {
            usuario: { 
                id: usuario.id,
                sede_id: usuario.sede_id,
                nombre: usuario.nombres,
                rol: usuario.rol
            }
        };

        jwt.sign(
            payload, 
            process.env.JWT_SECRET || 'secretoseguro', 
            { expiresIn: '12h' }, 
            async (err, token) => {
                if (err) throw err;
                
                // 🛡️ REGISTRO EN AUDITORÍA: Guardamos quién y cuándo entró
                try {
                    await pool.query(
                        `INSERT INTO auditoria (usuario_id, modulo, accion, detalle) 
                         VALUES ($1, 'AUTH', 'LOGIN', $2)`,
                        [usuario.id, `Inicio de sesión exitoso desde el controlador de auth.`]
                    );
                } catch (auditErr) {
                    console.error("⚠️ Error grabando auditoría de login:", auditErr.message);
                }

                // 4. RESPONDER AL FRONTEND (Mantenemos tu estructura original)
                res.json({ 
                    token, 
                    usuario: {
                        id: usuario.id,
                        sede_id: usuario.sede_id,
                        nombres: usuario.nombres, 
                        apellidos: usuario.apellidos,
                        rol: usuario.rol,
                        foto_url: usuario.foto_url 
                    }
                });
            }
        );

    } catch (err) {
        console.error("❌ Error en Login:", err.message);
        res.status(500).json({ msg: 'Error interno del servidor al intentar autenticar.' });
    }
};