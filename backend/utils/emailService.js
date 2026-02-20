// Ubicacion: backend/utils/emailService.js
const nodemailer = require('nodemailer');

// 1. CONFIGURACIÓN DEL TRANSPORTE (Asegúrate de tener tus credenciales aquí)
const transporter = nodemailer.createTransport({
    service: 'gmail', 
    auth: {
        user: 'aarellano@gruposp.pe', // ⚠️ TU CORREO
        pass: 'vdcpgnkglmcoghml'  // ⚠️ TU CLAVE
    }
});

const enviarCorreoComprobante = async (destinatario, datos) => {
    try {
        const { cliente, tipo_doc, serie, numero, total, link_pdf, fecha } = datos;

        // 🎨 DISEÑO PREMIUM HTML
        const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 0; background-color: #f3f4f6; }
                .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
                .header { background: linear-gradient(135deg, #6366f1 0%, #4f46e5 100%); padding: 40px 20px; text-align: center; }
                .header h1 { color: white; margin: 0; font-size: 24px; font-weight: 600; letter-spacing: 0.5px; }
                .header p { color: #e0e7ff; margin: 5px 0 0 0; font-size: 14px; }
                .content { padding: 40px 30px; color: #334155; }
                .greeting { font-size: 18px; margin-bottom: 20px; color: #1e293b; }
                
                .ticket-card { background-color: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 20px; margin: 25px 0; text-align: center; }
                .ticket-info { margin-bottom: 15px; }
                .ticket-label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; display: block; margin-bottom: 5px; }
                .ticket-value { font-size: 18px; color: #0f172a; font-weight: 600; }
                .amount-value { font-size: 28px; color: #10b981; font-weight: 800; }
                
                .btn-container { text-align: center; margin-top: 30px; }
                .btn-download { background-color: #6366f1; color: white !important; padding: 15px 35px; border-radius: 50px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block; box-shadow: 0 4px 6px rgba(99, 102, 241, 0.25); transition: all 0.3s ease; }
                
                .footer { background-color: #f1f5f9; padding: 20px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
                .link-fallback { font-size: 11px; color: #94a3b8; margin-top: 20px; word-break: break-all; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>¡Gracias por su compra!</h1>
                    <p>Su comprobante electrónico ha sido generado exitosamente.</p>
                </div>
                
                <div class="content">
                    <p class="greeting">Hola, <strong>${cliente}</strong> 👋</p>
                    <p style="line-height: 1.6;">Adjuntamos el detalle de su transacción realizada el día <strong>${fecha}</strong>.</p>
                    
                    <div class="ticket-card">
                        <div class="ticket-info">
                            <span class="ticket-label">Documento</span>
                            <span class="ticket-value">${tipo_doc} ${serie}-${numero}</span>
                        </div>
                        <div class="ticket-info">
                            <span class="ticket-label">Importe Total</span>
                            <span class="amount-value">S/ ${parseFloat(total).toFixed(2)}</span>
                        </div>
                    </div>

                    <div class="btn-container">
                        <a href="${link_pdf}" class="btn-download">
                            Descargar PDF
                        </a>
                    </div>
                    
                    <div style="text-align: center;">
                        <p class="link-fallback">
                            Si el botón no funciona, copie este enlace:<br>
                            <a href="${link_pdf}" style="color: #6366f1;">${link_pdf}</a>
                        </p>
                    </div>
                </div>
                
                <div class="footer">
                    <p>© 2026 SuperNova POS - Sistema de Ventas</p>
                    <p>Este es un correo automático, por favor no responder.</p>
                </div>
            </div>
        </body>
        </html>
        `;

        const info = await transporter.sendMail({
            from: '"SuperNova Facturación" <no-reply@supernova.com>',
            to: destinatario,
            subject: `✅ Comprobante ${serie}-${numero} | ${cliente}`,
            html: htmlContent
        });

        console.log("✅ Correo enviado ID:", info.messageId);
        return { success: true };

    } catch (error) {
        console.error("❌ Error enviando correo:", error);
        return { success: false, error: error.message };
    }
};

/**
 * Envía el Plan de Pagos Aprobado a Gerencia
 * @param {Array} facturasAprobadas - Lista de objetos con datos de la factura
 */
const enviarPlanPagosAprobado = async (facturasAprobadas) => {
    try {
        const destinatarios = "eherrera@gruposp.pe, aarellano@gruposp.pe";
        
        // Generar filas de la tabla dinámicamente
        const filasHtml = facturasAprobadas.map(f => `
            <tr>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${f.proveedor}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0;">${f.numero_documento}</td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #10b981;">
                    ${f.moneda === 'USD' ? '$' : 'S/'} ${parseFloat(f.monto_aprobado).toFixed(2)}
                </td>
                <td style="padding: 10px; border-bottom: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
                    ${f.banco || '-'} / ${f.cci || f.numero_cuenta || '-'}
                </td>
            </tr>
        `).join('');

        const totalPEN = facturasAprobadas.filter(x => x.moneda !== 'USD').reduce((acc, cur) => acc + parseFloat(cur.monto_aprobado), 0);
        const totalUSD = facturasAprobadas.filter(x => x.moneda === 'USD').reduce((acc, cur) => acc + parseFloat(cur.monto_aprobado), 0);

        const htmlContent = `
        <div style="font-family: 'Segoe UI', sans-serif; color: #334155; max-width: 700px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
            <div style="background: #1e293b; padding: 30px; text-align: center; color: white;">
                <h2 style="margin: 0;">📅 Plan de Pagos Autorizado</h2>
                <p style="opacity: 0.8; font-size: 14px;">Fecha de Ejecución: ${new Date().toLocaleDateString('es-PE')}</p>
            </div>
            <div style="padding: 30px;">
                <p>Estimados, se ha generado el reporte de pagos aprobados para su ejecución hoy:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <thead>
                        <tr style="background: #f8fafc; text-align: left; font-size: 13px; color: #64748b;">
                            <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Proveedor</th>
                            <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Documento</th>
                            <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Monto Aprob.</th>
                            <th style="padding: 10px; border-bottom: 2px solid #e2e8f0;">Datos Bancarios</th>
                        </tr>
                    </thead>
                    <tbody style="font-size: 13px;">
                        ${filasHtml}
                    </tbody>
                </table>

                <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin-top: 20px;">
                    <p style="margin: 0; font-weight: bold; color: #1e293b;">Resumen Total a Pagar:</p>
                    <h3 style="margin: 5px 0 0 0; color: #0f172a;">S/ ${totalPEN.toFixed(2)} | $ ${totalUSD.toFixed(2)}</h3>
                </div>
            </div>
            <div style="background: #f8fafc; padding: 15px; text-align: center; font-size: 11px; color: #94a3b8;">
                Sistema SuperNova POS - Control de Tesorería Diaria
            </div>
        </div>
        `;

        const info = await transporter.sendMail({
            from: '"SuperNova Tesorería" <aarellano@gruposp.pe>',
            to: destinatarios,
            subject: `🚀 Plan de Pagos Aprobado - ${facturasAprobadas.length} documentos`,
            html: htmlContent
        });

        return { success: true, messageId: info.messageId };
    } catch (error) {
        console.error("❌ Error enviando plan de pagos:", error);
        return { success: false, error: error.message };
    }
};

// Actualizamos las exportaciones
module.exports = { enviarCorreoComprobante, enviarPlanPagosAprobado };
