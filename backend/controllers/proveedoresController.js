// Ubicacion: SuperNova/backend/controllers/proveedoresController.js
const pool = require('../db');

// 1. OBTENER TODOS LOS PROVEEDORES
exports.obtenerProveedores = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM proveedores ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al obtener proveedores');
    }
};

// 2. CREAR NUEVO PROVEEDOR
exports.crearProveedor = async (req, res) => {
    const { ruc, razon, direccion, categoria, dias, contacto, email, telefono, banco, estado } = req.body;

    try {
        // Validación de RUC (debe ser único)
        const existing = await pool.query('SELECT id FROM proveedores WHERE ruc = $1', [ruc]);
        if (existing.rows.length > 0) {
            return res.status(400).json({ msg: 'Ya existe un proveedor con este RUC/DNI.' });
        }

        const result = await pool.query(
            `INSERT INTO proveedores (
                ruc, razon_social, direccion, categoria, dias_credito, 
                nombre_contacto, correo_contacto, telefono, cuenta_bancaria, estado
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
            RETURNING *`,
            [
                ruc, razon, direccion || null, categoria, dias, 
                contacto || null, email || null, telefono || null, banco || null, estado || 'activo'
            ]
        );

        res.json({ msg: 'Proveedor creado con éxito', proveedor: result.rows[0] });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al crear proveedor');
    }
};

// 3. ACTUALIZAR PROVEEDOR
exports.actualizarProveedor = async (req, res) => {
    const { id } = req.params;
    const { ruc, razon, direccion, categoria, dias, contacto, email, telefono, banco, estado } = req.body;

    try {
        const result = await pool.query(
            `UPDATE proveedores SET 
                ruc = $1, razon_social = $2, direccion = $3, categoria = $4, dias_credito = $5, 
                nombre_contacto = $6, correo_contacto = $7, telefono = $8, cuenta_bancaria = $9, estado = $10
            WHERE id = $11 RETURNING *`,
            [
                ruc, razon, direccion || null, categoria, dias, 
                contacto || null, email || null, telefono || null, banco || null, estado,
                id
            ]
        );

        if (result.rows.length === 0) return res.status(404).json({ msg: 'Proveedor no encontrado.' });

        res.json({ msg: 'Proveedor actualizado', proveedor: result.rows[0] });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al actualizar proveedor');
    }
};

// 4. ELIMINAR PROVEEDOR
exports.eliminarProveedor = async (req, res) => {
    const { id } = req.params;

    try {
        const result = await pool.query('DELETE FROM proveedores WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) return res.status(404).json({ msg: 'Proveedor no encontrado.' });

        res.json({ msg: 'Proveedor eliminado' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al eliminar proveedor');
    }
};