// Este script se ejecuta apenas se carga el módulo 'inicio'
(function() {
    console.log("Módulo de Inicio Cargado.");

    // 1. Obtenemos los datos del proveedor logueado
    const userData = JSON.parse(localStorage.getItem('proveedor_data'));
    
    // Aquí actualizamos el nombre de la empresa en el menú lateral de forma bonita
    const sidebarInfo = document.getElementById('sidebar-proveedor-nombre');
    if(sidebarInfo && userData) {
        // En una fase posterior traeremos la "Razón Social" real, 
        // por ahora mostramos que está conectado a un ID.
        sidebarInfo.innerHTML = `
            <div style="font-weight: 700; color: #fff; margin-bottom: 3px;">
                <i class='bx bx-buildings'></i> ID Proveedor: ${userData.proveedor_id}
            </div>
            <div style="font-size: 0.75rem; color: #0ea5e9;">Conectado y Verificado</div>
        `;
    }

    // ==========================================
    // INICIALIZACIÓN DE GRÁFICOS (CHART.JS)
    // ==========================================
    
    // Función para renderizar los gráficos
    function renderizarGraficos(datosEstados, datosTipos) {
        
        // Configuración común para que las donas se vean elegantes
        const commonOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { font: { family: 'Inter', size: 12 } } }
            },
            cutout: '70%', // Qué tan delgada es la dona
            borderWidth: 0
        };

        // 1. Gráfico de Estados (Dona)
        const ctxEstados = document.getElementById('chartEstados').getContext('2d');
        new Chart(ctxEstados, {
            type: 'doughnut',
            data: {
                labels: ['Pendiente', 'Programado', 'Pagado', 'Rechazado'],
                datasets: [{
                    data: datosEstados, // [Pendiente, Programado, Pagado, Rechazado]
                    backgroundColor: [
                        '#f59e0b', // Naranja
                        '#06b6d4', // Cian
                        '#10b981', // Verde
                        '#ef4444'  // Rojo
                    ],
                    hoverOffset: 4
                }]
            },
            options: commonOptions
        });

        // 2. Gráfico de Tipos (Dona)
        const ctxTipos = document.getElementById('chartTipos').getContext('2d');
        new Chart(ctxTipos, {
            type: 'doughnut',
            data: {
                labels: ['Servicios', 'Activo Fijo', 'Mercadería'],
                datasets: [{
                    data: datosTipos, // [Servicios, Activo Fijo, Mercadería]
                    backgroundColor: [
                        '#3b82f6', // Azul
                        '#8b5cf6', // Morado
                        '#cbd5e1'  // Gris claro
                    ],
                    hoverOffset: 4
                }]
            },
            options: commonOptions
        });
    }

    // ==========================================
    // LLAMADA REAL AL BACKEND PARA EL DASHBOARD
    // ==========================================
    async function cargarDatosDashboard() {
        const token = localStorage.getItem('proveedor_token');

        try {
            const res = await fetch('http://localhost:3000/api/facturas/b2b/dashboard', {
                method: 'GET',
                headers: { 'x-auth-token': token }
            });

            const data = await res.json();

            if (res.ok) {
                // 1. Llenamos las tarjetas (Animando los números)
                animarNumero('kpi-pendientes', data.kpis.pendientes);
                animarNumero('kpi-programados', data.kpis.programados);
                animarNumero('kpi-rechazados', data.kpis.rechazados);
                animarNumero('kpi-pagados', data.kpis.pagados);

                // 2. Renderizamos los gráficos con la data de PostgreSQL
                // Damos un pequeño retraso para que la animación de la página fluya
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

    // Pequeño truco visual para que los números suban del 0 al valor real
    function animarNumero(idElemento, valorFinal) {
        const elemento = document.getElementById(idElemento);
        let actual = 0;
        const incremento = Math.ceil(valorFinal / 20) || 1; // 20 frames
        
        const timer = setInterval(() => {
            actual += incremento;
            if (actual >= valorFinal) {
                actual = valorFinal;
                clearInterval(timer);
            }
            elemento.textContent = actual;
        }, 30);
    }

    // Ejecutamos la carga
    cargarDatosDashboard();

})();