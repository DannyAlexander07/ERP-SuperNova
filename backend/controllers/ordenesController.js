// Ubicacion: SuperNova/backend/controllers/ordenesController.js
const pool = require('../db');

// =======================================================
// 1. FUNCIONES INTERNAS (PARA EL ERP SUPERNOVA)
// =======================================================

// 1.1 Crear nueva Orden de Compra (Sube PDF)
exports.crearOrdenCompra = async (req, res) => {
    // ADAPTADO A TU ESQUEMA REAL
    const { proveedor_id, sede_id, codigo_oc, fecha_emision, fecha_entrega_esperada, condicion_pago, moneda, monto_subtotal, monto_igv, monto_total, observaciones } = req.body;
    const usuarioCreadorId = req.usuario ? req.usuario.id : null;
    
    // El PDF de la Orden de Compra subido por Multer/Cloudinary
    const archivoPdfUrl = req.file ? req.file.path : null;

    if (!proveedor_id || !codigo_oc || !fecha_emision || !monto_total) {
        return res.status(400).json({ msg: 'Faltan campos obligatorios para emitir la OC.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Insertamos la OC usando TUS columnas exactas
        const result = await client.query(
            `INSERT INTO ordenes_compra (
                proveedor_id, sede_id, usuario_creador_id, codigo_oc, fecha_emision, 
                fecha_entrega_esperada, moneda, monto_subtotal, monto_igv, monto_total, 
                condicion_pago, estado, observaciones, archivo_pdf_url
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'Emitida', $12, $13) RETURNING *`,
            [
                proveedor_id, sede_id, usuarioCreadorId, codigo_oc, fecha_emision, 
                fecha_entrega_esperada, moneda, monto_subtotal, monto_igv, monto_total, 
                condicion_pago, observaciones, archivoPdfUrl
            ]
        );

        const nuevaOC = result.rows[0];

        // Rastro de Auditoría
        await client.query(
            `INSERT INTO auditoria (usuario_id, modulo, accion, registro_id, detalle) 
             VALUES ($1, 'ORDENES_COMPRA', 'CREAR', $2, $3)`,
            [usuarioCreadorId, nuevaOC.id, `Se emitió la Orden de Compra N° ${codigo_oc}`]
        );

        await client.query('COMMIT');
        res.status(201).json({ msg: 'Orden de Compra emitida y guardada con éxito', orden: nuevaOC });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error al crear OC:", err);
        if (err.code === '23505') {
            return res.status(400).json({ msg: 'El código de Orden de Compra ya existe en el sistema.' });
        }
        res.status(500).json({ msg: 'Error interno al crear la Orden de Compra.' });
    } finally {
        client.release();
    }
};

// 1.2 Obtener todas las Órdenes de Compra (Para tu panel interno)
exports.obtenerOrdenesInternas = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                o.*, 
                p.razon_social as proveedor_nombre, 
                p.ruc as proveedor_ruc,
                u.nombres as creador_nombre
            FROM ordenes_compra o
            LEFT JOIN proveedores p ON o.proveedor_id = p.id
            LEFT JOIN usuarios u ON o.usuario_creador_id = u.id
            ORDER BY o.fecha_registro DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error al obtener OC internas:", err);
        res.status(500).json({ msg: 'Error al cargar las Órdenes de Compra.' });
    }
};

// 1.3 Cambiar el estado de la OC
exports.actualizarEstadoOC = async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body; 
    const usuarioId = req.usuario ? req.usuario.id : null;

    try {
        const result = await pool.query(
            'UPDATE ordenes_compra SET estado = $1 WHERE id = $2 RETURNING codigo_oc',
            [estado, id]
        );

        if (result.rows.length === 0) return res.status(404).json({ msg: 'OC no encontrada.' });

        await pool.query(
            `INSERT INTO auditoria (usuario_id, modulo, accion, registro_id, detalle) VALUES ($1, 'ORDENES_COMPRA', 'ACTUALIZAR_ESTADO', $2, $3)`,
            [usuarioId, id, `Cambió estado de OC N° ${result.rows[0].codigo_oc} a: ${estado}`]
        );

        res.json({ msg: `El estado de la OC cambió a ${estado}` });
    } catch (err) {
        console.error("❌ Error al cambiar estado de OC:", err);
        res.status(500).json({ msg: 'Error al actualizar el estado.' });
    }
};

// =======================================================
// 2. FUNCIONES B2B (EXCLUSIVO PARA EL PORTAL PROVEEDORES)
// =======================================================

// 2.1 Obtener SOLO las Órdenes del Proveedor logueado
exports.obtenerOrdenesB2B = async (req, res) => {
    const proveedorId = req.usuario.proveedor_id;
    
    if (!proveedorId) {
        return res.status(403).json({ msg: 'Acceso denegado. Perfil no autorizado.' });
    }

    try {
        // 🔥 MAGIA: Mapeamos TUS columnas reales a los nombres que espera el Frontend
        const result = await pool.query(`
            SELECT 
                codigo_oc as oc, 
                TO_CHAR(fecha_emision, 'DD/MM/YYYY') as fecha, 
                condicion_pago as condicion, 
                moneda, 
                monto_total as total, 
                observaciones as desc, 
                estado, 
                archivo_pdf_url as archivo_pdf
            FROM ordenes_compra
            WHERE proveedor_id = $1
            ORDER BY fecha_registro DESC
        `, [proveedorId]);

        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error al obtener OC del proveedor:", err);
        res.status(500).json({ msg: 'Error al obtener sus Órdenes de Compra.' });
    }
};