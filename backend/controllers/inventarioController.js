// Ubicacion: SuperNova/backend/controllers/inventarioController.js
const pool = require('../db');

// 1. OBTENER PRODUCTOS (FILTRADO POR SEDE)
exports.obtenerProductos = async (req, res) => {
    try {
        const sedeId = req.usuario.sede_id; 
        
        const query = `
            SELECT 
                p.id, 
                p.codigo_interno, 
                p.nombre, 
                p.categoria, 
                p.tipo_item, 
                p.precio_venta, 
                p.costo_compra, 
                p.unidad_medida, 
                p.imagen_url,
                COALESCE(i.cantidad, 0) as stock_actual,
                COALESCE(i.stock_minimo_local, 5) as stock_minimo
            FROM productos p
            INNER JOIN inventario_sedes i 
                ON p.id = i.producto_id AND i.sede_id = $1
            WHERE p.estado = 'ACTIVO'  -- <--- ESTA ES LA LÍNEA MÁGICA
            ORDER BY p.nombre ASC
        `;

        const result = await pool.query(query, [sedeId]);
        
        const sedeInfo = await pool.query('SELECT nombre FROM sedes WHERE id = $1', [sedeId]);
        const nombreSede = sedeInfo.rows[0]?.nombre || 'Sede Desconocida';

        res.json({ productos: result.rows, sede: nombreSede });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error del servidor al obtener inventario');
    }
};

