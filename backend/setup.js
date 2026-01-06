// Ubicacion: SuperNova/backend/setup.js
const pool = require('./db');
const bcrypt = require('bcryptjs');

async function crearAdmin() {
    try {
        // 1. Datos del Admin
        const nombre = "Alexander";
        const email = "admin@supernova.com";
        const passwordPlana = "123456"; // Tu contraseña temporal
        const rol = "admin";

        // 2. Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(passwordPlana, salt);

        // 3. Insertar en Base de Datos
        const res = await pool.query(
            `INSERT INTO usuarios (nombres, correo, clave, rol, cargo, estado) 
             VALUES ($1, $2, $3, $4, 'Gerente General', 'activo') 
             RETURNING *`,
            [nombre, email, passwordHash, rol]
        );

        console.log("✅ Usuario Admin creado con éxito:");
        console.log(res.rows[0]);
        process.exit(0);

    } catch (err) {
        console.error("❌ Error creando admin:", err.message);
        process.exit(1);
    }
}

crearAdmin();