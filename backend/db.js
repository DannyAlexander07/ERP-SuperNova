// backend/db.js
const { Pool } = require('pg');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
    
    // --- OPTIMIZACIÓN DE RENDIMIENTO ---
    max: 20, 
    idleTimeoutMillis: 30000, 
    
    // ⚠️ CAMBIO RECOMENDADO:
    // 2000ms (2s) es muy poco. Una pequeña latencia de red tumbará la petición.
    // Súbelo a 10000 (10s) para dar margen de maniobra en picos de tráfico.
    connectionTimeoutMillis: 10000, 

    // 🛡️ PREPARACIÓN PARA LA NUBE (Render, AWS, Railway, Supabase):
    // La mayoría de proveedores EXIGEN conexión SSL. Si no lo pones, fallará al subirlo.
    ssl: isProduction ? { rejectUnauthorized: false } : false
});

// Manejo de errores
pool.on('error', (err) => {
    console.error('⚠️ Error inesperado en el pool de Postgres', err);
    // No salimos del proceso (process.exit), dejamos que el pool intente reconectar
});

module.exports = pool;