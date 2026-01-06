// backend/ver_ids.js
const pool = require('./db');

async function mostrarIDs() {
    try {
        console.log("\n📊 TUS SEDES REALES:");
        console.log("--------------------------------");
        const res = await pool.query('SELECT id, nombre FROM sedes ORDER BY id ASC');
        console.table(res.rows);
        console.log("--------------------------------");
        console.log("👉 Usa estos números EXACTOS en los 'value' de tu crm.html\n");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

mostrarIDs();