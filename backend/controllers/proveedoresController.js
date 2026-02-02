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

// 4. ELIMINAR PROVEEDOR (Blindaje: Soft Delete si hay facturas o compras)
exports.eliminarProveedor = async (req, res) => {
    const { id } = req.params;

    try {
        // 🛡️ BLINDAJE 3: Verificar vinculación con Inventario o Facturas de compra
        // Asumiendo que tus tablas se llaman 'compras' o 'facturas_proveedor'
        const historialCompras = await pool.query('SELECT 1 FROM inventario WHERE proveedor_id = $1 LIMIT 1', [id]);
        
        // También podrías verificar en una tabla de gastos o cuentas por pagar
        // const historialGastos = await pool.query('SELECT 1 FROM gastos WHERE proveedor_id = $1 LIMIT 1', [id]);

        if (historialCompras.rows.length > 0) {
            // Si el proveedor nos ha surtido mercadería, no podemos borrarlo físicamente
            await pool.query("UPDATE proveedores SET estado = 'ELIMINADO' WHERE id = $1", [id]);
            return res.json({ msg: 'Proveedor archivado. No se puede eliminar físicamente porque tiene registros de mercadería asociados.' });
        }

        // Si es un proveedor sin historial, borrado físico
        const result = await pool.query('DELETE FROM proveedores WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) return res.status(404).json({ msg: 'Proveedor no encontrado.' });

        res.json({ msg: 'Proveedor eliminado permanentemente del sistema.' });

    } catch (err) {
        console.error("❌ Error en eliminarProveedor:", err.message);
        // Error de llave foránea genérico de PostgreSQL
        if (err.code === '23503') {
            await pool.query("UPDATE proveedores SET estado = 'ELIMINADO' WHERE id = $1", [id]);
            return res.json({ msg: 'El proveedor fue archivado debido a que tiene registros contables vinculados.' });
        }
        res.status(500).json({ msg: 'Error del servidor al procesar la eliminación' });
    }
};