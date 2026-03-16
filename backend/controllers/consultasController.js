// Ubicacion: SuperNova/backend/controllers/consultasController.js

const API_TOKEN = process.env.PERU_API_TOKEN; // 👈 Asegúrate que en tu .env se llame así
const BASE_URL = "https://peruapi.com/api";

exports.consultarEntidad = async (req, res) => {
    const { numero } = req.params;
    const tokenLimpio = API_TOKEN ? API_TOKEN.trim() : "";

    if (!tokenLimpio) {
        return res.status(500).json({ success: false, msg: "Configuración de API faltante en el servidor." });
    }

    const esDNI = numero.length === 8;
    const esRUC = numero.length === 11;

    if (!esDNI && !esRUC) {
        return res.status(400).json({ success: false, msg: "Formato inválido (8 dígitos DNI / 11 dígitos RUC)." });
    }

    // Construimos la URL según el modo REST de Perú API
    // Agregamos summary=0 para recibir una respuesta limpia sin metadata del plan
    const endpoint = esRUC ? `/ruc/${numero}?summary=0` : `/dni/${numero}?summary=0`;

    try {
        console.log(`📡 Conectando a Perú API... [${esRUC ? 'RUC' : 'DNI'}: ${numero}]`);

        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: {
                'X-API-KEY': tokenLimpio,
                'Content-Type': 'application/json',
                'User-Agent': 'SuperNova-ERP/1.0'
            }
        });

        const data = await response.json();

        // Manejo de errores basado en el 'code' de Perú API
        if (response.status !== 200 || data.code !== "200") {
            if (response.status === 401 || data.code === "401") {
                return res.status(401).json({ success: false, msg: "Token inválido o IP no autorizada." });
            }
            if (response.status === 404 || data.code === "404") {
                return res.status(404).json({ success: false, msg: "Documento no encontrado en padrones." });
            }
            if (response.status === 429 || data.code === "429") {
                return res.status(429).json({ success: false, msg: "Límite de consultas excedido." });
            }
            return res.status(response.status).json({ success: false, msg: data.mensaje || "Error en API externa." });
        }

        // --- ADAPTADOR (Convertimos el formato de Perú API al formato que tu Frontend ya conoce) ---
        let resultado = { success: true };

        if (esRUC) {
            resultado = {
                ...resultado,
                tipo: 'RUC',
                numero: data.ruc,
                nombre: data.razon_social,
                direccion: data.direccion || '',
                estado: data.estado || '',
                condicion: data.condicion || '',
                departamento: data.departamento || '',
                provincia: data.provincia || '',
                distrito: data.distrito || ''
            };
        } else {
            // Para DNI, Perú API devuelve 'cliente' como nombre completo
            resultado = {
                ...resultado,
                tipo: 'DNI',
                numero: data.dni,
                nombre: data.cliente, // Nombre completo
                nombres: data.nombres,
                apellidoPaterno: data.apellido_paterno,
                apellidoMaterno: data.apellido_materno
            };
        }

        console.log(`✅ Datos recuperados: ${resultado.nombre}`);
        res.json(resultado);

    } catch (error) {
        console.error("❌ Error Crítico en Consultas:", error.message);
        res.status(500).json({ success: false, msg: "Error de conexión con el proveedor de identidad." });
    }
};