// Ubicacion: SuperNova/backend/controllers/clientesController.js
const pool = require('../db');

// 1. OBTENER TODOS LOS CLIENTES
exports.obtenerClientes = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM clientes ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al obtener clientes');
    }
};

// 2. CREAR NUEVO CLIENTE
exports.crearCliente = async (req, res) => {
    // Desestructuración de datos (el Frontend envía las claves simplificadas)
    const { nombre_completo, documento_id, ruc, telefono, correo, direccion, nombre_hijo, fecha_nacimiento_hijo, observaciones_medicas, categoria } = req.body;

    try {
        // Validar si el DNI ya existe (usamos la columna correcta: documento_id)
        const existing = await pool.query('SELECT id FROM clientes WHERE documento_id = $1', [documento_id]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ msg: 'Ya existe un cliente con este DNI.' });
        }

        const result = await pool.query(
            `INSERT INTO clientes (
                nombre_completo, documento_id, ruc, telefono, correo, direccion,
                nombre_hijo, fecha_nacimiento_hijo, observaciones_medicas, categoria
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING *`,
            [
                nombre_completo, documento_id, ruc || null, telefono, correo || null, direccion || null,
                nombre_hijo || null, fecha_nacimiento_hijo || null, observaciones_medicas || null, categoria || 'nuevo'
            ]
        );

        res.json({ msg: 'Cliente creado con éxito', cliente: result.rows[0] });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al crear cliente');
    }
};

// 3. ACTUALIZAR CLIENTE
exports.actualizarCliente = async (req, res) => {
    const { id } = req.params;
    const { nombre_completo, documento_id, ruc, telefono, correo, direccion, nombre_hijo, fecha_nacimiento_hijo, observaciones_medicas, categoria } = req.body;

    try {
        const result = await pool.query(
            `UPDATE clientes SET 
                nombre_completo = $1, documento_id = $2, ruc = $3, telefono = $4, correo = $5,
                direccion = $6, nombre_hijo = $7, fecha_nacimiento_hijo = $8, observaciones_medicas = $9,
                categoria = $10
            WHERE id = $11 RETURNING *`,
            [
                nombre_completo, documento_id, ruc || null, telefono, correo || null, direccion || null,
                nombre_hijo || null, fecha_nacimiento_hijo || null, observaciones_medicas || null, categoria,
                id
            ]
        );

        if (result.rows.length === 0) return res.status(404).json({ msg: 'Cliente no encontrado.' });

        res.json({ msg: 'Cliente actualizado', cliente: result.rows[0] });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al actualizar cliente');
    }
};

// 4. ELIMINAR CLIENTE
exports.eliminarCliente = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('DELETE FROM clientes WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) return res.status(404).json({ msg: 'Cliente no encontrado.' });

        res.json({ msg: 'Cliente eliminado' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al eliminar cliente');
    }
};