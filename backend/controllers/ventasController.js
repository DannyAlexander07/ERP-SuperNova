// Ubicacion: SuperNova/backend/controllers/ventasController.js
const pool = require('../db');


// 1. FUNCIÓN PRINCIPAL BLINDADA
exports.registrarVenta = async (req, res) => {
    const { clienteDni, metodoPago, carrito } = req.body; // Ignoramos totalVenta del frontend
    const usuarioId = req.usuario.id;
    const sedeId = req.usuario.sede_id;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // A. RECALCULAR TOTALES (Seguridad)
        let totalCalculado = 0;
        let detalleInsertar = [];

        for (const item of carrito) {
            // Buscamos precio REAL en la base de datos
            const prodRes = await client.query('SELECT id, precio_venta, costo_compra, nombre, linea_negocio FROM productos WHERE id = $1', [item.id]);
            if (prodRes.rows.length === 0) throw new Error(`Producto ${item.nombre} ya no existe.`);
            
            const prod = prodRes.rows[0];
            const subtotal = prod.precio_venta * item.cantidad;
            totalCalculado += subtotal;

            detalleInsertar.push({
                ...item,
                precioReal: prod.precio_venta,
                costoReal: prod.costo_compra,
                lineaProd: prod.linea_negocio, // Para P&L mixto
                subtotal
            });
        }

        const subtotalFactura = totalCalculado / 1.18;
        const igvFactura = totalCalculado - subtotalFactura;
        
        // Determinamos Línea de Negocio Principal (Si hay mix, gana Cafetería por defecto)
        const lineaPrincipal = detalleInsertar[0].lineaProd || 'CAFETERIA';

        // B. CREAR VENTA
        const ventaRes = await client.query(
            `INSERT INTO ventas (sede_id, usuario_id, doc_cliente_temporal, metodo_pago, total_venta, subtotal, igv, linea_negocio) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
            [sedeId, usuarioId, clienteDni || 'PUBLICO', metodoPago, totalCalculado, subtotalFactura, igvFactura, lineaPrincipal]
        );
        const ventaId = ventaRes.rows[0].id;

        // C. PROCESAR DETALLE Y STOCK (Soporte Combos)
        for (const item of detalleInsertar) {
            await client.query(
                `INSERT INTO detalle_ventas (venta_id, producto_id, nombre_producto_historico, cantidad, precio_unitario, subtotal, costo_historico)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [ventaId, item.id, item.nombre, item.cantidad, item.precioReal, item.subtotal, item.costoReal]
            );

            // Verificamos si es Combo
            const esCombo = await client.query('SELECT producto_hijo_id, cantidad FROM productos_combo WHERE producto_padre_id = $1', [item.id]);

            if (esCombo.rows.length > 0) {
                // Es Combo: Descontamos hijos
                for (const hijo of esCombo.rows) {
                    const cantTotal = item.cantidad * hijo.cantidad;
                    await descontarStock(client, hijo.producto_hijo_id, sedeId, cantTotal, usuarioId, ventaId, `Combo ID ${item.id}`);
                }
            } else {
                // Es Simple
                await descontarStock(client, item.id, sedeId, item.cantidad, usuarioId, ventaId, 'Venta Directa');
            }
        }

        // D. CAJA
        await client.query(
            `INSERT INTO movimientos_caja (sede_id, usuario_id, tipo_movimiento, categoria, descripcion, monto, metodo_pago, venta_id)
             VALUES ($1, $2, 'INGRESO', 'VENTA_POS', 'Ticket #' || $3, $4, $5, $6)`,
            [sedeId, usuarioId, ventaId, totalCalculado, metodoPago, ventaId]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Venta Procesada', ventaId, total: totalCalculado });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(400).json({ msg: err.message }); // 400 para que el frontend lo muestre en alert
    } finally {
        client.release();
    }
};



