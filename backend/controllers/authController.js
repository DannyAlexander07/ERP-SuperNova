// Ubicacion: SuperNova/backend/controllers/authController.js
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

exports.login = async (req, res) => {
    const { email, password } = req.body;

    try {
        // 1. Verificar si el usuario existe
        const result = await pool.query('SELECT * FROM usuarios WHERE correo = $1', [email]);
        
        if (result.rows.length === 0) {
            return res.status(400).json({ msg: 'El correo no está registrado.' });
        }

        const usuario = result.rows[0];

        // 2. Verificar contraseña
        const isMatch = await bcrypt.compare(password, usuario.clave);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Contraseña incorrecta.' });
        }

        // Validación de Sede
        if (!usuario.sede_id) {
            return res.status(403).json({ msg: 'Usuario sin Sede Logística asignada.' });
        }

        // 3. Crear Token
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
            (err, token) => {
                if (err) throw err;
                
                // 4. RESPONDER AL FRONTEND (AQUÍ ESTABA EL FALTANTE)
                // Enviamos TODOS los datos necesarios para el Dashboard
                res.json({ 
                    token, 
                    usuario: {
                        id: usuario.id,
                        sede_id: usuario.sede_id,
                        // Enviamos nombres y apellidos para el saludo completo
                        nombres: usuario.nombres, 
                        apellidos: usuario.apellidos,
                        rol: usuario.rol,
                        // Enviamos la foto real (o null si no tiene)
                        foto_url: usuario.foto_url 
                    }
                });
            }
        );

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error del Servidor');
    }
};