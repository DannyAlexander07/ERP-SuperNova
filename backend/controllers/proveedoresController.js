// Ubicacion: SuperNova/backend/controllers/proveedoresController.js
const pool = require('../db');

// 1. OBTENER TODOS LOS PROVEEDORES (Solo Activos)
exports.obtenerProveedores = async (req, res) => {
    try {
        // 🔥 MAGIA: Cruzamos con la tabla usuarios para sacar el correo real de acceso B2B
        // Si el proveedor tiene un usuario creado, traemos su correo de login como 'correo_b2b'
        const result = await pool.query(`
            SELECT p.*, u.correo AS correo_b2b 
            FROM proveedores p
            LEFT JOIN usuarios u ON p.id = u.proveedor_id
            WHERE p.estado != 'ELIMINADO' OR p.estado IS NULL 
            ORDER BY p.id DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error en obtenerProveedores:", err.message);
        res.status(500).json({ msg: 'Error al obtener proveedores' });
    }
};

// 2. CREAR NUEVO PROVEEDOR
exports.crearProveedor = async (req, res) => {
    // Recibimos exactamente los nombres de variables que manda el nuevo Frontend
    let { ruc, razon_social, representante_legal, direccion, categoria, dias_credito, nombre_contacto, correo_contacto, telefono, cuenta_bancaria, estado } = req.body;

    if (!razon_social || razon_social.trim() === '') {
        return res.status(400).json({ msg: 'La Razón Social (Nombre de la empresa) es obligatoria.' });
    }

    try {
        const rucLimpio = ruc ? ruc.toString().trim() : null;

        const existing = await pool.query('SELECT id FROM proveedores WHERE ruc = $1', [rucLimpio]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ msg: 'Ya existe un proveedor registrado con este RUC/DNI.' });
        }

        const result = await pool.query(
            `INSERT INTO proveedores (
                ruc, razon_social, representante_legal, direccion, categoria, dias_credito, 
                nombre_contacto, correo_contacto, telefono, cuenta_bancaria, estado
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
            RETURNING *`,
            [
                rucLimpio, razon_social, representante_legal || null, direccion || null, categoria, parseInt(dias_credito) || 0, 
                nombre_contacto || null, correo_contacto || null, telefono || null, cuenta_bancaria || null, estado || 'activo'
            ]
        );

        res.json({ msg: 'Proveedor creado con éxito', proveedor: result.rows[0] });

    } catch (err) {
        console.error("❌ Error en crearProveedor:", err.message);
        res.status(500).json({ msg: 'Error interno al guardar proveedor' });
    }
};

// 3. ACTUALIZAR PROVEEDOR (Con validación de duplicados cruzados)
exports.actualizarProveedor = async (req, res) => {
    const { id } = req.params;
    let { ruc, razon_social, representante_legal, direccion, categoria, dias_credito, nombre_contacto, correo_contacto, telefono, cuenta_bancaria, estado } = req.body;

    if (!razon_social || razon_social.trim() === '') {
        return res.status(400).json({ msg: 'La Razón Social (Nombre de la empresa) es obligatoria.' });
    }

    try {
        const rucLimpio = ruc ? ruc.toString().trim() : null;

        const checkRuc = await pool.query('SELECT id FROM proveedores WHERE ruc = $1 AND id != $2', [rucLimpio, id]);
        if (checkRuc.rows.length > 0) {
            return res.status(400).json({ msg: 'El RUC ingresado ya pertenece a otro proveedor registrado.' });
        }

        const result = await pool.query(
            `UPDATE proveedores SET 
                ruc = $1, razon_social = $2, representante_legal = $3, direccion = $4, categoria = $5, dias_credito = $6, 
                nombre_contacto = $7, correo_contacto = $8, telefono = $9, cuenta_bancaria = $10, estado = $11
            WHERE id = $12 RETURNING *`,
            [
                rucLimpio, razon_social, representante_legal || null, direccion || null, categoria, parseInt(dias_credito) || 0, 
                nombre_contacto || null, correo_contacto || null, telefono || null, cuenta_bancaria || null, estado,
                id
            ]
        );

        if (result.rows.length === 0) return res.status(404).json({ msg: 'Proveedor no encontrado.' });

        res.json({ msg: 'Datos del proveedor actualizados correctamente', proveedor: result.rows[0] });

    } catch (err) {
        console.error("❌ Error en actualizarProveedor:", err.message);
        res.status(500).json({ msg: 'Error al actualizar datos en la base de datos' });
    }
};

// 4. ELIMINAR PROVEEDOR (Blindaje: Borrado Físico vs Soft Delete Automático)
exports.eliminarProveedor = async (req, res) => {
    const { id } = req.params;

    try {
        // 1. Intentamos hacer el borrado físico de frente
        const result = await pool.query('DELETE FROM proveedores WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) return res.status(404).json({ msg: 'Proveedor no encontrado.' });

        res.json({ msg: 'Proveedor eliminado permanentemente del sistema.' });

    } catch (err) {
        // 🛡️ BLINDAJE NATIVO DE POSTGRESQL (Código 23503 = Violación de Llave Foránea)
        // Si PostgreSQL detecta que el proveedor está amarrado a un Gasto o Compra, frena el DELETE.
        if (err.code === '23503') {
            console.log(`⚠️ Proveedor ${id} en uso. Aplicando Soft Delete.`);
            await pool.query("UPDATE proveedores SET estado = 'ELIMINADO' WHERE id = $1", [id]);
            return res.json({ msg: 'Proveedor archivado. No se puede eliminar físicamente porque tiene registros contables asociados.' });
        }
        
        console.error("❌ Error en eliminarProveedor:", err.message);
        res.status(500).json({ msg: 'Error del servidor al procesar la eliminación' });
    }
};

// Obtener los datos actuales del proveedor logueado
exports.obtenerMiPerfilB2B = async (req, res) => {
    // Leemos el ID desde el token del proveedor
    const proveedorId = req.usuario.proveedor_id;
    
    if (!proveedorId) return res.status(403).json({ msg: 'Acceso denegado.' });

    try {
        const result = await pool.query(`
            SELECT 
                ruc, razon_social, nombre_contacto, correo_contacto, 
                telefono, direccion, cuenta_bancaria, representante_legal
            FROM proveedores
            WHERE id = $1
        `, [proveedorId]);

        if (result.rows.length === 0) return res.status(404).json({ msg: 'Proveedor no encontrado.' });
        
        res.json(result.rows[0]);
    } catch (err) {
        console.error("❌ Error al obtener perfil B2B:", err);
        res.status(500).json({ msg: 'Error al cargar sus datos.' });
    }
};

// Actualizar datos de contacto y cuenta bancaria
exports.actualizarMiPerfilB2B = async (req, res) => {
    const proveedorId = req.usuario.proveedor_id;
    const { nombre_contacto, correo_contacto, telefono, direccion, cuenta_bancaria } = req.body;

    if (!proveedorId) return res.status(403).json({ msg: 'Acceso denegado.' });

    try {
        await pool.query(`
            UPDATE proveedores 
            SET 
                nombre_contacto = $1, 
                correo_contacto = $2, 
                telefono = $3, 
                direccion = $4, 
                cuenta_bancaria = $5
            WHERE id = $6
        `, [nombre_contacto, correo_contacto, telefono, direccion, cuenta_bancaria, proveedorId]);

        res.json({ msg: 'Sus datos han sido actualizados con éxito.' });
    } catch (err) {
        console.error("❌ Error al actualizar perfil B2B:", err);
        res.status(500).json({ msg: 'Error al guardar los cambios.' });
    }
};

// Generar Código de Acceso Único para el Proveedor
exports.generarCodigoAcceso = async (req, res) => {
    const { id } = req.params;

    try {
        // Generar un código aleatorio de 6 caracteres (letras y números) con prefijo SPN (SuperNova)
        // Ejemplo: SPN-A8X9F2
        const codigoGenerado = 'SPN-' + Math.random().toString(36).substring(2, 8).toUpperCase();

        const result = await pool.query(
            'UPDATE proveedores SET codigo_acceso = $1 WHERE id = $2 RETURNING codigo_acceso, razon_social, ruc',
            [codigoGenerado, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Proveedor no encontrado.' });
        }

        res.json({
            msg: 'Código generado con éxito',
            codigo: result.rows[0].codigo_acceso,
            proveedor: result.rows[0].razon_social
        });

    } catch (err) {
        console.error("❌ Error al generar código de acceso:", err.message);
        res.status(500).json({ msg: 'Error del servidor al generar el código.' });
    }
};

// =======================================================
// 3. ONBOARDING: GENERAR INVITACIÓN B2B (FASE 1)
// =======================================================

exports.generarCodigoInvitacion = async (req, res) => {
    try {
        // 1. Generamos un código aleatorio único (Ej: PRV-A7B9X)
        const codigoUnico = 'PRV-' + Math.random().toString(36).substring(2, 7).toUpperCase();

        // 2. Creamos el "cascarón" del proveedor en la base de datos
        const result = await pool.query(
            `INSERT INTO proveedores (
                ruc, razon_social, codigo_acceso, estado
            ) VALUES (
                '00000000000', 'EN ESPERA DE REGISTRO', $1, 'PENDIENTE'
            ) RETURNING id, codigo_acceso`,
            [codigoUnico]
        );

        // 3. Registro de auditoría (para saber quién generó el código)
        const usuarioCreador = req.usuario ? req.usuario.id : null;
        if (usuarioCreador) {
            await pool.query(
                `INSERT INTO auditoria (usuario_id, modulo, accion, detalle) 
                 VALUES ($1, 'PROVEEDORES', 'GENERAR_INVITACION', $2)`,
                [usuarioCreador, `Se generó el código de invitación: ${codigoUnico} para un nuevo proveedor.`]
            );
        }

        // 4. Respondemos con el código creado
        res.status(201).json({
            msg: 'Código de invitación generado con éxito',
            codigo: result.rows[0].codigo_acceso
        });

    } catch (err) {
        console.error("❌ Error al generar código de invitación:", err.message);
        res.status(500).json({ msg: 'Error interno al generar el código.' });
    }
};

// =======================================================
// 4. SEGURIDAD: FORZAR CAMBIO DE CONTRASEÑA B2B (MODAL LLAVECITA)
// =======================================================
exports.forzarPasswordB2B = async (req, res) => {
    const { id } = req.params; // Este es el ID del proveedor
    const { nuevaPassword, correo } = req.body;
    const usuarioId = req.usuario ? req.usuario.id : null;

    if (!nuevaPassword || nuevaPassword.length < 6) {
        return res.status(400).json({ msg: 'La contraseña debe tener al menos 6 caracteres.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        const bcrypt = require('bcryptjs');

        // 1. Encriptamos la nueva clave
        const salt = await bcrypt.genSalt(10);
        const claveEncriptada = await bcrypt.hash(nuevaPassword, salt);

        // 2. 🛡️ Intentamos actualizar la clave en la tabla 'usuarios' donde coincida el proveedor_id
        const updateRes = await client.query(
            'UPDATE usuarios SET clave = $1 WHERE proveedor_id = $2 RETURNING id',
            [claveEncriptada, id]
        );

        // Si el update devolvió 0 filas, significa que el proveedor existe en 'proveedores' 
        // pero nunca se le había creado una cuenta de acceso en 'usuarios'
        if (updateRes.rows.length === 0) {
            // Buscamos su razón social para ponerla de nombre de usuario
            const provRes = await client.query('SELECT razon_social FROM proveedores WHERE id = $1', [id]);
            const razonSocial = provRes.rows.length > 0 ? provRes.rows[0].razon_social : 'Proveedor';

            // Insertamos la cuenta B2B nueva (Ajusta 'estado' o 'rol' si tu tabla te pide campos obligatorios)
            await client.query(
                `INSERT INTO usuarios (proveedor_id, correo, clave, nombres, apellidos, estado) 
                 VALUES ($1, $2, $3, $4, $5, 'activo')`,
                [id, correo, claveEncriptada, razonSocial, 'B2B']
            );
        }

        // 3. 📝 Dejamos rastro en Auditoría
        await client.query(
            `INSERT INTO auditoria (usuario_id, modulo, accion, registro_id, detalle) 
             VALUES ($1, 'SEGURIDAD_B2B', 'RESET_PASSWORD', $2, $3)`,
            [usuarioId, id, `Se forzó el cambio de clave B2B para el proveedor ID ${id}`]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Contraseña del proveedor sobrescrita con éxito.' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error al forzar clave B2B:", err.message);
        res.status(500).json({ msg: 'Error interno al intentar cambiar la contraseña.' });
    } finally {
        client.release();
    }
};

