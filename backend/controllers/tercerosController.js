//Ubicacion: backend/controllers/tercerosController.js

// Ubicacion: backend/controllers/tercerosController.js

const pool = require('../db');

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
// 4. CARGA MASIVA DE CÓDIGOS (Lista Blanca)
exports.cargarCodigos = async (req, res) => {
    let { acuerdo_id, canal_id, codigos, producto_id } = req.body; 
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        
        // Si no nos envían producto_id manual, buscamos el del acuerdo
        if (!producto_id) {
            const resAcuerdo = await client.query('SELECT producto_asociado_id FROM acuerdos_comerciales WHERE id = $1', [acuerdo_id]);
            if (resAcuerdo.rows.length > 0) {
                producto_id = resAcuerdo.rows[0].producto_asociado_id;
            }
        }

        if (!producto_id) {
            throw new Error("No se especificó un producto para descontar inventario.");
        }
        
        let insertados = 0;
        let duplicados = 0;

        for (const cod of codigos) {
            const res = await client.query(
                `INSERT INTO codigos_externos (canal_id, acuerdo_id, codigo_unico, producto_asociado_id)
                 VALUES ($1, $2, $3, $4) 
                 ON CONFLICT (codigo_unico) DO NOTHING RETURNING id`,
                [canal_id, acuerdo_id, cod, producto_id]
            );
            if (res.rows.length > 0) insertados++;
            else duplicados++;
        }

        await client.query('COMMIT');
        res.json({ msg: "Proceso terminado", insertados, duplicados });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
};

