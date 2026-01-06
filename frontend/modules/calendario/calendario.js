// Ubicacion: SuperNova/frontend/modules/calendario/calendario.js

(function() {
    console.log("🚀 CALENDARIO DIAGNÓSTICO INICIADO");

    let calendar;
    let eventosGlobales = [];

    function getColorPorEstado(estado) {
        if(estado === 'reservado') return '#f1c40f'; // Amarillo
        if(estado === 'confirmado') return '#2ecc71'; // Verde
        if(estado === 'celebrado') return '#3498db'; // Azul
        if(estado === 'cancelado') return '#95a5a6'; // Gris para eventos cancelados
        return '#3498db';
    }

    function initCalendar() {
        const calendarEl = document.getElementById('calendar-main');
        if (!calendarEl) {
            setTimeout(initCalendar, 100);
            return;
        }

        const isMobile = window.innerWidth < 768;

        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: isMobile ? 'listWeek' : 'dayGridMonth',
            
            locale: 'es', 
            
            buttonText: {
                today:    'Hoy',
                month:    'Mes',
                week:     'Semana',
                day:      'Día',
                list:     'Agenda'
            },

            timeZone: 'local',
            
            headerToolbar: {
                left: 'prev,next today',
                center: 'title',
                right: 'dayGridMonth,timeGridWeek,listWeek' 
            },
            
            height: '100%',
            allDaySlot: false,
            slotMinTime: '00:00:00', 
            slotMaxTime: '24:00:00',
            
            selectable: true,
            editable: false, 
            dayMaxEvents: true,
            
            events: async function(info, successCallback, failureCallback) {
                try {
                    console.log("📡 Pidiendo datos a /api/crm/eventos/todos ...");
                    const token = localStorage.getItem('token');
                    
                    const res = await fetch('/api/crm/eventos/todos', {
                        headers: { 'x-auth-token': token }
                    });
                    
                    if(res.ok) {
                        const eventosDB = await res.json();
                        
                        console.log("📦 DATOS CRUDOS DEL BACKEND:", eventosDB);

                        if (eventosDB.length === 0) {
                            console.warn("⚠️ El Backend devolvió una lista vacía (0 eventos).");
                        }

                        // Mapeo a prueba de fallos y corrección de formato
                        const eventosMapeados = eventosDB.map(evt => {
                            
                            // 🔑 CORRECCIÓN CRÍTICA: Usar la comprobación de existencia antes de usar .replace()
                            let inicio = evt.fecha_inicio ? evt.fecha_inicio.replace(' ', 'T') : null;
                            let fin = evt.fecha_fin ? evt.fecha_fin.replace(' ', 'T') : null;
                            
                            const nombreSala = evt.nombre_sala || 'Sala sin asignar'; 

                            const tituloAvanzado = 
                                ` ${evt.titulo} - (${evt.nombre_sede})`; 
                                
                            const displayStyle = (evt.estado === 'cancelado') ? 'none' : 'auto'; 

                            return {
                                id: evt.id,
                                title: tituloAvanzado, 
                                start: inicio,
                                end: fin,
                                backgroundColor: getColorPorEstado(evt.estado),
                                display: displayStyle, 
                                extendedProps: { 
                                    salon: nombreSala, // Usamos nombre_sala
                                    sede: evt.nombre_sede,
                                    cliente: evt.nombre_cliente, // Suponiendo que el backend trae nombre_cliente
                                    estado: evt.estado
                                }
                            };
                        });
                        
                        console.log("🎨 EVENTOS MAPEADOS PARA FULLCALENDAR:", eventosMapeados);
                        
                        eventosGlobales = eventosMapeados;
                        successCallback(eventosMapeados); 
                    } else {
                        console.error("❌ Error HTTP:", res.status);
                        failureCallback();
                    }
                } catch (error) {
                    console.error("❌ Error en el mapeo o Red:", error);
                    failureCallback();
                }
},

            eventClick: function(info) {
                alert(`Evento: ${info.event.title}`);
            }
        });

        calendar.render();
        llenarSelects();
    }

    // 🚨 MOVEMOS LA FUNCIÓN getColorPorEstado a la parte superior o global para ser consistente.
    // En este caso, la dejamos al inicio, pero la borramos de aquí para evitar la redefinición.
    
    // Filtros (Ahora usan búsqueda inteligente)
    window.filtrarCalendario = function() {
        console.log("🔍 Aplicando filtros...");
        const checkboxes = document.querySelectorAll('.filter-group input[type="checkbox"]:checked');
        const criterios = Array.from(checkboxes).map(cb => cb.value);
        
        // 🚨 CRÍTICO: Filtramos eventos globales, PERO debemos asegurarnos de que el 'cancelado' 
        // ya fue ocultado en el mapeo, y aquí solo trabajamos con eventos visibles.
        
        // El filtro debe incluir solo eventos que no están cancelados, si el filtro principal (el mapeo) falla, esto ayuda
        const eventosVisibles = eventosGlobales.filter(evt => evt.extendedProps.estado !== 'cancelado');
        
        if (criterios.length === 0) {
            // Si no hay checks, y el filtro es por sala/estado, se debe mostrar todo lo que no esté cancelado
            calendar.removeAllEvents();
            calendar.addEventSource(eventosVisibles);
            return;
        }

        const filtrados = eventosVisibles.filter(evt => {
            const salonEvento = evt.extendedProps.salon || '';
            return criterios.some(c => salonEvento.includes(c));
        });

        console.log(`🔎 Mostrando ${filtrados.length} eventos después de filtrar.`);
        calendar.removeAllEvents();
        calendar.addEventSource(filtrados);
    }

    // Funciones dummy para que no rompa el HTML
    window.abrirModalReserva = function() { document.getElementById('modal-reserva').classList.add('active'); }
    window.cerrarModalReserva = function() { document.getElementById('modal-reserva').classList.remove('active'); }
    
    function llenarSelects() {
        const select = document.getElementById('evt-paquete');
        if(select && select.options.length < 2) select.innerHTML += '<option>Básico</option>';
    }

    initCalendar();
})();