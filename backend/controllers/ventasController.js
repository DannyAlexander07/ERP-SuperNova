// Ubicación: SuperNova/backend/controllers/ventasController.js
const pool = require('../db');
const facturacionController = require('./facturacionController'); // 🔥 IMPORTANTE
// REEMPLAZAR LA FUNCIÓN registrarVenta EXISTENTE POR ESTA:

// 1. REGISTRAR VENTA (CON FACTURACIÓN ELECTRÓNICA)
exports.registrarVenta = async (req, res) => {
    // 1. DESESTRUCTURACIÓN CON CAMPOS NUBEFACT
    const { 
        clienteDni, metodoPago, carrito, vendedor_id, tipo_venta, 
        observaciones, descuento_factor,
        tipo_comprobante, cliente_razon_social, cliente_direccion, tipo_tarjeta
    } = req.body;

    const usuarioId = req.usuario.id;
    const sedeId = req.usuario.sede_id;

    const client = await pool.connect();

    try {
        if (!carrito || !Array.isArray(carrito) || carrito.length === 0) {
            throw new Error("El carrito de compras está vacío o tiene un formato incorrecto.");
        }

        const factor = parseFloat(descuento_factor) || 0; 
        if (factor < 0 || factor > 1) throw new Error("El porcentaje de descuento no es válido.");

        const vendedorFinal = vendedor_id ? vendedor_id : usuarioId;

        await client.query('BEGIN');

        // A. OBTENER PREFIJO SEDE
        const sedeRes = await client.query('SELECT prefijo_ticket FROM sedes WHERE id = $1', [sedeId]);
        const prefijo = sedeRes.rows[0]?.prefijo_ticket || 'GEN';

        // B. CALCULAR CORRELATIVO TICKET INTERNO
        const maxTicketRes = await client.query(
            'SELECT COALESCE(MAX(numero_ticket_sede), 0) as max_num FROM ventas WHERE sede_id = $1',
            [sedeId]
        );
        const nuevoNumeroTicket = parseInt(maxTicketRes.rows[0].max_num) + 1;
        const codigoTicketVisual = `${prefijo}-${nuevoNumeroTicket.toString().padStart(4, '0')}`;

        // C. PROCESAR TOTALES
        let totalCalculado = 0;
        let detalleInsertar = [];

        for (const item of carrito) {
            const prodRes = await client.query('SELECT id, precio_venta, costo_compra, nombre, linea_negocio FROM productos WHERE id = $1', [item.id]);
            if (prodRes.rows.length === 0) throw new Error(`Producto ID ${item.id} no encontrado.`);
            const prod = prodRes.rows[0];

            const precioConDescuento = prod.precio_venta * (1 - factor);
            const subtotal = precioConDescuento * item.cantidad;
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

        totalCalculado = Math.round(totalCalculado * 100) / 100;
        const subtotalFactura = totalCalculado / 1.18;
        const igvFactura = totalCalculado - subtotalFactura;
        const lineaPrincipal = detalleInsertar[0].lineaProd || 'GENERAL';

        let obsFinal = observaciones || '';
        if (factor > 0) obsFinal = `[Descuento: ${(factor * 100).toFixed(0)}%] ${obsFinal}`;

        // D. INSERTAR VENTA (Guardamos como PENDIENTE)
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

        // E. GUARDAR DETALLES Y STOCK
        for (const item of detalleInsertar) {
            await client.query(
                `INSERT INTO detalle_ventas (venta_id, producto_id, nombre_producto_historico, cantidad, precio_unitario, subtotal, costo_historico)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [ventaId, item.id, item.nombre, item.cantidad, item.precioReal, item.subtotal, item.costoReal]
            );

            // Combos
            const esCombo = await client.query('SELECT producto_hijo_id, cantidad FROM productos_combo WHERE producto_padre_id = $1', [item.id]);
            if (esCombo.rows.length > 0) {
                for (const hijo of esCombo.rows) {
                    await descontarStock(client, hijo.producto_hijo_id, sedeId, item.cantidad * hijo.cantidad, usuarioId, codigoTicketVisual, `Ingrediente: ${item.nombre}`);
                }
                await descontarStock(client, item.id, sedeId, item.cantidad, usuarioId, codigoTicketVisual, 'Venta Combo');
            } else {
                await descontarStock(client, item.id, sedeId, item.cantidad, usuarioId, codigoTicketVisual, 'Venta Directa');
            }
        }

        // F. CAJA
        if (totalCalculado > 0) {
            await client.query(
                `INSERT INTO movimientos_caja (sede_id, usuario_id, tipo_movimiento, categoria, descripcion, monto, metodo_pago, venta_id)
                 VALUES ($1, $2, 'INGRESO', 'VENTA_POS', 'Ticket ' || $3, $4, $5, $6)`,
                [sedeId, usuarioId, codigoTicketVisual, totalCalculado, metodoPago, ventaId]
            );
        }

        await client.query('COMMIT');

        // 🔥 LLAMADA ASÍNCRONA AL FACTURADOR (NO AWAIT)
        // Esto dispara el proceso en paralelo sin bloquear la respuesta al usuario.
        facturacionController.emitirComprobante({ body: { venta_id: ventaId } }, {
            json: (data) => console.log("✅ Facturación completada (Async):", data),
            status: (code) => ({ json: (err) => console.error("❌ Error Facturación (Async):", err) })
        });
        
        res.json({ 
            msg: 'Venta Procesada Correctamente', 
            ventaId, 
            ticketCodigo: codigoTicketVisual, 
            total: totalCalculado 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error en registrarVenta:", err.message);
        res.status(400).json({ msg: err.message });
    } finally {
        client.release();
    }
};

// 2. OBTENER HISTORIAL (CORREGIDO: MUESTRA CLIENTE REAL DEL CRM)
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
                    
                    -- 🔥 CORRECCIÓN: PRIORIDAD AL CLIENTE REGISTRADO (CRM)
                    COALESCE(c.nombre_completo, v.nombre_cliente_temporal, 'Consumidor Final') AS nombre_cliente_temporal,
                    v.doc_cliente_temporal, 
                    
                    'VENTA_POS' as origen
                FROM ventas v
                JOIN usuarios u ON v.usuario_id = u.id          
                LEFT JOIN usuarios vend ON v.vendedor_id = vend.id 
                JOIN sedes s ON v.sede_id = s.id
                LEFT JOIN clientes c ON v.cliente_id = c.id  -- <--- ESTO FALTABA
                WHERE 1=1 ${sedeCondition}

                UNION ALL

                -- B. COBROS B2B
                SELECT 
                    mc.id + 900000, mc.fecha_registro, mc.monto, mc.metodo_pago,
                    'B2B-' || mc.id, 'Cobro Terceros', mc.descripcion, 'Recibo Interno', NULL,
                    'NO_APLICA', NULL, NULL, NULL, NULL, NULL,
                    s.nombre, u.nombres, 'Acuerdo Comercial', 'CORPORATIVO', 'Cliente Corporativo', 'COBRO_CAJA'
                FROM movimientos_caja mc
                JOIN usuarios u ON mc.usuario_id = u.id
                JOIN sedes s ON mc.sede_id = s.id
                WHERE mc.tipo_movimiento = 'INGRESO' AND mc.categoria = 'Ingresos Varios (Caja)' 
                ${sedeFiltro ? "AND mc.sede_id = $1" : ""}
            )
            SELECT * FROM HistorialUnificado ORDER BY fecha_venta DESC LIMIT 100
        `;

        const result = await pool.query(query, params);
        
        // Mapeo simple
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

// 4. ANULAR VENTA (SEGURIDAD TOTAL BASADA EN TU BASE DE DATOS REAL)
exports.eliminarVenta = async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuario.id;
    
    // 1. NORMALIZACIÓN DE ROL
    // Convierte "Super Admin" -> "super admin" y "ADMIN" -> "admin"
    const rolRaw = req.usuario.rol || '';
    const rolUsuario = rolRaw.toLowerCase().trim();
    
    // 🔒 LISTA BLANCA DE PERMISOS (VIP)
    // Solo estos roles exactos pueden anular.
    const rolesPermitidos = [
        'superadmin',   // (Alexander) - Visto en tu BD
        'admin',        // (Danny, Cristian) - Visto en tu BD
        'administrador',// (Por si el sistema cambia y guarda el nombre completo)
        'super admin',  // (Por si acaso se guarda con espacio)
        'gerente'       // (Futuro rol de alto nivel)
    ];

    const client = await pool.connect();
    try {
        // 2. BLOQUEO DE SEGURIDAD
        // Si entra Pedro (colaborador) o alguien de Logística, el sistema los expulsa aquí.
        if (!rolesPermitidos.includes(rolUsuario)) {
            console.log(`⛔ Bloqueo: Usuario ${req.usuario.nombres} (${rolUsuario}) intentó anular venta #${id}`);
            throw new Error('⛔ ACCESO DENEGADO: Tu perfil no tiene permisos para anular ventas. Contacta a un Admin.');
        }

        await client.query('BEGIN');
        
        // 3. Verificar venta y sede
        const ventaRes = await client.query('SELECT * FROM ventas WHERE id = $1', [id]);
        if (ventaRes.rows.length === 0) throw new Error('Venta no encontrada.');
        const venta = ventaRes.rows[0];

        // 4. RECUPERAR STOCK (Lógica de Combos corregida)
        const detallesRes = await client.query('SELECT producto_id, cantidad, nombre_producto_historico FROM detalle_ventas WHERE venta_id = $1', [id]);
        
        for (const item of detallesRes.rows) {
            // Verificamos si es combo
            const esCombo = await client.query('SELECT producto_hijo_id, cantidad FROM productos_combo WHERE producto_padre_id = $1', [item.producto_id]);
            
            if (esCombo.rows.length > 0) {
                // A. Reponer Ingredientes
                for (const hijo of esCombo.rows) {
                    await reponerStock(client, hijo.producto_hijo_id, venta.sede_id, item.cantidad * hijo.cantidad, usuarioId, id, `Anulación Ingrediente Combo`);
                }
                // 🔥 B. Reponer Combo Principal
                await reponerStock(client, item.producto_id, venta.sede_id, item.cantidad, usuarioId, id, `Anulación Venta (Combo)`);
            } else {
                // Producto Normal
                await reponerStock(client, item.producto_id, venta.sede_id, item.cantidad, usuarioId, id, `Anulación Venta`);
            }
        }

        // 5. Eliminar Registros
        await client.query('DELETE FROM movimientos_caja WHERE venta_id = $1', [id]);
        await client.query('DELETE FROM detalle_ventas WHERE venta_id = $1', [id]);
        await client.query('DELETE FROM ventas WHERE id = $1', [id]);
        
        await client.query('COMMIT');
        
        console.log(`⚠️ ALERTA: Venta #${id} ANULADA por ${rolUsuario} (ID: ${usuarioId})`);
        res.json({ msg: `Venta anulada correctamente.` });

    } catch (err) {
        await client.query('ROLLBACK');
        // Si el error es de permisos, retornamos 403 (Prohibido)
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

// --- FUNCIONES AUXILIARES (STOCK) ---
async function descontarStock(client, prodId, sedeId, cantidad, usuarioId, ticketCodigo, motivo) {
    // Obtenemos datos del producto
    const prod = await client.query('SELECT controla_stock, tipo_item, nombre, costo_compra FROM productos WHERE id = $1', [prodId]);
    
    if (prod.rows.length === 0) return;
    
    const { controla_stock, tipo_item, costo_compra } = prod.rows[0];
    
    // 🔥 CORRECCIÓN AQUÍ:
    // Antes tenías: if (tipo_item === 'combo') return;
    // Ahora: Solo bloqueamos si es 'servicio' O si 'controla_stock' es falso.
    // Si es 'combo' y tiene stock activado, PASARÁ y se descontará.
    if (tipo_item === 'servicio' || !controla_stock) return;

    // Verificar Stock Actual (Bloqueo pesimista para evitar ventas sin stock)
    const stockRes = await client.query('SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE', [prodId, sedeId]);
    const stockActual = stockRes.rows.length > 0 ? stockRes.rows[0].cantidad : 0;
    
    if (stockActual < cantidad) {
        throw new Error(`Stock insuficiente para: ${prod.rows[0].nombre} (Quedan: ${stockActual})`);
    }

    // Restar Stock Físico
    await client.query('UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3', [cantidad, prodId, sedeId]);
    
    // Registrar en Kardex
    await client.query(
        `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
         VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7)`, 
        [
            sedeId, 
            prodId, 
            usuarioId, 
            -cantidad, // Negativo
            (stockActual - cantidad), 
            `Venta ${ticketCodigo} (${motivo})`, 
            parseFloat(costo_compra) || 0
        ]
    );
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