// 5. 🔥 VALIDACIÓN EN PUERTA (MODIFICADO: STATUS 200 SIEMPRE)
exports.validarYCanjear = async (req, res) => {
    const { codigo } = req.body;
    const sedeId = req.usuario.sede_id;
    const usuarioId = req.usuario.id;

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // A. Buscar código
        const resCodigo = await client.query(
            `SELECT c.*, 
                    p.nombre as nombre_producto, 
                    p.id as prod_id, 
                    p.costo_compra,
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

            await client.query(
                "UPDATE inventario_sedes SET cantidad = cantidad - 1 WHERE producto_id = $1 AND sede_id = $2",
                [infoCodigo.prod_id, sedeId]
            );

            await client.query(
                `INSERT INTO movimientos_inventario 
                (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                 VALUES ($1, $2, $3, 'salida_canje', -1, $4, $5, $6)`,
                [sedeId, infoCodigo.prod_id, usuarioId, stockActual - 1, `Canje Externo: ${codigo}`, infoCodigo.costo_compra || 0]
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
        
        // ✅ RESPUESTA ÉXITOSA (Status 200 + success: true)
        res.json({ 
            success: true, 
            msg: "✅ CÓDIGO VÁLIDO - PUEDE INGRESAR", 
            producto: infoCodigo.nombre_producto,
            valor_canje: infoCodigo.precio_unitario_acordado
        });

    } catch (err) {
        await client.query('ROLLBACK');
        
        // 🚨 RESPUESTA DE "ERROR LÓGICO" (Status 200 + success: false)
        // Esto evita el mensaje rojo en la consola del navegador
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


// 9. VER DETALLE ACUERDO (ACTUALIZADA)
exports.obtenerDetalleAcuerdo = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT 
                a.descripcion, 
                a.cantidad_entradas, -- <--- AGREGADO: Para saber el límite
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

        if (result.rows.length === 0) return res.status(404).json({ error: "Acuerdo no encontrado" });
        res.json(result.rows[0]);

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};


// 8. ELIMINAR ACUERDO (Solo si no tiene canjes realizados)
exports.eliminarAcuerdo = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Seguridad: Verificar si ya hay códigos canjeados (usados)
        const check = await client.query(
            "SELECT id FROM codigos_externos WHERE acuerdo_id = $1 AND estado = 'CANJEADO' LIMIT 1", 
            [id]
        );

        if (check.rows.length > 0) {
            throw new Error("⛔ No se puede eliminar este acuerdo porque YA TIENE CÓDIGOS USADOS por clientes.");
        }

        // 2. Eliminar códigos asociados (Limpiar lista blanca)
        await client.query("DELETE FROM codigos_externos WHERE acuerdo_id = $1", [id]);

        // 3. Eliminar cuotas asociadas (Si las hubiera)
        await client.query("DELETE FROM cuotas_acuerdos WHERE acuerdo_id = $1", [id]);

        // 4. Eliminar el acuerdo principal
        await client.query("DELETE FROM acuerdos_comerciales WHERE id = $1", [id]);

        await client.query('COMMIT');
        res.json({ msg: "✅ Acuerdo y sus códigos eliminados correctamente." });

    } catch (err) {
        await client.query('ROLLBACK');
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

// 12. REGISTRAR PAGO DE CUOTA (SOLUCIÓN FINAL: SIN COLUMNA 'ESTADO') 💰
exports.pagarCuota = async (req, res) => {
    const { id } = req.params; 
    const { metodo_pago, sede_destino } = req.body; 
    
    const usuarioId = req.usuario.id;
    // Si el frontend no manda sede, usamos la del usuario actual
    const sedeId = sede_destino || req.usuario.sede_id; 

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Verificar Cuota + Acuerdo + Canal (JOIN TRIPLE CORRECTO)
        const resCuota = await client.query(`
            SELECT 
                c.*, 
                ce.nombre as empresa,  -- Nombre de la empresa (Canal)
                a.descripcion 
            FROM cuotas_acuerdos c
            JOIN acuerdos_comerciales a ON c.acuerdo_id = a.id
            JOIN canales_externos ce ON a.canal_id = ce.id
            WHERE c.id = $1
        `, [id]);

        if (resCuota.rows.length === 0) throw new Error("Cuota no encontrada");
        const cuota = resCuota.rows[0];

        if (cuota.estado === 'PAGADO') throw new Error("Esta cuota ya está pagada.");

        // 2. Definir Método de Pago
        const metodoFinal = metodo_pago || 'TRANSFERENCIA';

        // 3. Registrar en CAJA (CORREGIDO: SIN COLUMNA 'ESTADO')
        const desc = `Cobro B2B: ${cuota.empresa} - Cuota #${cuota.numero_cuota} (${cuota.descripcion})`;
        
        await client.query(`
            INSERT INTO movimientos_caja 
            (sede_id, usuario_id, tipo_movimiento, categoria, monto, descripcion, metodo_pago, fecha_registro)
            VALUES ($1, $2, 'INGRESO', 'Ingresos Varios (Caja)', $3, $4, $5, NOW())
        `, [sedeId, usuarioId, cuota.monto, desc, metodoFinal]);

        // 4. Actualizar estado de la cuota (Aquí SÍ existe estado)
        await client.query(`
            UPDATE cuotas_acuerdos 
            SET estado = 'PAGADO', fecha_pago = NOW(), metodo_pago = $2
            WHERE id = $1
        `, [id, metodoFinal]);

        await client.query('COMMIT');
        res.json({ msg: "✅ Pago registrado correctamente en caja." });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error en pagarCuota:", err.message); 
        res.status(500).json({ error: "Error interno: " + err.message });
    } finally {
        client.release();
    }
};


// 13. EDITAR CUOTA (CON CREACIÓN AUTOMÁTICA DE SALDOS) 🧠
exports.editarCuota = async (req, res) => {
    const { id } = req.params;
    const { nuevo_monto, nueva_fecha } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // A. Obtener datos de la cuota ACTUAL antes de editar
        const resActual = await client.query("SELECT * FROM cuotas_acuerdos WHERE id = $1", [id]);
        if(resActual.rows.length === 0) throw new Error("Cuota no encontrada");
        
        const cuotaActual = resActual.rows[0];
        const montoAnterior = parseFloat(cuotaActual.monto);
        const montoNuevoFloat = parseFloat(nuevo_monto);
        
        // Calculamos la diferencia
        // Ej: Era 100, Ahora pone 60. Diferencia = +40 (Falta cobrar)
        const diferencia = montoAnterior - montoNuevoFloat; 

        // B. Actualizar la cuota ACTUAL con el nuevo monto reducido
        await client.query(`
            UPDATE cuotas_acuerdos 
            SET monto = $1, fecha_vencimiento = $2
            WHERE id = $3
        `, [montoNuevoFloat, nueva_fecha, id]);

        // C. GESTIONAR LA DIFERENCIA (Saldos)
        // Solo si sobra dinero (diferencia positiva > 0.01 centavos)
        if (diferencia > 0.01) {
            
            // 1. Buscamos si existe una "Siguiente Cuota"
            const resSiguiente = await client.query(`
                SELECT id, monto FROM cuotas_acuerdos 
                WHERE acuerdo_id = $1 AND numero_cuota > $2 AND estado = 'PENDIENTE'
                ORDER BY numero_cuota ASC 
                LIMIT 1
            `, [cuotaActual.acuerdo_id, cuotaActual.numero_cuota]);

            if (resSiguiente.rows.length > 0) {
                // ESCENARIO 1: Existe una cuota después. Le sumamos la deuda.
                const siguiente = resSiguiente.rows[0];
                const nuevoMontoSiguiente = parseFloat(siguiente.monto) + diferencia;
                
                await client.query("UPDATE cuotas_acuerdos SET monto = $1 WHERE id = $2", [nuevoMontoSiguiente, siguiente.id]);
                
            } else {
                // ESCENARIO 2: NO existe siguiente (Era la última). CREAMOS UNA NUEVA. 🔥
                
                // Calculamos nueva fecha (30 días después de la fecha editada)
                const fechaBase = new Date(nueva_fecha);
                fechaBase.setDate(fechaBase.getDate() + 30); // Sumar 30 días
                
                const siguienteNumero = parseInt(cuotaActual.numero_cuota) + 1;

                await client.query(`
                    INSERT INTO cuotas_acuerdos 
                    (acuerdo_id, numero_cuota, monto, fecha_vencimiento, estado)
                    VALUES ($1, $2, $3, $4, 'PENDIENTE')
                `, [cuotaActual.acuerdo_id, siguienteNumero, diferencia, fechaBase]);
            }
        }

        await client.query('COMMIT');
        res.json({ msg: "Cuota actualizada. Se generó saldo pendiente si existía diferencia." });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
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

// 15. 🔥 GENERAR CÓDIGOS AUTOMÁTICOS (NUEVO)
exports.generarCodigosAutomaticos = async (req, res) => {
    const { acuerdo_id, cantidad, prefijo } = req.body;
    
    // Validaciones básicas
    if (!acuerdo_id || !cantidad || cantidad <= 0) {
        return res.status(400).json({ error: "Datos inválidos (Falta acuerdo o cantidad)." });
    }
    
    const PREFIJO = (prefijo || "GEN").toUpperCase().trim();
    const CANTIDAD = parseInt(cantidad);
    
    // Límite de seguridad para no colgar el servidor
    if (CANTIDAD > 5000) return res.status(400).json({ error: "Máximo 5000 códigos por lote." });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener datos del acuerdo para saber qué producto es
        const resAcuerdo = await client.query('SELECT producto_asociado_id, canal_id FROM acuerdos_comerciales WHERE id = $1', [acuerdo_id]);
        
        if (resAcuerdo.rows.length === 0) throw new Error("Acuerdo no encontrado.");
        
        const { producto_asociado_id, canal_id } = resAcuerdo.rows[0];

        // 2. Generar Array de Códigos en Memoria
        // Usamos Set para garantizar unicidad en memoria antes de intentar insertar
        const codigosGenerados = new Set();
        
        while (codigosGenerados.size < CANTIDAD) {
            // Generamos parte aleatoria: 4 letras + 4 números (Ej: A7X2-9M1P)
            const randomPart = Math.random().toString(36).substring(2, 10).toUpperCase();
            const codigoFinal = `${PREFIJO}-${randomPart}`;
            codigosGenerados.add(codigoFinal);
        }

        // 3. Insertar en Base de Datos (Bulk Insert optimizado)
        let insertados = 0;
        
        for (const codigo of codigosGenerados) {
            // Intentamos insertar. Si existe (colisión rara), simplemente lo ignoramos.
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
            msg: "Generación completada", 
            solicitados: CANTIDAD, 
            generados_reales: insertados 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ error: "Error generando códigos: " + err.message });
    } finally {
        client.release();
    }
};