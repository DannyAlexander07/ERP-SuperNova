// Ubicacion: SuperNova/backend/controllers/facturasController.js
const pool = require('../db');

// 1.1 OBTENER TODAS LAS FACTURAS (ACTUALIZADO: Soporte para JSONB, Impuestos, Registro de Compras y OC)
exports.obtenerFacturas = async (req, res) => {
    try {
        // 🚀 SE INCLUYEN TODOS los campos necesarios para la reconstrucción en el Front-end
        const result = await pool.query(`
            SELECT 
                f.id,
                f.fecha_emision,
                f.fecha_programacion,
                f.numero_documento,
                f.tipo_documento,     
                f.descripcion,
                f.monto_total,
                f.base_imponible,
                f.monto_igv,
                f.tasa_impuesto,   
                f.monto_neto_pagar,   
                f.estado_pago,
                f.estado_aprobacion,  
                f.evidencia_url,
                f.fecha_vencimiento,
                f.moneda,
                f.sede_id,     
                f.categoria_gasto,  
                f.proveedor_id,    
                f.porcentaje_detraccion, 
                f.banco,               
                f.numero_cuenta,      
                f.cci,                
                f.clasificacion,      
                f.programado_hoy,
                f.forma_pago,
                -- 🚀 CAMPOS CRÍTICOS PARA EL MODAL DE EDICIÓN
                f.monto_adicional,
                f.glosa_adicional,
                f.adicionales,        -- El JSONB con todos los conceptos
                f.operacion_impuesto, -- 'suma' o 'resta'
                f.orden_compra_id,    -- ID Relacional de la OC
                f.numero_oc,          -- 🚀 NUEVO: Número de la Orden de Compra en texto
                
                p.razon_social AS proveedor,
                s.nombre AS sede,
                
                -- Cálculo de mora dinámico
                CASE 
                    WHEN f.fecha_vencimiento < (CURRENT_DATE AT TIME ZONE 'America/Lima')::date 
                    THEN (CURRENT_DATE AT TIME ZONE 'America/Lima')::date - f.fecha_vencimiento
                    ELSE 0 
                END as dias_mora,

                -- Cálculo de abonos realizados
                COALESCE((SELECT SUM(monto) FROM pagos_facturas WHERE factura_id = f.id), 0) as monto_pagado
            FROM facturas f
            LEFT JOIN proveedores p ON f.proveedor_id = p.id
            LEFT JOIN sedes s ON f.sede_id = s.id
            ORDER BY f.fecha_emision DESC
            LIMIT 700
        `);
        
        const facturasConSaldo = result.rows.map(f => ({
            ...f,
            // Aseguramos que los cálculos usen los valores numéricos correctos
            saldo_pendiente: Number(f.monto_total) - Number(f.monto_pagado),
            dias_vencidos_count: parseInt(f.dias_mora),
            
            // Parseamos montos para evitar problemas de strings en el front
            monto_adicional: Number(f.monto_adicional || 0),
            monto_total: Number(f.monto_total || 0),
            base_imponible: Number(f.base_imponible || 0),
            porcentaje_detraccion: Number(f.porcentaje_detraccion || 0),

            // 🚀 IMPORTANTE: Si 'adicionales' viene como string (depende de la config del driver), 
            // lo parseamos a objeto real para que el JS lo recorra fácilmente.
            adicionales: typeof f.adicionales === 'string' ? JSON.parse(f.adicionales) : (f.adicionales || []),

            // 🔥 NUEVO: Homologamos la variable para el Frontend
            // Tu Frontend espera 'orden_compra', así que mapeamos 'numero_oc' hacia 'orden_compra'
            orden_compra: f.numero_oc || ''
        }));

        res.json(facturasConSaldo);

    } catch (err) {
        console.error("❌ Error crítico al obtener historial de facturas:", err.message);
        res.status(500).json({ msg: 'Error de servidor al cargar el registro de compras.' });
    }
};

