// Ubicación: SuperNova/frontend/modules/crm/crm.js

(function() {
    console.log("🚀 CRM DATA GRID ACTIVO");

    let currentPage = 1;
    const itemsPerPage = 10; // Puedes cambiar esto a 15 o 20
    let leadsGlobales = []; 
    let sedesCache = {}; // 🔥 NUEVO: Aquí guardaremos { 3: "Primavera", 4: "Molina" }

    // --- 1. INICIALIZAR ---
    async function initCRM() {
        await cargarSedesEnModal(); // Primero cargamos nombres de sedes
        await cargarLeads();        // Luego los clientes
    }

    // --- 2. CARGAR LEADS (API) ---
    async function cargarLeads() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/crm', { headers: { 'x-auth-token': token } });
            
            if(res.ok) {
                const data = await res.json();
                leadsGlobales = data; 
                renderTable(leadsGlobales); 
            }
        } catch(e) { console.error("Error cargando CRM:", e); }
    }

function renderTable(lista) {
        const tbody = document.getElementById('crm-table-body');
        const emptyState = document.getElementById('crm-empty');
        tbody.innerHTML = '';

        if(lista.length === 0) {
            emptyState.style.display = 'block';
            document.getElementById('page-info').innerText = '0 de 0';
            document.getElementById('btn-prev').disabled = true;
            document.getElementById('btn-next').disabled = true;
            return;
        } else {
            emptyState.style.display = 'none';
        }

        const totalPages = Math.ceil(lista.length / itemsPerPage);
        
        // Ajuste de seguridad
        if (currentPage > totalPages) currentPage = totalPages;
        if (currentPage < 1) currentPage = 1;

        const start = (currentPage - 1) * itemsPerPage;
        const end = start + itemsPerPage;
        const paginatedItems = lista.slice(start, end); 

        document.getElementById('page-info').innerText = `Página ${currentPage} de ${totalPages} (Total: ${lista.length})`;
        
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');

        btnPrev.disabled = currentPage === 1;
        btnNext.disabled = currentPage === totalPages;
        btnPrev.style.opacity = currentPage === 1 ? '0.5' : '1';
        btnNext.style.opacity = currentPage === totalPages ? '0.5' : '1';

        paginatedItems.forEach(lead => {
            const tr = document.createElement('tr');
            
            let fechaTexto = '-';
            if(lead.fecha_tentativa) {
                const f = new Date(lead.fecha_tentativa);
                // Validación extra para que no salga "Invalid Date"
                if (!isNaN(f.getTime())) {
                    // Cortamos la hora para que solo muestre HH:mm
                    const horaCorta = lead.hora_inicio ? lead.hora_inicio.substring(0, 5) : '';
                    fechaTexto = f.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) + ' ' + horaCorta;
                }
            }

            let estadoClass = 'badge-nuevo';
            let estadoIcon = 'bx-sun';
            switch(lead.estado) {
                case 'contactado': estadoClass = 'badge-contactado'; estadoIcon = 'bx-message-dots'; break;
                case 'cotizado': estadoClass = 'badge-cotizado'; estadoIcon = 'bx-file'; break;
                case 'seguimiento': estadoClass = 'badge-seguimiento'; estadoIcon = 'bx-show'; break;
                case 'ganado': estadoClass = 'badge-ganado'; estadoIcon = 'bx-check'; break;
                case 'perdido': estadoClass = 'badge-perdido'; estadoIcon = 'bx-x'; break;
            }

            let origenIcon = 'bx-globe';
            if(lead.canal_origen === 'WhatsApp') origenIcon = 'bxl-whatsapp';
            if(lead.canal_origen === 'Facebook') origenIcon = 'bxl-facebook';
            if(lead.canal_origen === 'Instagram') origenIcon = 'bxl-instagram';

            const nombreSede = sedesCache[lead.sede_interes] || '-';

            tr.innerHTML = `
                <td>
                    <div class="cell-client">
                        <span class="client-name">${lead.nombre_apoderado}</span>
                        <span class="client-hijo"><i class='bx bx-cake'></i> ${lead.nombre_hijo || 'Sin nombre'}</span>
                    </div>
                </td>
                <td class="cell-contact">
                    <div><i class='bx bx-phone' style="color:#9ca3af"></i> ${lead.telefono}</div>
                    <div style="font-size:11px; color:#9ca3af">${lead.email || ''}</div>
                </td>
                <td>
                    <span class="badge-origen"><i class='bx ${origenIcon}'></i> ${lead.canal_origen || 'Web'}</span>
                </td>
                <td class="cell-date">
                    ${fechaTexto}
                </td>
                <td>
                    <span class="badge ${estadoClass}"><i class='bx ${estadoIcon}'></i> ${lead.estado || 'nuevo'}</span>
                </td>
                <td>
                    <span style="font-weight:600; color:#4b5563; font-size:13px;">${nombreSede}</span>
                </td>
                <td>
                    <div class="action-buttons">
                        <a href="https://wa.me/51${lead.telefono.replace(/\D/g,'')}" target="_blank" class="btn-icon wsp" title="WhatsApp">
                            <i class='bx bxl-whatsapp'></i>
                        </a>
                        <button class="btn-icon" onclick="editarLead(${lead.id})" title="Editar">
                            <i class='bx bx-edit-alt'></i>
                        </button>
                        <button class="btn-icon delete" onclick="eliminarLead(${lead.id})" title="Eliminar">
                            <i class='bx bx-trash'></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }


    // --- 4. BUSCADOR EN TIEMPO REAL ---
    window.filtrarCRM = function() {
        currentPage = 1; // IMPORTANTE: Volver a la página 1 al buscar
        const texto = document.getElementById('crm-search').value.toLowerCase();
        
        const filtrados = leadsGlobales.filter(l => 
            l.nombre_apoderado.toLowerCase().includes(texto) ||
            l.telefono.includes(texto) ||
            (l.nombre_hijo && l.nombre_hijo.toLowerCase().includes(texto))
        );
        
        renderTable(filtrados);
    }

    window.cambiarPagina = function(direction) {
        currentPage += direction;
        // Re-aplicamos el filtro actual para no perder la búsqueda al cambiar de página
        const texto = document.getElementById('crm-search').value.toLowerCase();
        
        const filtrados = leadsGlobales.filter(l => 
            l.nombre_apoderado.toLowerCase().includes(texto) ||
            l.telefono.includes(texto) ||
            (l.nombre_hijo && l.nombre_hijo.toLowerCase().includes(texto))
        );
        renderTable(filtrados);
    }

    // --- 5. LOGICA DEL MODAL ---
    window.abrirModalLead = function() {
        document.getElementById('form-lead').reset();
        document.getElementById('lead-id').value = '';
        document.getElementById('lead-estado').value = 'nuevo'; 
        document.getElementById('modal-lead').classList.add('active');
        document.getElementById('btn-cobrar-saldo').style.display = 'none';
        
        // Reset manual de selects
        document.getElementById('lead-sede').value = "";
        document.getElementById('lead-sala').innerHTML = '<option value="">← Elige sede primero</option>';
        document.getElementById('lead-sala').disabled = true;
    }

    window.cerrarModalLead = function() {
        document.getElementById('modal-lead').classList.remove('active');
    }

    // --- 6. EDITAR LEAD ---
    window.editarLead = async function(id) {
        const lead = leadsGlobales.find(l => l.id == id);
        if(!lead) return;

        window.abrirModalLead();
        document.querySelector('.modal-header h3').innerText = "Editar Cliente";
        
        // Llenar campos
        document.getElementById('lead-id').value = lead.id;
        document.getElementById('lead-nombre').value = lead.nombre_apoderado;
        document.getElementById('lead-telefono').value = lead.telefono;
        document.getElementById('lead-email').value = lead.email;
        document.getElementById('lead-canal').value = lead.canal_origen || 'WhatsApp';
        document.getElementById('lead-hijo').value = lead.nombre_hijo;
        document.getElementById('lead-obs').value = lead.notas;
        document.getElementById('lead-paquete').value = lead.paquete_interes;
        document.getElementById('lead-valor').value = lead.valor_estimado;
        document.getElementById('lead-estado').value = lead.estado || 'nuevo'; 

        // Fechas
        if(lead.fecha_tentativa) {
            document.getElementById('lead-fecha').value = lead.fecha_tentativa.substring(0,10);
        }
        document.getElementById('lead-hora-inicio').value = lead.hora_inicio || '16:00';
        document.getElementById('lead-hora-fin').value = lead.hora_fin || '19:00';

        // Sede y Sala
        if(lead.sede_interes) {
            document.getElementById('lead-sede').value = lead.sede_interes;
            await cargarSalasPorSede(); 
            if(lead.salon_id) {
                document.getElementById('lead-sala').value = lead.salon_id;
            }
        }

        // Botón cobrar
        const btnCobrar = document.getElementById('btn-cobrar-saldo');
        if(lead.estado !== 'ganado') { 
             btnCobrar.style.display = 'inline-block';
             btnCobrar.onclick = () => cobrarSaldoCliente(lead.id);
        }
    }

    window.guardarLead = async function() {
        const id = document.getElementById('lead-id').value;
        const nombre = document.getElementById('lead-nombre').value;
        const telefono = document.getElementById('lead-telefono').value;
        const estado = document.getElementById('lead-estado').value; 

        if(!nombre || !telefono) return alert("Nombre y Teléfono requeridos");

        // Capturamos inputs
        const fechaInput = document.getElementById('lead-fecha').value; 
        const horaInicio = document.getElementById('lead-hora-inicio').value;
        const valorEstimado = document.getElementById('lead-valor').value;

        const dataLead = {
            nombre_apoderado: nombre,
            telefono: telefono,
            email: document.getElementById('lead-email').value,
            canal_origen: document.getElementById('lead-canal').value,
            nombre_hijo: document.getElementById('lead-hijo').value,
            fecha_tentativa: fechaInput || null,
            hora_inicio: horaInicio,
            hora_fin: document.getElementById('lead-hora-fin').value,
            sede_interes: document.getElementById('lead-sede').value ? parseInt(document.getElementById('lead-sede').value) : null,
            salon_id: document.getElementById('lead-sala').value ? parseInt(document.getElementById('lead-sala').value) : null,
            paquete_interes: document.getElementById('lead-paquete').value,
            valor_estimado: valorEstimado,
            notas: document.getElementById('lead-obs').value,
            estado: estado || 'nuevo' 
        };

        try {
            const token = localStorage.getItem('token');
            let url = '/api/crm';
            let method = 'POST';
            if(id) { url = `/api/crm/${id}`; method = 'PUT'; }

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                body: JSON.stringify(dataLead)
            });

            if(res.ok) {
                // Actualizar estado si es edición y cambió
                if(id && estado) {
                     await fetch(`/api/crm/${id}/estado`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                        body: JSON.stringify({ nuevoEstado: estado })
                    });
                }

                alert("Guardado correctamente");
                cerrarModalLead();

                // 🔥 CORRECCIÓN FINAL DE ACTUALIZACIÓN VISUAL
                if (id) {
                    const index = leadsGlobales.findIndex(l => l.id == id);
                    if (index !== -1) {
                        
                        let fechaParaVisual = leadsGlobales[index].fecha_tentativa; // Mantener fecha vieja por defecto

                        if (fechaInput && fechaInput !== "") {
                            // ✅ FIX: Cortamos la hora a "10:00" para evitar "10:00:00:00"
                            const horaClean = horaInicio ? horaInicio.substring(0, 5) : '00:00';
                            fechaParaVisual = `${fechaInput}T${horaClean}:00`; 
                        }

                        // Actualizamos memoria
                        leadsGlobales[index] = { 
                            ...leadsGlobales[index], 
                            ...dataLead,
                            fecha_tentativa: fechaParaVisual, 
                            id: parseInt(id)
                        };
                        
                        // Re-aplicamos filtro para ver el cambio
                        const texto = document.getElementById('crm-search').value.toLowerCase();
                        if(texto) {
                            window.filtrarCRM(); // Si hay búsqueda, filtra
                        } else {
                            renderTable(leadsGlobales); // Si no, pinta todo
                        }

                    } else {
                        initCRM(); 
                    }
                } else {
                    initCRM();
                }

            } else {
                alert("Error al guardar");
            }
        } catch(e) { console.error(e); }
    }

    // --- 8. ELIMINAR LEAD ---
    window.eliminarLead = async function(id) {
        if(!confirm("¿Eliminar este cliente?")) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/crm/${id}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': token }
            });
            if(res.ok) {
                initCRM();
            }
        } catch(e) { console.error(e); }
    }

    // --- 9. COBRAR SALDO ---
    window.cobrarSaldoCliente = async function(id) {
        if(!confirm("¿Cobrar el 50% restante y cerrar venta?")) return;
        try {
             const token = localStorage.getItem('token');
             const res = await fetch(`/api/crm/${id}/cobrar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                body: JSON.stringify({ metodoPago: 'transferencia' })
            });
            if(res.ok) {
                alert("Cobro exitoso. Venta Cerrada.");
                cerrarModalLead();
                initCRM();
            }
        } catch(e) { console.error(e); }
    }

    // --- AUXILIARES: Cargar Sedes y Salas ---
    async function cargarSedesEnModal() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/sedes', { headers: { 'x-auth-token': token } });
            if(res.ok) {
                const sedes = await res.json();
                
                // 🔥 LLENAMOS EL DICCIONARIO (CACHE)
                sedes.forEach(s => {
                    sedesCache[s.id] = s.nombre; // Ej: sedesCache[3] = "Primavera"
                });

                // Llenar select del modal
                const select = document.getElementById('lead-sede');
                select.innerHTML = '<option value="">Seleccionar...</option>';
                sedes.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.innerText = s.nombre;
                    select.appendChild(opt);
                });
            }
        } catch(e) { console.error(e); }
    }

    window.cargarSalasPorSede = async function() {
        const sedeId = document.getElementById('lead-sede').value;
        const selectSala = document.getElementById('lead-sala');
        selectSala.innerHTML = '<option>Cargando...</option>';
        
        if(!sedeId) {
            selectSala.innerHTML = '<option value="">← Elige sede</option>';
            selectSala.disabled = true;
            return;
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/crm/salones?sede=${sedeId}`, { headers: { 'x-auth-token': token } });
            if(res.ok) {
                const salas = await res.json();
                selectSala.innerHTML = '<option value="">Seleccionar Sala</option>';
                salas.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.innerText = s.nombre;
                    selectSala.appendChild(opt);
                });
                selectSala.disabled = false;
            }
        } catch(e) { console.error(e); }
    }

    // ARRANQUE
    initCRM();

})();