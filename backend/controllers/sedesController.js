// Ubicacion: SuperNova/backend/controllers/sedesController.js
const pool = require('../db');

exports.obtenerSalonesPorSede = async (req, res) => {
    const { sedeId } = req.params;
    
    // 1. CONVERSIÓN CRÍTICA: Asegurar que el ID sea un entero.
    const idSede = parseInt(sedeId);

    if (isNaN(idSede)) {
        return res.status(400).json({ msg: "ID de sede no válido." });
    }

    try {
        // 2. Consulta limpia y filtrada por ID de Sede
        const query = `
            SELECT id, nombre, capacidad 
            FROM salones 
            WHERE sede_id = $1 AND activo = TRUE 
            ORDER BY nombre
        `;
        
        // Usamos el ID parseado ($1)
        const result = await pool.query(query, [idSede]);
        
        // 3. Respuesta con el ID y el Nombre del salón (para el dropdown del front-end)
        res.json(result.rows);
        
    } catch (err) {
        console.error("Error al obtener salones:", err.message);
        res.status(500).send('Error del servidor al obtener salones.');
    }
};

exports.obtenerSedes = async (req, res) => {
    try {
        // Obtiene todas las sedes logísticas (locales de cumpleaños)
        const result = await pool.query('SELECT id, nombre, direccion FROM sedes WHERE es_almacen = FALSE AND activo = TRUE ORDER BY nombre');
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener sedes:", err.message);
        res.status(500).send('Error del servidor al obtener sedes.');
    }
};