// 2. CREAR PRODUCTO (VERSION BLINDADA: RESISTENTE A FALLOS Y ALTA CONCURRENCIA)
exports.crearProducto = async (req, res) => {
    let { nombre, codigo, categoria, tipo, precio, costo, stock, stock_minimo, unidad, imagen, comboDetalles } = req.body;
    
    // Validaciones iniciales (Fail-fast para no desperdiciar recursos de DB)
    if (!nombre || !codigo || !precio) {
        return res.status(400).json({ msg: 'Nombre, código y precio son obligatorios.' });
    }

    const client = await pool.connect(); 

    try {
        await client.query('BEGIN');
        
        // Obtenemos datos del usuario inyectados por el middleware de auth
        const sedeId = req.usuario.sede_id;
        const usuarioId = req.usuario.id;

        // --- MANTENEMOS TU LÓGICA DE LIMPIEZA DE TIPO ---
        let tipoLimpio = (tipo || 'fisico').toLowerCase().trim();
        if (tipoLimpio === 'físico') tipoLimpio = 'fisico';
        if (tipoLimpio.includes('producto')) tipoLimpio = 'fisico';

        // --- MANTENEMOS TU LÓGICA DE LÍNEA DE NEGOCIO ---
        let lineaNegocio = 'CAFETERIA'; 
        const catUpper = categoria ? categoria.toUpperCase() : '';
        if (catUpper === 'TAQUILLA') lineaNegocio = 'TAQUILLA';
        else if (catUpper === 'MERCH') lineaNegocio = 'MERCH';
        else if (catUpper === 'ARCADE') lineaNegocio = 'JUEGOS';
        else if (catUpper === 'EVENTOS') lineaNegocio = 'EVENTOS';
        // 🛡️ BLINDAJE DE DATOS FINANCIEROS
        const precioDecimal = parseFloat(precio) || 0;
        const costoDecimal = parseFloat(costo) || 0;
        
        // A. Insertar Ficha Maestra
        const resProd = await client.query(
            `INSERT INTO productos (
                nombre, codigo_interno, categoria, tipo_item, 
                precio_venta, costo_compra, unidad_medida, imagen_url, 
                linea_negocio
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [nombre, codigo, categoria, tipoLimpio, precioDecimal, costoDecimal, unidad, imagen, lineaNegocio]
        );
        const nuevoId = resProd.rows[0].id;

        const stockInicial = parseInt(stock) || 0;
        const minStock = parseInt(stock_minimo) || 5;

        // B. Insertar Stock Inicial y LOTE (Solo si no es servicio)
        if (tipoLimpio !== 'servicio') {
            
            // 1. Insertar en tabla resumen de la sede
            await client.query(
                `INSERT INTO inventario_sedes (sede_id, producto_id, cantidad, stock_minimo_local) 
                 VALUES ($1, $2, $3, $4)`,
                [sedeId, nuevoId, stockInicial, minStock]
            );

            // 2. 🔥 CREAR EL PRIMER LOTE (INDISPENSABLE PARA TU SISTEMA PEPS)
            // Si el stock es 0, igual creamos registro en inventario_sedes pero no lote activo.
            if (stockInicial > 0) {
                await client.query(
                    `INSERT INTO inventario_lotes (sede_id, producto_id, cantidad_inicial, cantidad_actual, costo_unitario, estado) 
                     VALUES ($1, $2, $3, $3, $4, 'ACTIVO')`,
                    [sedeId, nuevoId, stockInicial, costoDecimal] // <--- AHORA SÍ ESTÁ 100% BLINDADO
                );

                // Registro en Kardex para auditoría
                await client.query(
                    `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                    VALUES ($1, $2, $3, 'entrada', $4, $5, 'Stock Inicial', $6)`,
                    [sedeId, nuevoId, usuarioId, stockInicial, stockInicial, costoDecimal]
                );
            }
        }

        // C. LÓGICA DE COMBOS (RECETA)
        // Mantenemos tu corrección: Solo guardamos la receta, no restamos stock aquí.
        if (tipoLimpio === 'combo' && comboDetalles && Array.isArray(comboDetalles) && comboDetalles.length > 0) {
            for (const item of comboDetalles) {
                await client.query(
                    `INSERT INTO productos_combo (producto_padre_id, producto_hijo_id, cantidad) 
                     VALUES ($1, $2, $3)`,
                    [nuevoId, item.id_producto, item.cantidad]
                );
            }
        }

        // D. AUDITORÍA GLOBAL
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'CREAR', 'INVENTARIO', $2, $3)`,
            [usuarioId, nuevoId, `Producto creado: ${nombre} (${codigo}) con stock inicial ${stockInicial}`]
        );

        await client.query('COMMIT');
        res.json({ success: true, msg: 'Producto creado exitosamente', id: nuevoId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error en crearProducto:", err.message);
        
        // Manejo de error de duplicado (Unique Constraint)
        if (err.code === '23505') { 
            return res.status(400).json({ msg: 'El Código (SKU) ya existe. Por favor usa uno diferente.' });
        }
        
        res.status(500).json({ msg: 'Error interno al guardar el producto: ' + err.message });
    } finally {
        client.release(); // 🛡️ Siempre liberamos la conexión al pool
    }
};

// 6. OBTENER RECETA DE COMBO (Para edición)
exports.obtenerRecetaCombo = async (req, res) => {
    const { id } = req.params;
    try {
        const query = `
            SELECT 
                pc.producto_hijo_id as id_producto,
                p.nombre,
                pc.cantidad,
                p.costo_compra as costo
            FROM productos_combo pc
            JOIN productos p ON pc.producto_hijo_id = p.id
            WHERE pc.producto_padre_id = $1
        `;
        const result = await pool.query(query, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error al cargar receta' });
    }
};

// 1. OBTENER KARDEX (VERSION BLINDADA: COMPONENTES DE COMBO CON PRECIO 0)
exports.obtenerKardex = async (req, res) => {
    try {
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        const usuarioSedeId = req.usuario.sede_id;
        const esSuperAdmin = rol === 'superadmin' || rol === 'gerente';
        const filtroSedeId = req.query.sede;
        
        let query = `
            SELECT 
                m.id,
                m.fecha,
                p.nombre as producto,
                u.nombres as usuario,
                s.nombre as nombre_sede,
                m.tipo_movimiento,
                m.cantidad,
                m.stock_resultante,
                m.motivo,
                COALESCE(m.costo_unitario_movimiento, 0) as costo_unitario,
                
                -- 🛡️ BLINDAJE DE PRECIO:
                -- Usamos COALESCE para verificar si existe precio_venta_historico. 
                -- Si es 0 (como en los ingredientes de combos), se queda en 0.
                -- Solo si es NULL (ventas muy antiguas) recurre al precio actual del producto.
                CASE 
                    WHEN m.precio_venta_historico IS NOT NULL THEN m.precio_venta_historico
                    ELSE COALESCE(p.precio_venta, 0)
                END as precio_venta

            FROM movimientos_inventario m
            JOIN productos p ON m.producto_id = p.id
            JOIN usuarios u ON m.usuario_id = u.id
            JOIN sedes s ON m.sede_id = s.id
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;

        // Filtro por Sede según Rol
        if (esSuperAdmin) {
            if (filtroSedeId) {
                query += ` AND m.sede_id = $${paramIndex}`;
                params.push(filtroSedeId);
                paramIndex++;
            }
        } else {
            query += ` AND m.sede_id = $${paramIndex}`;
            params.push(usuarioSedeId);
            paramIndex++;
        }

        // Filtros opcionales de fecha o producto podrían ir aquí
        query += ` ORDER BY m.fecha DESC LIMIT 150`;

        const result = await pool.query(query, params);
        res.json(result.rows);

    } catch (err) {
        console.error("❌ Error en obtenerKardex:", err.message);
        res.status(500).send('Error al obtener kardex');
    }
};

exports.eliminarProducto = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        // 1. Verificar si el producto tiene historial de ventas
        const ventasCheck = await client.query('SELECT 1 FROM detalle_ventas WHERE producto_id = $1 LIMIT 1', [id]);
        
        if (ventasCheck.rows.length > 0) {
            // --- TIENE VENTAS: NO BORRAMOS, SOLO ARCHIVAMOS (Soft Delete) ---
            
            // 🔥 CAMBIO CLAVE: Renombramos el código para liberarlo
            // Generamos un número aleatorio para asegurar unicidad
            const sufijo = Math.floor(Math.random() * 100000); 
            
            await client.query(
                `UPDATE productos 
                 SET estado = 'INACTIVO', 
                     codigo_interno = codigo_interno || '_BORRADO_' || $2 
                 WHERE id = $1`, 
                [id, sufijo]
            );
            
            // Poner stock en 0 para que no salga en búsquedas de venta
            await client.query("UPDATE inventario_sedes SET cantidad = 0 WHERE producto_id = $1", [id]);
            
            // Limpiamos los lotes activos (FIFO) para que no estorben
            await client.query("UPDATE inventario_lotes SET estado = 'AGOTADO', cantidad_actual = 0 WHERE producto_id = $1", [id]);
            
            return res.json({ msg: 'Producto archivado y código liberado correctamente (Tenía historial).' });

        } else {
            // --- NO TIENE VENTAS: BORRADO FÍSICO LIMPIO ---
            await client.query('BEGIN');
            
            // A. Borrar de Kardex primero
            await client.query('DELETE FROM movimientos_inventario WHERE producto_id = $1', [id]);
            
            // B. Borrar Lotes (FIFO)
            await client.query('DELETE FROM inventario_lotes WHERE producto_id = $1', [id]);

            // C. Borrar stock físico (Tabla resumen)
            await client.query('DELETE FROM inventario_sedes WHERE producto_id = $1', [id]);
            
            // D. Borrar relaciones de combo (si era padre o hijo)
            await client.query('DELETE FROM productos_combo WHERE producto_hijo_id = $1 OR producto_padre_id = $1', [id]);
            
            // E. Finalmente borrar el producto
            await client.query('DELETE FROM productos WHERE id = $1', [id]);
            
            await client.query('COMMIT');
            
            return res.json({ msg: 'Producto eliminado permanentemente y código liberado.' });
        }

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error al eliminar:", err.message);
        // Enviamos el mensaje exacto para saber si es otro constraint
        res.status(500).json({ msg: 'Error al eliminar: ' + err.message });
    } finally {
        client.release();
    }
};

// 4. ACTUALIZAR PRODUCTO (CORREGIDO: AHORA GUARDA EL SKU/CÓDIGO)
exports.actualizarProducto = async (req, res) => {
    const { id } = req.params;
    // Agregamos 'codigo' a la desestructuración
    let { nombre, codigo, precio, categoria, costo, stock, stock_minimo, tipo, comboDetalles } = req.body;
    
    console.log(`🔄 Actualizando ID: ${id} - Nuevo Código: ${codigo}`);
    
    const sedeId = req.usuario.sede_id;
    const usuarioId = req.usuario.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        let tipoLimpio = (tipo || 'fisico').toLowerCase().trim();
        if (tipoLimpio === 'físico') tipoLimpio = 'fisico';

        const precioDecimal = parseFloat(precio) || 0;
        const costoDecimal = parseFloat(costo) || 0;

        // 1. Actualizar Datos Globales (CORREGIDO: Se agregó codigo_interno)
        await client.query(
            `UPDATE productos 
             SET nombre=$1, codigo_interno=$2, precio_venta=$3, categoria=$4, costo_compra=$5, tipo_item=$6 
             WHERE id=$7`,
            [nombre, codigo, precioDecimal, categoria, costoDecimal, tipoLimpio, id]
        );

        // 2. Lógica de Stock (Sin cambios)
        const stockActualRes = await client.query(
            `SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2`,
            [id, sedeId]
        );

        let stockViejo = 0;
        if (stockActualRes.rows.length === 0) {
            await client.query(
                `INSERT INTO inventario_sedes (sede_id, producto_id, cantidad, stock_minimo_local) VALUES ($1, $2, 0, 5)`,
                [sedeId, id]
            );
        } else {
            stockViejo = stockActualRes.rows[0].cantidad;
        }

        const stockNuevo = parseInt(stock);
        const diferencia = stockNuevo - stockViejo;

        if (diferencia !== 0) {
            await client.query(
                `UPDATE inventario_sedes SET cantidad = $1, stock_minimo_local = $2 WHERE producto_id = $3 AND sede_id = $4`,
                [stockNuevo, stock_minimo, id, sedeId]
            );
            const tipoMov = diferencia > 0 ? 'ajuste_positivo' : 'ajuste_negativo';
            await client.query(
                `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [sedeId, id, usuarioId, tipoMov, diferencia, stockNuevo, 'Ajuste Manual (Edición)', costo]
            );
        } else {
            await client.query(
                `UPDATE inventario_sedes SET stock_minimo_local = $1 WHERE producto_id = $2 AND sede_id = $3`,
                [stock_minimo, id, sedeId]
            );
        }

        // 3. Actualización de Receta (Si es combo)
        if (tipoLimpio === 'combo') {
            await client.query('DELETE FROM productos_combo WHERE producto_padre_id = $1', [id]);
            if (comboDetalles && Array.isArray(comboDetalles) && comboDetalles.length > 0) {
                for (const item of comboDetalles) {
                    await client.query(
                        `INSERT INTO productos_combo (producto_padre_id, producto_hijo_id, cantidad) VALUES ($1, $2, $3)`,
                        [id, parseInt(item.id_producto), parseInt(item.cantidad)]
                    );
                }
            }
        }

        // --- 🔥 LÓGICA DE CASCADA: SI CAMBIÓ COSTO, ACTUALIZAR COMBOS PADRES 🔥 ---
        if (tipoLimpio === 'fisico') {
             const combosPadres = await client.query(
                `SELECT DISTINCT producto_padre_id FROM productos_combo WHERE producto_hijo_id = $1`, 
                [id]
            );

            for (const row of combosPadres.rows) {
                const padreId = row.producto_padre_id;
                // Recalcular costo del padre
                const recalculo = await client.query(`
                    SELECT SUM(p.costo_compra * pc.cantidad) as nuevo_costo_combo
                    FROM productos_combo pc
                    JOIN productos p ON pc.producto_hijo_id = p.id
                    WHERE pc.producto_padre_id = $1
                `, [padreId]);

                const nuevoCostoCombo = recalculo.rows[0].nuevo_costo_combo || 0;
                await client.query('UPDATE productos SET costo_compra = $1 WHERE id = $2', [nuevoCostoCombo, padreId]);
            }
        }

        await client.query('COMMIT');
        res.json({ msg: 'Producto actualizado correctamente' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error en Backend:", err.message);
        
        // Manejo específico para código duplicado al editar
        if (err.code === '23505') { 
            return res.status(400).json({ msg: 'El Código (SKU) ya existe. Usa otro.' });
        }
        
        res.status(500).send('Error al actualizar');
    } finally {
        client.release();
    }
};

// 5. AGREGAR/AJUSTAR STOCK (VERSIÓN PEPS / FIFO BLINDADA)
exports.ajustarStock = async (req, res) => {
    const { id } = req.params;
    const { cantidad, costo, motivo, tipoAjuste } = req.body;
    const sedeId = req.usuario.sede_id;
    const usuarioId = req.usuario.id;

    const cantidadReal = parseInt(cantidad);
    const costoUnitarioIngreso = parseFloat(costo) || 0;

    // Validación fail-fast
    if (!cantidadReal || cantidadReal <= 0) {
        return res.status(400).json({ msg: "La cantidad debe ser un número mayor a cero." });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        /**
         * 🛡️ PROTECCIÓN DE CONCURRENCIA:
         * Usamos FOR UPDATE para bloquear las filas de stock de este producto en esta sede.
         * Esto evita que si hay dos ajustes o una venta al mismo tiempo, los cálculos de 
         * stock_resultante y saldos de lotes se crucen.
         */
        const stockLocalData = await client.query(
            'SELECT cantidad FROM inventario_sedes WHERE producto_id=$1 AND sede_id=$2 FOR UPDATE', 
            [id, sedeId]
        );
        const stockFisicoActual = stockLocalData.rows.length > 0 ? parseInt(stockLocalData.rows[0].cantidad) : 0;
        
        let nuevoStock = stockFisicoActual;
        let costoParaKardex = 0;

        if (tipoAjuste === 'entrada') {
            // --- ENTRADA: CREAMOS UN NUEVO LOTE ---
            
            // A. Insertar en tabla de Lotes (Mantenemos tu lógica de lote individual)
            await client.query(
                `INSERT INTO inventario_lotes (sede_id, producto_id, cantidad_inicial, cantidad_actual, costo_unitario, estado) 
                 VALUES ($1, $2, $3, $3, $4, 'ACTIVO')`,
                [sedeId, id, cantidadReal, costoUnitarioIngreso]
            );

            // B. Actualizar Stock Total (Tabla resumen)
            await client.query(
                `INSERT INTO inventario_sedes (sede_id, producto_id, cantidad, stock_minimo_local) 
                 VALUES ($1, $2, $3, 5)
                 ON CONFLICT (sede_id, producto_id) 
                 DO UPDATE SET cantidad = inventario_sedes.cantidad + $3`,
                [sedeId, id, cantidadReal]
            );
            
            // C. Actualizar "Precio de Referencia" en producto maestro
            if(costoUnitarioIngreso > 0) {
                await client.query('UPDATE productos SET costo_compra = $1 WHERE id = $2', [costoUnitarioIngreso, id]);
            }

            nuevoStock = stockFisicoActual + cantidadReal;
            costoParaKardex = costoUnitarioIngreso;

        } else {
            // --- SALIDA (MERMA/AJUSTE MANUAL/SALIDA) ---
            
            if (stockFisicoActual < cantidadReal) {
                throw new Error(`Stock insuficiente para realizar el ajuste. Disponible: ${stockFisicoActual}.`);
            }
            
            let cantidadRestante = cantidadReal;
            let costoTotalSalida = 0;

            // Buscar lotes activos (FIFO: El más viejo primero) con bloqueo preventivo
            const lotesRes = await client.query(
                `SELECT id, cantidad_actual, costo_unitario FROM inventario_lotes 
                 WHERE producto_id = $1 AND sede_id = $2 AND cantidad_actual > 0 
                 ORDER BY fecha_ingreso ASC FOR UPDATE`,
                [id, sedeId]
            );

            if (lotesRes.rows.length === 0) {
                throw new Error("No se encontraron lotes disponibles para realizar la salida (PEPS).");
            }

            for (const lote of lotesRes.rows) {
                if (cantidadRestante <= 0) break;

                const aDescontar = Math.min(cantidadRestante, lote.cantidad_actual);
                const costoLote = parseFloat(lote.costo_unitario);
                
                // Actualizar Lote en BD
                await client.query(
                    `UPDATE inventario_lotes 
                     SET cantidad_actual = cantidad_actual - $1, 
                         estado = CASE WHEN cantidad_actual - $1 = 0 THEN 'AGOTADO' ELSE estado END
                     WHERE id = $2`,
                    [aDescontar, lote.id]
                );

                costoTotalSalida += (aDescontar * costoLote);
                cantidadRestante -= aDescontar;
            }

            // Actualizar Stock Total en la tabla de la sede
            await client.query(
                `UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3`,
                [cantidadReal, id, sedeId]
            );

            nuevoStock = stockFisicoActual - cantidadReal;
            // Costo promedio ponderado de la salida para el Kardex
            costoParaKardex = cantidadReal > 0 ? (costoTotalSalida / cantidadReal) : 0;
        }

        // 3. REGISTRAR EN KARDEX (MOVIMIENTOS_INVENTARIO)
        const cantidadKardex = tipoAjuste === 'salida' ? -cantidadReal : cantidadReal;
        const tipoMovimientoBD = tipoAjuste === 'salida' ? 'salida_ajuste' : 'entrada_compra';

        await client.query(
            `INSERT INTO movimientos_inventario (
                sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                sedeId, 
                id, 
                usuarioId, 
                tipoMovimientoBD, 
                cantidadKardex, 
                nuevoStock, 
                motivo || (tipoAjuste === 'entrada' ? 'Ajuste Entrada' : 'Ajuste Salida'), 
                costoParaKardex
            ]
        );

        // 4. AUDITORÍA GENERAL
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'AJUSTE_STOCK', 'INVENTARIO', $2, $3)`,
            [usuarioId, id, `Ajuste ${tipoAjuste}: ${cantidadReal} unidades. Nuevo stock total: ${nuevoStock}`]
        );

        await client.query('COMMIT');
        
        res.json({ 
            success: true,
            msg: 'Ajuste de inventario realizado correctamente (Algoritmo PEPS).',
            nuevo_stock: nuevoStock
        });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ Error en ajustarStock:", err.message);
        res.status(500).json({ msg: err.message });
    } finally {
        if (client) client.release(); // 🛡️ Importante para evitar colapso de conexiones
    }
};