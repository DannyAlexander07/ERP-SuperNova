// Ubicacion: SuperNova/backend/routes/sedesRoutes.js
const express = require('express');
const router = express.Router();
const sedesController = require('../controllers/sedesController');

// 👇 IMPORTACIÓN CORRECTA
const { checkAuth } = require('../middleware/auth'); 

// 1. Obtener todas las sedes
router.get('/', checkAuth, sedesController.obtenerSedes);

// 2. Obtener salones por ID de sede
router.get('/salones/:sedeId', checkAuth, sedesController.obtenerSalonesPorSede);

// ====================================================================
// 🚀 RUTA TEMPORAL MEJORADA (IGNORA DUPLICADOS)
// ====================================================================
router.get('/crear-sedes-auto', async (req, res) => {
    try {
        const pool = require('../db'); 

        // 🔥 LA MAGIA ESTÁ EN LA ÚLTIMA LÍNEA: "ON CONFLICT DO NOTHING"
        // Esto insertará Puruchuco si falta, e ignorará Sede Principal si ya existe.
        await pool.query(`
            INSERT INTO sedes (nombre, direccion, telefono, prefijo_ticket) 
            VALUES 
                ('Sede Principal', 'Av. Javier Prado - Oficina Central', '01-200-3000', 'PRI'),
                ('Puruchuco', 'C.C. Real Plaza Puruchuco', '01-500-6000', 'PUR')
            ON CONFLICT (nombre) DO NOTHING;
        `);
        
        res.send("✅ Proceso finalizado: Se crearon las sedes faltantes (o ya existían todas).");
    } catch (err) {
        console.error(err);
        res.status(500).send("❌ Error: " + err.message);
    }
});

// ====================================================================
// 🚀 RUTA 2: CREAR SALAS PARA PURUCHUCO (Sala 1, Sala 2, Sala 3)
// ====================================================================
router.get('/crear-salones-puruchuco', async (req, res) => {
    try {
        const pool = require('../db'); 

        // 1. Primero buscamos el ID de Puruchuco
        const sedeResult = await pool.query("SELECT id FROM sedes WHERE nombre = 'Puruchuco'");
        
        if (sedeResult.rows.length === 0) {
            return res.status(404).send("❌ Error: No encontré la sede 'Puruchuco'. Créala primero.");
        }

        const puruchucoId = sedeResult.rows[0].id;

        // 2. Insertamos las 3 Salas vinculadas a ese ID
        // Usamos ON CONFLICT para no duplicar si recargas la página
        await pool.query(`
            INSERT INTO salones (nombre, sede_id) 
            VALUES 
                ('Sala 1', $1),
                ('Sala 2', $1),
                ('Sala 3', $1)
            ON CONFLICT DO NOTHING; 
        `, [puruchucoId]);
        
        res.send(`✅ ¡Listo! Se crearon 3 Salas para la sede Puruchuco (ID: ${puruchucoId}).`);

    } catch (err) {
        console.error(err);
        res.status(500).send("❌ Error: " + err.message);
    }
});

// ====================================================================
// 🚀 RUTA 4: CREAR SALA PARA SEDE PRINCIPAL
// ====================================================================
router.get('/crear-sala-principal', async (req, res) => {
    try {
        const pool = require('../db'); 

        // 1. Buscamos el ID de Sede Principal
        const sedeResult = await pool.query("SELECT id FROM sedes WHERE nombre = 'Sede Principal'");
        
        if (sedeResult.rows.length === 0) {
            return res.status(404).send("❌ No encontré la 'Sede Principal'.");
        }

        const principalId = sedeResult.rows[0].id;

        // 2. Insertamos una sala única
        await pool.query(`
            INSERT INTO salones (nombre, sede_id) 
            VALUES ('Oficina de Ventas', $1)
            ON CONFLICT DO NOTHING; 
        `, [principalId]);
        
        res.send(`✅ ¡Listo! Se creó 'Oficina de Ventas' para la Sede Principal.`);

    } catch (err) {
        console.error(err);
        res.status(500).send("❌ Error: " + err.message);
    }
});
// ====================================================================

module.exports = router;