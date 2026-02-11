// Ubicacion: SuperNova/backend/controllers/facturasController.js
const pool = require('../db');

// =======================================================
// 1. GESTIÓN DE FACTURAS / GASTOS
// =======================================================

// 1.1 OBTENER TODAS LAS FACTURAS (MEJORADO CON SALDO PENDIENTE)
exports.obtenerFacturas = async (req, res) => {
    try {
        // Obtenemos facturas y calculamos lo pagado sumando los movimientos de caja asociados
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
                f.orden_compra,
                p.razon_social AS proveedor,
                s.nombre AS sede,
                -- 🆕 CÁLCULO DE PAGOS PARCIALES
                COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE gasto_id = f.id AND tipo_movimiento = 'EGRESO'), 0) as monto_pagado
            FROM facturas f
            LEFT JOIN proveedores p ON f.proveedor_id = p.id
            LEFT JOIN sedes s ON f.sede_id = s.id
            ORDER BY f.fecha_emision DESC
            LIMIT 100
        `);
        
        // Calculamos saldo pendiente en el servidor para facilitar el frontend
        const facturasConSaldo = result.rows.map(f => ({
            ...f,
            saldo_pendiente: Number(f.monto_total) - Number(f.monto_pagado)
        }));

        res.json(facturasConSaldo);
    } catch (err) {
        console.error("Error:", err.message);
        res.status(500).send('Error al obtener facturas');
    }
};

// 1.2 CREAR NUEVA FACTURA
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
        
        // B. IMPACTO EN CAJA (Si es al contado)
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

// 1.3 ELIMINAR FACTURA
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
        
        // Auditoría
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

// 1.4 ACTUALIZAR FACTURA
exports.actualizarFactura = async (req, res) => {
    const { id } = req.params;
    const { 
        proveedorId, glosa, sede, tipo, serie, emision, formaPago, vencimiento, 
        moneda, total, neto, tieneDetraccion, porcentajeDet, montoDet, oc,
        categoria 
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 

    if (!proveedorId || !emision || !total || !categoria) {
        return res.status(400).json({ msg: 'Faltan campos obligatorios.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // Sincronización con Caja si es Contado
        const checkFac = await client.query(
            'SELECT monto_total, forma_pago, descripcion, numero_documento FROM facturas WHERE id = $1 FOR UPDATE', 
            [id]
        );
        
        if (checkFac.rows.length > 0 && checkFac.rows[0].forma_pago === 'Contado') {
            const old = checkFac.rows[0];
            if (Number(old.monto_total) !== Number(total) || old.descripcion !== glosa) {
                await client.query(
                    `UPDATE movimientos_caja SET monto = $1, categoria = $2, descripcion = $3 WHERE gasto_id = $4`,
                    [total, categoria, `Pago Contado Fac. ${serie} (${glosa})`, id]
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

        await client.query('COMMIT');
        res.json({ msg: 'Factura actualizada', factura: result.rows[0] });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ msg: err.message || 'Error al actualizar' });
    } finally {
        client.release();
    }
};

exports.subirArchivo = async (req, res) => {
    const { id } = req.params;
    const archivo = req.file;

    if (!archivo) return res.status(400).json({ msg: 'No se envió archivo.' });

    try {
        const filePath = archivo.path.replace(/\\/g, '/'); 
        await pool.query('UPDATE facturas SET evidencia_url = $1 WHERE id = $2', [filePath, id]);
        res.json({ msg: 'Archivo subido', path: filePath });
    } catch (err) {
        res.status(500).json({ msg: 'Error al subir archivo' });
    }
};

// =======================================================
// 2. GESTIÓN DE PAGOS (AMORTIZACIONES Y PARCIALES)
// =======================================================

// 2.1 REGISTRAR PAGO A FACTURA (Soporta Parciales)
exports.pagarFactura = async (req, res) => {
    const { id } = req.params;
    // Ahora recibimos monto y método, no solo fecha
    const { fechaPago, monto, metodo, operacion } = req.body; 
    const usuarioId = req.usuario ? req.usuario.id : null; 

    if (!fechaPago || !monto) return res.status(400).json({ msg: 'Faltan datos de pago.' });

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // A. Validar Factura y Saldo
        const facRes = await client.query(`
            SELECT f.*, 
            COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE gasto_id = f.id), 0) as pagado 
            FROM facturas f WHERE id = $1 FOR UPDATE`, [id]);
            
        if (facRes.rows.length === 0) throw new Error('Factura no encontrada');
        const fac = facRes.rows[0];
        
        const saldo = parseFloat(fac.monto_total) - parseFloat(fac.pagado);
        if (parseFloat(monto) > saldo + 0.1) throw new Error(`El monto excede el saldo pendiente (S/ ${saldo.toFixed(2)})`);

        // B. Registrar EGRESO en CAJA (Esto cuenta como pago)
        await client.query(
            `INSERT INTO movimientos_caja (
                sede_id, usuario_id, tipo_movimiento, categoria, 
                descripcion, monto, metodo_pago, gasto_id, numero_operacion, fecha_creacion
            ) VALUES ($1, $2, 'EGRESO', $3, $4, $5, $6, $7, $8, $9)`,
            [
                fac.sede_id, usuarioId, fac.categoria_gasto,
                `Amortización Fac. ${fac.numero_documento}`,
                monto, metodo || 'TRANSFERENCIA', id, operacion || '', fechaPago
            ]
        );

        // C. Actualizar estado si se pagó todo
        const nuevoPagado = parseFloat(fac.pagado) + parseFloat(monto);
        let nuevoEstado = 'parcial';
        if (nuevoPagado >= parseFloat(fac.monto_total) - 0.1) nuevoEstado = 'pagado';

        await client.query(
            `UPDATE facturas SET estado_pago = $1, fecha_pago = $2 WHERE id = $3`,
            [nuevoEstado, fechaPago, id]
        );
        
        await client.query('COMMIT');
        res.json({ msg: 'Pago registrado correctamente', nuevoEstado });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error pago:", err.message);
        res.status(500).json({ msg: err.message });
    } finally {
        client.release();
    }
};

// =======================================================
// 7. OBTENER KPIs DE PAGOS (Solución Definitiva Hora Perú)
// =======================================================
exports.obtenerKpisPagos = async (req, res) => {
    try {
        // SOLUCIÓN:
        // 1. fecha_creacion::date -> Toma la fecha tal cual está guardada (ej: 2026-02-10), sin cambiarle la hora.
        // 2. (NOW() AT TIME ZONE 'America/Lima')::date -> Fuerza a que "HOY" sea la fecha de Perú, 
        //    evitando que a las 7PM el servidor piense que ya es mañana.

        const result = await pool.query(`
            SELECT 
                -- Total Hoy
                COALESCE(SUM(CASE 
                    WHEN fecha_creacion::date = (NOW() AT TIME ZONE 'America/Lima')::date 
                    THEN monto 
                    ELSE 0 END), 0) AS total_hoy,
                
                -- Total Mes Actual
                COALESCE(SUM(CASE 
                    WHEN to_char(fecha_creacion, 'YYYY-MM') = to_char(NOW() AT TIME ZONE 'America/Lima', 'YYYY-MM')
                    THEN monto 
                    ELSE 0 END), 0) AS total_mes,
                
                -- Total Año Actual
                COALESCE(SUM(CASE 
                    WHEN to_char(fecha_creacion, 'YYYY') = to_char(NOW() AT TIME ZONE 'America/Lima', 'YYYY')
                    THEN monto 
                    ELSE 0 END), 0) AS total_anio

            FROM movimientos_caja 
            WHERE tipo_movimiento = 'EGRESO'
        `);

        res.json(result.rows[0]);

    } catch (err) {
        console.error("Error KPIs:", err);
        res.json({ total_hoy: 0, total_mes: 0, total_anio: 0 });
    }
};