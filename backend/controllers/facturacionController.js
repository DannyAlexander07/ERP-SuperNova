// Ubicacion: backend/controllers/facturacionController.js
const pool = require('../db');
const facturadorService = require('../utils/facturadorService');

exports.emitirComprobante = async (req, res) => {
    // Soporte para llamadas desde el router (req.body) o internas (objeto anidado)
    const ventaId = req.body.venta_id || (req.body.body ? req.body.body.venta_id : null);
    
    if (!ventaId) {
        console.error("❌ Error: ID de venta no recibido para facturación.");
        if (res) return res.status(400).json({ msg: 'Falta ID de venta' });
        return;
    }

    const client = await pool.connect();

    try {
        // 1. OBTENER CABECERA DE VENTA Y CONFIGURACIÓN DE SEDE
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

        // 2. VALIDACIÓN DE ESTADO PREVIO
        if (venta.sunat_estado === 'ACEPTADA') {
            console.log("⚠️ La venta ya fue facturada anteriormente.");
            if (res) return res.json({ msg: 'Venta ya facturada', pdf: venta.enlace_pdf });
            return;
        }

        // 3. OBTENER DETALLE DE PRODUCTOS
        const detalleQuery = `SELECT * FROM detalle_ventas WHERE venta_id = $1`;
        const detallesRes = await client.query(detalleQuery, [ventaId]);
        const items = detallesRes.rows;

        // 4. VALIDACIÓN DE CREDENCIALES MULTISEDE
        if (!venta.nubefact_ruta || !venta.nubefact_token) {
            throw new Error(`La sede (ID ${venta.sede_id}) no tiene configurada la Facturación Electrónica.`);
        }

        // 5. DETERMINAR TIPO Y SERIE SEGÚN SEDE
        const tipoComprobante = venta.tipo_comprobante === 'Factura' ? 1 : 2; 
        const serie = tipoComprobante === 1 ? venta.serie_factura : venta.serie_boleta;
        
        if (!serie) throw new Error("Falta configurar la SERIE (FFFx / BBBx) en la tabla sedes.");

        // 6. LIMPIEZA Y NORMALIZACIÓN DE DATOS DEL CLIENTE (MANTENIENDO TU LÓGICA)
        let tipoDocCliente = 1; // 1 = DNI
        let numDocCliente = venta.doc_cliente_temporal;
        let nombreCliente = venta.nombre_cliente_temporal || "CLIENTE GENERICO";

        // Detectar "PUBLICO" o campos vacíos
        if (!numDocCliente || numDocCliente === 'PUBLICO' || numDocCliente.trim() === '') {
            tipoDocCliente = '-';       
            numDocCliente = '00000000'; 
            nombreCliente = "CLIENTE VARIOS";
        }

        // Lógica para Facturas (RUC obligatorio)
        if (venta.tipo_comprobante === 'Factura') {
            tipoDocCliente = 6; 
            if (venta.doc_cliente_temporal && venta.doc_cliente_temporal.length === 11) {
                 numDocCliente = venta.doc_cliente_temporal;
                 nombreCliente = venta.cliente_razon_social || venta.nombre_cliente_temporal;
            }
        } else {
             // Si es Boleta, validar si el número ingresado es RUC o DNI
             if (numDocCliente && numDocCliente.length === 11) tipoDocCliente = 6; 
             if (numDocCliente && numDocCliente.length === 8) tipoDocCliente = 1;  
        }

        // 🛡️ REGLA DE SEGURIDAD SUNAT: Boletas > S/ 700 requieren identificación real
        if (tipoDocCliente === '-' && Number(venta.total_venta) >= 700) {
            throw new Error("SUNAT exige DNI para ventas mayores a S/ 700. Ingrese un documento.");
        }

        // 7. PREPARAR PAYLOAD PARA EL SERVICE
        const datosFactura = {
            id_venta: venta.id, // 🔥 Agregado para el Código Único e Idempotencia
            tipo_de_comprobante: tipoComprobante,
            serie: serie,
            numero: null, 
            cliente_tipo_de_documento: tipoDocCliente,
            cliente_numero_de_documento: numDocCliente,
            cliente_denominacion: nombreCliente.toUpperCase(),
            cliente_direccion: (venta.cliente_direccion || venta.direccion_sede || "-").toUpperCase(),
            total_gravada: venta.subtotal, 
            total_igv: venta.igv,
            total: venta.total_venta,
            detalles: items,
            ruta: venta.nubefact_ruta,
            token: venta.nubefact_token
        };

        console.log(`📤 Enviando a Nubefact [Sede: ${serie}] Doc: ${numDocCliente} Venta ID: ${venta.id}`);

        // 8. LLAMADA AL SERVICIO
        const respuestaNubefact = await facturadorService.enviarFactura(datosFactura);

        // 9. PROCESAR RESPUESTA Y ACTUALIZAR DB
        if (respuestaNubefact.errors) {
            console.error("❌ Error Nubefact:", respuestaNubefact.errors);
            
            // Convertimos el error a String si es un objeto para evitar fallos en Postgres
            const errorTxt = typeof respuestaNubefact.errors === 'string' 
                ? respuestaNubefact.errors 
                : JSON.stringify(respuestaNubefact.errors);

            await client.query(
                `UPDATE ventas SET sunat_estado = 'ERROR', sunat_error = $1 WHERE id = $2`,
                [errorTxt, ventaId]
            );
            if (res) res.status(500).json({ success: false, error: errorTxt });

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
                    sunat_error = NULL
                WHERE id = $7`,
                [
                    respuestaNubefact.serie, 
                    respuestaNubefact.numero,
                    respuestaNubefact.enlace_del_pdf,
                    respuestaNubefact.enlace_del_xml,
                    respuestaNubefact.enlace_del_cdr,
                    respuestaNubefact.sunat_description || "Aceptado",
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
        // Aseguramos que el error se guarde en la DB para auditoría
        await client.query(
            `UPDATE ventas SET sunat_estado = 'ERROR', sunat_error = $1 WHERE id = $2`, 
            [error.message, ventaId]
        );
        if (res) res.status(500).json({ msg: error.message });
    } finally {
        // 🛡️ LIBERAR CONEXIÓN SIEMPRE (Evita que el sistema colapse por falta de conexiones)
        client.release();
    }
};