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

// 2. CREAR PRODUCTO (CON DEDUCCIÓN AUTOMÁTICA DE INGREDIENTES)
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

        // B. Insertar Stock Inicial (Ahora permite 'combo' con stock)
        if (tipoLimpio !== 'servicio') {
            await client.query(
                `INSERT INTO inventario_sedes (sede_id, producto_id, cantidad, stock_minimo_local) VALUES ($1, $2, $3, $4)`,
                [sedeId, nuevoId, stockInicial, minStock]
            );

            // Registro en Kardex del nuevo combo (ENTRADA)
            if (stockInicial > 0) {
                await client.query(
                    `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                     VALUES ($1, $2, $3, 'entrada', $4, $5, 'Armado de Combo Inicial', $6)`,
                    [sedeId, nuevoId, usuarioId, stockInicial, stockInicial, costo]
                );
            }
        }

        // C. LÓGICA DE COMBOS (Guardar receta Y RESTAR INGREDIENTES)
        if (tipoLimpio === 'combo' && comboDetalles && comboDetalles.length > 0) {
            
            // 1. Guardar la receta
            for (const item of comboDetalles) {
                await client.query(
                    `INSERT INTO productos_combo (producto_padre_id, producto_hijo_id, cantidad) VALUES ($1, $2, $3)`,
                    [nuevoId, item.id_producto, item.cantidad]
                );

                // 2. 🔥 SI CREAMOS STOCK DEL COMBO, RESTAMOS LOS INGREDIENTES 🔥
                if (stockInicial > 0) {
                    const cantidadARestar = item.cantidad * stockInicial; // ej: 2 panes * 10 combos = 20 panes

                    // Restar stock físico del ingrediente
                    await client.query(
                        `UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3`,
                        [cantidadARestar, item.id_producto, sedeId]
                    );

                    // Obtener stock restante para el Kardex
                    const resStockIng = await client.query('SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2', [item.id_producto, sedeId]);
                    const stockFinalIngrediente = resStockIng.rows[0].cantidad;

                    // Registrar SALIDA en el Kardex del ingrediente
                    await client.query(
                        `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                         VALUES ($1, $2, $3, 'salida_produccion', $4, $5, $6, 0)`, 
                        [
                            sedeId, 
                            item.id_producto, 
                            usuarioId, 
                            -cantidadARestar, // Negativo porque sale
                            stockFinalIngrediente, 
                            `Usado en Combo: ${nombre} (x${stockInicial})`
                        ]
                    );
                }
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

// 3. OBTENER KARDEX (SEGURIDAD JERÁRQUICA)
exports.obtenerKardex = async (req, res) => {
    try {
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        const usuarioSedeId = req.usuario.sede_id;

        // 🧠 DEFINICIÓN DE ROLES:
        // 'superadmin' o 'gerente' -> Ve TODO y puede filtrar.
        // 'admin', 'administrador', 'cajero', etc. -> Solo ven SU sede.
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
                COALESCE(m.costo_unitario_movimiento, 0) as costo_unitario
            FROM movimientos_inventario m
            JOIN productos p ON m.producto_id = p.id
            JOIN usuarios u ON m.usuario_id = u.id
            JOIN sedes s ON m.sede_id = s.id
            WHERE 1=1
        `;
        
        const params = [];
        let paramIndex = 1;

        // --- LÓGICA DE SEGURIDAD ACTUALIZADA ---
        if (esSuperAdmin) {
            // EL JEFE SUPREMO: Puede filtrar o ver todo
            if (filtroSedeId) {
                query += ` AND m.sede_id = $${paramIndex}`;
                params.push(filtroSedeId);
                paramIndex++;
            }
        } else {
            // ADMINISTRADORES DE SEDE Y PERSONAL:
            // Se les fuerza a ver ÚNICAMENTE su sede asignada.
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
// 4. ACTUALIZAR PRODUCTO (CON AJUSTE DE STOCK INTELIGENTE)
// 4. ACTUALIZAR PRODUCTO (CORREGIDO: AHORA GUARDA EL TIPO)
exports.actualizarProducto = async (req, res) => {
    const { id } = req.params;
    // 🔥 CORRECCIÓN 1: Recibimos 'tipo' del body (antes no lo leías)
    let { nombre, precio, categoria, costo, stock, stock_minimo, tipo } = req.body;
    const sedeId = req.usuario.sede_id;
    const usuarioId = req.usuario.id;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // --- 🧹 LIMPIEZA DE TIPO ---
        let tipoLimpio = (tipo || 'fisico').toLowerCase().trim();
        if (tipoLimpio === 'físico') tipoLimpio = 'fisico';

        // A. Actualizar Datos Globales
        // 🔥 CORRECCIÓN 2: Agregamos "tipo_item=$5" al SQL
        await client.query(
            `UPDATE productos 
             SET nombre=$1, precio_venta=$2, categoria=$3, costo_compra=$4, tipo_item=$5 
             WHERE id=$6`,
            [nombre, precio, categoria, costo, tipoLimpio, id]
        );

        // B. LÓGICA DE STOCK (MAGIA MULTI-SEDE)
        // 1. Buscamos stock actual
        const stockActualRes = await client.query(
            `SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2`,
            [id, sedeId]
        );

        let stockViejo = 0;
        if (stockActualRes.rows.length === 0) {
            // Si lo cambiamos a físico y no tenía registro, se lo creamos en 0
            await client.query(
                `INSERT INTO inventario_sedes (sede_id, producto_id, cantidad, stock_minimo_local) VALUES ($1, $2, 0, 5)`,
                [sedeId, id]
            );
        } else {
            stockViejo = stockActualRes.rows[0].cantidad;
        }

        // 2. Calcular diferencia
        const stockNuevo = parseInt(stock);
        const diferencia = stockNuevo - stockViejo;

        // 3. Actualizar Stock y Kardex solo si cambió el número
        // (Y si el producto sigue siendo físico, o si queremos mantener el historial aunque sea servicio)
        if (diferencia !== 0) {
            await client.query(
                `UPDATE inventario_sedes 
                 SET cantidad = $1, stock_minimo_local = $2 
                 WHERE producto_id = $3 AND sede_id = $4`,
                [stockNuevo, stock_minimo, id, sedeId]
            );

            const tipoMov = diferencia > 0 ? 'ajuste_positivo' : 'ajuste_negativo';
            const motivo = 'Ajuste Manual (Edición)';

            await client.query(
                `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                [sedeId, id, usuarioId, tipoMov, diferencia, stockNuevo, motivo, costo]
            );
        } else {
            // Actualizar solo el mínimo
            await client.query(
                `UPDATE inventario_sedes SET stock_minimo_local = $1 WHERE producto_id = $2 AND sede_id = $3`,
                [stock_minimo, id, sedeId]
            );
        }

        await client.query('COMMIT');
        res.json({ msg: 'Producto actualizado correctamente' });

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