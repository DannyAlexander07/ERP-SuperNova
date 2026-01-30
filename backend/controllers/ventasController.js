// Ubicación: SuperNova/backend/controllers/ventasController.js
const pool = require('../db');
const facturacionController = require('./facturacionController'); // 🔥 IMPORTANTE

// 1. REGISTRAR VENTA (CON FACTURACIÓN ELECTRÓNICA Y PROTECCIÓN CONTRA COLAPSOS)
exports.registrarVenta = async (req, res) => {
    // 1. DESESTRUCTURACIÓN
    const { 
        clienteDni, metodoPago, carrito, vendedor_id, tipo_venta, 
        observaciones, descuento_factor,
        tipo_comprobante, cliente_razon_social, cliente_direccion, tipo_tarjeta
    } = req.body;

    const usuarioId = req.usuario.id;
    const sedeId = req.usuario.sede_id;

    // Validación previa fuera de la transacción para ahorrar recursos
    if (!carrito || !Array.isArray(carrito) || carrito.length === 0) {
        return res.status(400).json({ msg: "El carrito de compras está vacío." });
    }

    const client = await pool.connect();

    try {
        const factor = parseFloat(descuento_factor) || 0; 
        if (factor < 0 || factor > 1) throw new Error("El porcentaje de descuento no es válido.");

        const vendedorFinal = vendedor_id ? vendedor_id : usuarioId;

        // INICIO DE TRANSACCIÓN ATÓMICA
        await client.query('BEGIN');

        // A. BLOQUEO PREVENTIVO (Anti-Deadlock): Ordenar IDs de menor a mayor
        const carritoOrdenado = [...carrito].sort((a, b) => a.id - b.id);

        // B. OBTENER DATOS DE SEDE Y BLOQUEAR (Para evitar el error de MAX FOR UPDATE)
        // Bloqueamos la fila de la sede para que otros cajeros esperen su turno de número de ticket
        const sedeRes = await client.query('SELECT prefijo_ticket FROM sedes WHERE id = $1 FOR UPDATE', [sedeId]);
        const prefijo = sedeRes.rows[0]?.prefijo_ticket || 'GEN';

        // C. CALCULAR CORRELATIVO TICKET (Ahora es seguro sin FOR UPDATE aquí porque la sede ya está bloqueada)
        const maxTicketRes = await client.query(
            'SELECT COALESCE(MAX(numero_ticket_sede), 0) as max_num FROM ventas WHERE sede_id = $1',
            [sedeId]
        );
        const nuevoNumeroTicket = parseInt(maxTicketRes.rows[0].max_num) + 1;
        const codigoTicketVisual = `${prefijo}-${nuevoNumeroTicket.toString().padStart(4, '0')}`;

        // D. PROCESAR TOTALES E ITEMS
        let totalCalculado = 0;
        let detalleInsertar = [];

        for (const item of carritoOrdenado) {
            // FOR SHARE asegura que nadie cambie el precio mientras procesamos, pero permite lecturas
            const prodRes = await client.query(
                'SELECT id, precio_venta, costo_compra, nombre, linea_negocio FROM productos WHERE id = $1 FOR SHARE', 
                [item.id]
            );
            
            if (prodRes.rows.length === 0) throw new Error(`Producto ID ${item.id} no encontrado.`);
            const prod = prodRes.rows[0];

            const precioConDescuento = Number((prod.precio_venta * (1 - factor)).toFixed(2));
            const subtotal = Number((precioConDescuento * item.cantidad).toFixed(2));
            totalCalculado += subtotal;

            detalleInsertar.push({
                ...item,
                nombre: prod.nombre,
                precioReal: precioConDescuento,
                costoReal: prod.costo_compra,
                lineaProd: prod.linea_negocio,
                subtotal
            });
        }

        // Redondeo final de seguridad para evitar céntimos fantasma
        totalCalculado = Math.round(totalCalculado * 100) / 100;
        const subtotalFactura = totalCalculado / 1.18;
        const igvFactura = totalCalculado - subtotalFactura;
        const lineaPrincipal = detalleInsertar[0]?.lineaProd || 'GENERAL';

        let obsFinal = observaciones || '';
        if (factor > 0) obsFinal = `[Descuento: ${(factor * 100).toFixed(0)}%] ${obsFinal}`;

        // E. INSERTAR VENTA (Estado Inicial PENDIENTE)
        const ventaRes = await client.query(
            `INSERT INTO ventas
            (sede_id, usuario_id, vendedor_id, doc_cliente_temporal, metodo_pago, total_venta, subtotal, igv, linea_negocio, numero_ticket_sede, tipo_venta, observaciones,
             tipo_comprobante, cliente_razon_social, cliente_direccion, tipo_tarjeta, sunat_estado) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, 'PENDIENTE') 
             RETURNING id`,
            [
                sedeId, usuarioId, vendedorFinal, clienteDni || 'PUBLICO', metodoPago, totalCalculado, subtotalFactura, igvFactura, lineaPrincipal, nuevoNumeroTicket, tipo_venta || 'Unitaria', obsFinal,
                tipo_comprobante || 'Boleta', cliente_razon_social || null, cliente_direccion || null, tipo_tarjeta || null
            ]
        );
        const ventaId = ventaRes.rows[0].id;

        // F. GUARDAR DETALLES Y PROCESAR STOCK (PEPS)
        for (const item of detalleInsertar) {
            await client.query(
                `INSERT INTO detalle_ventas (venta_id, producto_id, nombre_producto_historico, cantidad, precio_unitario, subtotal, costo_historico)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [ventaId, item.id, item.nombre, item.cantidad, item.precioReal, item.subtotal, item.costoReal]
            );

            // Gestión de Combos / Recetas
            const esCombo = await client.query('SELECT producto_hijo_id, cantidad FROM productos_combo WHERE producto_padre_id = $1', [item.id]);
            
            if (esCombo.rows.length > 0) {
                for (const hijo of esCombo.rows) {
                    await descontarStock(client, hijo.producto_hijo_id, sedeId, item.cantidad * hijo.cantidad, usuarioId, codigoTicketVisual, `Ingrediente de: ${item.nombre}`, 0);
                }
                await descontarStock(client, item.id, sedeId, item.cantidad, usuarioId, codigoTicketVisual, 'Venta Combo', item.precioReal);
            } else {
                await descontarStock(client, item.id, sedeId, item.cantidad, usuarioId, codigoTicketVisual, 'Venta Directa', item.precioReal);
            }
        }

        // G. MOVIMIENTO DE CAJA
        if (totalCalculado > 0) {
            await client.query(
                `INSERT INTO movimientos_caja (sede_id, usuario_id, tipo_movimiento, categoria, descripcion, monto, metodo_pago, venta_id)
                 VALUES ($1, $2, 'INGRESO', 'VENTA_POS', 'Ticket ' || $3, $4, $5, $6)`,
                [sedeId, usuarioId, codigoTicketVisual, totalCalculado, metodoPago, ventaId]
            );
        }

        // FIN DE TRANSACCIÓN EN DB
        await client.query('COMMIT');

        // H. PROCESO DE FACTURACIÓN (ASÍNCRONO REAL)
        setImmediate(() => {
            facturacionController.emitirComprobante(
                { body: { venta_id: ventaId }, usuario: req.usuario }, 
                { 
                    json: (d) => console.log(`[ASYNC-FACT] Éxito Venta ${ventaId}`),
                    status: (c) => ({ json: (e) => console.error(`[ASYNC-FACT] Error Venta ${ventaId}:`, e) })
                }
            );
        });
        
        // RESPUESTA FINAL AL FRONTEND
        res.json({ 
            msg: 'Venta Procesada Correctamente', 
            ventaId, 
            ticketCodigo: codigoTicketVisual, 
            total: totalCalculado 
        });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ Error en registrarVenta:", err.message);
        res.status(400).json({ msg: err.message });
    } finally {
        if (client) client.release();
    }
};

// 2. OBTENER HISTORIAL (CORREGIDO: DIFERENCIA EVENTOS VS POS)
exports.obtenerHistorialVentas = async (req, res) => {
    try {
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        const esSuperAdmin = rol === 'superadmin' || rol === 'gerente';
        const usuarioSedeId = req.usuario.sede_id;
        const filtroSedeId = req.query.sede;

        let sedeFiltro = esSuperAdmin ? (filtroSedeId || null) : usuarioSedeId;
        
        const params = [];
        let sedeCondition = "";
        
        if (sedeFiltro) {
            sedeCondition = "AND v.sede_id = $1"; 
            params.push(sedeFiltro);
        }

        const query = `
            WITH HistorialUnificado AS (
                -- A. VENTAS DEL POS Y CRM
                SELECT 
                    v.id, v.fecha_venta, v.total_venta, v.metodo_pago, 
                    COALESCE(s.prefijo_ticket || '-' || LPAD(v.numero_ticket_sede::text, 4, '0'), 'TICKET-' || v.id) as codigo_visual,
                    v.tipo_venta, v.observaciones, v.tipo_comprobante, v.tipo_tarjeta,
                    -- CAMPOS SUNAT --
                    v.sunat_estado, v.serie, v.correlativo, v.enlace_pdf, v.enlace_xml, v.enlace_cdr,
                    ------------------
                    s.nombre AS nombre_sede, 
                    u.nombres AS nombre_usuario,
                    vend.nombres || ' ' || COALESCE(vend.apellidos, '') AS nombre_vendedor,
                    
                    COALESCE(c.nombre_completo, v.nombre_cliente_temporal, 'Consumidor Final') AS nombre_cliente_temporal,
                    v.doc_cliente_temporal, 
                    
                    -- 🔥 CAMBIO CLAVE: YA NO PONEMOS 'VENTA_POS' FIJO, SINO EL REAL PARA DETECTAR EVENTOS
                    COALESCE(v.origen, 'VENTA_POS') as origen,
                    v.linea_negocio -- 🔥 NECESARIO PARA BLOQUEAR EL BOTÓN BORRAR SI ES 'EVENTOS'
                FROM ventas v
                JOIN usuarios u ON v.usuario_id = u.id          
                LEFT JOIN usuarios vend ON v.vendedor_id = vend.id 
                JOIN sedes s ON v.sede_id = s.id
                LEFT JOIN clientes c ON v.cliente_id = c.id 
                WHERE 1=1 ${sedeCondition}

                UNION ALL

                -- B. COBROS B2B
                SELECT 
                    mc.id + 900000, mc.fecha_registro, mc.monto, mc.metodo_pago,
                    'B2B-' || mc.id, 'Cobro Terceros', mc.descripcion, 'Recibo Interno', NULL,
                    'NO_APLICA', NULL, NULL, NULL, NULL, NULL,
                    s.nombre, u.nombres, 'Acuerdo Comercial', 'CORPORATIVO', 'Cliente Corporativo', 
                    'COBRO_CAJA', 'OTROS' -- origen y linea_negocio dummy
                FROM movimientos_caja mc
                JOIN usuarios u ON mc.usuario_id = u.id
                JOIN sedes s ON mc.sede_id = s.id
                WHERE mc.tipo_movimiento = 'INGRESO' AND mc.categoria = 'Ingresos Varios (Caja)' 
                ${sedeFiltro ? "AND mc.sede_id = $1" : ""}
            )
            SELECT * FROM HistorialUnificado ORDER BY fecha_venta DESC LIMIT 100
        `;

        const result = await pool.query(query, params);
        
        const ventasFormateadas = result.rows.map(v => ({
            ...v,
            nombre_cajero: v.nombre_usuario,
            // Aseguramos que el nombre del cliente se vea bien en el frontend
            nombre_cliente: v.nombre_cliente_temporal 
        }));

        res.json(ventasFormateadas);

    } catch (err) {
        console.error("Error historial:", err.message);
        res.status(500).send('Error al cargar historial.');
    }
};

// 3. OBTENER DETALLE (ENRIQUECIDO CON SEDE Y SALA)
exports.obtenerDetalleVenta = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        // A. Obtener datos cabecera para saber si es evento
        const ventaRes = await client.query('SELECT cliente_id, linea_negocio FROM ventas WHERE id = $1', [id]);
        
        if (ventaRes.rows.length === 0) {
            return res.json([]);
        }
        const venta = ventaRes.rows[0];

        // B. Obtener los productos (ítems normales)
        const itemsRes = await client.query(
            `SELECT nombre_producto_historico, cantidad, precio_unitario, subtotal 
             FROM detalle_ventas WHERE venta_id = $1 ORDER BY id ASC`, 
            [id]
        );
        let items = itemsRes.rows;

        // C. 🔥 SI ES EVENTO: BUSCAR DATOS COMPLETOS (INCLUYENDO NOMBRE DE SEDE)
        if (venta.linea_negocio === 'EVENTOS' && venta.cliente_id) {
            
            const eventoRes = await client.query(
                `SELECT 
                    e.fecha_inicio, 
                    e.fecha_fin, 
                    e.salon, 
                    c.nombre_hijo,
                    s.nombre as nombre_sede  -- <--- 🔥 TRAEMOS EL NOMBRE DE LA SEDE
                 FROM eventos e
                 JOIN clientes c ON e.cliente_id = c.id
                 LEFT JOIN sedes s ON e.sede_id = s.id  -- <--- 🔥 HACEMOS EL JOIN
                 WHERE e.cliente_id = $1 AND e.estado != 'cancelado'
                 ORDER BY e.id DESC LIMIT 1`,
                [venta.cliente_id]
            );

            if (eventoRes.rows.length > 0) {
                const evt = eventoRes.rows[0];

                // Formateamos bonito la fecha y hora
                const opcionesFecha = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
                const fecha = new Date(evt.fecha_inicio).toLocaleDateString('es-PE', opcionesFecha);
                
                const horaInicio = new Date(evt.fecha_inicio).toLocaleTimeString('es-PE', {hour: '2-digit', minute:'2-digit'});
                const horaFin = new Date(evt.fecha_fin).toLocaleTimeString('es-PE', {hour: '2-digit', minute:'2-digit'});

                // 🔥 HTML INYECTADO ACTUALIZADO
                const infoExtra = `
                    <div style="margin-top:6px; font-size:11px; color:#64748b; line-height:1.4; background:#f8fafc; padding:6px; border-radius:6px; border:1px dashed #cbd5e1;">
                        <div style="font-weight:bold; color:#475569;">🎂 Cumpleañero: <span style="color:#000;">${evt.nombre_hijo}</span></div>
                        <div>📅 Fecha: ${fecha}</div>
                        <div>⏰ Hora: ${horaInicio} a ${horaFin}</div>
                        <div>📍 Sede: <strong>${evt.nombre_sede || 'Sede Central'}</strong> - ${evt.salon || 'Sala General'}</div>
                    </div>
                `;

                // Agregamos esta info al primer ítem de la lista
                if (items.length > 0) {
                    items[0].nombre_producto_historico += infoExtra;
                }
            }
        }

        res.json(items); 

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error al cargar detalle.' });
    } finally {
        client.release();
    }
};

// 4. ANULAR VENTA (INTELIGENTE: Detecta eventos y repone stock masivo)
exports.eliminarVenta = async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuario.id;
    
    // Normalización de Roles
    const rolRaw = req.usuario.rol || '';
    const rolUsuario = rolRaw.toLowerCase().trim();
    // Solo estos roles pueden anular
    const rolesPermitidos = ['superadmin', 'admin', 'administrador', 'super admin', 'gerente'];

    const client = await pool.connect();
    try {
        if (!rolesPermitidos.includes(rolUsuario)) {
            throw new Error('⛔ ACCESO DENEGADO: Permisos insuficientes.');
        }

        await client.query('BEGIN');
        
        // 3. Verificar venta
        const ventaRes = await client.query('SELECT * FROM ventas WHERE id = $1', [id]);
        if (ventaRes.rows.length === 0) throw new Error('Venta no encontrada.');
        const venta = ventaRes.rows[0];

        // 4. RECUPERAR STOCK INTELIGENTE
        const detallesRes = await client.query('SELECT producto_id, cantidad FROM detalle_ventas WHERE venta_id = $1', [id]);
        
        for (const item of detallesRes.rows) {
            let cantidadAReponer = parseInt(item.cantidad) || 0; // Forzamos a que sea un número

            // 🔥 CORRECCIÓN: Si es una venta de EVENTO, la cantidad real no está en el detalle, sino en el Lead.
            if (venta.linea_negocio === 'EVENTOS' && venta.cliente_id) {
                const leadRes = await client.query(
                    `SELECT cantidad_ninos FROM leads WHERE cliente_asociado_id = $1 ORDER BY id DESC LIMIT 1`,
                    [venta.cliente_id]
                );
                
                // Si encontramos un lead asociado con cantidad de niños, esa es la cantidad real a reponer.
                if (leadRes.rows.length > 0 && leadRes.rows[0].cantidad_ninos) {
                    const cantidadNinos = parseInt(leadRes.rows[0].cantidad_ninos);
                    if (!isNaN(cantidadNinos) && cantidadNinos > 0) {
                        cantidadAReponer = cantidadNinos;
                    }
                }
            }

            if (!item.producto_id) continue; // Si no hay producto, no se puede reponer stock

            // Verificamos si es combo (Receta)
            const esCombo = await client.query('SELECT producto_hijo_id, cantidad FROM productos_combo WHERE producto_padre_id = $1', [item.producto_id]);
            
            if (esCombo.rows.length > 0) {
                // A. Reponer Ingredientes (Multiplicado por la cantidad real)
                for (const hijo of esCombo.rows) {
                    const totalInsumo = parseInt(hijo.cantidad) * cantidadAReponer;
                    await reponerStock(client, hijo.producto_hijo_id, venta.sede_id, totalInsumo, usuarioId, id, `Anulación Evento (Ingrediente)`);
                }
                
                // B. Reponer Combo Principal (Si aplica y controla stock)
                await reponerStock(client, item.producto_id, venta.sede_id, cantidadAReponer, usuarioId, id, `Anulación Evento (Combo)`);
            } else {
                // Producto Normal (Ej: Pulsera suelta) - Repone la cantidad real
                await reponerStock(client, item.producto_id, venta.sede_id, cantidadAReponer, usuarioId, id, `Anulación Venta Directa`);
            }
        }

        // 5. Eliminar Registros Financieros
        await client.query('DELETE FROM movimientos_caja WHERE venta_id = $1', [id]);
        await client.query('DELETE FROM detalle_ventas WHERE venta_id = $1', [id]);
        await client.query('DELETE FROM ventas WHERE id = $1', [id]);
        
        // Opcional: Reabrir el evento en el CRM
        if (venta.origen === 'CRM_SALDO' && venta.cliente_id) {
             // Restauramos el evento a "confirmado" para que se pueda volver a cobrar bien
             // Usamos costo_total si total_venta no existe en la tabla eventos
             await client.query(`UPDATE eventos SET estado = 'confirmado', saldo = costo_total WHERE cliente_id = $1 AND estado = 'finalizado'`, [venta.cliente_id]);
             await client.query(`UPDATE leads SET estado = 'seguimiento' WHERE cliente_asociado_id = $1`, [venta.cliente_id]);
        }

        await client.query('COMMIT');
        res.json({ msg: `Venta anulada y stock devuelto correctamente.` });

    } catch (err) {
        await client.query('ROLLBACK');
        const status = err.message.includes('ACCESO DENEGADO') ? 403 : 400;
        res.status(status).json({ msg: err.message });
    } finally {
        client.release();
    }
};

// 5. OBTENER LISTA DE VENDEDORES (Para el Select)
exports.obtenerVendedores = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id, nombres, apellidos, rol 
            FROM usuarios 
            WHERE UPPER(estado) = 'ACTIVO' 
            ORDER BY nombres ASC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener vendedores:", err.message);
        res.status(500).send('Error del servidor');
    }
};

// 🔥 Nuevo parámetro agregado al final: precioVenta
async function descontarStock(client, prodId, sedeId, cantidad, usuarioId, ticketCodigo, motivo, precioVenta = 0) {
    // 1. Validar producto
    const prod = await client.query('SELECT controla_stock, tipo_item, nombre FROM productos WHERE id = $1', [prodId]);
    if (prod.rows.length === 0) return;
    const { controla_stock, tipo_item, nombre } = prod.rows[0];

    if (tipo_item === 'servicio' || !controla_stock) return;

    // 2. Verificar Stock Total
    const stockRes = await client.query('SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE', [prodId, sedeId]);
    const stockActual = stockRes.rows.length > 0 ? parseInt(stockRes.rows[0].cantidad) : 0;

    if (stockActual < cantidad) {
        throw new Error(`Stock insuficiente para: ${nombre} (Quedan: ${stockActual})`);
    }

    // 3. 🔥 ALGORITMO PEPS: Consumir Lotes (Del más viejo al más nuevo)
    let cantidadRestante = cantidad;
    let stockParaKardex = stockActual; // Variable temporal para calcular el stock restante línea por línea

    // Buscamos lotes activos ordenados por fecha
    const lotesRes = await client.query(
        `SELECT id, cantidad_actual, costo_unitario FROM inventario_lotes 
         WHERE producto_id = $1 AND sede_id = $2 AND cantidad_actual > 0 
         ORDER BY fecha_ingreso ASC FOR UPDATE`,
        [prodId, sedeId]
    );

    // Caso especial: Si hay stock físico pero no lotes (migración antigua)
    if (lotesRes.rows.length === 0 && stockActual > 0) {
        // Descontamos del total sin tocar lotes
        await client.query('UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3', [cantidad, prodId, sedeId]);
        
        // 🔥 Guardamos el precio histórico aquí también
        await client.query(
            `INSERT INTO movimientos_inventario 
            (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento, precio_venta_historico)
             VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, 0, $7)`, 
            [sedeId, prodId, usuarioId, -cantidad, (stockActual - cantidad), `Venta ${ticketCodigo} (Sin Lote)`, precioVenta]
        );
        return;
    }

    // ITERAMOS LOS LOTES
    for (const lote of lotesRes.rows) {
        if (cantidadRestante <= 0) break;

        // Cuánto sacamos de ESTE lote específico
        const aSacar = Math.min(cantidadRestante, lote.cantidad_actual);
        const costoDeEsteLote = parseFloat(lote.costo_unitario);

        // A. Actualizar Lote en BD
        await client.query(
            `UPDATE inventario_lotes 
             SET cantidad_actual = cantidad_actual - $1,
                 estado = CASE WHEN cantidad_actual - $1 = 0 THEN 'AGOTADO' ELSE estado END
             WHERE id = $2`,
            [aSacar, lote.id]
        );

        // B. 🔥 REGISTRAR EN KARDEX POR CADA LOTE
        stockParaKardex -= aSacar;

        await client.query(
            `INSERT INTO movimientos_inventario 
            (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento, precio_venta_historico)
             VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7, $8)`, 
            [
                sedeId, 
                prodId, 
                usuarioId, 
                -aSacar, 
                stockParaKardex, 
                `Venta ${ticketCodigo} (${motivo}) - Lote ${lote.id}`, 
                costoDeEsteLote, 
                precioVenta // 🔥 AQUÍ SE GUARDA EL PRECIO PARA SIEMPRE
            ]
        );

        cantidadRestante -= aSacar;
    }

    // 4. Finalmente actualizamos el Stock Total (Resumen)
    await client.query('UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3', [cantidad, prodId, sedeId]);
}

async function reponerStock(client, prodId, sedeId, cantidad, usuarioId, ticketId, motivo) {
    const prod = await client.query('SELECT controla_stock, costo_compra FROM productos WHERE id = $1', [prodId]);
    if (!prod.rows[0]?.controla_stock) return;

    const stockRes = await client.query('SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE', [prodId, sedeId]);
    let stockActual = stockRes.rows.length > 0 ? stockRes.rows[0].cantidad : 0;
    if (stockRes.rows.length === 0) await client.query(`INSERT INTO inventario_sedes (sede_id, producto_id, cantidad) VALUES ($1, $2, 0)`, [sedeId, prodId]);

    await client.query('UPDATE inventario_sedes SET cantidad = cantidad + $1 WHERE producto_id = $2 AND sede_id = $3', [cantidad, prodId, sedeId]);
    
    await client.query(
        `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
         VALUES ($1, $2, $3, 'entrada_anulacion', $4, $5, $6, $7)`,
        [sedeId, prodId, usuarioId, cantidad, (stockActual + cantidad), `Anulación #${ticketId}`, parseFloat(prod.rows[0].costo_compra) || 0]
    );
}
