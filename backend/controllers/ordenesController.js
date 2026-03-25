// Ubicacion: SuperNova/backend/controllers/ordenesController.js
const pool = require('../db');
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const cloudinary = require('cloudinary').v2;

// =======================================================
// 1. FUNCIONES INTERNAS (PARA EL ERP SUPERNOVA)
// =======================================================

// 1.1 Crear nueva Orden de Compra (DISEÑO CORPORATIVO AVANZADO + CLOUDINARY + NOTIFICACIÓN B2B)
exports.crearOrdenCompra = async (req, res) => {
    const { 
        proveedor_id, sede_id, fecha_emision, fecha_entrega_esperada, 
        condicion_pago, moneda, monto_subtotal, monto_igv, monto_total, 
        observaciones, porcentaje_impuesto 
    } = req.body;
    const usuarioCreadorId = req.usuario ? req.usuario.id : null;

    const tasaAplicada = porcentaje_impuesto ? parseFloat(porcentaje_impuesto) : 18.00;

    if (!proveedor_id || !fecha_emision || !monto_total) {
        return res.status(400).json({ msg: 'Faltan campos obligatorios para emitir la OC.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. 🔍 AUTOGENERAR EL CÓDIGO (OC-2026-000001)
        const anioActual = new Date().getFullYear();
        const countRes = await client.query(`SELECT COUNT(*) FROM ordenes_compra WHERE codigo_oc LIKE $1`, [`OC-${anioActual}-%`]);
        const siguienteNumero = parseInt(countRes.rows[0].count) + 1;
        const codigo_oc = `OC-${anioActual}-${siguienteNumero.toString().padStart(6, '0')}`;

        // 2. 🔍 OBTENER DATOS DEL PROVEEDOR, SEDE Y CREADOR
        const provRes = await client.query('SELECT razon_social, ruc, direccion, correo_contacto FROM proveedores WHERE id = $1', [proveedor_id]);
        const sedeRes = await client.query('SELECT nombre, direccion FROM sedes WHERE id = $1', [sede_id]);
        const userRes = await client.query('SELECT nombres, apellidos, correo FROM usuarios WHERE id = $1', [usuarioCreadorId]);
        
        const proveedor = provRes.rows[0];
        const sede = sedeRes.rows[0];
        const creador = userRes.rows[0] ? `${userRes.rows[0].nombres} ${userRes.rows[0].apellidos}` : 'Sistema B2B';
        const creadorCorreo = userRes.rows[0] ? userRes.rows[0].correo : '';

        // 🧹 1. LIMPIADOR MAGICO DE DIRECCIÓN JSON
        let dirLimpia = "Dirección no registrada";
        try {
            if (proveedor.direccion && proveedor.direccion.startsWith('[')) {
                const dirObj = JSON.parse(proveedor.direccion)[0];
                dirLimpia = `${dirObj.exacta || ''} ${dirObj.dist ? '- ' + dirObj.dist : ''} ${dirObj.prov ? '- ' + dirObj.prov : ''}`.trim();
            } else {
                dirLimpia = proveedor.direccion || "Dirección no registrada";
            }
        } catch(e) {
            dirLimpia = proveedor.direccion || "Dirección no registrada";
        }

        // 🧹 2. LIMPIADOR MAGICO DE CORREO JSON (Solución al bug visual)
        let emailLimpio = "No registrado";
        try {
            if (proveedor.correo_contacto && proveedor.correo_contacto.startsWith('[')) {
                const correos = JSON.parse(proveedor.correo_contacto);
                // Buscamos el correo marcado como principal, o tomamos el primero de la lista
                const correoPrincipal = correos.find(c => c.principal === true) || correos[0];
                emailLimpio = correoPrincipal ? correoPrincipal.correo : "No registrado";
            } else {
                emailLimpio = proveedor.correo_contacto || "No registrado";
            }
        } catch(e) {
            emailLimpio = "No registrado";
        }

        // 3. 🎨 DIBUJAR EL PDF CORPORATIVO
        const tempDir = path.join(__dirname, '../temp');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
        const rutaTemporalPdf = path.join(tempDir, `${codigo_oc}.pdf`);
        
        const doc = new PDFDocument({ margin: 40, size: 'A4' });
        const writeStream = fs.createWriteStream(rutaTemporalPdf);
        doc.pipe(writeStream);

        // CONFIGURACIÓN DE COLORES Y FUENTES
        const colorGrisOscuro = '#1e293b';
        const colorBordes = '#000000';
        const simbolo = moneda === 'USD' ? 'USD $' : 'S/';

        // --- ENCABEZADO SUPERIOR ---
        doc.fontSize(22).font('Helvetica-Bold').fillColor(colorGrisOscuro).text('SUPERNOVA S.A.C.', 55, 45);
        
        // Caja de la OC (Arriba a la derecha)
        doc.rect(380, 40, 175, 45).stroke(colorBordes);
        doc.fontSize(10).font('Helvetica-Bold').text('RUC N° 20123456789', 380, 45, { width: 175, align: 'center' });
        doc.fontSize(12).font('Helvetica-Bold').text(`ORDEN N° ${codigo_oc}`, 380, 62, { width: 175, align: 'center' });

        // Caja Condiciones de pago (Debajo de la OC)
        doc.rect(380, 85, 175, 30).stroke(colorBordes);
        doc.fontSize(8).font('Helvetica-Bold').text('CONDICIONES DE PAGO:', 385, 90);
        doc.fontSize(8).font('Helvetica').text(condicion_pago || 'Al contado', 385, 100);

        // --- CAJAS DE DATOS DEL PROVEEDOR Y FECHAS ---
        // Caja Proveedor (Aumenté un poco el alto a 65 para que respire más)
        doc.rect(40, 130, 340, 65).stroke();
        doc.fontSize(8).font('Helvetica-Bold').text('DATOS DEL PROVEEDOR', 45, 135);
        
        // Separamos las líneas con coordenadas Y exactas para que jamás se sobrepongan
        doc.font('Helvetica')
           .text(`Razón Social: ${proveedor.razon_social}`, 45, 148)
           .text(`RUC: ${proveedor.ruc}`, 45, 160)
           .text(`Email: ${emailLimpio}`, 150, 160) // Email al lado del RUC
           .text(`Dirección: ${dirLimpia}`, 45, 172, { width: 330, height: 20 });

        // Caja Fecha Emisión
        doc.rect(380, 130, 87.5, 65).stroke();
        doc.font('Helvetica-Bold').text('FECHA', 380, 135, { width: 87.5, align: 'center' });
        doc.font('Helvetica').text(fecha_emision.split('-').reverse().join('/'), 380, 155, { width: 87.5, align: 'center' });

        // Caja Plazo Entrega
        doc.rect(467.5, 130, 87.5, 65).stroke();
        doc.font('Helvetica-Bold').text('PLAZO ENTREGA', 467.5, 135, { width: 87.5, align: 'center' });
        doc.font('Helvetica').text(fecha_entrega_esperada ? fecha_entrega_esperada.split('-').reverse().join('/') : 'A coordinar', 467.5, 155, { width: 87.5, align: 'center' });

        // --- TABLA PRINCIPAL DE ÍTEMS ---
        const tableTop = 210;
        doc.rect(40, tableTop, 515, 20).stroke(); // Cabecera
        doc.rect(40, tableTop + 20, 515, 400).stroke(); // Cuerpo de la tabla
        
        // Líneas verticales de la tabla
        doc.moveTo(80, tableTop).lineTo(80, tableTop + 420).stroke(); // Item | Cant
        doc.moveTo(130, tableTop).lineTo(130, tableTop + 420).stroke(); // Cant | Articulo
        doc.moveTo(410, tableTop).lineTo(410, tableTop + 420).stroke(); // Articulo | Precio U.
        doc.moveTo(480, tableTop).lineTo(480, tableTop + 420).stroke(); // Precio U. | Total

        // Textos Cabecera
        doc.font('Helvetica-Bold').fontSize(8);
        doc.text('ITEM', 40, tableTop + 6, { width: 40, align: 'center' });
        doc.text('CANT', 80, tableTop + 6, { width: 50, align: 'center' });
        doc.text('ARTÍCULO / DESCRIPCIÓN', 140, tableTop + 6);
        doc.text('PRECIO U.', 410, tableTop + 6, { width: 70, align: 'center' });
        doc.text('TOTAL', 480, tableTop + 6, { width: 75, align: 'center' });

        // Rellenar la Fila Única (Usamos "Observaciones" como el artículo)
        doc.font('Helvetica').fontSize(9);
        const itemY = tableTop + 30;
        doc.text('0001', 40, itemY, { width: 40, align: 'center' });
        doc.text('1 UN', 80, itemY, { width: 50, align: 'center' });
        doc.text(observaciones || 'Servicio / Compra general', 140, itemY, { width: 260 });
        doc.text(`${parseFloat(monto_subtotal).toFixed(2)}`, 410, itemY, { width: 65, align: 'right' });
        doc.text(`${parseFloat(monto_subtotal).toFixed(2)}`, 480, itemY, { width: 70, align: 'right' });

        // --- ZONA INFERIOR (TOTALES Y DATOS EXTRAS) ---
        const footerY = 630;
        
        // Caja Quién lo hizo
        doc.rect(40, footerY, 370, 45).stroke();
        doc.fontSize(7).font('Helvetica-Bold').text('Creador de OC:', 45, footerY + 5);
        doc.font('Helvetica').text(`${creador}`, 110, footerY + 5);
        doc.font('Helvetica-Bold').text('Correo Creador:', 45, footerY + 15);
        doc.font('Helvetica').text(`${creadorCorreo}`, 110, footerY + 15);
        doc.font('Helvetica-Bold').text('Aprobador:', 45, footerY + 25);
        doc.font('Helvetica').text(`SISTEMA DE APROBACIÓN AUTOMÁTICA`, 110, footerY + 25);

        // Caja Totales
        doc.rect(410, footerY, 145, 45).stroke();
        doc.fontSize(8);
        doc.font('Helvetica-Bold').text('Subtotal:', 415, footerY + 5);
        doc.font('Helvetica').text(`${simbolo} ${parseFloat(monto_subtotal).toFixed(2)}`, 415, footerY + 5, { width: 135, align: 'right' });
        
        doc.font('Helvetica-Bold').text(`Impuesto (${tasaAplicada}%):`, 415, footerY + 17);
        doc.font('Helvetica').text(`${simbolo} ${parseFloat(monto_igv).toFixed(2)}`, 415, footerY + 17, { width: 135, align: 'right' });
        
        doc.font('Helvetica-Bold').text('Total:', 415, footerY + 30);
        doc.font('Helvetica-Bold').text(`${simbolo} ${parseFloat(monto_total).toFixed(2)}`, 415, footerY + 30, { width: 135, align: 'right' });

        // Caja Lugar de Entrega
        doc.rect(40, footerY + 45, 515, 30).stroke();
        doc.fontSize(8).font('Helvetica-Bold').text('Lugar de Entrega / Servicio:', 45, footerY + 50);
        doc.font('Helvetica').text(`SEDE ${sede.nombre.toUpperCase()} - ${sede.direccion || 'Dirección no especificada'}`, 45, footerY + 60);

        // Notas legales
        doc.fontSize(7).font('Helvetica').text('Los comprobantes de pago deben remitirse al correo oficial adjuntando obligatoriamente su representación impresa (PDF) y el archivo XML. Es requisito indispensable colocar en su factura el número exacto de esta Orden de Compra.', 40, footerY + 85, { width: 515, align: 'justify' });

        doc.end();

        // 4. ⏳ ESPERAMOS A QUE TERMINE DE DIBUJAR
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        // 5. ☁️ SUBIMOS EL PDF A CLOUDINARY
        const uploadResponse = await cloudinary.uploader.upload(rutaTemporalPdf, {
            folder: 'supernova_ordenes',
            resource_type: 'raw',
            public_id: codigo_oc
        });
        const urlCloudinary = uploadResponse.secure_url;

        // 🧹 Limpieza local
        fs.unlinkSync(rutaTemporalPdf);

        // 6. 💾 GUARDAR EN BASE DE DATOS
        const result = await client.query(
            `INSERT INTO ordenes_compra (
                proveedor_id, sede_id, usuario_creador_id, codigo_oc, fecha_emision, 
                fecha_entrega_esperada, moneda, monto_subtotal, monto_igv, monto_total, 
                condicion_pago, estado, observaciones, archivo_pdf_url, porcentaje_impuesto
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'EMITIDA', $12, $13, $14) RETURNING *`,
            [
                proveedor_id, sede_id, usuarioCreadorId, codigo_oc, fecha_emision, 
                fecha_entrega_esperada || null, moneda, monto_subtotal, monto_igv, monto_total, 
                condicion_pago || 'Al contado', observaciones, urlCloudinary, tasaAplicada
            ]
        );

        const nuevaOC = result.rows[0];

        // 7. 📝 AUDITORÍA (Interna)
        await client.query(
            `INSERT INTO auditoria (usuario_id, modulo, accion, registro_id, detalle) 
             VALUES ($1, 'ORDENES_COMPRA', 'CREAR', $2, $3)`,
            [usuarioCreadorId, nuevaOC.id, `Se emitió la OC N° ${codigo_oc} corporativa en Cloudinary`]
        );

        // 🔥 8. NUEVO: NOTIFICACIÓN B2B (Disparador a la Campana del Proveedor)
        const tituloNoti = "📄 Nueva Orden de Compra Emitida";
        const textoNoti = `SuperNova S.A.C. ha emitido la Orden de Compra ${codigo_oc} por el monto de ${simbolo} ${parseFloat(monto_total).toFixed(2)}. Puede revisarla y descargar el PDF en la pestaña "Órdenes de Compra".`;

        await client.query(
            `INSERT INTO notificaciones_b2b (proveedor_id, titulo, mensaje, tipo) 
             VALUES ($1, $2, $3, 'orden')`,
            [proveedor_id, tituloNoti, textoNoti]
        );

        await client.query('COMMIT');
        res.status(201).json({ msg: 'Orden emitida y guardada en la Nube con éxito', orden: nuevaOC });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error al crear OC corporativa:", err);
        res.status(500).json({ msg: 'Error interno al crear y subir la Orden de Compra.' });
    } finally {
        client.release();
    }
}; 

// 1.2 Obtener todas las Órdenes de Compra (Para tu panel interno)
exports.obtenerOrdenesInternas = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                o.*, 
                p.razon_social as proveedor_nombre, 
                p.ruc as proveedor_ruc,
                u.nombres as creador_nombre
            FROM ordenes_compra o
            LEFT JOIN proveedores p ON o.proveedor_id = p.id
            LEFT JOIN usuarios u ON o.usuario_creador_id = u.id
            ORDER BY o.fecha_registro DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error al obtener OC internas:", err);
        res.status(500).json({ msg: 'Error al cargar las Órdenes de Compra.' });
    }
};

