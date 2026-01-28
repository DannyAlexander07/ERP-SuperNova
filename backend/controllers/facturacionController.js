// Ubicacion: backend/controllers/facturacionController.js
const pool = require('../db');
const facturadorService = require('../utils/facturadorService');

exports.emitirComprobante = async (req, res) => {
    const ventaId = req.body.venta_id || (req.body.body ? req.body.body.venta_id : null);
    
    if (!ventaId) {
        console.error("❌ Error: ID de venta no recibido para facturación.");
        if (res) return res.status(400).json({ msg: 'Falta ID de venta' });
        return;
    }

    const client = await pool.connect();

    try {
        const ventaQuery = `
            SELECT 
                v.*,
                s.nubefact_ruta, 
                s.nubefact_token,
                s.serie_boleta,
                s.serie_factura,
                s.direccion as direccion_sede
            FROM ventas v
            JOIN sedes s ON v.sede_id = s.id
            WHERE v.id = $1
        `;
        const ventaRes = await client.query(ventaQuery, [ventaId]);
        
        if (ventaRes.rows.length === 0) throw new Error("Venta no encontrada");
        const venta = ventaRes.rows[0];

        if (venta.sunat_estado === 'ACEPTADA') {
            console.log("⚠️ La venta ya fue facturada anteriormente.");
            if (res) return res.json({ msg: 'Venta ya facturada', pdf: venta.enlace_pdf });
            return;
        }

        const detalleQuery = `SELECT * FROM detalle_ventas WHERE venta_id = $1`;
        const detallesRes = await client.query(detalleQuery, [ventaId]);
        const items = detallesRes.rows;

        if (!venta.nubefact_ruta || !venta.nubefact_token) {
            throw new Error(`La sede (ID ${venta.sede_id}) no tiene configurada la Facturación Electrónica.`);
        }

        // --- LÓGICA DE NEGOCIO CORREGIDA ---
        const tipoComprobante = venta.tipo_comprobante === 'Factura' ? 1 : 2; 
        const serie = tipoComprobante === 1 ? venta.serie_factura : venta.serie_boleta;
        
        if (!serie) throw new Error("Falta configurar la SERIE (FFFx / BBBx) en la tabla sedes.");

        // 1. LIMPIEZA DE DATOS DEL CLIENTE
        let tipoDocCliente = 1; // 1 = DNI
        let numDocCliente = venta.doc_cliente_temporal;
        let nombreCliente = venta.nombre_cliente_temporal || "CLIENTE GENERICO";

        // 🔥 CORRECCIÓN CRÍTICA: Detectar "PUBLICO"
        if (!numDocCliente || numDocCliente === 'PUBLICO' || numDocCliente.trim() === '') {
            // Si es público general (Venta menor a S/ 700)
            tipoDocCliente = '-';       // Tipo: Varios / Sin Documento
            numDocCliente = '00000000'; // Número genérico
            nombreCliente = "CLIENTE VARIOS";
        }

        // Si es Factura, forzamos RUC
        if (venta.tipo_comprobante === 'Factura') {
            tipoDocCliente = 6; // RUC
            if (venta.doc_cliente_temporal && venta.doc_cliente_temporal.length === 11) {
                 numDocCliente = venta.doc_cliente_temporal;
                 nombreCliente = venta.cliente_razon_social || venta.nombre_cliente_temporal;
            }
        } else {
             // Si es Boleta y puso un RUC o DNI válido
             if (numDocCliente && numDocCliente.length === 11) tipoDocCliente = 6; // Es RUC
             if (numDocCliente && numDocCliente.length === 8) tipoDocCliente = 1;  // Es DNI
        }

        const datosFactura = {
            tipo_de_comprobante: tipoComprobante,
            serie: serie,
            numero: null, 
            cliente_tipo_de_documento: tipoDocCliente,
            cliente_numero_de_documento: numDocCliente, // Ahora enviará '00000000' en vez de 'PUBLICO'
            cliente_denominacion: nombreCliente,
            cliente_direccion: venta.cliente_direccion || "-",
            total_gravada: venta.subtotal, 
            total_igv: venta.igv,
            total: venta.total_venta,
            detalles: items,
            ruta: venta.nubefact_ruta,
            token: venta.nubefact_token
        };

        console.log(`📤 Enviando a Nubefact [Sede: ${serie}] Doc: ${numDocCliente}...`);

        const respuestaNubefact = await facturadorService.enviarFactura(datosFactura);

        if (respuestaNubefact.errors) {
            console.error("❌ Error Nubefact:", respuestaNubefact.errors);
            await client.query(
                `UPDATE ventas SET sunat_estado = 'ERROR', sunat_error = $1 WHERE id = $2`,
                [respuestaNubefact.errors, ventaId]
            );
            if (res) res.status(500).json({ success: false, error: respuestaNubefact.errors });

        } else {
            console.log(`✅ Factura creada con Éxito: ${respuestaNubefact.serie}-${respuestaNubefact.numero}`);
            await client.query(
                `UPDATE ventas SET 
                    sunat_estado = 'ACEPTADA',
                    serie = $1,
                    correlativo = $2,
                    enlace_pdf = $3,
                    enlace_xml = $4,
                    enlace_cdr = $5,
                    sunat_mensaje = $6,
                    nubefact_error = NULL
                WHERE id = $7`,
                [
                    respuestaNubefact.serie, 
                    respuestaNubefact.numero,
                    respuestaNubefact.enlace_del_pdf,
                    respuestaNubefact.enlace_del_xml,
                    respuestaNubefact.enlace_del_cdr,
                    respuestaNubefact.sunat_description,
                    ventaId
                ]
            );

            if (res) res.json({ 
                success: true, 
                msg: 'Facturación Exitosa', 
                pdf: respuestaNubefact.enlace_del_pdf,
                ticket: `${respuestaNubefact.serie}-${respuestaNubefact.numero}`
            });
        }

    } catch (error) {
        console.error("❌ Error CRÍTICO en controlador:", error.message);
        await client.query(`UPDATE ventas SET sunat_estado = 'ERROR', sunat_error = $1 WHERE id = $2`, [error.message, ventaId]);
        if (res) res.status(500).json({ msg: error.message });
    } finally {
        client.release();
    }
};