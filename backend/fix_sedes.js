// backend/fix_sedes.js
const pool = require('./db');

async function crearSedesFaltantes() {
    try {
        console.log("🔧 Reparando Sedes...");
        
        // Insertamos las sedes si no existen (ON CONFLICT DO NOTHING requiere constraint unique, 
        // así que usaremos INSERT simple y si falla no importa, es solo para asegurar)
        
        const sedes = ['Sede Norte', 'Sede Sur', 'Zona Arcade'];
        
        for (const nombre of sedes) {
            // Verificar si existe
            const check = await pool.query("SELECT id FROM sedes WHERE nombre = $1", [nombre]);
            if(check.rows.length === 0) {
                await pool.query("INSERT INTO sedes (nombre, es_almacen) VALUES ($1, false)", [nombre]);
                console.log(`✅ Creada: ${nombre}`);
            } else {
                console.log(`ℹ️ Ya existe: ${nombre} (ID: ${check.rows[0].id})`);
            }
        }
        
        console.log("\n📋 LISTA DE IDs PARA TU HTML:");
        const todas = await pool.query("SELECT id, nombre FROM sedes ORDER BY id");
        console.table(todas.rows);
        
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

crearSedesFaltantes();