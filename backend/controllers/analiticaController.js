// Ubicación: SuperNova/backend/controllers/analiticaController.js
const pool = require('../db');

// 1. P&L Detallado (CORRECCIÓN FINAL: SIN DUPLICADOS)
exports.obtenerPyL = async (req, res) => {
    const rol = req.usuario ? req.usuario.rol.toLowerCase() : '';
    const esSuperAdmin = ['admin', 'administrador', 'gerente', 'superadmin'].includes(rol);
    const usuarioSedeId = req.usuario.sede_id;

    const startMonth = req.query.inicio || '2023-01-01'; 
    const endMonth = req.query.fin || '2030-12-31';
    
    let sedeId = req.query.sede || null;
    if (!esSuperAdmin) sedeId = usuarioSedeId;
    
    try {
        const query = `
            WITH Ingresos AS (
                -- A. ABONOS REALES DE CUMPLEAÑOS (La fuente primaria de eventos)
                SELECT
                    e.sede_id, s.nombre AS nombre_sede, 'Cumpleaños' AS categoria,
                    pe.monto AS ingreso, 0 AS egreso
                FROM pagos_evento pe
                JOIN eventos e ON pe.evento_id = e.id
                JOIN sedes s ON e.sede_id = s.id
                WHERE pe.fecha_pago >= $1::date AND pe.fecha_pago < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR e.sede_id = $3::int)

                UNION ALL

                -- B. VENTAS POS (Solo productos normales, filtrando para NO duplicar eventos)
                SELECT
                    v.sede_id, s.nombre AS nombre_sede,
                    CASE 
                        WHEN p.tipo_item = 'combo' THEN 'Combos'
                        WHEN p.tipo_item = 'servicio' THEN 'Servicios'
                        WHEN UPPER(p.categoria) LIKE '%CAFETERIA%' THEN 'Cafetería'
                        WHEN UPPER(p.categoria) LIKE '%TAQUILLA%' THEN 'Taquilla'
                        WHEN UPPER(p.categoria) LIKE '%MERCH%' THEN 'Merchandising'
                        WHEN UPPER(p.categoria) LIKE '%ARCADE%' OR UPPER(p.categoria) LIKE '%JUEGO%' THEN 'Arcade'
                        ELSE 'Ventas Generales'
                    END AS categoria,
                    dv.subtotal AS ingreso, 
                    0 AS egreso
                FROM detalle_ventas dv
                JOIN ventas v ON dv.venta_id = v.id
                LEFT JOIN productos p ON dv.producto_id = p.id
                JOIN sedes s ON v.sede_id = s.id
                WHERE v.fecha_venta >= $1::date AND v.fecha_venta < ($2::date + interval '1 day')
                AND v.estado IN ('completado', 'pagado', 'cerrado')
                AND v.sunat_estado != 'ANULADA' 
                -- 🛡️ EVITAR DUPLICADOS: No sumar ventas que ya vienen del CRM o de CANJES
                AND v.linea_negocio != 'EVENTOS'
                AND v.origen NOT IN ('CRM', 'CRM_SALDO', 'COBRO_CUOTA') -- 🔥 AQUI ESTÁ LA MAGIA
                AND ($3::int IS NULL OR v.sede_id = $3::int)

                UNION ALL

                -- D. INGRESOS POR CANJES / TERCEROS
                SELECT
                    u.sede_id, s.nombre AS nombre_sede, 'Canje / Tercero' AS categoria,
                    pa.monto AS ingreso, 0 AS egreso
                FROM pagos_acuerdos pa
                JOIN acuerdos_comerciales ac ON pa.acuerdo_id = ac.id
                JOIN usuarios u ON ac.usuario_id = u.id  
                JOIN sedes s ON u.sede_id = s.id         
                WHERE pa.fecha_pago >= $1::date AND pa.fecha_pago < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR u.sede_id = $3::int)
            ),
            
            Egresos AS (
                -- E. MERMAS
                SELECT
                    mi.sede_id, s.nombre AS nombre_sede, 'Inventario: Mermas' AS categoria,
                    0 as ingreso, (ABS(mi.cantidad) * COALESCE(mi.costo_unitario_movimiento, 0)) as egreso
                FROM movimientos_inventario mi
                JOIN sedes s ON mi.sede_id = s.id
                WHERE mi.cantidad < 0
                AND mi.tipo_movimiento NOT ILIKE '%venta%'
                AND mi.tipo_movimiento NOT ILIKE '%anulacion%'
                AND mi.tipo_movimiento != 'salida_canje'
                AND mi.fecha >= $1::date AND mi.fecha < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR mi.sede_id = $3::int)
                
                UNION ALL
                
                -- G. GASTOS OPERATIVOS (Caja)
                SELECT
                    mc.sede_id, s.nombre AS nombre_sede, 
                    CONCAT('Caja Gasto: ', COALESCE(NULLIF(TRIM(mc.categoria), ''), 'Operativo')) AS categoria,
                    0 AS ingreso, mc.monto AS egreso
                FROM movimientos_caja mc
                JOIN sedes s ON mc.sede_id = s.id
                WHERE mc.tipo_movimiento = 'EGRESO'
                AND mc.fecha_registro >= $1::date AND mc.fecha_registro < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR mc.sede_id = $3::int)

                UNION ALL
                
                -- H. GASTOS POR FACTURAS (Cuentas por Pagar)
                SELECT 
                    f.sede_id, s.nombre, 
                    CONCAT('Factura: ', COALESCE(NULLIF(TRIM(f.clasificacion), ''), 'General')) AS categoria,
                    0 AS ingreso, 
                    -- 🔥 AHORA SÍ: Usamos las columnas reales de tu base de datos
                    CASE 
                        WHEN f.estado_pago = 'parcial' THEN COALESCE(f.monto_aprobado, 0)
                        WHEN f.estado_pago = 'pagado' THEN COALESCE(f.monto_total, 0)
                        ELSE 0
                    END AS egreso
                FROM facturas f
                JOIN sedes s ON f.sede_id = s.id
                WHERE f.estado_pago IN ('pagado', 'parcial') 
                AND f.fecha_emision >= $1::date AND f.fecha_emision < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR f.sede_id = $3::int)
            ),
            
            Todo AS ( SELECT * FROM Ingresos UNION ALL SELECT * FROM Egresos )

            SELECT
                nombre_sede, categoria,
                SUM(ingreso) AS ingresos,
                SUM(egreso) AS egresos,
                (SUM(ingreso) - SUM(egreso)) AS pnl
            FROM Todo
            GROUP BY nombre_sede, categoria
            ORDER BY nombre_sede, ingresos DESC;
        `;
        
        const result = await pool.query(query, [startMonth, endMonth, sedeId]); 
        const rows = result.rows.map(r => ({ ...r, categoria: r.categoria }));
        res.json(rows);

    } catch (err) {
        console.error("Error P&L:", err.message);
        res.status(500).json({ msg: 'Error al generar reporte.' });
    }
};

