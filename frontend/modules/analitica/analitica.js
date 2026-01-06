// Ubicacion: SuperNova/frontend/modules/analitica/analitica.js

(function() {
    console.log("Modulo Analítica Avanzada Cargado 🚀");

    // VARIABLES GLOBALES
    let datosGlobalesPyL = [];
    let paginaActual = 1;
    const FILAS_POR_PAGINA = 8;
    
    // Variables para Gráficos
    let chartBarras = null;
    let chartDona = null;
    let chartMix = null;
    let chartGastos = null;
    let chartUtilidad = null;
    let chartGlobal = null;

    // --- 0. FUNCIÓN DE SEGURIDAD: CARGAR LIBRERÍA ---
    function cargarLibreriaGraficos() {       
        return new Promise((resolve, reject) => {
            if (typeof Chart !== 'undefined') return resolve();
            console.log("Descargando Chart.js...");
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error("No se pudo cargar Chart.js"));
            document.head.appendChild(script);
        });
    }

    // --- 1. FUNCIONES DE RENDERIZADO (DEFINIR PRIMERO) ---
    
    function renderizarTabla() {
        const tbody = document.getElementById('pyl-detalle-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        if (datosGlobalesPyL.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No hay movimientos registrados.</td></tr>';
            return;
        }

        const inicio = (paginaActual - 1) * FILAS_POR_PAGINA;
        const fin = inicio + FILAS_POR_PAGINA;
        const datosPagina = datosGlobalesPyL.slice(inicio, fin);
        
        datosPagina.forEach(row => {
            const tr = document.createElement('tr');
            const pnl = parseFloat(row.pnl);
            let color = pnl >= 0 ? '#166534' : '#dc2626';
            
            let icon = '';
            const cat = row.categoria || '';
            if(cat.includes('Mermas')) icon = '🗑️';
            else if(cat.includes('Gastos')) icon = '📉';
            else if(cat.includes('Eventos')) icon = '🎉';
            else if(cat.includes('Taquilla')) icon = '🎟️';
            else if(cat.includes('Cafetería')) icon = '☕';

            tr.innerHTML = `
                <td style="font-weight:600">${row.nombre_sede}</td>
                <td>${icon} ${row.categoria}</td>
                <td style="color: #2ecc71;">S/ ${parseFloat(row.ingresos).toFixed(2)}</td>
                <td style="color: #e74c3c;">S/ ${parseFloat(row.egresos).toFixed(2)}</td>
                <td style="color: ${color}; font-weight: 700;">S/ ${pnl.toFixed(2)}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderizarPaginacion() {
        const contenedor = document.getElementById('pyl-paginacion');
        if(!contenedor) return;
        
        const totalPaginas = Math.ceil(datosGlobalesPyL.length / FILAS_POR_PAGINA);
        
        if (totalPaginas <= 1) { contenedor.innerHTML = ''; return; }

        contenedor.innerHTML = `
            <div style="display:flex; justify-content:flex-end; gap:10px;">
                <span style="align-self:center; font-size:12px; color:#666;">Pág ${paginaActual} / ${totalPaginas}</span>
                <button class="btn-secondary" onclick="cambiarPaginaAnalitica(-1)" ${paginaActual===1?'disabled':''}><i class='bx bx-chevron-left'></i></button>
                <button class="btn-secondary" onclick="cambiarPaginaAnalitica(1)" ${paginaActual>=totalPaginas?'disabled':''}><i class='bx bx-chevron-right'></i></button>
            </div>
        `;
    }

    function renderizarGraficos(datos) {
        if (typeof Chart === 'undefined') return;

        // Verificar si existen los canvas
        const ctxMix = document.getElementById('chart-mix-ventas');
        const ctxGastos = document.getElementById('chart-gastos-mermas');
        const ctxUtilidad = document.getElementById('chart-utilidad');
        const ctxGlobal = document.getElementById('chart-global');
        
        if (!ctxMix || !ctxGastos || !ctxUtilidad || !ctxGlobal) return;

        const sedes = [...new Set(datos.map(d => d.nombre_sede))];
        
        const getSum = (sede, catInclude) => {
            return datos
                .filter(d => d.nombre_sede === sede && d.categoria.includes(catInclude))
                .reduce((sum, item) => sum + (catInclude.includes('Merma') || catInclude.includes('Gasto') ? parseFloat(item.egresos) : parseFloat(item.ingresos)), 0);
        };

        const dataTaquilla = sedes.map(s => getSum(s, 'Taquilla'));
        const dataCafeteria = sedes.map(s => getSum(s, 'Cafetería'));
        const dataEventos = sedes.map(s => getSum(s, 'Eventos'));
        const dataGastos = sedes.map(s => getSum(s, 'Gastos'));
        const dataMermas = sedes.map(s => getSum(s, 'Mermas'));

        const dataUtilidad = sedes.map(s => {
            const ing = datos.filter(d => d.nombre_sede === s).reduce((sum, i) => sum + parseFloat(i.ingresos), 0);
            const egr = datos.filter(d => d.nombre_sede === s).reduce((sum, i) => sum + parseFloat(i.egresos), 0);
            return ing - egr;
        });

        let totalIng = 0, totalEgr = 0;
        datos.forEach(d => { totalIng += parseFloat(d.ingresos); totalEgr += parseFloat(d.egresos); });

        // --- GRÁFICO 1: MIX VENTAS ---
        if (chartMix) chartMix.destroy();
        chartMix = new Chart(ctxMix.getContext('2d'), {
            type: 'bar',
            data: {
                labels: sedes,
                datasets: [
                    { label: 'Eventos', data: dataEventos, backgroundColor: '#10b981', stack: 'Stack 0' },
                    { label: 'Taquilla', data: dataTaquilla, backgroundColor: '#3b82f6', stack: 'Stack 0' },
                    { label: 'Cafetería', data: dataCafeteria, backgroundColor: '#f59e0b', stack: 'Stack 0' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { x: {stacked: true}, y: {stacked: true} } }
        });

        // --- GRÁFICO 2: GASTOS VS MERMAS ---
        if (chartGastos) chartGastos.destroy();
        chartGastos = new Chart(ctxGastos.getContext('2d'), {
            type: 'bar',
            data: {
                labels: sedes,
                datasets: [
                    { label: 'Gastos Op.', data: dataGastos, backgroundColor: '#f87171' },
                    { label: 'Mermas', data: dataMermas, backgroundColor: '#991b1b' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });

        // --- GRÁFICO 3: UTILIDAD ---
        if (chartUtilidad) chartUtilidad.destroy();
        chartUtilidad = new Chart(ctxUtilidad.getContext('2d'), {
            type: 'bar',
            data: {
                labels: sedes,
                datasets: [{ 
                    label: 'Utilidad Neta', 
                    data: dataUtilidad, 
                    backgroundColor: dataUtilidad.map(v => v >= 0 ? '#166534' : '#dc2626'),
                    borderRadius: 5
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });

        // --- GRÁFICO 4: DONA GLOBAL ---
        if (chartGlobal) chartGlobal.destroy();
        chartGlobal = new Chart(ctxGlobal.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: ['Ganancia', 'Costos/Gastos'],
                datasets: [{
                    data: [Math.max(0, totalIng - totalEgr), totalEgr],
                    backgroundColor: ['#22c55e', '#ef4444']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    function calcularTotales(datos) {
        let ing = 0, egr = 0;
        datos.forEach(row => { ing += parseFloat(row.ingresos); egr += parseFloat(row.egresos); });
        const neto = ing - egr;
        
        if(document.getElementById('total-ingresos')) document.getElementById('total-ingresos').innerText = `S/ ${ing.toFixed(2)}`;
        if(document.getElementById('total-egresos')) document.getElementById('total-egresos').innerText = `S/ ${egr.toFixed(2)}`;
        
        const divPnl = document.getElementById('total-pnl');
        if(divPnl) {
            divPnl.innerText = `S/ ${neto.toFixed(2)}`;
            divPnl.parentElement.className = neto >= 0 ? 'card card-small bg-green-dark' : 'card card-small bg-red-light';
        }
    }

    // --- 2. OBTENER DATOS (AHORA SÍ PUEDE LLAMAR A LAS FUNCIONES) ---
    async function obtenerReporteCompleto() {
        const token = localStorage.getItem('token');
        if (!token) return;

        const inicio = document.getElementById('filtro-inicio')?.value || '';
        const fin = document.getElementById('filtro-fin')?.value || '';
        const sede = document.getElementById('filtro-sede-analitica')?.value || '';

        let url = '/api/analitica/pyl?';
        if (inicio) url += `inicio=${inicio}&`;
        if (fin) url += `fin=${fin}&`;
        if (sede) url += `sede=${sede}`;

        try {
            const res = await fetch(url, { headers: { 'x-auth-token': token } });
            if (res.status === 403) return mostrarErrorTabla("Acceso Denegado.");
            
            const data = await res.json();
            
            if (res.ok && Array.isArray(data)) {
                datosGlobalesPyL = data;
                paginaActual = 1;

                renderizarTabla();
                renderizarPaginacion();
                renderizarGraficos(data);
                calcularTotales(data);
                obtenerKpisEventos(sede); 

            } else {
                mostrarErrorTabla("Error al procesar datos.");
            }
        } catch (error) {
            console.error("Error Analítica:", error);
        }
    }

    // --- UTILIDADES ---
    function mostrarErrorTabla(msg) {
        const tbody = document.getElementById('pyl-detalle-body');
        if(tbody) tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:#666;">${msg}</td></tr>`;
    }

    async function cargarSedesFiltro() {
        try {
            const res = await fetch('/api/usuarios/sedes', { headers: { 'x-auth-token': localStorage.getItem('token') } });
            const data = await res.json();
            const select = document.getElementById('filtro-sede-analitica');
            if (res.ok && select) {
                while (select.options.length > 1) { select.remove(1); }
                data.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id; opt.innerText = s.nombre;
                    select.appendChild(opt);
                });
            }
        } catch (e) {}
    }

    async function obtenerKpisEventos(sedeId) {
        try {
            let url = '/api/analitica/kpis/eventos';
            if (sedeId) url += `?sede=${sedeId}`;
            const res = await fetch(url, { headers: { 'x-auth-token': localStorage.getItem('token') } });
            if (res.ok) {
                const data = await res.json();
                const divConv = document.getElementById('kpi-conversion');
                const divTick = document.getElementById('kpi-ticket');
                if(divConv) divConv.innerText = data.conversion + "%";
                if(divTick) divTick.innerText = "Ticket Prom: S/ " + data.ticketPromedio;
            }
        } catch (e) {}
    }

    window.aplicarFiltrosAnalitica = obtenerReporteCompleto;
    window.cambiarPaginaAnalitica = function(delta) {
        paginaActual += delta;
        renderizarTabla();
        renderizarPaginacion();
    }
    
    window.exportarReporteExcel = function() {
        if (!datosGlobalesPyL.length) return alert("Sin datos.");
        if (typeof XLSX === 'undefined') return alert("Librería Excel no cargada");
        const ws = XLSX.utils.json_to_sheet(datosGlobalesPyL);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reporte");
        XLSX.writeFile(wb, "Reporte_Financiero.xlsx");
    }

    window.obtenerReporteCompleto = obtenerReporteCompleto; 

    // --- 3. INICIALIZAR (ARRANQUE) ---
    async function initAnalitica() {
        try {
            await cargarLibreriaGraficos();
            await cargarSedesFiltro();
            await obtenerReporteCompleto();
        } catch (error) {
            console.error("Error init:", error);
        }
    }

    initAnalitica();

})();