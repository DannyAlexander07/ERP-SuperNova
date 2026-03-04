// Ubicacion: frontend/modules/analitica/analitica.js
(function() {
    console.log("Modulo Analítica Avanzada Cargado 🚀");

    // VARIABLES GLOBALES
    let datosGlobalesPyL = [];
    let paginaActual = 1;
    const FILAS_POR_PAGINA = 8;
    
    // Variables para Gráficos Básicos (P&L)
    let chartBarras = null;
    let chartDona = null;
    let chartMix = null;
    let chartGastos = null;
    let chartUtilidad = null;
    let chartGlobal = null;

    // --- VARIABLES GLOBALES PARA LOS GRÁFICOS (Pegar esto antes de la función) ---
    let chartEvo=null;
    let chartTop=null; 
    let chartPagos=null;
    let chartHoras=null
    let chartVendedores=null;


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
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No hay movimientos registrados.</td></tr>';
            return;
        }

        const inicio = (paginaActual - 1) * FILAS_POR_PAGINA;
        const fin = inicio + FILAS_POR_PAGINA;
        const datosPagina = datosGlobalesPyL.slice(inicio, fin);
        
       datosPagina.forEach(row => {
            const tr = document.createElement('tr');
            
            // --- 1. PROCESAMIENTO DE VALORES NUMÉRICOS ---
            const totalBruto = parseFloat(row.ingresos) || 0;
            const egresos = parseFloat(row.egresos) || 0;
            const pnl = parseFloat(row.pnl) || 0;
            const cat = row.categoria || '';

            // --- 2. LÓGICA CONTABLE: DESGLOSE DE IGV (Saca la base real) ---
            let baseImponible = totalBruto;
            let igvMonto = 0;

            // Solo desglosamos si hay ingreso y no es una entrada manual de 'Caja'
            if (totalBruto > 0 && !cat.includes('Caja')) {
                baseImponible = totalBruto / 1.18; // El valor sin el 18%
                igvMonto = totalBruto - baseImponible; // La diferencia es el impuesto
            }
            
            // --- 3. ESTILOS Y ESTADOS ---
            let colorUtilidad = pnl >= 0 ? '#166534' : '#dc2626'; 
            let bgUtilidad = pnl >= 0 ? '#f0fdf4' : '#fef2f2';
            
            // Asignación de iconos por categoría
            let icon = '';
            if(cat.includes('Mermas')) icon = '🗑️';
            else if(cat.includes('Gastos')) icon = '📉';
            else if(cat.includes('Eventos')) icon = '🎉';
            else if(cat.includes('Taquilla')) icon = '🎟️';
            else if(cat.includes('Cafetería')) icon = '☕';
            else if(cat.includes('Caja')) icon = '💰';

            // --- 4. RENDERIZADO DEL HTML ---
            tr.innerHTML = `
                <td style="font-weight:600; font-size: 13px;">${row.nombre_sede}</td>
                <td style="font-size: 13px;">${icon} ${cat}</td>
                
                <td style="color: #16a34a; font-weight:700; font-size: 14px; text-align: right;">
                    S/ ${baseImponible.toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>

                <td style="color: #64748b; font-size: 13px; text-align: right;">
                    S/ ${igvMonto.toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                
                <td style="color: #dc2626; text-align: right;">
                    S/ ${egresos.toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </td>
                
                <td style="text-align: right;">
                    <div style="color: ${colorUtilidad}; font-weight: 700; font-size: 14px; background: ${bgUtilidad}; padding: 6px 10px; border-radius: 8px; display: inline-block; min-width: 90px;">
                        S/ ${pnl.toLocaleString('es-PE', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    function renderizarPaginacion() {
        const contenedor = document.getElementById('pyl-paginacion');
        if(!contenedor) return;
        
        const totalPaginas = Math.ceil(datosGlobalesPyL.length / FILAS_POR_PAGINA);
        
        if (totalPaginas <= 1) { 
            contenedor.innerHTML = ''; 
            return; 
        }

        contenedor.innerHTML = `
            <div class="pagination-wrapper">
                <span class="page-info">
                    Página <strong>${paginaActual}</strong> de <strong>${totalPaginas}</strong>
                </span>
                <div class="pagination-actions">
                    <button class="pagi-btn" onclick="cambiarPaginaAnalitica(-1)" ${paginaActual === 1 ? 'disabled' : ''} title="Anterior">
                        <i class='bx bx-chevron-left'></i>
                    </button>
                    <div class="pagi-divider"></div>
                    <button class="pagi-btn" onclick="cambiarPaginaAnalitica(1)" ${paginaActual >= totalPaginas ? 'disabled' : ''} title="Siguiente">
                        <i class='bx bx-chevron-right'></i>
                    </button>
                </div>
            </div>
        `;
    }

    function renderizarGraficos(datos) {
        if (typeof Chart === 'undefined') return;

        const ctxMix = document.getElementById('chart-mix-ventas');
        const ctxGastos = document.getElementById('chart-gastos-mermas');
        const ctxUtilidad = document.getElementById('chart-utilidad');
        const ctxGlobal = document.getElementById('chart-global');
        
        if (!ctxMix || !ctxGastos || !ctxUtilidad || !ctxGlobal) return;

        const sedes = [...new Set(datos.map(d => d.nombre_sede))];
        
        // --- NUEVA FUNCIÓN GETSUM (Para Gastos, Mermas y Utilidad) ---
        const getSum = (sede, catInclude) => {
            const strSearch = catInclude.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            return datos
                .filter(d => {
                    if (d.nombre_sede !== sede) return false;
                    const catRow = (d.categoria || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                    
                    if (strSearch === 'gastos') {
                        return catRow.includes('gasto') || catRow.includes('factura');
                    }
                    if (strSearch === 'mermas') return catRow.includes('mermas') || catRow.includes('canjes');
                    
                    return false; 
                })
                .reduce((sum, item) => {
                    return sum + parseFloat(item.egresos || 0);
                }, 0);
        };

        // --- 🚀 CREACIÓN DINÁMICA DEL MIX DE INGRESOS ---
        // 1. Obtenemos todas las categorías reales que generaron dinero (Ingresos > 0)
        // Usamos Set para que no se repitan los nombres
        const categoriasDeIngreso = [...new Set(
            datos.filter(d => parseFloat(d.ingresos) > 0).map(d => d.categoria)
        )];

        // 2. Paleta de colores profesionales para las barras
        const paletaColores = [
            '#10b981', // Verde
            '#3b82f6', // Azul
            '#f59e0b', // Naranja/Amarillo
            '#8b5cf6', // Morado
            '#ec4899', // Rosa
            '#06b6d4', // Cian
            '#14b8a6', // Turquesa
            '#64748b'  // Gris Azulado
        ];

        // 3. Armamos los datasets automáticamente (Una capa por cada categoría encontrada)
        const datasetsDinamicosIngresos = categoriasDeIngreso.map((catName, index) => {
            return {
                label: catName, // Nombre que aparecerá en la leyenda (Ej: Merchandising)
                data: sedes.map(sede => {
                    // Buscamos si esta sede vendió algo de esta categoría
                    const fila = datos.find(d => d.nombre_sede === sede && d.categoria === catName);
                    return fila ? parseFloat(fila.ingresos) : 0;
                }),
                backgroundColor: paletaColores[index % paletaColores.length], // Asignamos color de la paleta
                stack: 'Stack 0' // Para que se apilen una sobre otra
            };
        });

        // --- PREPARAR RESTO DE DATOS ---
        const dataGastos = sedes.map(s => getSum(s, 'Gastos'));
        const dataMermas = sedes.map(s => getSum(s, 'Mermas'));

        const dataUtilidad = sedes.map(s => {
            const ing = datos.filter(d => d.nombre_sede === s).reduce((sum, i) => sum + parseFloat(i.ingresos), 0);
            const egr = datos.filter(d => d.nombre_sede === s).reduce((sum, i) => sum + parseFloat(i.egresos), 0);
            return ing - egr;
        });

        let totalIng = 0, totalEgr = 0;
        datos.forEach(d => { totalIng += parseFloat(d.ingresos); totalEgr += parseFloat(d.egresos); });

        // --- GRÁFICO 1: MIX VENTAS (AHORA 100% DINÁMICO) ---
        if (chartMix) chartMix.destroy();
        chartMix = new Chart(ctxMix.getContext('2d'), {
            type: 'bar',
            data: {
                labels: sedes,
                // Usamos los datasets que creamos dinámicamente arriba
                datasets: datasetsDinamicosIngresos.length > 0 ? datasetsDinamicosIngresos : [{ label: 'Sin datos', data: sedes.map(()=>0), backgroundColor: '#cbd5e1' }]
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                scales: { 
                    x: {stacked: true}, 
                    y: {stacked: true} 
                } 
            }
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

    // --- FUNCIÓN ACTUALIZADA: OBTENER TODOS LOS DATOS ---
    async function obtenerReporteCompleto() {
        const token = localStorage.getItem('token');
        if (!token) return;

        const inicio = document.getElementById('filtro-inicio')?.value || '';
        const fin = document.getElementById('filtro-fin')?.value || '';
        const sede = document.getElementById('filtro-sede-analitica')?.value || '';

        // Construir Query String
        let params = [];
        if (inicio) params.push(`inicio=${inicio}`);
        if (fin) params.push(`fin=${fin}`);
        if (sede) params.push(`sede=${sede}`);
        const queryString = params.length > 0 ? '?' + params.join('&') : '';

        try {
            // 1. Cargar P&L (Existente)
            const resPyL = await fetch(`/api/analitica/pyl${queryString}`, { headers: { 'x-auth-token': token } });
            
            // 2. Cargar GRÁFICOS NUEVOS (Nuevo endpoint)
            const resGraficos = await fetch(`/api/analitica/graficos${queryString}`, { headers: { 'x-auth-token': token } });

            if (resPyL.ok) {
                const dataPyL = await resPyL.json();
                datosGlobalesPyL = dataPyL; // Guardamos global
                
                renderizarTabla();
                renderizarPaginacion();
                renderizarGraficos(dataPyL); // Renderiza los gráficos viejos (Mix, Gastos, etc)
                calcularTotales(dataPyL);
                obtenerKpisEventos(sede, inicio, fin);
            }

            if (resGraficos.ok) {
                const dataGraficos = await resGraficos.json();
                // 🔥 AQUÍ SE DIBUJAN LOS NUEVOS, INCLUIDO RANKING
                renderizarGraficosAvanzados(dataGraficos); 
            }

        } catch (error) {
            console.error("Error Analítica:", error);
            mostrarErrorTabla("Error de conexión.");
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

    async function obtenerKpisEventos(sedeId, inicio, fin) {
        try {
            let url = `/api/analitica/kpis/eventos?inicio=${inicio || ''}&fin=${fin || ''}`;
            if (sedeId) url += `&sede=${sedeId}`;

            const res = await fetch(url, { 
                headers: { 'x-auth-token': localStorage.getItem('token') } // Corregido a x-auth-token
            });

            if (res.ok) {
                const data = await res.json();
                const divConv = document.getElementById('kpi-conversion');
                const divTickVentas = document.getElementById('kpi-ticket');
                const divTickEventos = document.getElementById('kpi-ticket-eventos');
                
                if(divConv) divConv.innerText = data.conversion + "%";
                
                // 🔥 Sincronizado con el nuevo HTML
                if(divTickVentas) divTickVentas.innerText = `🎟️ POS: S/ ${data.ticketPromedio}`;
                if(divTickEventos) divTickEventos.innerText = `🎪 Eventos: S/ ${data.ticketPromedioEventos}`;
            }
        } catch (e) { console.error("Error en KPIs:", e); }
    }

    window.aplicarFiltrosAnalitica = obtenerReporteCompleto;
    window.cambiarPaginaAnalitica = function(delta) {
        paginaActual += delta;
        renderizarTabla();
        renderizarPaginacion();
    }
    
    window.exportarReporteExcel = function() {

        if (!datosGlobalesPyL || datosGlobalesPyL.length === 0) {
            return Swal.fire('Sin datos', 'No hay información para exportar en este rango.', 'warning');
        }
        
        if (typeof XLSX === 'undefined') {
            return Swal.fire('Error', 'La librería Excel (xlsx) no está cargada.', 'error');
        }

        // --- 1. PREPARAR LOS DATOS CON DESGLOSE CONTABLE ---
        const datosParaExportar = datosGlobalesPyL.map(row => {
            const totalBruto = parseFloat(row.ingresos) || 0;
            const egresos = parseFloat(row.egresos) || 0;
            const cat = row.categoria || '';
            
            let ventaNeta = totalBruto;
            let igv = 0;

            // Aplicamos la misma lógica de la tabla: Desglose 1.18
            if (totalBruto > 0 && !cat.includes('Caja')) {
                ventaNeta = totalBruto / 1.18;
                igv = totalBruto - ventaNeta;
            }

            return {
                'Sede': row.nombre_sede,
                'Categoría': cat,
                'Venta Neta (Base)': parseFloat(ventaNeta.toFixed(2)),
                'IGV (18%)': parseFloat(igv.toFixed(2)),
                'Total Ingresos': parseFloat(totalBruto.toFixed(2)),
                'Egresos/Mermas': parseFloat(egresos.toFixed(2)),
                'Utilidad Neta': parseFloat((totalBruto - egresos).toFixed(2))
            };
        });

        // --- 2. GENERAR EL ARCHIVO EXCEL ---
        const ws = XLSX.utils.json_to_sheet(datosParaExportar);
        const wb = XLSX.utils.book_new();
        
        // Ajustar anchos de columna automáticamente
        const wscols = [
            {wch: 20}, // Sede
            {wch: 20}, // Categoría
            {wch: 15}, // Venta Neta
            {wch: 12}, // IGV
            {wch: 15}, // Total Ingresos
            {wch: 15}, // Egresos
            {wch: 15}  // Utilidad
        ];
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, "Reporte P&L");

        // --- 3. DESCARGAR ---
        const fecha = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Reporte_Financiero_SuperNova_${fecha}.xlsx`);
    };

    window.obtenerReporteCompleto = obtenerReporteCompleto; 




    // --- FUNCIÓN AUXILIAR: GENERAR COLORES DINÁMICOS ---
    // (Necesaria para productos donde hay muchos ítems)
    function generarColores(cantidad) {
        const colores = [];
        for (let i = 0; i < cantidad; i++) {
            const hue = Math.floor((360 / cantidad) * i); 
            colores.push(`hsl(${hue}, 70%, 60%)`);
        }
        return colores;
    }

    // --- FUNCIÓN PRINCIPAL DE RENDERIZADO ---
    function renderizarGraficosAvanzados(data) {
        if (typeof Chart === 'undefined') return;

        // 1. EVOLUCIÓN (Línea de Tiempo)
        const ctxEvo = document.getElementById('chart-evolucion');
        if (ctxEvo) {
            if (chartEvo) chartEvo.destroy();
            chartEvo = new Chart(ctxEvo, {
                type: 'line',
                data: {
                    labels: data.evolucion.map(d => d.fecha),
                    datasets: [{
                        label: 'Venta Neta (S/)',
                        data: data.evolucion.map(d => parseFloat(d.total)),
                        borderColor: '#4f46e5',
                        backgroundColor: 'rgba(79, 70, 229, 0.1)',
                        fill: true, tension: 0.3
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        // 2. TODOS LOS PRODUCTOS (Barra Horizontal)
        const ctxTop = document.getElementById('chart-top');
        if (ctxTop) {
            if (chartTop) chartTop.destroy();
            
            // Colores dinámicos para diferenciar todos los productos
            const coloresProd = generarColores(data.top.length);

            chartTop = new Chart(ctxTop, {
                type: 'bar',
                indexAxis: 'y',
                data: {
                    labels: data.top.map(d => d.producto),
                    datasets: [{
                        label: 'Cantidad Vendida',
                        data: data.top.map(d => parseInt(d.cantidad)),
                        backgroundColor: coloresProd,
                        borderRadius: 6, // Bordes redondeados en las barras
                        maxBarThickness: 35, // 🔥 ESTO EVITA QUE SE VEAN COMO BLOQUES GIGANTES
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } } 
                }
            });
        }

        // 3. MÉTODOS DE PAGO (Dona con Colores Fijos + Transferencia)
        const ctxPagos = document.getElementById('chart-pagos');
        if (ctxPagos) {
            if (chartPagos) chartPagos.destroy();
            
            // 🔥 MAPA DE COLORES FIJOS DEFINITIVO
            const colorMap = {
                'Efectivo': '#3b82f6',          // Azul brillante
                'Yape': '#8b5cf6',              // Violeta (Brand Yape)
                'Plin': '#06b6d4',              // Cian/Turquesa (Brand Plin)
                'Tarjeta de Crédito': '#f59e0b',// Naranja
                'Tarjeta de Débito': '#ec4899', // Rosa
                'Transferencia': '#64748b',     // Gris Azulado (Profesional)
                'Otros': '#9ca3af'              // Gris claro
            };

            // Asignamos el color según la etiqueta exacta que viene del backend
            const backgroundColors = data.pagos.map(d => colorMap[d.metodo_pago] || '#10b981');

            chartPagos = new Chart(ctxPagos, {
                type: 'doughnut',
                data: {
                    labels: data.pagos.map(d => d.metodo_pago),
                    datasets: [{
                        data: data.pagos.map(d => parseFloat(d.total)),
                        backgroundColor: backgroundColors,
                        borderWidth: 2
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        // 4. HORAS PUNTA (Barras Verticales)
        const ctxHoras = document.getElementById('chart-horas');
        if (ctxHoras) {
            if (chartHoras) chartHoras.destroy();
            const horasMap = new Array(24).fill(0);
            data.horas.forEach(h => horasMap[parseInt(h.hora)] = parseInt(h.cantidad));
            
            chartHoras = new Chart(ctxHoras, {
                type: 'bar',
                data: {
                    labels: Array.from({length: 24}, (_, i) => `${i}:00`),
                    datasets: [{
                        label: 'Tickets Emitidos',
                        data: horasMap,
                        backgroundColor: '#f97316',
                        borderRadius: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        // 5. RANKING VENDEDORES (Barra Horizontal - Todos)
        const ctxVendedores = document.getElementById('chart-vendedores');
        if (ctxVendedores && data.vendedores) {
            if (chartVendedores) chartVendedores.destroy();
            
            chartVendedores = new Chart(ctxVendedores, {
                type: 'bar',
                indexAxis: 'y', // Horizontal
                data: {
                    labels: data.vendedores.map(d => d.vendedor),
                    datasets: [{
                        label: 'Total Vendido (S/)',
                        data: data.vendedores.map(d => parseFloat(d.total_vendido)),
                        backgroundColor: '#8b5cf6', // Violeta uniforme
                        borderRadius: 4
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return `S/ ${context.raw.toFixed(2)}`;
                                }
                            }
                        }
                    }
                }
            });
        }
    }

    // --- 3. INICIALIZAR (ARRANQUE PARA ROUTER SPA) ---
    window.initAnalitica = async function() {
        console.log("▶️ Iniciando módulo Analítica...");
        try {
            await cargarLibreriaGraficos();
            await cargarSedesFiltro();
            await obtenerReporteCompleto();
        } catch (error) {
            console.error("Error init:", error);
        }
    };

    // Fallback: Si la página se recarga manualmente (F5) estando en esta vista
    if (document.getElementById('chart-mix-ventas')) {
        window.initAnalitica();
    }

})(); 