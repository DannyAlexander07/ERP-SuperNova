// Ubicacion: SuperNova/backend/controllers/facturasController.js
const pool = require('../db');


// 1. OBTENER TODAS LAS FACTURAS (CON NOMBRE DE SEDE Y PROVEEDOR)
exports.obtenerFacturas = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                f.id,
                f.fecha_emision,
                f.numero_documento,
                f.descripcion,
                f.monto_total,
                f.monto_neto_pagar,
                f.estado_pago,
                f.evidencia_url,
                f.fecha_vencimiento,
                f.moneda,
                f.sede_id,     
                f.categoria_gasto,  
                f.proveedor_id,    
                f.tiene_detraccion,
                f.porcentaje_detraccion,
                f.monto_detraccion,
                f.orden_compra,  /* ⬅️ ¡CAMBIO CRÍTICO: AÑADIDO! */
                p.razon_social AS proveedor,
                s.nombre AS sede
            FROM facturas f
            LEFT JOIN proveedores p ON f.proveedor_id = p.id
            LEFT JOIN sedes s ON f.sede_id = s.id
            ORDER BY f.fecha_emision DESC
            LIMIT 100
        `);
        
        res.json(result.rows);
    } catch (err) {
        console.error("Error:", err.message);
        res.status(500).send('Error al obtener facturas');
    }
};


// 2. CREAR NUEVA FACTURA
exports.crearFactura = async (req, res) => {
    const {
        proveedorId, glosa, sede, tipo, serie, emision, vencimiento,
        moneda, total, neto, tieneDetraccion, porcentajeDet, montoDet, oc,
        categoria, formaPago 
    } = req.body;

    const usuarioId = req.usuario ? req.usuario.id : null; 
    const evidenciaUrl = req.file ? `/uploads/${req.file.filename}` : null;

    if (!proveedorId || !emision || !total || !categoria) {
        return res.status(400).json({ msg: 'Faltan campos obligatorios.' });
    }
    if (parseFloat(total) <= 0) {
        return res.status(400).json({ msg: 'El Monto Total debe ser mayor a cero.' });
    }

    const estadoPago = formaPago === 'Contado' ? 'pagado' : 'pendiente';
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // A. Crear Factura
        const result = await client.query(
            `INSERT INTO facturas (
                proveedor_id, usuario_id, sede_id,
                descripcion, tipo_documento, numero_documento, fecha_emision,
                fecha_vencimiento, moneda, monto_total, monto_neto_pagar,
                tiene_detraccion, porcentaje_detraccion, monto_detraccion, orden_compra,
                categoria_gasto, evidencia_url, estado_pago
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING id, numero_documento`,
            [
                proveedorId, usuarioId, sede,
                glosa, tipo, serie, emision,
                vencimiento, moneda, total, neto,
                tieneDetraccion, porcentajeDet || 0, montoDet || 0, oc || null,
                categoria, evidenciaUrl, estadoPago
            ]
        );
        const facturaId = result.rows[0].id;
        
        // B. IMPACTO EN CAJA (Si es al contado) --- 🚨 ESTO ES LO NUEVO
        if (estadoPago === 'pagado') {
            await client.query(
                `INSERT INTO movimientos_caja (
                    sede_id, usuario_id, tipo_movimiento, categoria, 
                    descripcion, monto, metodo_pago, gasto_id
                ) VALUES ($1, $2, 'EGRESO', $3, $4, $5, 'EFECTIVO', $6)`, 
                [
                    sede, usuarioId, categoria, 
                    `Pago Contado Fac. ${result.rows[0].numero_documento} (${glosa})`,
                    total, facturaId
                ]
            );
        }

        // C. Auditoría
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'CREAR', 'FACTURAS', $2, $3)`,
            [usuarioId, facturaId, `Creó factura N° ${result.rows[0].numero_documento} (${estadoPago})`]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Gasto registrado correctamente', factura: result.rows[0] });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).send('Error al crear factura');
    } finally {
        client.release();
    }
};


