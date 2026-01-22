//Ubicación: SuperNova/backend/controllers/analiticaController.js
const pool = require('../db');

// 1. P&L Detallado (CORREGIDO: SEPARANDO CANJES DE MERMAS)
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
                -- A. PAGOS DE EVENTOS
                SELECT
                    e.sede_id, s.nombre AS nombre_sede, 'Eventos' AS categoria,
                    pe.monto AS ingreso, 0 AS egreso
                FROM pagos_evento pe
                JOIN eventos e ON pe.evento_id = e.id
                JOIN sedes s ON e.sede_id = s.id
                WHERE pe.fecha_pago >= $1::date AND pe.fecha_pago < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR e.sede_id = $3::int)

                UNION ALL

                -- B. VENTAS POS (Tickets)
                SELECT
                    v.sede_id, s.nombre AS nombre_sede,
                    CASE 
                        WHEN UPPER(v.linea_negocio) LIKE '%CAFETERIA%' THEN 'Cafetería'
                        WHEN UPPER(v.linea_negocio) LIKE '%TAQUILLA%' THEN 'Taquilla'
                        WHEN UPPER(v.linea_negocio) LIKE '%MERCH%' THEN 'Merchandising'
                        ELSE 'Otros Ingresos'
                    END AS categoria,
                    COALESCE(v.subtotal, v.total_venta / 1.18) AS ingreso, 
                    0 AS egreso
                FROM ventas v
                JOIN sedes s ON v.sede_id = s.id
                WHERE v.fecha_venta >= $1::date AND v.fecha_venta < ($2::date + interval '1 day')
                AND v.estado IN ('completado', 'pagado', 'cerrado')
                AND ($3::int IS NULL OR v.sede_id = $3::int)

                UNION ALL

                -- C. INGRESOS MANUALES DE CAJA
                SELECT 
                    mc.sede_id, s.nombre AS nombre_sede, 'Ingresos Varios (Caja)' AS categoria,
                    mc.monto AS ingreso, 0 AS egreso
                FROM movimientos_caja mc
                JOIN sedes s ON mc.sede_id = s.id
                WHERE mc.tipo_movimiento = 'INGRESO'
                AND mc.categoria != 'VENTA_POS'
                AND mc.fecha_registro >= $1::date AND mc.fecha_registro < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR mc.sede_id = $3::int)
            ),
            
            Egresos AS (
                -- D. MERMAS (Excluyendo Canjes)
                SELECT
                    mi.sede_id, s.nombre AS nombre_sede, 'Mermas' AS categoria,
                    0 as ingreso, (ABS(mi.cantidad) * COALESCE(mi.costo_unitario_movimiento, 0)) as egreso
                FROM movimientos_inventario mi
                JOIN sedes s ON mi.sede_id = s.id
                WHERE mi.cantidad < 0
                AND mi.tipo_movimiento NOT ILIKE '%venta%'
                AND mi.tipo_movimiento NOT ILIKE '%anulacion%'
                AND mi.tipo_movimiento != 'salida_canje' -- 🔥 CAMBIO 1: EXCLUIMOS CANJES DE AQUÍ
                AND mi.fecha >= $1::date AND mi.fecha < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR mi.sede_id = $3::int)
                
                UNION ALL

                -- E. COSTO OPERATIVO POR CANJES (NUEVO)
                SELECT
                    mi.sede_id, s.nombre AS nombre_sede, 'Costo Operativo (Canjes)' AS categoria,
                    0 as ingreso, (ABS(mi.cantidad) * COALESCE(mi.costo_unitario_movimiento, 0)) as egreso
                FROM movimientos_inventario mi
                JOIN sedes s ON mi.sede_id = s.id
                WHERE mi.tipo_movimiento = 'salida_canje' -- 🔥 CAMBIO 2: CLASIFICAMOS AQUÍ
                AND mi.fecha >= $1::date AND mi.fecha < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR mi.sede_id = $3::int)

                UNION ALL
                
                -- F. GASTOS OPERATIVOS (Caja)
                SELECT
                    mc.sede_id, s.nombre AS nombre_sede, 'Gastos Operativos' AS categoria,
                    0 AS ingreso, mc.monto AS egreso
                FROM movimientos_caja mc
                JOIN sedes s ON mc.sede_id = s.id
                WHERE mc.tipo_movimiento = 'EGRESO'
                AND mc.fecha_registro >= $1::date AND mc.fecha_registro < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR mc.sede_id = $3::int)
            ),
            
            Todo AS ( SELECT * FROM Ingresos UNION ALL SELECT * FROM Egresos )

            SELECT
                nombre_sede, categoria,
                ROUND(COALESCE(SUM(ingreso), 0)::numeric, 2) AS ingresos,
                ROUND(COALESCE(SUM(egreso), 0)::numeric, 2) AS egresos,
                ROUND((COALESCE(SUM(ingreso), 0) - COALESCE(SUM(egreso), 0))::numeric, 2) AS pnl
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

