// UBICACIÓN: backend/controllers/ecommerceController.js
const pool = require('../db');

// 1. OBTENER PEDIDOS WEB (Para la pantalla de Despacho del Cajero)
exports.obtenerPedidosWeb = async (req, res) => {
    try {
        const sedeId = req.usuario.sede_id;
        
        // Buscamos solo las ventas que vengan de la WEB y de esta sede específica
        const query = `
            SELECT 
                id, fecha_venta, total_venta, codigo_recojo, 
                UPPER(estado_despacho) AS estado_despacho, -- Forzamos mayúsculas para el frontend
                cliente_razon_social AS cliente_nombre, 
                transaccion_pasarela
            FROM ventas
            WHERE origen = 'WEB' 
              AND sede_id = $1 
              AND estado_despacho = 'PENDIENTE' -- Solo traer lo que falta entregar
            ORDER BY fecha_venta DESC
        `;
        const result = await pool.query(query, [sedeId]);
        res.json(result.rows);
    } catch (err) {
        console.error("Error obteniendo pedidos web:", err.message);
        res.status(500).send('Error del servidor al obtener pedidos web');
    }
};

// 2. MARCAR PEDIDO COMO ENTREGADO, DESCONTAR STOCK Y REGISTRAR HISTORIAL COMPLETO
exports.entregarPedidoWeb = async (req, res) => {
    const client = await pool.connect(); 

    try {
        const { id } = req.params; // ID de la venta
        const sedeId = req.usuario.sede_id;
        const usuarioId = req.usuario.id;

        await client.query('BEGIN'); // 🔒 INICIAMOS TRANSACCIÓN

        // 1. Marcar como entregado y obtener datos para el historial
        const updateQuery = `
            UPDATE ventas 
            SET estado_despacho = 'entregado', estado = 'finalizado'
            WHERE id = $1 AND sede_id = $2 AND origen = 'WEB' AND estado_despacho != 'entregado'
            RETURNING id, numero_ticket_sede, tipo_comprobante, serie, correlativo;
        `;
        const resultVenta = await client.query(updateQuery, [id, sedeId]);

        if (resultVenta.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, msg: 'Pedido no encontrado o ya entregado.' });
        }

        const v = resultVenta.rows[0];
        // Formateamos la referencia (Ej: Boleta B001-45 o Ticket 888)
        const refComprobante = v.serie ? `${v.tipo_comprobante} ${v.serie}-${v.correlativo}` : `Ticket ${v.numero_ticket_sede}`;

        // 2. Obtener productos de la venta (unimos con tabla PRODUCTOS para traer costos reales)
        const detalleQuery = `
            SELECT dv.producto_id, dv.cantidad, dv.precio_unitario, 
                   p.costo_compra, p.precio_venta, p.controla_stock, p.tipo_item, p.nombre
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            WHERE dv.venta_id = $1
        `;
        const detalles = await client.query(detalleQuery, [id]);

        // 3. Procesar cada producto para descontar Stock y actualizar Kardex
        for (let item of detalles.rows) {
            
            // --- LÓGICA DE COSTOS: Sumamos los costos de los insumos ---
            let costoAcumuladoCombo = 0;

            const comboQuery = `
                SELECT pc.producto_hijo_id, pc.cantidad AS cant_por_combo,
                    ph.costo_compra, ph.nombre AS nombre_hijo, ph.controla_stock
                FROM productos_combo pc
                JOIN productos ph ON pc.producto_hijo_id = ph.id
                WHERE pc.producto_padre_id = $1
            `;
            const comboResult = await client.query(comboQuery, [item.producto_id]);
            const esCombo = comboResult.rows.length > 0;

            if (esCombo) {
                comboResult.rows.forEach(h => {
                    costoAcumuladoCombo += (parseFloat(h.costo_compra || 0) * parseFloat(h.cant_por_combo || 0));
                });
            } else {
                costoAcumuladoCombo = parseFloat(item.costo_compra || 0);
            }

            // --- A) DESCONTAR STOCK DEL COMBO (PADRE) ---
            let nuevoStockPrincipal = 0;
            if (item.controla_stock && item.tipo_item !== 'servicio') {
                const stockRes = await client.query(`
                    UPDATE inventario_sedes SET cantidad = cantidad - $1 
                    WHERE producto_id = $2 AND sede_id = $3 RETURNING cantidad
                `, [item.cantidad, item.producto_id, sedeId]);
                
                nuevoStockPrincipal = stockRes.rows.length > 0 ? stockRes.rows[0].cantidad : 0;
            }

            // --- B) REGISTRO DEL PADRE EN EL KARDEX ---
            await client.query(`
                INSERT INTO movimientos_inventario 
                (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento, precio_venta_historico, fecha)
                VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
            `, [
                sedeId, 
                item.producto_id, 
                usuarioId, 
                -item.cantidad, 
                nuevoStockPrincipal, 
                `Venta Web (${item.nombre}) - Ref: ${refComprobante}`,
                costoAcumuladoCombo, 
                item.precio_unitario || item.precio_venta
            ]);

            // --- C) DESCONTAR STOCK DE INGREDIENTES Y REGISTRAR EN KARDEX ---
            if (esCombo) {
                for (let h of comboResult.rows) {
                    const cantTotalInsumo = h.cant_por_combo * item.cantidad;
                    let nuevoStockHijo = 0;

                    // 🚩 AQUÍ ESTÁ EL CAMBIO: También restamos stock a los hijos
                    if (h.controla_stock) {
                        const resHijo = await client.query(`
                            UPDATE inventario_sedes SET cantidad = cantidad - $1 
                            WHERE producto_id = $2 AND sede_id = $3 RETURNING cantidad
                        `, [cantTotalInsumo, h.producto_hijo_id, sedeId]);
                        
                        nuevoStockHijo = resHijo.rows.length > 0 ? resHijo.rows[0].cantidad : 0;
                    }

                    // Registro del ingrediente en el Kardex con su propio stock resultante
                    await client.query(`
                        INSERT INTO movimientos_inventario 
                        (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento, precio_venta_historico, fecha)
                        VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
                    `, [
                        sedeId, 
                        h.producto_hijo_id, 
                        usuarioId, 
                        -cantTotalInsumo, 
                        nuevoStockHijo, // Mostramos el stock real del ingrediente
                        `Insumo de: ${item.nombre} - Ref: ${refComprobante}`, 
                        h.costo_compra || 0, 
                        0.00 
                    ]);
                }
            }
        }

        await client.query('COMMIT'); 
        res.json({ success: true, msg: '¡Pedido entregado y stock actualizado correctamente!' });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ ERROR EN ENTREGA WEB:", err.message);
        res.status(500).json({ success: false, msg: 'Error al procesar la entrega: ' + err.message });
    } finally {
        client.release();
    }
};

