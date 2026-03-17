(async function() {
    console.log("Módulo de Comprobantes Cargado (Datos Reales)");

    const tbody = document.getElementById('tabla-comprobantes-body');
    const token = localStorage.getItem('proveedor_token');

    // Función para formatear moneda
    const formatoMoneda = (monto) => {
        return parseFloat(monto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    try {
        // 1. LLAMADA REAL AL BACKEND
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;"><i class='bx bx-loader-alt bx-spin'></i> Cargando sus comprobantes...</td></tr>`;

        const res = await fetch('http://localhost:3000/api/facturas/b2b/mis-comprobantes', {
            method: 'GET',
            headers: { 'x-auth-token': token }
        });

        const facturas = await res.json();

        if (res.ok) {
            tbody.innerHTML = ''; // Limpiamos el loading

            if (facturas.length === 0) {
                tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b;">No tiene comprobantes registrados en el sistema.</td></tr>`;
                return;
            }

            // 2. DIBUJAR LA TABLA CON LOS DATOS DE POSTGRESQL
            facturas.forEach((fac) => {
                let statusClass = (fac.estado_pago || 'pendiente').toLowerCase();
                let monedaSimbolo = fac.moneda === 'USD' ? '$' : 'S/';
                let formaPagoTxt = fac.forma_pago || 'Crédito';

                // Por ahora el botón crédito solo muestra una alerta, luego lo conectaremos a los pagos parciales
                let badgePago = formaPagoTxt.toLowerCase().includes('crédito') || formaPagoTxt.toLowerCase().includes('credito')
                    ? `<span class="badge-pago badge-credito" onclick="alert('Historial de cuotas en construcción')"><i class='bx bx-list-ul'></i> Crédito</span>`
                    : `<span class="badge-pago badge-contado">Contado</span>`;

                // ==========================================
                // CREACIÓN DE BOTONES (PDF Y XML)
                // ==========================================
                let botonesArchivos = `
                    <a href="${fac.evidencia_url}" target="_blank" class="btn-pdf" style="text-decoration:none; display:inline-flex; align-items:center; gap:5px; margin-right: 5px;" title="Ver PDF Original">
                        <i class='bx bxs-file-pdf'></i> PDF
                    </a>
                `;

                // Si la consulta trajo un enlace XML, agregamos el botón naranja
                if (fac.xml_url) {
                    botonesArchivos += `
                        <a href="${fac.xml_url}" target="_blank" style="background: #f59e0b; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 0.8rem; text-decoration:none; display:inline-flex; align-items:center; gap:5px;" title="Descargar XML SUNAT">
                            <i class='bx bx-code-block'></i> XML
                        </a>
                    `;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="comprobante-id">${fac.numero_documento}</td>
                    <td>${fac.tipo_documento}</td>
                    <td>${fac.fecha_emision}</td>
                    <td><strong>${monedaSimbolo} ${formatoMoneda(fac.monto_total)}</strong></td>
                    <td>${badgePago}</td>
                    <td><span class="status ${statusClass}">${fac.estado_pago.toUpperCase()}</span></td>
                    <td style="white-space: nowrap;">
                        ${botonesArchivos}
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444;">Error al cargar comprobantes: ${facturas.msg}</td></tr>`;
        }

    } catch (error) {
        console.error("Error de red:", error);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444;">Error de conexión con el servidor.</td></tr>`;
    }

    // Buscador en tiempo real
    document.getElementById('buscar-comprobante').addEventListener('keyup', function() {
        let texto = this.value.toLowerCase();
        let filas = tbody.querySelectorAll('tr');
        
        filas.forEach(fila => {
            let contenido = fila.textContent.toLowerCase();
            fila.style.display = contenido.includes(texto) ? '' : 'none';
        });
    });

})();

window.cerrarModalCuotas = function() {
    document.getElementById('modal-cuotas').classList.add('hidden');
};