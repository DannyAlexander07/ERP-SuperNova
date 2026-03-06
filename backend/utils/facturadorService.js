// Ubicacion: backend/utils/facturadorService.js
const axios = require('axios');

// 🔄 FUNCIÓN AUXILIAR: REINTENTOS INTELIGENTES (Backoff Exponencial)
// Si falla la red, espera 1s, luego 2s, luego 4s antes de rendirse.
async function axiosConReintentos(config, intentos = 3) {
    try {
        return await axios(config);
    } catch (error) {
        const esErrorDeRed = !error.response; // Si no hay response, es error de red/timeout
        const esError500 = error.response && error.response.status >= 500;

        if (intentos > 1 && (esErrorDeRed || esError500)) {
            console.warn(`⚠️ Error de conexión con Nubefac. Reintentando... quedan ${intentos - 1} intentos.`);
            // Esperar un poco antes de reintentar (1000ms * intento inverso)
            await new Promise(resolve => setTimeout(resolve, 1500)); 
            return axiosConReintentos(config, intentos - 1);
        }
        throw error;
    }
}

/**
 * Operación 1: Generar Facturas (VERSIÓN FINAL)
 * - Muestra Método de Pago.
 * - Muestra Descripción detallada con Descuento.
 * - Ajusta los montos para que el Total a Pagar sea exacto.
 */
