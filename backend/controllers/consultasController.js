// Ubicacion: SuperNova/backend/controllers/consultasController.js

const API_TOKEN = "sk_13220.LZd29D09FER2004TgZRuFueUSvNsSJuZ"; 

const BASE_URL = "https://api.decolecta.com/v1";

exports.consultarEntidad = async (req, res) => {
    const { numero } = req.params;
    const tokenLimpio = API_TOKEN.trim(); // 🔥 Limpiamos espacios invisibles

    // 1. Validar longitud
    const esDNI = numero.length === 8;
    const esRUC = numero.length === 11;

    if (!esDNI && !esRUC) {
        return res.status(400).json({ success: false, msg: "El número debe tener 8 (DNI) u 11 (RUC) dígitos." });
    }

    // 2. Construir URL (Usamos el truco de enviar el token en la URL)
    // RUC: /sunat/ruc?numero=...&token=...
    // DNI: /reniec/dni?numero=...&token=...
    const endpoint = esRUC 
        ? `/sunat/ruc?numero=${numero}&token=${tokenLimpio}` 
        : `/reniec/dni?numero=${numero}&token=${tokenLimpio}`; 
    
    try {
        console.log(`📡 Conectando a Decolecta...`);
        // Ocultamos el token en el log por seguridad
        console.log(`URL: ${BASE_URL}${esRUC ? '/sunat/ruc' : '/reniec/dni'}?numero=${numero}`);
        
        const response = await fetch(`${BASE_URL}${endpoint}`, {
            method: 'GET',
            headers: {
                // Enviamos también en header por si acaso, doble seguridad
                'Authorization': `Bearer ${tokenLimpio}`,
                'Content-Type': 'application/json',
                // 🔥 Simulamos ser un navegador para evitar bloqueos
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const data = await response.json();

        // LOG DE RESPUESTA (Mira esto en la terminal negra)
        console.log(`STATUS: ${response.status}`);
        // console.log(`DATA:`, JSON.stringify(data, null, 2)); // Descomenta si necesitas ver todo

        // 3. Manejo de Errores
        if (!response.ok) {
            if (response.status === 401) {
                console.error("❌ Error 401: Token rechazado.");
                return res.status(404).json({ success: false, msg: "Token inválido o vencido (Revise en Decolecta)." });
            }
            if (response.status === 404 || data.message === 'Not found') {
                return res.status(404).json({ success: false, msg: "Documento no encontrado." });
            }
            if (response.status === 422) {
                return res.status(404).json({ success: false, msg: "Número inválido." });
            }
            return res.status(404).json({ success: false, msg: "Error al consultar API externa." });
        }

        // 4. ADAPTADOR (Mapeo exacto según tu documentación)
        let resultado = {};

        if (esRUC) {
            resultado = {
                success: true,
                tipo: 'RUC',
                numero: data.numero_documento,
                nombre: data.razon_social,
                direccion: data.direccion || '',
                estado: data.estado || '',
                condicion: data.condicion || '',
                ubigeo: data.ubigeo || '',
                departamento: data.departamento || '',
                provincia: data.provincia || '',
                distrito: data.distrito || ''
            };
        } else {
            // DNI (Renic)
            // Según tu doc: first_name, first_last_name, second_last_name
            const fullName = data.full_name || `${data.first_name} ${data.first_last_name} ${data.second_last_name}`;

            resultado = {
                success: true,
                tipo: 'DNI',
                numero: data.document_number,
                
                // Campo unificado para el frontend
                nombre: fullName, 
                
                nombres: data.first_name,
                apellidoPaterno: data.first_last_name,
                apellidoMaterno: data.second_last_name
            };
        }

        console.log("✅ ÉXITO: Datos recuperados ->", resultado.nombre);
        res.json(resultado);

    } catch (error) {
        console.error("❌ Error Crítico:", error.message);
        res.status(500).json({ success: false, msg: "Error de conexión interna." });
    }
};