// 1.2 CREAR NUEVA FACTURA (ACTUALIZADO: Validación y Bloqueo de OC Interna)
exports.crearFactura = async (req, res) => {
    let {
        proveedorId, glosa, sede, tipo, serie, emision, vencimiento,
        moneda, total, formaPago, categoria,
        monto_base, impuesto_porcentaje, banco, cuenta, cci, programacion,
        clasificacion,
        // 🚀 RECIBIMOS LOS NUEVOS CAMPOS
        adicionales, 
        operacion_impuesto,
        orden_compra // 🔥 NUEVO: Capturamos la OC enviada desde el ERP
    } = req.body;

    const usuarioId = req.usuario ? req.usuario.id : null; 
    const evidenciaUrl = req.file ? req.file.path : null;

    // --- 🛡️ PROCESAMIENTO DE ADICIONALES DINÁMICOS (JSONB) ---
    let montoAdicionalTotal = 0;
    let glosaAdicionalConcatenada = "";
    let adicionalesJson = '[]'; // Valor por defecto para JSONB

    if (adicionales) {
        try {
            // Parseamos el JSON que viene del frontend
            const listaAdicionales = JSON.parse(adicionales);
            if (Array.isArray(listaAdicionales)) {
                adicionalesJson = adicionales; // Guardamos el string original para la columna JSONB
                
                // Sumamos montos para la columna numérica
                montoAdicionalTotal = listaAdicionales.reduce((acc, curr) => acc + parseFloat(curr.monto || 0), 0);
                
                // Concatenamos para la glosa de texto (fallback)
                glosaAdicionalConcatenada = listaAdicionales
                    .map(item => `${item.glosa || 'Adicional'}: ${item.monto}`)
                    .join(" | ");
            }
        } catch (e) {
            console.error("Error al parsear adicionales:", e);
            montoAdicionalTotal = parseFloat(req.body.monto_adicional) || 0;
        }
    }

    // --- 🛡️ PROCESAMIENTO DE IMPUESTO ---
    let impuestoNumerico = parseFloat(impuesto_porcentaje);
    if (isNaN(impuestoNumerico)) impuestoNumerico = 0;

    // --- 🛡️ NORMALIZACIÓN DE CLASIFICACIÓN ---
    if (clasificacion === 'Implementacion') clasificacion = 'Implementación';
    const clasificacionFinal = clasificacion || 'Operativo';

    // Validaciones básicas
    if (!proveedorId || !emision || !total || !categoria) {
        return res.status(400).json({ msg: 'Faltan campos obligatorios.' });
    }
    if (parseFloat(total) <= 0) {
        return res.status(400).json({ msg: 'El Monto Total debe ser mayor a cero.' });
    }

    // 🔥 NUEVO: VALIDACIÓN ESTRICTA DE LA ORDEN DE COMPRA
    let ordenCompraId = null;
    let ocLimpia = orden_compra && orden_compra.trim() !== '' && orden_compra !== 'undefined' ? orden_compra.trim() : null;

    if (ocLimpia) {
        const ocRes = await pool.query("SELECT id, estado, proveedor_id FROM ordenes_compra WHERE UPPER(codigo_oc) = UPPER($1)", [ocLimpia]);
        
        if (ocRes.rows.length === 0) {
            return res.status(400).json({ msg: '❌ La Orden de Compra ingresada no existe en el sistema.' });
        }
        
        const ocObj = ocRes.rows[0];
        if (ocObj.estado === 'FACTURADA' || ocObj.estado === 'USADA') {
            return res.status(400).json({ msg: '❌ Esta Orden de Compra ya fue utilizada y no puede volver a usarse.' });
        }
        if (ocObj.proveedor_id != proveedorId) {
            return res.status(400).json({ msg: '❌ Esta Orden de Compra pertenece a otro proveedor.' });
        }
        
        ordenCompraId = ocObj.id;
    }

    const estadoPago = 'pendiente';
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // A. Insertar en la tabla facturas (Incluyendo OC y su ID)
        const result = await client.query(
            `INSERT INTO facturas (
                proveedor_id, usuario_id, sede_id, descripcion, tipo_documento, 
                numero_documento, fecha_emision, fecha_vencimiento, moneda, 
                monto_total, categoria_gasto, evidencia_url, estado_pago, 
                base_imponible, porcentaje_detraccion, banco, numero_cuenta, 
                cci, fecha_programacion, clasificacion, programado_hoy,
                monto_adicional, glosa_adicional, forma_pago,
                adicionales, operacion_impuesto, numero_oc, orden_compra_id
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 
                $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, FALSE,
                $21, $22, $23, $24, $25, $26, $27
            )
            RETURNING id, numero_documento`,
            [
                proveedorId,             // $1
                usuarioId,               // $2
                sede,                    // $3
                glosa,                   // $4
                tipo,                    // $5
                serie,                   // $6
                emision,                 // $7
                vencimiento,             // $8
                moneda,                  // $9
                total,                   // $10
                categoria,               // $11
                evidenciaUrl,            // $12
                estadoPago,              // $13
                monto_base || 0,         // $14
                impuestoNumerico,        // $15
                banco,                   // $16
                cuenta,                  // $17
                cci,                     // $18
                programacion || null,    // $19
                clasificacionFinal,      // $20
                montoAdicionalTotal,     // $21
                glosaAdicionalConcatenada, // $22
                formaPago,               // $23
                adicionalesJson,         // $24 (JSONB)
                operacion_impuesto || 'suma', // $25
                ocLimpia,                // 🔥 $26 (numero_oc)
                ordenCompraId            // 🔥 $27 (orden_compra_id)
            ]
        );

        const facturaId = result.rows[0].id;

        // 🔥 NUEVO: BLOQUEAR LA ORDEN DE COMPRA (Cambiar a FACTURADA)
        if (ordenCompraId) {
            await client.query("UPDATE ordenes_compra SET estado = 'FACTURADA' WHERE id = $1", [ordenCompraId]);
        }

        // B. Registro de Auditoría
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'CREAR', 'FACTURAS', $2, $3)`,
            [usuarioId, facturaId, `Creó registro de gasto N° ${result.rows[0].numero_documento}`]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Gasto registrado correctamente', factura: result.rows[0] });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error al crear factura:", err.message);
        res.status(500).json({ msg: 'Error al crear factura: ' + err.message });
    } finally {
        client.release();
    }
};

// 1.3 ELIMINAR FACTURA (ACTUALIZADO: Liberar Orden de Compra al eliminar)
exports.eliminarFactura = async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuario ? req.usuario.id : null;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');
        
        // 1. Verificar si tiene pagos asociados en la tabla correcta
        const pagosRes = await client.query('SELECT COUNT(*) FROM pagos_facturas WHERE factura_id = $1', [id]);
        if (parseInt(pagosRes.rows[0].count) > 0) {
            throw new Error('No se puede eliminar: La factura ya tiene pagos registrados en caja.');
        }

        // 2. Eliminar la factura y capturar sus datos eliminados (RETURNING *)
        const result = await client.query('DELETE FROM facturas WHERE id = $1 RETURNING *', [id]);
        
        if (result.rows.length === 0) throw new Error('Factura no encontrada.');
        
        const facturaEliminada = result.rows[0];

        // 🔥 NUEVO: 3. LIBERAR LA ORDEN DE COMPRA (Si tenía una asociada)
        if (facturaEliminada.orden_compra_id) {
            await client.query(
                "UPDATE ordenes_compra SET estado = 'EMITIDA' WHERE id = $1", 
                [facturaEliminada.orden_compra_id]
            );
        }
        
        // 4. Auditoría
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'ELIMINAR', 'FACTURAS', $2, $3)`,
            [usuarioId, id, `Eliminó factura N° ${facturaEliminada.numero_documento}`]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Factura eliminada y Orden de Compra liberada (si aplicaba)' });

    } catch (err) {
        await client.query('ROLLBACK');
        const msg = err.message.includes('pagos registrados') ? err.message : 'Error al eliminar factura';
        console.error("❌ Error en eliminarFactura:", err.message);
        res.status(400).json({ msg });

    } finally {
        client.release();
    }
};

