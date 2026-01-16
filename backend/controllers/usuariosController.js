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

// 2. OBTENER LISTA DE USUARIOS
exports.obtenerUsuarios = async (req, res) => {
    try {
        // 1. OBTENER PARÁMETROS
        const { q, page } = req.query;
        
        // 🔥 CAMBIO: 10 usuarios por página
        const limite = 10; 
        
        const paginaActual = parseInt(page) || 1;
        const offset = (paginaActual - 1) * limite;
        
        // Búsqueda: Si 'q' existe, buscamos coincidencias. Si no, '%' trae todo.
        const termino = q ? `%${q.toLowerCase()}%` : '%';

        // 2. CONSULTA SQL PODEROSA
        // - Busca en TODA la tabla (WHERE ...)
        // - Cuenta el total de coincidencias (COUNT(*) OVER)
        // - Recorta solo los 10 que necesitamos (LIMIT/OFFSET)
        const result = await pool.query(`
            SELECT 
                u.id, u.nombres, u.apellidos, u.correo, u.rol, u.cargo, u.celular, 
                s.nombre as nombre_sede, u.estado, u.foto_url,
                COUNT(*) OVER() as total_registros
            FROM usuarios u
            LEFT JOIN sedes s ON u.sede_id = s.id
            WHERE 
                LOWER(u.nombres) LIKE $1 OR 
                LOWER(u.apellidos) LIKE $1 OR 
                LOWER(u.correo) LIKE $1
            ORDER BY u.id ASC
            LIMIT $2 OFFSET $3
        `, [termino, limite, offset]);

        // 3. RESPUESTA PARA PAGINACIÓN
        // Si no hay resultados, totalRegistros es 0
        const totalRegistros = result.rows.length > 0 ? parseInt(result.rows[0].total_registros) : 0;
        const totalPaginas = Math.ceil(totalRegistros / limite);

        res.json({
            usuarios: result.rows,
            pagination: {
                page: paginaActual,
                totalPaginas: totalPaginas,
                totalRegistros: totalRegistros
            }
        });

    } catch (err) {
        console.error("Error SQL:", err.message);
        res.status(500).send('Error del servidor');
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

// 3. ACTUALIZAR USUARIO (COMPLETO Y BLINDADO)
exports.actualizarUsuario = async (req, res) => {
    const { id } = req.params;
    
    // Capturamos los datos. Nota: 'dni' viene del frontend, pero en la BD es 'documento_id'
    const { nombres, apellidos, dni, celular, direccion, cargo, sede_id, rol, email, password } = req.body;
    
    // Validamos la foto
    const fotoNueva = req.file ? `backend/uploads/${req.file.filename}` : null;

    // VALIDACIÓN IMPORTANTE: Si sede_id viene vacío (""), lo pasamos a NULL para que no falle el SQL
    const sedeIdFinal = (sede_id && sede_id !== 'null' && sede_id !== '') ? parseInt(sede_id) : null;

    try {
        // 1. Verificar si el usuario existe
        const usuarioExistente = await pool.query('SELECT * FROM usuarios WHERE id = $1', [id]);
        if (usuarioExistente.rows.length === 0) {
            return res.status(404).json({ msg: "Usuario no encontrado." });
        }

        // 2. Construcción dinámica de la consulta
        let query = `
            UPDATE usuarios SET 
                nombres = $1, 
                apellidos = $2, 
                documento_id = $3,   -- Mapeamos 'dni' a 'documento_id'
                celular = $4, 
                direccion = $5, 
                cargo = $6, 
                sede_id = $7,        -- Usamos el ID validado
                rol = $8, 
                correo = $9
        `;
        
        let values = [nombres, apellidos, dni, celular, direccion, cargo, sedeIdFinal, rol, email];
        let contador = 10; 

        // A. Si hay contraseña nueva, la encriptamos
        if (password && password.trim() !== '') {
            const salt = await bcrypt.genSalt(10);
            const hashPassword = await bcrypt.hash(password, salt);
            
            query += `, clave = $${contador}`; // Tu columna se llama 'clave'
            values.push(hashPassword);
            contador++;
        }

        // B. Si hay foto nueva, la actualizamos
        if (fotoNueva) {
            // Nota: Si esta línea falla, es porque tu tabla no tiene la columna 'foto_url'
            query += `, foto_url = $${contador}`; 
            values.push(fotoNueva);
            contador++;
        }

        // Cerramos la consulta
        query += ` WHERE id = $${contador}`;
        values.push(id);

        // 3. Ejecutar actualización
        await pool.query(query, values);

        res.json({ msg: "Usuario actualizado correctamente." });

    } catch (err) {
        console.error("❌ Error SQL al actualizar:", err.message);

        // --- MANEJO DE ERRORES DE DUPLICADOS (CÓDIGO 23505) ---
        if (err.code === '23505') {
            if (err.constraint === 'usuarios_documento_id_key') {
                return res.status(400).json({ msg: "Error: El DNI ingresado ya pertenece a otro usuario." });
            }
            if (err.constraint === 'usuarios_correo_key') { // O el nombre de tu restricción de correo
                return res.status(400).json({ msg: "Error: El correo ingresado ya está registrado." });
            }
        }

        // Error genérico si no es duplicado
        res.status(500).json({ 
            msg: "Error interno al actualizar usuario.", 
            error_detalle: err.message 
        });
    }
};

// UBICACIÓN: backend/controllers/usuariosController.js

// 4. OBTENER MI PERFIL (MODO DEPURACIÓN ACTIVADO 🕵️‍♂️)
exports.obtenerPerfil = async (req, res) => {
    const idUsuario = req.usuario.id;
    console.log("------------------------------------------------");
    console.log(`👤 Intentando cargar perfil para ID: ${idUsuario}`);

    try {
        // Ejecutamos la consulta
        // Nota: Si esto falla, el 'catch' nos dirá exactamente por qué.
        const result = await pool.query(`
            SELECT 
                u.id, 
                u.nombres, 
                u.apellidos, 
                u.documento_id AS dni,  
                u.correo AS email, 
                u.cargo, 
                u.celular AS telefono, 
                u.direccion, 
                u.rol, 
                u.sede_id, 
                u.estado,               
                u.foto_url,             
                s.nombre as nombre_sede
            FROM usuarios u
            LEFT JOIN sedes s ON u.sede_id = s.id
            WHERE u.id = $1
        `, [idUsuario]);

        console.log(`✅ Consulta exitosa. Filas encontradas: ${result.rows.length}`);

        if (result.rows.length === 0) {
            console.log("⚠️ Usuario no encontrado en DB.");
            return res.status(404).json({ msg: 'Usuario no encontrado.' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        // 🔥 AQUÍ VEREMOS EL ERROR REAL
        console.error("❌ ERROR CRÍTICO EN PERFIL:", err.message); 
        console.error("🔍 Detalle del error:", err); // Muestra todo el objeto error
        res.status(500).send('Error del servidor al cargar perfil');
    }
    console.log("------------------------------------------------");
};

// 5. ACTUALIZAR MI PERFIL (El usuario se edita a sí mismo)
exports.actualizarPerfil = async (req, res) => {
    const { nombres, apellidos, cargo, telefono, direccion, password } = req.body;
    const idUsuario = req.usuario.id; // ID del token

    try {
        // Validación básica
        if (!nombres || !apellidos) return res.status(400).json({ msg: 'Nombre y Apellido son obligatorios' });

        let query = "";
        let values = [];

        // Si manda contraseña, la encriptamos y actualizamos todo
        if (password && password.length > 0) {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);
            
            query = `UPDATE usuarios 
                     SET nombres=$1, apellidos=$2, cargo=$3, celular=$4, direccion=$5, clave=$6 
                     WHERE id=$7 RETURNING id, nombres, apellidos`;
            values = [nombres, apellidos, cargo, telefono, direccion, passwordHash, idUsuario];
        } else {
            // Si no, solo actualizamos datos
            query = `UPDATE usuarios 
                     SET nombres=$1, apellidos=$2, cargo=$3, celular=$4, direccion=$5 
                     WHERE id=$6 RETURNING id, nombres, apellidos`;
            values = [nombres, apellidos, cargo, telefono, direccion, idUsuario];
        }

        await pool.query(query, values);
        res.json({ msg: 'Tus datos han sido actualizados.' });

    } catch (err) {
        console.error("Error Update Perfil:", err.message);
        res.status(500).send('Error al guardar cambios');
    }
};

// 6. ELIMINAR USUARIO POR ID
exports.eliminarUsuario = async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Evitar suicidio digital (No puedes eliminarte a ti mismo)
        if (parseInt(id) === req.usuario.id) {
            return res.status(400).json({ msg: "No puedes eliminar tu propia cuenta mientras estás conectado." });
        }

        // 2. Ejecutar borrado
        // Nota: Si usas "Soft Delete" (papelera), cambia esto por un UPDATE usuarios SET activo = false...
        const result = await pool.query('DELETE FROM usuarios WHERE id = $1 RETURNING *', [id]);

        if (result.rowCount === 0) {
            return res.status(404).json({ msg: "Usuario no encontrado." });
        }

        res.json({ msg: "Usuario eliminado correctamente." });

    } catch (err) {
        console.error("Error al eliminar usuario:", err.message);
        // Error común: llave foránea (si el usuario ya hizo ventas, la BD no dejará borrarlo)
        if (err.code === '23503') {
            return res.status(400).json({ msg: "No se puede eliminar: Este usuario tiene registros asociados (ventas, movimientos, etc.). Mejor desactívalo." });
        }
        res.status(500).send('Error del servidor');
    }
};

// 7. OBTENER USUARIO POR ID (CORREGIDO: Nombres de columnas exactos)
exports.obtenerUsuarioPorId = async (req, res) => {
    const { id } = req.params;
    try {
        // 👇 AQUÍ AGREGAMOS "documento_id AS dni"
        const result = await pool.query(`
            SELECT 
                id, 
                nombres, 
                apellidos, 
                correo, 
                rol, 
                cargo, 
                celular, 
                direccion, 
                sede_id, 
                foto_url, 
                estado, 
                documento_id AS dni  -- 🔥 ¡ESTO FALTABA!
            FROM usuarios
            WHERE id = $1
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ msg: "Usuario no encontrado." });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error("Error al obtener usuario por ID:", err.message);
        res.status(500).send('Error del servidor');
    }
};