// 2. KPIs OPERATIVOS (CORREGIDO: Fechas dinámicas, Ticket Promedio separado y UPPER aplicado)
exports.obtenerKpisEventos = async (req, res) => {
    const rol = req.usuario ? req.usuario.rol.toLowerCase() : '';
    const esSuperAdmin = ['admin', 'administrador', 'gerente', 'superadmin'].includes(rol);
    const usuarioSedeId = req.usuario.sede_id;

    let sedeId = req.query.sede || null;
    if (!esSuperAdmin) sedeId = usuarioSedeId;
    
    const startStr = req.query.inicio || '2023-01-01';
    const endStr = req.query.fin || '2030-12-31';

    try {
        // 1. Conteo de Leads (Oportunidades)
        const leadsQuery = `
            SELECT COUNT(*)::int as count 
            FROM leads 
            WHERE fecha_creacion >= $1::date AND fecha_creacion < ($2::date + interval '1 day') 
            AND ($3::int IS NULL OR sede_interes = $3::int)
        `;

        // 2. Conteo de Eventos Confirmados/Celebrados (Éxitos) - CORREGIDO CON UPPER
        const eventosQuery = `
            SELECT COUNT(*)::int as count 
            FROM eventos 
            WHERE fecha_creacion >= $1::date AND fecha_creacion < ($2::date + interval '1 day') 
            AND UPPER(estado) IN ('CONFIRMADO', 'CELEBRADO') 
            AND ($3::int IS NULL OR sede_id = $3::int)
        `;
        
        // 3. Ticket Promedio Ventas POS (Cafetería, Taquilla, etc.) - CORREGIDO CON UPPER Y ALIAS
        // Filtramos total_venta > 0 para no promediar anulaciones o errores
        const ticketVentasQuery = `
            SELECT SUM(total_venta) / NULLIF(COUNT(*), 0) as promedio
            FROM ventas 
            WHERE UPPER(linea_negocio) != 'EVENTOS' 
            AND fecha_venta >= $1::date AND fecha_venta < ($2::date + interval '1 day') 
            AND UPPER(estado) IN ('COMPLETADO', 'PAGADO', 'CERRADO') 
            AND total_venta > 0
            AND ($3::int IS NULL OR sede_id = $3::int)
        `;

        // 4. Ticket Promedio de Eventos (Valor del contrato) - CORREGIDO CON UPPER
        // Usamos SUM/COUNT en lugar de AVG para mayor control sobre los ceros
        const ticketEventosQuery = `
            SELECT SUM(costo_total) / NULLIF(COUNT(*), 0) as promedio 
            FROM eventos 
            WHERE fecha_creacion >= $1::date AND fecha_creacion < ($2::date + interval '1 day') 
            AND UPPER(estado) NOT IN ('CANCELADO', 'ANULADO') 
            AND costo_total > 0
            AND ($3::int IS NULL OR sede_id = $3::int)
        `;

        const [resLeads, resEventos, resTicketVentas, resTicketEventos] = await Promise.all([
            pool.query(leadsQuery, [startStr, endStr, sedeId]),
            pool.query(eventosQuery, [startStr, endStr, sedeId]),
            pool.query(ticketVentasQuery, [startStr, endStr, sedeId]),
            pool.query(ticketEventosQuery, [startStr, endStr, sedeId])
        ]);

        const totalLeads = resLeads.rows[0].count || 0;
        const totalExitos = resEventos.rows[0].count || 0; 
        const ticketPromedioVentas = parseFloat(resTicketVentas.rows[0].promedio) || 0;
        const ticketPromedioEventos = parseFloat(resTicketEventos.rows[0].promedio) || 0;
        
        // Cálculo de conversión: (Eventos Confirmados / Leads Totales) * 100
        const conversion = totalLeads > 0 ? ((totalExitos / totalLeads) * 100).toFixed(1) : 0;

        res.json({
            leads: totalLeads,
            eventos: totalExitos,
            conversion: conversion,
            ticketPromedio: ticketPromedioVentas.toFixed(2),
            ticketPromedioEventos: ticketPromedioEventos.toFixed(2)
        });

    } catch (err) {
        console.error("Error KPIs:", err.message);
        res.status(500).json({ msg: 'Error cargando KPIs' });
    }
};

