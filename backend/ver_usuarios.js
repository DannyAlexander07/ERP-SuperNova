// Ubicación: SuperNova/backend/ver_usuarios.js
const pool = require('./db');

async function verUsuarios() {
  try {
    console.log("🔍 BUSCANDO USUARIOS (TABLA COMPLETA)...");
    
    // 🔥 CAMBIO: Usamos * para ver todas las columnas y no fallar
    const res = await pool.query('SELECT * FROM usuarios ORDER BY id ASC');
    
    console.table(res.rows); 
    process.exit(0); 

  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

verUsuarios();