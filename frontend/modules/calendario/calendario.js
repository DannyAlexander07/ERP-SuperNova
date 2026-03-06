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

   // --- 3. INICIALIZAR FULLCALENDAR ---
    function initCalendar() {
        const calendarEl = document.getElementById('calendar-main');
        if (!calendarEl) return;

        const isMobile = window.innerWidth < 768;

        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: isMobile ? 'listWeek' : 'dayGridMonth',
            locale: 'es',       
            timeZone: 'local',
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
            
            // 🔥 AQUÍ REEMPLAZAMOS EL ALERT POR EL SÚPER MODAL
            eventClick: function(info) {
                mostrarDetalleEventoDinamico(info.event);
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

    // --- 5. CARGAR EVENTOS DE LA API (ACTUALIZADO CON NUEVOS DATOS) ---
    async function cargarEventosDesdeAPI() {
        try {
            const token = localStorage.getItem('token');
            const url = `/api/crm/eventos/todos?sede=${filtroSedeActual}`;
            
            const res = await fetch(url, { headers: { 'x-auth-token': token } });
            
            if(res.ok) {
                const datos = await res.json();
                
                eventosGlobales = datos.map(evt => {
                    let inicio = null;
                    let fin = null;

                    if (evt.fecha_inicio) inicio = evt.fecha_inicio.includes('T') ? evt.fecha_inicio : evt.fecha_inicio.replace(' ', 'T');
                    if (evt.fecha_fin) fin = evt.fecha_fin.includes('T') ? evt.fecha_fin : evt.fecha_fin.replace(' ', 'T');

                    if (!inicio) return null;
                    
                    const nombreSala = evt.nombre_sala_real || evt.salon || 'Sala General';

                    return {
                        id: evt.id,
                        title: `${evt.titulo}`,
                        start: inicio,
                        end: fin,
                        backgroundColor: getColorPorEstado(evt.estado),
                        // 🔥 AQUÍ AGREGAMOS LA INFORMACIÓN ENRIQUECIDA Y CORREGIDA
                        extendedProps: { 
                            salon: nombreSala,
                            sede: evt.nombre_sede,
                            estado: evt.estado,
                            cliente: evt.nombre_cliente || evt.cliente || 'Sin Nombre',
                            telefono: evt.telefono_cliente || evt.telefono || '-', // Plan B
                            paquete: evt.nombre_paquete || evt.paquete || 'Combo Personalizado',
                            costo_total: evt.costo_total,
                            saldo: evt.saldo,
                            lead_hora_inicio: evt.lead_hora_inicio || evt.hora_inicio || null, // Plan B
                            lead_hora_fin: evt.lead_hora_fin || evt.hora_fin || null // Plan B
                        }
                    };
                }).filter(evt => evt !== null); 

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

    // --- NUEVO: MODAL DINÁMICO DE EVENTO ---
    function mostrarDetalleEventoDinamico(event) {
        // Eliminar modal anterior si existe
        let oldModal = document.getElementById('modal-detalle-cal');
        if (oldModal) oldModal.remove();

        const props = event.extendedProps;
        
        // 🔥 ACTUALIZADO: Usamos la hora real de la base de datos (del Lead) si existe
        const horaInicioReal = props.lead_hora_inicio ? props.lead_hora_inicio.substring(0, 5) : (event.start ? event.start.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--');
        const horaFinReal = props.lead_hora_fin ? props.lead_hora_fin.substring(0, 5) : (event.end ? event.end.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--:--');
        
        // Colores de estado
        let colorEstado = '#3498db';
        let iconEstado = 'bx-calendar-star';
        if(props.estado === 'confirmado') { colorEstado = '#2ecc71'; iconEstado = 'bx-check-double'; }
        if(props.estado === 'reservado') { colorEstado = '#f1c40f'; iconEstado = 'bx-time-five'; }
        
        const saldoFormat = parseFloat(props.saldo || 0).toFixed(2);
        const costoFormat = parseFloat(props.costo_total || 0).toFixed(2);
        const alertDeuda = props.saldo > 0 ? `<div style="color: #e74c3c; font-weight: bold; margin-top:5px;"><i class='bx bx-error-circle'></i> Saldo pendiente: S/ ${saldoFormat}</div>` : `<div style="color: #2ecc71; font-weight: bold; margin-top:5px;"><i class='bx bx-check-shield'></i> Pagado al 100%</div>`;

        // 🔥 AGREGA ESTO AQUÍ
        const telLimpio = (props.telefono && props.telefono !== '-') ? props.telefono.replace(/\D/g,'') : '';
        const linkWsp = telLimpio ? `<a href="https://wa.me/51${telLimpio}" target="_blank" style="color: #3498db; text-decoration: none;">${props.telefono}</a>` : `<span style="color: #7f8c8d;">Sin registro</span>`;

        // Crear HTML del Modal Inyectado
        const modalHTML = `
        <div id="modal-detalle-cal" class="modal-overlay active" style="z-index: 9999; display: flex;">
            <div class="modal-content" style="max-width: 450px; padding: 0; border-radius: 12px; overflow: hidden;">
                
                <div style="background-color: ${colorEstado}; color: white; padding: 20px; position: relative;">
                    <button onclick="document.getElementById('modal-detalle-cal').remove()" style="position: absolute; right: 15px; top: 15px; background: none; border: none; color: white; font-size: 24px; cursor: pointer;">&times;</button>
                    <h3 style="margin: 0; display: flex; align-items: center; gap: 10px;">
                        <i class='bx ${iconEstado}' style="font-size: 24px;"></i> 
                        Detalle de Reserva
                    </h3>
                    <p style="margin: 5px 0 0 0; opacity: 0.9; text-transform: uppercase; font-size: 12px; font-weight: bold;">ESTADO: ${props.estado}</p>
                </div>

                <div style="padding: 20px; line-height: 1.6; color: #333;">
                    <h4 style="margin: 0 0 15px 0; color: #2c3e50; font-size: 18px;">${event.title}</h4>
                    
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px; background: #f8f9fa; padding: 15px; border-radius: 8px;">
                        <div>
                            <small style="color: #7f8c8d; font-size: 11px; text-transform: uppercase;">⏰ Horario</small>
                            <div style="font-weight: 600;">${horaInicioReal} - ${horaFinReal}</div>
                        </div>
                        <div>
                            <small style="color: #7f8c8d; font-size: 11px; text-transform: uppercase;">📍 Sede y Sala</small>
                            <div style="font-weight: 600;">${props.sede} - ${props.salon}</div>
                        </div>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class='bx bx-user' style="color: #7f8c8d; font-size: 18px;"></i>
                            <strong>Cliente:</strong> ${props.cliente}
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-top: 5px;">
                            <i class='bx bxl-whatsapp' style="color: #25D366; font-size: 18px;"></i>
                            <strong>Teléfono:</strong> 
                            ${linkWsp}
                        </div>
                        <div style="display: flex; align-items: center; gap: 10px; margin-top: 5px;">
                            <i class='bx bx-gift' style="color: #9b59b6; font-size: 18px;"></i>
                            <strong>Paquete:</strong> ${props.paquete}
                        </div>
                    </div>

                    <hr style="border: 0; border-top: 1px solid #eee; margin: 15px 0;">

                    <div style="display: flex; justify-content: space-between; align-items: center; background: #fff3cd; padding: 15px; border-radius: 8px; border: 1px solid #ffeeba;">
                        <div>
                            <span style="display: block; font-size: 12px; color: #856404;">Costo Total</span>
                            <strong style="color: #856404; font-size: 16px;">S/ ${costoFormat}</strong>
                        </div>
                        <div style="text-align: right;">
                            ${alertDeuda}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

        document.body.insertAdjacentHTML('beforeend', modalHTML);
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

    // --- 8. ARRANQUE: Exponemos la función para el Router SPA ---
    window.initCalendario = function() {
        console.log("▶️ Iniciando módulo Calendario...");
        // Tu función principal está en la línea 16 y se llama initModule
        initModule(); 
    };

    // Fallback: Si la página se recarga manualmente (F5) estando en esta vista
    if (document.getElementById('calendar-main') || document.querySelector('.calendar-module-container')) {
        window.initCalendario();
    }

})();