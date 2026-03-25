// Ubicación: SuperNova/frontend/modules/inicio/inicio.js

(function() {
    console.log("Módulo de Inicio Cargado.");

    // 1. Obtenemos los datos del proveedor logueado
    const userData = JSON.parse(localStorage.getItem('proveedor_data'));
    const token = localStorage.getItem('proveedor_token'); // Lo sacamos aquí para usarlo en todo el archivo
    
    // Aquí actualizamos el nombre de la empresa en el menú lateral de forma bonita
    const sidebarInfo = document.getElementById('sidebar-proveedor-nombre');
    if(sidebarInfo && userData) {
        sidebarInfo.innerHTML = `
            <div style="font-weight: 700; color: #fff; margin-bottom: 3px;">
                <i class='bx bx-buildings'></i> ID Proveedor: ${userData.proveedor_id}
            </div>
            <div style="font-size: 0.75rem; color: #0ea5e9;">Conectado y Verificado</div>
        `;
    }

    // ==========================================
    // 🔥 NUEVO: CARGAR BANNER DE COMUNICADOS
    // ==========================================
    async function cargarComunicado() {
        try {
            const res = await fetch('/api/facturas/b2b/comunicado', {
                headers: { 'x-auth-token': token }
            });
            
            // Si la respuesta no es exitosa, salimos
            if (!res.ok) return;

            const comunicado = await res.json();

            // Referenciamos los elementos
            const banner = document.getElementById('banner-comunicado');
            const titulo = document.getElementById('banner-titulo');
            const mensaje = document.getElementById('banner-mensaje');

            // 🛡️ BLINDAJE CRÍTICO: Verificamos que los 3 elementos existan antes de continuar
            if (banner && titulo && mensaje && comunicado && comunicado.titulo) {
                
                // Configuramos los colores según el tipo
                let bg, color, border;
                switch (comunicado.tipo) {
                    case 'warning': bg = '#fef9c3'; color = '#854d0e'; border = '#fef08a'; break;
                    case 'danger':  bg = '#fee2e2'; color = '#991b1b'; border = '#fecaca'; break;
                    case 'success': bg = '#dcfce7'; color = '#166534'; border = '#bbf7d0'; break;
                    default:        bg = '#eff6ff'; color = '#1e40af'; border = '#bfdbfe'; break; // info
                }

                // Aplicamos estilos de forma segura
                banner.style.backgroundColor = bg;
                banner.style.color = color;
                banner.style.border = `1px solid ${border}`;
                
                // Llenamos el contenido
                titulo.textContent = comunicado.titulo;
                mensaje.textContent = comunicado.mensaje;
                
                // Lo mostramos
                banner.style.display = 'flex';
            }
        } catch (error) {
            // Ya no lanzará el error de "style of null"
            console.error("Error cargando comunicado:", error);
        }
    }
    // ==========================================
    // INICIALIZACIÓN DE GRÁFICOS (CHART.JS)
    // ==========================================
    function renderizarGraficos(datosEstados, datosTipos) {

        if (typeof Chart === 'undefined') {
            console.warn("⚠️ Chart.js no está definido. Los gráficos no se renderizarán.");
            return;
        }
        
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { font: { family: 'Inter', size: 12 } } }
            },
            cutout: '70%', 
            borderWidth: 0
        };

        const ctxEstados = document.getElementById('chartEstados');
        if (ctxEstados) {
            new Chart(ctxEstados.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Pendiente', 'Programado', 'Pagado', 'Rechazado'],
                    datasets: [{
                        data: datosEstados, 
                        backgroundColor: ['#f59e0b', '#06b6d4', '#10b981', '#ef4444'],
                        hoverOffset: 4
                    }]
                },
                options: commonOptions
            });
        }

        const ctxTipos = document.getElementById('chartTipos');
        if (ctxTipos) {
            new Chart(ctxTipos.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['Servicios', 'Activo Fijo', 'Mercadería'],
                    datasets: [{
                        data: datosTipos, 
                        backgroundColor: ['#3b82f6', '#8b5cf6', '#cbd5e1'],
                        hoverOffset: 4
                    }]
                },
                options: commonOptions
            });
        }
    }

    // ==========================================
    // LLAMADA REAL AL BACKEND PARA EL DASHBOARD
    // ==========================================
    async function cargarDatosDashboard() {
        try {
            // ✅ CORRECCIÓN: Ruta relativa para compatibilidad con la VPS
            const res = await fetch('/api/facturas/b2b/dashboard', {
                method: 'GET',
                headers: { 'x-auth-token': token }
            });

            const data = await res.json();

            if (res.ok) {
                animarNumero('kpi-pendientes', data.kpis.pendientes);
                animarNumero('kpi-programados', data.kpis.programados); // 💡 FIX: Usamos el ID correcto
                animarNumero('kpi-rechazados', data.kpis.rechazados);
                animarNumero('kpi-pagados', data.kpis.pagados);

                setTimeout(() => {
                    renderizarGraficos(data.graficoEstados, data.graficoTipos);
                }, 150);
            } else {
                console.error("Error cargando dashboard:", data.msg);
            }
        } catch (error) {
            console.error("Error de red cargando dashboard:", error);
        }
    }

    function animarNumero(idElemento, valorFinal) {
        const elemento = document.getElementById(idElemento);
        if (!elemento) return; // Protección por si no existe
        
        let actual = 0;
        const incremento = Math.ceil(valorFinal / 20) || 1; 
        
        const timer = setInterval(() => {
            actual += incremento;
            if (actual >= valorFinal) {
                actual = valorFinal;
                clearInterval(timer);
            }
            elemento.textContent = actual;
        }, 30);
    }

    // Ejecutamos las cargas
    cargarDatosDashboard();
    cargarComunicado(); // 🔥 Llamamos a la función del banner

})();