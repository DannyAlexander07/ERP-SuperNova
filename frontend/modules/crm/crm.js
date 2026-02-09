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
        await cargarVendedores()
    }

    window.cerrarModalLead = function() {
        document.getElementById('modal-lead').classList.remove('active');
    }

// --- 6. EDITAR LEAD (CON BLOQUEO DE ESTADO GANADO) ---
window.editarLead = async function(id) {
    const lead = leadsGlobales.find(l => l.id == id);
    if(!lead) return;

    await window.abrirModalLead(); // Carga vendedores y resetea form
    document.querySelector('.modal-header h3').innerText = "Editar Cliente";
    
    // --- DATOS BÁSICOS ---
    document.getElementById('lead-id').value = lead.id;
    document.getElementById('lead-nombre').value = lead.nombre_apoderado;
    document.getElementById('lead-telefono').value = lead.telefono;
    document.getElementById('lead-email').value = lead.email;
    document.getElementById('lead-canal').value = lead.canal_origen || 'WhatsApp';
    document.getElementById('lead-hijo').value = lead.nombre_hijo;
    
    // Vendedor
    if (lead.vendedor_id) {
        document.getElementById('lead-vendedor').value = lead.vendedor_id;
    }

    // Método de Pago
    if (lead.metodo_pago) {
        document.getElementById('lead-metodo-pago').value = lead.metodo_pago.toLowerCase();
    }

    // Nro Operación
    if (lead.nro_operacion) {
        document.getElementById('lead-nro-operacion').value = lead.nro_operacion;
    }

    if (lead.paquete_interes) {
        document.getElementById('lead-paquete').value = lead.paquete_interes;
    }

    // LÓGICA DE EXTRACCIÓN (Niños y Notas)
    let cantidadNiños = 15; 
    let notasLimpias = lead.notas || '';

    if (lead.notas) {
        const regex = /Niños:\s*(\d+)\.?\s*/i;
        const match = lead.notas.match(regex);
        
        if (match) {
            cantidadNiños = match[1]; 
            notasLimpias = lead.notas.replace(regex, '');
        }
    }

    document.getElementById('lead-cantidad-ninos').value = cantidadNiños;
    document.getElementById('lead-obs').value = notasLimpias.trim(); 
    document.getElementById('lead-valor').value = lead.valor_estimado;

    // --- MANEJO DEL ESTADO Y FECHAS ---
    const estadoSelect = document.getElementById('lead-estado');
    estadoSelect.value = lead.estado || 'nuevo'; 

    if(lead.fecha_tentativa) {
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

    // 🔥 BLOQUEO DE SEGURIDAD: SI YA ESTÁ GANADO, NO SE PUEDE CAMBIAR EL ESTADO 🔥
    if (lead.estado === 'ganado') {
        estadoSelect.disabled = true; // Bloquea el selector
        estadoSelect.style.backgroundColor = '#dcfce7'; // Fondo verde suave
        estadoSelect.style.color = '#166534'; // Texto verde oscuro
        estadoSelect.style.fontWeight = 'bold';
    } else {
        // Restaurar estado normal si abrimos otro lead después
        estadoSelect.disabled = false; 
        estadoSelect.style.backgroundColor = ''; 
        estadoSelect.style.color = '';
        estadoSelect.style.fontWeight = 'normal';
    }

    // --- BOTÓN DE COBRAR SALDO ---
    const btnCobrar = document.getElementById('btn-cobrar-saldo');
    // Solo mostramos cobrar si NO está ganado ni perdido, y si ya hubo pago inicial
    if(lead.estado !== 'ganado' && lead.estado !== 'perdido' && parseFloat(lead.pago_inicial) > 0) { 
         btnCobrar.style.display = 'inline-block';
         btnCobrar.onclick = () => abrirModalCobroFinal(lead); // Usar lead directamente es más seguro
    } else {
         btnCobrar.style.display = 'none';
    }
};

// --- 7. GUARDAR LEAD (SOPORTA MÉTODO DE PAGO Y NIÑOS) ---
window.guardarLead = async function() {
    const id = document.getElementById('lead-id').value;
    const nombre = document.getElementById('lead-nombre').value;
    const telefono = document.getElementById('lead-telefono').value;
    const estado = document.getElementById('lead-estado').value; 

    if(!nombre || !telefono) return showAlert("Nombre y Teléfono son obligatorios", "error");

    // Capturamos inputs básicos
    const fechaInput = document.getElementById('lead-fecha').value; 
    const horaInicio = document.getElementById('lead-hora-inicio').value;
    const valorEstimado = document.getElementById('lead-valor').value;
    const cantidadNinosInput = document.getElementById('lead-cantidad-ninos').value;

    // 🔥 NUEVO: CAPTURAMOS LOS DATOS DE PAGO (Si existen en el formulario)
    const metodoPagoInput = document.getElementById('lead-metodo-pago').value;
    const nroOperacionInput = document.getElementById('lead-nro-operacion').value;

    const vendedorInput = document.getElementById('lead-vendedor').value;

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
        
        // Datos Clave
        paquete_interes: document.getElementById('lead-paquete').value, 
        cantidad_ninos: cantidadNinosInput, 
        valor_estimado: valorEstimado,
        
        // 🔥 ENVIAMOS LA FORMA DE PAGO AL BACKEND
        metodo_pago: metodoPagoInput,
        nro_operacion: nroOperacionInput,
        vendedor_id: vendedorInput ? parseInt(vendedorInput) : null,

        notas: document.getElementById('lead-obs').value,
        estado: estado || 'nuevo' 
    };

    try {
        const token = localStorage.getItem('token');
        let url = '/api/crm';
        let method = 'POST';
        
        // Si hay ID, es una EDICIÓN (PUT)
        if(id) { 
            url = `/api/crm/${id}`; 
            method = 'PUT'; 
        }

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
            body: JSON.stringify(dataLead)
        });

        if(res.ok) {
            // Actualizar estado si es edición y cambió el select de estado
            if(id && estado) {
                 await fetch(`/api/crm/${id}/estado`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                    body: JSON.stringify({ nuevoEstado: estado })
                });
            }

            showToast("Guardado correctamente.", "success");
            cerrarModalLead();
            
            // Recargar tabla para ver cambios
            initCRM(); 

        } else {
            const errorData = await res.json();
            showAlert("Error al guardar: " + (errorData.msg || "Error desconocido"), "error");
        }
    } catch(e) { 
        console.error(e); 
        showAlert("Error de conexión al guardar.", "error"); 
    }
}

    
    // --- 8. ELIMINAR LEAD ---
    window.eliminarLead = async function(id) {
        if (!await showConfirm("¿Estás seguro de eliminar este lead? Todos los datos de eventos y pagos asociados se borrarán permanentemente.", "Confirmar Eliminación")) return;
        
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/crm/${id}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': token }
            });
            if(res.ok) {
                showToast("Lead eliminado correctamente.", "success");
                initCRM();
            } else {
                const err = await res.json();
                showAlert(err.msg || "No se pudo eliminar el lead.", "error");
            }
        } catch(e) { 
            console.error(e); 
            showAlert("Error de conexión al eliminar.", "error");
        }
    }

