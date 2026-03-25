// Ubicacion: SuperNova/backend/controllers/usuariosController.js
const pool = require('../db');
const bcrypt = require('bcryptjs');
const fs = require('fs'); // 🔥 Módulo necesario para borrar archivos físicos
const path = require('path'); // Auxiliar para rutas

exports.crearUsuario = async (req, res) => {
    const { nombres, apellidos, dni, celular, direccion, cargo, sede_id, rol, email, password } = req.body;

    const fotoUrl = req.file ? (req.file.secure_url || req.file.path) : null;
    const sedeIdFinal = (sede_id && sede_id !== 'null' && sede_id !== '') ? parseInt(sede_id) : null;

    try {
        // 1. Validar si el correo ya existe (Validación manual previa)
        const userExist = await pool.query('SELECT id FROM usuarios WHERE correo = $1', [email]);
        if (userExist.rows.length > 0) {
            return res.status(400).json({ msg: 'Este correo electrónico ya está registrado.' });
        }

        // 2. Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(password, salt);

        // 3. Insertar en Base de Datos
        const nuevoUsuario = await pool.query(
            `INSERT INTO usuarios 
            (nombres, apellidos, documento_id, celular, direccion, cargo, sede_id, rol, correo, clave, foto_url, estado) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'activo') 
            RETURNING id, nombres, correo`,
            [nombres, apellidos, dni, celular, direccion, cargo, sedeIdFinal, rol, email, passwordHash, fotoUrl]
        );

        res.json({ msg: 'Usuario creado exitosamente', usuario: nuevoUsuario.rows[0] });

    } catch (err) {
        console.error("❌ Error al crear usuario:", err);

        // --- 🛡️ FILTRO DE ERRORES DE BASE DE DATOS ---
        
        // Error 23505: Llave duplicada (Primary Key o Unique Constraint)
        if (err.code === '23505') {
            // Si el error viene de la secuencia de IDs (usuarios_pkey)
            if (err.constraint === 'usuarios_pkey') {
                return res.status(400).json({ 
                    msg: 'Error de sincronización de IDs. Por favor, intente de nuevo o contacte a soporte.' 
                });
            }
            // Si el error viene del DNI
            if (err.constraint && err.constraint.includes('documento_id')) {
                return res.status(400).json({ msg: 'El DNI ingresado ya pertenece a otro usuario.' });
            }
            // Por si acaso el correo se coló al check manual
            if (err.constraint && err.constraint.includes('correo')) {
                return res.status(400).json({ msg: 'El correo electrónico ya existe.' });
            }
        }

        // Respuesta estándar limpia en formato JSON
        res.status(500).json({ 
            msg: 'No se pudo guardar el usuario.', 
            error: err.message 
        });
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
                u.estado != 'eliminado' AND 
                (
                    LOWER(u.nombres) LIKE $1 OR 
                    LOWER(u.apellidos) LIKE $1 OR 
                    LOWER(u.correo) LIKE $1
                )
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

// 3. ACTUALIZAR USUARIO (VERSIÓN SUPREMA: LIMPIEZA DE DISCO, SANITIZACIÓN Y ESTADO)
exports.actualizarUsuario = async (req, res) => {
    const { id } = req.params;
    
    // 🔥 NUEVO: Capturamos 'estado' junto con los demás datos
    let { nombres, apellidos, dni, celular, direccion, cargo, sede_id, rol, email, password, estado } = req.body;

    if (req.usuario && parseInt(id) === req.usuario.id) {
        // No permitimos que se cambie a sí mismo de rol ni que se desactive
        rol = req.usuario.rol; 
        estado = 'activo';
    }
    
    // 🛡️ BLINDAJE 1: Sanitización de datos (Limpiar espacios accidentales)
    if (dni) dni = dni.toString().trim();
    if (celular) celular = celular.toString().trim();
    if (email) email = email.toLowerCase().trim();

    // 🔥 CORRECCIÓN: Capturamos directamente la URL de Cloudinary de forma segura
    const fotoNuevaUrl = req.file ? (req.file.secure_url || req.file.path) : null;

    // Validación de sede_id para evitar fallos de SQL
    const sedeIdFinal = (sede_id && sede_id !== 'null' && sede_id !== '') ? parseInt(sede_id) : null;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificar si el usuario existe y obtener su estado actual
        const usuarioExistente = await client.query('SELECT estado FROM usuarios WHERE id = $1', [id]);
        if (usuarioExistente.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ msg: "Usuario no encontrado." });
        }

        // 🔥 Si no nos envían un estado nuevo, mantenemos el que ya tenía en la base de datos
        const estadoFinal = estado || usuarioExistente.rows[0].estado;

        // 2. Construcción dinámica de la consulta (AHORA INCLUYE ESTADO)
        let query = `
            UPDATE usuarios SET 
                nombres = $1, 
                apellidos = $2, 
                documento_id = $3, 
                celular = $4, 
                direccion = $5, 
                cargo = $6, 
                sede_id = $7, 
                rol = $8, 
                correo = $9,
                estado = $10
        `;
        
        let values = [nombres, apellidos, dni, celular, direccion, cargo, sedeIdFinal, rol, email, estadoFinal];
        let contador = 11; // Ahora el siguiente parámetro será el $11

        // A. Si hay contraseña nueva, la encriptamos
        if (password && password.trim() !== '') {
            // Validación de seguridad mínima
            if (password.length < 8) {
                await client.query('ROLLBACK');
                return res.status(400).json({ msg: "La contraseña debe tener al menos 8 caracteres por seguridad." });
            }
            const salt = await bcrypt.genSalt(10);
            const hashPassword = await bcrypt.hash(password, salt);
            
            query += `, clave = $${contador}`;
            values.push(hashPassword);
            contador++;
        }

        // B. Si hay foto nueva (en Cloudinary), la actualizamos
        if (fotoNuevaUrl) {
            query += `, foto_url = $${contador}`; 
            values.push(fotoNuevaUrl);
            contador++;
        }

        // Cerramos la consulta agregando el WHERE id = ...
        query += ` WHERE id = $${contador}`;
        values.push(id);

        // 3. Ejecutar actualización
        await client.query(query, values);

        await client.query('COMMIT');
        res.json({ msg: "Usuario actualizado y almacenamiento optimizado correctamente." });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error SQL al actualizar:", err.message);

        if (err.code === '23505') {
            if (err.constraint && err.constraint.includes('documento_id')) {
                return res.status(400).json({ msg: "Error: El DNI ya está registrado en otro usuario." });
            }
            if (err.constraint && err.constraint.includes('correo')) {
                return res.status(400).json({ msg: "Error: El correo ya está registrado." });
            }
        }

        res.status(500).json({ msg: "Error interno al actualizar usuario.", error: err.message });
    } finally {
        client.release();
    }
};

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

