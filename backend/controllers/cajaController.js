// Ubicación: SuperNova/backend/controllers/cajaController.js
const pool = require('../db');

// 1. OBTENER MOVIMIENTOS (HISTORIAL CON FILTRO)
exports.obtenerMovimientos = async (req, res) => {
    try {
        if (!req.usuario) return res.status(401).json({ msg: "No autorizado" });

        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        const esAdmin = ['superadmin', 'admin', 'administrador', 'gerente'].includes(rol);
        const usuarioSedeId = req.usuario.sede_id;
        const filtroSedeId = req.query.sede; 

        let query = `
            SELECT 
                mc.id, mc.fecha_registro, mc.tipo_movimiento, mc.categoria AS origen, 
                mc.descripcion, mc.monto, mc.metodo_pago, 
                u.nombres AS usuario, s.nombre AS nombre_sede
            FROM movimientos_caja mc
            JOIN usuarios u ON mc.usuario_id = u.id
            JOIN sedes s ON mc.sede_id = s.id
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (esAdmin) {
            if (filtroSedeId) {
                query += ` AND mc.sede_id = $${paramIndex}`;
                params.push(filtroSedeId);
                paramIndex++;
            }
        } else {
            query += ` AND mc.sede_id = $${paramIndex}`;
            params.push(usuarioSedeId);
            paramIndex++;
        }

        query += ` ORDER BY mc.fecha_registro DESC LIMIT 200`;

        const result = await pool.query(query, params);
        res.json(result.rows);

    } catch (err) {
        console.error("Error historial caja:", err.message);
        res.status(500).json({ msg: 'Error al obtener historial.' });
    }
};

// 2. REGISTRAR MOVIMIENTO (Gasto manual)
exports.registrarMovimiento = async (req, res) => {
    const { tipo, origen, monto, metodo, descripcion } = req.body;
    
    if (!req.usuario) return res.status(401).json({ msg: "No autorizado" });
    const sedeId = req.usuario.sede_id;
    const usuarioId = req.usuario.id;

    try {
        if (!monto || monto <= 0) return res.status(400).json({ msg: "Monto inválido" });

        const query = `
            INSERT INTO movimientos_caja (
                sede_id, usuario_id, tipo_movimiento, categoria, 
                descripcion, monto, metodo_pago
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING *
        `;

        const nuevoMov = await pool.query(query, [
            sedeId, usuarioId, tipo, origen || 'MANUAL', descripcion, monto, metodo
        ]);

        res.json({ msg: 'Registrado', movimiento: nuevoMov.rows[0] });

    } catch (err) {
        console.error("Error registro caja:", err.message);
        res.status(500).send('Error al registrar.');
    }
};

// 3. OBTENER RESUMEN (KPIs COMPLETOS: CAJA Y MERMA POR PERIODOS)
// 3. OBTENER RESUMEN (KPIs: NETO + GASTOS + MERMAS)
exports.obtenerResumenCaja = async (req, res) => {
    try {
        if (!req.usuario) return res.status(401).json({msg: "Sin sesión"});
        
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        const esAdmin = ['superadmin', 'admin', 'administrador', 'gerente'].includes(rol);
        const usuarioSedeId = req.usuario.sede_id;
        const filtroSedeId = req.query.sede;

        let sedeConsulta = null; 
        if (esAdmin && filtroSedeId) sedeConsulta = filtroSedeId; 
        else if (!esAdmin) sedeConsulta = usuarioSedeId; 

        // A. CAJA: Calculamos NETO (Ingreso-Egreso) y GASTOS (Solo Egresos)
        const queryCaja = `
            SELECT 
                -- NETO (Lo que queda en el bolsillo)
                COALESCE(SUM(CASE WHEN fecha_registro::date = CURRENT_DATE THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END), 0) AS neto_hoy,
                COALESCE(SUM(CASE WHEN EXTRACT(WEEK FROM fecha_registro) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END), 0) AS neto_semana,
                COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM fecha_registro) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END), 0) AS neto_mes,
                COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END), 0) AS neto_anio,
                
                -- GASTOS (Dinero que salió: Almuerzos, Pagos, etc.)
                COALESCE(SUM(CASE WHEN fecha_registro::date = CURRENT_DATE AND tipo_movimiento = 'EGRESO' THEN monto ELSE 0 END), 0) AS gastos_hoy,
                COALESCE(SUM(CASE WHEN EXTRACT(WEEK FROM fecha_registro) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND tipo_movimiento = 'EGRESO' THEN monto ELSE 0 END), 0) AS gastos_semana,
                COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM fecha_registro) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND tipo_movimiento = 'EGRESO' THEN monto ELSE 0 END), 0) AS gastos_mes,
                COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND tipo_movimiento = 'EGRESO' THEN monto ELSE 0 END), 0) AS gastos_anio,

                -- SALDO TOTAL ACUMULADO
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END), 0) AS saldo_total
            FROM movimientos_caja
            WHERE ($1::int IS NULL OR sede_id = $1::int)
        `;

        // B. MERMA DE INVENTARIO (Productos perdidos)
        const queryMerma = `
            SELECT 
                COALESCE(SUM(CASE WHEN fecha::date = CURRENT_DATE THEN (ABS(cantidad) * costo_unitario_movimiento) ELSE 0 END), 0) AS merma_hoy,
                COALESCE(SUM(CASE WHEN EXTRACT(WEEK FROM fecha) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE) THEN (ABS(cantidad) * costo_unitario_movimiento) ELSE 0 END), 0) AS merma_semana,
                COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE) THEN (ABS(cantidad) * costo_unitario_movimiento) ELSE 0 END), 0) AS merma_mes,
                COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE) THEN (ABS(cantidad) * costo_unitario_movimiento) ELSE 0 END), 0) AS merma_anio
            FROM movimientos_inventario
            WHERE cantidad < 0 
            AND tipo_movimiento NOT ILIKE '%venta%' 
            AND tipo_movimiento NOT ILIKE '%anulacion%'
            AND ($1::int IS NULL OR sede_id = $1::int)
        `;

        const [resCaja, resMerma] = await Promise.all([
            pool.query(queryCaja, [sedeConsulta]),
            pool.query(queryMerma, [sedeConsulta])
        ]);

        const c = resCaja.rows[0];
        const m = resMerma.rows[0];

        res.json({ 
            dia: parseFloat(c.neto_hoy),
            semana: parseFloat(c.neto_semana),
            mes: parseFloat(c.neto_mes),
            anio: parseFloat(c.neto_anio),
            saldo: parseFloat(c.saldo_total),
            
            // Enviamos GASTOS y MERMAS por separado para sumarlos en el frontend
            gastos: {
                hoy: parseFloat(c.gastos_hoy),
                semana: parseFloat(c.gastos_semana),
                mes: parseFloat(c.gastos_mes),
                anio: parseFloat(c.gastos_anio)
            },
            mermas: {
                hoy: parseFloat(m.merma_hoy),
                semana: parseFloat(m.merma_semana),
                mes: parseFloat(m.merma_mes),
                anio: parseFloat(m.merma_anio)
            }
        });

    } catch (err) {
        console.error("❌ Error resumen caja:", err.message);
        res.status(500).json({ msg: 'Error interno al calcular KPIs.' });
    }
};