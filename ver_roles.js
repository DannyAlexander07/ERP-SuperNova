// Archivo: ver_roles.js
const pool = require('./backend/db');

async function verTodosLosUsuarios() {
    try {
        console.log("📊 LISTA COMPLETA DE USUARIOS Y ROLES");
        console.log("=================================================================");
        console.log("| ID  | NOMBRE               | ROL (Base de Datos)    | ESTADO    |");
        console.log("-----------------------------------------------------------------");

        // Consulta para traer a todos, ordenados por Rol
        const res = await pool.query("SELECT id, nombres, rol, estado FROM usuarios ORDER BY rol ASC");
        
        if (res.rows.length === 0) {
            console.log("| ⚠️  No hay usuarios registrados.                                |");
        } else {
            res.rows.forEach(u => {
                // Formateamos para que se vea ordenado en columnas
                const id = u.id.toString().padEnd(3);
                const nombre = (u.nombres || "Sin Nombre").substring(0, 20).padEnd(20);
                // Aquí está la clave: vemos EXACTAMENTE cómo está escrito el rol
                const rol = (u.rol || "SIN ROL").padEnd(22); 
                const estado = (u.estado || "?").padEnd(9);
                
                console.log(`| ${id} | ${nombre} | ${rol} | ${estado} |`);
            });
        }
        
        console.log("=================================================================\n");
        process.exit();

    } catch (e) {
        console.error("❌ Error:", e.message);
        process.exit(1);
    }
}

verTodosLosUsuarios();