// 1.4 ACTUALIZAR FACTURA (ACTUALIZADO: Soporte para OC, JSONB, Operación y Clasificación)
exports.actualizarFactura = async (req, res) => {
    const { id } = req.params;
    
    // ⚠️ Usamos 'let' para procesar y corregir valores antes de la persistencia
    let { 
        proveedorId, glosa, sede, tipo, serie, emision, formaPago, vencimiento, 
        moneda, total, categoria,
        monto_base, impuesto_porcentaje, banco, cuenta, cci, programacion,
        clasificacion, adicionales, operacion_impuesto, tasa_impuesto,
        orden_compra // 🔥 NUEVO: Capturamos el campo de Orden de Compra
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 

    // --- 🛡️ PROCESAMIENTO DE ADICIONALES DINÁMICOS (JSONB) ---
    let montoAdicionalTotal = 0;
    let glosaAdicionalConcatenada = "";
    let adicionalesJson = '[]'; 

    if (adicionales) {
        try {
            const listaAdicionales = JSON.parse(adicionales);
            if (Array.isArray(listaAdicionales)) {
                adicionalesJson = adicionales; 
                montoAdicionalTotal = listaAdicionales.reduce((acc, curr) => acc + parseFloat(curr.monto || 0), 0);
                glosaAdicionalConcatenada = listaAdicionales
                    .map(item => `${item.glosa || 'Adicional'}: ${item.monto}`)
                    .join(" | ");
            }
        } catch (e) {
            console.error("Error al parsear adicionales:", e);
            montoAdicionalTotal = parseFloat(req.body.monto_adicional) || 0;
        }
    }

    // --- 🛡️ SANITIZACIÓN DE DATOS ---
    monto_base = (monto_base === "" || monto_base === null) ? 0 : monto_base;
    let impuestoNumerico = parseFloat(impuesto_porcentaje) || 0;
    let tasaFinal = tasa_impuesto !== undefined && tasa_impuesto !== null ? parseFloat(tasa_impuesto) : (impuestoNumerico / 100);

    banco = banco ? banco.trim() : null;
    cuenta = cuenta ? cuenta.trim() : null;
    cci = cci ? cci.trim() : null;
    programacion = (programacion === "" || programacion === null) ? null : programacion;
    
    if (clasificacion === 'Implementacion') clasificacion = 'Implementación';
    const clasificacionFinal = clasificacion || 'Operativo';

    if (!proveedorId || !emision || !total || !categoria) {
        return res.status(400).json({ msg: 'Faltan campos obligatorios.' });
    }

    // 🔥 NUEVO: VALIDACIÓN ESTRICTA AL EDITAR LA ORDEN DE COMPRA
    let ordenCompraId = null;
    let ocLimpia = orden_compra && orden_compra.trim() !== '' && orden_compra !== 'undefined' ? orden_compra.trim() : null;

    if (ocLimpia) {
        // Buscamos a quién le pertenece la OC actualmente
        const ocRes = await pool.query(`
            SELECT o.id, o.estado, o.proveedor_id, f.id as id_factura_duena 
            FROM ordenes_compra o 
            LEFT JOIN facturas f ON f.orden_compra_id = o.id 
            WHERE UPPER(o.codigo_oc) = UPPER($1)
        `, [ocLimpia]);

        if (ocRes.rows.length === 0) {
            return res.status(400).json({ msg: '❌ La Orden de Compra ingresada no existe en el sistema.' });
        }
        
        const ocData = ocRes.rows[0];

        // Validar Proveedor
        if (ocData.proveedor_id != proveedorId) {
            return res.status(400).json({ msg: '❌ Esta Orden de Compra pertenece a otro proveedor.' });
        }

        // Validar Estado y Duplicidad
        // Si está FACTURADA o USADA, pero el dueño NO es la factura que estamos editando ahorita mismo...
        if ((ocData.estado === 'FACTURADA' || ocData.estado === 'USADA') && ocData.id_factura_duena != id) {
             return res.status(400).json({ msg: '❌ Esta Orden de Compra ya fue utilizada en otra factura.' });
        }
        
        ordenCompraId = ocData.id;
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (req.file) {
            const nuevaEvidenciaUrl = req.file.path;
            await client.query(
                'UPDATE facturas SET evidencia_url = $1 WHERE id = $2',
                [nuevaEvidenciaUrl, id]
            );
        }

        // 🚀 NUEVO: Añadimos 'numero_oc' y 'orden_compra_id' al UPDATE
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
                fecha_programacion = $17,
                clasificacion = $18,
                monto_adicional = $19,
                glosa_adicional = $20,
                adicionales = $21,
                operacion_impuesto = $22,
                tasa_impuesto = $23,
                numero_oc = $24,
                orden_compra_id = $25
            WHERE id = $26 RETURNING *`,
            [
                proveedorId, sede, glosa, tipo, serie, emision, vencimiento,
                formaPago, moneda, total, categoria, monto_base, impuestoNumerico,
                banco, cuenta, cci, programacion, clasificacionFinal,
                montoAdicionalTotal, glosaAdicionalConcatenada, adicionalesJson,
                operacion_impuesto || 'suma', tasaFinal, 
                ocLimpia, ordenCompraId, // 🔥 Campos de la OC ($24 y $25)
                id // $26
            ]
        );

        // 🔥 NUEVO: BLOQUEAR LA ORDEN DE COMPRA (Si se asignó una válida)
        if (ordenCompraId) {
            await client.query("UPDATE ordenes_compra SET estado = 'FACTURADA' WHERE id = $1", [ordenCompraId]);
        }

        // Auditoría
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'ACTUALIZAR', 'FACTURAS', $2, $3)`,
            [usuarioId, id, `Actualizó factura N° ${serie}. Se actualizaron datos, montos y/o OC.`]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Factura actualizada correctamente', factura: result.rows[0] });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error updating factura:", err);
        res.status(500).json({ msg: err.message || 'Error al actualizar factura' });
    } finally {
        client.release();
    }
};

exports.subirArchivo = async (req, res) => {
    const { id } = req.params;
    const archivo = req.file;

    console.log("\n📥 [DEBUG CONTROLADOR] Archivo procesado por Multer:", archivo);

    if (!archivo) return res.status(400).json({ msg: 'No se envió archivo al controlador.' });

    try {
        const filePath = archivo.path; 
        console.log("🔗 [DEBUG CONTROLADOR] URL a guardar en BD:", filePath);
        
        await pool.query('UPDATE facturas SET evidencia_url = $1 WHERE id = $2', [filePath, id]);
        
        res.json({ msg: 'Archivo subido a la nube correctamente', path: filePath });
    } catch (err) {
        console.error("\n🚨 [DEBUG BASE DE DATOS] Falló el UPDATE:", err);
        res.status(500).json({ msg: 'Error al guardar en base de datos', error: err.message });
    }
};

// =======================================================
// 2. GESTIÓN DE PAGOS (AMORTIZACIONES Y PARCIALES)
// =======================================================

// 2.1 REGISTRAR PAGO A FACTURA (ACTUALIZADO: Integración Tesorería, Reset y Notificación B2B)
exports.pagarFactura = async (req, res) => {
    const { id } = req.params;
    // Recibimos los datos del formulario de pago
    const { fechaPago, monto, metodo, operacion } = req.body; 
    const usuarioId = req.usuario ? req.usuario.id : null; 

    if (!fechaPago || !monto) return res.status(400).json({ msg: 'Faltan datos de pago.' });

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // A. Validar Factura y Saldo actual (Consultando la tabla de pagos_facturas)
        const facRes = await client.query(`
            SELECT f.*, 
            COALESCE((SELECT SUM(monto) FROM pagos_facturas WHERE factura_id = f.id), 0) as pagado 
            FROM facturas f WHERE id = $1 FOR UPDATE`, [id]);
            
        if (facRes.rows.length === 0) throw new Error('Factura no encontrada');
        const fac = facRes.rows[0];
        
        const saldo = parseFloat(fac.monto_total) - parseFloat(fac.pagado);
        
        // Tolerancia de 0.1 para evitar problemas de redondeo
        if (parseFloat(monto) > saldo + 0.1) {
            throw new Error(`El monto excede el saldo pendiente (${fac.moneda === 'USD' ? '$' : 'S/'} ${saldo.toFixed(2)})`);
        }

        // B. Registrar el pago en la tabla independiente 'pagos_facturas'
        await client.query(
            `INSERT INTO pagos_facturas (
                factura_id, usuario_id, sede_id, monto, moneda, 
                fecha_pago, metodo_pago, numero_operacion, descripcion
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
                id, usuarioId, fac.sede_id, monto, fac.moneda, fechaPago,
                metodo || 'TRANSFERENCIA', operacion || '', `Amortización Fac. ${fac.numero_documento}`
            ]
        );

        // C. Actualizar estado y RESET de programación
        const nuevoPagadoTotal = parseFloat(fac.pagado) + parseFloat(monto);
        let nuevoEstado = 'parcial';
        
        if (nuevoPagadoTotal >= parseFloat(fac.monto_total) - 0.1) {
            nuevoEstado = 'pagado';
        }

        // 🚀 CAMBIO CLAVE: Al pagar, quitamos la marca de 'programado_hoy' 
        // para que salga de la ventana de Tesorería Diaria.
        await client.query(
            `UPDATE facturas 
             SET estado_pago = $1, fecha_pago = $2, programado_hoy = FALSE 
             WHERE id = $3`,
            [nuevoEstado, fechaPago, id]
        );
        
        // D. Auditoría del movimiento
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'PAGO', 'FACTURAS', $2, $3)`,
            [usuarioId, id, `Pagó ${fac.moneda === 'USD' ? '$' : 'S/'} ${monto} a Fac. ${fac.numero_documento}. Estado: ${nuevoEstado}`]
        );

        // 🔥 E. NUEVO: NOTIFICAR AL PROVEEDOR (Portal B2B)
        if (fac.proveedor_id) {
            const monedaSym = fac.moneda === 'USD' ? '$' : 'S/';
            const tituloNoti = nuevoEstado === 'pagado' ? '✅ Pago Completado' : '💰 Pago Parcial';
            const textoNoti = `Se ha registrado un abono de ${monedaSym} ${parseFloat(monto).toFixed(2)} para su documento ${fac.numero_documento || 'S/N'}.`;

            await client.query(
                `INSERT INTO notificaciones_b2b (proveedor_id, titulo, mensaje, tipo) 
                 VALUES ($1, $2, $3, 'pago')`,
                [fac.proveedor_id, tituloNoti, textoNoti]
            );
        }

        await client.query('COMMIT');
        res.json({ 
            msg: 'Pago registrado correctamente', 
            nuevoEstado,
            nuevoPagadoTotal 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error al registrar pago:", err.message);
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
        // 1. CONSULTA DE PAGOS REALIZADOS (Actualizado: Lee de pagos_facturas)
        const pagosQuery = await client.query(`
            SELECT 
                moneda,
                -- Total Hoy (Lima)
                COALESCE(SUM(CASE 
                    WHEN fecha_pago::date = (NOW() AT TIME ZONE 'America/Lima')::date 
                    THEN monto ELSE 0 END), 0) AS total_hoy,
                
                -- Total Mes Actual (Lima)
                COALESCE(SUM(CASE 
                    WHEN to_char(fecha_pago, 'YYYY-MM') = to_char(NOW() AT TIME ZONE 'America/Lima', 'YYYY-MM')
                    THEN monto ELSE 0 END), 0) AS total_mes,
                
                -- Total Año Actual (Lima)
                COALESCE(SUM(CASE 
                    WHEN to_char(fecha_pago, 'YYYY') = to_char(NOW() AT TIME ZONE 'America/Lima', 'YYYY')
                    THEN monto ELSE 0 END), 0) AS total_anio
            FROM pagos_facturas
            GROUP BY moneda
        `);

        // 2. CONSULTA DE DEUDA PENDIENTE Y VENCIDA (Actualizado: Descuenta abonos de pagos_facturas)
        const deudaQuery = await client.query(`
            SELECT 
                f.moneda,
                -- Deuda Total Global (Monto total factura - suma de abonos en pagos_facturas)
                COALESCE(SUM(f.monto_total - COALESCE(pagado.monto, 0)), 0) as total_pendiente,
                
                -- DEUDA VENCIDA: Compara fecha_vencimiento contra medianoche de hoy en Lima
                COALESCE(SUM(CASE 
                    WHEN f.fecha_vencimiento < (CURRENT_DATE AT TIME ZONE 'America/Lima')::date 
                    THEN (f.monto_total - COALESCE(pagado.monto, 0)) 
                    ELSE 0 END), 0) as total_vencido
            FROM facturas f
            LEFT JOIN (
                SELECT factura_id, SUM(monto) as monto 
                FROM pagos_facturas 
                GROUP BY factura_id
            ) pagado ON f.id = pagado.factura_id
            WHERE f.estado_pago != 'pagado'
            GROUP BY f.moneda
        `);

        // 3. PROCESAR RESULTADOS PARA EL FRONTEND
        // Inicializamos la estructura en 0 para evitar errores si no hay datos
        const kpis = {
            total_hoy_pen: 0, total_hoy_usd: 0,
            total_mes_pen: 0, total_mes_usd: 0,
            total_anio_pen: 0, total_anio_usd: 0,
            total_pendiente_pen: 0, total_pendiente_usd: 0,
            total_vencido_pen: 0, total_vencido_usd: 0
        };

        // Asignar Pagos Realizados (Verde / Azul / Amarillo)
        pagosQuery.rows.forEach(row => {
            const mod = row.moneda === 'USD' ? 'usd' : 'pen';
            kpis[`total_hoy_${mod}`] = parseFloat(row.total_hoy);
            kpis[`total_mes_${mod}`] = parseFloat(row.total_mes);
            kpis[`total_anio_${mod}`] = parseFloat(row.total_anio);
        });

        // Asignar Deudas (Morado / Rojo)
        deudaQuery.rows.forEach(row => {
            const mod = row.moneda === 'USD' ? 'usd' : 'pen';
            kpis[`total_pendiente_${mod}`] = parseFloat(row.total_pendiente);
            kpis[`total_vencido_${mod}`] = parseFloat(row.total_vencido);
        });

        res.json(kpis);

    } catch (err) {
        console.error("❌ Error al obtener KPIs de pagos independientes:", err.message);
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

// 8.1 Cambiar el Estado de Aprobación (ACTUALIZADO: Flujo de Rechazo, Liberación de OC y Notificaciones B2B)
exports.cambiarEstadoAprobacion = async (req, res) => {
    const { id } = req.params;
    const { nuevoEstado, motivo } = req.body; // Capturamos el motivo del rechazo
    const usuarioId = req.usuario ? req.usuario.id : null;

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // 🛡️ Iniciamos transacción segura

        // 1. Buscamos la factura original para saber si tiene una Orden de Compra asociada y el proveedor_id
        const facResult = await client.query('SELECT * FROM facturas WHERE id = $1', [id]);
        
        if (facResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ msg: 'Factura no encontrada' });
        }
        
        const factura = facResult.rows[0];
        let facturaActualizada;
        let detalleAuditoria = `Estado cambiado a ${nuevoEstado}`;

        // Variables para la notificación
        let tituloNoti = "";
        let mensajeNoti = "";
        let tipoNoti = "info";

        // 2. LÓGICA DE RECHAZO
        if (nuevoEstado === 'rechazado') {
            
            // A. Liberar la Orden de Compra (Si tiene una OC vinculada)
            if (factura.orden_compra_id) {
                await client.query(
                    "UPDATE ordenes_compra SET estado = 'EMITIDA' WHERE id = $1", 
                    [factura.orden_compra_id]
                );
            }

            // B. Actualizar la Factura a Rechazada y añadir el motivo a la descripción
            const updateRes = await client.query(
                `UPDATE facturas 
                 SET estado_aprobacion = 'rechazado', 
                     estado_pago = 'rechazado', 
                     descripcion = COALESCE(descripcion, '') || $1
                 WHERE id = $2 RETURNING *`,
                [` | ❌ RECHAZADO: ${motivo}`.substring(0, 250), id]
            );
            
            facturaActualizada = updateRes.rows[0];
            detalleAuditoria = `Factura Rechazada. Motivo: ${motivo}. Se liberó la OC asociada.`;

            // C. Preparar Notificación de Rechazo
            tituloNoti = "❌ Comprobante Rechazado";
            mensajeNoti = `Su documento ${factura.numero_documento} fue rechazado. Motivo: ${motivo}`;
            tipoNoti = "rechazo";

        } else {
            // 3. FLUJO NORMAL (Aprobar, Programar, etc.)
            const updateRes = await client.query(
                'UPDATE facturas SET estado_aprobacion = $1 WHERE id = $2 RETURNING *',
                [nuevoEstado, id]
            );
            facturaActualizada = updateRes.rows[0];

            // Preparar Notificación de Aprobación (Si pasa a pendiente/aprobado)
            if (nuevoEstado === 'pendiente') {
                tituloNoti = "✅ Factura Aprobada";
                mensajeNoti = `Su factura ${factura.numero_documento} ha sido aprobada y programada para pago.`;
                tipoNoti = "pago";
            }
        }

        // 4. INSERTAR NOTIFICACIÓN EN LA TABLA B2B (Si corresponde)
        if (tituloNoti !== "") {
            await client.query(
                `INSERT INTO notificaciones_b2b (proveedor_id, titulo, mensaje, tipo) 
                 VALUES ($1, $2, $3, $4)`,
                [factura.proveedor_id, tituloNoti, mensajeNoti, tipoNoti]
            );
        }

        // 5. Registrar movimiento en Auditoría (Interno)
        if (usuarioId) {
            await client.query(
                `INSERT INTO auditoria (usuario_id, modulo, accion, registro_id, detalle) 
                 VALUES ($1, 'FACTURAS', 'FLUJO_APROBACION', $2, $3)`,
                [usuarioId, id, detalleAuditoria]
            );
        }

        await client.query('COMMIT'); // 🛡️ Todo salió bien, guardamos cambios
        res.json({ msg: `Estado cambiado a ${nuevoEstado}`, factura: facturaActualizada });

    } catch (err) {
        await client.query('ROLLBACK'); // ⚠️ Algo falló, deshacemos todo
        console.error("Error al cambiar estado:", err);
        res.status(500).json({ msg: err.message || 'Error al cambiar el estado de aprobación' });
    } finally {
        client.release(); // Liberamos la conexión a la base de datos
    }
};

// 8.2 Obtener Historial de Pagos (Actualizado: Lee de la tabla pagos_facturas)
exports.obtenerHistorialPagos = async (req, res) => {
    const { id } = req.params; // ID de la factura

    try {
        // 🔄 CAMBIO CLAVE: Ahora consultamos la tabla independiente para no depender de Caja
        const result = await pool.query(`
            SELECT 
                id, 
                fecha_pago AS fecha_creacion, -- Alias para mantener compatibilidad con el frontend
                monto, 
                metodo_pago, 
                numero_operacion,            -- 🆕 Nuevo campo para mayor detalle
                descripcion 
            FROM pagos_facturas 
            WHERE factura_id = $1 
            ORDER BY fecha_registro DESC
        `, [id]);

        // Retornamos los registros encontrados en la nueva tabla
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error al obtener historial de pagos independiente:", err.message);
        res.status(500).json({ msg: 'Error al obtener el historial de pagos' });
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
    const { id } = req.params; 
    const tipo_documento = req.body.tipo_documento || 'Documento Adjunto';

    if (!req.file) {
        return res.status(400).json({ msg: 'No se subió ningún archivo' });
    }

    try {
        // 🔥 NUEVO: Capturamos la URL de Cloudinary
        const ruta_archivo = req.file.path;
        const nombre_archivo = req.file.originalname;

        const result = await pool.query(
            `INSERT INTO facturas_documentos (factura_id, nombre_archivo, ruta_archivo, tipo_documento) 
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [id, nombre_archivo, ruta_archivo, tipo_documento]
        );

        res.json({ msg: 'Documento subido con éxito a la nube', documento: result.rows[0] });
    } catch (err) {
        console.error("Error al subir documento extra:", err);
        res.status(500).json({ msg: 'Error al guardar el documento' });
    }
};


// 8.5 Eliminar un Documento Extra
exports.eliminarDocumento = async (req, res) => {
    const { docId } = req.params; 

    try {
        
        const result = await pool.query('DELETE FROM facturas_documentos WHERE id = $1 RETURNING *', [docId]);
        
        if (result.rows.length > 0) {
            res.json({ msg: 'Documento eliminado correctamente' });
        } else {
            res.status(404).json({ msg: 'Documento no encontrado' });
        }
    } catch (err) {
        console.error("Error al eliminar documento:", err);
        res.status(500).json({ msg: 'Error al eliminar el documento' });
    }
};

// =======================================================
// 3. NUEVAS FUNCIONES PARA EL PLANIFICADOR DE TESORERÍA
// =======================================================

// 3.1 ALTERNAR PROGRAMACIÓN (Motor para mover facturas entre ventanas)
exports.alternarProgramacion = async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body; // true = Mueve a Tesorería, false = Regresa a Cuentas por Pagar

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 🛡️ Actualizamos el estado de programación
        const result = await client.query(
            `UPDATE facturas 
             SET programado_hoy = $1 
             WHERE id = $2 
             RETURNING id, numero_documento, programado_hoy`,
            [estado, id]
        );

        if (result.rows.length === 0) {
            throw new Error('Factura no encontrada');
        }

        const fac = result.rows[0];
        const detalleAccion = estado ? 'PROGRAMADO PARA HOY' : 'QUITADO DE PROGRAMACIÓN';

        // 📝 Auditoría para dejar rastro del movimiento
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'PROGRAMACION', 'FACTURAS', $2, $3)`,
            [req.usuario.id, id, `${detalleAccion} - Fac. N° ${fac.numero_documento}`]
        );

        await client.query('COMMIT');

        res.json({ 
            msg: estado ? 'Factura enviada a Tesorería Diaria' : 'Factura regresada a Cuentas por Pagar',
            programado: fac.programado_hoy
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error en alternarProgramacion:", err.message);
        res.status(500).json({ msg: err.message });
    } finally {
        client.release();
    }
};

// 3.2 OBTENER FACTURAS PROGRAMADAS (Actualizado: Campos de Aprobación y Saldo)
exports.obtenerFacturasProgramadas = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                f.id, 
                f.fecha_emision, 
                f.numero_documento, 
                f.tipo_documento,
                f.descripcion, 
                f.monto_total, 
                f.moneda, 
                f.fecha_vencimiento,
                f.clasificacion, 
                f.banco, 
                f.numero_cuenta, 
                f.cci,
                f.aprobado_tesoreria, -- 🆕 Nuevo campo
                f.monto_aprobado,     -- 🆕 Nuevo campo
                p.razon_social AS proveedor,
                COALESCE((SELECT SUM(monto) FROM pagos_facturas WHERE factura_id = f.id), 0) as monto_pagado
            FROM facturas f
            LEFT JOIN proveedores p ON f.proveedor_id = p.id
            WHERE f.programado_hoy = TRUE 
              AND f.estado_pago != 'pagado'
              AND f.estado_pago != 'anulado'
            ORDER BY f.clasificacion ASC, f.fecha_vencimiento ASC
        `);

        const facturasProcesadas = result.rows.map(f => {
            const total = Number(f.monto_total);
            const pagado = Number(f.monto_pagado);
            const saldo = total - pagado;
            
            return {
                ...f,
                saldo_pendiente: saldo,
                // 💡 Si no está aprobado aún, el monto_aprobado sugerido es el saldo pendiente
                // Si ya fue aprobado, respetamos el valor que guardó Gerencia
                monto_aprobado: f.aprobado_tesoreria ? Number(f.monto_aprobado) : saldo
            };
        });

        res.json(facturasProcesadas);
    } catch (err) {
        console.error("❌ Error al obtener programados:", err.message);
        res.status(500).json({ msg: 'Error al obtener lista de tesorería' });
    }
};

// 3.3 OBTENER RESUMEN DE TESORERÍA (Los 3 Bloques en Soles y Dólares)
exports.obtenerResumenTesoria = async (req, res) => {
    try {
        const query = `
            WITH SaldosProgramados AS (
                SELECT 
                    f.moneda,
                    f.clasificacion,
                    (f.monto_total - COALESCE((SELECT SUM(monto) FROM pagos_facturas WHERE factura_id = f.id), 0)) as saldo
                FROM facturas f
                WHERE f.programado_hoy = TRUE AND f.estado_pago != 'pagado'
            )
            SELECT 
                clasificacion,
                moneda,
                SUM(saldo) as total_clasificacion
            FROM SaldosProgramados
            GROUP BY clasificacion, moneda
        `;

        const result = await pool.query(query);

        // Estructura inicial para asegurar que el frontend reciba algo aunque esté vacío
        const resumen = {
            Operativo: { pen: 0, usd: 0 },
            Implementacion: { pen: 0, usd: 0 },
            Financiero: { pen: 0, usd: 0 }
        };

        result.rows.forEach(row => {
            const clasif = row.clasificacion === 'Implementación' ? 'Implementacion' : row.clasificacion;
            const mon = row.moneda === 'USD' ? 'usd' : 'pen';
            if (resumen[clasif]) {
                resumen[clasif][mon] = parseFloat(row.total_clasificacion);
            }
        });

        res.json(resumen);
    } catch (err) {
        console.error("❌ Error al calcular resumen de tesorería:", err.message);
        res.status(500).json({ msg: 'Error al calcular bloques de resumen' });
    }
};

const { enviarPlanPagosAprobado } = require('../utils/emailService');

// APROBAR UNA SOLA FACTURA (Actualizado: Validación de Monto y Seguridad)
exports.aprobarFacturaIndividual = async (req, res) => {
    // Recibimos el ID, el booleano de estado y el monto específico enviado desde el input
    const { id, aprobado, monto_aprobado } = req.body;

    try {
        // 🛡️ Validación de seguridad: Si se aprueba, el monto debe ser un número válido mayor a 0
        if (aprobado && (monto_aprobado === undefined || monto_aprobado === null || parseFloat(monto_aprobado) <= 0)) {
            return res.status(400).json({ msg: 'El monto aprobado debe ser mayor a cero para autorizar el pago.' });
        }

        // Actualizamos la base de datos con los valores exactos definidos por Gerencia
        const result = await pool.query(
            `UPDATE facturas 
             SET aprobado_tesoreria = $1, 
                 monto_aprobado = $2 
             WHERE id = $3
             RETURNING id`,
            [aprobado, monto_aprobado, id]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ msg: 'No se encontró la factura especificada.' });
        }

        res.json({ 
            msg: aprobado ? 'Pago autorizado correctamente' : 'Aprobación removida con éxito',
            id: id,
            aprobado: aprobado,
            monto_final: monto_aprobado
        });

    } catch (err) {
        console.error("❌ Error en aprobarFacturaIndividual:", err.message);
        res.status(500).json({ msg: 'Error interno al procesar la aprobación del pago.' });
    }
};

// APROBAR O DESAPROBAR TODO EL LISTADO (Respetando montos manuales del frontend)
exports.aprobarFacturasMasiva = async (req, res) => {
    // 🆕 'facturas' es el array de {id, monto_aprobado} capturado en el frontend
    const { aprobado, facturas } = req.body; 
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        if (aprobado) {
            if (facturas && facturas.length > 0) {
                // 🚀 Iteramos sobre los montos manuales enviados desde la tabla
                for (const f of facturas) {
                    await client.query(
                        `UPDATE facturas 
                         SET aprobado_tesoreria = TRUE, 
                             monto_aprobado = $1 
                         WHERE id = $2`,
                        [f.monto_aprobado, f.id]
                    );
                }
            } else {
                // Caso de respaldo: Si no hay array, aprueba todo con el saldo total pendiente
                await client.query(`
                    UPDATE facturas 
                    SET aprobado_tesoreria = TRUE, 
                        monto_aprobado = (monto_total - COALESCE((SELECT SUM(monto) FROM pagos_facturas WHERE factura_id = facturas.id), 0))
                    WHERE programado_hoy = TRUE AND estado_pago != 'pagado'
                `);
            }
        } else {
            // DESAPROBACIÓN MASIVA: Solo reseteamos el flag de aprobación
            await client.query(`
                UPDATE facturas 
                SET aprobado_tesoreria = FALSE 
                WHERE programado_hoy = TRUE
            `);
        }

        await client.query('COMMIT');
        res.json({ msg: aprobado ? 'Todo aprobado con los montos indicados' : 'Aprobaciones removidas' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error en proceso masivo:", err.message);
        res.status(500).json({ msg: 'Error al procesar la aprobación masiva' });
    } finally {
        client.release();
    }
};

// ENVIAR CORREO CON LA TABLA DE APROBADOS
exports.notificarPlanPagos = async (req, res) => {
    const { facturas } = req.body; // Recibe el array de facturas aprobadas desde el frontend
    try {
        if (!facturas || facturas.length === 0) {
            return res.status(400).json({ msg: 'No hay facturas aprobadas para enviar.' });
        }

        const emailRes = await enviarPlanPagosAprobado(facturas);
        
        if (emailRes.success) {
            res.json({ msg: 'Plan de pagos enviado correctamente' });
        } else {
            throw new Error(emailRes.error);
        }
    } catch (err) {
        console.error("Error envío correo:", err.message);
        res.status(500).json({ msg: 'Error al enviar el correo informativo.' });
    }
};

// =======================================================
// 9. FUNCIONES EXCLUSIVAS DEL PORTAL PROVEEDORES (B2B)
// =======================================================

exports.recepcionarFacturaB2B = async (req, res) => {
    // 1. 🛡️ SEGURIDAD Y EXTRACCIÓN DE DATOS
    const proveedorId = req.usuario.proveedor_id;
    const usuarioId = req.usuario.id;

    if (!proveedorId) {
        return res.status(403).json({ msg: 'Acceso denegado. Esta acción es exclusiva para Proveedores.' });
    }

    // Capturamos todos los datos, INCLUYENDO LA TASA DE IMPUESTO 🔥
    const {
        tipo_documento, serie, numero_documento, fecha_emision, fecha_vencimiento,
        orden_compra, orden_compra_id, moneda, base_imponible, monto_igv, monto_total,
        tasa_impuesto 
    } = req.body;

    const idLimpio = parseInt(orden_compra_id);
    
    if (!orden_compra_id || isNaN(idLimpio) || idLimpio <= 0) {
        return res.status(400).json({ 
            msg: 'Error: El ID de la Orden de Compra es inválido. Asegúrese de haber validado la OC.' 
        });
    }

    // 🔥 NUEVA LÓGICA DE ARCHIVOS (Atrapando los 3 posibles)
    const pdfFile = req.files && req.files['pdf'] ? req.files['pdf'][0] : null;
    const xmlFile = req.files && req.files['xml'] ? req.files['xml'][0] : null;
    const ocFile = req.files && req.files['pdf_oc'] ? req.files['pdf_oc'][0] : null; // <-- CAPTURAMOS LA OC

    if (!pdfFile) {
        return res.status(400).json({ msg: 'El archivo PDF es obligatorio.' });
    }
    if (tipo_documento !== 'Recibo' && !xmlFile) {
        return res.status(400).json({ msg: 'El archivo XML de SUNAT es obligatorio para Facturas.' });
    }
    if (idLimpio > 0 && !ocFile) { // Si hay OC, el archivo es obligatorio
         return res.status(400).json({ msg: 'Debe adjuntar el PDF de la Orden de Compra validada.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 🔥 MAGIA AQUÍ: Buscamos a qué sede pertenece la Orden de Compra
        const ocQuery = await client.query('SELECT sede_id FROM ordenes_compra WHERE id = $1', [idLimpio]);
        
        // Si por algún motivo rarísimo la OC no tiene sede, le ponemos 1 por defecto para que no se rompa la Analítica
        const sedeHeredada = ocQuery.rows.length > 0 && ocQuery.rows[0].sede_id ? ocQuery.rows[0].sede_id : 1;

        // 2. INSERTAR CABECERA (Heredando la SEDE de la OC)
        const insertFac = await client.query(`
            INSERT INTO facturas (
                proveedor_id, usuario_id, sede_id, tipo_documento, numero_documento,
                fecha_emision, fecha_vencimiento, moneda, base_imponible, 
                tasa_impuesto, monto_igv, monto_total,
                numero_oc, orden_compra_id, evidencia_url, estado_pago, 
                estado_aprobacion, categoria_gasto, clasificacion, descripcion
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 
                'pendiente', 'registrado', 'POR_CLASIFICAR', 'Operativo', $16
            ) RETURNING id
        `, [
            proveedorId, 
            usuarioId, 
            sedeHeredada, 
            tipo_documento, 
            `${serie.toUpperCase()}-${numero_documento}`,
            fecha_emision, 
            fecha_vencimiento || null, 
            moneda, 
            base_imponible, 
            tasa_impuesto ? parseFloat(tasa_impuesto) : 0, 
            monto_igv, 
            monto_total,
            orden_compra || null, // 🔥 Ahora viaja a la columna correcta: numero_oc
            idLimpio, 
            pdfFile.path, 
            `Recepción B2B: ${tipo_documento} de Proveedor - Ref: ${orden_compra}`
        ]);

        const facturaId = insertFac.rows[0].id;

        // 3. INSERTAR DOCUMENTOS EXTRA (XML y PDF de la OC) 🔥
        if (xmlFile) {
            await client.query(`
                INSERT INTO facturas_documentos (factura_id, nombre_archivo, ruta_archivo, tipo_documento)
                VALUES ($1, $2, $3, 'XML SUNAT')
            `, [facturaId, xmlFile.originalname, xmlFile.path]);
        }

        if (ocFile) {
            await client.query(`
                INSERT INTO facturas_documentos (factura_id, nombre_archivo, ruta_archivo, tipo_documento)
                VALUES ($1, $2, $3, 'Orden de Compra')
            `, [facturaId, ocFile.originalname, ocFile.path]);
        }

        // 4. ACTUALIZAR ORDEN DE COMPRA A 'FACTURADA'
        await client.query(`
            UPDATE ordenes_compra SET estado = 'FACTURADA' WHERE id = $1
        `, [idLimpio]);

        // 5. REGISTRO EN AUDITORÍA
        await client.query(`
            INSERT INTO auditoria (usuario_id, modulo, accion, registro_id, detalle)
            VALUES ($1, 'PORTAL_B2B', 'RECEPCION_FACTURA', $2, $3)
        `, [usuarioId, facturaId, `Proveedor subió ${tipo_documento} ${serie}-${numero_documento} junto a su OC.`]);

        await client.query('COMMIT');
        res.status(201).json({ 
            success: true,
            msg: `¡${tipo_documento} recepcionado con éxito!`
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error Crítico en Recepción B2B:", err);
        res.status(500).json({ msg: 'Error interno al procesar el documento en el servidor.' });
    } finally {
        client.release();
    }
};

// Obtener el historial de comprobantes de un proveedor específico
exports.obtenerMisComprobantesB2B = async (req, res) => {
    const proveedorId = req.usuario.proveedor_id;
    
    if (!proveedorId) {
        return res.status(403).json({ msg: 'Acceso denegado. Exclusivo para proveedores.' });
    }

    try {
        // 🚀 MEJORA: Hacemos una subconsulta para traer también el XML de la tabla facturas_documentos
        const result = await pool.query(`
            SELECT 
                f.id, 
                f.numero_documento, 
                f.tipo_documento, 
                TO_CHAR(f.fecha_emision, 'DD/MM/YYYY') as fecha_emision, 
                f.monto_total, 
                f.moneda, 
                f.forma_pago, 
                f.estado_pago,
                f.evidencia_url,
                (SELECT ruta_archivo FROM facturas_documentos fd WHERE fd.factura_id = f.id AND fd.tipo_documento = 'XML SUNAT' LIMIT 1) as xml_url
            FROM facturas f
            WHERE f.proveedor_id = $1
            ORDER BY f.id DESC
        `, [proveedorId]);

        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error al obtener comprobantes B2B:", err);
        res.status(500).json({ msg: 'Error al obtener el historial de comprobantes.' });
    }
};

// Obtener las métricas y gráficos para el Dashboard B2B
exports.obtenerDashboardB2B = async (req, res) => {
    const proveedorId = req.usuario.proveedor_id;
    
    if (!proveedorId) {
        return res.status(403).json({ msg: 'Acceso denegado.' });
    }

    try {
        // 1. Consulta maestra para los KPIs y Gráfico 1 (Corregida la lógica contable)
        const kpisResult = await pool.query(`
            SELECT 
                -- Si es pendiente o parcial, y no está programado para hoy, es PENDIENTE DE PAGO
                SUM(CASE WHEN (estado_pago = 'pendiente' OR estado_pago = 'parcial') AND programado_hoy = false THEN 1 ELSE 0 END) as pendientes,
                
                -- Si está programado para hoy (sea parcial o pendiente), es PROGRAMADO
                SUM(CASE WHEN programado_hoy = true AND estado_pago != 'pagado' THEN 1 ELSE 0 END) as programados,
                
                -- SOLO las facturas pagadas al 100% van aquí
                SUM(CASE WHEN estado_pago = 'pagado' THEN 1 ELSE 0 END) as pagados,
                
                SUM(CASE WHEN estado_pago = 'anulado' OR estado_pago = 'rechazado' THEN 1 ELSE 0 END) as rechazados
            FROM facturas
            WHERE proveedor_id = $1
        `, [proveedorId]);

        const datosKpis = kpisResult.rows[0];

        // 2. Consulta para el Gráfico 2 (Tipos de Gasto / Servicios)
        const tiposResult = await pool.query(`
            SELECT categoria_gasto, COUNT(*) as cantidad
            FROM facturas
            WHERE proveedor_id = $1
            GROUP BY categoria_gasto
        `, [proveedorId]);

        // Procesar las categorías (Mapeamos a los 3 colores del gráfico: Servicios, Activos, Mercadería)
        let categorias = { servicios: 0, activos: 0, mercaderia: 0 };
        
        tiposResult.rows.forEach(row => {
            const cat = (row.categoria_gasto || '').toLowerCase();
            const cant = parseInt(row.cantidad);
            
            if (cat.includes('servicio')) {
                categorias.servicios += cant;
            } else if (cat.includes('activo') || cat.includes('fijo')) {
                categorias.activos += cant;
            } else {
                categorias.mercaderia += cant;
            }
        });

        // 3. Empaquetamos todo y lo enviamos al Frontend
        res.json({
            kpis: {
                pendientes: parseInt(datosKpis.pendientes || 0),
                programados: parseInt(datosKpis.programados || 0),
                pagados: parseInt(datosKpis.pagados || 0),
                rechazados: parseInt(datosKpis.rechazados || 0)
            },
            graficoEstados: [
                parseInt(datosKpis.pendientes || 0),
                parseInt(datosKpis.programados || 0),
                parseInt(datosKpis.pagados || 0),
                parseInt(datosKpis.rechazados || 0)
            ],
            graficoTipos: [categorias.servicios, categorias.activos, categorias.mercaderia]
        });

    } catch (err) {
        console.error("❌ Error al cargar Dashboard B2B:", err);
        res.status(500).json({ msg: 'Error al calcular las métricas del dashboard.' });
    }
};

// =======================================================
// 10. VALIDAR ORDEN DE COMPRA (Boton Mágico B2B)
// =======================================================
exports.validarOrdenCompraB2B = async (req, res) => {
    const { codigo } = req.params;
    const proveedorId = req.usuario.proveedor_id;

    if (!proveedorId) {
        return res.status(403).json({ msg: 'Acceso denegado.' });
    }

    try {
        // Buscamos la Orden de Compra por su código (Ignorando mayúsculas/minúsculas)
        const result = await pool.query(`
            SELECT id, moneda, monto_subtotal, monto_igv, monto_total, estado, proveedor_id, porcentaje_impuesto
            FROM ordenes_compra
            WHERE UPPER(codigo_oc) = UPPER($1)
        `, [codigo.trim()]);

        // 1. Validar si existe
        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'La Orden de Compra no existe o está mal escrita.' });
        }

        const oc = result.rows[0];

        // 2. Validar si es SUYA (Evita que un proveedor use la OC de otro)
        if (oc.proveedor_id !== proveedorId) {
            return res.status(403).json({ msg: 'Esta Orden de Compra le pertenece a otra empresa.' });
        }

        // 3. Validar si YA FUE USADA
        if (oc.estado === 'USADA' || oc.estado === 'FACTURADA') {
            return res.status(400).json({ msg: '⚠️ Esta Orden de Compra ya fue procesada en una factura anterior.' });
        }

        // Si pasa todas las pruebas, se la devolvemos al frontend para que autocomplete
        res.json(oc);

    } catch (err) {
        console.error("❌ Error validando OC B2B:", err);
        res.status(500).json({ msg: 'Error interno al validar la Orden de Compra.' });
    }
};

// --- 🆕 OBTENER NOTIFICACIONES DEL PROVEEDOR ---
exports.obtenerNotificacionesB2B = async (req, res) => {
    try {
        // En el portal B2B, el proveedor_id viene del token (req.usuario.proveedor_id)
        const proveedorId = req.usuario.proveedor_id;

        if (!proveedorId) {
            return res.status(403).json({ msg: "No autorizado para ver notificaciones" });
        }

        const result = await pool.query(
            `SELECT id, titulo, mensaje, tipo, leido, fecha_creacion 
             FROM notificaciones_b2b 
             WHERE proveedor_id = $1 
             ORDER BY fecha_creacion DESC LIMIT 50`,
            [proveedorId]
        );

        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener notificaciones:", err);
        res.status(500).json({ msg: "Error de servidor" });
    }
};

// --- 🆕 MARCAR TODAS COMO LEÍDAS ---
exports.marcarLeidasB2B = async (req, res) => {
    try {
        const proveedorId = req.usuario.proveedor_id;
        
        await pool.query(
            "UPDATE notificaciones_b2b SET leido = TRUE WHERE proveedor_id = $1",
            [proveedorId]
        );

        res.json({ msg: "Notificaciones marcadas como leídas" });
    } catch (err) {
        console.error("Error al marcar leídas:", err);
        res.status(500).json({ msg: "Error de servidor" });
    }
};

// --- 🆕 OBTENER COMUNICADO ACTIVO (BANNER B2B) ---
exports.obtenerComunicadoB2B = async (req, res) => {
    try {
        // Buscamos el último comunicado que esté marcado como activo
        const result = await pool.query(
            `SELECT titulo, mensaje, tipo, fecha_publicacion 
             FROM comunicados_b2b 
             WHERE activo = TRUE 
             ORDER BY fecha_publicacion DESC LIMIT 1`
        );

        // Si hay un comunicado, lo enviamos. Si no, enviamos null.
        res.json(result.rows.length > 0 ? result.rows[0] : null);
    } catch (err) {
        console.error("Error al obtener comunicado B2B:", err);
        res.status(500).json({ msg: "Error de servidor al cargar el comunicado" });
    }
};