// Ubicación: SuperNova/backend/controllers/ventasController.js
const pool = require('../db');

// 1. REGISTRAR VENTA (ACTUALIZADO CON DESCUENTOS)
// 1. REGISTRAR VENTA (ACTUALIZADO: Soporte para Factura, RUC y Tipo Tarjeta)
exports.registrarVenta = async (req, res) => {
    // 1. DESESTRUCTURACIÓN ACTUALIZADA
    const { 
        clienteDni, metodoPago, carrito, vendedor_id, tipo_venta, 
        observaciones, descuento_factor,
        // Nuevos campos que llegan del Frontend
        tipo_comprobante, cliente_razon_social, cliente_direccion, tipo_tarjeta
    } = req.body;

    const usuarioId = req.usuario.id;
    const sedeId = req.usuario.sede_id;

    const client = await pool.connect();

    try {
        if (!carrito || !Array.isArray(carrito) || carrito.length === 0) {
            throw new Error("El carrito de compras está vacío o tiene un formato incorrecto.");
        }

        // Validación de seguridad para el descuento
        const factor = parseFloat(descuento_factor) || 0; 
        if (factor < 0 || factor > 1) throw new Error("El porcentaje de descuento no es válido.");

        const vendedorFinal = vendedor_id ? vendedor_id : usuarioId;

        await client.query('BEGIN');

        // A. OBTENER PREFIJO SEDE
        const sedeRes = await client.query('SELECT prefijo_ticket FROM sedes WHERE id = $1', [sedeId]);
        const prefijo = sedeRes.rows[0]?.prefijo_ticket || 'GEN';

        // B. CALCULAR CORRELATIVO
        const maxTicketRes = await client.query(
            'SELECT COALESCE(MAX(numero_ticket_sede), 0) as max_num FROM ventas WHERE sede_id = $1',
            [sedeId]
        );
        const nuevoNumeroTicket = parseInt(maxTicketRes.rows[0].max_num) + 1;
        const codigoTicketVisual = `${prefijo}-${nuevoNumeroTicket.toString().padStart(4, '0')}`;

        // C. PROCESAR TOTALES Y DETALLES
        let totalCalculado = 0;
        let detalleInsertar = [];

        for (const item of carrito) {
            const prodRes = await client.query('SELECT id, precio_venta, costo_compra, nombre, linea_negocio FROM productos WHERE id = $1', [item.id]);
            
            if (prodRes.rows.length === 0) throw new Error(`Producto ID ${item.id} no encontrado.`);
            
            const prod = prodRes.rows[0];

            // Aplicar descuento
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

        // Actualizar Observaciones con datos extra si es necesario
        let obsFinal = observaciones || '';
        if (factor > 0) {
            const porcentaje = (factor * 100).toFixed(0);
            obsFinal = `[Descuento: ${porcentaje}%] ${obsFinal}`;
        }

        // D. INSERTAR VENTA (SQL ACTUALIZADO CON NUEVOS CAMPOS)
        const ventaRes = await client.query(
            `INSERT INTO ventas
            (sede_id, usuario_id, vendedor_id, doc_cliente_temporal, metodo_pago, total_venta, subtotal, igv, linea_negocio, numero_ticket_sede, tipo_venta, observaciones,
             tipo_comprobante, cliente_razon_social, cliente_direccion, tipo_tarjeta) -- 👈 Nuevas columnas
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16) -- 👈 Nuevos parámetros
             RETURNING id`,
            [
                sedeId, 
                usuarioId, 
                vendedorFinal,
                clienteDni || 'PUBLICO', 
                metodoPago, 
                totalCalculado, 
                subtotalFactura, 
                igvFactura, 
                lineaPrincipal, 
                nuevoNumeroTicket,
                tipo_venta || 'Unitaria',
                obsFinal,
                // Nuevos valores para guardar
                tipo_comprobante || 'Boleta',
                cliente_razon_social || null,
                cliente_direccion || null,
                tipo_tarjeta || null
            ]
        );
        const ventaId = ventaRes.rows[0].id;

        // E. GUARDAR DETALLES Y DESCONTAR STOCK (LÓGICA MIXTA CORREGIDA)
        for (const item of detalleInsertar) {
            // 1. Guardar el detalle de la venta (siempre se hace)
            await client.query(
                `INSERT INTO detalle_ventas (venta_id, producto_id, nombre_producto_historico, cantidad, precio_unitario, subtotal, costo_historico)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [ventaId, item.id, item.nombre, item.cantidad, item.precioReal, item.subtotal, item.costoReal]
            );

            // 2. Verificar si es un Combo (tiene receta)
            const esCombo = await client.query('SELECT producto_hijo_id, cantidad FROM productos_combo WHERE producto_padre_id = $1', [item.id]);
            
            if (esCombo.rows.length > 0) {
                // --- ES UN COMBO ---
                
                // A) Descontar los Ingredientes (HIJOS)
                for (const hijo of esCombo.rows) {
                    const cantTotal = item.cantidad * hijo.cantidad;
                    // El motivo indica que fue por venta del combo padre
                    await descontarStock(client, hijo.producto_hijo_id, sedeId, cantTotal, usuarioId, codigoTicketVisual, `Ingrediente de: ${item.nombre}`);
                }

                // B) Descontar el Combo Mismo (PADRE) - 🔥 ESTO FALTABA
                // Esto es lo que hace que tu stock baje de 10 a 9, a 8...
                await descontarStock(client, item.id, sedeId, item.cantidad, usuarioId, codigoTicketVisual, 'Venta de Combo');

            } else {
                // --- ES UN PRODUCTO NORMAL ---
                await descontarStock(client, item.id, sedeId, item.cantidad, usuarioId, codigoTicketVisual, 'Venta Directa');
            }
        }

        // F. REGISTRAR EN CAJA (Sin cambios)
        if (totalCalculado > 0) {
            await client.query(
                `INSERT INTO movimientos_caja (sede_id, usuario_id, tipo_movimiento, categoria, descripcion, monto, metodo_pago, venta_id)
                 VALUES ($1, $2, 'INGRESO', 'VENTA_POS', 'Ticket ' || $3, $4, $5, $6)`,
                [sedeId, usuarioId, codigoTicketVisual, totalCalculado, metodoPago, ventaId]
            );
        }

        await client.query('COMMIT');
        
        res.json({ 
            msg: 'Venta Procesada', 
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

// 2. OBTENER HISTORIAL UNIFICADO (CORREGIDO: ALIAS DE PREFIJO)
exports.obtenerHistorialVentas = async (req, res) => {
    try {
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        const esSuperAdmin = rol === 'superadmin' || rol === 'gerente';
        const usuarioSedeId = req.usuario.sede_id;
        const filtroSedeId = req.query.sede;

        // Determinamos qué sede filtrar
        let sedeFiltro = esSuperAdmin ? (filtroSedeId || null) : usuarioSedeId;
        
        // Parámetros para la query ($1 = sede_id si existe)
        const params = [];
        let sedeCondition = "";
        
        if (sedeFiltro) {
            sedeCondition = "AND v.sede_id = $1"; // Para Ventas
            params.push(sedeFiltro);
        }

        // 🔥 LA MAGIA: UNION ALL ENTRE VENTAS Y COBROS DE CAJA
        const query = `
            WITH HistorialUnificado AS (
                -- A. VENTAS DEL POS (Boletas/Facturas)
                SELECT 
                    v.id,
                    v.fecha_venta, 
                    v.total_venta, 
                    v.metodo_pago, 
                    -- 👇 CORRECCIÓN AQUÍ: s.prefijo_ticket (tabla sedes), no v.prefijo_ticket
                    COALESCE(s.prefijo_ticket || '-' || LPAD(v.numero_ticket_sede::text, 4, '0'), 'TICKET-' || v.id) as codigo_visual,
                    v.tipo_venta,
                    v.observaciones,
                    v.tipo_comprobante, 
                    v.tipo_tarjeta,
                    s.nombre AS nombre_sede,
                    u.nombres AS nombre_usuario, -- El Cajero
                    vend.nombres || ' ' || COALESCE(vend.apellidos, '') AS nombre_vendedor,
                    v.doc_cliente_temporal,
                    v.nombre_cliente_temporal,
                    'VENTA_POS' as origen
                FROM ventas v
                JOIN usuarios u ON v.usuario_id = u.id          
                LEFT JOIN usuarios vend ON v.vendedor_id = vend.id 
                JOIN sedes s ON v.sede_id = s.id
                WHERE 1=1 ${sedeCondition}

                UNION ALL

                -- B. COBROS B2B (Ingresos directos a Caja desde módulo Terceros)
                SELECT 
                    mc.id + 900000, -- ID ficticio alto para evitar conflictos visuales
                    mc.fecha_registro as fecha_venta,
                    mc.monto as total_venta,
                    mc.metodo_pago,
                    'B2B-' || mc.id as codigo_visual, -- Código especial para identificar
                    'Cobro Terceros' as tipo_venta,
                    mc.descripcion as observaciones,
                    'Recibo Interno' as tipo_comprobante,
                    NULL as tipo_tarjeta,
                    s.nombre as nombre_sede,
                    u.nombres as nombre_usuario, -- El Cajero
                    'Acuerdo Comercial' as nombre_vendedor, -- Vendedor genérico
                    'CORPORATIVO' as doc_cliente_temporal,
                    'Cliente Corporativo' as nombre_cliente_temporal,
                    'COBRO_CAJA' as origen
                FROM movimientos_caja mc
                JOIN usuarios u ON mc.usuario_id = u.id
                JOIN sedes s ON mc.sede_id = s.id
                WHERE mc.tipo_movimiento = 'INGRESO' 
                AND mc.categoria = 'Ingresos Varios (Caja)' 
                ${sedeFiltro ? "AND mc.sede_id = $1" : ""}
            )
            SELECT * FROM HistorialUnificado
            ORDER BY fecha_venta DESC
            LIMIT 100
        `;

        const result = await pool.query(query, params);
        
        const ventasFormateadas = result.rows.map(v => ({
            id: v.id,
            fecha_venta: v.fecha_venta,
            total_venta: v.total_venta,
            metodo_pago: v.metodo_pago,
            codigo_visual: v.codigo_visual,
            tipo_venta: v.tipo_venta,
            observaciones: v.observaciones,
            tipo_comprobante: v.tipo_comprobante,
            tipo_tarjeta: v.tipo_tarjeta,
            nombre_sede: v.nombre_sede,
            nombre_usuario: v.nombre_usuario, 
            nombre_vendedor: v.nombre_vendedor,
            nombre_cajero: v.nombre_usuario, 
            doc_cliente_temporal: v.doc_cliente_temporal,
            nombre_cliente_temporal: v.nombre_cliente_temporal,
            origen: v.origen 
        }));

        res.json(ventasFormateadas);

    } catch (err) {
        console.error("Error historial unificado:", err.message);
        res.status(500).send('Error al cargar historial.');
    }
};

// 3. OBTENER DETALLE
exports.obtenerDetalleVenta = async (req, res) => {
    const { id } = req.params;
    try {
        const query = `SELECT nombre_producto_historico, cantidad, precio_unitario, subtotal FROM detalle_ventas WHERE venta_id = $1 ORDER BY id ASC`;
        const result = await pool.query(query, [id]);
        res.json(result.rows); 
    } catch (err) {
        res.status(500).json({ msg: 'Error al cargar detalle.' });
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