// ========================================================
// 3. NUEVO: OBTENER HISTORIAL COMPLETO WEB (Para Gerentes/Cajeros)
// ========================================================
exports.obtenerHistorialWeb = async (req, res) => {
    try {
        const usuario = req.usuario || {};
        const rol = (usuario.rol || '').toLowerCase();
        const esAdminTotal = rol === 'superadmin' || rol === 'gerente';
        
        let params = [];
        let filterCondition = "WHERE v.origen = 'WEB'";

        if (!esAdminTotal) {
            const sedeId = parseInt(usuario.sede_id, 10);
            if (isNaN(sedeId)) {
                return res.status(401).json({ success: false, msg: "Sesión sin sede válida." });
            }
            filterCondition += " AND v.sede_id = $1";
            params.push(sedeId);
        }

        const query = `
            SELECT 
                v.id, 
                v.fecha_venta, 
                v.total_venta, 
                v.codigo_recojo, 
                v.estado_despacho, 
                COALESCE(v.cliente_razon_social, 'Cliente Web') AS cliente_nombre,
                COALESCE(v.doc_cliente_temporal, 'S/N') AS doc_cliente,
                CASE 
                    WHEN UPPER(COALESCE(v.metodo_pago, '')) IN ('MERCADO PAGO', 'MERCADOPAGO') 
                    THEN COALESCE(UPPER(v.tipo_tarjeta), 'MERCADO PAGO')
                    ELSE UPPER(COALESCE(v.metodo_pago, 'TRANSFERENCIA'))
                END as metodo_pago,
                COALESCE(v.tipo_comprobante, 'TICKET') as tipo_comprobante,
                
                -- 🚩 AQUÍ ESTABA EL ERROR: Convertimos serie y correlativo a TEXTO antes del COALESCE
                COALESCE(v.serie::text, '') as serie,
                COALESCE(v.correlativo::text, '') as correlativo,
                
                v.enlace_pdf,
                COALESCE(s.nombre, 'Sede Web') AS nombre_sede
            FROM ventas v
            LEFT JOIN sedes s ON v.sede_id = s.id
            ${filterCondition}
            ORDER BY v.fecha_venta DESC
            LIMIT 100
        `;
        
        const result = await pool.query(query, params);
        res.json(result.rows);

    } catch (err) {
        console.error("❌ Error Crítico SQL:", err.message);
        res.status(500).json({ success: false, msg: "Error de base de datos" });
    }
};

