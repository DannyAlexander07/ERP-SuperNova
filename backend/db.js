// backend/db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    // --- ADICIONES PARA RESISTENCIA ---
    max: 20, // Máximo de conexiones simultáneas
    idleTimeoutMillis: 30000, // Cerrar conexiones inactivas tras 30s
    connectionTimeoutMillis: 2000, // Error si no conecta en 2s
});

// Manejo de errores en el pool para que el servidor no explote
pool.on('error', (err) => {
    console.error('⚠️ Error inesperado en el pool de Postgres', err);
});

module.exports = pool;