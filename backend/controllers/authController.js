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

// 🔥 NUEVO: REGISTRO DE PROVEEDOR CON CÓDIGO ÚNICO
exports.registrarProveedor = async (req, res) => {
    const { codigo_acceso, correo, clave, nombre } = req.body;

    if (!codigo_acceso || !correo || !clave || !nombre) {
        return res.status(400).json({ msg: 'Todos los campos son obligatorios.' });
    }

    try {
        // 1. Verificamos si el código de acceso existe en la tabla proveedores
        // y si ese proveedor ya tiene un usuario enlazado (para evitar registros dobles)
        const proveedorResult = await pool.query(
            'SELECT id, razon_social FROM proveedores WHERE codigo_acceso = $1',
            [codigo_acceso]
        );

        if (proveedorResult.rows.length === 0) {
            return res.status(400).json({ msg: 'El Código de Acceso es inválido o ya fue utilizado.' });
        }

        const proveedor = proveedorResult.rows[0];

        // 2. Verificamos que el correo no esté en uso en todo el sistema
        const correoExistente = await pool.query(
            'SELECT id FROM usuarios WHERE correo = $1',
            [correo]
        );

        if (correoExistente.rows.length > 0) {
            return res.status(400).json({ msg: 'El correo electrónico ya está registrado en el sistema.' });
        }

        // 3. Encriptamos la contraseña
        const salt = await bcrypt.genSalt(10);
        const claveEncriptada = await bcrypt.hash(clave, salt);

        // 4. Creamos el usuario y lo enlazamos al proveedor. 
        // ¡TODO EN UNA TRANSACCIÓN PARA QUE SEA SEGURO!
        await pool.query('BEGIN'); // Iniciar transacción

        const nuevoUsuario = await pool.query(
            `INSERT INTO usuarios (nombres, correo, clave, rol, proveedor_id, estado) 
             VALUES ($1, $2, $3, 'PROVEEDOR', $4, 'activo') RETURNING id`,
            [nombre, correo, claveEncriptada, proveedor.id]
        );

        // 5. Borramos el código de acceso del proveedor para que no se vuelva a usar
        await pool.query(
            'UPDATE proveedores SET codigo_acceso = NULL WHERE id = $1',
            [proveedor.id]
        );

        await pool.query('COMMIT'); // Confirmar transacción

        const ip_origen = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'IP Desconocida';

        // 6. Registro de Auditoría
        try {
            await pool.query(
                `INSERT INTO auditoria (usuario_id, modulo, accion, detalle, ip_origen) 
                VALUES ($1, 'PORTAL_B2B', 'REGISTRO', $2, $3)`,
                [nuevoUsuario.rows[0].id, `Nuevo usuario registrado para el proveedor: ${proveedor.razon_social}`, ip_origen]
            );
        } catch (auditErr) {
            console.error("⚠️ Error grabando auditoría de registro:", auditErr.message);
        }

        res.status(201).json({ 
            msg: `Registro exitoso. Bienvenido(a) al Portal B2B de SuperNova. Proveedor: ${proveedor.razon_social}` 
        });

    } catch (err) {
        await pool.query('ROLLBACK'); // Deshacer cambios si algo falla
        console.error("❌ Error en Registro Proveedor:", err.message);
        res.status(500).json({ msg: 'Error interno del servidor al procesar el registro.' });
    }
};