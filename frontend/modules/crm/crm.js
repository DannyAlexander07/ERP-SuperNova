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

        if (lista.length === 0) {
            emptyState.style.display = 'block';
            document.getElementById('page-info').innerText = '0 de 0';
            document.getElementById('btn-prev').disabled = true;
            document.getElementById('btn-next').disabled = true;
            return;
        } else {
            emptyState.style.display = 'none';
        }

        const totalPages = Math.ceil(lista.length / itemsPerPage);
        
        // Ajuste de seguridad para la paginación
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
            
            // 1. Formateo de Fecha y Hora
            let fechaTexto = '-';
            if (lead.fecha_tentativa) {
                const f = new Date(lead.fecha_tentativa);
                if (!isNaN(f.getTime())) {
                    const horaCorta = lead.hora_inicio ? lead.hora_inicio.substring(0, 5) : '';
                    fechaTexto = f.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) + ' ' + horaCorta;
                }
            }

            // 2. Iconos y Clases de Estado del Lead
            let estadoClass = 'badge-nuevo';
            let estadoIcon = 'bx-sun';
            const estadoActual = (lead.estado || 'nuevo').toLowerCase();

            switch (estadoActual) {
                case 'contactado': estadoClass = 'badge-contactado'; estadoIcon = 'bx-message-dots'; break;
                case 'cotizado':   estadoClass = 'badge-cotizado';   estadoIcon = 'bx-file'; break;
                case 'seguimiento': estadoClass = 'badge-seguimiento'; estadoIcon = 'bx-show'; break;
                case 'ganado':     estadoClass = 'badge-ganado';      estadoIcon = 'bx-check-double'; break; 
                case 'perdido':    estadoClass = 'badge-perdido';     estadoIcon = 'bx-x'; break;
            }

            // 3. Iconos de Origen
            let origenIcon = 'bx-globe';
            if (lead.canal_origen === 'WhatsApp') origenIcon = 'bxl-whatsapp';
            if (lead.canal_origen === 'Facebook') origenIcon = 'bxl-facebook';
            if (lead.canal_origen === 'Instagram') origenIcon = 'bxl-instagram';

            const nombreSede = sedesCache[lead.sede_interes] || '-';

            // 4. LÓGICA DE ESTADO DE PAGO Y BLOQUEO DE BOTONES
            const adelantoReal = parseFloat(lead.pago_inicial) || 0;
            const totalEvento = parseFloat(lead.valor_estimado) || 0;
            const saldoRestante = totalEvento - adelantoReal;

            // Definición de variable para control de bloqueos
            const esPagadoTotal = (estadoActual === 'ganado' || saldoRestante <= 0.01) && totalEvento > 0;

            let estadoPagoHTML = '';
            let btnPagoHTML = '';

            if (esPagadoTotal) {
                // DISEÑO PARA PAGADO TOTAL
                estadoPagoHTML = `<span class="badge" style="background: #10b981; color: white; border-radius: 20px;"><i class='bx bxs-check-shield'></i> Pagado Total</span>`;
                
                btnPagoHTML = `
                    <button class="btn-icon" style="color: #10b981; background: #dcfce7; border: 1px solid #10b981; cursor: default;" title="Venta Finalizada">
                        <i class='bx bx-check-double'></i>
                    </button>`;
            } else {
                // DISEÑO PARA PAGO PARCIAL O SIN RESERVA
                if (adelantoReal > 0) {
                    // Muestra cuánto falta pagar si el saldo es mayor a 0
                    estadoPagoHTML = `<span class="badge" style="background: #fff7ed; color: #c2410c; border: 1px solid #fed7aa;"><i class='bx bx-time-five'></i> Debe: S/ ${saldoRestante.toFixed(2)}</span>`;
                } else {
                    estadoPagoHTML = `<span class="badge badge-gray" style="background: #f1f5f9; color: #64748b;"><i class='bx bx-wallet'></i> Sin Reserva</span>`;
                }

                // El botón permite abrir el modal de abonos mientras haya deuda
                btnPagoHTML = `
                    <button class="btn-icon" style="color: #10b981; background: #ecfdf5; border: 1px solid #a7f3d0;" onclick="abrirModalPagos(${lead.id})" title="Registrar Adelanto o Saldo">
                        <i class='bx bx-money'></i>
                    </button>`;
            }

            // 5. Armado de la fila
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
                    <div style="font-weight: 500; color: #374151;">${fechaTexto}</div>
                    <div style="font-size:11px; color:#64748b; font-weight:600; margin-top:3px;"><i class='bx bx-building'></i> ${nombreSede}</div>
                </td>
                <td>
                    ${estadoPagoHTML}
                </td>
                <td>
                    <span class="badge ${estadoClass}"><i class='bx ${estadoIcon}'></i> ${lead.estado || 'nuevo'}</span>
                </td>
                <td>
                    <div class="action-buttons">
                        <a href="https://wa.me/51${lead.telefono.replace(/\D/g,'')}" target="_blank" class="btn-icon wsp" title="Enviar WhatsApp">
                            <i class='bx bxl-whatsapp'></i>
                        </a>
                        
                        <button class="btn-icon" style="color: #6366f1; background: #e0e7ff; border: 1px solid #c7d2fe;" onclick="verHistorialPagosLead(${lead.id})" title="Ver Historial de Abonos">
                            <i class='bx bx-list-ul'></i>
                        </button>

                        ${btnPagoHTML}

                        <button class="btn-icon" onclick="editarLead(${lead.id})" title="Editar Lead" ${esPagadoTotal ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>
                            <i class='bx bx-edit-alt'></i>
                        </button>
                        
                        <button class="btn-icon delete" onclick="eliminarLead(${lead.id})" title="Eliminar Lead">
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

    // --- 5. LOGICA DEL MODAL (LIMPIA) ---
    window.abrirModalLead = async function() {
        const form = document.getElementById('form-lead');
        const modal = document.getElementById('modal-lead');
        
        if (form) form.reset();
        
        // Reset de campos ocultos y estados
        document.getElementById('lead-id').value = '';
        document.getElementById('lead-estado').value = 'nuevo'; 
        
        // Mostrar modal
        if (modal) modal.classList.add('active');
        
        // Reset manual de selects de sede/sala
        const selectSede = document.getElementById('lead-sede');
        const selectSala = document.getElementById('lead-sala');
        
        if (selectSede) selectSede.value = "";
        if (selectSala) {
            selectSala.innerHTML = '<option value="">← Elige sede primero</option>';
            selectSala.disabled = true;
        }

        // Cargamos los catálogos necesarios
        await cargarProductosEnSelect();
        await cargarVendedores();

        // 🔥 IMPORTANTE: Aquí borramos la línea que causaba el error del 'style'
        // Ya no buscamos 'btn-cobrar-saldo' porque fue eliminado del HTML.
    };

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
        
        // 🔥 NUEVO: Cargar el DNI / RUC en el input al editar 🔥
        const inputDoc = document.getElementById('lead-documento');
        if (inputDoc) inputDoc.value = lead.documento || '';
        
        document.getElementById('lead-telefono').value = lead.telefono;
        document.getElementById('lead-email').value = lead.email;
        document.getElementById('lead-canal').value = lead.canal_origen || 'WhatsApp';
        document.getElementById('lead-hijo').value = lead.nombre_hijo;
        
        // Vendedor
        if (lead.vendedor_id) {
            document.getElementById('lead-vendedor').value = lead.vendedor_id;
        }

        if (lead.paquete_interes) {
            document.getElementById('lead-paquete').value = lead.paquete_interes;
        }

        // LÓGICA DE EXTRACCIÓN (Niños y Notas)
        let cantidadNiños = parseInt(lead.cantidad_ninos) || 0;
        let notasLimpias = lead.notas || '';

        if (notasLimpias) {
            const regex = /Niños:\s*(\d+)\.?\s*/i;
            const match = notasLimpias.match(regex);
            if (match) {
                if (cantidadNiños === 0) { // Solo usar si el campo no está seteado
                    cantidadNiños = parseInt(match[1]);
                }
                // Limpiar siempre la nota para no mostrarla en el textarea
                notasLimpias = notasLimpias.replace(regex, '').trim();
            }
        }
        
        if (cantidadNiños === 0) {
            cantidadNiños = 15; // Default final si todo lo demás falla
        }

        document.getElementById('lead-cantidad-ninos').value = cantidadNiños;
        document.getElementById('lead-obs').value = notasLimpias.trim(); 

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

        // ✅ ACTUALIZACIÓN: Disparar el cálculo del total inmediatamente después de cargar los datos
        if (typeof window.calcularTotalLead === "function") {
            window.calcularTotalLead();
        }
    };

    // --- 7. GUARDAR LEAD (SOLO INFORMACIÓN Y TOTAL ESTIMADO, SIN PAGOS) ---
    window.guardarLead = async function() {
        const id = document.getElementById('lead-id').value;
        const nombre = document.getElementById('lead-nombre').value;
        const telefono = document.getElementById('lead-telefono').value;
        const estado = document.getElementById('lead-estado').value; 

        if(!nombre || !telefono) return showAlert("Nombre y Teléfono son obligatorios", "error");

        // Capturamos inputs básicos
        const fechaInput = document.getElementById('lead-fecha').value; 
        const horaInicio = document.getElementById('lead-hora-inicio').value;
        const horaFin = document.getElementById('lead-hora-fin').value;
        const vendedorInput = document.getElementById('lead-vendedor').value;
        
        // 🔥 NUEVO: Capturamos el DNI/RUC del input
        const inputDoc = document.getElementById('lead-documento');
        const documentoFinal = inputDoc ? inputDoc.value.trim() : '';
        
        // Capturamos la cantidad de niños parseada a entero (mínimo 1)
        const inputNinos = document.getElementById('lead-cantidad-ninos');
        const cantidadNinos = inputNinos ? parseInt(inputNinos.value) || 15 : 15;

        // Capturamos el Total Estimado (readonly en el modal)
        const valorEstimado = document.getElementById('lead-valor').value;

        // Limpiamos la nota antes de enviarla
        let notasLimpias = document.getElementById('lead-obs').value;
        notasLimpias = notasLimpias.replace(/Niños:\s*\d+\.?\s*/i, '').trim();

        // Armamos el objeto sincronizado con la base de datos
        const dataLead = {
            nombre_apoderado: nombre,
            documento: documentoFinal, // 🔥 SE ENVÍA EL DNI AL BACKEND
            telefono: telefono,
            email: document.getElementById('lead-email').value,
            canal_origen: document.getElementById('lead-canal').value,
            nombre_hijo: document.getElementById('lead-hijo').value,
            fecha_tentativa: fechaInput || null,
            hora_inicio: horaInicio,
            hora_fin: horaFin,
            sede_interes: document.getElementById('lead-sede').value ? parseInt(document.getElementById('lead-sede').value) : null,
            salon_id: document.getElementById('lead-sala').value ? parseInt(document.getElementById('lead-sala').value) : null,
            
            // Datos Clave
            paquete_interes: document.getElementById('lead-paquete').value, 
            cantidad_ninos: cantidadNinos, 
            valor_estimado: valorEstimado, 
            vendedor_id: vendedorInput ? parseInt(vendedorInput) : null,
            notas: notasLimpias, 
            estado: estado || 'nuevo' 
        };

        const btnGuardar = document.getElementById('btn-guardar-lead');
        const txtOriginal = btnGuardar ? btnGuardar.innerText : "Guardar Información";

        try {
            if(btnGuardar) {
                btnGuardar.disabled = true;
                btnGuardar.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Guardando...";
            }

            const token = localStorage.getItem('token');
            let url = '/api/crm';
            let method = 'POST';
            
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
                // Actualizar estado de forma independiente si es edición para gatillar lógica de eventos
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
                if (typeof cargarLeads === 'function') {
                    cargarLeads(); 
                }

            } else {
                const errorData = await res.json();
                showAlert("Error al guardar: " + (errorData.msg || "Error desconocido"), "error");
            }
        } catch(e) { 
            console.error("Error en guardarLead:", e); 
            showAlert("Error de conexión al guardar.", "error"); 
        } finally {
            if(btnGuardar) {
                btnGuardar.disabled = false;
                btnGuardar.innerText = txtOriginal;
            }
        }
    };
    
    // --- 8. ELIMINAR LEAD ---
    window.eliminarLead = async function(id) {
        if (!await showConfirm("¿Estás seguro de eliminar este lead? Todos los datos de eventos y pagos asociados se borrarán permanentemente.", "Confirmar Eliminación")) return;
        
        // 🛡️ TRUCO MAESTRO: Buscamos el tachito exacto que se presionó usando su ID
        const btn = document.querySelector(`button[onclick="eliminarLead(${id})"]`);
        const htmlOriginal = btn ? btn.innerHTML : "<i class='bx bx-trash'></i>";

        try {
            // Bloqueamos el botón y le ponemos el spinner de carga
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = "0.5";
                btn.style.cursor = "not-allowed";
                btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>"; 
            }

            // Le avisamos al usuario que este proceso toma tiempo por la SUNAT
            if (typeof showToast === 'function') {
                showToast("⏳ Eliminando lead y anulando en SUNAT. Por favor espera...", "info");
            }

            const token = localStorage.getItem('token');
            const res = await fetch(`/api/crm/${id}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': token }
            });

            if(res.ok) {
                if (typeof showToast === 'function') showToast("Lead eliminado correctamente.", "success");
                initCRM(); // Esto recargará la tabla automáticamente y desaparecerá la fila
            } else {
                const err = await res.json();
                if (typeof showAlert === 'function') showAlert(err.msg || "No se pudo eliminar el lead.", "error");
                
                // Si hubo error de validación, le devolvemos la vida al botón
                if (btn) {
                    btn.disabled = false;
                    btn.style.opacity = "1";
                    btn.style.cursor = "pointer";
                    btn.innerHTML = htmlOriginal;
                }
            }
        } catch(e) { 
            console.error(e); 
            if (typeof showAlert === 'function') showAlert("Error de conexión al eliminar.", "error");
            
            // Si se cae el internet, también restauramos el botón
            if (btn) {
                btn.disabled = false;
                btn.style.opacity = "1";
                btn.style.cursor = "pointer";
                btn.innerHTML = htmlOriginal;
            }
        }
    };

    // --- NUEVO: BUSCAR DOCUMENTO (DNI/RUC) EN EL MODAL DE CREACIÓN ---
    window.buscarDocumentoLeadCRM = async function() {
        const inputDoc = document.getElementById('lead-documento');
        const inputNom = document.getElementById('lead-nombre');
        const btnBuscar = document.querySelector('button[onclick="buscarDocumentoLeadCRM()"]');
        
        const numero = inputDoc.value.trim();

        if (!numero) {
            return showAlert("⚠️ Ingrese un DNI o RUC para buscar.", "warning");
        }

        if (numero.length !== 8 && numero.length !== 11) {
            return showAlert("⚠️ El documento debe tener 8 (DNI) u 11 (RUC) dígitos.", "warning");
        }

        // Efecto Loading
        const htmlOriginal = btnBuscar.innerHTML;
        btnBuscar.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
        btnBuscar.disabled = true;
        inputNom.placeholder = "Consultando base de datos...";

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/consultas/${numero}`, {
                headers: { 'x-auth-token': token }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                showToast(`✅ Datos obtenidos correctamente`, "success");
                inputNom.value = data.nombre;
                
                // Efecto visual de éxito
                inputNom.style.backgroundColor = "#ecfdf5";
                setTimeout(() => { inputNom.style.backgroundColor = ""; }, 1500);
            } else {
                showAlert("ℹ️ No se encontraron datos oficiales. Ingrese el nombre manualmente.", "info");
                inputNom.value = "";
                inputNom.focus();
            }
        } catch (error) {
            console.error("Error API Identidad:", error);
            showAlert("❌ El servicio de consultas no está disponible temporalmente.", "error");
        } finally {
            btnBuscar.innerHTML = htmlOriginal;
            btnBuscar.disabled = false;
            inputNom.placeholder = "Ej: María Pérez";
        }
    };

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
                selectSala.innerHTML = '<option value="" selected disabled>Seleccionar Sala</option>'; // 🔥 FIX AQUÍ
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

    // 🔥 CORRECCIÓN: Le agregamos "window." para que el HTML la pueda encontrar
    window.cargarProductosEnSelect = async function(sedeIdOpcional = null) {
        try {
            // 1. Buscamos qué sede está seleccionada. 
            // Si nos pasan el ID por parámetro lo usamos, si no, lo buscamos en el HTML
            let sedeId = sedeIdOpcional;
            if (!sedeId) {
                const selectSede = document.getElementById('lead-sede');
                if (selectSede && selectSede.value) {
                    sedeId = selectSede.value;
                }
            }

            // 2. Construimos la URL dinámica (Aquí se conecta con el Backend modificado)
            let urlFetch = '/api/inventario';
            if (sedeId) {
                urlFetch += `?sede=${sedeId}`;
            }

            // 3. Hacemos la petición
            const res = await fetch(urlFetch, { headers: { 'x-auth-token': localStorage.getItem('token') } });
            
            if(res.ok) {
                const data = await res.json();
                productosCache = data.productos || []; 
                
                // 🔥 FILTRO MÁGICO: Filtramos solo los que son de la línea o categoría de eventos
                const paquetesDeEventos = productosCache.filter(p => 
                    p.linea_negocio === 'EVENTOS' || 
                    (p.categoria && p.categoria.toLowerCase() === 'eventos')
                );
                
                const select = document.getElementById('lead-paquete');
                if (select) {
                    select.innerHTML = '<option value="">-- Seleccione Combo --</option>';
                    
                    // 🔥 Llenamos el cuadrito SOLO con el arreglo filtrado
                    paquetesDeEventos.forEach(p => {
                        const opt = document.createElement('option');
                        opt.value = p.id;
                        opt.innerText = `${p.nombre} (S/ ${parseFloat(p.precio_venta).toFixed(2)})`;
                        select.appendChild(opt);
                    });
                }
                return productosCache; // IMPORTANTE: Retornar para que el await funcione
            }
        } catch(e) { 
            console.error("Error cargando productos:", e); 
            return [];
        }
    }

    // =========================================================================
    // 1. CÁLCULO DEL TOTAL ESTIMADO (En tiempo real al Crear/Editar Lead)
    // =========================================================================
    window.calcularTotalLead = function() {
        console.log("Calculando total..."); 

        const prodSelect = document.getElementById('lead-paquete');
        const cantidadInput = document.getElementById('lead-cantidad-ninos');
        const inputTotal = document.getElementById('lead-valor');

        // 1. Validaciones de seguridad de existencia de elementos
        if (!prodSelect || !cantidadInput || !inputTotal) return;

        const prodId = prodSelect.value;
        
        // 2. Limpieza de cantidad (asegurar que sea número válido)
        let cantidad = parseInt(cantidadInput.value);
        if (isNaN(cantidad) || cantidad < 0) cantidad = 0;

        // 3. Si no hay producto seleccionado, el total es 0
        if (!prodId || prodId === "") {
            inputTotal.value = "0.00";
            return;
        }

        let precio = 0;

        // 4. Intento A: Buscar en el Cache de productos (Más preciso)
        if (typeof productosCache !== 'undefined' && productosCache.length > 0) {
            const producto = productosCache.find(p => p.id == prodId);
            if (producto) {
                precio = parseFloat(producto.precio_venta) || 0;
            }
        }

        // 5. Intento B: Si el cache falló o aún no carga, extraemos del texto del Select
        // Formato esperado en el HTML: "Nombre Producto (S/ 100.00)"
        if (precio === 0 && prodSelect.selectedIndex >= 0) {
            const optionText = prodSelect.options[prodSelect.selectedIndex].text;
            // Buscamos cualquier número que siga a "S/"
            const match = optionText.match(/S\/\s*([\d,.]+)/);
            if (match && match[1]) {
                // Limpiamos comas por si el formato tiene separador de miles
                precio = parseFloat(match[1].replace(/,/g, '')) || 0;
            }
        }

        // 6. Cálculo Final y formateo a 2 decimales
        const total = precio * cantidad;
        inputTotal.value = total.toFixed(2);
        
        console.log(`[Cálculo] Precio: ${precio} x Cantidad: ${cantidad} = Total: ${total}`);
    };

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
        // Buscamos el botón dentro del modal de cobro de saldo
        const modal = document.getElementById('modal-cobrar-saldo');
        const btn = modal.querySelector('button[onclick*="procesarCobroFinal"]');
        const originalText = btn.innerHTML;
        
        // 1. Captura de elementos del DOM
        const leadId = document.getElementById('cobro-lead-id').value;
        const ninosFinal = document.getElementById('cobro-ninos').value;
        const paqueteFinal = document.getElementById('cobro-paquete').value;
        const metodo = document.getElementById('cobro-metodo').value;
        const tipoComprobante = document.getElementById('cobro-tipo-comprobante').value;

        // 2. Lógica de Formato de Impresión (Captura desde el Select)
        const formatoFinal = document.getElementById('cobro-formato-impresion').value;

        // Bloqueo visual del botón
        btn.disabled = true;
        btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Procesando Pago...`;

        try {
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
                    metodoPago: metodo,
                    tipo_comprobante: tipoComprobante,
                    // 🔥 ENVIAMOS AMBOS NOMBRES PARA BLINDAR LA COMUNICACIÓN
                    formato_pdf: formatoFinal,      
                    formato_impresion: formatoFinal 
                })
            });

            const data = await res.json();

            if (res.ok) {
                // Notificación de éxito
                await showAlert(data.msg || "Cobro finalizado con éxito", "success");
                
                // Cerrar modales y refrescar tabla
                cerrarModalCobroFinal();
                if (typeof cerrarModalLead === "function") cerrarModalLead(); 
                if (typeof cargarLeads === "function") cargarLeads(); 
                
                // 🔥 APERTURA DINÁMICA DEL COMPROBANTE
                // Prioridad 1: URL directa devuelta por el facturador (Nubefact)
                if (data.pdf_url) {
                    window.open(data.pdf_url, '_blank');
                } 
                // Prioridad 2: Construcción de ruta interna con ID de venta y formato seleccionado
                else if (data.venta_id) {
                    window.open(`/api/ventas/${data.venta_id}/pdf?formato=${formatoFinal}`, '_blank');
                }
                
            } else {
                // Error devuelto por el servidor (ej: falta stock o error de SUNAT)
                await showAlert(data.msg || "Error al procesar el cobro", "error");
            }

        } catch (error) {
            console.error("Error en cobro final:", error);
            await showAlert("Error de conexión al procesar el cobro final.", "error");
        } finally {
            // Restaurar estado del botón
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
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

    // =========================================================================
    // 🚀 GESTOR DE HISTORIAL DE PAGOS (FRONTEND)
    // =========================================================================
    
    window.verHistorialPagosLead = async function(id) {
        const lead = leadsGlobales.find(l => l.id == id);
        if (!lead) return;

        // 1. Referencias al DOM del modal de historial
        const tbody = document.getElementById('historial-pagos-body');
        const emptyState = document.getElementById('historial-empty');
        const txtTotal = document.getElementById('historial-total-monto');
        
        // 🔥 REFERENCIAS PARA EL NUEVO DASHBOARD ENRIQUECIDO
        const txtCliente = document.getElementById('hist-cliente-nombre');
        const txtTelefono = document.getElementById('hist-cliente-telefono');
        const txtPaquete = document.getElementById('hist-paquete');
        const txtNinos = document.getElementById('hist-ninos');
        const txtSedeSala = document.getElementById('hist-sede-sala');
        const txtFechaHora = document.getElementById('hist-fecha-hora');
        const txtCosto = document.getElementById('hist-costo-total');
        const txtSaldo = document.getElementById('hist-saldo');

        // 2. Estado inicial de carga y llenado del Dashboard
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;"><i class="bx bx-loader-alt bx-spin"></i> Cargando historial detallado...</td></tr>';
        
        txtCliente.innerText = lead.nombre_apoderado || 'Sin nombre';
        txtTelefono.innerText = lead.telefono || 'Sin teléfono';
        
        txtPaquete.innerText = lead.nombre_paquete || 'Paquete no seleccionado';
        txtNinos.innerText = lead.cantidad_ninos ? `${lead.cantidad_ninos} Niños` : 'Cantidad no definida';

        // Formateamos Fecha asegurando que se vea bien
        let fechaLimpia = 'Fecha no definida';
        if (lead.fecha_tentativa) {
             const partes = lead.fecha_tentativa.split('T')[0].split('-'); 
             if (partes.length === 3) fechaLimpia = `${partes[2]}/${partes[1]}/${partes[0]}`;
        }

        const horaInicio = lead.hora_inicio ? lead.hora_inicio.substring(0, 5) : '--:--';
        const horaFin = lead.hora_fin ? lead.hora_fin.substring(0, 5) : '--:--';
        
        // Buscamos nombres de Sede y Sala desde los selectores
        const selectSede = document.getElementById('lead-sede');
        const selectSala = document.getElementById('lead-sala');
        let nombreSede = 'Sede no definida';
        let nombreSala = '';
        
        if (selectSede && lead.sede_interes) {
            const optSede = selectSede.querySelector(`option[value="${lead.sede_interes}"]`);
            if (optSede) nombreSede = optSede.text;
        }
        if (selectSala && lead.salon_id) {
            const optSala = selectSala.querySelector(`option[value="${lead.salon_id}"]`);
            if (optSala) nombreSala = ` - ${optSala.text}`;
        }

        txtSedeSala.innerText = `${nombreSede}${nombreSala}`;
        txtFechaHora.innerText = `${fechaLimpia} (${horaInicio} a ${horaFin})`;

        // Finanzas iniciales
        const valorEstimado = parseFloat(lead.valor_estimado || 0);
        txtCosto.innerText = `S/ ${valorEstimado.toFixed(2)}`;
        txtTotal.innerText = "S/ 0.00";
        txtSaldo.innerText = "Calculando...";
        txtSaldo.style.color = "#64748b"; // Color gris por defecto
        emptyState.style.display = 'none';

        // 3. Abrir modal
        document.getElementById('modal-historial-pagos').classList.add('active');

        // 4. Traer los pagos del servidor
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/crm/${id}/pagos`, {
                headers: { 'x-auth-token': token }
            });

            if (!res.ok) throw new Error("Error en la respuesta del servidor");

            const pagos = await res.json();
            tbody.innerHTML = '';

            // Si no hay pagos, mostramos el saldo completo como deuda
            if (pagos.length === 0) {
                emptyState.style.display = 'block';
                txtSaldo.innerText = `S/ ${valorEstimado.toFixed(2)}`;
                txtSaldo.style.color = "#ef4444"; // Rojo porque debe todo
                return;
            }

            let sumaTotal = 0;

            // Llenar tabla de pagos
            pagos.forEach(p => {
                const monto = parseFloat(p.monto) || 0;
                sumaTotal += monto;

                // Formateo de fecha local
                const fecha = new Date(p.fecha_pago).toLocaleString('es-PE', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit'
                });

                // Estilos dinámicos según el tipo de abono
                const tipoColor = p.tipo_pago === 'RESERVA' ? '#3b82f6' : '#10b981';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="color: #64748b;">${fecha}</td>
                    <td>
                        <div style="display:flex; flex-direction:column;">
                            <strong style="color: #1e293b;">S/ ${monto.toFixed(2)}</strong>
                            <small style="color: #94a3b8; font-size:10px; font-weight:600; text-transform: uppercase;">
                                ${p.comprobante_tipo || 'TICKET'}: ${p.documento_usado || '---'}
                            </small>
                        </div>
                    </td>
                    <td>
                        <div style="display:flex; flex-direction:column;">
                            <span style="text-transform: uppercase; font-weight:600; font-size:11px; color: #475569;">${p.metodo_pago}</span>
                            <small style="color: #94a3b8;">Op: ${p.nro_operacion || 'N/A'}</small>
                        </div>
                    </td>
                    <td>
                        <span class="badge" style="background: ${tipoColor}15; color: ${tipoColor}; border: 1px solid ${tipoColor}30; font-size:10px; padding: 2px 6px;">
                            ${p.tipo_pago}
                        </span>
                    </td>
                    <td style="color: #64748b; font-size:12px;">${p.usuario_recibio}</td>
                `;
                tbody.appendChild(tr);
            });

            // 5. Cálculos Finales
            txtTotal.innerText = `S/ ${sumaTotal.toFixed(2)}`;

            let saldoRestante = valorEstimado - sumaTotal;
            if (saldoRestante <= 0) {
                txtSaldo.innerText = "S/ 0.00 (Pagado)";
                txtSaldo.style.color = "#10b981"; // Verde porque está pagado
            } else {
                txtSaldo.innerText = `S/ ${saldoRestante.toFixed(2)}`;
                txtSaldo.style.color = "#ef4444"; // Rojo porque aún debe
            }

        } catch (error) {
            console.error("Error cargando historial:", error);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#ef4444; padding:20px;">Hubo un problema al obtener los pagos.</td></tr>';
        }
    };

    window.cerrarModalHistorial = function() {
        document.getElementById('modal-historial-pagos').classList.remove('active');
    };

    // =========================================================================
    // 🔥 2. NUEVO GESTOR DE PAGOS PRO (ESTILO POS) 🔥
    // =========================================================================
    
    let leadActualParaPagos = null;

    window.cambiarTipoDocumentoPago = function() {
        const tipo = document.getElementById('pago-tipo-comprobante').value;
        const labelDoc = document.getElementById('label-doc-pago');
        const labelNom = document.getElementById('label-nom-pago');
        const inputDoc = document.getElementById('pago-documento');
        const inputNom = document.getElementById('pago-nombre-cliente');

        // Reset de estados visuales
        inputDoc.value = '';
        inputNom.readOnly = false;
        inputNom.style.backgroundColor = "#fff";
        inputNom.placeholder = "Nombre para el comprobante";

        if (tipo === 'FACTURA') {
            labelDoc.innerHTML = 'RUC <span class="req">*</span>';
            labelNom.innerHTML = 'Razón Social <span class="req">*</span>';
            inputDoc.placeholder = "Ingrese RUC (11 dígitos)";
            inputDoc.maxLength = 11; // 🔥 Limita la entrada
            inputNom.value = ''; 
        } else if (tipo === 'BOLETA') {
            labelDoc.innerHTML = 'DNI <span class="req">*</span>';
            labelNom.innerHTML = 'Nombre Completo <span class="req">*</span>';
            inputDoc.placeholder = "Ingrese DNI (8 dígitos)";
            inputDoc.maxLength = 8; // 🔥 Limita la entrada
            inputNom.value = leadActualParaPagos ? leadActualParaPagos.nombre_apoderado : '';
        }
    };

    window.abrirModalPagos = async function(id) {
        // 1. Buscamos el Lead en memoria
        const lead = leadsGlobales.find(l => l.id == id);
        if (!lead) return showAlert("Error: Lead no encontrado.", "error");

        leadActualParaPagos = lead;

        // 2. Limpiar formulario anterior
        document.getElementById('form-registrar-pago').reset();
        document.getElementById('pago-lead-id').value = lead.id;
        
        // 3. Traer catálogos de productos si no están cargados
        if (productosCache.length === 0) {
            await cargarProductosEnSelect();
        }

        // Cargar por defecto Boleta/Nota y el nombre del cliente
        document.getElementById('pago-tipo-comprobante').value = 'BOLETA';
        if (typeof cambiarTipoDocumentoPago === 'function') cambiarTipoDocumentoPago(); 

        // 🔥 CORRECCIÓN: Prioridad al dato real de cantidad_ninos
        let ninosReales = parseInt(lead.cantidad_ninos);
        
        // Si el dato es inválido (0, nulo o NaN), intentamos extraerlo de las notas o usamos 15 como fallback
        if (!ninosReales || isNaN(ninosReales)) {
            if (lead.notas && lead.notas.includes("Niños:")) {
                const match = lead.notas.match(/Niños:\s*(\d+)/);
                ninosReales = match ? parseInt(match[1]) : 15;
            } else {
                ninosReales = 15; 
            }
        }

        // 4. Calcular los montos reales
        let precioUnitario = 0;
        let nombrePaquete = "Sin paquete seleccionado";
        
        if (lead.paquete_interes) {
            const prod = productosCache.find(p => p.id == lead.paquete_interes);
            if (prod) {
                precioUnitario = parseFloat(prod.precio_venta);
                nombrePaquete = prod.nombre;
            }
        }

        // Determinar el costo total
        let costoTotalEstimado = parseFloat(lead.valor_estimado || 0);
        if (costoTotalEstimado === 0) {
            costoTotalEstimado = precioUnitario * ninosReales;
        }

        // 5. Lo que ya pagó y lo que debe
        // 🔥 CORRECCIÓN: Validamos múltiples posibles nombres del campo (pago_inicial o acuenta)
        const yaPagado = parseFloat(lead.pago_inicial || lead.acuenta || 0);
        
        let costoTotalNum = parseFloat(costoTotalEstimado) || 0;
        let saldoActual = costoTotalNum - yaPagado;
        
        if (saldoActual < 0) saldoActual = 0;

        // 6. Pintar en el Resumen Visual (Modal)
        document.getElementById('pago-nombre-paquete').textContent = nombrePaquete;
        document.getElementById('pago-cantidad-ninos').textContent = ninosReales;
        document.getElementById('pago-total-estimado').textContent = `S/ ${costoTotalNum.toFixed(2)}`;
        document.getElementById('pago-ya-pagado').textContent = `S/ ${yaPagado.toFixed(2)}`;
        
        // 🔥 IMPORTANTE: Aquí mostramos el saldo real antes de restar el abono de hoy
        document.getElementById('pago-saldo-pendiente').textContent = `S/ ${saldoActual.toFixed(2)}`;
        document.getElementById('pago-saldo-pendiente').style.color = "#dc3545"; // Rojo inicial

        // 7. Sugerir el monto a abonar hoy
        const inputMonto = document.getElementById('abono-monto');
        if (yaPagado === 0 && costoTotalEstimado > 0) {
            inputMonto.value = (costoTotalEstimado / 2).toFixed(2); // Sugiere 50%
        } else {
            // Si ya hay pagos, sugerimos 0 o el saldo, pero sin disparar la resta visual inmediata
            inputMonto.value = ""; 
            inputMonto.placeholder = saldoActual.toFixed(2);
        }

        // 8. Mostrar el Modal
        document.getElementById('modal-pagos-lead').classList.add('active');

        // Solo actualizamos en vivo si el usuario empieza a escribir, 
        // para que no vea "Saldo 0" al abrir el modal.
        inputMonto.focus();
    };

    window.actualizarResumenPagoEnVivo = function() {
        // 1. Verificación de seguridad
        if (!leadActualParaPagos) {
            console.warn("⚠️ No hay un lead cargado para calcular el abono.");
            return;
        }

        // 2. Obtener elementos
        const modal = document.getElementById('modal-pagos-lead');
        if (!modal) return;

        const inputMonto = modal.querySelector('#abono-monto');
        const txtSaldoPendiente = modal.querySelector('#pago-saldo-pendiente');
        
        // 3. Obtener los valores base (Priorizando datos de la BD o cálculos de paquete)
        let precioUnitario = 0;
        if (leadActualParaPagos.paquete_interes && productosCache) {
            const prod = productosCache.find(p => p.id == leadActualParaPagos.paquete_interes);
            if (prod) precioUnitario = parseFloat(prod.precio_venta);
        }

        let ninos = parseInt(leadActualParaPagos.cantidad_ninos) || 15;
        if (leadActualParaPagos.notas && leadActualParaPagos.notas.includes("Niños:")) {
            const match = leadActualParaPagos.notas.match(/Niños:\s*(\d+)/);
            if (match) ninos = parseInt(match[1]);
        }

        // Calculamos el Costo Total
        let totalEstimado = precioUnitario * ninos;
        if (totalEstimado === 0) {
            totalEstimado = parseFloat(leadActualParaPagos.valor_estimado) || 0;
        }

        // 🔥 IMPORTANTE: Validamos ambos nombres posibles del campo de pago previo
        const yaPagado = parseFloat(leadActualParaPagos.pago_inicial || leadActualParaPagos.acuenta || 0);
        const abonoHoy = parseFloat(inputMonto.value) || 0;

        // 4. Calcular el Saldo que quedará DESPUÉS de pagar lo que está en el input
        const deudaAntesDeHoy = totalEstimado - yaPagado;
        let saldoResultante = deudaAntesDeHoy - abonoHoy;
        
        // Evitamos saldos negativos si el usuario escribe de más
        if (saldoResultante < 0) saldoResultante = 0;

        // 5. Pintar el resultado en el modal con lógica de colores
        if (txtSaldoPendiente) {
            txtSaldoPendiente.innerText = `S/ ${saldoResultante.toFixed(2)}`;
            
            // 🔥 VALIDACIÓN DE EXCESO VISUAL
            const btnPagar = modal.querySelector('#btn-procesar-abono');
            const deudaReal = totalEstimado - yaPagado;

            if (abonoHoy > (deudaReal + 0.01)) {
                // Si se excede, ponemos el saldo en rojo brillante y bloqueamos el botón
                txtSaldoPendiente.style.color = "#ff0000";
                txtSaldoPendiente.innerHTML = `<i class='bx bx-error-circle'></i> Excede el saldo (Máx: S/ ${deudaReal.toFixed(2)})`;
                if (btnPagar) btnPagar.disabled = true;
            } else {
                // Si el monto es correcto, habilitamos el botón y aplicamos tus colores originales
                if (btnPagar) btnPagar.disabled = false;

                if (saldoResultante === 0 && totalEstimado > 0) {
                    txtSaldoPendiente.style.color = "#28a745"; // Verde
                    txtSaldoPendiente.style.fontWeight = "bold";
                } else if (abonoHoy > 0) {
                    txtSaldoPendiente.style.color = "#007bff"; // Azul
                    txtSaldoPendiente.style.fontWeight = "bold";
                } else {
                    txtSaldoPendiente.style.color = "#dc3545"; // Rojo estándar
                    txtSaldoPendiente.style.fontWeight = "normal";
                }
            }
        }
        
        console.log(`[DEBUG] Total:${totalEstimado} | Previo:${yaPagado} | Input:${abonoHoy} | Final:${saldoResultante}`);
    };

    window.cerrarModalPagos = function() {
        document.getElementById('modal-pagos-lead').classList.remove('active');
    };

    window.buscarDocumentoPagoLead = async function(event) {
        // Prevenir que el botón haga submit del formulario
        if(event) event.preventDefault(); 
        
        // 🔥 CORRECCIÓN: Manejo seguro del botón (currentTarget o fallback al selector)
        const btn = event ? event.currentTarget : document.querySelector('#modal-pagos-lead .btn-primary[onclick*="buscarDocumentoPagoLead"]');
        
        const tipoComprobante = document.getElementById('pago-tipo-comprobante').value;
        const inputDocumento = document.getElementById('pago-documento');
        const inputNombre = document.getElementById('pago-nombre-cliente');
        
        const numero = inputDocumento.value.trim();
        const token = localStorage.getItem('token');

        // --- Validaciones de Longitud según Comprobante ---
        if (!numero) return showAlert("⚠️ Ingrese un número para buscar.", "warning");

        if (tipoComprobante === 'FACTURA' && numero.length !== 11) {
            return showAlert("⚠️ Para Factura, el RUC debe tener 11 dígitos.", "error");
        }
        
        if (tipoComprobante === 'BOLETA' && numero.length !== 8) {
            return showAlert("⚠️ Para Boleta, el DNI debe tener 8 dígitos.", "error");
        }

        // Efecto Loading específico en el botón lupa
        const originalHtml = btn.innerHTML;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
        btn.disabled = true;

        inputNombre.placeholder = "Consultando base de datos...";
        inputNombre.value = "";

        try {
            const res = await fetch(`/api/consultas/${numero}`, {
                headers: { 'x-auth-token': token }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                showToast(`✅ Datos obtenidos correctamente`, "success");
                inputNombre.value = data.nombre;
                inputNombre.readOnly = true; 
                inputNombre.style.backgroundColor = "#dcfce7"; 
            } else {
                showAlert("ℹ️ No se encontraron datos oficiales. Ingrese manualmente.", "info");
                inputNombre.readOnly = false;
                inputNombre.style.backgroundColor = "#fff";
                inputNombre.focus(); 
            }
        } catch (error) {
            console.error("Error API Identidad:", error);
            showAlert("❌ El servicio de consultas no está disponible.", "error");
            inputNombre.readOnly = false;
        } finally {
            btn.innerHTML = originalHtml;
            btn.disabled = false;
        }
    };

    // Procesar el Pago al Backend
    window.procesarPagoLead = async function() {
        const leadId = document.getElementById('pago-lead-id').value;
        const montoAbono = document.getElementById('abono-monto').value;
        const metodo = document.getElementById('abono-metodo').value;
        const referencia = document.getElementById('abono-referencia').value;
        
        // 🔥 CORRECCIÓN DEFINITIVA: Captura desde Radio Buttons (fmt_cuota)
        // Eliminamos la variable 'selectFormato' que causaba el error
        const radioFmt = document.querySelector('input[name="fmt_cuota"]:checked');
        const formatoFinal = radioFmt ? radioFmt.value : "3"; // '3' es Ticket por defecto

        // Datos del Comprobante
        const tipoComprobante = document.getElementById('pago-tipo-comprobante').value;
        const documentoCliente = document.getElementById('pago-documento').value;
        const nombreCliente = document.getElementById('pago-nombre-cliente').value;

        const montoFloat = parseFloat(montoAbono);

        // 1. Validación de monto mayor a 0
        if (!montoAbono || parseFloat(montoAbono) <= 0) {
            await showAlert("⚠️ Ingresa un monto a pagar mayor a 0", "error");
            return; 
        }

        // 🔥 2. VALIDACIÓN CRÍTICA SUNAT (Monto >= 700)
        if ((tipoComprobante === 'BOLETA' || tipoComprobante === 'FACTURA') && montoFloat >= 700) {
            if (!documentoCliente || documentoCliente.length < 8) {
                await showAlert(
                    `⛔ Validación SUNAT: Para montos de S/ 700.00 o más, es obligatorio registrar un DNI o RUC. Por favor, realice la búsqueda del documento.`, 
                    "error"
                );
                document.getElementById('pago-documento').focus();
                return;
            }
        }

        // 3. Validación de Saldo Pendiente
        const totalEstimado = parseFloat(leadActualParaPagos.valor_estimado) || 0;
        const yaPagado = parseFloat(leadActualParaPagos.pago_inicial || leadActualParaPagos.acuenta || 0);
        const saldoPendienteReal = totalEstimado - yaPagado;
        const montoAbonarFloat = parseFloat(montoAbono);

        if (montoAbonarFloat > (saldoPendienteReal + 0.01)) { 
            await showAlert(`❌ No se puede cobrar S/ ${montoAbonarFloat.toFixed(2)} porque supera el saldo pendiente de S/ ${saldoPendienteReal.toFixed(2)}`, "error");
            return;
        }
        
        // --- Si pasa las validaciones, procedemos con el estado de carga ---
        const btn = document.getElementById('btn-procesar-abono');
        const originalText = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Generando Comprobante...`;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/crm/leads/${leadId}/pagar`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-token': token 
                },
                body: JSON.stringify({
                    monto: montoAbono,
                    metodoPago: metodo,
                    nroOperacion: referencia,
                    formato_pdf: formatoFinal, // 🔥 CORRECCIÓN: Cambiar formato_pdf por formato_impresion
                    comprobante: {
                        tipo: tipoComprobante,
                        documento: documentoCliente,
                        nombre: nombreCliente
                    }
                })
            });

            const data = await res.json();

            if (res.ok) {
                showToast(data.msg || "Cobro registrado correctamente.", "success");
                cerrarModalPagos();
                initCRM(); 

                // 🔥 APERTURA DEL PDF: Respetando el formato seleccionado
                if (data.pdf_url) {
                    window.open(data.pdf_url, '_blank');
                } else if (data.venta_id) {
                    window.open(`/api/ventas/${data.venta_id}/pdf?formato=${formatoFinal}`, '_blank');
                }

            } else {
                await showAlert(data.msg || "Error al procesar el pago.", "error");
            }

        } catch (error) {
            console.error(error);
            await showAlert("Error de conexión al generar el comprobante.", "error");
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
            alert("❌ " + mensaje);
        }
    }

    // Exponemos ambas variaciones de mayúsculas por si el router es estricto
    window.initCrm = function() {
        console.log("▶️ Iniciando módulo CRM...");
        initCRM();
    };
    
    // Alias por si el router busca todo en mayúsculas
    window.initCRM = window.initCrm;

    // Fallback: Si la página se recarga manualmente (F5) estando en esta vista
    if (document.getElementById('crm-table-body')) {
        window.initCrm();
    }

})();