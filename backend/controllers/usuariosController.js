// Ubicacion: SuperNova/backend/controllers/usuariosController.js
const pool = require('../db');
const bcrypt = require('bcryptjs');

exports.crearUsuario = async (req, res) => {
    const { nombres, apellidos, dni, celular, direccion, cargo, sede_id, rol, email, password } = req.body;

    try {
        // 1. Validar si el usuario ya existe
        const userExist = await pool.query('SELECT * FROM usuarios WHERE correo = $1', [email]);
        if (userExist.rows.length > 0) {
            return res.status(400).json({ msg: 'Este correo ya está registrado.' });
        }

        // 2. Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 3. Insertar en Base de Datos (Usamos sede_id directo)
        const nuevoUsuario = await pool.query(
            `INSERT INTO usuarios 
            (nombres, apellidos, documento_id, celular, direccion, cargo, sede_id, rol, correo, clave, estado) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'activo') 
            RETURNING id, nombres, correo`,
            [nombres, apellidos, dni, celular, direccion, cargo, sede_id, rol, email, passwordHash]
        );

        res.json({ msg: 'Usuario creado exitosamente', usuario: nuevoUsuario.rows[0] });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al guardar usuario en base de datos');
    }
};

exports.obtenerUsuarios = async (req, res) => {
    try {
        // JOIN para traer el nombre de la sede en lugar del ID
        const query = `
            SELECT 
                u.id, 
                u.nombres, 
                u.apellidos, 
                u.cargo, 
                u.rol, 
                u.estado, 
                u.correo, 
                u.foto_url, 
                u.celular,      /* <--- AGREGADO */
                u.direccion,    /* <--- AGREGADO */
                s.nombre as nombre_sede 
            FROM usuarios u
            LEFT JOIN sedes s ON u.sede_id = s.id 
            ORDER BY u.id DESC
        `;
        const todos = await pool.query(query);
        res.json(todos.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error obteniendo usuarios');
    }
};

// NUEVO: Endpoint para llenar el select de sedes dinámicamente
exports.obtenerSedes = async (req, res) => {
    try {
        const sedes = await pool.query('SELECT id, nombre FROM sedes WHERE activo = TRUE ORDER BY id ASC');
        res.json(sedes.rows);
    } catch (err) {
        console.error(err);
        res.status(500).send('Error al cargar sedes');
    }
};

// 3. ACTUALIZAR USUARIO (PERFIL + FOTO)
exports.actualizarUsuario = async (req, res) => {
    const { id } = req.params;
    // Multer pone los datos de texto en body y el archivo en file
    const { nombres, apellidos, celular, direccion, cargo, sede_id, password } = req.body;
    
    // Si subió foto, creamos la ruta web. Si no, es null.
    // Nota: '/uploads/...' es como accederemos desde el navegador
    const nuevaFotoUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Validación de seguridad básica
    if (parseInt(id) !== req.usuario.id && req.usuario.rol !== 'admin') {
        return res.status(403).json({ msg: 'No tienes permiso.' });
    }

    try {
        let query = "";
        let values = [];
        
        // Campos que siempre queremos que devuelva
        const returnFields = "RETURNING id, nombres, apellidos, rol, cargo, correo, celular, direccion, sede_id, foto_url";

        // COALESCE($X, foto_url) significa: "Si me mandas una foto nueva ($X), úsala. Si es null, mantén la vieja (foto_url)."

        if (password && password.length > 0) {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);
            
            query = `UPDATE usuarios SET 
                     nombres=$1, apellidos=$2, celular=$3, direccion=$4, cargo=$5, sede_id=$6, clave=$7, 
                     foto_url = COALESCE($8, foto_url) 
                     WHERE id=$9 ${returnFields}`;
            values = [nombres, apellidos, celular, direccion, cargo, sede_id, passwordHash, nuevaFotoUrl, id];
        } else {
            query = `UPDATE usuarios SET 
                     nombres=$1, apellidos=$2, celular=$3, direccion=$4, cargo=$5, sede_id=$6, 
                     foto_url = COALESCE($7, foto_url)
                     WHERE id=$8 ${returnFields}`;
            values = [nombres, apellidos, celular, direccion, cargo, sede_id, nuevaFotoUrl, id];
        }

        const result = await pool.query(query, values);
        
        if (result.rows.length === 0) return res.status(404).json({ msg: 'Usuario no encontrado' });

        // Obtenemos nombre de sede para actualizar frontend
        const sedeRes = await pool.query('SELECT nombre FROM sedes WHERE id = $1', [result.rows[0].sede_id]);
        const nombreSede = sedeRes.rows.length > 0 ? sedeRes.rows[0].nombre : 'Sin Sede';

        const usuarioCompleto = { ...result.rows[0], nombre_sede: nombreSede };

        res.json({ msg: 'Perfil actualizado correctamente', usuario: usuarioCompleto });

    } catch (err) {
        console.error(err);
        res.status(500).send('Error al actualizar');
    }
};