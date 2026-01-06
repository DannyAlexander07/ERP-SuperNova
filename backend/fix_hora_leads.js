// backend/fix_hora_leads.js
const pool = require('./db');

async function actualizarTabla() {
    try {
        console.log("🔧 Actualizando tabla LEADS para soportar horas...");
        
        // Comando SQL para cambiar el tipo de dato sin borrar la información
        await pool.query("ALTER TABLE leads ALTER COLUMN fecha_tentativa TYPE TIMESTAMP USING fecha_tentativa::timestamp");
        
        console.log("✅ ¡Listo! Ahora los leads pueden guardar hora exacta.");
        process.exit(0);
    } catch (err) {
        console.error("❌ Error:", err.message);
        process.exit(1);
    }
}

actualizarTabla();