const enviarFactura = async (data) => {

    console.log("--- DATA RECIBIDA EN FACTURADOR ---");
    console.log("Método Pago:", data.metodo_pago); 
    console.log("Observaciones:", data.observaciones);
    console.log("-----------------------------------");

    console.log("=== RASTREO DE FORMATO EN SERVICE ===");
    console.log("formato_de_pdf:", data.formato_de_pdf);
    console.log("formato_impresion:", data.formato_impresion);
    console.log("=====================================");

    try {
        // 1. Validación de seguridad
        const detallesValidos = data.detalles.filter(item => Number(item.precio_unitario) > 0);

        if (detallesValidos.length === 0) {
            return { 
                errors: false, 
                message: "Comprobante interno: Sin ítems gravados.",
                ignorar_actualizacion: true 
            };
        }

        // 2. Preparación de Variables Globales
        let totalOperacionesGravadas = 0;
        let totalIgvGlobal = 0;
        let totalImporteTotal = 0;

        // 3. Mapeo de Ítems (Lógica Comercial)
        const itemsMapeados = detallesValidos.map((item, index) => {
            // A. Precios
            const precioVentaUnitario = Number(item.precio_unitario); // Lo que paga el cliente (con descuento)
            const precioLista = Number(item.precio_lista || item.precio_unitario); // Precio original
            const cantidad = Number(item.cantidad);

            // B. Cálculos para SUNAT (Basados en el precio real a pagar)
            const totalItem = Number((precioVentaUnitario * cantidad).toFixed(2)); 
            const valorVentaItem = Number((totalItem / 1.18).toFixed(2));
            const igvItem = Number((totalItem - valorVentaItem).toFixed(2));
            const valorUnitario = Number((precioVentaUnitario / 1.18).toFixed(10));

            // C. Lógica Visual de Descuento (Para la descripción)
            let descripcionFinal = (item.nombre_producto_historico || "PRODUCTO").trim().toUpperCase();
            
            // Si hay descuento, lo detallamos en la descripción para que el cliente lo vea claro
            if (precioLista > precioVentaUnitario) {
                const montoDescuento = (precioLista - precioVentaUnitario) * cantidad;
                // Formato: "GASEOSA... [Dscto: S/ 5.00]"
                descripcionFinal += ` [Normal: S/ ${precioLista.toFixed(2)} | Dscto: -S/ ${montoDescuento.toFixed(2)}]`;
            }

            // D. Acumuladores
            totalOperacionesGravadas += valorVentaItem;
            totalIgvGlobal += igvItem;
            totalImporteTotal += totalItem;

            // E. Código del producto
            let codigoReal = item.codigo_visual || item.codigo_producto || `P-${item.producto_id}`;

            return {
                unidad_de_medida: item.unidad_medida || "NIU",
                codigo: codigoReal,
                descripcion: descripcionFinal,
                cantidad: cantidad,

                valor_unitario: valorUnitario.toFixed(10),
                precio_unitario: precioVentaUnitario.toFixed(10),
                descuento: "", // Dejamos vacío para evitar la confusión del "descuento base" en el PDF
                
                subtotal: valorVentaItem.toFixed(10),
                tipo_de_igv: 1, 
                igv: igvItem.toFixed(10),
                total: totalItem.toFixed(10),
                anticipo_regularizacion: false
            };
        });

        // 🔥 CORRECCIÓN: Aceptamos formatos en texto o en número
        let formatoFinal = 'TICKET';
        const formatoRecibido = (data.formato_de_pdf || data.formato_impresion || "").toString().toUpperCase();
        
        if (formatoRecibido === 'A4' || formatoRecibido === '1') formatoFinal = 'A4';
        else if (formatoRecibido === 'A5' || formatoRecibido === '2') formatoFinal = 'A5';
        else if (formatoRecibido === 'TICKET' || formatoRecibido === '3') formatoFinal = 'TICKET';

        // Código Único (UUID)
        let codigoUnicoSeguro = data.uuid_frontend 
            ? `SNV-${data.uuid_frontend}`
            : `SNV-${data.id_venta}-${Date.now()}`;

        // 5. MÉTODO DE PAGO (CORREGIDO: DETALLE EXACTO TARJETA)
        let metodoPagoTexto = (data.metodo_pago || "EFECTIVO").toUpperCase();

        // Si es tarjeta, verificamos si es Crédito o Débito
        if (metodoPagoTexto === "TARJETA") {
            const tipo = (data.tipo_tarjeta || "").toUpperCase();
            
            if (tipo.includes("CREDITO") || tipo === "CREDIT") {
                metodoPagoTexto = "TARJETA DE CRÉDITO";
            } else if (tipo.includes("DEBITO") || tipo === "DEBIT") {
                metodoPagoTexto = "TARJETA DE DÉBITO";
            } else {
                // Si no se especificó, queda genérico
                metodoPagoTexto = "TARJETA";
            }
        }
        
        // Si hay observaciones extra, las juntamos
        let observacionesFinal = data.observaciones || "";
        
        // Inyectamos el pago
        observacionesFinal = `FORMA DE PAGO: ${metodoPagoTexto}`;

        // 6. Construcción del Payload Final
        const payloadBase = {
            operacion: "generar_comprobante",
            tipo_de_comprobante: data.tipo_de_comprobante,
            serie: data.serie,
            numero: data.numero || null,
            sunat_transaction: 1, 
            cliente_tipo_de_documento: data.cliente_tipo_de_documento,
            cliente_numero_de_documento: data.cliente_numero_de_documento,
            cliente_denominacion: data.cliente_denominacion.toUpperCase(),
            cliente_direccion: (data.cliente_direccion || "").toUpperCase(),
            cliente_email: data.cliente_email || "", 
            enviar_automaticamente_al_cliente: (data.cliente_email && data.cliente_email.includes('@')) ? true : false,
            fecha_de_emision: new Date().toLocaleDateString('es-PE').replace(/\//g, '-'),
            moneda: 1, 
            porcentaje_de_igv: 18.00,
            formato_de_pdf: formatoFinal,
            
            // Campos de Pago
            condicion_de_pago: "CONTADO", 
            observaciones: observacionesFinal.trim(), // Aquí saldrá "FORMA DE PAGO: YAPE"
            
            // Totales
            total_descuento: "", 
            total_gravada: totalOperacionesGravadas.toFixed(2),
            total_igv: totalIgvGlobal.toFixed(2),
            total: totalImporteTotal.toFixed(2),
            
            items: itemsMapeados,
            enviar_automaticamente_a_la_sunat: true
        };

        // 7. Envío a Nubefact
        try {
            console.log(`📡 Enviando Nubefact [ID: ${codigoUnicoSeguro}]...`);
            const payload = { ...payloadBase, codigo_unico: codigoUnicoSeguro };
            
            const response = await axiosConReintentos({
                method: 'post',
                url: data.ruta,
                data: payload,
                timeout: 20000,
                headers: {
                    'Authorization': `Bearer ${data.token}`,
                    'Content-Type': 'application/json'
                }
            });
            return response.data;

        } catch (error) {
            // Manejo de Error 21 (Duplicado)
            if (error.response && error.response.data.codigo === 21) {
                console.warn("⚠️ Error 21: Recuperando...");
                const codigoRecuperacion = `${codigoUnicoSeguro}-R${Math.floor(Math.random() * 1000)}`;
                const payloadRecuperacion = { ...payloadBase, codigo_unico: codigoRecuperacion };

                try {
                    const resRecuperada = await axios.post(data.ruta, payloadRecuperacion, {
                        headers: { 'Authorization': `Bearer ${data.token}`, 'Content-Type': 'application/json' }
                    });
                    return resRecuperada.data;
                } catch (errRecuperacion) {
                    return { errors: true, message: "Error 21 persistente en Nubefact." };
                }
            }
            if (error.response) {
                return { errors: true, message: JSON.stringify(error.response.data) };
            }
            return { errors: true, message: `Error de Conexión: ${error.message}` };
        }

    } catch (errorGeneral) {
        return { errors: true, message: errorGeneral.message };
    }
};

/**
 * Operación 3: Generar Anulación / Comunicación de Baja
 */
const anularComprobante = async (data) => {
    try {
        if (!data.serie || !data.numero) throw new Error("Serie y número son obligatorios para anular.");

        const payload = {
            operacion: "generar_anulacion",
            tipo_de_comprobante: data.tipo_de_comprobante,
            serie: data.serie, 
            numero: data.numero,
            motivo: data.motivo || "ERROR DE SISTEMA",
            codigo_unico: data.codigo_unico || ""
        };

        const response = await axiosConReintentos({
            method: 'post',
            url: data.ruta,
            data: payload,
            timeout: 15000,
            headers: {
                'Authorization': `Bearer ${data.token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;

    } catch (error) {
        let errorDetalle = error.message;
        if (error.response) errorDetalle = JSON.stringify(error.response.data);
        return { errors: true, message: errorDetalle, codigo_interno: "ERR_SERVICE_VOID" };
    }
};

/**
 * Operación 2: Consultar Facturas, Boletas y Notas
 */
const consultarEstado = async (data) => {
    try {
        const payload = {
            operacion: "consultar_comprobante",
            tipo_de_comprobante: data.tipo_de_comprobante,
            serie: data.serie,
            numero: data.numero
        };

        const response = await axios({ // Consulta directa sin reintentos masivos (queremos feedback rápido)
            method: 'post',
            url: data.ruta,
            data: payload,
            timeout: 10000,
            headers: {
                'Authorization': `Bearer ${data.token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;

    } catch (error) {
        let errorDetalle = error.message;
        if (error.response) errorDetalle = JSON.stringify(error.response.data);
        return { errors: true, message: errorDetalle, codigo_interno: "ERR_SERVICE_QUERY" };
    }
};

/**
 * Operación 4: Consultar Anulación
 */
const consultarAnulacion = async (data) => {
    try {
        const payload = {
            operacion: "consultar_anulacion",
            tipo_de_comprobante: data.tipo_de_comprobante, 
            serie: data.serie, 
            numero: data.numero 
        };

        const response = await axios({
            method: 'post',
            url: data.ruta,
            data: payload,
            timeout: 10000,
            headers: {
                'Authorization': `Bearer ${data.token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;

    } catch (error) {
        let errorDetalle = error.message;
        if (error.response) errorDetalle = JSON.stringify(error.response.data);
        return { errors: true, message: errorDetalle, codigo_interno: "ERR_SERVICE_QUERY_VOID" };
    }
};

// Operación 5: Consultar Identidad
const consultarIdentidad = async (data) => {
    try {
        const urlBase = "https://api.nubefact.com/identidad/";

        const payload = {
            operacion: "consultar_identidad",
            cliente_tipo_de_documento: data.tipo,
            cliente_numero_de_documento: data.numero
        };

        // Identidad es rápido, no necesita reintentos masivos, mejor que falle rápido si no hay red
        const response = await axios({
            method: 'post',
            url: urlBase,
            data: payload,
            timeout: 8000, 
            headers: {
                'Authorization': `Bearer ${data.token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;

    } catch (error) {
        if (error.response && error.response.status === 404) {
            return { 
                errors: true, 
                message: "Servicio de identidad no disponible en esta URL."
            };
        }
        return { errors: true, message: error.message };
    }
};

module.exports = { 
    enviarFactura, 
    anularComprobante, 
    consultarEstado,
    consultarAnulacion,
    consultarIdentidad
};