// 3. RESUMEN GLOBAL RÁPIDO
exports.obtenerResumenGlobal = async (req, res) => {
    // ... (Tu código existente aquí o usar el genérico, dejo el tuyo resumido)
    // Para simplificar, si no hubo cambios aquí, mantén tu lógica. 
    // Por seguridad, te pongo la versión corregida de fechas:
    
    const rol = req.usuario ? req.usuario.rol.toLowerCase() : '';
    const esSuperAdmin = ['admin', 'administrador', 'gerente', 'superadmin'].includes(rol);
    const usuarioSedeId = req.usuario.sede_id;

    let sedeId = req.query.sede || null;
    if (!esSuperAdmin) sedeId = usuarioSedeId;
    
    const fechaInicio = req.query.inicio || new Date().toISOString().slice(0, 10);
    const fechaFin = req.query.fin || new Date().toISOString().slice(0, 10);

    try {
        const query = `
            SELECT 
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE 0 END), 0) AS ingresos,
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'EGRESO' THEN monto ELSE 0 END), 0) AS egresos
            FROM movimientos_caja
            WHERE fecha_registro::date >= $2::date 
              AND fecha_registro::date <= $3::date
              AND ($1::int IS NULL OR sede_id = $1::int)
        `;

        const result = await pool.query(query, [sedeId, fechaInicio, fechaFin]);
        
        const ingresos = parseFloat(result.rows[0].ingresos);
        const egresos = parseFloat(result.rows[0].egresos);
        
        res.json({
            ingresos,
            egresos,
            utilidad: ingresos - egresos,
            margen: ingresos > 0 ? ((ingresos - egresos) / ingresos * 100).toFixed(1) : 0
        });
    } catch (err) {
        console.error("Error Resumen:", err.message);
        res.status(500).json({ msg: 'Error en resumen global' });
    }
};

