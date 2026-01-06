// Ubicacion: SuperNova/backend/controllers/inventarioController.js
const pool = require('../db');

// 1. OBTENER PRODUCTOS (CON STOCK DE MI SEDE ACTUAL)
exports.obtenerProductos = async (req, res) => {
    try {
        const sedeId = req.usuario.sede_id; // Viene del token

        // JOIN CLAVE: Unimos productos con el inventario de ESTA sede específica
        // Usamos LEFT JOIN para ver el producto aunque el stock sea 0
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
            LEFT JOIN inventario_sedes i 
                ON p.id = i.producto_id AND i.sede_id = $1
            ORDER BY p.id DESC
        `;

        const result = await pool.query(query, [sedeId]);
        
        // Obtenemos el nombre de la sede para el título
        const sedeInfo = await pool.query('SELECT nombre FROM sedes WHERE id = $1', [sedeId]);
        const nombreSede = sedeInfo.rows[0]?.nombre || 'Sede Desconocida';

        res.json({ productos: result.rows, sede: nombreSede });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error del servidor al obtener inventario');
    }
};

// 2. CREAR PRODUCTO (GLOBAL + STOCK INICIAL)
exports.crearProducto = async (req, res) => {
    const { nombre, codigo, categoria, tipo, precio, costo, stock, stock_minimo, unidad, imagen, comboDetalles } = req.body;
    const client = await pool.connect(); 

    try {
        await client.query('BEGIN');
        const sedeId = req.usuario.sede_id;
        const usuarioId = req.usuario.id;

        // 🧠 LÓGICA INTELIGENTE: Asignar Línea de Negocio
        let lineaNegocio = 'CAFETERIA'; // Default
        const catUpper = categoria ? categoria.toUpperCase() : '';

        if (catUpper === 'TAQUILLA') lineaNegocio = 'TAQUILLA';
        else if (catUpper === 'MERCH') lineaNegocio = 'MERCH';
        else if (catUpper === 'ARCADE' || catUpper === 'JUEGOS') lineaNegocio = 'JUEGOS';
        
        // 👇 AGREGAR ESTA LÍNEA NUEVA:
        else if (catUpper === 'EVENTOS' || catUpper.includes('PAQUETE')) lineaNegocio = 'EVENTOS';
        // A. Insertar Ficha Maestra
        // 🚨 CAMBIO: Agregamos linea_negocio al INSERT
        const resProd = await client.query(
            `INSERT INTO productos (
                nombre, codigo_interno, categoria, tipo_item, 
                precio_venta, costo_compra, unidad_medida, imagen_url, 
                linea_negocio
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
            [nombre, codigo, categoria, tipo, precio, costo, unidad, imagen, lineaNegocio]
        );
        const nuevoId = resProd.rows[0].id;

        // B. Insertar Stock Inicial (Solo si es físico)
        if (tipo !== 'servicio') {
            const stockInicial = parseInt(stock) || 0;
            const minStock = parseInt(stock_minimo) || 5;
            
            await client.query(
                `INSERT INTO inventario_sedes (sede_id, producto_id, cantidad, stock_minimo_local) VALUES ($1, $2, $3, $4)`,
                [sedeId, nuevoId, stockInicial, minStock]
            );

            // Registrar Kardex (Si hay stock inicial)
            if (stockInicial > 0) {
                await client.query(
                    `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                     VALUES ($1, $2, $3, 'entrada', $4, $5, 'Carga Inicial', $6)`,
                    [sedeId, nuevoId, usuarioId, stockInicial, stockInicial, costo]
                );
            }
        }

        // C. Combos (Opcional)
        if (tipo === 'combo' && comboDetalles && comboDetalles.length > 0) {
            for (const item of comboDetalles) {
                await client.query(
                    `INSERT INTO productos_combo (producto_padre_id, producto_hijo_id, cantidad) VALUES ($1, $2, $3)`,
                    [nuevoId, item.id_producto, item.cantidad]
                );
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

// 3. OBTENER KARDEX (CON COSTOS Y VALORIZACIÓN)
exports.obtenerKardex = async (req, res) => {
    try {
        const sedeId = req.usuario.sede_id;
        
        const query = `
            SELECT 
                m.id,
                m.fecha,
                p.nombre as producto,
                u.nombres as usuario,
                m.tipo_movimiento,
                m.cantidad,
                m.stock_resultante,
                m.motivo,
                /* TRAEMOS EL COSTO HISTÓRICO */
                COALESCE(m.costo_unitario_movimiento, 0) as costo_unitario
            FROM movimientos_inventario m
            JOIN productos p ON m.producto_id = p.id
            JOIN usuarios u ON m.usuario_id = u.id
            WHERE m.sede_id = $1
            ORDER BY m.fecha DESC
            LIMIT 100
        `;
        
        const result = await pool.query(query, [sedeId]);
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
        await client.query('BEGIN');

        // 1. Borrar historial del Kardex
        await client.query('DELETE FROM movimientos_inventario WHERE producto_id = $1', [id]);

        // 2. Borrar stock en las sedes
        await client.query('DELETE FROM inventario_sedes WHERE producto_id = $1', [id]);

        // 3. Borrar de combos (si es parte de uno)
        await client.query('DELETE FROM productos_combo WHERE producto_hijo_id = $1 OR producto_padre_id = $1', [id]);

        // 4. FINALMENTE: Borrar el producto maestro
        await client.query('DELETE FROM productos WHERE id = $1', [id]);

        await client.query('COMMIT');
        res.json({ msg: 'Producto y todo su historial eliminado' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error al eliminar:", err.message);
        // Si falla por ventas realizadas (que es otra tabla), avisamos
        if (err.code === '23503') {
            return res.status(400).json({ msg: 'No se puede eliminar: Este producto ya tiene Ventas registradas.' });
        }
        res.status(500).send('Error al eliminar');
    } finally {
        client.release();
    }
};

// 4. ACTUALIZAR PRODUCTO (CON AJUSTE DE STOCK INTELIGENTE)
exports.actualizarProducto = async (req, res) => {
    const { id } = req.params;
    const { nombre, precio, categoria, costo, stock, stock_minimo } = req.body;
    const sedeId = req.usuario.sede_id;
    const usuarioId = req.usuario.id;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // A. Actualizar Datos Globales (Nombre, Precio, etc.)
        await client.query(
            `UPDATE productos SET nombre=$1, precio_venta=$2, categoria=$3, costo_compra=$4 WHERE id=$5`,
            [nombre, precio, categoria, costo, id]
        );

        // B. LÓGICA DE STOCK (MAGIA MULTI-SEDE)
        // 1. Buscamos cuánto stock tiene ESTA sede actualmente
        const stockActualRes = await client.query(
            `SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2`,
            [id, sedeId]
        );

        // Si no existía registro en esta sede (ej: es la primera vez que La Molina toca este producto), lo creamos
        let stockViejo = 0;
        if (stockActualRes.rows.length === 0) {
            await client.query(
                `INSERT INTO inventario_sedes (sede_id, producto_id, cantidad, stock_minimo_local) VALUES ($1, $2, 0, 5)`,
                [sedeId, id]
            );
        } else {
            stockViejo = stockActualRes.rows[0].cantidad;
        }

        // 2. Calculamos la diferencia
        const stockNuevo = parseInt(stock);
        const diferencia = stockNuevo - stockViejo;

        // 3. Si hubo cambio en el número, actualizamos y registramos en Kardex
        if (diferencia !== 0) {
            // Actualizar tabla de inventario
            await client.query(
                `UPDATE inventario_sedes 
                 SET cantidad = $1, stock_minimo_local = $2 
                 WHERE producto_id = $3 AND sede_id = $4`,
                [stockNuevo, stock_minimo, id, sedeId]
            );

            // Determinar tipo de movimiento
            const tipoMov = diferencia > 0 ? 'ajuste_positivo' : 'ajuste_negativo';
            const motivo = 'Ajuste Manual (Edición)';

            // Insertar en Kardex
            await client.query(
                `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [sedeId, id, usuarioId, tipoMov, diferencia, stockNuevo, motivo, costo]
            );
        } else {
            // Si solo cambió el mínimo pero no la cantidad
            await client.query(
                `UPDATE inventario_sedes SET stock_minimo_local = $1 WHERE producto_id = $2 AND sede_id = $3`,
                [stock_minimo, id, sedeId]
            );
        }

        await client.query('COMMIT');
        res.json({ msg: 'Producto y stock actualizados correctamente' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).send('Error al actualizar');
    } finally {
        client.release();
    }
};

// 5. AGREGAR STOCK (CON CÁLCULO DE COSTO PROMEDIO PONDERADO)
exports.ajustarStock = async (req, res) => {
    const { id } = req.params;
    // Recibimos 'tipoAjuste' ('entrada' o 'salida')
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
        const prodData = await client.query('SELECT costo_compra, nombre FROM productos WHERE id = $1', [id]);
        if (prodData.rows.length === 0) throw new Error("Producto no encontrado");
        
        const stockLocalData = await client.query('SELECT cantidad FROM inventario_sedes WHERE producto_id=$1 AND sede_id=$2', [id, sedeId]);
        
        const costoActual = parseFloat(prodData.rows[0].costo_compra) || 0;
        const stockActual = stockLocalData.rows.length > 0 ? stockLocalData.rows[0].cantidad : 0;

        // 2. LÓGICA SEGÚN TIPO
        let nuevoStock = stockActual;
        let nuevoCostoPromedio = costoActual;

        if (tipoAjuste === 'entrada') {
            // --- INGRESO (COMPRA) ---
            // Fórmula PMP (Solo si entra stock con costo diferente)
            if (costoUnitario > 0) {
                const valorTotalActual = stockActual * costoActual;
                const valorIngreso = cantidadReal * costoUnitario;
                nuevoCostoPromedio = (valorTotalActual + valorIngreso) / (stockActual + cantidadReal);
                
                // Actualizar Costo Global
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
            // --- SALIDA (MERMA / CONSUMO) ---
            if (stockActual < cantidadReal) {
                throw new Error(`Stock insuficiente. Tienes ${stockActual}.`);
            }

            // Restar Stock
            await client.query(
                `UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3`,
                [cantidadReal, id, sedeId]
            );
            nuevoStock = stockActual - cantidadReal;
        }

        // 3. Registrar en Kardex
        // Usamos el costo específico si es entrada, o el costo promedio si es salida (valorización de pérdida)
        const costoKardex = tipoAjuste === 'entrada' ? costoUnitario : costoActual;
        
        // Guardamos cantidad negativa si es salida
        const cantidadKardex = tipoAjuste === 'salida' ? -cantidadReal : cantidadReal;
        // Tipo movimiento en BD
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
                motivo || (tipoAjuste === 'entrada' ? 'Compra' : 'Merma'), 
                costoKardex
            ]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Ajuste de inventario realizado correctamente' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err.message);
        res.status(500).json({ msg: err.message });
    } finally {
        client.release();
    }
};