// 2. KPIs OPERATIVOS
exports.obtenerKpisEventos = async (req, res) => {
    const rol = req.usuario ? req.usuario.rol.toLowerCase() : '';
    const esSuperAdmin = ['admin', 'administrador', 'gerente', 'superadmin'].includes(rol);
    const usuarioSedeId = req.usuario.sede_id;

    let sedeId = req.query.sede || null;
    if (!esSuperAdmin) sedeId = usuarioSedeId;
    
    const fechaInicio = new Date();
    fechaInicio.setDate(1); 
    const startStr = fechaInicio.toISOString().slice(0, 10);

    try {
        const leadsQuery = `SELECT COUNT(*) FROM leads WHERE fecha_creacion >= $1 AND ($2::int IS NULL OR sede_interes = $2::int)`;
        const eventosQuery = `SELECT COUNT(*) FROM eventos WHERE fecha_creacion >= $1 AND estado IN ('confirmado', 'celebrado') AND ($2::int IS NULL OR sede_id = $2::int)`;
        const ticketQuery = `
            SELECT AVG(monto) as promedio FROM (
                SELECT total_venta as monto FROM ventas WHERE fecha_venta >= $1 AND ($2::int IS NULL OR sede_id = $2::int)
                UNION ALL
                SELECT costo_total as monto FROM eventos WHERE fecha_creacion >= $1 AND ($2::int IS NULL OR sede_id = $2::int)
            ) as unificado
        `;

        const [resLeads, resEventos, resTicket] = await Promise.all([
            pool.query(leadsQuery, [startStr, sedeId]),
            pool.query(eventosQuery, [startStr, sedeId]),
            pool.query(ticketQuery, [startStr, sedeId])
        ]);

        const totalLeads = parseInt(resLeads.rows[0].count) || 0;
        const totalExitos = parseInt(resEventos.rows[0].count) || 0; 
        const ticketPromedio = parseFloat(resTicket.rows[0].promedio) || 0;
        const conversion = totalLeads > 0 ? ((totalExitos / totalLeads) * 100).toFixed(1) : 0;

        res.json({
            leads: totalLeads,
            eventos: totalExitos,
            conversion: conversion,
            ticketPromedio: ticketPromedio.toFixed(2)
        });

    } catch (err) {
        console.error("Error KPIs:", err.message);
        res.status(500).json({ msg: 'Error cargando KPIs' });
    }
};

