//Ubicacion: backend/utils/facturadorService.js
const axios = require('axios');

/**
 * Servicio de Facturación - SuperNova Retail
 * @param {Object} data - Datos de la venta, sede y credenciales
 */
const enviarFactura = async (data) => {
    try {
        // 🛡️ BLINDAJE 1: Filtrar componentes de combo (Precio 0) antes del mapeo
        // SUNAT no acepta ítems con total 0 en operaciones gravadas (Error 3105).
        const detallesValidos = data.detalles.filter(item => Number(item.precio_unitario) > 0);

        // 🛡️ BLINDAJE 2: Validar si quedó al menos un ítem con valor comercial
        if (detallesValidos.length === 0) {
            console.warn(`[FACTURACIÓN] ⚠️ Venta ID ${data.id_venta} no tiene ítems con precio > 0. Abortando envío a Nubefact.`);
            return { 
                errors: false, 
                message: "Comprobante interno: No contiene ítems gravados para SUNAT.",
                ignorar_actualizacion: true 
            };
        }

        // 1. Mapear los items con precisión financiera (Solo los válidos)
        const itemsMapeados = detallesValidos.map((item, index) => {
            const precioConIgv = Number(item.precio_unitario);
            const cantidad = Number(item.cantidad);
            
            // Operaciones base (IGV 18%)
            const valorUnitario = precioConIgv / 1.18;
            const igvUnitario = precioConIgv - valorUnitario;
            
            const descripcion = item.nombre_producto_historico || item.nombre_producto || "Producto Varios";
            const codigoProducto = item.producto_id ? `P-${item.producto_id}` : `REF-${index + 1}`;

            return {
                unidad_de_medida: "NIU",
                codigo: codigoProducto,
                descripcion: descripcion.trim().toUpperCase(),
                cantidad: cantidad,
                valor_unitario: valorUnitario.toFixed(10),
                precio_unitario: precioConIgv.toFixed(10),
                descuento: "",
                subtotal: (valorUnitario * cantidad).toFixed(10),
                tipo_de_igv: 1, // Gravado - Operación Onerosa
                igv: (igvUnitario * cantidad).toFixed(10),
                total: (precioConIgv * cantidad).toFixed(10),
                anticipo_regularizacion: false,
                anticipo_documento_serie: "",
                anticipo_documento_numero: ""
            };
        });

        if (!data.id_venta) {
            throw new Error("El ID de venta es obligatorio para garantizar la unicidad del comprobante.");
        }
        const codigoUnicoDocumento = `SUPERNOVA-V${data.id_venta}`;

        // 2. Construir el Payload
        const payload = {
            operacion: "generar_comprobante",
            tipo_de_comprobante: data.tipo_de_comprobante, 
            serie: data.serie,
            numero: null, 
            sunat_transaction: 1,
            cliente_tipo_de_documento: data.cliente_tipo_de_documento,
            cliente_numero_de_documento: data.cliente_numero_de_documento,
            cliente_denominacion: data.cliente_denominacion.toUpperCase(),
            cliente_direccion: data.cliente_direccion ? data.cliente_direccion.toUpperCase() : "",
            cliente_email: data.cliente_email || "",
            fecha_de_emision: new Date().toISOString().split('T')[0],
            moneda: 1, 
            porcentaje_de_igv: 18.00,
            total_gravada: Number(data.total_gravada).toFixed(2),
            total_igv: Number(data.total_igv).toFixed(2),
            total: Number(data.total).toFixed(2),
            items: itemsMapeados,
            codigo_unico: codigoUnicoDocumento,
            enviar_automaticamente_a_la_sunat: true,
            enviar_automaticamente_al_cliente: !!data.cliente_email
        };

        const response = await axios.post(data.ruta, payload, {
            timeout: 15000,
            headers: {
                'Authorization': `Bearer ${data.token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;

    } catch (error) {
        let errorDetalle = error.message;
        if (error.response) {
            errorDetalle = JSON.stringify(error.response.data);
            console.error("❌ Error API Nubefact:", errorDetalle);
        } else {
            console.error("❌ Error Interno Service:", errorDetalle);
        }

        return { 
            errors: true, 
            message: errorDetalle,
            codigo_interno: "ERR_SERVICE_FACT"
        };
    }
};

module.exports = { enviarFactura };