// --- NUEVA FUNCIÓN: Obtener Historial de Ventas Detallado ---
exports.obtenerHistorialVentas = async (req, res) => {
    try {
        const query = `
            SELECT 
                v.id,
                v.fecha_venta,
                v.total_venta,
                v.metodo_pago,
                v.tipo_comprobante,
                v.numero_comprobante,
                v.doc_cliente_temporal,
                v.nombre_cliente_temporal,
                s.nombre AS nombre_sede,
                u.nombres AS nombre_usuario,
                u.apellidos AS apellido_usuario
            FROM 
                ventas v
            JOIN 
                usuarios u ON v.usuario_id = u.id
            JOIN 
                sedes s ON v.sede_id = s.id
            ORDER BY 
                v.fecha_venta DESC
            LIMIT 100;
        `;
        
        const result = await pool.query(query);
        res.json(result.rows);

    } catch (err) {
        console.error("Error al obtener historial de ventas:", err.message);
        res.status(500).send('Error al cargar historial de ventas.');
    }
};


// Ubicacion: backend/controllers/ventasController.js -> Reemplazar eliminarVenta

// --- 6. ELIMINAR VENTA (ANULACIÓN COMPLETA) ---
exports.eliminarVenta = async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuario ? req.usuario.id : null;
    const sedeId = req.usuario.sede_id; // Necesitamos la sede para devolver el stock ahí
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Obtener datos de la venta antes de borrar
        const ventaRes = await client.query('SELECT * FROM ventas WHERE id = $1', [id]);
        if (ventaRes.rows.length === 0) throw new Error('Venta no encontrada.');
        const venta = ventaRes.rows[0];

        // Validar que intentas borrar una venta de TU sede (Seguridad)
        if (venta.sede_id !== sedeId && req.usuario.rol !== 'admin') {
            throw new Error('No puedes anular ventas de otra sede.');
        }

        // 2. RECUPERAR PRODUCTOS PARA DEVOLVER STOCK
        const detallesRes = await client.query('SELECT producto_id, cantidad, nombre_producto_historico FROM detalle_ventas WHERE venta_id = $1', [id]);
        const itemsVendidos = detallesRes.rows;

        for (const item of itemsVendidos) {
            // Verificamos si era un Combo para devolver los ingredientes
            const esCombo = await client.query('SELECT producto_hijo_id, cantidad FROM productos_combo WHERE producto_padre_id = $1', [item.producto_id]);

            if (esCombo.rows.length > 0) {
                // Es Combo: Devolvemos los hijos
                for (const hijo of esCombo.rows) {
                    const cantTotal = item.cantidad * hijo.cantidad;
                    await reponerStock(client, hijo.producto_hijo_id, venta.sede_id, cantTotal, usuarioId, id, `Anulación Combo ${item.nombre_producto_historico}`);
                }
            } else {
                // Es Producto Simple: Devolvemos directo
                await reponerStock(client, item.producto_id, venta.sede_id, item.cantidad, usuarioId, id, `Anulación Venta Directa`);
            }
        }

        // 3. BORRAR EL DINERO DE LA CAJA (Reverso Financiero)
        await client.query('DELETE FROM movimientos_caja WHERE venta_id = $1', [id]);

        // 4. BORRAR DETALLES Y VENTA
        await client.query('DELETE FROM detalle_ventas WHERE venta_id = $1', [id]);
        await client.query('DELETE FROM ventas WHERE id = $1', [id]);

        // 5. AUDITORÍA
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'ELIMINAR', 'VENTAS', $2, $3)`,
            [usuarioId, id, `Anuló Ticket #${id}. Stock devuelto y dinero retirado de caja.`]
        );

        await client.query('COMMIT');
        res.json({ msg: `Venta TICKET #${id} anulada. Stock y Dinero revertidos.` });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error al anular venta:", err.message);
        res.status(400).json({ msg: err.message });
    } finally {
        client.release();
    }
};



// --- 8. OBTENER DETALLE DE VENTA (Productos vendidos) ---
exports.obtenerDetalleVenta = async (req, res) => {
    const { id } = req.params;
    
    try {
        const query = `
            SELECT 
                nombre_producto_historico,
                cantidad,
                precio_unitario,
                subtotal
            FROM 
                detalle_ventas
            WHERE 
                venta_id = $1
            ORDER BY 
                id ASC;
        `;
        
        const result = await pool.query(query, [id]);
        
        // La respuesta exitosa es un JSON del array
        res.json(result.rows); 

    } catch (err) {
        console.error("Error al obtener detalle de venta:", err.message);
        // 🚨 CORRECCIÓN: Devolvemos JSON con status 500 para evitar el error de "red" en el frontend
        res.status(500).json({ msg: 'Error al cargar el detalle de la venta desde el servidor.' });
    }
};

