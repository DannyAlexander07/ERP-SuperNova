// Ubicacion: SuperNova/backend/controllers/clientesController.js
const pool = require('../db');

// 1. OBTENER TODOS LOS CLIENTES (Solo activos)
exports.obtenerClientes = async (req, res) => {
    try {
        // Blindaje: Solo traemos los que no están marcados como borrados (Soft Delete)
        const result = await pool.query("SELECT * FROM clientes WHERE estado != 'ELIMINADO' ORDER BY id DESC");
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al obtener clientes');
    }
};

// 2. CREAR NUEVO CLIENTE
exports.crearCliente = async (req, res) => {
    let { nombre_completo, documento_id, ruc, telefono, correo, direccion, nombre_hijo, fecha_nacimiento_hijo, observaciones_medicas, categoria } = req.body;

    try {
        // 🛡️ BLINDAJE 1: Sanitización (Limpiar espacios en blanco)
        const dniLimpio = documento_id ? documento_id.toString().trim() : null;
        
        // Validar si el DNI ya existe
        const existing = await pool.query('SELECT id FROM clientes WHERE documento_id = $1', [dniLimpio]);
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
                nombre_completo, dniLimpio, ruc || null, telefono, correo || null, direccion || null,
                nombre_hijo || null, fecha_nacimiento_hijo || null, observaciones_medicas || null, categoria || 'nuevo'
            ]
        );

        res.json({ msg: 'Cliente creado con éxito', cliente: result.rows[0] });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al crear cliente');
    }
};

// 3. ACTUALIZAR CLIENTE (Blindaje de duplicados)
exports.actualizarCliente = async (req, res) => {
    const { id } = req.params;
    let { nombre_completo, documento_id, ruc, telefono, correo, direccion, nombre_hijo, fecha_nacimiento_hijo, observaciones_medicas, categoria } = req.body;

    try {
        const dniLimpio = documento_id ? documento_id.toString().trim() : null;

        // 🛡️ BLINDAJE 2: Validar que el DNI no sea de OTRO cliente
        const checkDni = await pool.query('SELECT id FROM clientes WHERE documento_id = $1 AND id != $2', [dniLimpio, id]);
        if (checkDni.rows.length > 0) {
            return res.status(400).json({ msg: 'El DNI ingresado ya pertenece a otro cliente.' });
        }

        const result = await pool.query(
            `UPDATE clientes SET 
                nombre_completo = $1, documento_id = $2, ruc = $3, telefono = $4, correo = $5,
                direccion = $6, nombre_hijo = $7, fecha_nacimiento_hijo = $8, observaciones_medicas = $9,
                categoria = $10
            WHERE id = $11 RETURNING *`,
            [
                nombre_completo, dniLimpio, ruc || null, telefono, correo || null, direccion || null,
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

// 4. ELIMINAR CLIENTE (INTELIGENTE: Soft Delete si hay historial)
exports.eliminarCliente = async (req, res) => {
    const { id } = req.params;

    try {
        // 🛡️ BLINDAJE 3: Verificar historial antes de borrar físicamente
        const historialVentas = await pool.query('SELECT 1 FROM ventas WHERE cliente_id = $1 LIMIT 1', [id]);
        const historialEventos = await pool.query('SELECT 1 FROM eventos WHERE cliente_id = $1 LIMIT 1', [id]);

        if (historialVentas.rows.length > 0 || historialEventos.rows.length > 0) {
            // Si tiene historial, NO borramos de la DB, solo lo ocultamos (Soft Delete)
            await pool.query("UPDATE clientes SET estado = 'ELIMINADO' WHERE id = $1", [id]);
            return res.json({ msg: 'Cliente archivado correctamente (Se conservó su historial de ventas/eventos).' });
        }

        // Si es un cliente nuevo sin movimientos, borrado físico limpio
        const result = await pool.query('DELETE FROM clientes WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) return res.status(404).json({ msg: 'Cliente no encontrado.' });

        res.json({ msg: 'Cliente eliminado permanentemente.' });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al procesar la eliminación del cliente');
    }
};