// 1.3 Cambiar el estado de la OC
exports.actualizarEstadoOC = async (req, res) => {
    const { id } = req.params;
    const { estado } = req.body; 
    const usuarioId = req.usuario ? req.usuario.id : null;

    try {
        const result = await pool.query(
            'UPDATE ordenes_compra SET estado = $1 WHERE id = $2 RETURNING codigo_oc',
            [estado, id]
        );

        if (result.rows.length === 0) return res.status(404).json({ msg: 'OC no encontrada.' });

        await pool.query(
            `INSERT INTO auditoria (usuario_id, modulo, accion, registro_id, detalle) VALUES ($1, 'ORDENES_COMPRA', 'ACTUALIZAR_ESTADO', $2, $3)`,
            [usuarioId, id, `Cambió estado de OC N° ${result.rows[0].codigo_oc} a: ${estado}`]
        );

        res.json({ msg: `El estado de la OC cambió a ${estado}` });
    } catch (err) {
        console.error("❌ Error al cambiar estado de OC:", err);
        res.status(500).json({ msg: 'Error al actualizar el estado.' });
    }
};

// =======================================================
// 2. FUNCIONES B2B (EXCLUSIVO PARA EL PORTAL PROVEEDORES)
// =======================================================

// 2.1 Obtener SOLO las Órdenes del Proveedor logueado
exports.obtenerOrdenesB2B = async (req, res) => {
    const proveedorId = req.usuario.proveedor_id;
    
    if (!proveedorId) {
        return res.status(403).json({ msg: 'Acceso denegado. Perfil no autorizado.' });
    }

    try {
        // 🔥 MAGIA: Mapeamos TUS columnas reales a los nombres que espera el Frontend
        const result = await pool.query(`
            SELECT 
                codigo_oc as oc, 
                TO_CHAR(fecha_emision, 'DD/MM/YYYY') as fecha, 
                condicion_pago as condicion, 
                moneda, 
                monto_total as total, 
                observaciones as desc, 
                estado, 
                archivo_pdf_url as archivo_pdf
            FROM ordenes_compra
            WHERE proveedor_id = $1
            ORDER BY fecha_registro DESC
        `, [proveedorId]);

        res.json(result.rows);
    } catch (err) {
        console.error("❌ Error al obtener OC del proveedor:", err);
        res.status(500).json({ msg: 'Error al obtener sus Órdenes de Compra.' });
    }
};

