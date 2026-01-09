// Ubicación: SuperNova/frontend/modules/calendario/calendario.js

(function() {
    console.log("🚀 CALENDARIO (CONTROL MANUAL) ACTIVO");

    let calendar;
    let eventosGlobales = []; // Aquí guardamos los datos crudos
    let filtroSedeActual = ""; 

    const coloresSalas = ['#695CFE', '#E91E63', '#00BCD4', '#FF9800', '#9C27B0', '#2ECC71'];

    function getColorPorEstado(estado) {
        if(estado === 'reservado') return '#f1c40f'; // Amarillo
        if(estado === 'confirmado') return '#2ecc71'; // Verde
        if(estado === 'bloqueado') return '#34495e'; // Azul Oscuro
        if(estado === 'cancelado') return '#e74c3c'; // Rojo
        return '#3498db';
    }

    // --- 1. INICIALIZAR ---
    async function initModule() {
        await cargarSedesSelector();
        initCalendar();
        // Carga inicial forzada
        cambiarSedeCalendario();
    }

    // --- 2. CARGAR SELECTOR SEDES ---
    async function cargarSedesSelector() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/sedes', { headers: { 'x-auth-token': token } });
            if(res.ok) {
                const sedes = await res.json();
                const select = document.getElementById('filtro-sede-calendario');
                if(!select) return;

                select.innerHTML = '<option value="">🏢 Todas las Sedes</option>';
                sedes.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.innerText = `📍 ${s.nombre}`;
                    select.appendChild(opt);
                });
            }
        } catch(e) { console.error(e); }
    }

    // --- 3. INICIALIZAR FULLCALENDAR (VACÍO) ---
   // --- 3. INICIALIZAR FULLCALENDAR ---
    function initCalendar() {
        const calendarEl = document.getElementById('calendar-main');
        if (!calendarEl) return;

        const isMobile = window.innerWidth < 768;

        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: isMobile ? 'listWeek' : 'dayGridMonth',
            
            locale: 'es',       // 1. Esto pone fechas en español
            timeZone: 'local',
            
            // 🔥 2. ESTO TRADUCE LOS BOTONES (AGREGA ESTO)
            buttonText: {
                today:    'Hoy',
                month:    'Mes',
                week:     'Semana',
                day:      'Día',
                list:     'Lista'
            },

            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,listWeek'
            },
            height: '100%',
            
            eventClick: function(info) {
                alert(`📅 Evento: ${info.event.title}\n📍 Sala: ${info.event.extendedProps.salon}\nEstado: ${info.event.extendedProps.estado}`);
            }
        });

        calendar.render();
    }

    // --- 4. CAMBIO DE SEDE (FETCH API) ---
    window.cambiarSedeCalendario = async function() {
        const select = document.getElementById('filtro-sede-calendario');
        filtroSedeActual = select ? select.value : "";
        
        // 1. Cargar Salas (Checkboxes)
        await cargarSalasPorSede(filtroSedeActual);

        // 2. Cargar Eventos (API)
        await cargarEventosDesdeAPI();
    }

    // --- 5. CARGAR EVENTOS DE LA API (Y Guardar en Memoria) ---
    async function cargarEventosDesdeAPI() {
        try {
            const token = localStorage.getItem('token');
            const url = `/api/crm/eventos/todos?sede=${filtroSedeActual}`;
            
            const res = await fetch(url, { headers: { 'x-auth-token': token } });
            
            if(res.ok) {
                const datos = await res.json();
                
                // Mapear datos
                eventosGlobales = datos.map(evt => {
                    let inicio = evt.fecha_inicio ? evt.fecha_inicio.replace(' ', 'T') : null;
                    let fin = evt.fecha_fin ? evt.fecha_fin.replace(' ', 'T') : null;
                    const nombreSala = evt.nombre_sala_real || evt.salon || 'Sala General';

                    return {
                        id: evt.id, // ID Único de la DB
                        title: `${evt.titulo}`,
                        start: inicio,
                        end: fin,
                        backgroundColor: getColorPorEstado(evt.estado),
                        extendedProps: { 
                            salon: nombreSala,
                            sede: evt.nombre_sede,
                            estado: evt.estado
                        }
                    };
                });

                // Pintar calendario
                filtrarCalendarioLocal();

            } else {
                console.error("Error API Eventos");
            }
        } catch(e) { console.error(e); }
    }

    // --- 6. CARGAR CHECKBOXES DE SALAS ---
    async function cargarSalasPorSede(sedeId) {
        const container = document.getElementById('contenedor-filtros-salas');
        if(!container) return;
        container.innerHTML = '<div style="font-size:12px;">Cargando...</div>';

        try {
            const token = localStorage.getItem('token');
            const url = sedeId ? `/api/crm/salones?sede=${sedeId}` : `/api/crm/salones`; 
            
            const res = await fetch(url, { headers: { 'x-auth-token': token } });
            
            if(res.ok) {
                const salas = await res.json();
                container.innerHTML = ''; 

                if(salas.length === 0) {
                    container.innerHTML = '<div style="font-size:12px; color:#666">No hay salas.</div>';
                    return;
                }

                salas.forEach((sala, index) => {
                    const color = sala.color || coloresSalas[index % coloresSalas.length];
                    const label = document.createElement('label');
                    label.className = 'custom-checkbox';
                    label.innerHTML = `
                        <input type="checkbox" checked value="${sala.nombre}" onchange="filtrarCalendarioLocal()">
                        <span class="checkmark" style="--check-color: ${color};"></span>
                        <span class="label-text">${sala.nombre}</span>
                    `;
                    container.appendChild(label);
                });
            }
        } catch(e) { container.innerHTML = 'Error.'; }
    }

    // --- 7. FILTRADO LOCAL (PINTAR CALENDARIO) ---
    window.filtrarCalendarioLocal = function() {
        if(!calendar) return;

        // 1. Obtener checkboxes marcados
        const container = document.getElementById('contenedor-filtros-salas');
        if(!container) return;
        
        const checkboxes = container.querySelectorAll('input[type="checkbox"]:checked');
        const salasSeleccionadas = Array.from(checkboxes).map(cb => cb.value);

        // 2. Filtrar en memoria
        const eventosVisibles = eventosGlobales.filter(evt => {
            if(evt.extendedProps.estado === 'cancelado') return false; 
            // Si no hay salas seleccionadas, mostramos todo por seguridad, o nada.
            // Aquí asumimos que si no seleccionas nada, no ves nada.
            if(salasSeleccionadas.length === 0) return false; 
            
            return salasSeleccionadas.includes(evt.extendedProps.salon);
        });

        // 3. LIMPIEZA TOTAL Y REPINTADO (Evita duplicados)
        calendar.removeAllEvents(); 
        calendar.addEventSource(eventosVisibles);
    }

    // Funciones dummy para el modal HTML
    window.abrirModalReserva = function() { 
        const m = document.getElementById('modal-reserva');
        if(m) m.classList.add('active'); 
    }
    window.cerrarModalReserva = function() { 
        const m = document.getElementById('modal-reserva');
        if(m) m.classList.remove('active'); 
    }

    // Iniciar
    initModule();
})();