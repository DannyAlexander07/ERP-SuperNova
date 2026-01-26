// Ubicacion: backend/controllers/facturacionController.js
const pool = require('../db');
const { construirJsonNubefact, enviarANubefact } = require('../utils/facturadorService');

// Función auxiliar para obtener y aumentar el correlativo (ATÓMICO)
// Esto evita que dos ventas tengan el mismo número F001-25 al mismo tiempo.
async function obtenerSiguienteCorrelativo(clienteDb, sedeId, tipoComprobante) {
    const columnaSerie = tipoComprobante === 1 ? 'serie_factura' : 'serie_boleta';
    const columnaNumero = tipoComprobante === 1 ? 'correlativo_factura' : 'correlativo_boleta';

    // Aumentamos el contador y devolvemos el nuevo valor en una sola consulta
    const res = await clienteDb.query(
        `UPDATE sedes 
         SET ${columnaNumero} = ${columnaNumero} + 1 
         WHERE id = $1 
         RETURNING ${columnaSerie} as serie, ${columnaNumero} as numero, nubefact_ruta, nubefact_token`,
        [sedeId]
    );
    return res.rows[0];
}

exports.emitirComprobante = async (req, res) => {
    const { venta_id } = req.body;
    
    // Usamos cliente de piscina para transacciones
    const client = await pool.connect();

    try {
        // 1. Obtener Datos de la Venta Completa
        const resVenta = await client.query(`
            SELECT v.*, 
                   c.tipo_documento as cliente_tipo_doc,
                   c.num_documento, 
                   c.nombres as cliente_nombre, 
                   c.direccion, 
                   c.email
            FROM ventas v
            JOIN clientes c ON v.cliente_id = c.id
            WHERE v.id = $1
        `, [venta_id]);

        if (resVenta.rows.length === 0) {
            return res.status(404).json({ error: "Venta no encontrada" });
        }
        const venta = resVenta.rows[0];

        // Validar si ya fue enviada correctamente antes
        if (venta.sunat_estado === 'ACEPTADA') {
            return res.status(400).json({ error: "Esta venta ya fue facturada y aceptada." });
        }

        // 2. Obtener Detalles (Items)
        const resDetalles = await client.query(`
            SELECT dv.*, p.nombre as nombre_producto 
            FROM detalle_ventas dv
            JOIN productos p ON dv.producto_id = p.id
            WHERE dv.venta_id = $1
        `, [venta_id]);
        venta.detalles = resDetalles.rows;

        // 3. Determinar Tipo de Comprobante (Lógica de Negocio)
        // Si cliente tiene RUC (11 dígitos) -> Factura (1), sino Boleta (2)
        // Opcional: Podrías recibir esto desde el frontend si el cajero elige.
        let tipoComprobante = 2; // Boleta por defecto
        if (venta.cliente_tipo_doc === 'RUC' || (venta.num_documento && venta.num_documento.length === 11)) {
            tipoComprobante = 1; // Factura
        }

        // 4. INICIO TRANSACCIÓN DB (Para reservar el número)
        await client.query('BEGIN');

        // Obtener Serie y Correlativo de la Sede
        const datosSede = await obtenerSiguienteCorrelativo(client, venta.sede_id, tipoComprobante);
        const { serie, numero } = datosSede;

        // 5. Construir JSON para Nubefact (Usando tu servicio)
        const payloadNubefact = construirJsonNubefact(venta, {
            num_documento: venta.num_documento,
            nombre: venta.cliente_nombre,
            direccion: venta.direccion,
            email: venta.email
        }, tipoComprobante, serie, numero);

        console.log("📤 Enviando a Nubefact:", `${serie}-${numero}`);

        // 6. Enviar a Nubefact
        const respuestaNube = await enviarANubefact(payloadNubefact);

        // 7. PROCESAR RESPUESTA (Manejo de Errores de la Documentación Parte 3)
        let nuevoEstado = 'RECHAZADA';
        let mensajeSunat = '';
        let errorNubefact = '';
        
        if (respuestaNube.success) {
            // -- ÉXITO (HTTP 200) --
            nuevoEstado = 'ACEPTADA';
            mensajeSunat = respuestaNube.data.sunat_description || "Aceptado";
            
            // Guardamos enlaces
            await client.query(`
                UPDATE ventas SET 
                    tipo_comprobante = $2,
                    serie = $3,
                    correlativo = $4,
                    sunat_estado = $5,
                    sunat_mensaje = $6,
                    enlace_pdf = $7,
                    enlace_xml = $8,
                    enlace_cdr = $9,
                    nubefact_error = NULL
                WHERE id = $1
            `, [
                venta_id, 
                (tipoComprobante===1?'FACTURA':'BOLETA'), 
                serie, 
                numero, 
                nuevoEstado, 
                mensajeSunat,
                respuestaNube.data.enlace_del_pdf,
                respuestaNube.data.enlace_del_xml,
                respuestaNube.data.enlace_del_cdr
            ]);

        } else {
            // -- ERROR (HTTP 400, 500, etc) --
            // Aquí manejamos los códigos de error que me pasaste
            const errorData = respuestaNube.error || {};
            const codigoError = errorData.codigo || 0;
            errorNubefact = errorData.errors || "Error desconocido";

            if (codigoError === 23) {
                // CÓDIGO 23: YA EXISTE
                // Esto no es un error fatal, significa que ya lo enviamos antes.
                // Podríamos intentar recuperar el PDF si Nubefact nos lo devuelve en el error, 
                // pero por seguridad marcamos como "REVISAR".
                mensajeSunat = "Documento ya existe en Nubefact (Duplicado)";
                nuevoEstado = 'ACEPTADA'; // Asumimos aceptada si ya existe, o 'ERROR_DUPLICADO'
            } 
            else if (codigoError === 20 || codigoError === 21) {
                // ERRORES DE FORMATO
                mensajeSunat = "Error de formato JSON";
            }

            // Guardamos el error en la BD para que no se pierda la venta
            // IMPORTANTE: Guardamos serie/numero aunque falle, para no perder el correlativo
            await client.query(`
                UPDATE ventas SET 
                    tipo_comprobante = $2,
                    serie = $3,
                    correlativo = $4,
                    sunat_estado = 'ERROR',
                    nubefact_error = $5
                WHERE id = $1
            `, [
                venta_id, 
                (tipoComprobante===1?'FACTURA':'BOLETA'), 
                serie, 
                numero, 
                `Cod: ${codigoError} - ${errorNubefact}`
            ]);
        }

        await client.query('COMMIT');
        
        // Responder al Frontend
        if (respuestaNube.success) {
            res.json({ success: true, msg: "Facturación Exitosa", pdf: respuestaNube.data.enlace_del_pdf });
        } else {
            res.status(500).json({ success: false, error: errorNubefact });
        }

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Critical Error Facturacion:", err);
        res.status(500).json({ error: "Error interno del servidor" });
    } finally {
        client.release();
    }
};