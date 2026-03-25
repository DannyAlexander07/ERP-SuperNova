// Ubicación: SuperNova/frontend/modules/ordenes/ordenes.js

(async function() {
    console.log("Módulo Órdenes de Compra Cargado (Paginación B2B) 🚚");

    // --- VARIABLES GLOBALES DEL MÓDULO ---
    const tbody = document.getElementById('tabla-ordenes-body');
    const token = localStorage.getItem('proveedor_token');
    let todasLasOrdenes = []; // Aquí guardaremos todo lo que venga del servidor
    let filtradasB2B = [];    // Para que el buscador y la paginación trabajen juntos
    let paginaActual = 1;
    const filasPorPagina = 8; 

    const formatoMoneda = (monto) => {
        return parseFloat(monto).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    // --- 1. FUNCIÓN DE RENDERIZADO (EL DIBUJO) ---
    function renderizarTabla() {
        tbody.innerHTML = '';
        
        // Calculamos qué parte del array mostrar
        const inicio = (paginaActual - 1) * filasPorPagina;
        const fin = inicio + filasPorPagina;
        const ordenesVisibles = filtradasB2B.slice(inicio, fin);

        if (ordenesVisibles.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #64748b; padding: 20px;">No se encontraron registros.</td></tr>`;
            return;
        }

        ordenesVisibles.forEach((orden) => {
            let statusClass = (orden.estado || 'emitida').toLowerCase();
            let monedaSimbolo = orden.moneda === 'PEN' ? 'S/' : '$';
            let btnPdf = orden.archivo_pdf 
                ? `<a href="${orden.archivo_pdf}" target="_blank" class="btn-pdf" style="text-decoration: none;"><i class='bx bxs-file-pdf'></i> Ver PDF</a>`
                : `<span style="color: #94a3b8; font-size: 0.8rem;">Sin Archivo</span>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td class="oc-id">${orden.oc}</td>
                <td>${orden.fecha}</td>
                <td><span class="condicion-pago">${orden.condicion}</span></td>
                <td><strong>${orden.moneda}</strong></td>
                <td>${monedaSimbolo} ${formatoMoneda(orden.total)}</td>
                <td style="max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${orden.desc}</td>
                <td><span class="status ${statusClass}">${orden.estado}</span></td>
                <td>${btnPdf}</td>
            `;
            tbody.appendChild(tr);
        });

        actualizarControlesPaginacion();
    }

    // --- 2. FUNCIÓN DE CONTROLES (BOTONES) ---
    function actualizarControlesPaginacion() {
        const totalPaginas = Math.ceil(filtradasB2B.length / filasPorPagina);
        const contenedor = document.getElementById('b2b-page-controls');
        const info = document.getElementById('b2b-page-info');

        if(info) info.innerText = `Página ${paginaActual} de ${totalPaginas || 1}`;
        if(!contenedor) return;

        contenedor.innerHTML = '';

        const btnPrev = document.createElement('button');
        btnPrev.innerHTML = "<i class='bx bx-chevron-left'></i>";
        btnPrev.disabled = paginaActual === 1;
        btnPrev.onclick = () => { paginaActual--; renderizarTabla(); };
        
        const btnNext = document.createElement('button');
        btnNext.innerHTML = "<i class='bx bx-chevron-right'></i>";
        btnNext.disabled = paginaActual === totalPaginas || totalPaginas === 0;
        btnNext.onclick = () => { paginaActual++; renderizarTabla(); };

        contenedor.appendChild(btnPrev);
        contenedor.appendChild(btnNext);
    }

    // --- 3. CARGA INICIAL ---
    try {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;"><i class='bx bx-loader-alt bx-spin'></i> Buscando Órdenes de Compra...</td></tr>`;

        const res = await fetch('/api/ordenes/b2b/mis-ordenes', {
            method: 'GET',
            headers: { 'x-auth-token': token }
        });

        const data = await res.json();

        if (res.ok) {
            todasLasOrdenes = data;
            filtradasB2B = [...todasLasOrdenes]; // Al inicio, filtradas es igual a todas
            renderizarTabla();
        } else {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #ef4444;">Error: ${data.msg}</td></tr>`;
        }
    } catch (error) {
        console.error("Error de red:", error);
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #ef4444;">Error de conexión.</td></tr>`;
    }

    // --- 4. BUSCADOR MEJORADO (FILTRA Y RE-PAGINA) ---
    document.getElementById('buscar-oc').addEventListener('keyup', function() {
        let texto = this.value.toLowerCase();
        
        // Filtramos sobre el array original
        filtradasB2B = todasLasOrdenes.filter(orden => 
            orden.oc.toLowerCase().includes(texto) || 
            orden.desc.toLowerCase().includes(texto)
        );

        paginaActual = 1; // Siempre regresar a la página 1 al buscar
        renderizarTabla();
    });

})();