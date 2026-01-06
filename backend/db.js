// Ubicacion: SuperNova/backend/db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: process.env.DB_PORT,
});


pool.connect((err, client, release) => {
    if (err) {
        return console.error('❌ Error adquiriendo cliente de base de datos', err.stack);
    }
    console.log('✅ Conexión exitosa a PostgreSQL: db_supernova');
    release();
});

module.exports = pool;