// 4. RESUMEN DEL DÍA (CORREGIDO: Zona Horaria manejada 100% por PostgreSQL)
exports.obtenerResumenDia = async (req, res) => {
    const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
    const esAdmin = ['admin', 'administrador', 'gerente', 'superadmin'].includes(rol);
    const sedeId = req.usuario.sede_id; 

    try {
        const filtroSede = esAdmin ? "" : "AND sede_id = $1";  
        const params = esAdmin ? [] : [sedeId];

        // 🔥 CORRECCIÓN 3: Usamos "AT TIME ZONE 'America/Lima'" directamente en SQL
        const ventasQuery = `
            SELECT COALESCE(SUM(total_venta), 0) as total 
            FROM ventas 
            WHERE fecha_venta::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
            AND UPPER(estado) IN ('COMPLETADO', 'PAGADO', 'CERRADO')
            AND sunat_estado != 'ANULADA'
            ${filtroSede}
        `;
        
        const eventosQuery = `
            SELECT COUNT(*) as cantidad 
            FROM eventos 
            WHERE fecha_inicio::date = (CURRENT_TIMESTAMP AT TIME ZONE 'America/Lima')::date
            AND estado != 'cancelado' 
            ${filtroSede}
        `;

        const [resVentas, resEventos] = await Promise.all([
            pool.query(ventasQuery, params),
            pool.query(eventosQuery, params)
        ]);

        res.json({
            ventasHoy: parseFloat(resVentas.rows[0].total),
            eventosHoy: parseInt(resEventos.rows[0].cantidad)
        });

    } catch (err) {
        console.error("Error Resumen Día:", err.message);
        res.status(500).json({ msg: 'Error al cargar resumen.' });
    }
};

