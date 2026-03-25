// Ubicación: SuperNova/frontend/modules/comprobantes/comprobantes.js

(async function() {
    console.log("Módulo de Comprobantes Cargado (Con Paginación B2B) 🚀");

    const tbody = document.getElementById('tabla-comprobantes-body');
    const token = localStorage.getItem('proveedor_token');
    
    // --- VARIABLES DE PAGINACIÓN ---
    let todosLosComprobantes = []; 
    let filtradosB2B = [];         
    let paginaActual = 1;
    const filasPorPagina = 8; 

    // Función para formatear moneda
    const formatoMoneda = (monto) => {
        return parseFloat(monto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // --- 1. FUNCIÓN DE RENDERIZADO (EL DIBUJO) ---
    function renderizarTabla() {
        tbody.innerHTML = '';
        
        // Calculamos qué parte del array mostrar
        const inicio = (paginaActual - 1) * filasPorPagina;
        const fin = inicio + filasPorPagina;
        const comprobantesVisibles = filtradosB2B.slice(inicio, fin);

        if (comprobantesVisibles.length === 0) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #64748b; padding: 20px;">No se encontraron comprobantes.</td></tr>`;
            actualizarControlesPaginacion();
            return;
        }

        comprobantesVisibles.forEach((fac) => {
            let statusClass = (fac.estado_pago || 'pendiente').toLowerCase();
            let monedaSimbolo = fac.moneda === 'USD' ? '$' : 'S/';
            let formaPagoTxt = fac.forma_pago || 'Crédito';

            // Botón de Crédito conectado al Modal Camaleón
            let badgePago = formaPagoTxt.toLowerCase().includes('crédito') || formaPagoTxt.toLowerCase().includes('credito')
                ? `<span class="badge-pago badge-credito" onclick="mostrarAlertaB2B('En Construcción', 'El historial detallado de cuotas y pagos parciales estará disponible próximamente.', 'warning')" style="cursor:pointer;"><i class='bx bx-list-ul'></i> Crédito</span>`
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
                <td>${fac.fecha_emision ? fac.fecha_emision.slice(0, 10) : '-'}</td>
                <td><strong>${monedaSimbolo} ${formatoMoneda(fac.monto_total)}</strong></td>
                <td>${badgePago}</td>
                <td><span class="status ${statusClass}">${fac.estado_pago.toUpperCase()}</span></td>
                <td style="white-space: nowrap;">
                    ${botonesArchivos}
                </td>
            `;
            tbody.appendChild(tr);
        });

        actualizarControlesPaginacion();
    }

    // --- 2. FUNCIÓN DE CONTROLES DE PAGINACIÓN ---
    function actualizarControlesPaginacion() {
        const totalPaginas = Math.ceil(filtradosB2B.length / filasPorPagina);
        const contenedor = document.getElementById('b2b-page-controls');

        if(!contenedor) return;
        contenedor.innerHTML = '';

        // Etiqueta de información
        const info = document.createElement('span');
        info.innerText = `Pág ${paginaActual} de ${totalPaginas || 1}`;
        info.style.marginRight = '10px';
        info.style.color = '#64748b';
        info.style.fontSize = '0.9rem';
        info.style.fontWeight = '600';

        // Botón Anterior
        const btnPrev = document.createElement('button');
        btnPrev.innerHTML = "<i class='bx bx-chevron-left'></i>";
        btnPrev.disabled = paginaActual === 1;
        btnPrev.style.cssText = `padding: 5px 12px; font-size: 1.2rem; margin: 0 3px; cursor: ${paginaActual === 1 ? 'not-allowed' : 'pointer'}; border-radius: 5px; border: 1px solid #cbd5e1; background: ${paginaActual === 1 ? '#f8fafc' : '#fff'}; color: ${paginaActual === 1 ? '#94a3b8' : '#334155'}; transition: 0.2s;`;
        if (paginaActual > 1) {
            btnPrev.onmouseover = () => btnPrev.style.background = '#f1f5f9';
            btnPrev.onmouseout = () => btnPrev.style.background = '#fff';
        }
        btnPrev.onclick = () => { paginaActual--; renderizarTabla(); };
        
        // Botón Siguiente
        const btnNext = document.createElement('button');
        btnNext.innerHTML = "<i class='bx bx-chevron-right'></i>";
        btnNext.disabled = paginaActual === totalPaginas || totalPaginas === 0;
        btnNext.style.cssText = `padding: 5px 12px; font-size: 1.2rem; margin: 0 3px; cursor: ${(paginaActual === totalPaginas || totalPaginas === 0) ? 'not-allowed' : 'pointer'}; border-radius: 5px; border: 1px solid #cbd5e1; background: ${(paginaActual === totalPaginas || totalPaginas === 0) ? '#f8fafc' : '#fff'}; color: ${(paginaActual === totalPaginas || totalPaginas === 0) ? '#94a3b8' : '#334155'}; transition: 0.2s;`;
        if (paginaActual < totalPaginas && totalPaginas !== 0) {
            btnNext.onmouseover = () => btnNext.style.background = '#f1f5f9';
            btnNext.onmouseout = () => btnNext.style.background = '#fff';
        }
        btnNext.onclick = () => { paginaActual++; renderizarTabla(); };

        contenedor.appendChild(info);
        contenedor.appendChild(btnPrev);
        contenedor.appendChild(btnNext);
    }

    // --- 3. CARGA INICIAL (FETCH) ---
    try {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center;"><i class='bx bx-loader-alt bx-spin'></i> Cargando sus comprobantes...</td></tr>`;

        const res = await fetch('http://localhost:3000/api/facturas/b2b/mis-comprobantes', {
            method: 'GET',
            headers: { 'x-auth-token': token }
        });

        const facturas = await res.json();

        if (res.ok) {
            todosLosComprobantes = facturas;
            filtradosB2B = [...todosLosComprobantes]; // Clonamos la data original
            renderizarTabla();
        } else {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444;">Error al cargar comprobantes: ${facturas.msg}</td></tr>`;
        }

    } catch (error) {
        console.error("Error de red:", error);
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #ef4444;">Error de conexión con el servidor.</td></tr>`;
    }

    // --- 4. BUSCADOR MEJORADO (FILTRA Y RE-PAGINA) ---
    document.getElementById('buscar-comprobante').addEventListener('keyup', function() {
        let texto = this.value.toLowerCase().trim();
        
        filtradosB2B = todosLosComprobantes.filter(fac => 
            (fac.numero_documento || '').toLowerCase().includes(texto) ||
            (fac.tipo_documento || '').toLowerCase().includes(texto)
        );

        paginaActual = 1; // Siempre regresamos a la página 1 al buscar
        renderizarTabla();
    });

})();

window.cerrarModalCuotas = function() {
    document.getElementById('modal-cuotas').classList.add('hidden');
};