// 3. CONSULTAR STOCK DISPONIBLE PARA LA WEB
exports.consultarStockEcommerce = async (req, res) => {
    try {
        const { producto_id, sede_id } = req.params;

        // Buscamos la cantidad actual en la tabla de inventario_sedes
        const stockQuery = `
            SELECT cantidad 
            FROM inventario_sedes 
            WHERE producto_id = $1 AND sede_id = $2
        `;
        
        const result = await pool.query(stockQuery, [producto_id, sede_id]); // Cambiar client por pool

        if (result.rows.length === 0) {
            return res.json({ stock: 0, disponible: false, msg: "Producto no disponible en esta sede" });
        }

        const stockActual = result.rows[0].cantidad;

        res.json({
            producto_id,
            sede_id,
            stock: stockActual,
            disponible: stockActual > 0
        });

    } catch (err) {
        console.error("Error al consultar stock para web:", err.message);
        res.status(500).send('Error al consultar inventario.');
    }
};

// 4. RESERVAR STOCK TEMPORALMENTE (PARA EL CARRITO WEB)
exports.reservarStockTemporal = async (req, res) => {
    const { producto_id, sede_id, cantidad, sesion_id } = req.body;

    try {
        await pool.query('BEGIN');

        // A. Consultamos Stock Físico
        const stockRes = await pool.query(
            'SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2',
            [producto_id, sede_id]
        );
        const stockFisico = stockRes.rows[0]?.cantidad || 0;

        // B. Consultamos Reservas Activas de otros (que no hayan expirado)
        const reservasRes = await pool.query(
            'SELECT SUM(cantidad) as total_reservado FROM reservas_ecommerce WHERE producto_id = $1 AND sede_id = $2 AND expira_at > CURRENT_TIMESTAMP',
            [producto_id, sede_id]
        );
        const totalReservado = parseInt(reservasRes.rows[0]?.total_reservado || 0);

        // C. Calcular Stock Neto Disponible
        const stockDisponibleReal = stockFisico - totalReservado;

        if (stockDisponibleReal >= cantidad) {
            // D. Crear la reserva por 15 minutos
            const expira = new Date();
            expira.setMinutes(expira.getMinutes() + 15);

            await pool.query(
                'INSERT INTO reservas_ecommerce (producto_id, sede_id, cantidad, sesion_id, expira_at) VALUES ($1, $2, $3, $4, $5)',
                [producto_id, sede_id, cantidad, sesion_id, expira]
            );

            await pool.query('COMMIT');
            res.json({ success: true, msg: "Stock reservado por 15 minutos", disponible: true });
        } else {
            await pool.query('ROLLBACK');
            res.status(400).json({ success: false, msg: "Stock insuficiente considerando reservas actuales", disponible: false });
        }

    } catch (err) {
        await pool.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ msg: "Error al procesar reserva" });
    }
};

exports.obtenerDetallePedidoWeb = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Buscamos datos con TODAS las columnas necesarias para el modal
        const ventaQuery = `
            SELECT 
                v.id, v.total_venta, v.estado_despacho, v.codigo_recojo, 
                v.tipo_comprobante, v.serie, v.correlativo, v.nombre_cliente_temporal,
                s.nombre AS nombre_sede
            FROM ventas v
            JOIN sedes s ON v.sede_id = s.id
            WHERE v.id = $1 AND v.origen = 'WEB'
        `;
        const ventaResult = await pool.query(ventaQuery, [id]);

        if (ventaResult.rows.length === 0) {
            return res.status(404).json({ msg: 'Venta web no encontrada.' });
        }

        // 2. Buscamos productos y CALCULAMOS el subtotal aquí para evitar el NaN
        const detalleQuery = `
            SELECT 
                dv.cantidad, 
                dv.precio_unitario, 
                (dv.cantidad * dv.precio_unitario) as subtotal, -- 🔥 Cálculo forzado
                p.nombre AS nombre_producto
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id 
            WHERE dv.venta_id = $1
        `;
        const detalleResult = await pool.query(detalleQuery, [id]);

        res.json({
            venta: ventaResult.rows[0],
            productos: detalleResult.rows
        });
    } catch (err) {
        console.error("Error detalle:", err.message);
        res.status(500).send('Error del servidor');
    }
};