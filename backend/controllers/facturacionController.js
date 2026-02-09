// Ubicacion: backend/controllers/facturacionController.js
const pool = require('../db');
const facturadorService = require('../utils/facturadorService');

// EMITIR COMPROBANTE
exports.emitirComprobante = async (req, res) => {
    // 🚩 UNIFICACIÓN DE DATOS: Soporte para llamadas desde el router o internas
    const bodyUnificado = req.body.body ? req.body.body : req.body;
    
    const ventaId = bodyUnificado.venta_id || null;
    const formatoPdf = bodyUnificado.formato_pdf || '3'; 
    const clienteEmail = bodyUnificado.cliente_email || ""; 
    
    if (!ventaId) {
        console.error("❌ Error: ID de venta no recibido para facturación.");
        if (res) return res.status(400).json({ msg: 'Falta ID de venta' });
        return;
    }

    const client = await pool.connect();

    try {
        // 1. OBTENER CABECERA DE VENTA Y CONFIGURACIÓN DE SEDE
        // Usamos v.* para traer todo, incluyendo metodo_pago y observaciones
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

        // 3. OBTENER DETALLE DE PRODUCTOS (CON LÓGICA DE DESCUENTO)
        const detalleQuery = `SELECT * FROM detalle_ventas WHERE venta_id = $1 AND precio_unitario > 0`;
        const detallesRes = await client.query(detalleQuery, [ventaId]);
        
        const items = detallesRes.rows.map(item => {
            const matchDesc = venta.observaciones ? venta.observaciones.match(/\[Descuento: (\d+)%\]/) : null;
            const factorDesc = matchDesc ? parseInt(matchDesc[1]) / 100 : 0;

            const precioFinal = parseFloat(item.precio_unitario);
            const precioOriginal = factorDesc > 0 ? (precioFinal / (1 - factorDesc)) : precioFinal;
            const descuentoTotalItem = (precioOriginal - precioFinal) * item.cantidad;

            return {
                ...item,
                precio_lista: precioOriginal.toFixed(2),
                monto_descuento: descuentoTotalItem.toFixed(2),
                es_bonificacion: false
            };
        });

        if (items.length === 0) {
            console.log("⚠️ Venta sin ítems comerciales. No se envía a Nubefact.");
            if (res) return res.json({ msg: 'Venta interna, no requiere envío.' });
            return;
        }

        // 4. VALIDACIÓN DE CREDENCIALES
        if (!venta.nubefact_ruta || !venta.nubefact_token) {
            throw new Error(`La sede (ID ${venta.sede_id}) no tiene configurada la API de NubeFacT.`);
        }

        // 5. DETERMINAR TIPO Y SERIE
        const tipoComprobante = venta.tipo_comprobante === 'Factura' ? 1 : 2; 
        const serie = tipoComprobante === 1 ? venta.serie_factura : venta.serie_boleta;
        
        if (!serie) throw new Error("Falta configurar la SERIE en la tabla sedes.");

        // 6. NORMALIZACIÓN DE DATOS DEL CLIENTE (REGLAS SUNAT)
        let tipoDocCliente = 1; 
        let numDocCliente = (venta.doc_cliente_temporal || "").trim();
        let nombreCliente = (venta.nombre_cliente_temporal || "CLIENTE GENERICO").toUpperCase();

        if (!numDocCliente || numDocCliente === 'PUBLICO' || numDocCliente === '00000000' || numDocCliente === '') {
            tipoDocCliente = '-';       
            numDocCliente = '00000000'; 
            nombreCliente = "CLIENTE VARIOS";
        } else {
            if (numDocCliente.length === 11) tipoDocCliente = 6;
            if (numDocCliente.length === 8) tipoDocCliente = 1;
        }

        if (venta.tipo_comprobante === 'Factura') {
            tipoDocCliente = 6; 
            if (numDocCliente.length === 11) {
                 nombreCliente = (venta.cliente_razon_social || venta.nombre_cliente_temporal).toUpperCase();
            }
        }

        if (tipoDocCliente === '-' && Number(venta.total_venta) >= 700) {
            throw new Error("SUNAT exige DNI para ventas mayores a S/ 700.");
        }

        // 7. PREPARAR PAYLOAD PARA EL SERVICIO
        const datosFactura = {
            id_venta: venta.id,
            uuid_frontend: venta.uuid_frontend, 
            
            tipo_de_comprobante: tipoComprobante,
            serie: serie,
            numero: null, 
            formato_de_pdf: formatoPdf, 
            cliente_tipo_de_documento: tipoDocCliente,
            cliente_numero_de_documento: numDocCliente,
            cliente_email: clienteEmail, 
            cliente_denominacion: nombreCliente,
            cliente_direccion: (venta.cliente_direccion || venta.direccion_sede || "-").toUpperCase(),
            
            // 🔥 CORRECCIÓN AQUÍ: Pasamos los datos de pago al servicio
            metodo_pago: venta.metodo_pago,       // Yape, Plin, Tarjeta, etc.
            tipo_tarjeta: venta.tipo_tarjeta,
            observaciones: venta.observaciones,   // Observaciones adicionales
            
            total_gravada: venta.subtotal, 
            total_igv: venta.igv,
            total: venta.total_venta,
            detalles: items, 
            ruta: venta.nubefact_ruta,
            token: venta.nubefact_token
        };

        console.log(`📤 Enviando [Sede: ${serie}] Pago: ${venta.metodo_pago} Email: ${clienteEmail}`);

        // 8. LLAMADA AL SERVICIO (Ahora con reintentos automáticos)
        const respuestaNubefact = await facturadorService.enviarFactura(datosFactura);

        // 9. PROCESAR RESPUESTA Y ACTUALIZAR DB
        if (respuestaNubefact.errors) {
            const errorTxt = typeof respuestaNubefact.errors === 'string' 
                ? respuestaNubefact.errors 
                : JSON.stringify(respuestaNubefact.errors);

            await client.query(
                `UPDATE ventas SET sunat_estado = 'ERROR', sunat_error = $1 WHERE id = $2`,
                [errorTxt, ventaId]
            );
            if (res) res.status(500).json({ success: false, error: errorTxt });

        } else {
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
        console.error("❌ Error CRÍTICO:", error.message);
        await client.query(
            `UPDATE ventas SET sunat_estado = 'ERROR', sunat_error = $1 WHERE id = $2`, 
            [error.message, ventaId]
        );
        if (res) res.status(500).json({ msg: error.message });
    } finally {
        client.release();
    }
};

// ANULAR COMPROBANTE
exports.anularEnFacturador = async (venta, creds) => {
    const facturadorService = require('../utils/facturadorService');
    
    const datosAnulacion = {
        ruta: creds.ruta_api,
        token: creds.token_api,
        tipo_de_comprobante: venta.tipo_comprobante === 'Factura' ? 1 : 2,
        serie: venta.serie,
        numero: venta.correlativo,
        motivo: "ERROR EN DIGITACION O CANCELACION DE PEDIDO",
        codigo_unico: `SUPERNOVA-V${venta.id}`
    };

    return await facturadorService.anularComprobante(datosAnulacion);
};


const emailService = require('../utils/emailService');

// REENVIAR CORREO CON COMPROBANTE AL CLIENTE
exports.reenviarCorreoPropio = async (req, res) => {
    const { venta_id, cliente_email } = req.body;

    if (!venta_id || !cliente_email) {
        return res.status(400).json({ msg: "Faltan datos." });
    }

    const client = await pool.connect();
    try {
        // 1. Obtener datos de la venta (AGREGAMOS cliente_razon_social a la consulta)
        const resVenta = await client.query(
            `SELECT 
                nombre_cliente_temporal, 
                cliente_razon_social, 
                tipo_comprobante, 
                serie, 
                correlativo, 
                total_venta, 
                enlace_pdf, 
                fecha_venta 
             FROM ventas WHERE id = $1`, 
            [venta_id]
        );

        if (resVenta.rows.length === 0) return res.status(404).json({ msg: "Venta no encontrada" });
        const v = resVenta.rows[0];

        if (!v.enlace_pdf) return res.status(400).json({ msg: "Esta venta no tiene PDF generado aún." });

        // 🔥 CORRECCIÓN DEL NOMBRE NULL:
        // Prioridad: Nombre Temporal -> Razón Social -> "Estimado Cliente"
        let nombreFinal = v.nombre_cliente_temporal;
        
        if (!nombreFinal || nombreFinal === 'null' || nombreFinal.trim() === '') {
            nombreFinal = v.cliente_razon_social;
        }
        if (!nombreFinal || nombreFinal === 'null' || nombreFinal.trim() === '') {
            nombreFinal = "Estimado Cliente";
        }

        // 2. Usar nuestro servicio de correo
        const resultado = await emailService.enviarCorreoComprobante(cliente_email, {
            cliente: nombreFinal, // ✅ Ahora enviamos el nombre corregido
            tipo_doc: v.tipo_comprobante,
            serie: v.serie,
            numero: v.correlativo,
            total: v.total_venta,
            link_pdf: v.enlace_pdf,
            fecha: new Date(v.fecha_venta).toLocaleDateString('es-PE')
        });

        if (resultado.success) {
            res.json({ success: true, msg: "Correo enviado correctamente." });
        } else {
            res.status(500).json({ msg: "Error al enviar: " + resultado.error });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ msg: "Error de servidor" });
    } finally {
        client.release();
    }
};