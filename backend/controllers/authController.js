// Ubicacion: SuperNova/backend/controllers/authController.js
const pool = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { enviarCorreoRecuperacion } = require('../utils/emailService');

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

       const jwtSecret = process.env.JWT_SECRET;
        if (!jwtSecret) {
            console.error('[CRÍTICO] JWT_SECRET no está definido. Deteniendo login.');
            return res.status(500).json({ msg: 'Error interno de configuración de seguridad.' });
        }

        jwt.sign(
            payload, 
            jwtSecret, 
            { expiresIn: '12h' }, 
            async (err, token) => {
                if (err) throw err;
                const ip_origen = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'IP Desconocida';
                
                // 🛡️ REGISTRO EN AUDITORÍA: Guardamos quién y cuándo entró
                try {
                    await pool.query(
                        `INSERT INTO auditoria (usuario_id, modulo, accion, detalle, ip_origen) 
                        VALUES ($1, 'AUTH', 'LOGIN', $2, $3)`,
                        [usuario.id, `Inicio de sesión exitoso.`, ip_origen]
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

// 🔥 NUEVO: LOGIN EXCLUSIVO PARA EL PORTAL B2B
exports.loginProveedor = async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ msg: 'Por favor, ingrese correo y contraseña.' });
    }

    try {
        // 1. Buscamos al usuario e incluimos la columna clave: proveedor_id
        const result = await pool.query(
            'SELECT id, nombres, apellidos, clave, rol, foto_url, estado, proveedor_id FROM usuarios WHERE correo = $1', 
            [email]
        );
        
        if (result.rows.length === 0) {
            return res.status(400).json({ msg: 'Credenciales inválidas.' });
        }

        const usuario = result.rows[0];

        // 🛡️ BLINDAJE VIP: Si no tiene un proveedor_id, lo botamos
        if (!usuario.proveedor_id) {
            return res.status(403).json({ msg: 'Acceso Denegado: Su cuenta no está habilitada para el Portal de Proveedores.' });
        }

        if (usuario.estado !== 'activo') {
            return res.status(403).json({ msg: 'Su cuenta está inhabilitada. Contacte a SuperNova.' });
        }

        const isMatch = await bcrypt.compare(password, usuario.clave);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Credenciales inválidas.' });
        }

        // 2. Payload del Token (Ahora viaja con el ID de su empresa proveedora)
        const payload = {
            usuario: { 
                id: usuario.id,
                proveedor_id: usuario.proveedor_id, // 🔥 CRUCIAL PARA SUS MÓDULOS
                nombre: usuario.nombres,
                rol: 'PROVEEDOR' // Forzamos el rol para máxima seguridad
            }
        };

        const jwtSecret = process.env.JWT_SECRET;

        jwt.sign(
            payload, 
            jwtSecret, 
            { expiresIn: '24h' }, // Le damos más tiempo al proveedor
            async (err, token) => {
                if (err) throw err;
                
                const ip_origen = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'IP Desconocida';
                
                // Auditoría especial para proveedores
                try {
                    await pool.query(
                        `INSERT INTO auditoria (usuario_id, modulo, accion, detalle, ip_origen) 
                        VALUES ($1, 'PORTAL_B2B', 'LOGIN_PROVEEDOR', $2, $3)`,
                        [usuario.id, `Inicio de sesión exitoso en Portal Proveedores.`, ip_origen]
                    );
                } catch (auditErr) {
                    console.error("⚠️ Error grabando auditoría B2B:", auditErr.message);
                }

                // 3. Respuesta limpia
                res.json({ 
                    token, 
                    usuario: {
                        id: usuario.id,
                        proveedor_id: usuario.proveedor_id,
                        nombres: usuario.nombres, 
                        foto_url: usuario.foto_url 
                    }
                });
            }
        );

    } catch (err) {
        console.error("❌ Error en Login Proveedor:", err.message);
        res.status(500).json({ msg: 'Error interno del servidor.' });
    }
};

