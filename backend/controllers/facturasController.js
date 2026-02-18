// Ubicacion: SuperNova/backend/controllers/facturasController.js
const pool = require('../db');

// =======================================================
// 1. GESTIÓN DE FACTURAS / GASTOS
// =======================================================

// 1.1 OBTENER TODAS LAS FACTURAS (ACTUALIZADO CON CÁLCULO DE DÍAS VENCIDOS REAL)
exports.obtenerFacturas = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                f.id,
                f.fecha_emision,
                f.fecha_programacion,
                f.numero_documento,
                f.tipo_documento,     -- Necesario para la lógica de Invoice/Factura
                f.descripcion,
                f.monto_total,
                f.base_imponible,     -- Nuevo campo para Monto Base
                f.monto_neto_pagar,   -- Mantenemos por compatibilidad
                f.estado_pago,
                f.estado_aprobacion,  -- 🆕 NUEVO: Fundamental para el Flujo de Aprobación
                f.evidencia_url,
                f.fecha_vencimiento,
                f.moneda,
                f.sede_id,     
                f.categoria_gasto,  
                f.proveedor_id,    
                f.porcentaje_detraccion, -- Necesario para el selector de impuestos
                f.banco,              -- Datos Bancarios
                f.numero_cuenta,      
                f.cci,                
                p.razon_social AS proveedor,
                s.nombre AS sede,
                -- 🚀 CÁLCULO DE DÍAS VENCIDOS: Compara fechas a las 00:00:00 (Hora Lima)
                -- Al usar ::date forzamos a PostgreSQL a ignorar la hora y comparar solo el día del calendario.
                CASE 
                    WHEN f.fecha_vencimiento < (CURRENT_DATE AT TIME ZONE 'America/Lima')::date 
                    THEN (CURRENT_DATE AT TIME ZONE 'America/Lima')::date - f.fecha_vencimiento
                    ELSE 0 
                END as dias_mora,
                -- CÁLCULO DE PAGOS PARCIALES
                COALESCE((SELECT SUM(monto) FROM movimientos_caja WHERE gasto_id = f.id AND tipo_movimiento = 'EGRESO'), 0) as monto_pagado
            FROM facturas f
            LEFT JOIN proveedores p ON f.proveedor_id = p.id
            LEFT JOIN sedes s ON f.sede_id = s.id
            ORDER BY f.fecha_emision DESC
            LIMIT 100
        `);
        
        // Calculamos saldo pendiente y formateamos días vencidos para el frontend
        const facturasConSaldo = result.rows.map(f => ({
            ...f,
            saldo_pendiente: Number(f.monto_total) - Number(f.monto_pagado),
            // Enviamos el número de días para que el frontend decida si poner "AL DÍA" o "X DÍAS VENC."
            // Se usa parseInt para asegurar un valor numérico limpio.
            dias_vencidos_count: parseInt(f.dias_mora)
        }));

        res.json(facturasConSaldo);

    } catch (err) {
        console.error("Error al obtener facturas:", err.message);
        // Devolvemos JSON para mantener consistencia con el frontend
        res.status(500).json({ msg: 'Error al obtener lista de facturas' });
    }
};

// 1.2 CREAR NUEVA FACTURA
exports.crearFactura = async (req, res) => {
    const {
        proveedorId, glosa, sede, tipo, serie, emision, vencimiento,
        moneda, total, formaPago, categoria,
        monto_base, impuesto_porcentaje, banco, cuenta, cci, programacion
    } = req.body;

    const usuarioId = req.usuario ? req.usuario.id : null; 
    const evidenciaUrl = req.file ? `/uploads/${req.file.filename}` : null;

    // Validaciones básicas
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
        // Mapeamos los datos del frontend a las columnas que vimos en tu SQL
        const result = await client.query(
            `INSERT INTO facturas (
                proveedor_id,           -- 1
                usuario_id,             -- 2
                sede_id,                -- 3
                descripcion,            -- 4
                tipo_documento,         -- 5
                numero_documento,       -- 6
                fecha_emision,          -- 7
                fecha_vencimiento,      -- 8
                moneda,                 -- 9
                monto_total,            -- 10
                categoria_gasto,        -- 11
                evidencia_url,          -- 12
                estado_pago,            -- 13
                base_imponible,         -- 14
                porcentaje_detraccion,  -- 15
                banco,                  -- 16
                numero_cuenta,          -- 17
                cci,                    -- 18
                fecha_programacion      -- 19 (Aquí estaba el desajuste)
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
                $11, $12, $13, $14, $15, $16, $17, $18, $19
            )
            RETURNING id, numero_documento`,
            [
                proveedorId,            // $1
                usuarioId,              // $2
                sede,                   // $3
                glosa,                  // $4
                tipo,                   // $5
                serie,                  // $6
                emision,                // $7
                vencimiento,            // $8
                moneda,                 // $9
                total,                  // $10
                categoria,              // $11
                evidenciaUrl,           // $12
                estadoPago,             // $13
                monto_base,             // $14
                impuesto_porcentaje,    // $15
                banco,                  // $16
                cuenta,                 // $17
                cci,                    // $18
                programacion || null    // $19
            ]
        );
        const facturaId = result.rows[0].id;
        
        // B. IMPACTO EN CAJA (Solo si es al contado)
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
        res.status(500).send('Error al crear factura: ' + err.message);
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

// 1.4 ACTUALIZAR FACTURA (COMPLETO: Archivos, Montos, Fechas y Lógica de Pago "Olvidadizo")
exports.actualizarFactura = async (req, res) => {
    const { id } = req.params;
    
    // ⚠️ Usamos 'let' para poder corregir los valores vacíos antes de guardar
    let { 
        proveedorId, glosa, sede, tipo, serie, emision, formaPago, vencimiento, 
        moneda, total, categoria,
        monto_base, impuesto_porcentaje, banco, cuenta, cci, programacion 
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 

    // --- 🛡️ SANITIZACIÓN DE DATOS ---
    // Si viene vacío o null, lo forzamos a 0
    monto_base = (monto_base === "" || monto_base === null) ? 0 : monto_base;
    impuesto_porcentaje = (impuesto_porcentaje === "" || impuesto_porcentaje === null) ? 0 : impuesto_porcentaje;
    
    // Limpieza de textos y fechas
    banco = banco ? banco.trim() : null;
    cuenta = cuenta ? cuenta.trim() : null;
    cci = cci ? cci.trim() : null;
    programacion = (programacion === "" || programacion === null) ? null : programacion;

    // Validaciones básicas
    if (!proveedorId || !emision || !total || !categoria) {
        return res.status(400).json({ msg: 'Faltan campos obligatorios.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // --- A. ACTUALIZAR EVIDENCIA (SI SE SUBIÓ UN NUEVO ARCHIVO) ---
        if (req.file) {
            const nuevaEvidenciaUrl = `/uploads/${req.file.filename}`;
            await client.query(
                'UPDATE facturas SET evidencia_url = $1 WHERE id = $2',
                [nuevaEvidenciaUrl, id]
            );
        }

        // --- B. LÓGICA DE PAGOS Y CAJA (EL CEREBRO) ---
        
        // 1. Obtenemos los datos ANTERIORES de la factura para comparar
        const checkFac = await client.query(
            'SELECT monto_total, forma_pago, descripcion, numero_documento FROM facturas WHERE id = $1 FOR UPDATE', 
            [id]
        );
        const old = checkFac.rows[0];

        // 2. Definimos el nuevo estado de pago según el check "Contado"
        // Si formaPago es 'Contado', forzamos el estado a 'pagado', sino 'pendiente'
        const nuevoEstadoPago = (formaPago === 'Contado') ? 'pagado' : 'pendiente';

        // CASO 1: CORRECCIÓN DE OLVIDO -> Era 'Credito' y ahora es 'Contado'
        // (El usuario se olvidó de marcar el check al crearla, lo marca ahora al editar)
        if (old.forma_pago !== 'Contado' && formaPago === 'Contado') {
            await client.query(
                `INSERT INTO movimientos_caja (
                    sede_id, usuario_id, tipo_movimiento, categoria, 
                    descripcion, monto, metodo_pago, gasto_id, fecha_creacion
                ) VALUES ($1, $2, 'EGRESO', $3, $4, $5, 'EFECTIVO', $6, $7)`, 
                [
                    sede, usuarioId, categoria, 
                    `Pago (Corrección) Fac. ${serie} (${glosa})`,
                    total, id, emision // Usamos la fecha de emisión para consistencia
                ]
            );
        }

        // CASO 2: ACTUALIZACIÓN -> Ya era 'Contado' y sigue siendo 'Contado'
        // (Pero cambió el monto o la descripción)
        else if (old.forma_pago === 'Contado' && formaPago === 'Contado') {
            if (Number(old.monto_total) !== Number(total) || old.descripcion !== glosa) {
                await client.query(
                    `UPDATE movimientos_caja 
                     SET monto = $1, categoria = $2, descripcion = $3 
                     WHERE gasto_id = $4`,
                    [total, categoria, `Pago Contado Fac. ${serie} (${glosa})`, id]
                );
            }
        }

        // --- C. ACTUALIZAR DATOS DE LA FACTURA ---
        // Nota: Agregamos 'estado_pago = $17' para que se marque como pagado en la tabla visual
        const result = await client.query(
            `UPDATE facturas SET
                proveedor_id = $1, 
                sede_id = $2, 
                descripcion = $3, 
                tipo_documento = $4,
                numero_documento = $5, 
                fecha_emision = $6, 
                fecha_vencimiento = $7,
                forma_pago = $8, 
                moneda = $9, 
                monto_total = $10,
                categoria_gasto = $11,
                base_imponible = $12, 
                porcentaje_detraccion = $13, 
                banco = $14, 
                numero_cuenta = $15, 
                cci = $16,
                estado_pago = $17,     -- 🆕 Actualizamos estado visual (Verde/Rojo)
                fecha_programacion = $19
            WHERE id = $18 RETURNING *`,
            [
                proveedorId,          // $1
                sede,                 // $2
                glosa,                // $3
                tipo,                 // $4
                serie,                // $5
                emision,              // $6
                vencimiento,          // $7
                formaPago,            // $8
                moneda,               // $9
                total,                // $10
                categoria,            // $11
                monto_base,           // $12
                impuesto_porcentaje,  // $13
                banco,                // $14
                cuenta,               // $15
                cci,                  // $16
                nuevoEstadoPago,      // $17 (El estado calculado: pagado/pendiente)
                id,                   // $18 (ID para el WHERE)
                programacion          // $19
            ]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Factura actualizada correctamente', factura: result.rows[0] });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error updating:", err);
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
// 7. OBTENER KPIs DE PAGOS (Separado Soles/Dólares - Fase 2)
// =======================================================
exports.obtenerKpisPagos = async (req, res) => {
    const client = await pool.connect();
    try {
        // 1. CONSULTA DE PAGOS REALIZADOS (Dividido en PEN y USD)
        // Conectamos caja con facturas para saber en qué moneda fue el pago
        const pagosQuery = await client.query(`
            SELECT 
                f.moneda,
                -- Total Hoy (Lima)
                COALESCE(SUM(CASE 
                    WHEN m.fecha_creacion::date = (NOW() AT TIME ZONE 'America/Lima')::date 
                    THEN m.monto ELSE 0 END), 0) AS total_hoy,
                
                -- Total Mes Actual (Lima)
                COALESCE(SUM(CASE 
                    WHEN to_char(m.fecha_creacion, 'YYYY-MM') = to_char(NOW() AT TIME ZONE 'America/Lima', 'YYYY-MM')
                    THEN m.monto ELSE 0 END), 0) AS total_mes,
                
                -- Total Año Actual (Lima)
                COALESCE(SUM(CASE 
                    WHEN to_char(m.fecha_creacion, 'YYYY') = to_char(NOW() AT TIME ZONE 'America/Lima', 'YYYY')
                    THEN m.monto ELSE 0 END), 0) AS total_anio
            FROM movimientos_caja m
            JOIN facturas f ON m.gasto_id = f.id
            WHERE m.tipo_movimiento = 'EGRESO' AND m.gasto_id IS NOT NULL
            GROUP BY f.moneda
        `);

        // 2. CONSULTA DE DEUDA PENDIENTE Y VENCIDA (Dividido en PEN y USD)
        const deudaQuery = await client.query(`
            SELECT 
                f.moneda,
                -- Deuda Total Global (Pendiente)
                COALESCE(SUM(f.monto_total - COALESCE(pagado.monto, 0)), 0) as total_pendiente,
                
                -- 🚀 DEUDA VENCIDA ACTUALIZADA: 
                -- Compara f.fecha_vencimiento con el día actual en Lima a las 00:00:00
                COALESCE(SUM(CASE 
                    WHEN f.fecha_vencimiento < (CURRENT_DATE AT TIME ZONE 'America/Lima')::date 
                    THEN (f.monto_total - COALESCE(pagado.monto, 0)) 
                    ELSE 0 END), 0) as total_vencido
            FROM facturas f
            LEFT JOIN (
                SELECT gasto_id, SUM(monto) as monto 
                FROM movimientos_caja 
                WHERE tipo_movimiento = 'EGRESO' 
                GROUP BY gasto_id
            ) pagado ON f.id = pagado.gasto_id
            WHERE f.estado_pago != 'pagado'
            GROUP BY f.moneda
        `);

        // 3. PROCESAR RESULTADOS PARA EL FRONTEND
        // Inicializamos todo en 0
        const kpis = {
            total_hoy_pen: 0, total_hoy_usd: 0,
            total_mes_pen: 0, total_mes_usd: 0,
            total_anio_pen: 0, total_anio_usd: 0,
            total_pendiente_pen: 0, total_pendiente_usd: 0,
            total_vencido_pen: 0, total_vencido_usd: 0
        };

        // Asignar Pagos a la moneda correspondiente
        pagosQuery.rows.forEach(row => {
            const mod = row.moneda === 'USD' ? 'usd' : 'pen';
            kpis[`total_hoy_${mod}`] = row.total_hoy;
            kpis[`total_mes_${mod}`] = row.total_mes;
            kpis[`total_anio_${mod}`] = row.total_anio;
        });

        // Asignar Deudas a la moneda correspondiente
        deudaQuery.rows.forEach(row => {
            const mod = row.moneda === 'USD' ? 'usd' : 'pen';
            kpis[`total_pendiente_${mod}`] = row.total_pendiente;
            kpis[`total_vencido_${mod}`] = row.total_vencido;
        });

        res.json(kpis);

    } catch (err) {
        console.error("Error KPIs:", err);
        // Devolvemos estructura en 0 por defecto
        res.json({ 
            total_hoy_pen: 0, total_hoy_usd: 0,
            total_mes_pen: 0, total_mes_usd: 0,
            total_anio_pen: 0, total_anio_usd: 0,
            total_pendiente_pen: 0, total_pendiente_usd: 0,
            total_vencido_pen: 0, total_vencido_usd: 0
        });
    } finally {
        client.release();
    }
};

// =======================================================
// 8. NUEVAS FUNCIONES: FLUJO DE APROBACIÓN Y MODAL "VER" (FASE 2)
// =======================================================
const fs = require('fs');
const path = require('path');

// 8.1 Cambiar el Estado de Aprobación (Para el botón de Flujo)
exports.cambiarEstadoAprobacion = async (req, res) => {
    const { id } = req.params;
    const { nuevoEstado } = req.body; // Ej: 'Programado', 'Pendiente'

    try {
        const result = await pool.query(
            'UPDATE facturas SET estado_aprobacion = $1 WHERE id = $2 RETURNING *',
            [nuevoEstado, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Factura no encontrada' });
        }

        res.json({ msg: `Estado cambiado a ${nuevoEstado}`, factura: result.rows[0] });
    } catch (err) {
        console.error("Error al cambiar estado:", err);
        res.status(500).json({ msg: 'Error al cambiar el estado de aprobación' });
    }
};

// 8.2 Obtener Historial de Pagos (Para la lista de pagos parciales)
exports.obtenerHistorialPagos = async (req, res) => {
    const { id } = req.params; // ID de la factura

    try {
        const result = await pool.query(`
            SELECT 
                id, 
                fecha_creacion, 
                monto, 
                metodo_pago, 
                descripcion 
            FROM movimientos_caja 
            WHERE gasto_id = $1 AND tipo_movimiento = 'EGRESO'
            ORDER BY fecha_creacion DESC
        `, [id]);

        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener historial de pagos:", err);
        res.status(500).json({ msg: 'Error al obtener el historial' });
    }
};

// 8.3 Obtener todos los Documentos de una Factura
exports.obtenerDocumentos = async (req, res) => {
    const { id } = req.params; // ID de la factura

    try {
        const result = await pool.query(
            'SELECT * FROM facturas_documentos WHERE factura_id = $1 ORDER BY fecha_subida DESC',
            [id]
        );
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener documentos:", err);
        res.status(500).json({ msg: 'Error al obtener documentos' });
    }
};

// 8.4 Subir un Documento Extra a una Factura
exports.subirDocumentoExtra = async (req, res) => {
    const { id } = req.params; // ID de la factura
    const tipo_documento = req.body.tipo_documento || 'Documento Adjunto';

    if (!req.file) {
        return res.status(400).json({ msg: 'No se subió ningún archivo' });
    }

    try {
        const ruta_archivo = `/uploads/${req.file.filename}`;
        const nombre_archivo = req.file.originalname;

        const result = await pool.query(
            `INSERT INTO facturas_documentos (factura_id, nombre_archivo, ruta_archivo, tipo_documento) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [id, nombre_archivo, ruta_archivo, tipo_documento]
        );

        res.json({ msg: 'Documento subido con éxito', documento: result.rows[0] });
    } catch (err) {
        console.error("Error al subir documento extra:", err);
        res.status(500).json({ msg: 'Error al guardar el documento' });
    }
};

// 8.5 Eliminar un Documento Extra
exports.eliminarDocumento = async (req, res) => {
    const { docId } = req.params; // ID del documento (de la tabla facturas_documentos)

    try {
        // Primero buscamos la ruta del archivo para borrarlo del servidor
        const docRes = await pool.query('SELECT ruta_archivo FROM facturas_documentos WHERE id = $1', [docId]);
        
        if (docRes.rows.length > 0) {
            const rutaRelativa = docRes.rows[0].ruta_archivo;
            // Construimos la ruta absoluta (Ajusta '__dirname' según la estructura de tus carpetas)
            const rutaAbsoluta = path.join(__dirname, '../..', rutaRelativa); 

            // Borramos el archivo físico si existe
            if (fs.existsSync(rutaAbsoluta)) {
                fs.unlinkSync(rutaAbsoluta);
            }

            // Borramos el registro de la base de datos
            await pool.query('DELETE FROM facturas_documentos WHERE id = $1', [docId]);
            res.json({ msg: 'Documento eliminado correctamente' });
        } else {
            res.status(404).json({ msg: 'Documento no encontrado' });
        }
    } catch (err) {
        console.error("Error al eliminar documento:", err);
        res.status(500).json({ msg: 'Error al eliminar el documento' });
    }
};