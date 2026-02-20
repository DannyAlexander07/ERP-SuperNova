//Ubicacion: backend/controllers/tercerosController.js

const pool = require('../db');
const facturacionController = require('./facturacionController');

// 1. LISTAR CANALES (Para llenar el select en el frontend)
exports.obtenerCanales = async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM canales_externos WHERE estado = 'ACTIVO' ORDER BY nombre ASC");
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 2. CREAR NUEVO CANAL (Ej: "Cuponatic")
exports.crearCanal = async (req, res) => {
    const { nombre, tipo, comision } = req.body;
    try {
        const result = await pool.query(
            "INSERT INTO canales_externos (nombre, tipo, comision_porcentaje) VALUES ($1, $2, $3) RETURNING *",
            [nombre, tipo, comision || 0]
        );
        res.json({ msg: "Canal creado", canal: result.rows[0] });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 3. REGISTRAR ACUERDO COMERCIAL (La Venta B2B + Cuotas)
exports.crearAcuerdo = async (req, res) => {
    // Recibimos 'numero_cuotas' del formulario
    const { canal_id, descripcion, cantidad, precio_unitario, producto_id, numero_cuotas } = req.body;
    
    const usuarioId = req.usuario.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const total = cantidad * precio_unitario;

        // 1. Insertar Acuerdo
        const resAcuerdo = await client.query(
            `INSERT INTO acuerdos_comerciales 
            (canal_id, descripcion, cantidad_entradas, precio_unitario_acordado, monto_total_acuerdo, usuario_id, producto_asociado_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
            [canal_id, descripcion, cantidad, precio_unitario, total, usuarioId, producto_id]
        );
        const acuerdoId = resAcuerdo.rows[0].id;

        // 2. Generar Cuotas (Automático)
        const numCuotas = parseInt(numero_cuotas) || 1; // Por defecto 1
        const montoCuota = total / numCuotas;
        
        // Creamos las cuotas (vencimiento mensual por defecto)
        for (let i = 1; i <= numCuotas; i++) {
            const fechaVencimiento = new Date();
            fechaVencimiento.setMonth(fechaVencimiento.getMonth() + (i - 1)); // Sumar meses

            await client.query(
                `INSERT INTO cuotas_acuerdos (acuerdo_id, numero_cuota, monto, fecha_vencimiento, estado)
                 VALUES ($1, $2, $3, $4, 'PENDIENTE')`,
                [acuerdoId, i, montoCuota, fechaVencimiento]
            );
        }

        await client.query('COMMIT');
        res.json({ msg: "Acuerdo y plan de pagos registrado correctamente", acuerdoId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: "Error al crear acuerdo" });
    } finally {
        client.release();
    }
};

// 🔥 3.5. LISTAR ACUERDOS (NUEVO - PARA LLENAR LA TABLA)
exports.listarAcuerdos = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT a.id, c.nombre as empresa, a.descripcion, a.cantidad_entradas, 
                   a.monto_total_acuerdo, a.fecha_acuerdo, a.producto_asociado_id
            FROM acuerdos_comerciales a
            JOIN canales_externos c ON a.canal_id = c.id
            ORDER BY a.id DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 4. CARGA MASIVA DE CÓDIGOS (Lista Blanca) - VERSIÓN BLINDADA 🛡️
exports.cargarCodigos = async (req, res) => {
    let { acuerdo_id, canal_id, codigos, producto_id } = req.body; 
    
    if (!acuerdo_id || !codigos || !Array.isArray(codigos)) {
        return res.status(400).json({ error: "Datos incompletos o formato de códigos incorrecto." });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // 1. Obtener límites y producto del acuerdo
        const resAcuerdo = await client.query(`
            SELECT producto_asociado_id, cantidad_entradas 
            FROM acuerdos_comerciales 
            WHERE id = $1
        `, [acuerdo_id]);

        if (resAcuerdo.rows.length === 0) throw new Error("El acuerdo no existe.");

        const { producto_asociado_id, cantidad_entradas } = resAcuerdo.rows[0];
        const prodIdFinal = producto_id || producto_asociado_id;

        if (!prodIdFinal) throw new Error("No hay un producto asociado para descontar inventario.");

        // 🛡️ BLINDAJE: Validar espacio disponible antes de insertar
        const resConteo = await client.query('SELECT COUNT(*) FROM codigos_externos WHERE acuerdo_id = $1', [acuerdo_id]);
        const yaCargados = parseInt(resConteo.rows[0].count);
        const cuposRestantes = cantidad_entradas - yaCargados;

        if (codigos.length > cuposRestantes) {
            throw new Error(`Operación denegada. El acuerdo solo permite ${cuposRestantes} códigos más, pero intentas cargar ${codigos.length}.`);
        }
        
        let insertados = 0;
        let duplicados = 0;

        for (const cod of codigos) {
            const res = await client.query(
                `INSERT INTO codigos_externos (canal_id, acuerdo_id, codigo_unico, producto_asociado_id)
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (codigo_unico) DO NOTHING RETURNING id`,
                [canal_id || 1, acuerdo_id, cod.trim().toUpperCase(), prodIdFinal]
            );
            if (res.rows.length > 0) insertados++;
            else duplicados++;
        }

        await client.query('COMMIT');
        res.json({ 
            msg: "Proceso de carga terminado", 
            insertados, 
            duplicados,
            total_actual: yaCargados + insertados 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error en cargarCodigos:", err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

// 5. 🔥 VALIDACIÓN EN PUERTA (CORREGIDO: COSTO_COMPRA)
exports.validarYCanjear = async (req, res) => {
    const { codigo } = req.body;
    const sedeId = req.usuario.sede_id;
    const usuarioId = req.usuario.id;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // A. Buscar código y datos del acuerdo
        // CORRECCIÓN: Usamos 'p.costo_compra' en lugar de 'p.costo_promedio'
        const resCodigo = await client.query(
            `SELECT c.*, 
                    p.nombre as nombre_producto, 
                    p.id as prod_id, 
                    p.costo_compra,             -- <--- CORREGIDO AQUÍ
                    a.precio_unitario_acordado 
             FROM codigos_externos c
             LEFT JOIN productos p ON c.producto_asociado_id = p.id
             LEFT JOIN acuerdos_comerciales a ON c.acuerdo_id = a.id
             WHERE c.codigo_unico = $1`,
            [codigo]
        );

        if (resCodigo.rows.length === 0) throw new Error("⛔ CÓDIGO NO EXISTE en el sistema.");
        const infoCodigo = resCodigo.rows[0];

        // B. Validar Estado
        if (infoCodigo.estado === 'CANJEADO') {
            const fechaDb = new Date(infoCodigo.fecha_canje);
            const fechaStr = fechaDb.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            const horaStr = fechaDb.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
            throw new Error(`⚠️ YA FUE USADO<br>📅 El ${fechaStr} a las ${horaStr}`);
        }

        if (infoCodigo.estado === 'ANULADO') {
            throw new Error("⛔ Este código fue anulado por administración.");
        }

        // C. Validar Stock y Mover Kardex
        if (infoCodigo.prod_id) {
            const resStock = await client.query(
                "SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE",
                [infoCodigo.prod_id, sedeId]
            );
            const stockActual = resStock.rows.length > 0 ? resStock.rows[0].cantidad : 0;

            if (stockActual <= 0) {
                throw new Error(`❌ CÓDIGO VÁLIDO PERO NO HAY STOCK FÍSICO DE "${infoCodigo.nombre_producto}".`);
            }

            // 1. Descontar Stock
            await client.query(
                "UPDATE inventario_sedes SET cantidad = cantidad - 1 WHERE producto_id = $1 AND sede_id = $2",
                [infoCodigo.prod_id, sedeId]
            );

            // 2. Registrar Kardex con Valorización
            // Costo = costo_compra (del producto)
            // Precio Venta = precio_unitario_acordado (del acuerdo B2B)
            await client.query(
                `INSERT INTO movimientos_inventario 
                (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento, precio_venta_historico)
                 VALUES ($1, $2, $3, 'salida_canje', -1, $4, $5, $6, $7)`,
                [
                    sedeId, 
                    infoCodigo.prod_id, 
                    usuarioId, 
                    stockActual - 1, 
                    `Canje Externo: ${codigo}`, 
                    infoCodigo.costo_compra || 0,            // <--- CORREGIDO (Costo Contable)
                    infoCodigo.precio_unitario_acordado || 0 // <--- (Precio Venta Real)
                ]
            );
        }

        // D. Marcar código como USADO
        await client.query(
            `UPDATE codigos_externos 
             SET estado = 'CANJEADO', fecha_canje = NOW(), sede_canje_id = $1, usuario_canje_id = $2
             WHERE id = $3`,
            [sedeId, usuarioId, infoCodigo.id]
        );

        await client.query('COMMIT');
        
        // ✅ RESPUESTA ÉXITOSA
        res.json({ 
            success: true, 
            msg: "✅ CÓDIGO VÁLIDO - PUEDE INGRESAR", 
            producto: infoCodigo.nombre_producto,
            valor_canje: infoCodigo.precio_unitario_acordado
        });

    } catch (err) {
        await client.query('ROLLBACK');
        res.json({ 
            success: false, 
            msg: err.message 
        });
    } finally {
        client.release();
    }
};

// 6. HISTORIAL DE CANJES (NUEVO)
exports.obtenerHistorialCanjes = async (req, res) => {
    try {
        // Traemos los últimos 20 canjes de HOY
        const result = await pool.query(`
            SELECT c.codigo_unico, c.fecha_canje, p.nombre as producto, u.nombres as usuario
            FROM codigos_externos c
            LEFT JOIN productos p ON c.producto_asociado_id = p.id
            LEFT JOIN usuarios u ON c.usuario_canje_id = u.id
            WHERE c.estado = 'CANJEADO' 
            AND DATE(c.fecha_canje) = CURRENT_DATE
            ORDER BY c.fecha_canje DESC LIMIT 20
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 9. VER DETALLE ACUERDO (ACTUALIZADA: Incluye estadísticas de canje e historial de pagos)
exports.obtenerDetalleAcuerdo = async (req, res) => {
    const { id } = req.params;
    try {
        // 1. Obtener estadísticas de códigos y datos generales del acuerdo
        const result = await pool.query(`
            SELECT 
                a.id,
                a.descripcion, 
                a.cantidad_entradas, 
                a.monto_total_acuerdo,
                a.fecha_acuerdo,
                c.nombre as canal,
                p.nombre as producto,
                COUNT(ce.id) as total_cargados,
                COALESCE(SUM(CASE WHEN ce.estado = 'CANJEADO' THEN 1 ELSE 0 END), 0) as total_canjeados,
                COALESCE(SUM(CASE WHEN ce.estado = 'DISPONIBLE' THEN 1 ELSE 0 END), 0) as total_disponibles
            FROM acuerdos_comerciales a
            JOIN canales_externos c ON a.canal_id = c.id
            LEFT JOIN productos p ON a.producto_asociado_id = p.id
            LEFT JOIN codigos_externos ce ON ce.acuerdo_id = a.id
            WHERE a.id = $1
            GROUP BY a.id, c.nombre, p.nombre
        `, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: "Acuerdo comercial no encontrado" });
        }

        // 2. 🆕 NUEVO: Obtener el historial de cobros desde la tabla independiente
        const pagos = await pool.query(`
            SELECT 
                id, 
                monto, 
                fecha_pago, 
                metodo_pago, 
                numero_operacion, 
                notas 
            FROM pagos_acuerdos 
            WHERE acuerdo_id = $1 
            ORDER BY fecha_registro DESC
        `, [id]);

        // Unificamos la respuesta
        const detalleCompleto = {
            ...result.rows[0],
            historial_pagos: pagos.rows // 🚀 Se añade el desglose financiero independiente
        };

        res.json(detalleCompleto);

    } catch (err) {
        console.error("❌ Error al obtener detalle del acuerdo:", err.message);
        res.status(500).json({ error: 'Error al procesar la solicitud del detalle' });
    }
};


// 8. ELIMINAR ACUERDO (ACTUALIZADO: Limpieza de historial de pagos independiente)
exports.eliminarAcuerdo = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Seguridad: Verificar si ya hay códigos canjeados (usados por clientes finales)
        const check = await client.query(
            "SELECT id FROM codigos_externos WHERE acuerdo_id = $1 AND estado = 'CANJEADO' LIMIT 1", 
            [id]
        );

        if (check.rows.length > 0) {
            throw new Error("⛔ No se puede eliminar este acuerdo porque YA TIENE CÓDIGOS USADOS por clientes.");
        }

        // 2. 🆕 NUEVO: Eliminar historial de pagos de la tabla independiente
        // Esto evita que queden registros huérfanos en la nueva tabla pagos_acuerdos.
        await client.query("DELETE FROM pagos_acuerdos WHERE acuerdo_id = $1", [id]);

        // 3. Eliminar códigos asociados (Limpiar lista blanca de códigos disponibles)
        await client.query("DELETE FROM codigos_externos WHERE acuerdo_id = $1", [id]);

        // 4. Eliminar cuotas asociadas del cronograma
        await client.query("DELETE FROM cuotas_acuerdos WHERE acuerdo_id = $1", [id]);

        // 5. Eliminar el acuerdo principal de la cabecera
        await client.query("DELETE FROM acuerdos_comerciales WHERE id = $1", [id]);

        await client.query('COMMIT');
        res.json({ msg: "✅ Acuerdo, códigos y su historial de pagos eliminados correctamente." });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error al eliminar acuerdo comercial:", err.message);
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

// 10. LISTAR CÓDIGOS DE UN ACUERDO (Para ver qué se cargó)
exports.listarCodigosPorAcuerdo = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT codigo_unico, estado, fecha_canje
            FROM codigos_externos 
            WHERE acuerdo_id = $1
            ORDER BY id ASC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 11. VER CRONOGRAMA DE PAGOS (CUOTAS)
exports.obtenerCuotasAcuerdo = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT * FROM cuotas_acuerdos 
            WHERE acuerdo_id = $1 
            ORDER BY numero_cuota ASC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// 🔥 12. REGISTRAR PAGO DE CUOTA (ACTUALIZADO: Independencia de Caja y Trazabilidad)
exports.pagarCuota = async (req, res) => {
    const { id } = req.params; 
    const { 
        metodo_pago, tipo_comprobante, tipo_tarjeta,
        cliente_doc, cliente_nombre, cliente_direccion, cliente_email,
        formato_pdf, numero_operacion // <--- Agregamos numero_operacion para el historial
    } = req.body; 
    
    const usuarioId = req.usuario.id;
    const sedeId = req.usuario.sede_id;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener datos CLAVE: Cantidad original del acuerdo
        const resCuota = await client.query(`
            SELECT c.*, 
                   a.descripcion as desc_acuerdo,
                   a.producto_asociado_id,
                   a.cantidad_entradas,         -- <--- DATO FUERTE: Cantidad Original (Ej: 8)
                   p.nombre as nombre_producto
            FROM cuotas_acuerdos c
            JOIN acuerdos_comerciales a ON c.acuerdo_id = a.id
            LEFT JOIN productos p ON a.producto_asociado_id = p.id
            WHERE c.id = $1
        `, [id]);

        if (resCuota.rows.length === 0) throw new Error("Cuota no encontrada");
        const cuota = resCuota.rows[0];

        if (cuota.estado === 'PAGADO') throw new Error("Esta cuota ya está pagada.");

        // 2. ASIGNACIÓN DIRECTA (Cálculos para Facturación)
        const totalPagar = parseFloat(cuota.monto); 
        const cantidadReal = parseInt(cuota.cantidad_entradas) || 1; 
        const precioUnitarioParaFactura = Number((totalPagar / cantidadReal).toFixed(10));
        const descripcionItem = `${cuota.nombre_producto || 'PAGO CUOTA'} [Cuota ${cuota.numero_cuota}]`;

        const subtotal = Number((totalPagar / 1.18).toFixed(2));
        const igv = Number((totalPagar - subtotal).toFixed(2));

        // Correlativo Ticket Interno
        const sedeRes = await client.query('SELECT prefijo_ticket FROM sedes WHERE id = $1', [sedeId]);
        const prefijo = sedeRes.rows[0]?.prefijo_ticket || 'GEN';
        const maxTicket = await client.query('SELECT COALESCE(MAX(numero_ticket_sede), 0) as max FROM ventas WHERE sede_id = $1', [sedeId]);
        const numTicket = parseInt(maxTicket.rows[0].max) + 1;
        const codigoTicket = `${prefijo}-${numTicket.toString().padStart(4, '0')}`;

        // 3. Insertar Venta (Corporativa)
        const resVenta = await client.query(`
            INSERT INTO ventas (
                sede_id, usuario_id, vendedor_id, 
                metodo_pago, total_venta, subtotal, igv, 
                linea_negocio, numero_ticket_sede, tipo_venta, 
                observaciones, tipo_comprobante, 
                doc_cliente_temporal, nombre_cliente_temporal, 
                cliente_razon_social, cliente_direccion,
                tipo_tarjeta, sunat_estado, origen
            ) VALUES ($1, $2, $2, $3, $4, $5, $6, 'CORPORATIVO', $7, 'Servicio', $8, $9, $10, $11, $12, $13, $14, 'PENDIENTE', 'COBRO_CUOTA')
            RETURNING id
        `, [
            sedeId, usuarioId, 
            metodo_pago || 'TRANSFERENCIA', totalPagar, subtotal, igv, 
            numTicket, `Pago Cuota #${cuota.numero_cuota} - ${cuota.desc_acuerdo}`, 
            tipo_comprobante || 'Boleta',
            cliente_doc, cliente_nombre, 
            (tipo_comprobante === 'Factura' ? cliente_nombre : null),
            (tipo_comprobante === 'Factura' ? cliente_direccion : null),
            tipo_tarjeta 
        ]);
        
        const ventaId = resVenta.rows[0].id;

        // 4. Detalle de Venta
        await client.query(`
            INSERT INTO detalle_ventas (
                venta_id, producto_id, nombre_producto_historico, 
                cantidad, precio_unitario, subtotal, costo_historico
            ) VALUES ($1, $2, $3, $4, $5, $6, 0)
        `, [
            ventaId, 
            cuota.producto_asociado_id, 
            descripcionItem, 
            cantidadReal,
            precioUnitarioParaFactura,
            totalPagar
        ]);

        // 5. 🔄 NUEVO: Registrar en la tabla independiente 'pagos_acuerdos'
        // Esto permite que el módulo de Canjes tenga su propia contabilidad.
        await client.query(`
            INSERT INTO pagos_acuerdos (
                acuerdo_id, usuario_id, monto, fecha_pago, 
                metodo_pago, numero_operacion, notas
            ) VALUES ($1, $2, $3, NOW(), $4, $5, $6)
        `, [
            cuota.acuerdo_id,
            usuarioId,
            totalPagar,
            metodo_pago,
            numero_operacion || codigoTicket,
            `Cobro Cuota #${cuota.numero_cuota} via ${tipo_comprobante}`
        ]);

        // 6. Registrar en Caja (Con acuerdo_id para filtrado)
        const descCaja = `Ticket ${codigoTicket} (Cuota #${cuota.numero_cuota})`;
        await client.query(`
            INSERT INTO movimientos_caja 
            (sede_id, usuario_id, tipo_movimiento, categoria, monto, descripcion, metodo_pago, fecha_registro, venta_id, acuerdo_id)
            VALUES ($1, $2, 'INGRESO', 'VENTA_POS', $3, $4, $5, NOW(), $6, $7)
        `, [sedeId, usuarioId, totalPagar, descCaja, metodo_pago, ventaId, cuota.acuerdo_id]);

        // 7. Actualizar Cuota
        await client.query(`
            UPDATE cuotas_acuerdos 
            SET estado = 'PAGADO', fecha_pago = NOW(), metodo_pago = $2, comprobante_pago = $3
            WHERE id = $1
        `, [id, metodo_pago, codigoTicket]);

        await client.query('COMMIT');

        // 8. Facturación NUBEFACT (Asíncrono)
        setImmediate(() => {
            facturacionController.emitirComprobante({
                body: { 
                    venta_id: ventaId, 
                    formato_pdf: formato_pdf || '3', 
                    cliente_email 
                },
                usuario: req.usuario
            }, {
                json: (d) => console.log(`[B2B] Factura enviada: ${ventaId}`),
                status: () => ({ json: () => {} })
            });
        });

        res.json({ msg: "Pago registrado y factura generada.", ticketCodigo: codigoTicket, ventaId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error pago cuota acuerdo:", err.message); 
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

// 13. EDITAR CUOTA (CON REDISTRIBUCIÓN Y LIMPIEZA DE CUOTAS VACÍAS) 🧠
exports.editarCuota = async (req, res) => {
    const { id } = req.params;
    const { nuevo_monto, nueva_fecha } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener datos de la cuota que estamos editando
        const resActual = await client.query("SELECT * FROM cuotas_acuerdos WHERE id = $1 FOR UPDATE", [id]);
        if(resActual.rows.length === 0) throw new Error("Cuota no encontrada");
        
        const cuotaActual = resActual.rows[0];
        const acuerdoId = cuotaActual.acuerdo_id;
        const numeroCuotaActual = parseInt(cuotaActual.numero_cuota);
        const montoAnterior = parseFloat(cuotaActual.monto);
        const montoNuevoFloat = parseFloat(nuevo_monto);

        // 2. Calcular la Diferencia
        // POSITIVA: El cliente paga MENOS ahora (Falta dinero -> Se suma al futuro)
        // NEGATIVA: El cliente paga MÁS ahora (Sobra dinero -> Se resta al futuro)
        const diferencia = montoAnterior - montoNuevoFloat; 

        // 3. VALIDACIÓN DE SEGURIDAD (No cobrar más de la deuda total)
        if (diferencia < 0) { 
            const resFuturo = await client.query(`
                SELECT COALESCE(SUM(monto), 0) as deuda_futura 
                FROM cuotas_acuerdos 
                WHERE acuerdo_id = $1 AND numero_cuota > $2 AND estado = 'PENDIENTE'
            `, [acuerdoId, numeroCuotaActual]);
            
            const deudaFuturaTotal = parseFloat(resFuturo.rows[0].deuda_futura);
            const excedente = Math.abs(diferencia);

            // Margen de error de 0.10 por decimales
            if (excedente > (deudaFuturaTotal + 0.10)) {
                throw new Error(`⚠️ Error: El monto ingresado (S/ ${montoNuevoFloat}) supera la deuda total pendiente.`);
            }
        }

        // 4. ACTUALIZAR LA CUOTA ACTUAL
        await client.query(`
            UPDATE cuotas_acuerdos 
            SET monto = $1, fecha_vencimiento = $2
            WHERE id = $3
        `, [montoNuevoFloat, nueva_fecha, id]);

        // 5. LÓGICA DE CASCADA
        
        if (diferencia > 0.01) {
            // CASO A: FALTA DINERO (Se suma a la siguiente cuota o se crea nueva)
            // ------------------------------------------------------------------
            const resSiguiente = await client.query(`
                SELECT id, monto FROM cuotas_acuerdos 
                WHERE acuerdo_id = $1 AND numero_cuota > $2 AND estado = 'PENDIENTE'
                ORDER BY numero_cuota ASC LIMIT 1
            `, [acuerdoId, numeroCuotaActual]);

            if (resSiguiente.rows.length > 0) {
                // Existe una cuota siguiente: Le sumamos la deuda
                const siguiente = resSiguiente.rows[0];
                const nuevoMontoSiguiente = parseFloat(siguiente.monto) + diferencia;
                await client.query("UPDATE cuotas_acuerdos SET monto = $1 WHERE id = $2", [nuevoMontoSiguiente, siguiente.id]);
            } else {
                // Es la última cuota: Creamos una nueva al final
                const fechaBase = new Date(nueva_fecha);
                fechaBase.setDate(fechaBase.getDate() + 30); 
                const siguienteNumero = numeroCuotaActual + 1;

                await client.query(`
                    INSERT INTO cuotas_acuerdos 
                    (acuerdo_id, numero_cuota, monto, fecha_vencimiento, estado)
                    VALUES ($1, $2, $3, $4, 'PENDIENTE')
                `, [acuerdoId, siguienteNumero, diferencia, fechaBase]);
            }

        } else if (diferencia < -0.01) {
            // CASO B: SOBRA DINERO (Se resta a las siguientes cuotas en cadena)
            // ------------------------------------------------------------------
            let saldoAFavor = Math.abs(diferencia); 

            // Traemos TODAS las cuotas futuras en orden
            const resFuturas = await client.query(`
                SELECT id, monto, numero_cuota FROM cuotas_acuerdos 
                WHERE acuerdo_id = $1 AND numero_cuota > $2 AND estado = 'PENDIENTE'
                ORDER BY numero_cuota ASC
            `, [acuerdoId, numeroCuotaActual]);

            for (const futura of resFuturas.rows) {
                if (saldoAFavor <= 0.01) break; // Ya repartimos todo el saldo

                const montoFutura = parseFloat(futura.monto);

                // Usamos un pequeño margen de 0.01 para evitar problemas de coma flotante
                if (saldoAFavor >= (montoFutura - 0.01)) {
                    // El saldo cubre TOTALMENTE esta cuota futura
                    // 🔥 ACCIÓN CORREGIDA: ELIMINAR LA CUOTA EN LUGAR DE DEJARLA EN 0
                    await client.query("DELETE FROM cuotas_acuerdos WHERE id = $1", [futura.id]);
                    saldoAFavor -= montoFutura;
                } else {
                    // El saldo cubre PARCIALMENTE esta cuota
                    const nuevoMontoFutura = montoFutura - saldoAFavor;
                    await client.query("UPDATE cuotas_acuerdos SET monto = $1 WHERE id = $2", [nuevoMontoFutura, futura.id]);
                    saldoAFavor = 0; // Se acabó el saldo
                }
            }
        }

        await client.query('COMMIT');
        res.json({ msg: "Cuota actualizada y plan de pagos reajustado." });

    } catch (err) {
        await client.query('ROLLBACK');
        const mensaje = err.message.replace("Error: ", ""); 
        res.status(400).json({ error: mensaje });
    } finally {
        client.release();
    }
};

// 14. 🔥 HISTORIAL TOTAL DE CANJES (CON FILTROS Y EXPORTACIÓN)
exports.obtenerHistorialTotal = async (req, res) => {
    try {
        const { page, limit, inicio, fin, search, canal, exportar } = req.query;

        // 1. Construcción dinámica del WHERE
        let whereClause = "WHERE c.estado = 'CANJEADO'";
        const params = [];
        let paramIndex = 1;

        // Filtro Fechas
        if (inicio) {
            whereClause += ` AND DATE(c.fecha_canje) >= $${paramIndex}`;
            params.push(inicio);
            paramIndex++;
        }
        if (fin) {
            whereClause += ` AND DATE(c.fecha_canje) <= $${paramIndex}`;
            params.push(fin);
            paramIndex++;
        }

        // Filtro Canal (Socio)
        if (canal) {
            whereClause += ` AND a.canal_id = $${paramIndex}`;
            params.push(canal);
            paramIndex++;
        }

        // Filtro Búsqueda (Código, Usuario, Producto)
        if (search) {
            whereClause += ` AND (
                c.codigo_unico ILIKE $${paramIndex} OR 
                u.nombres ILIKE $${paramIndex} OR 
                p.nombre ILIKE $${paramIndex}
            )`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        // 2. Lógica para Exportar (Sin paginación) vs Listar (Con paginación)
        let queryFinal = "";
        
        if (exportar === 'true') {
            // MODO EXCEL: Traemos TODO lo que coincida
            queryFinal = `
                SELECT 
                    c.fecha_canje, 
                    c.codigo_unico, 
                    ce.nombre as socio_canal,
                    a.descripcion as nombre_paquete,
                    p.nombre as producto, 
                    u.nombres as usuario
                FROM codigos_externos c
                LEFT JOIN productos p ON c.producto_asociado_id = p.id
                LEFT JOIN usuarios u ON c.usuario_canje_id = u.id
                LEFT JOIN acuerdos_comerciales a ON c.acuerdo_id = a.id
                LEFT JOIN canales_externos ce ON a.canal_id = ce.id
                ${whereClause}
                ORDER BY c.fecha_canje DESC
            `;
        } else {
            // MODO TABLA: Con Paginación
            const pagina = parseInt(page) || 1;
            const limite = parseInt(limit) || 20;
            const offset = (pagina - 1) * limite;

            queryFinal = `
                SELECT 
                    c.id, c.codigo_unico, c.fecha_canje, c.estado,
                    p.nombre as producto, u.nombres as usuario,
                    ce.nombre as socio_canal, a.descripcion as nombre_paquete
                FROM codigos_externos c
                LEFT JOIN productos p ON c.producto_asociado_id = p.id
                LEFT JOIN usuarios u ON c.usuario_canje_id = u.id
                LEFT JOIN acuerdos_comerciales a ON c.acuerdo_id = a.id
                LEFT JOIN canales_externos ce ON a.canal_id = ce.id
                ${whereClause}
                ORDER BY c.fecha_canje DESC
                LIMIT ${limite} OFFSET ${offset}
            `;
        }

        // Ejecutar Query de Datos
        const resData = await pool.query(queryFinal, params);

        if (exportar === 'true') {
            return res.json(resData.rows); // Retornamos array puro para el Excel
        }

        // Ejecutar Query de Conteo (Solo para paginación)
        // Nota: Debemos reconstruir el query count con los mismos filtros
        const countQuery = `
            SELECT COUNT(*) 
            FROM codigos_externos c
            LEFT JOIN productos p ON c.producto_asociado_id = p.id
            LEFT JOIN usuarios u ON c.usuario_canje_id = u.id
            LEFT JOIN acuerdos_comerciales a ON c.acuerdo_id = a.id
            ${whereClause}
        `;
        const resCount = await pool.query(countQuery, params);

        const totalItems = parseInt(resCount.rows[0].count);
        const totalPaginas = Math.ceil(totalItems / (parseInt(limit) || 20));

        res.json({
            data: resData.rows,
            pagination: {
                total: totalItems,
                paginaActual: parseInt(page) || 1,
                totalPaginas: totalPaginas
            }
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error al obtener historial" });
    }
};

// 15. 🔥 GENERAR CÓDIGOS AUTOMÁTICOS (VERSIÓN BLINDADA CON LÍMITE DE ACUERDO)
exports.generarCodigosAutomaticos = async (req, res) => {
    const { acuerdo_id, cantidad, prefijo } = req.body;
    
    // 🛡️ VALIDACIÓN INICIAL DE DATOS
    if (!acuerdo_id || !cantidad || cantidad <= 0) {
        return res.status(400).json({ error: "Datos inválidos (Falta acuerdo o cantidad)." });
    }
    
    const PREFIJO = (prefijo || "GEN").toUpperCase().trim();
    const CANTIDAD_A_GENERAR = parseInt(cantidad);
    
    // Límite de seguridad para evitar sobrecarga del servidor en una sola petición
    if (CANTIDAD_A_GENERAR > 5000) {
        return res.status(400).json({ error: "El límite máximo por lote es de 5,000 códigos." });
    }

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 🛡️ BLINDAJE LÓGICO INTEGRADO: 
        // Obtenemos el límite del acuerdo y el conteo actual de códigos (manuales + auto) en una sola consulta
        // Usamos FOR SHARE para evitar que se modifique el acuerdo mientras contamos
        const resValidacion = await client.query(`
            SELECT 
                a.cantidad_entradas, 
                a.producto_asociado_id, 
                a.canal_id,
                (SELECT COUNT(*) FROM codigos_externos WHERE acuerdo_id = a.id) as ya_cargados
            FROM acuerdos_comerciales a
            WHERE a.id = $1
            FOR SHARE
        `, [acuerdo_id]);

        if (resValidacion.rows.length === 0) {
            throw new Error("El acuerdo comercial especificado no existe.");
        }

        const { cantidad_entradas, producto_asociado_id, canal_id, ya_cargados } = resValidacion.rows[0];
        const limiteAcuerdo = parseInt(cantidad_entradas);
        const conteoActual = parseInt(ya_cargados);
        const espacioDisponible = limiteAcuerdo - conteoActual;

        // 🚨 BLOQUEO DE SEGURIDAD: Validar si la nueva cantidad excede el cupo total del acuerdo
        if (CANTIDAD_A_GENERAR > espacioDisponible) {
            throw new Error(`Límite excedido. El acuerdo permite ${limiteAcuerdo} códigos. Actualmente ya existen ${conteoActual} registrados. Solo puede generar ${espacioDisponible} adicionales.`);
        }

        // 2. Generar Array de Códigos en Memoria con Garantía de Unicidad
        const codigosGenerados = new Set();
        
        while (codigosGenerados.size < CANTIDAD_A_GENERAR) {
            // Estructura: PREFIJO-XXXX-YYYY (Ej: BCP-A7X2-9M1P)
            const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase() + "-" + 
                               Math.random().toString(36).substring(2, 6).toUpperCase();
            const codigoFinal = `${PREFIJO}-${randomPart}`;
            codigosGenerados.add(codigoFinal);
        }

        // 3. Inserción Masiva Protegida
        let insertados = 0;
        
        for (const codigo of codigosGenerados) {
            // ON CONFLICT asegura que si por azar extremo se repite un código, no rompa la transacción
            const resInsert = await client.query(
                `INSERT INTO codigos_externos (canal_id, acuerdo_id, codigo_unico, producto_asociado_id, estado)
                 VALUES ($1, $2, $3, $4, 'DISPONIBLE') 
                 ON CONFLICT (codigo_unico) DO NOTHING RETURNING id`,
                [canal_id, acuerdo_id, codigo, producto_asociado_id]
            );
            
            if (resInsert.rows.length > 0) insertados++;
        }

        await client.query('COMMIT');
        
        res.json({ 
            msg: "Generación completada exitosamente.", 
            solicitados: CANTIDAD_A_GENERAR, 
            generados_reales: insertados,
            total_actual_acuerdo: conteoActual + insertados,
            limite_acuerdo: limiteAcuerdo
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error en generarCodigosAutomaticos:", err.message);
        res.status(500).json({ error: err.message || "Error interno al generar códigos." });
    } finally {
        client.release();
    }
};

