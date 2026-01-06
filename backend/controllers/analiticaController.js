// Ubicacion: SuperNova/backend/controllers/analiticaController.js
const pool = require('../db');

// 1. P&L Detallado por Sede y Categoría
exports.obtenerPyL = async (req, res) => {
    // 1. Seguridad
    const usuarioRol = req.usuario ? req.usuario.rol : '';
    if (!['admin', 'administrador', 'gerente'].includes(usuarioRol.toLowerCase())) {
        return res.status(403).json({ msg: 'Acceso denegado.' });
    }
    
    // 2. Filtros de Fecha (A prueba de balas)
    const startMonth = req.query.inicio || '2023-01-01'; 
    // Usamos el truco del día siguiente para no fallar con las horas
    const endMonth = req.query.fin || '2030-12-31';
    const sedeId = req.query.sede || null;
    
    try {
        const query = `
            WITH Ingresos AS (
                -- A. PAGOS DE EVENTOS (MODO CAJA: Cuenta cuando entra el dinero)
                -- Antes mirábamos la tabla 'eventos', ahora miramos 'pagos_evento'
                SELECT
                    e.sede_id,
                    s.nombre AS nombre_sede,
                    'Eventos' AS categoria,
                    pe.monto AS ingreso,
                    0 AS egreso
                FROM pagos_evento pe
                JOIN eventos e ON pe.evento_id = e.id
                JOIN sedes s ON e.sede_id = s.id
                WHERE pe.fecha_pago >= $1::date 
                AND pe.fecha_pago < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR e.sede_id = $3::int)

                UNION ALL

                -- B. VENTAS POS (Cafetería, Taquilla, etc.)
                SELECT
                    v.sede_id,
                    s.nombre AS nombre_sede,
                    CASE 
                        WHEN UPPER(v.linea_negocio) LIKE '%CAFETERIA%' THEN 'Cafetería'
                        WHEN UPPER(v.linea_negocio) LIKE '%TAQUILLA%' THEN 'Taquilla'
                        WHEN UPPER(v.linea_negocio) LIKE '%MERCH%' THEN 'Merchandising'
                        ELSE 'Otros Ingresos'
                    END AS categoria,
                    v.total_venta AS ingreso,
                    0 AS egreso
                FROM ventas v
                JOIN sedes s ON v.sede_id = s.id
                WHERE v.fecha_venta >= $1::date 
                AND v.fecha_venta < ($2::date + interval '1 day')
                AND v.estado IN ('completado', 'pagado', 'cerrado')
                AND ($3::int IS NULL OR v.sede_id = $3::int)
            ),
            
            Egresos AS (
                -- C. MERMAS (Inventario)
                SELECT
                    mi.sede_id, s.nombre AS nombre_sede, 'Mermas' AS categoria,
                    0 as ingreso, (ABS(mi.cantidad) * COALESCE(mi.costo_unitario_movimiento, 0)) as egreso
                FROM movimientos_inventario mi
                JOIN sedes s ON mi.sede_id = s.id
                WHERE mi.tipo_movimiento ILIKE ANY(ARRAY['%merma%', '%baja%', '%salida%', '%ajuste%', '%perdida%'])
                AND mi.fecha >= $1::date 
                AND mi.fecha < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR mi.sede_id = $3::int)
                
                UNION ALL
                
                -- D. GASTOS OPERATIVOS
                SELECT
                    mc.sede_id, s.nombre AS nombre_sede, 'Gastos Operativos' AS categoria,
                    0 AS ingreso, mc.monto AS egreso
                FROM movimientos_caja mc
                JOIN sedes s ON mc.sede_id = s.id
                WHERE mc.tipo_movimiento = 'EGRESO'
                AND mc.fecha_registro >= $1::date 
                AND mc.fecha_registro < ($2::date + interval '1 day')
                AND ($3::int IS NULL OR mc.sede_id = $3::int)
            ),
            
            Todo AS ( SELECT * FROM Ingresos UNION ALL SELECT * FROM Egresos )

            SELECT
                nombre_sede,
                categoria,
                COALESCE(SUM(ingreso), 0) AS ingresos,
                COALESCE(SUM(egreso), 0) AS egresos,
                (COALESCE(SUM(ingreso), 0) - COALESCE(SUM(egreso), 0)) AS pnl
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

// Función auxiliar (ponla al final del archivo o fuera del export)
function formatearCategoria(cat) {
    if(!cat) return 'Otros';
    const c = cat.toUpperCase();
    if(c.includes('TAQUILLA')) return 'Taquilla';
    if(c.includes('CAFETERIA')) return 'Cafetería';
    if(c.includes('MERCH')) return 'Merchandising';
    if(c.includes('EVENTO')) return 'Eventos';
    if(c.includes('MERMA')) return 'Mermas';
    if(c.includes('GASTOS')) return 'Gastos';
    return 'Otros';
}

// 2. KPIs OPERATIVOS (Conversión y Ticket Promedio)
exports.obtenerKpisEventos = async (req, res) => {
    const sedeId = req.query.sede || null;
    
    // Filtro de mes actual
    const fechaInicio = new Date();
    fechaInicio.setDate(1); 
    const startStr = fechaInicio.toISOString().slice(0, 10);

    try {
        // A. TOTAL LEADS (Universo total de oportunidades)
        const leadsQuery = `
            SELECT COUNT(*) FROM leads 
            WHERE fecha_creacion >= $1 
            AND ($2::int IS NULL OR sede_interes = $2::int)
        `;

        // B. CONVERSIONES REALES (SOLO PAGADOS AL 100%)
        // 🚨 CAMBIO AQUÍ: Quitamos 'reservado'. Solo contamos 'confirmado' o 'celebrado'.
        const eventosQuery = `
            SELECT COUNT(*) FROM eventos 
            WHERE fecha_creacion >= $1 
            AND estado IN ('confirmado', 'celebrado') -- 👈 AQUÍ ESTÁ EL FILTRO ESTRICTO
            AND ($2::int IS NULL OR sede_id = $2::int)
        `;
        
        // C. TICKET PROMEDIO
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
        const totalExitos = parseInt(resEventos.rows[0].count) || 0; // Ahora solo cuenta los cerrados
        const ticketPromedio = parseFloat(resTicket.rows[0].promedio) || 0;

        // Cálculo
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
// 3. RESUMEN GLOBAL RÁPIDO (Para tarjetas de cabecera)
// 3. RESUMEN GLOBAL RÁPIDO (Para tarjetas de cabecera: Ingresos, Egresos, Utilidad)
exports.obtenerResumenGlobal = async (req, res) => {
    // 1. Recibimos los filtros del Frontend (Igual que hiciste en el P&L)
    const sedeId = req.query.sede || null;
    
    // Si el frontend no manda fechas, usamos la fecha de hoy por defecto
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

        // Pasamos las fechas dinámicas a la consulta ($2 y $3)
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

// 3. RESUMEN DEL DÍA (Para el Dashboard Principal)
exports.obtenerResumenDia = async (req, res) => {
    // 1. Detectar Rol y Sede
    const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
    const esAdmin = ['admin', 'administrador', 'gerente'].includes(rol);
    const sedeId = req.usuario.sede_id; 
    
    // 2. Fecha de Hoy
    const hoy = new Date().toISOString().slice(0, 10);

    try {
        // Construimos el filtro dinámicamente
        // Si NO es admin, filtramos por su sede. Si ES admin, no filtramos (ve todo).
        const filtroSede = esAdmin ? "" : "AND sede_id = $2";
        const params = esAdmin ? [hoy] : [hoy, sedeId]; // Ajustamos los parámetros según el filtro

        // A. Ventas del día (Caja - Ingresos)
        const cajaQuery = `
            SELECT COALESCE(SUM(monto), 0) as total 
            FROM movimientos_caja 
            WHERE tipo_movimiento = 'INGRESO' 
            AND fecha_registro::date = $1
            ${filtroSede}
        `;
        
        // B. Eventos del día (Calendario)
        const eventosQuery = `
            SELECT COUNT(*) as cantidad 
            FROM eventos 
            WHERE fecha_inicio::date = $1
            AND estado != 'cancelado'
            ${filtroSede}
        `;

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