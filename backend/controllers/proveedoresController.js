// Ubicacion: SuperNova/backend/controllers/proveedoresController.js
const pool = require('../db');

// 1. OBTENER TODOS LOS PROVEEDORES (Solo Activos)
exports.obtenerProveedores = async (req, res) => {
    try {
        // Blindaje: No mostramos proveedores con estado 'ELIMINADO'
        const result = await pool.query(`
            SELECT * FROM proveedores 
            WHERE estado != 'ELIMINADO' OR estado IS NULL 
            ORDER BY id DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error en obtenerProveedores:", err.message);
        res.status(500).json({ msg: 'Error al obtener proveedores' });
    }
};

// 2. CREAR NUEVO PROVEEDOR
exports.crearProveedor = async (req, res) => {
    let { ruc, razon, direccion, categoria, dias, contacto, email, telefono, banco, estado } = req.body;

    if (!razon || razon.trim() === '') {
            return res.status(400).json({ msg: 'La Razón Social (Nombre de la empresa) es obligatoria.' });
        }

    try {
        // 🛡️ BLINDAJE 1: Sanitización (Evitar espacios accidentales en campos clave)
        const rucLimpio = ruc ? ruc.toString().trim() : null;
        const telefonoLimpio = telefono ? telefono.toString().trim() : null;

        // Validación de RUC único
        const existing = await pool.query('SELECT id FROM proveedores WHERE ruc = $1', [rucLimpio]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ msg: 'Ya existe un proveedor registrado con este RUC/DNI.' });
        }

        const result = await pool.query(
            `INSERT INTO proveedores (
                ruc, razon_social, direccion, categoria, dias_credito, 
                nombre_contacto, correo_contacto, telefono, cuenta_bancaria, estado
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
            RETURNING *`,
            [
                rucLimpio, razon, direccion || null, categoria, parseInt(dias) || 0, 
                contacto || null, email || null, telefonoLimpio, banco || null, estado || 'activo'
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
    let { ruc, razon, direccion, categoria, dias, contacto, email, telefono, banco, estado } = req.body;

    if (!razon || razon.trim() === '') {
            return res.status(400).json({ msg: 'La Razón Social (Nombre de la empresa) es obligatoria.' });
        }

    try {
        const rucLimpio = ruc ? ruc.toString().trim() : null;

        // 🛡️ BLINDAJE 2: Evitar que al editar se use un RUC que ya tiene OTRO proveedor
        const checkRuc = await pool.query('SELECT id FROM proveedores WHERE ruc = $1 AND id != $2', [rucLimpio, id]);
        if (checkRuc.rows.length > 0) {
            return res.status(400).json({ msg: 'El RUC ingresado ya pertenece a otro proveedor registrado.' });
        }

        const result = await pool.query(
            `UPDATE proveedores SET 
                ruc = $1, razon_social = $2, direccion = $3, categoria = $4, dias_credito = $5, 
                nombre_contacto = $6, correo_contacto = $7, telefono = $8, cuenta_bancaria = $9, estado = $10
            WHERE id = $11 RETURNING *`,
            [
                rucLimpio, razon, direccion || null, categoria, parseInt(dias) || 0, 
                contacto || null, email || null, telefono || null, banco || null, estado,
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