// 🔥 REGISTRO DE PROVEEDOR B2B (CON REP. LEGAL Y TELÉFONO)
exports.registrarProveedor = async (req, res) => {
    const { codigo_acceso, correo, clave, nombre, ruc, razon_social, rep_legal, telefono } = req.body;

    if (!codigo_acceso || !correo || !clave || !nombre || !ruc || !razon_social || !rep_legal || !telefono) {
        return res.status(400).json({ msg: 'Todos los campos son obligatorios.' });
    }

    try {
        const proveedorResult = await pool.query(
            'SELECT id FROM proveedores WHERE codigo_acceso = $1 AND estado = $2',
            [codigo_acceso, 'PENDIENTE']
        );

        if (proveedorResult.rows.length === 0) {
            return res.status(400).json({ msg: 'El Código de Acceso es inválido o caducó.' });
        }

        const proveedor = proveedorResult.rows[0];

        const correoExistente = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [correo]);
        if (correoExistente.rows.length > 0) {
            return res.status(400).json({ msg: 'El correo electrónico ya está registrado en el sistema.' });
        }

        const salt = await bcrypt.genSalt(10);
        const claveEncriptada = await bcrypt.hash(clave, salt);

        // Empaquetamos el teléfono y correo como JSON inicial para que las tablas no estén vacías
        const telefonoJSON = JSON.stringify([{ pais: 'Perú (+51)', numero: telefono, anexo: '', persona: nombre, principal: true }]);
        const correoJSON = JSON.stringify([{ correo: correo, tipo: 'Administrador del Portal', principal: true }]);

        await pool.query('BEGIN'); 

        // Actualizamos el proveedor con los nuevos campos
        await pool.query(
            `UPDATE proveedores 
             SET ruc = $1, 
                 razon_social = $2, 
                 representante_legal = $3, 
                 telefono = $4,
                 correo_contacto = $5,
                 nombre_contacto = $6,
                 estado = 'activo', 
                 codigo_acceso = NULL 
             WHERE id = $7`,
            [ruc, razon_social, rep_legal, telefonoJSON, correoJSON, nombre, proveedor.id]
        );

        const nuevoUsuario = await pool.query(
            `INSERT INTO usuarios (nombres, correo, clave, rol, proveedor_id, estado) 
             VALUES ($1, $2, $3, 'PROVEEDOR', $4, 'activo') RETURNING id`,
            [nombre, correo, claveEncriptada, proveedor.id]
        );

        await pool.query('COMMIT'); 
        res.status(201).json({ msg: `Registro exitoso. Bienvenido(a) al Portal B2B.` });

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("❌ Error en Registro Proveedor:", err.message);
        res.status(500).json({ msg: 'Error interno del servidor.' });
    }
};

// =======================================================
// RECUPERAR CONTRASEÑA (GENERAR CLAVE TEMPORAL)
// =======================================================
// =======================================================
// RECUPERAR CONTRASEÑA (GENERAR CLAVE TEMPORAL Y ENVIAR EMAIL)
// =======================================================
exports.recuperarClave = async (req, res) => {
    const { correo } = req.body;

    if (!correo) return res.status(400).json({ msg: 'Debe proporcionar un correo electrónico.' });

    try {
        const usuarioResult = await pool.query('SELECT id, nombres FROM usuarios WHERE correo = $1', [correo]);
        
        if (usuarioResult.rows.length === 0) {
            return res.status(404).json({ msg: 'No encontramos ninguna cuenta vinculada a este correo electrónico.' });
        }

        const usuario = usuarioResult.rows[0];

        // Generar clave temporal
        const claveTemporal = 'Temp-' + Math.random().toString(36).substring(2, 6).toUpperCase();

        // Encriptar y guardar (Activando la bandera de requiere_cambio)
        const salt = await bcrypt.genSalt(10);
        const claveEncriptada = await bcrypt.hash(claveTemporal, salt);

        await pool.query(
            'UPDATE usuarios SET clave = $1, requiere_cambio_clave = true WHERE id = $2', 
            [claveEncriptada, usuario.id]
        );

        // 📨 USAMOS TU EMAIL SERVICE AQUÍ
        const envio = await enviarCorreoRecuperacion(correo, usuario.nombres, claveTemporal);

        if (envio.success) {
            res.json({ msg: 'Hemos enviado una contraseña temporal a tu correo electrónico. Por favor, revisa tu bandeja de entrada o Spam.' });
        } else {
            // Si el correo falla (credenciales malas, sin internet, etc), avisamos pero sin romper el sistema
            res.status(500).json({ msg: 'Se generó la clave, pero hubo un problema enviando el correo. Contacte a soporte.' });
        }

    } catch (err) {
        console.error("❌ Error en Recuperar Clave:", err.message);
        res.status(500).json({ msg: 'Error interno del servidor.' });
    }
};