// 3. ELIMINAR FACTURA
exports.eliminarFactura = async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuario ? req.usuario.id : null;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        
        // 1. Verificar si tiene pagos asociados
        const pagosRes = await client.query('SELECT COUNT(*) FROM movimientos_caja WHERE gasto_id = $1', [id]);
        if (parseInt(pagosRes.rows[0].count) > 0) {
            throw new Error('No se puede eliminar: La factura ya tiene pagos registrados en caja.');
        }

        // 2. Eliminar la factura
        const result = await client.query('DELETE FROM facturas WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) throw new Error('Factura no encontrada.');
        
        // 🚨 Auditoría (Punto 7)
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'ELIMINAR', 'FACTURAS', $2, $3)`,
            [usuarioId, id, `Eliminó factura N° ${result.rows[0].numero_documento}`]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Factura eliminada' });

    } catch (err) {
        await client.query('ROLLBACK');
        const msg = err.message.includes('pagos registrados') ? err.message : 'Error al eliminar factura';
        console.error(err.message);
        res.status(400).json({ msg });

    } finally {
        client.release();
    }
};

// 4. ACTUALIZAR FACTURA (EDITAR) - ACTUALIZADA
exports.actualizarFactura = async (req, res) => {
    const { id } = req.params;
    const { 
        proveedorId, glosa, sede, tipo, serie, emision, formaPago, vencimiento, 
        moneda, total, neto, tieneDetraccion, porcentajeDet, montoDet, oc,
        categoria 
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 

    if (!proveedorId || !emision || !total || !categoria) {
        return res.status(400).json({ msg: 'Faltan campos obligatorios: Proveedor, Fecha Emisión, Monto Total y Categoría de Gasto.' });
    }
    if (parseFloat(total) <= 0) {
        return res.status(400).json({ msg: 'El Monto Total debe ser mayor a cero.' });
    }

    const client = await pool.connect(); // 🛡️ Usamos client para transacción

    try {
        await client.query('BEGIN');

        // 🚨 SINCRONIZACIÓN CON CAJA: Si el monto cambió y era Contado, actualizamos el movimiento de caja
        const checkFac = await client.query('SELECT monto_total, forma_pago FROM facturas WHERE id = $1 FOR UPDATE', [id]);
        
        if (checkFac.rows.length > 0 && checkFac.rows[0].forma_pago === 'Contado') {
            if (Number(checkFac.rows[0].monto_total) !== Number(total)) {
                await client.query(
                    'UPDATE movimientos_caja SET monto = $1, categoria = $2 WHERE gasto_id = $3',
                    [total, categoria, id]
                );
            }
        }

        const result = await client.query(
            `UPDATE facturas SET
                proveedor_id = $1, sede_id = $2, descripcion = $3, tipo_documento = $4,
                numero_documento = $5, fecha_emision = $6, fecha_vencimiento = $7,
                forma_pago = $8, moneda = $9, monto_total = $10, monto_neto_pagar = $11,
                tiene_detraccion = $12, porcentaje_detraccion = $13, monto_detraccion = $14,
                orden_compra = $15, categoria_gasto = $16
            WHERE id = $17 RETURNING *`,
            [
                proveedorId, sede, glosa, tipo, serie, emision, vencimiento, formaPago,
                moneda, total, neto, tieneDetraccion, porcentajeDet, montoDet, oc, 
                categoria, id
            ]
        );

        if (result.rows.length === 0) throw new Error('Factura no encontrada.');
        
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'ACTUALIZAR', 'FACTURAS', $2, $3)`,
            [usuarioId, id, `Actualizó factura N° ${result.rows[0].numero_documento}. Total: ${moneda} ${total}.`]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Factura actualizada', factura: result.rows[0] });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error en actualizarFactura:", err.message);
        res.status(500).json({ msg: err.message || 'Error al actualizar' });
    } finally {
        client.release(); // 🛡️ Liberamos conexión
    }
};

exports.subirArchivo = async (req, res) => {
    const { id } = req.params;
    // Gracias a multer, ahora req.file contiene la información del archivo subido
    const archivo = req.file;

    if (!archivo) {
        return res.status(400).json({ msg: 'No se ha enviado ningún archivo.' });
    }

    try {
        // La ruta donde multer guardó el archivo.
        // Normalizamos las barras para que se guarden estilo UNIX (mejor compatibilidad)
        const filePath = archivo.path.replace(/\\/g, '/'); 

        // CORRECCIÓN: Usar el nombre de columna correcto 'evidencia_url'
        await pool.query(
            'UPDATE facturas SET evidencia_url = $1 WHERE id = $2',
            [filePath, id]
        );

        res.json({ msg: 'Archivo subido y registrado con éxito.', path: filePath });

    } catch (err) {
        console.error("Error al subir archivo:", err.message);
        res.status(500).json({ msg: 'Error al subir el archivo.' });
    }
};


// 5. PAGAR FACTURA - ACTUALIZADA
exports.pagarFactura = async (req, res) => {
    const { id } = req.params;
    const { fechaPago } = req.body; 
    const usuarioId = req.usuario ? req.usuario.id : null; 

    if (!fechaPago) return res.status(400).json({ msg: 'Falta fecha de pago.' });

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // A. Obtener datos de factura con BLOQUEO (FOR UPDATE) para evitar doble pago
        const facRes = await client.query('SELECT * FROM facturas WHERE id = $1 FOR UPDATE', [id]);
        if (facRes.rows.length === 0) throw new Error('Factura no encontrada');
        const fac = facRes.rows[0];

        if (fac.estado_pago === 'pagado') throw new Error('Esta factura ya ha sido pagada previamente.');

        // B. Actualizar estado
        await client.query(
            `UPDATE facturas SET estado_pago = 'pagado', fecha_pago = $1 WHERE id = $2`,
            [fechaPago, id]
        );

        // C. Registrar EGRESO en CAJA
        await client.query(
            `INSERT INTO movimientos_caja (
                sede_id, usuario_id, tipo_movimiento, categoria, 
                descripcion, monto, metodo_pago, gasto_id
            ) VALUES ($1, $2, 'EGRESO', $3, $4, $5, 'TRANSFERENCIA', $6)`,
            [
                fac.sede_id, usuarioId, fac.categoria_gasto,
                `Pago Diferido Fac. ${fac.numero_documento}`,
                fac.monto_total, id
            ]
        );
        
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'PAGAR', 'FACTURAS', $2, $3)`,
            [usuarioId, id, `Pagó factura N° ${fac.numero_documento}`]
        );
        
        await client.query('COMMIT');
        res.json({ msg: 'Pago registrado y descontado de caja', factura: fac });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error pago:", err.message);
        res.status(500).json({ msg: err.message || 'Error al procesar pago.' });
    } finally {
        client.release(); // 🛡️ Liberamos conexión
    }
};