// 3. RESUMEN GLOBAL RÁPIDO
exports.obtenerResumenGlobal = async (req, res) => {
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

// 4. RESUMEN DEL DÍA
exports.obtenerResumenDia = async (req, res) => {
    const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
    const esAdmin = ['admin', 'administrador', 'gerente', 'superadmin'].includes(rol);
    const sedeId = req.usuario.sede_id; 
    const hoy = new Date().toISOString().slice(0, 10);

    try {
        const filtroSede = esAdmin ? "" : "AND sede_id = $2";
        const params = esAdmin ? [hoy] : [hoy, sedeId];

        const cajaQuery = `SELECT COALESCE(SUM(monto), 0) as total FROM movimientos_caja WHERE tipo_movimiento = 'INGRESO' AND fecha_registro::date = $1 ${filtroSede}`;
        const eventosQuery = `SELECT COUNT(*) as cantidad FROM eventos WHERE fecha_inicio::date = $1 AND estado != 'cancelado' ${filtroSede}`;

        const [resCaja, resEventos] = await Promise.all([
            pool.query(cajaQuery, params),
            pool.query(eventosQuery, params)
        ]);

        res.json({
            ventasHoy: parseFloat(resCaja.rows[0].total),
            eventosHoy: parseInt(resEventos.rows[0].cantidad)
        });

    } catch (err) {
        console.error("Error Resumen Día:", err.message);
        res.status(500).json({ msg: 'Error al cargar resumen.' });
    }
};


// 5. NUEVO: DATOS PARA GRÁFICOS AVANZADOS
exports.obtenerGraficosAvanzados = async (req, res) => {
    const rol = req.usuario ? req.usuario.rol.toLowerCase() : '';
    const esSuperAdmin = ['admin', 'administrador', 'gerente', 'superadmin'].includes(rol);
    const usuarioSedeId = req.usuario.sede_id;

    let sedeId = req.query.sede || null;
    if (!esSuperAdmin) sedeId = usuarioSedeId;

    const startMonth = req.query.inicio || '2023-01-01'; 
    const endMonth = req.query.fin || '2030-12-31';

    try {
        // Filtros comunes
        const whereClause = `
            WHERE v.fecha_venta >= $1::date 
            AND v.fecha_venta < ($2::date + interval '1 day')
            AND v.estado IN ('completado', 'pagado', 'cerrado')
            AND ($3::int IS NULL OR v.sede_id = $3::int)
        `;
        const params = [startMonth, endMonth, sedeId];

        // A. EVOLUCIÓN DIARIA (Venta Neta)
        const queryEvolucion = `
            SELECT TO_CHAR(v.fecha_venta, 'YYYY-MM-DD') as fecha, 
                   SUM(COALESCE(v.subtotal, v.total_venta / 1.18)) as total
            FROM ventas v
            ${whereClause}
            GROUP BY 1 ORDER BY 1 ASC
        `;

        // B. TOP 5 PRODUCTOS (Por Cantidad)
        const queryTop = `
            SELECT dv.nombre_producto_historico as producto, SUM(dv.cantidad) as cantidad
            FROM detalle_ventas dv
            JOIN ventas v ON dv.venta_id = v.id
            ${whereClause}
            GROUP BY 1 ORDER BY 2 DESC LIMIT 5
        `;

        // C. MÉTODOS DE PAGO
        const queryPagos = `
            SELECT v.metodo_pago, COUNT(*) as transacciones, SUM(v.total_venta) as total
            FROM ventas v
            ${whereClause}
            GROUP BY 1 ORDER BY 3 DESC
        `;

        // D. HORAS PUNTA
        const queryHoras = `
            SELECT EXTRACT(HOUR FROM v.fecha_venta) as hora, COUNT(*) as cantidad
            FROM ventas v
            ${whereClause}
            GROUP BY 1 ORDER BY 1 ASC
        `;

        const [resEvo, resTop, resPagos, resHoras] = await Promise.all([
            pool.query(queryEvolucion, params),
            pool.query(queryTop, params),
            pool.query(queryPagos, params),
            pool.query(queryHoras, params)
        ]);

        res.json({
            evolucion: resEvo.rows,
            top: resTop.rows,
            pagos: resPagos.rows,
            horas: resHoras.rows
        });

    } catch (err) {
        console.error("Error Gráficos Avanzados:", err.message);
        res.status(500).json({ msg: 'Error al cargar gráficos.' });
    }
};