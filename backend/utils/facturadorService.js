// Ubicacion: backend/utils/facturadorService.js
const axios = require('axios');

const enviarFactura = async (data) => {
    try {
        // 1. Mapear los items (productos)
        const itemsMapeados = data.detalles.map((item, index) => {
            const precioConIgv = parseFloat(item.precio_unitario);
            const valorUnitario = precioConIgv / 1.18; 
            const igvUnitario = precioConIgv - valorUnitario;
            
            let descripcion = item.nombre_producto_historico || item.nombre_producto || "Producto Varios";
            
            // Código del producto (SKU)
            const codigoProducto = `PROD-${index + 1}-${Date.now()}`; 

            return {
                unidad_de_medida: "NIU", 
                codigo: codigoProducto,
                descripcion: descripcion,
                cantidad: item.cantidad,
                valor_unitario: valorUnitario.toFixed(10),
                precio_unitario: precioConIgv.toFixed(10),
                descuento: "",
                subtotal: (valorUnitario * item.cantidad).toFixed(10),
                tipo_de_igv: 1, 
                igv: (igvUnitario * item.cantidad).toFixed(10),
                total: (precioConIgv * item.cantidad).toFixed(10),
                anticipo_regularizacion: false,
                anticipo_documento_serie: "",
                anticipo_documento_numero: ""
            };
        });

        // 🔥 GENERAMOS EL CÓDIGO ÚNICO DEL DOCUMENTO (SEGÚN TU DOCUMENTACIÓN)
        // Esto identifica a la VENTA completa, no a los productos.
        // Usamos: "VENTA-{serie}-{timestamp}" para que sea único.
        const codigoUnicoVenta = `VENTA-${data.serie}-${Date.now()}`;

        // 2. Construir el JSON final
        const payload = {
            operacion: "generar_comprobante",
            tipo_de_comprobante: data.tipo_de_comprobante,
            serie: data.serie,           
            numero: null, // Automático
            sunat_transaction: 1,
            cliente_tipo_de_documento: data.cliente_tipo_de_documento,
            cliente_numero_de_documento: data.cliente_numero_de_documento,
            cliente_denominacion: data.cliente_denominacion,
            cliente_direccion: data.cliente_direccion,
            cliente_email: "",
            fecha_de_emision: new Date().toISOString().split('T')[0],
            moneda: 1,
            porcentaje_de_igv: 18.00,
            total_gravada: parseFloat(data.total_gravada).toFixed(2),
            total_igv: parseFloat(data.total_igv).toFixed(2),
            total: parseFloat(data.total).toFixed(2),
            items: itemsMapeados,
            
            // 👇 AQUÍ ESTÁ LA SOLUCIÓN SEGÚN TU DOCUMENTACIÓN 👇
            codigo_unico: codigoUnicoVenta, 
            
            enviar_automaticamente_a_la_sunat: true,
            enviar_automaticamente_al_cliente: false
        };

        console.log("------------------------------------------------");
        console.log(`📤 Enviando con CÓDIGO ÚNICO DE VENTA: ${codigoUnicoVenta}`);
        console.log("------------------------------------------------");

        const response = await axios.post(data.ruta, payload, {
            headers: {
                'Authorization': `Bearer ${data.token}`,
                'Content-Type': 'application/json'
            }
        });

        return response.data;

    } catch (error) {
        const errorMsg = error.response ? JSON.stringify(error.response.data) : error.message;
        console.error("⚠️ Error Nubefact:", errorMsg);
        return { errors: errorMsg };
    }
};

module.exports = { enviarFactura };