// Ubicacion: Al final de backend/controllers/ventasController.js

async function descontarStock(client, prodId, sedeId, cantidad, usuarioId, ventaId, motivo) {
    // 1. Verificar datos del producto
    // 🚨 CAMBIO: Ahora traemos también 'tipo_item' para validar
    const prod = await client.query(
        'SELECT controla_stock, tipo_item, nombre, costo_compra FROM productos WHERE id = $1', 
        [prodId]
    );
    
    if (prod.rows.length === 0) return; // Si no existe, salimos
    
    const { controla_stock, tipo_item, nombre, costo_compra } = prod.rows[0];

    // 🚨 PROTECCIÓN CRÍTICA:
    // Si es un SERVICIO o un COMBO (padre), NO descontamos stock físico del padre.
    // Solo descontamos si es 'fisico' y tiene el check de controla_stock activo.
    if (tipo_item === 'servicio' || tipo_item === 'combo' || !controla_stock) {
        return; // Salimos sin hacer nada (es infinito)
    }

    // Recuperamos el costo actual.
    const costoHistorico = parseFloat(costo_compra) || 0; 

    // 2. Bloquear fila (Evita condiciones de carrera)
    const stockRes = await client.query(
        'SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE',
        [prodId, sedeId]
    );

    // Si no hay registro en esta sede, asumimos 0
    const stockActual = stockRes.rows.length > 0 ? stockRes.rows[0].cantidad : 0;
    
    if (stockActual < cantidad) {
        throw new Error(`Stock insuficiente para: ${nombre} (Tienes: ${stockActual}, Pides: ${cantidad})`);
    }

    // 3. Actualizar Stock (Resta)
    await client.query(
        'UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3',
        [cantidad, prodId, sedeId]
    );

    // 4. Kardex
    await client.query(
        `INSERT INTO movimientos_inventario (
            sede_id, producto_id, usuario_id, tipo_movimiento, 
            cantidad, stock_resultante, motivo, costo_unitario_movimiento
        ) VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7)`, 
        [
            sedeId, 
            prodId, 
            usuarioId, 
            cantidad, 
            (stockActual - cantidad), 
            `Venta #${ventaId} (${motivo})`,
            costoHistorico
        ]
    );
}
// --- FUNCIÓN AUXILIAR PARA SUMAR STOCK (Pégala al final del archivo) ---
async function reponerStock(client, prodId, sedeId, cantidad, usuarioId, ventaId, motivo) {
    // Verificar si controla stock
    const prod = await client.query('SELECT controla_stock, nombre, costo_compra FROM productos WHERE id = $1', [prodId]);
    if (!prod.rows[0].controla_stock) return;

    // Bloquear fila
    const stockRes = await client.query(
        'SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE',
        [prodId, sedeId]
    );

    // Si no existe registro de stock en esa sede (raro, pero posible), lo iniciamos en 0
    let stockActual = 0;
    if (stockRes.rows.length > 0) {
        stockActual = stockRes.rows[0].cantidad;
    } else {
        await client.query(
            `INSERT INTO inventario_sedes (sede_id, producto_id, cantidad, stock_minimo_local) VALUES ($1, $2, 0, 5)`,
            [sedeId, prodId]
        );
    }

    // Actualizar (SUMAR)
    await client.query(
        'UPDATE inventario_sedes SET cantidad = cantidad + $1 WHERE producto_id = $2 AND sede_id = $3',
        [cantidad, prodId, sedeId]
    );

    // Registrar en Kardex como 'entrada_anulacion'
    await client.query(
        `INSERT INTO movimientos_inventario (
            sede_id, producto_id, usuario_id, tipo_movimiento, 
            cantidad, stock_resultante, motivo, costo_unitario_movimiento
        ) VALUES ($1, $2, $3, 'entrada_anulacion', $4, $5, $6, $7)`,
        [
            sedeId, prodId, usuarioId, 
            cantidad, (stockActual + cantidad), 
            `Devolución Ticket #${ventaId} (${motivo})`, 
            prod.rows[0].costo_compra
        ]
    );
}
