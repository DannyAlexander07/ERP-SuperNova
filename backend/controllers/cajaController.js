// Ubicacion: SuperNova/backend/controllers/cajaController.js
const pool = require('../db');

// 1. OBTENER MOVIMIENTOS (HISTORIAL)
exports.obtenerMovimientos = async (req, res) => {
    try {
        if (!req.usuario) return res.status(401).json({ msg: "No autorizado" });

        // A. DETECTAR ROL Y SEDE
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        // Aceptamos 'admin' o 'administrador'
        const esAdmin = rol === 'admin' || rol === 'administrador';
        const sedeId = req.usuario.sede_id;

        // B. QUERY BASE (Trae nombre de sede para saber de dónde es la plata)
        let query = `
            SELECT 
                mc.id, 
                mc.fecha_registro, 
                mc.tipo_movimiento, 
                mc.categoria AS origen, 
                mc.descripcion, 
                mc.monto, 
                mc.metodo_pago, 
                u.nombres AS usuario,
                s.nombre AS nombre_sede
            FROM movimientos_caja mc
            JOIN usuarios u ON mc.usuario_id = u.id
            JOIN sedes s ON mc.sede_id = s.id
        `;

        const params = [];

        // C. FILTRO INTELIGENTE
        // Si NO es Admin -> Solo ve su sede.
        // Si ES Admin -> Ve todo (No agregamos WHERE sede_id).
        if (!esAdmin) {
            query += ` WHERE mc.sede_id = $1`;
            params.push(sedeId);
        }

        query += ` ORDER BY mc.fecha_registro DESC LIMIT 50`;

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

        // Insertar siempre en la sede del usuario logueado
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

// 3. OBTENER RESUMEN (KPIs: Suma Total vs Suma Local)
exports.obtenerResumenCaja = async (req, res) => {
    try {
        if (!req.usuario) return res.status(401).json({msg: "Sin sesión"});
        
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        const esAdmin = rol === 'admin' || rol === 'administrador';
        const sedeId = req.usuario.sede_id;
        const params = [];

        // Construcción Dinámica del Filtro
        let filtroSede = "";
        
        if (!esAdmin) {
            filtroSede = "AND sede_id = $1"; // Colaborador: Solo su sede
            params.push(sedeId);
        } 
        // Si es Admin, el filtro queda vacío = SUMA TODAS LAS SEDES

        // A. CÁLCULO DE "HOY"
        const queryHoy = `
            SELECT 
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE 0 END), 0) AS ingresos_hoy,
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'EGRESO' THEN monto ELSE 0 END), 0) AS egresos_hoy
            FROM movimientos_caja
            WHERE fecha_registro::date = CURRENT_DATE
            ${filtroSede}
        `;
        const resHoy = await pool.query(queryHoy, params);

        // B. CÁLCULO DE "SALDO TOTAL" (Histórico acumulado)
        const queryHistorico = `
            SELECT 
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'EGRESO' THEN monto ELSE 0 END), 0) AS saldo_total
            FROM movimientos_caja
            WHERE 1=1 
            ${filtroSede}
        `;
        const resHist = await pool.query(queryHistorico, params);

        res.json({ 
            ingresos: parseFloat(resHoy.rows[0].ingresos_hoy), 
            egresos: parseFloat(resHoy.rows[0].egresos_hoy), 
            saldo: parseFloat(resHist.rows[0].saldo_total) 
        });

    } catch (err) {
        console.error("Error resumen caja:", err.message);
        res.status(500).json({ msg: 'Error al calcular saldo.' });
    }
};