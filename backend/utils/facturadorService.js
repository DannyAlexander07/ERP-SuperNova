//Ubicacion: backend/utils/facturadorService.js
const axios = require('axios');

/**
 * Servicio de Facturación - SuperNova Retail
 * @param {Object} data - Datos de la venta, sede y credenciales
 */
const enviarFactura = async (data) => {
    try {
        // 1. Mapear los items con precisión financiera
        const itemsMapeados = data.detalles.map((item, index) => {
            const precioConIgv = Number(item.precio_unitario);
            const cantidad = Number(item.cantidad);
            
            // Operaciones base (IGV 18%)
            const valorUnitario = precioConIgv / 1.18;
            const igvUnitario = precioConIgv - valorUnitario;
            
            const descripcion = item.nombre_producto_historico || item.nombre_producto || "Producto Varios";
            
            // El código de ítem debe ser consistente, usamos el ID del producto si existe
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

        /**
         * 🛡️ PROTECCIÓN DE IDEMPOTENCIA
         * Usamos el ID de la venta de la base de datos para evitar duplicados.
         * Si data.id_venta no viene, lanzamos error para proteger la integridad.
         */
        if (!data.id_venta) {
            throw new Error("El ID de venta es obligatorio para garantizar la unicidad del comprobante.");
        }
        const codigoUnicoDocumento = `SUPERNOVA-V${data.id_venta}`;

        // 2. Construir el Payload según documentación Nubefact
        const payload = {
            operacion: "generar_comprobante",
            tipo_de_comprobante: data.tipo_de_comprobante, // 1=Factura, 2=Boleta
            serie: data.serie,
            numero: null, // Autogenerado por Nubefact
            sunat_transaction: 1,
            cliente_tipo_de_documento: data.cliente_tipo_de_documento,
            cliente_numero_de_documento: data.cliente_numero_de_documento,
            cliente_denominacion: data.cliente_denominacion.toUpperCase(),
            cliente_direccion: data.cliente_direccion ? data.cliente_direccion.toUpperCase() : "",
            cliente_email: data.cliente_email || "",
            fecha_de_emision: new Date().toISOString().split('T')[0],
            moneda: 1, // Soles
            porcentaje_de_igv: 18.00,
            total_gravada: Number(data.total_gravada).toFixed(2),
            total_igv: Number(data.total_igv).toFixed(2),
            total: Number(data.total).toFixed(2),
            items: itemsMapeados,
            codigo_unico: codigoUnicoDocumento,
            enviar_automaticamente_a_la_sunat: true,
            enviar_automaticamente_al_cliente: !!data.cliente_email
        };

        console.log(`[FACTURACIÓN] 📤 Intentando emitir comprobante: ${codigoUnicoDocumento} para sede: ${data.sede_id || 'N/A'}`);

        const response = await axios.post(data.ruta, payload, {
            timeout: 15000, // 15 segundos máximo de espera
            headers: {
                'Authorization': `Bearer ${data.token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;

    } catch (error) {
        let errorDetalle = error.message;
        
        if (error.response) {
            // Error retornado por la API de Nubefact (ej. RUC no válido)
            errorDetalle = JSON.stringify(error.response.data);
            console.error("❌ Error API Nubefact:", errorDetalle);
        } else if (error.code === 'ECONNABORTED') {
            errorDetalle = "Tiempo de espera agotado al conectar con Nubefact.";
            console.error("❌ Timeout:", errorDetalle);
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