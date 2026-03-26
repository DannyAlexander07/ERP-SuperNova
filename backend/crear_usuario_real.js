// Ubicacion: SuperNova/backend/crear_usuario_real.js
const pool = require('./db');
const bcrypt = require('bcryptjs');

async function crearUsuarioAlexander() {
    try {
        console.log("🔄 Iniciando configuración de SuperNova...");

        // PASO 1: Asegurar que exista la Sede Principal
        let sedeId;
        const sedeCheck = await pool.query("SELECT id FROM sedes WHERE nombre = 'Sede Principal'");

        if (sedeCheck.rows.length > 0) {
            sedeId = sedeCheck.rows[0].id;
            console.log(`✅ Sede Principal detectada (ID: ${sedeId})`);
        } else {
            console.log("⚠️ No se detectaron sedes. Creando Sede Principal...");
            const sedeNueva = await pool.query(
                "INSERT INTO sedes (nombre, direccion, es_almacen) VALUES ($1, $2, $3) RETURNING id",
                ['Sede Principal', 'Av. Javier Prado 123', false]
            );
            sedeId = sedeNueva.rows[0].id;
            console.log(`✅ Sede Principal creada con éxito (ID: ${sedeId})`);
            
            // Creamos también el Almacén Central por defecto
            await pool.query(
                "INSERT INTO sedes (nombre, direccion, es_almacen) VALUES ($1, $2, $3)",
                ['Almacén Central', 'Zona Industrial', true]
            );
            console.log(`✅ Almacén Central creado.`);
        }

        // PASO 2: Crear el Usuario SuperAdmin
        console.log("🔄 Creando/Actualizando usuario Alexander Arellano...");

        const datos = {
            nombres: "Alexander",
            apellidos: "Arellano Sanchez",
            correo: "aarellano@gruposp.pe",
            clavePlana: "Java1234.",
            rol: "superadmin", // 🔥 AQUÍ TE CONVERTIMOS EN DIOS DEL SISTEMA
            cargo: "Project Development Manager",
            estado: "activo",
            sede_id: sedeId 
        };

        // Encriptar contraseña
        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(datos.clavePlana, salt);

        // Verificar si ya existe para no duplicar error
        const userCheck = await pool.query("SELECT id FROM usuarios WHERE correo = $1", [datos.correo]);

        if (userCheck.rows.length > 0) {
            // Si ya existe, lo ascendemos a superadmin
            await pool.query(
                `UPDATE usuarios SET 
                    clave = $1, 
                    sede_id = $2, 
                    rol = 'superadmin' 
                 WHERE correo = $3`,
                [passwordHash, datos.sede_id, datos.correo]
            );
            console.log("✅ Usuario existente actualizado con permisos de SUPERADMIN.");
        } else {
            // Si no existe, lo creamos desde cero como superadmin
            const res = await pool.query(
                `INSERT INTO usuarios 
                (nombres, apellidos, correo, clave, rol, cargo, estado, sede_id) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
                RETURNING *`,
                [datos.nombres, datos.apellidos, datos.correo, passwordHash, datos.rol, datos.cargo, datos.estado, datos.sede_id]
            );
            console.log(`✅ ¡ÉXITO! Usuario SUPERADMIN creado (ID: ${res.rows[0].id})`);
        }

        console.log("\n🚀 LISTO: Ya eres SUPERADMIN. Puedes iniciar sesión con todos los privilegios.");
        process.exit(0);

    } catch (err) {
        console.error("❌ Error fatal:", err.message);
        process.exit(1);
    }
}

crearUsuarioAlexander();