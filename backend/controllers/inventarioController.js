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

// 2. CREAR PRODUCTO (CORREGIDO: NO RESTA STOCK DE INGREDIENTES AL CREAR COMBO)
// 2. CREAR PRODUCTO (CORREGIDO: NO RESTA STOCK DE INGREDIENTES AL CREAR COMBO)
exports.crearProducto = async (req, res) => {
    let { nombre, codigo, categoria, tipo, precio, costo, stock, stock_minimo, unidad, imagen, comboDetalles } = req.body;
    const client = await pool.connect(); 

    try {
        await client.query('BEGIN');
        const sedeId = req.usuario.sede_id;
        const usuarioId = req.usuario.id;

        // Limpieza de tipo
        let tipoLimpio = (tipo || 'fisico').toLowerCase().trim();
        if (tipoLimpio === 'físico') tipoLimpio = 'fisico';
        if (tipoLimpio.includes('producto')) tipoLimpio = 'fisico';

        // Línea de Negocio
        let lineaNegocio = 'CAFETERIA'; 
        const catUpper = categoria ? categoria.toUpperCase() : '';
        if (catUpper === 'TAQUILLA') lineaNegocio = 'TAQUILLA';
        else if (catUpper === 'MERCH') lineaNegocio = 'MERCH';
        else if (catUpper === 'ARCADE') lineaNegocio = 'JUEGOS';
        else if (catUpper === 'EVENTOS') lineaNegocio = 'EVENTOS';
        
        // A. Insertar Ficha Maestra
        const resProd = await client.query(
            `INSERT INTO productos (
                nombre, codigo_interno, categoria, tipo_item, 
                precio_venta, costo_compra, unidad_medida, imagen_url, 
                linea_negocio
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
            [nombre, codigo, categoria, tipoLimpio, precio, costo, unidad, imagen, lineaNegocio]
        );
        const nuevoId = resProd.rows[0].id;

        const stockInicial = parseInt(stock) || 0;
        const minStock = parseInt(stock_minimo) || 5;

        // B. Insertar Stock Inicial (Ahora permite 'combo' con stock limitado)
        if (tipoLimpio !== 'servicio') {
            await client.query(
                `INSERT INTO inventario_sedes (sede_id, producto_id, cantidad, stock_minimo_local) VALUES ($1, $2, $3, $4)`,
                [sedeId, nuevoId, stockInicial, minStock]
            );

            // Registro en Kardex del nuevo producto/combo (ENTRADA)
            if (stockInicial > 0) {
                await client.query(
                    `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                     VALUES ($1, $2, $3, 'entrada', $4, $5, 'Stock Inicial / Definición de Combo', $6)`,
                    [sedeId, nuevoId, usuarioId, stockInicial, stockInicial, costo]
                );
            }
        }

        // C. LÓGICA DE COMBOS (SOLO GUARDAR RECETA)
        if (tipoLimpio === 'combo' && comboDetalles && comboDetalles.length > 0) {
            
            // 1. Guardar la receta (Relación Padre-Hijo)
            for (const item of comboDetalles) {
                await client.query(
                    `INSERT INTO productos_combo (producto_padre_id, producto_hijo_id, cantidad) VALUES ($1, $2, $3)`,
                    [nuevoId, item.id_producto, item.cantidad]
                );

                // 🔥 CORRECCIÓN: ELIMINADO EL BLOQUE QUE RESTABA STOCK FÍSICO.
                // Ahora solo se guarda la definición (receta) para usarla al vender.
            }
        }

        await client.query('COMMIT');
        res.json({ msg: 'Producto creado exitosamente' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        if (err.code === '23505') { 
            return res.status(400).json({ msg: 'El Código (SKU) ya existe. Usa otro.' });
        }
        res.status(500).send('Error al guardar producto');
    } finally {
        client.release();
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

// 3. OBTENER KARDEX (ACTUALIZADO: CON PRECIO DE VENTA)
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
                -- 🔥 NUEVO: Traemos el precio de venta actual del producto
                COALESCE(p.precio_venta, 0) as precio_venta
            FROM movimientos_inventario m
            JOIN productos p ON m.producto_id = p.id
            JOIN usuarios u ON m.usuario_id = u.id
            JOIN sedes s ON m.sede_id = s.id
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;

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

        query += ` ORDER BY m.fecha DESC LIMIT 100`;

        const result = await pool.query(query, params);
        res.json(result.rows);

    } catch (err) {
        console.error(err);
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
            await client.query("UPDATE productos SET estado = 'INACTIVO' WHERE id = $1", [id]);
            
            // Opcional: Poner stock en 0 para que no salga en búsquedas de venta
            await client.query("UPDATE inventario_sedes SET cantidad = 0 WHERE producto_id = $1", [id]);
            
            return res.json({ msg: 'Producto archivado correctamente (Tenía historial de ventas).' });
        } else {
            // --- NO TIENE VENTAS: BORRADO FÍSICO LIMPIO ---
            await client.query('BEGIN');
            // Borrar de Kardex primero
            await client.query('DELETE FROM movimientos_inventario WHERE producto_id = $1', [id]);
            // Borrar stock físico
            await client.query('DELETE FROM inventario_sedes WHERE producto_id = $1', [id]);
            // Borrar relaciones de combo (si era padre o hijo)
            await client.query('DELETE FROM productos_combo WHERE producto_hijo_id = $1 OR producto_padre_id = $1', [id]);
            // Finalmente borrar el producto
            await client.query('DELETE FROM productos WHERE id = $1', [id]);
            await client.query('COMMIT');
            
            return res.json({ msg: 'Producto eliminado permanentemente del sistema.' });
        }

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error al eliminar:", err.message);
        res.status(500).send('Error al procesar la eliminación');
    } finally {
        client.release();
    }
};

// 4. ACTUALIZAR PRODUCTO (CON CASCADA DE COSTOS PARA COMBOS)
exports.actualizarProducto = async (req, res) => {
    const { id } = req.params;
    let { nombre, precio, categoria, costo, stock, stock_minimo, tipo, comboDetalles } = req.body;
    
    console.log(`🔄 Actualizando ID: ${id}`);
    
    const sedeId = req.usuario.sede_id;
    const usuarioId = req.usuario.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        let tipoLimpio = (tipo || 'fisico').toLowerCase().trim();
        if (tipoLimpio === 'físico') tipoLimpio = 'fisico';

        // 1. Actualizar Datos Globales
        await client.query(
            `UPDATE productos 
             SET nombre=$1, precio_venta=$2, categoria=$3, costo_compra=$4, tipo_item=$5 
             WHERE id=$6`,
            [nombre, precio, categoria, costo, tipoLimpio, id]
        );

        // 2. Lógica de Stock (Sin cambios en tu lógica original)
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
        // (Esto pasa si el producto editado es ingrediente de otros)
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
        res.status(500).send('Error al actualizar');
    } finally {
        client.release();
    }
};

// 5. AGREGAR STOCK (CON CÁLCULO PONDERADO Y ACTUALIZACIÓN EN CASCADA DE COMBOS)
exports.ajustarStock = async (req, res) => {
    const { id } = req.params;
    const { cantidad, costo, motivo, tipoAjuste } = req.body;
    const sedeId = req.usuario.sede_id;
    const usuarioId = req.usuario.id;

    const cantidadReal = parseInt(cantidad);
    const costoUnitario = parseFloat(costo) || 0;

    if (cantidadReal <= 0) return res.status(400).json({ msg: "Cantidad inválida" });

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Obtener datos actuales
        const prodData = await client.query('SELECT costo_compra, nombre, tipo_item FROM productos WHERE id = $1', [id]);
        if (prodData.rows.length === 0) throw new Error("Producto no encontrado");
        
        const costoActual = parseFloat(prodData.rows[0].costo_compra) || 0;
        const tipoItem = prodData.rows[0].tipo_item;

        // 2. LÓGICA DE STOCK Y COSTO PONDERADO
        const stockLocalData = await client.query('SELECT cantidad FROM inventario_sedes WHERE producto_id=$1 AND sede_id=$2', [id, sedeId]);
        const stockActual = stockLocalData.rows.length > 0 ? stockLocalData.rows[0].cantidad : 0;

        let nuevoStock = stockActual;
        let nuevoCostoPromedio = costoActual;

        if (tipoAjuste === 'entrada') {
            // FÓRMULA PROMEDIO PONDERADO (Solo si es item físico/ingrediente)
            if (costoUnitario > 0 && tipoItem !== 'combo') {
                const valorTotalActual = stockActual * costoActual;
                const valorIngreso = cantidadReal * costoUnitario;
                nuevoCostoPromedio = (valorTotalActual + valorIngreso) / (stockActual + cantidadReal);
                
                // Actualizar Costo del Producto Principal
                await client.query('UPDATE productos SET costo_compra = $1 WHERE id = $2', [nuevoCostoPromedio, id]);
            }

            // Sumar Stock
            await client.query(
                `INSERT INTO inventario_sedes (sede_id, producto_id, cantidad, stock_minimo_local) 
                 VALUES ($1, $2, $3, 5)
                 ON CONFLICT (sede_id, producto_id) 
                 DO UPDATE SET cantidad = inventario_sedes.cantidad + $3`,
                [sedeId, id, cantidadReal]
            );
            nuevoStock = stockActual + cantidadReal;

        } else {
            // Salida
            if (stockActual < cantidadReal) throw new Error(`Stock insuficiente. Tienes ${stockActual}.`);
            
            await client.query(
                `UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3`,
                [cantidadReal, id, sedeId]
            );
            nuevoStock = stockActual - cantidadReal;
        }

        // 3. REGISTRAR KARDEX
        const costoKardex = tipoAjuste === 'entrada' ? costoUnitario : costoActual;
        const cantidadKardex = tipoAjuste === 'salida' ? -cantidadReal : cantidadReal;
        const tipoMovimientoBD = tipoAjuste === 'salida' ? 'salida_ajuste' : 'entrada_compra';

        await client.query(
            `INSERT INTO movimientos_inventario (
                sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [sedeId, id, usuarioId, tipoMovimientoBD, cantidadKardex, nuevoStock, motivo || (tipoAjuste === 'entrada' ? 'Compra' : 'Merma'), costoKardex]
        );

        // --- 🔥 LÓGICA DE CASCADA: ACTUALIZAR COSTO DE COMBOS ASOCIADOS 🔥 ---
        // Si este producto cambió de precio, buscamos todos los combos que lo contienen
        let combosAfectados = [];
        
        if (tipoAjuste === 'entrada' && Math.abs(nuevoCostoPromedio - costoActual) > 0.001) {
            // 1. Buscar combos padres
            const combosPadres = await client.query(
                `SELECT DISTINCT producto_padre_id FROM productos_combo WHERE producto_hijo_id = $1`, 
                [id]
            );

            // 2. Recalcular costo de cada combo padre
            for (const row of combosPadres.rows) {
                const padreId = row.producto_padre_id;
                
                // Sumar (Costo Hijos * Cantidad Receta)
                const recalculo = await client.query(`
                    SELECT SUM(p.costo_compra * pc.cantidad) as nuevo_costo_combo
                    FROM productos_combo pc
                    JOIN productos p ON pc.producto_hijo_id = p.id
                    WHERE pc.producto_padre_id = $1
                `, [padreId]);

                const nuevoCostoCombo = recalculo.rows[0].nuevo_costo_combo || 0;

                // Actualizar el combo padre
                await client.query('UPDATE productos SET costo_compra = $1 WHERE id = $2', [nuevoCostoCombo, padreId]);
                
                combosAfectados.push({ id: padreId, nuevo_costo: parseFloat(nuevoCostoCombo) });
            }
        }

        await client.query('COMMIT');
        
        res.json({ 
            msg: 'Ajuste realizado. Costos actualizados.',
            nuevo_stock: nuevoStock,
            nuevo_costo: nuevoCostoPromedio,
            combos_afectados: combosAfectados // Enviamos lista de combos actualizados
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).json({ msg: err.message });
    } finally {
        client.release();
    }
};