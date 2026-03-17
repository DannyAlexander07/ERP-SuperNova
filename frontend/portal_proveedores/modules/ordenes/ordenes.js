(async function() {
    console.log("Módulo Órdenes de Compra Cargado (Datos Reales)");

    const tbody = document.getElementById('tabla-ordenes-body');
    const token = localStorage.getItem('proveedor_token');

    const formatoMoneda = (monto) => {
        return parseFloat(monto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    try {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;"><i class='bx bx-loader-alt bx-spin'></i> Buscando Órdenes de Compra...</td></tr>`;

        // Llamada a nuestra nueva ruta B2B
        const res = await fetch('http://localhost:3000/api/ordenes/b2b/mis-ordenes', {
            method: 'GET',
            headers: { 'x-auth-token': token }
        });

        const ordenes = await res.json();

        if (res.ok) {
            tbody.innerHTML = '';

            if (ordenes.length === 0) {
                tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748b;">Aún no se le han emitido Órdenes de Compra.</td></tr>`;
                return;
            }

            ordenes.forEach((orden) => {
                let statusClass = (orden.estado || 'emitida').toLowerCase();
                let monedaSimbolo = orden.moneda === 'PEN' ? 'S/' : '$';
                
                // Si hay PDF, mostramos el botón. Si no, mostramos un texto gris.
                let btnPdf = orden.archivo_pdf 
                    ? `<a href="${orden.archivo_pdf}" target="_blank" class="btn-pdf" title="Descargar PDF de la Orden" style="text-decoration: none;"><i class='bx bxs-file-pdf'></i> Ver PDF</a>`
                    : `<span style="color: #94a3b8; font-size: 0.8rem;">Sin Archivo</span>`;

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td class="oc-id">${orden.oc}</td>
                    <td>${orden.fecha}</td>
                    <td><span class="condicion-pago">${orden.condicion}</span></td>
                    <td><strong>${orden.moneda}</strong></td>
                    <td>${monedaSimbolo} ${formatoMoneda(orden.total)}</td>
                    <td>${orden.desc}</td>
                    <td><span class="status ${statusClass}">${orden.estado}</span></td>
                    <td>${btnPdf}</td>
                `;
                tbody.appendChild(tr);
            });
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #ef4444;">Error: ${ordenes.msg}</td></tr>`;
        }
    } catch (error) {
        console.error("Error de red:", error);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #ef4444;">Error de conexión con el servidor.</td></tr>`;
    }

    // Buscador en tiempo real
    document.getElementById('buscar-oc').addEventListener('keyup', function() {
        let texto = this.value.toLowerCase();
        let filas = tbody.querySelectorAll('tr');
        
        filas.forEach(fila => {
            let contenido = fila.textContent.toLowerCase();
            fila.style.display = contenido.includes(texto) ? '' : 'none';
        });
    });

})();