async function cargarVendedores() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await fetch('/api/usuarios', {
            headers: { 'x-auth-token': token }
        });

        if (!res.ok) return console.error("Error cargando vendedores");

        const data = await res.json();
        const listaUsuarios = data.usuarios ? data.usuarios : data;

        const select = document.getElementById('lead-vendedor');
        select.innerHTML = '<option value="">-- Selecciona Vendedor --</option>';

        if (Array.isArray(listaUsuarios)) {
            listaUsuarios.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;

                // ✅ CORRECCIÓN: Unimos Nombres + Apellidos según tu base de datos
                // Usamos `${}` para juntarlos con un espacio en medio
                const nombreCompleto = `${user.nombres} ${user.apellidos}`;
                
                option.textContent = nombreCompleto;
                select.appendChild(option);
            });
        }

    } catch (e) {
        console.error("Error al cargar lista de vendedores:", e);
    }
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

    // --- 9. MODAL COBRO FINAL (CORREGIDO: ASYNC) ---
    let leadActualParaCobro = null; 

    // 🔥 AGREGAMOS "async" AQUÍ 👇
    window.abrirModalCobroFinal = async function() {
        // 1. Obtener ID del Lead actual
        const leadId = document.getElementById('lead-id').value;
        if (!leadId) return showAlert("Error: No se detectó el ID del Lead.", "error");

        // 2. Buscar datos del lead en memoria
        const lead = leadsGlobales.find(l => l.id == leadId);
        if (!lead) return showAlert("Error: Lead no encontrado en memoria.", "error");

        leadActualParaCobro = lead; 

        // 3. Referencias al DOM
        const modal = document.getElementById('modal-cobrar-saldo');
        const inputId = document.getElementById('cobro-lead-id');
        const inputNinos = document.getElementById('cobro-ninos');
        const selectPaquete = document.getElementById('cobro-paquete');
        const mainPaqueteSelect = document.getElementById('lead-paquete'); // Select del otro modal
        
        if (!modal) return console.error("❌ Error: Falta #modal-cobrar-saldo");

        // 4. Llenar datos iniciales
        inputId.value = leadId;
        inputNinos.value = document.getElementById('lead-cantidad-ninos').value; 

        // 🔥 CORRECCIÓN CRÍTICA: Si el select principal está vacío, lo llenamos primero
        // Como usamos 'await', la función padre debe ser 'async'
        if (mainPaqueteSelect.options.length <= 1) {
            await cargarProductosEnSelect(); 
        }

        // Copiar opciones del select de paquetes
        selectPaquete.innerHTML = mainPaqueteSelect.innerHTML;
        selectPaquete.value = mainPaqueteSelect.value;

        // Bloqueo de seguridad visual
        selectPaquete.disabled = true; 
        selectPaquete.style.backgroundColor = "#e2e8f0"; 
        selectPaquete.style.cursor = "not-allowed"; 

        // 5. Calcular saldos iniciales
        recalcularSaldoVisual();

        // 6. Mostrar Modal
        modal.classList.add('active');
    };

    window.cerrarModalCobroFinal = function() {
        const modal = document.getElementById('modal-cobrar-saldo');
        if (modal) modal.classList.remove('active');
    };

    window.recalcularSaldoVisual = function() {
        const ninos = parseInt(document.getElementById('cobro-ninos').value) || 0;
        const paqueteId = document.getElementById('cobro-paquete').value;
        
        const txtNuevoTotal = document.getElementById('txt-nuevo-total');
        const txtYaPagado = document.getElementById('txt-ya-pagado');
        const txtSaldo = document.getElementById('txt-saldo-pagar');

        // 1. Calcular Nuevo Costo Total
        let precioUnitario = 0;
        if (paqueteId && productosCache) {
            const prod = productosCache.find(p => p.id == paqueteId);
            if (prod) precioUnitario = parseFloat(prod.precio_venta);
        }
        
        // Si no hay precio de paquete, usar el valor estimado original
        let nuevoTotal = precioUnitario * ninos;
        if (nuevoTotal === 0 && leadActualParaCobro) {
            nuevoTotal = parseFloat(leadActualParaCobro.valor_estimado || 0);
        }

        // 2. Obtener lo ya pagado (Señal)
        const yaPagado = parseFloat(leadActualParaCobro ? leadActualParaCobro.pago_inicial : 0);

        // 3. Calcular Saldo
        let saldo = nuevoTotal - yaPagado;
        if (saldo < 0) saldo = 0;

        // 4. Pintar en HTML
        txtNuevoTotal.innerText = `S/ ${nuevoTotal.toFixed(2)}`;
        txtYaPagado.innerText = `S/ ${yaPagado.toFixed(2)}`;
        txtSaldo.innerText = `S/ ${saldo.toFixed(2)}`;
    };

    window.procesarCobroFinal = async function() {
        const btn = document.querySelector('#modal-cobrar-saldo .btn-cobrar');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Procesando...`;

        try {
            const leadId = document.getElementById('cobro-lead-id').value;
            const ninosFinal = document.getElementById('cobro-ninos').value;
            const paqueteFinal = document.getElementById('cobro-paquete').value;
            const metodo = document.getElementById('cobro-metodo').value;

            const token = localStorage.getItem('token');
            const res = await fetch(`/api/crm/leads/${leadId}/cobrar-saldo`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-token': token 
                },
                body: JSON.stringify({
                    cantidad_ninos_final: ninosFinal,
                    paquete_final_id: paqueteFinal,
                    metodoPago: metodo
                })
            });

            const data = await res.json();

            if (res.ok) {
                await showAlert(data.msg, "success");
                cerrarModalCobroFinal();
                cerrarModalLead(); 
                cargarLeads(); // Recargar tabla principal
            } else {
                await showAlert(data.msg, "error");
            }

        } catch (error) {
            console.error(error);
            await showAlert("Error de conexión al procesar el cobro.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    };

    // --- FUNCIONES GLOBALES DE MODAL (SEGURAS) ---
    window.mostrarExito = function(mensaje) {
        const msgEl = document.getElementById('success-msg');
        const modalEl = document.getElementById('modal-success');
        
        if (msgEl && modalEl) {
            msgEl.innerText = mensaje;
            modalEl.classList.add('active');
        } else {
            // Si no existe el HTML (ej: estás en otra página incompleta), usa alert
            alert("✅ " + mensaje);
        }
    }

    window.mostrarError = function(mensaje) {
        const msgEl = document.getElementById('error-msg');
        const modalEl = document.getElementById('modal-error');
        
        if (msgEl && modalEl) {
            msgEl.innerText = mensaje;
            modalEl.classList.add('active');
        } else {
            // Fallback seguro
            alert("❌ " + mensaje);
        }
    }

    // ARRANQUE
    initCRM();

})();