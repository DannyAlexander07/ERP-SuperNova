// Ubicacion: SuperNova/frontend/modules/inicio/inicio.js

(function() {
    console.log("🚀 Módulo Inicio cargado.");

    async function initDashboard() {
        // 1. Saludo Personalizado
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const u = JSON.parse(userStr);
            const nombreReal = u.nombre || u.nombres || "Usuario";
            const welcomeElement = document.getElementById('welcome-user');
            if (welcomeElement) {
                // Solo primer nombre para que no sea muy largo
                welcomeElement.innerText = nombreReal.split(' ')[0]; 
            }
        }

        // 2. Fecha Actual
        const dateEl = document.getElementById('current-date');
        if(dateEl) {
            const options = { weekday: 'long', day: 'numeric', month: 'long' };
            const fecha = new Date().toLocaleDateString('es-ES', options);
            dateEl.innerText = fecha.charAt(0).toUpperCase() + fecha.slice(1);
        }

        // 3. 🚨 CARGAR DATOS REALES DEL BACKEND
        await cargarResumenDia();
    }

    async function cargarResumenDia() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // Llamamos al endpoint que creamos en analiticaController
            const res = await fetch('/api/analitica/resumen-dia', { 
                headers: { 'x-auth-token': token } 
            });

            if (res.ok) {
                const data = await res.json();
                
                // Actualizar HTML con animación simple
                const divVentas = document.getElementById('dash-ventas-hoy');
                const divEventos = document.getElementById('dash-eventos-hoy');

                if(divVentas) divVentas.innerText = `S/ ${parseFloat(data.ventasHoy).toFixed(2)}`;
                if(divEventos) divEventos.innerText = data.eventosHoy;

                console.log("Datos de inicio actualizados:", data);
            }
        } catch (error) {
            console.error("Error cargando dashboard:", error);
        }
    }

    // Exponer para recarga automática
    window.initDashboard = initDashboard;
    
    // Arrancar
    initDashboard();
})();