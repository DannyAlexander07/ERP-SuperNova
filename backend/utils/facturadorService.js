// Ubicacion: backend/utils/facturadorService.js
const axios = require('axios');

// Función auxiliar para redondear a 2 decimales (CRÍTICO PARA SUNAT)
const round = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

/**
 * Convierte una Venta de la BD al formato JSON de Nubefact
 * @param {Object} venta - Objeto venta con sus detalles
 * @param {Object} cliente - Datos del cliente (RUC/DNI, Nombre, etc)
 * @param {String} tipoComprobante - 1 (Factura) o 2 (Boleta)
 * @param {String} serie - F001 o B001
 * @param {Number} correlativo - 123
 */
const construirJsonNubefact = (venta, cliente, tipoComprobante, serie, correlativo) => {
    
    // 1. Validar Cliente (Si es Factura, requiere RUC válido)
    let tipoDocCliente = '1'; // DNI por defecto
    if (tipoComprobante === 1) { // Factura
        tipoDocCliente = '6'; // RUC
    } else {
        // Boleta: Si no tiene DNI, usamos '0' o '-' (Varios) según tu lógica
        tipoDocCliente = cliente.num_documento.length === 8 ? '1' : '-';
    }

    // 2. Construir Items (Líneas de la factura)
    const items = venta.detalles.map(item => {
        // Cálculos Inversos (Nubefact pide Valor Unitario SIN IGV)
        // Precio Unitario (Con IGV) = item.precio_unitario
        // Valor Unitario (Sin IGV) = Precio / 1.18
        
        const precioConIgv = parseFloat(item.precio_unitario);
        const valorSinIgv = precioConIgv / 1.18;
        const igvUnitario = precioConIgv - valorSinIgv;
        
        const cantidad = parseInt(item.cantidad);
        
        // Totales por línea
        const valorTotalSinIgv = valorSinIgv * cantidad;
        const igvTotal = igvUnitario * cantidad;
        const totalConIgv = precioConIgv * cantidad;

        return {
            "unidad_de_medida": "NIU", // Unidades (cambiar a ZZ si es servicio)
            "codigo": item.producto_id.toString(),
            "descripcion": item.nombre_producto,
            "cantidad": cantidad,
            "valor_unitario": round(valorSinIgv), // Sin IGV
            "precio_unitario": round(precioConIgv), // Con IGV
            "descuento": "",
            "subtotal": round(valorTotalSinIgv), // Valor venta (sin imp)
            "tipo_de_igv": 1, // 1 = Gravado - Operación Onerosa
            "igv": round(igvTotal),
            "total": round(totalConIgv),
            "anticipo_regularizacion": false
        };
    });

    // 3. Calcular Totales Generales
    // Sumamos lo que calculamos arriba para que cuadre exacto
    const totalGravada = items.reduce((acc, item) => acc + item.subtotal, 0);
    const totalIgv = items.reduce((acc, item) => acc + item.igv, 0);
    const totalVenta = items.reduce((acc, item) => acc + item.total, 0);

    // 4. Armar el JSON Final
    const payload = {
        "operacion": "generar_comprobante",
        "tipo_de_comprobante": tipoComprobante, // 1=Factura, 2=Boleta
        "serie": serie,
        "numero": correlativo,
        "sunat_transaction": 1, // Venta Interna
        "cliente_tipo_de_documento": tipoDocCliente,
        "cliente_numero_de_documento": cliente.num_documento || "00000000",
        "cliente_denominacion": cliente.nombre || "CLIENTE VARIOS",
        "cliente_direccion": cliente.direccion || "-",
        "cliente_email": cliente.email || "", // Nubefact enviará el correo si esto tiene valor
        "cliente_email_1": "",
        "fecha_de_emision": new Date().toISOString().split('T')[0].split('-').reverse().join('-'), // DD-MM-YYYY
        "moneda": 1, // Soles
        "porcentaje_de_igv": 18.00,
        "total_gravada": round(totalGravada),
        "total_igv": round(totalIgv),
        "total": round(totalVenta),
        "enviar_automaticamente_a_la_sunat": true,
        "enviar_automaticamente_al_cliente": true, // Si hay email, lo envía
        "items": items
    };

    return payload;
};

// Función para enviar a la API
const enviarANubefact = async (payload) => {
    try {
        const ruta = process.env.NUBEFACT_RUTA;
        const token = process.env.NUBEFACT_TOKEN;

        const response = await axios.post(ruta, payload, {
            headers: {
                'Authorization': token,
                'Content-Type': 'application/json'
            }
        });

        return { success: true, data: response.data };

    } catch (error) {
        console.error("Error Nubefact:", error.response ? error.response.data : error.message);
        return { 
            success: false, 
            error: error.response ? error.response.data : "Error de conexión con Nubefact" 
        };
    }
};

module.exports = { construirJsonNubefact, enviarANubefact };