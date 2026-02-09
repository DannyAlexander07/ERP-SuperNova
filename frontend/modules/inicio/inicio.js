// Ubicacion: SuperNova/frontend/modules/inicio/inicio.js

(function() {
    console.log("🚀 Módulo Inicio cargado.");

    // Variables globales del módulo
    let userRole = 'colaborador'; // Por defecto restrictivo

    async function initDashboard() {
        // 1. Obtener usuario y rol
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const u = JSON.parse(userStr);
            const nombreReal = u.nombre || u.nombres || "Usuario";
            // Normalizar rol a minúsculas para comparaciones fáciles
            userRole = (u.rol || 'colaborador').toLowerCase();

            // Saludo
            const welcomeElement = document.getElementById('welcome-user');
            if (welcomeElement) welcomeElement.innerText = nombreReal.split(' ')[0];
        }

        // 2. Configurar Interfaz según Rol (Seguridad Visual)
        configurarPermisosVisuales();

        // 3. Fecha Actual
        const dateEl = document.getElementById('current-date');
        if(dateEl) {
            const options = { weekday: 'long', day: 'numeric', month: 'long' };
            const fecha = new Date().toLocaleDateString('es-ES', options);
            dateEl.innerText = fecha.charAt(0).toUpperCase() + fecha.slice(1);
        }

        // 4. Cargar Datos Reales (Solo si tiene permisos)
        if (['superadmin', 'admin', 'gerente'].includes(userRole)) {
            await cargarResumenDia();
        } else {
            // Si es colaborador/logística, ocultar montos sensibles
            ocultarMontosSensibles();
        }
    }

    // --- SEGURIDAD VISUAL POR ROLES ---
    function configurarPermisosVisuales() {
        // A. Ocultar accesos directos según rol
        const accesos = document.querySelectorAll('.shortcut-item');
        
        // Mapa de permisos para los atajos (Indices del 0 al 3 en tu HTML)
        // 0: Calendario, 1: Caja, 2: Stock, 3: Gastos
        
        // Logística: Solo Stock
        if (userRole === 'logistica') {
            if(accesos[0]) accesos[0].style.display = 'none'; // Calendario
            if(accesos[1]) accesos[1].style.display = 'none'; // Caja
            if(accesos[3]) accesos[3].style.display = 'none'; // Gastos
        }

        // Colaborador: No ver Caja ni Gastos (Solo Calendario y Stock para consultas)
        if (userRole === 'colaborador') {
            if(accesos[1]) accesos[1].style.display = 'none'; // Caja
            if(accesos[3]) accesos[3].style.display = 'none'; // Gastos
        }

        // B. Ocultar tarjetas de acción (Nueva Venta / Reserva) para Logística
        if (userRole === 'logistica') {
            const actionCards = document.querySelectorAll('.action-card-modern');
            actionCards.forEach(card => card.style.display = 'none');
        }
    }

    function ocultarMontosSensibles() {
        const divVentas = document.getElementById('dash-ventas-hoy');
        if (divVentas) {
            divVentas.innerText = "****";
            divVentas.style.color = "#ccc";
            divVentas.title = "No tienes permisos para ver montos.";
        }
    }

    async function cargarResumenDia() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // Llamamos a la API que ya configuramos para filtrar anulados
            const res = await fetch('/api/analitica/resumen-dia', { 
                headers: { 'x-auth-token': token } 
            });

            if (res.ok) {
                const data = await res.json();
                
                const divVentas = document.getElementById('dash-ventas-hoy');
                const divEventos = document.getElementById('dash-eventos-hoy');

                if(divVentas) {
                    // Formateo profesional: Si no hay ventas, mostrar 0.00 en lugar de null
                    const monto = parseFloat(data.ventasHoy || 0).toFixed(2);
                    divVentas.innerText = `S/ ${monto}`;
                }
                if(divEventos) divEventos.innerText = data.eventosHoy || 0;
            }
        } catch (error) {
            console.error("Error cargando dashboard:", error);
        }
    }

    // Exponer para que dashboard.js pueda llamarlo al recargar módulo
    window.initDashboard = initDashboard;
    
    // Ejecutar al cargar
    initDashboard();
})();