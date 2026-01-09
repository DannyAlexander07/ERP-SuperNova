// Ubicación: SuperNova/backend/controllers/cajaController.js
const pool = require('../db');

// 1. OBTENER MOVIMIENTOS (HISTORIAL CON FILTRO)
exports.obtenerMovimientos = async (req, res) => {
    try {
        if (!req.usuario) return res.status(401).json({ msg: "No autorizado" });

        // A. DETECTAR ROL Y SEDE
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        
        // 🔥 CORRECCIÓN: Ahora incluimos superadmin y gerente
        const esAdmin = rol === 'superadmin' || rol === 'admin' || rol === 'administrador' || rol === 'gerente';
        const usuarioSedeId = req.usuario.sede_id;

        // B. CAPTURAR FILTRO DE SEDE
        const filtroSedeId = req.query.sede; 

        // C. CONSTRUCCIÓN DE LA CONSULTA
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
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        // D. LÓGICA DE SEGURIDAD (EL CANDADO)
        if (esAdmin) {
            // Si es Admin (o Superadmin) Y seleccionó una sede específica
            if (filtroSedeId) {
                query += ` AND mc.sede_id = $${paramIndex}`;
                params.push(filtroSedeId);
                paramIndex++;
            }
            // Si no selecciona nada, ve TODO (no se agrega filtro)
        } else {
            // Si es mortal, FORZAMOS su sede
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

// 3. OBTENER RESUMEN (KPIs)
exports.obtenerResumenCaja = async (req, res) => {
    try {
        if (!req.usuario) return res.status(401).json({msg: "Sin sesión"});
        
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        
        // 🔥 CORRECCIÓN: También aquí actualizamos el permiso
        const esAdmin = rol === 'superadmin' || rol === 'admin' || rol === 'administrador' || rol === 'gerente';
        const usuarioSedeId = req.usuario.sede_id;
        
        const filtroSedeId = req.query.sede;

        const params = [];
        let paramIndex = 1;
        let filtroSQL = "";

        // --- LÓGICA DE SEGURIDAD ---
        if (esAdmin) {
            if (filtroSedeId && filtroSedeId !== "") {
                filtroSQL = `AND sede_id = $${paramIndex}`;
                params.push(filtroSedeId);
                paramIndex++;
            }
        } else {
            filtroSQL = `AND sede_id = $${paramIndex}`;
            params.push(usuarioSedeId);
            paramIndex++;
        }

        // A. Ingresos y Egresos de HOY
        const queryHoy = `
            SELECT 
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE 0 END), 0) AS ingresos_hoy,
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'EGRESO' THEN monto ELSE 0 END), 0) AS egresos_hoy
            FROM movimientos_caja
            WHERE fecha_registro::date = CURRENT_DATE
            ${filtroSQL}
        `;
        const resHoy = await pool.query(queryHoy, params);

        // B. SALDO TOTAL (Histórico)
        const queryHistorico = `
            SELECT 
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN tipo_movimiento = 'EGRESO' THEN monto ELSE 0 END), 0) AS saldo_total
            FROM movimientos_caja
            WHERE 1=1 
            ${filtroSQL}
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