// 5. GRÁFICOS AVANZADOS (ACTUALIZADO: Limpieza de nombres de productos y agrupación)
exports.obtenerGraficosAvanzados = async (req, res) => {
    // Validar usuario y permisos de sede
    const rol = (req.usuario && req.usuario.rol) ? req.usuario.rol.toLowerCase() : '';
    const esSuperAdmin = ['admin', 'administrador', 'gerente', 'superadmin'].includes(rol);
    const usuarioSedeId = (req.usuario && req.usuario.sede_id) ? req.usuario.sede_id : null;

    let sedeId = req.query.sede || null;
    if (!esSuperAdmin) sedeId = usuarioSedeId;

    const startMonth = req.query.inicio || '2023-01-01'; 
    const endMonth = req.query.fin || '2030-12-31';
    const params = [startMonth, endMonth, sedeId];

    // Cláusula base para filtrar ventas válidas
    const whereClause = `
        WHERE v.fecha_venta >= $1::date 
        AND v.fecha_venta < ($2::date + interval '1 day')
        AND v.estado IN ('completado', 'pagado', 'cerrado')
        AND v.sunat_estado != 'ANULADA'
        AND ($3::int IS NULL OR v.sede_id = $3::int)
    `;

    const safeQuery = async (label, sql, params) => {
        try {
            const res = await pool.query(sql, params);
            return res.rows;
        } catch (e) {
            console.error(`⚠️ Error en gráfico [${label}]:`, e.message);
            return []; 
        }
    };

    // A. EVOLUCIÓN DIARIA
    const sqlEvo = `
        SELECT TO_CHAR(v.fecha_venta, 'YYYY-MM-DD') as fecha, 
               SUM(v.total_venta) as total
        FROM ventas v
        ${whereClause}
        GROUP BY 1 ORDER BY 1 ASC
    `;

    // B. TOP PRODUCTOS (CORREGIDO: Excluye los items que vienen dentro de combos)
    const sqlTop = `
        SELECT 
            TRIM(
                SPLIT_PART(
                    REGEXP_REPLACE(
                        REGEXP_REPLACE(
                            REGEXP_REPLACE(dv.nombre_producto_historico, '(?i)ADELANTO RESERVA:\\s*', '', 'g'), 
                            '(?i)SALDO:\\s*', '', 'g' 
                        ),
                        '\\((.*?)\\)', '', 'g' -- Quita paréntesis para productos normales
                    ), 
                    '[', 1 -- Quita corchetes
                )
            ) as producto, 
            SUM(dv.cantidad) as cantidad
        FROM detalle_ventas dv
        JOIN ventas v ON dv.venta_id = v.id
        ${whereClause}
        
        -- 🔥 EL FILTRO MÁGICO: Excluir componentes de combos
        -- Ignoramos cualquier producto que el sistema haya marcado como (Hijo)
        AND dv.nombre_producto_historico NOT ILIKE '%(Hijo)%'
        -- Blindaje extra: Los componentes de combos siempre se registran con costo 0 para no duplicar el precio del combo padre
        AND dv.subtotal > 0 
        
        GROUP BY 1 
        HAVING SUM(dv.cantidad) > 0
        ORDER BY 2 DESC
        LIMIT 40
    `;

    // C. MÉTODOS DE PAGO
    const sqlPagos = `
        SELECT 
            CASE 
                WHEN v.metodo_pago ILIKE '%efectivo%' THEN 'Efectivo'
                WHEN v.metodo_pago ILIKE '%yape%' THEN 'Yape'
                WHEN v.metodo_pago ILIKE '%plin%' THEN 'Plin'
                WHEN v.metodo_pago ILIKE '%transferencia%' THEN 'Transferencia'
                WHEN (v.metodo_pago ILIKE '%tarjeta%' OR v.metodo_pago ILIKE '%credito%' OR v.metodo_pago ILIKE '%debito%') THEN
                    CASE 
                        WHEN v.tipo_tarjeta ILIKE '%debito%' OR v.metodo_pago ILIKE '%debito%' THEN 'Tarjeta de Débito'
                        ELSE 'Tarjeta de Crédito'
                    END
                ELSE 'Otros'
            END as metodo_pago, 
            COUNT(*)::int as transacciones, 
            ROUND(SUM(v.total_venta)::numeric, 2) as total
        FROM ventas v
        ${whereClause}
        GROUP BY 1 ORDER BY total DESC
    `;

    // D. FLUJO POR HORAS
    const sqlHoras = `
        SELECT EXTRACT(HOUR FROM v.fecha_venta)::int as hora, COUNT(*)::int as cantidad
        FROM ventas v
        ${whereClause}
        GROUP BY 1 ORDER BY 1 ASC
    `;

    // E. DESEMPEÑO DE VENDEDORES
    const sqlVendedores = `
        SELECT 
            -- 🔥 CONCAT_WS evita que el nombre sea NULL si falta el apellido
            TRIM(COALESCE(NULLIF(CONCAT_WS(' ', u.nombres, u.apellidos), ''), 'Venta Sistema/Otro')) as vendedor, 
            COUNT(*)::int as ventas_cantidad,
            ROUND(SUM(v.total_venta)::numeric, 2) as total_vendido
        FROM ventas v
        LEFT JOIN usuarios u ON v.vendedor_id = u.id
        ${whereClause}
        GROUP BY 1 
        ORDER BY total_vendido DESC 
    `;

    try {
        const [evo, top, pagos, horas, vendedores] = await Promise.all([
            safeQuery('Evolucion', sqlEvo, params),
            safeQuery('TopProductos', sqlTop, params),
            safeQuery('Pagos', sqlPagos, params),
            safeQuery('Horas', sqlHoras, params),
            safeQuery('Vendedores', sqlVendedores, params)
        ]);

        res.json({
            evolucion: evo,
            top: top,
            pagos: pagos,
            horas: horas,
            vendedores: vendedores
        });
    } catch (err) {
        console.error("Error General Gráficos:", err.message);
        res.status(500).json({ msg: 'Error al procesar datos de gráficos' });
    }
};