// =======================================================
// 3. VALIDACIÓN B2B (ANTIFRAUDE PARA FACTURACIÓN)
// =======================================================

exports.validarOrdenCompraB2B = async (req, res) => {
    const { codigo } = req.params;
    const proveedorId = req.usuario.proveedor_id; 

    if (!proveedorId) {
        return res.status(403).json({ msg: 'Acceso denegado. Solo proveedores pueden validar Órdenes.' });
    }

    try {
        // 🔥 ACTUALIZACIÓN: Seleccionamos también 'porcentaje_impuesto'
        const result = await pool.query(`
            SELECT id, codigo_oc, moneda, monto_subtotal, monto_igv, monto_total, estado, porcentaje_impuesto 
            FROM ordenes_compra 
            WHERE codigo_oc = $1 AND proveedor_id = $2
        `, [codigo.toUpperCase().trim(), proveedorId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Orden de Compra no encontrada o no pertenece a su empresa.' });
        }

        const orden = result.rows[0];

        // 🛡️ BLINDAJE: Evitar doble facturación
        if (orden.estado === 'FACTURADA' || orden.estado === 'COMPLETADA') {
            return res.status(400).json({ msg: 'Esta Orden de Compra ya se encuentra facturada o cerrada.' });
        }
        if (orden.estado === 'ANULADA') {
            return res.status(400).json({ msg: 'Esta Orden de Compra fue anulada y no puede ser facturada.' });
        }

        // ✅ RESPUESTA ACTUALIZADA CON IMPUESTO DINÁMICO
        res.json({
            msg: 'Orden válida y lista para facturar.',
            orden: {
                id: orden.id,
                codigo: orden.codigo_oc,
                moneda: orden.moneda,
                subtotal: parseFloat(orden.monto_subtotal).toFixed(2),
                igv: parseFloat(orden.monto_igv).toFixed(2),
                total: parseFloat(orden.monto_total).toFixed(2),
                // 🔥 ENVIAMOS EL PORCENTAJE REAL (Ej: 10.50 o 18.00)
                porcentaje_impuesto: parseFloat(orden.porcentaje_impuesto || 18).toFixed(2)
            }
        });

    } catch (err) {
        console.error("❌ Error al validar OC B2B:", err);
        res.status(500).json({ msg: 'Error interno al validar la Orden de Compra.' });
    }
};