// 5. ACTUALIZAR MI PERFIL (El usuario se edita a sí mismo - SOPORTA FOTO)
exports.actualizarPerfil = async (req, res) => {
    // Extraemos campos. Nota: El frontend debe enviar 'telefono'
    const { nombres, apellidos, cargo, telefono, direccion, password } = req.body;
    const idUsuario = req.usuario.id; 

    // 🔥 Capturamos la foto de Cloudinary si existe
    const fotoNuevaUrl = req.file ? (req.file.secure_url || req.file.path) : null;

    try {
        if (!nombres || !apellidos) return res.status(400).json({ msg: 'Nombre y Apellido son obligatorios' });

        // Iniciamos la base de la consulta
        let query = `UPDATE usuarios SET nombres=$1, apellidos=$2, cargo=$3, celular=$4, direccion=$5`;
        let values = [nombres, apellidos, cargo, telefono, direccion];
        let contador = 6;

        // A. ¿Viene contraseña nueva?
        if (password && password.trim().length >= 8) {
            const salt = await bcrypt.genSalt(10);
            const passwordHash = await bcrypt.hash(password, salt);
            query += `, clave = $${contador}`;
            values.push(passwordHash);
            contador++;
        }

        // B. ¿Viene foto nueva? (ESTO ES LO QUE FALTABA)
        if (fotoNuevaUrl) {
            query += `, foto_url = $${contador}`;
            values.push(fotoNuevaUrl);
            contador++;
        }

        // Finalizamos con el WHERE
        query += ` WHERE id = $${contador} AND estado != 'eliminado' RETURNING id`;
        values.push(idUsuario);

        const result = await pool.query(query, values);
        
        if (result.rowCount === 0) {
            return res.status(404).json({ msg: 'Usuario no encontrado o inactivo.' });
        }
        
        res.json({ 
            msg: 'Perfil actualizado correctamente.', 
            foto_url: fotoNuevaUrl // Opcional: devolvemos la URL para actualizar el front sin recargar
        });

    } catch (err) {
        console.error("❌ Error Update Perfil:", err.message);
        res.status(500).json({ msg: 'Error al guardar los cambios en el perfil.' });
    }
};

// 6. ELIMINAR USUARIO POR ID (ACTUALIZADO A SOFT DELETE)
exports.eliminarUsuario = async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Evitar suicidio digital (No puedes eliminarte a ti mismo)
        if (parseInt(id) === req.usuario.id) {
            return res.status(400).json({ msg: "No puedes eliminar tu propia cuenta mientras estás conectado." });
        }

        // 2. Ejecutar borrado lógico (Soft Delete)
        // Ya no usamos DELETE. Actualizamos el estado a 'eliminado' para no romper el historial.
        const result = await pool.query(
            "UPDATE usuarios SET estado = 'eliminado' WHERE id = $1 RETURNING *", 
            [id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ msg: "Usuario no encontrado." });
        }

        res.json({ msg: "Usuario eliminado correctamente." });

    } catch (err) {
        console.error("Error al eliminar usuario:", err.message);
        // Error común: llave foránea (aunque con el UPDATE ya no debería saltar, lo conservamos por seguridad estructural)
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