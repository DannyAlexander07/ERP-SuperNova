// Ubicación: SuperNova/frontend/modules/crm/crm.js

(function() {
    console.log("🚀 CRM DATA GRID ACTIVO");

    let currentPage = 1;
    const itemsPerPage = 10; // Puedes cambiar esto a 15 o 20
    let leadsGlobales = []; 
    let productosCache = [];
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
    window.abrirModalLead = async function() {
        document.getElementById('form-lead').reset();
        document.getElementById('lead-id').value = '';
        document.getElementById('lead-estado').value = 'nuevo'; 
        document.getElementById('modal-lead').classList.add('active');
        document.getElementById('btn-cobrar-saldo').style.display = 'none';
        
        // Reset manual de selects
        document.getElementById('lead-sede').value = "";
        document.getElementById('lead-sala').innerHTML = '<option value="">← Elige sede primero</option>';
        document.getElementById('lead-sala').disabled = true;
        await cargarProductosEnSelect();
    }

    window.cerrarModalLead = function() {
        document.getElementById('modal-lead').classList.remove('active');
    }

// --- 6. EDITAR LEAD (LECTURA INTELIGENTE) ---
    window.editarLead = async function(id) {
        const lead = leadsGlobales.find(l => l.id == id);
        if(!lead) return;

        await window.abrirModalLead();
        document.querySelector('.modal-header h3').innerText = "Editar Cliente";
        
        // Datos básicos
        document.getElementById('lead-id').value = lead.id;
        document.getElementById('lead-nombre').value = lead.nombre_apoderado;
        document.getElementById('lead-telefono').value = lead.telefono;
        document.getElementById('lead-email').value = lead.email;
        document.getElementById('lead-canal').value = lead.canal_origen || 'WhatsApp';
        document.getElementById('lead-hijo').value = lead.nombre_hijo;
        
        if (lead.paquete_interes) {
            document.getElementById('lead-paquete').value = lead.paquete_interes;
        }

        // 🔥 LÓGICA DE EXTRACCIÓN (SEPARA NÚMERO DE TEXTO)
        let cantidadNiños = 15; // Valor por defecto si no encuentra nada
        let notasLimpias = lead.notas || '';

        if (lead.notas) {
            // Regex: Busca "Niños:" seguido de espacios, un número, opcionalmente un punto y espacio
            const regex = /Niños:\s*(\d+)\.?\s*/i;
            const match = lead.notas.match(regex);
            
            if (match) {
                cantidadNiños = match[1]; // Captura el número (ej: 35)
                // Elimina SOLO la parte de "Niños: 35. " del texto para mostrar el resto limpio
                notasLimpias = lead.notas.replace(regex, '');
            }
        }

        // Asignamos los valores separados a cada input
        document.getElementById('lead-cantidad-ninos').value = cantidadNiños;
        document.getElementById('lead-obs').value = notasLimpias.trim(); 

        // Resto de campos
        document.getElementById('lead-valor').value = lead.valor_estimado;
        document.getElementById('lead-estado').value = lead.estado || 'nuevo'; 

        if(lead.fecha_tentativa) {
            // Aseguramos formato fecha input
            const fechaLimpia = new Date(lead.fecha_tentativa).toISOString().split('T')[0];
            document.getElementById('lead-fecha').value = fechaLimpia;
        }
        document.getElementById('lead-hora-inicio').value = lead.hora_inicio || '16:00';
        document.getElementById('lead-hora-fin').value = lead.hora_fin || '19:00';

        if(lead.sede_interes) {
            document.getElementById('lead-sede').value = lead.sede_interes;
            await cargarSalasPorSede();
            if(lead.salon_id) {
                document.getElementById('lead-sala').value = lead.salon_id;
            }
        }

        const btnCobrar = document.getElementById('btn-cobrar-saldo');
        if(lead.estado !== 'ganado' && lead.estado !== 'perdido') { 
             btnCobrar.style.display = 'inline-block';
             btnCobrar.onclick = () => cobrarSaldoCliente(lead.id);
        } else {
             btnCobrar.style.display = 'none';
        }
    }

// --- 7. GUARDAR LEAD (CORREGIDO: ENVÍA CANTIDAD) ---
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
        
        // 🔥 CAPTURAMOS LA CANTIDAD DE NIÑOS DEL INPUT
        const cantidadNinosInput = document.getElementById('lead-cantidad-ninos').value;

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
            
            // 🔥 DATOS CLAVE PARA EL CÁLCULO
            paquete_interes: document.getElementById('lead-paquete').value, 
            cantidad_ninos: cantidadNinosInput, // Enviamos el número explícitamente
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

                alert("✅ Guardado correctamente.");
                cerrarModalLead();
                
                // Recargar todo para ver los cambios limpios
                initCRM(); 

            } else {
                const errorData = await res.json();
                alert("Error al guardar: " + (errorData.msg || "Desconocido"));
            }
        } catch(e) { console.error(e); alert("Error de conexión"); }
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

    // --- 9. COBRAR SALDO (CON AJUSTE) ---
    window.cobrarSaldoCliente = async function(id) {
        // Pedir confirmación de niños
        const cantReal = prompt("¿Cuántos niños asistieron finalmente? (Para ajustar saldo y stock)", "15");
        if(cantReal === null) return; // Cancelar

        if(!confirm(`Se recalculará el saldo para ${cantReal} niños y se descontará del inventario. ¿Proceder?`)) return;

        try {
             const token = localStorage.getItem('token');
             const res = await fetch(`/api/crm/${id}/cobrar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                body: JSON.stringify({ 
                    metodoPago: 'transferencia',
                    cantidad_ninos_final: cantReal // 🔥 Enviamos el dato nuevo
                })
            });
            
            const json = await res.json();
            
            if(res.ok) {
                alert(json.msg); // Muestra mensaje con el monto cobrado
                cerrarModalLead();
                initCRM();
            } else {
                alert("Error: " + json.msg);
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

    async function cargarProductosEnSelect() {
        try {
            const res = await fetch('/api/inventario', { headers: { 'x-auth-token': localStorage.getItem('token') } });
            if(res.ok) {
                const data = await res.json();
                // Filtramos solo lo que sea "combo" o lo que quieras vender
                // Si no tienes categoría 'combo', usa todos.
                productosCache = data.productos || []; 
                
                const select = document.getElementById('lead-paquete');
                select.innerHTML = '<option value="">-- Seleccione Combo --</option>';
                
                productosCache.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.innerText = `${p.nombre} (S/ ${p.precio_venta})`;
                    select.appendChild(opt);
                });
            }
        } catch(e) { console.error(e); }
    }

    window.calcularTotalLead = function() {
        const prodId = document.getElementById('lead-paquete').value;
        const cantidad = document.getElementById('lead-cantidad-ninos').value || 0;
        const inputTotal = document.getElementById('lead-valor');

        if(!prodId) {
            inputTotal.value = "0.00";
            return;
        }

        const producto = productosCache.find(p => p.id == prodId);
        if(producto) {
            const precio = parseFloat(producto.precio_venta);
            const total = precio * parseInt(cantidad);
            inputTotal.value = total.toFixed(2);
        }
    }

    // ARRANQUE
    initCRM();

})();