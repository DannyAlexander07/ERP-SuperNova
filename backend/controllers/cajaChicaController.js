//Ubicacion: backend/controllers/cajaChicaController.js

const pool = require('../db');

exports.obtenerResumen = async (req, res) => {
    try {
        let { sede } = req.query;
        let sedeId = sede;

        // 🔥 CORRECCIÓN CRÍTICA:
        // Si 'sede' llega como string vacío "" o undefined, lo convertimos a NULL
        // PostgreSQL no puede convertir "" a int, pero sí acepta NULL.
        if (!sedeId || sedeId === "" || sedeId === "null") {
            sedeId = null;
        }

        // Si no es admin ni gerente, forzamos su propia sede (Seguridad)
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        if (rol !== 'superadmin' && rol !== 'admin' && rol !== 'gerente') {
            sedeId = req.usuario.sede_id;
        }

        // 1. Calcular Saldo Actual
        const querySaldo = `
            SELECT 
                SUM(CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) as saldo_actual
            FROM caja_chica
            WHERE ($1::int IS NULL OR sede_id = $1::int)
        `;

        // 2. Obtener últimos movimientos
        const queryMovs = `
            SELECT cc.*, u.nombres as usuario_nombre, s.nombre as sede_nombre
            FROM caja_chica cc
            JOIN usuarios u ON cc.usuario_id = u.id
            JOIN sedes s ON cc.sede_id = s.id
            WHERE ($1::int IS NULL OR cc.sede_id = $1::int)
            ORDER BY cc.fecha_registro DESC
            LIMIT 50
        `;

        const [resSaldo, resMovs] = await Promise.all([
            pool.query(querySaldo, [sedeId]),
            pool.query(queryMovs, [sedeId])
        ]);

        res.json({
            saldo: resSaldo.rows[0].saldo_actual || 0,
            movimientos: resMovs.rows
        });

    } catch (err) {
        console.error("❌ Error en Caja Chica:", err.message); // Log más limpio
        res.status(500).json({ msg: "Error al obtener caja chica" });
    }
};

exports.registrarMovimiento = async (req, res) => {
    try {
        // Agregamos 'categoria' al destructuring
        const { tipo, monto, descripcion, categoria } = req.body;
        const usuarioId = req.usuario.id;
        const sedeId = req.usuario.sede_id;

        await pool.query(
            `INSERT INTO caja_chica (sede_id, usuario_id, tipo_movimiento, monto, descripcion, categoria)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [sedeId, usuarioId, tipo, monto, descripcion, categoria]
        );

        res.json({ msg: "Movimiento registrado correctamente" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Error al registrar" });
    }
};