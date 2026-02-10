// Ubicacion: frontend/modules/terceros/terceros.js

(function() {
    console.log("Modulo Terceros/Canje Activo 🤝");

    // Variables Globales
    let canales = [];
    let acuerdos = [];
    let productos = [];
    
    // Variables para Códigos
    let listaCodigosCompleta = [];
    let listaCodigosFiltrada = [];
    let paginaCodigos = 1;
    const itemsPorPaginaCodigos = 20;

    let historialHoyCache = []; // Guardamos todos los de hoy aquí
    let pagMiniActual = 1;
    const itemsMini = 5; // Mostrar solo 5 en el widget pequeño

    let pagHistorialTotal = 1; // Para el modal grande

    // Variables para Paginación de Acuerdos
    let paginaActual = 1;
    const itemsPorPagina = 5;

    async function initTerceros() {
        await cargarCanales();
        await cargarProductos();
        await cargarAcuerdos(); 
        await cargarHistorialCanjes(); 

        const inputCanje = document.getElementById('input-codigo-canje');
        if(inputCanje) {
            inputCanje.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') validarCodigo();
            });
            inputCanje.focus();
        }
    }

    // --- 1. UI FORMULARIO (MOSTRAR/OCULTAR CUOTAS) ---
    window.toggleCuotas = function(val) {
        const div = document.getElementById('div-cuotas');
        if(val === 'custom') {
            div.style.display = 'block';
            document.getElementById('new-num-cuotas').value = 2; 
        } else {
            div.style.display = 'none';
            document.getElementById('new-num-cuotas').value = 1;
        }
    }

    // --- 2. GESTIÓN DE ACUERDOS ---
    async function cargarAcuerdos() {
        try {
            const res = await fetch('/api/terceros/acuerdos', { headers: {'x-auth-token': localStorage.getItem('token')} });
            if(res.ok) {
                acuerdos = await res.json();
                paginaActual = 1;
                actualizarVistaTabla();
                llenarSelectAcuerdos(acuerdos);
            }
        } catch(e) { console.error(e); }
    }

    window.cambiarPagina = function(direccion) {
        const totalPaginas = Math.ceil(acuerdos.length / itemsPorPagina);
        const nuevaPagina = paginaActual + direccion;
        if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
            paginaActual = nuevaPagina;
            actualizarVistaTabla();
        }
    }

    function actualizarVistaTabla() {
        const inicio = (paginaActual - 1) * itemsPorPagina;
        const fin = inicio + itemsPorPagina;
        const acuerdosPagina = acuerdos.slice(inicio, fin);
        renderizarTablaAcuerdos(acuerdosPagina, inicio);

        const totalPaginas = Math.ceil(acuerdos.length / itemsPorPagina) || 1;
        document.getElementById('page-info').innerText = `Página ${paginaActual} de ${totalPaginas}`;
        document.getElementById('btn-prev').disabled = (paginaActual === 1);
        document.getElementById('btn-next').disabled = (paginaActual === totalPaginas);
    }

    function renderizarTablaAcuerdos(lista, indiceInicial = 0) {
        const tbody = document.getElementById('tabla-acuerdos-body');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        if(lista.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="empty-state-table">No hay acuerdos registrados.</td></tr>';
            return;
        }

        lista.forEach((a, index) => {
            const numeroFila = indiceInicial + index + 1;
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>#${numeroFila}</strong> <br><small style="color:#94a3b8; font-size:10px;">(Ref: ${a.id})</small></td>
                <td><strong>${a.empresa}</strong></td>
                <td>${a.descripcion}</td>
                <td>${a.cantidad_entradas}</td>
                <td>S/ ${parseFloat(a.monto_total_acuerdo).toFixed(2)}</td>
                <td>
                    <div style="display:flex; gap:5px;">
                        <button class="btn-sm" style="background:#3b82f6; color:white;" onclick="verDetalleAcuerdo(${a.id})" title="Ver Progreso">
                            <i class='bx bx-pie-chart-alt-2'></i>
                        </button>
                        <button class="btn-sm" style="background:#8b5cf6; color:white;" onclick="verCodigosAcuerdo(${a.id})" title="Ver Lista">
                            <i class='bx bx-list-ul'></i>
                        </button>
                        <button class="btn-sm" style="background:#10b981; color:white;" onclick="abrirModalPagos(${a.id}, '${a.empresa}')" title="Gestionar Pagos">
                            <i class='bx bx-dollar-circle'></i>
                        </button>
                        <button class="btn-sm" style="background:#ef4444; color:white;" onclick="eliminarAcuerdo(${a.id})" title="Eliminar">
                            <i class='bx bx-trash'></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- 3. CREAR NUEVO ACUERDO (VERSIÓN BLINDADA SIN ALERTS) ---
    const formAcuerdo = document.getElementById('form-acuerdo');
    if (formAcuerdo) {
        formAcuerdo.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 🛡️ RECOLECCIÓN DE DATOS
            const canalId = document.getElementById('new-canal').value;
            const desc = document.getElementById('new-desc').value.trim();
            const cant = document.getElementById('new-cant').value;
            const precio = document.getElementById('new-precio').value;
            const prodId = document.getElementById('new-producto').value;
            const condicion = document.getElementById('new-condicion').value;

            let cuotas = 1;
            if (condicion === 'custom') {
                cuotas = document.getElementById('new-num-cuotas').value;
            }

            // 🛡️ VALIDACIONES PREVIAS (BLINDAJE DE INTERFAZ)
            if (!canalId) return showToast("Debe seleccionar un Canal o Socio comercial.", "warning");
            if (!desc) return showToast("Ingrese una descripción para el acuerdo.", "warning");
            if (!cant || cant <= 0) return showToast("La cantidad de entradas debe ser mayor a 0.", "warning");
            if (!precio || precio <= 0) return showToast("El precio unitario debe ser válido.", "warning");
            if (!prodId) return showToast("Debe seleccionar un producto del inventario para descontar stock.", "warning");

            // Estado de carga visual en el botón
            const btnSubmit = formAcuerdo.querySelector('button[type="submit"]');
            const textoOriginal = btnSubmit.innerHTML;
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Procesando...";

            try {
                const res = await fetch('/api/terceros/acuerdos', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json', 
                        'x-auth-token': localStorage.getItem('token') 
                    },
                    body: JSON.stringify({
                        canal_id: canalId,
                        descripcion: desc,
                        cantidad: parseInt(cant),
                        precio_unitario: parseFloat(precio),
                        producto_id: prodId,
                        numero_cuotas: parseInt(cuotas)
                    })
                });

                const data = await res.json();

                if (res.ok) {
                    // ✅ ÉXITO
                    showToast("✅ Acuerdo registrado. Ya puede gestionar los pagos y cargar los códigos.", "success", "Acuerdo B2B");
                    cerrarModalAcuerdo();
                    formAcuerdo.reset(); // Limpiar formulario
                    if (typeof cargarAcuerdos === 'function') await cargarAcuerdos();
                } else {
                    // ❌ ERROR DE SERVIDOR
                    showToast(data.error || "No se pudo registrar el acuerdo comercial.", "error");
                }

            } catch (e) {
                console.error("Error al registrar acuerdo:", e);
                showToast("Error de conexión con el servidor.", "error");
            } finally {
                // Restaurar botón
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = textoOriginal;
            }
        });
    }

// --- 4. GESTIÓN DE PAGOS Y CUOTAS (ACTUALIZADO) ---
    window.abrirModalPagos = async function(id, empresa) {
        const modal = document.getElementById('modal-pagos');
        const tbody = document.getElementById('tabla-cuotas-body');
        document.getElementById('titulo-acuerdo-pagos').innerText = `Gestión de Pagos: ${empresa}`;
        
        if(modal) modal.classList.add('active');
        tbody.innerHTML = '<tr><td colspan="5">Cargando...</td></tr>';

        try {
            const res = await fetch(`/api/terceros/acuerdos/${id}/cuotas`, {
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            const cuotas = await res.json();
            
            tbody.innerHTML = '';
            if(cuotas.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5">No hay cuotas registradas.</td></tr>';
                return;
            }

            cuotas.forEach(c => {
                // Formatear fecha para que no de error en el input type="date"
                const fechaInput = new Date(c.fecha_vencimiento).toISOString().split('T')[0];
                const fechaVisual = new Date(c.fecha_vencimiento).toLocaleDateString();
                const esPagado = c.estado === 'PAGADO';
                
                let accionesHtml = '';

                if (esPagado) {
                    accionesHtml = `<span style="color:#16a34a; font-weight:bold;"><i class='bx bx-check-double'></i> Pagado</span>`;
                } else {
                    // Botón Cobrar (Verde) -> Abre Modal Confirmación
                    accionesHtml += `<button class="btn-sm" style="background:#10b981; color:white; border:none; margin-right:5px;" onclick="abrirConfirmacionPago(${c.id}, ${c.monto})" title="Cobrar"><i class='bx bx-dollar'></i></button>`;
                    
                    // Botón Editar (Gris) -> Abre Modal Edición
                    accionesHtml += `<button class="btn-sm" style="background:#64748b; color:white; border:none;" onclick="editarMontoCuota(${c.id}, ${c.monto}, '${fechaInput}')" title="Editar Monto/Fecha"><i class='bx bx-pencil'></i></button>`;
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${c.numero_cuota}</td>
                    <td>${fechaVisual}</td>
                    <td style="font-weight:bold;">S/ ${parseFloat(c.monto).toFixed(2)}</td>
                    <td><span class="${esPagado ? 'badge-success' : 'badge-warning'}" style="padding:2px 6px; border-radius:4px; font-size:0.75rem; background:${esPagado?'#dcfce7':'#fef9c3'}; color:${esPagado?'#166534':'#854d0e'};">${c.estado}</span></td>
                    <td>${accionesHtml}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch(e) { console.error(e); }
    }

    // B. GUARDAR CAMBIOS DE EDICIÓN (Llamada al Backend)
    window.guardarEdicionCuota = async function() {
        const id = document.getElementById('edit-cuota-id').value;
        const nuevoMontoInput = document.getElementById('edit-monto');
        const nuevaFechaInput = document.getElementById('edit-fecha');
        
        const nuevoMonto = parseFloat(nuevoMontoInput.value);
        const nuevaFecha = nuevaFechaInput.value;

        // 🛡️ BLINDAJE DE INTERFAZ: Validaciones iniciales
        if (isNaN(nuevoMonto) || nuevoMonto <= 0) {
            return showToast("El monto debe ser un número válido y mayor a 0.", "warning");
        }
        if (!nuevaFecha) {
            return showToast("La fecha de vencimiento es obligatoria.", "warning");
        }

        const fechaHoy = new Date().toISOString().split('T')[0];
        if (nuevaFecha < fechaHoy) {
             // Opcional: Advertencia suave en lugar de error
             showToast("⚠️ Estás asignando una fecha pasada. Asegúrate de que sea correcto.", "warning");
        }

        // Identificar el botón que disparó el evento para el feedback visual
        const btn = event.currentTarget;
        const textoOriginal = btn.innerHTML;
        
        // Bloquear controles mientras procesa
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Guardando...";
        btn.disabled = true;

        try {
            const res = await fetch(`/api/terceros/cuotas/${id}`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-auth-token': localStorage.getItem('token') 
                },
                body: JSON.stringify({ 
                    nuevo_monto: nuevoMonto, 
                    nueva_fecha: nuevaFecha 
                })
            });

            const data = await res.json();

            if (res.ok) {
                // ✅ ÉXITO
                cerrarModalEdicion();
                
                // Cerramos también el modal de lista de pagos para forzar la recarga 
                // de la lógica de saldos que el backend acaba de recalcular
                cerrarModalPagos(); 
                
                showToast("✅ Cuota actualizada. El saldo se ha redistribuido correctamente.", "success", "Ajuste de Pagos");
                
                // Refrescar la tabla principal por si cambiaron los totales
                if (typeof cargarAcuerdos === 'function') await cargarAcuerdos();
                
            } else {
                // ❌ ERROR DE LÓGICA (Ej: Intentar editar una cuota ya pagada)
                showToast(data.error || "No se pudo actualizar la cuota.", "error");
            }

        } catch (e) { 
            console.error("Error al editar cuota:", e); 
            showToast("Error de conexión con el servidor.", "error"); 
        } finally {
            // Restaurar estado del botón
            btn.innerHTML = textoOriginal;
            btn.disabled = false;
        }
    };

    window.cerrarModalEdicion = function() {
        document.getElementById('modal-editar-cuota').classList.remove('active');
    }

    // C. ABRIR CONFIRMACIÓN DE PAGO
    window.abrirConfirmacionPago = function(id, monto) {
        document.getElementById('conf-cuota-id').value = id;
        // Mostrar el monto bonito en el modal
        document.getElementById('conf-monto').innerHTML = "S/ " + parseFloat(monto).toFixed(2);
        document.getElementById('modal-confirmar-pago').classList.add('active');
    }

   // 3. EJECUTAR PAGO (ACTUALIZADO PARA ENVIAR DATOS DE VENTA)
    window.ejecutarPago = async function() {
        const cuotaId = document.getElementById('conf-cuota-id').value;
        const tipoComp = document.querySelector('input[name="tipo_comp_cuota"]:checked').value;
        const metodo = document.getElementById('cuota-metodo').value;
        const email = document.getElementById('cuota-email').value;
        
        // 🔥 Capturar formato PDF (Ticket/A4/A5)
        const formatoPdf = document.querySelector('input[name="fmt_cuota"]:checked').value;

        // 🔥 Capturar Tipo de Tarjeta si aplica
        let tipoTarjeta = null;
        if (metodo === 'Tarjeta') {
            tipoTarjeta = document.querySelector('input[name="tipo_tarjeta_cuota"]:checked').value;
        }

        // Datos Cliente
        let clienteDoc = "", clienteNombre = "", clienteDir = "";
        if (tipoComp === 'Boleta') {
            clienteDoc = document.getElementById('cuota-dni').value.trim() || "00000000";
            clienteNombre = document.getElementById('cuota-nombre').value.trim() || "CLIENTE VARIOS";
        } else {
            clienteDoc = document.getElementById('cuota-ruc').value.trim();
            clienteNombre = document.getElementById('cuota-razon').value.trim();
            clienteDir = document.getElementById('cuota-direccion').value.trim();
            
            if (clienteDoc.length !== 11) return showToast("RUC inválido.", "warning");
            if (!clienteNombre) return showToast("Falta Razón Social.", "warning");
        }

        const btn = document.querySelector('.btn-confirm-pay');
        btn.disabled = true;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Facturando...";

        try {
            const res = await fetch(`/api/terceros/cuotas/${cuotaId}/pagar`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-auth-token': localStorage.getItem('token') 
                },
                body: JSON.stringify({ 
                    metodo_pago: metodo,
                    tipo_comprobante: tipoComp,
                    tipo_tarjeta: tipoTarjeta, // Enviamos Debito/Credito
                    cliente_doc: clienteDoc,
                    cliente_nombre: clienteNombre,
                    cliente_direccion: clienteDir,
                    cliente_email: email,
                    formato_pdf: formatoPdf // Enviamos 1(A4), 2(A5) o 3(Ticket)
                }) 
            });

            const data = await res.json();

            if (res.ok) {
                showToast(`✅ Cobro exitoso. Ticket: ${data.ticketCodigo}`, "success");
                cerrarModalConfirmacion();
                cerrarModalPagos();
                if (typeof cargarAcuerdos === 'function') await cargarAcuerdos();
            } else {
                showToast(data.error || "Error al procesar cobro.", "error");
            }
        } catch (e) { 
            console.error(e);
            showToast("Error crítico de conexión.", "error"); 
        } finally {
            btn.disabled = false;
            btn.innerHTML = "Confirmar y Facturar";
        }
    };

    window.cerrarModalConfirmacion = function() {
        document.getElementById('modal-confirmar-pago').classList.remove('active');
    }

    // FUNCIÓN PARA EDITAR MONTOS (LO QUE PEDISTE)
    window.editarMontoCuota = function(id, montoActual, fechaActual) {
        // 1. Llenar los inputs del modal con los datos actuales
        document.getElementById('edit-cuota-id').value = id;
        document.getElementById('edit-monto').value = parseFloat(montoActual).toFixed(2);
        
        // La fecha viene en formato ISO o Locale, aseguramos formato YYYY-MM-DD para el input date
        // Si fechaActual es "2026-02-20", perfecto. Si no, habría que formatear.
        document.getElementById('edit-fecha').value = fechaActual; 
        
        // 2. Mostrar el modal
        document.getElementById('modal-editar-cuota').classList.add('active');
    }

    window.procesarPagoCuota = async function(cuotaId) {
        // 🛡️ BLINDAJE 1: Sustitución de confirm nativo por modal de SuperNova
        const confirmado = await showConfirm(
            "¿Confirmar recepción del dinero?\nSe registrará automáticamente un INGRESO en CAJA.",
            "Confirmar Cobro B2B"
        );

        if (!confirmado) return;

        // Feedback visual en el botón para evitar múltiples clics (race condition)
        const btn = event.currentTarget;
        const textoOriginal = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Cobrando...";
        }

        try {
            const res = await fetch(`/api/terceros/cuotas/${cuotaId}/pagar`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-auth-token': localStorage.getItem('token') 
                },
                body: JSON.stringify({ 
                    metodo_pago: 'TRANSFERENCIA' 
                }) 
            });

            const data = await res.json();

            if (res.ok) {
                // ✅ ÉXITO
                showToast("✅ Pago registrado exitosamente en el flujo de caja.", "success");
                
                // Cerrar el modal de gestión de pagos
                const modalPagos = document.getElementById('modal-pagos');
                if (modalPagos) modalPagos.classList.remove('active');
                
                // Refrescar datos de la tabla principal de acuerdos
                if (typeof cargarAcuerdos === 'function') await cargarAcuerdos();
                
            } else {
                // ❌ ERROR DE LÓGICA
                showToast(data.error || "No se pudo registrar el pago de la cuota.", "error");
            }

        } catch (e) { 
            console.error("Error al procesar pago de cuota:", e);
            showToast("Error de conexión: No se pudo comunicar con el módulo de Caja.", "error"); 
        } finally {
            // Restaurar botón si no se cerró el modal
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = textoOriginal;
            }
        }
    };

    window.cerrarModalPagos = function() {
        document.getElementById('modal-pagos').classList.remove('active');
    }

    // --- 5. OTRAS FUNCIONES ---
    let isProcessingCanje = false; 

    window.validarCodigo = async function() {
        const input = document.getElementById('input-codigo-canje');
        const resultadoBox = document.getElementById('resultado-validacion');
        const codigo = input.value.trim().toUpperCase(); // Normalizamos a mayúsculas
        
        // 🛡️ BLINDAJE 1: Evitar ejecución si no hay código o si ya hay un proceso en marcha
        if(!codigo || isProcessingCanje) return;
        
        // Activamos el bloqueo
        isProcessingCanje = true; 
        
        // Reiniciar estado visual y bloquear input
        resultadoBox.className = 'result-box hidden';
        input.disabled = true;

        try {
            const res = await fetch('/api/terceros/validar', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-auth-token': localStorage.getItem('token') 
                },
                body: JSON.stringify({ codigo })
            });
            
            const data = await res.json();

            // 🛡️ BLINDAJE 2: Verificamos el éxito basado en la propiedad success del JSON
            if(data.success === true) {
                // ✅ CASO ÉXITO (VERDE)
                resultadoBox.className = 'result-box success';
                resultadoBox.innerHTML = `
                    <span class="result-title"><i class='bx bx-check-circle'></i> ACCESO PERMITIDO</span>
                    <p>¡El canje se ha registrado correctamente!</p>
                    <div class="result-product">📦 ${data.producto || 'Producto Generico'}</div>
                `;
                
                // Recargamos el mini-historial lateral
                if(typeof cargarHistorialCanjes === 'function') {
                    await cargarHistorialCanjes();
                }
                
                input.value = ''; // Limpiamos el campo solo si fue exitoso
            } else {
                // ❌ CASO ERROR / YA USADO (ROJO)
                // El backend devuelve success: false con el motivo (msg)
                resultadoBox.className = 'result-box error';
                resultadoBox.innerHTML = `
                    <span class="result-title"><i class='bx bx-error'></i> DENEGADO</span>
                    <p>${data.msg || 'El código no es válido para canje.'}</p>
                `;
                
                input.select(); // Seleccionamos el texto fallido para que el usuario pueda corregir o borrar rápido
            }

        } catch (e) { 
            console.error("Error en Validación:", e); 
            resultadoBox.className = 'result-box error';
            resultadoBox.innerHTML = `
                <span class="result-title"><i class='bx bx-wifi-off'></i> ERROR DE RED</span>
                <p>No se pudo establecer conexión con el servidor de validación.</p>
            `;
        } 
        finally {
            // 🛡️ LIBERACIÓN: Desbloqueamos el proceso y el input pase lo que pase
            isProcessingCanje = false; 
            input.disabled = false; 
            input.focus(); // Devolvemos el foco para el siguiente escaneo
        }
    };

    window.verCodigosAcuerdo = async function(id) {
        const modal = document.getElementById('modal-lista-codigos');
        const tbody = document.getElementById('tabla-codigos-lista');
        document.getElementById('filtro-codigo').value = '';
        tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:20px;">Cargando códigos...</td></tr>';
        if(modal) modal.classList.add('active');

        try {
            const res = await fetch(`/api/terceros/acuerdos/${id}/codigos`, {
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            const data = await res.json();
            listaCodigosCompleta = data || [];
            listaCodigosFiltrada = [...listaCodigosCompleta]; 
            paginaCodigos = 1;
            renderizarTablaCodigos();
        } catch(e) { console.error(e); tbody.innerHTML = '<tr><td colspan="2" style="color:red; text-align:center;">Error</td></tr>'; }
    }

    function renderizarTablaCodigos() {
        const tbody = document.getElementById('tabla-codigos-lista');
        if(!tbody) return;
        tbody.innerHTML = '';
        if(listaCodigosFiltrada.length === 0) {
            tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding:10px; color:#64748b;">No se encontraron códigos.</td></tr>';
            document.getElementById('page-info-cod').innerText = "0 / 0";
            return;
        }
        const totalPaginas = Math.ceil(listaCodigosFiltrada.length / itemsPorPaginaCodigos);
        if (paginaCodigos > totalPaginas) paginaCodigos = totalPaginas;
        if (paginaCodigos < 1) paginaCodigos = 1;
        const inicio = (paginaCodigos - 1) * itemsPorPaginaCodigos;
        const fin = inicio + itemsPorPaginaCodigos;
        const codigosPagina = listaCodigosFiltrada.slice(inicio, fin);

        codigosPagina.forEach(c => {
            let color = c.estado === 'DISPONIBLE' ? '#16a34a' : (c.estado === 'CANJEADO' ? '#d97706' : '#dc2626');
            let estadoTexto = c.estado;
            if(c.estado === 'CANJEADO' && c.fecha_canje) {
                const fecha = new Date(c.fecha_canje).toLocaleDateString();
                estadoTexto += ` <span style="font-size:0.7em; color:#78350f">(${fecha})</span>`;
            }
            const tr = document.createElement('tr');
            tr.innerHTML = `<td style="font-family:monospace; font-weight:bold; color:#334155;">${c.codigo_unico}</td><td><span style="color:${color}; font-weight:bold; font-size:0.75rem;">${estadoTexto}</span></td>`;
            tbody.appendChild(tr);
        });
        document.getElementById('page-info-cod').innerText = `Pg ${paginaCodigos} de ${totalPaginas} (Total: ${listaCodigosFiltrada.length})`;
        document.getElementById('btn-prev-cod').disabled = (paginaCodigos === 1);
        document.getElementById('btn-next-cod').disabled = (paginaCodigos === totalPaginas);
    }

    window.cambiarPaginaCodigos = function(direccion) { paginaCodigos += direccion; renderizarTablaCodigos(); }
    window.filtrarListaCodigos = function() {
        const texto = document.getElementById('filtro-codigo').value.trim().toUpperCase();
        if (texto === '') listaCodigosFiltrada = [...listaCodigosCompleta];
        else listaCodigosFiltrada = listaCodigosCompleta.filter(c => c.codigo_unico.toUpperCase().includes(texto) || c.estado.includes(texto));
        paginaCodigos = 1; renderizarTablaCodigos();
    }
    window.cerrarModalCodigos = function() { document.getElementById('modal-lista-codigos').classList.remove('active'); }

    window.verDetalleAcuerdo = async function(id) {
        const modal = document.getElementById('modal-detalle-acuerdo');
        if(modal) modal.classList.add('active');
        document.getElementById('view-titulo').innerText = "Cargando...";
        document.getElementById('stat-total').innerText = "-";
        try {
            const res = await fetch(`/api/terceros/acuerdos/${id}/detalle`, { headers: { 'x-auth-token': localStorage.getItem('token') } });
            const data = await res.json();
            if(res.ok) {
                document.getElementById('view-titulo').innerText = data.descripcion;
                document.getElementById('view-canal').innerText = data.canal;
                document.getElementById('view-producto').value = data.producto || "Sin producto";
                document.getElementById('stat-total').innerText = `${data.total_cargados} / ${data.cantidad_entradas}`;
                document.getElementById('stat-usados').innerText = data.total_canjeados;
                document.getElementById('stat-pend').innerText = data.total_disponibles;
            } else { cerrarModalDetalle(); }
        } catch(e) { console.error(e); }
    }
    window.cerrarModalDetalle = function() { document.getElementById('modal-detalle-acuerdo').classList.remove('active'); }

    window.eliminarAcuerdo = async function(id) {
        // 🛡️ BLINDAJE 1: Confirmación de SuperNova con advertencia de impacto
        const confirmado = await showConfirm(
            "¿Estás seguro de ELIMINAR este acuerdo?\nEsta acción borrará todos los códigos no usados y el cronograma de pagos pendiente.",
            "Eliminar Acuerdo Comercial"
        );

        if (!confirmado) return;

        // Identificar botón para feedback visual
        const btn = event.currentTarget;
        const textoOriginal = btn ? btn.innerHTML : '';
        
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
        }

        try {
            const res = await fetch(`/api/terceros/acuerdos/${id}`, { 
                method: 'DELETE', 
                headers: { 
                    'x-auth-token': localStorage.getItem('token') 
                } 
            });
            
            const json = await res.json();

            if (res.ok) {
                // ✅ ÉXITO
                showToast(json.msg || "Acuerdo eliminado correctamente.", "success");
                
                // Recargar la tabla principal para reflejar la eliminación
                if (typeof cargarAcuerdos === 'function') {
                    await cargarAcuerdos();
                }
            } else {
                // ❌ ERROR (Ej: El acuerdo ya tiene códigos canjeados y no se puede borrar)
                showToast(json.error || "No se puede eliminar el acuerdo.", "error");
            }

        } catch (e) { 
            console.error("Error al eliminar acuerdo:", e); 
            showToast("Error de conexión: No se pudo eliminar el registro.", "error"); 
        } finally {
            // Restaurar botón si el proceso termina (aunque si fue éxito la fila desaparecerá)
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = textoOriginal;
            }
        }
    };

    window.procesarCargaMasiva = async function() {
        const select = document.getElementById('select-acuerdo-carga');
        const acuerdoId = select.value;
        const textarea = document.getElementById('txt-codigos-masivos');
        const textoRaw = textarea.value;
        
        // 🛡️ BLINDAJE 1: Validaciones de entrada iniciales
        if(!acuerdoId) {
            return showToast("Debe seleccionar un acuerdo comercial primero.", "warning");
        }
        
        // Limpieza profunda de los códigos pegados
        const codigos = textoRaw.split(/\r?\n/)
                                .map(c => c.trim().toUpperCase())
                                .filter(c => c.length > 0);

        if(codigos.length === 0) {
            return showToast("El campo de códigos está vacío. Pegue su lista de Excel o Txt.", "warning");
        }
        
        // Feedback visual en el botón
        const btn = event.currentTarget;
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Validando cupos...";
        btn.disabled = true;

        try {
            // 🛡️ BLINDAJE 2: Verificar disponibilidad real en el acuerdo antes de cargar
            const resDetalle = await fetch(`/api/terceros/acuerdos/${acuerdoId}/detalle`, {
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            const detalle = await resDetalle.json();

            if (!resDetalle.ok) throw new Error("No se pudo verificar el estado del acuerdo.");

            const limiteTotal = parseInt(detalle.cantidad_entradas);
            const yaCargados = parseInt(detalle.total_cargados);
            const espacioDisponible = limiteTotal - yaCargados;

            // Validar si la cantidad que se intenta pegar sobrepasa lo que falta cargar
            if (codigos.length > espacioDisponible) {
                return showToast(
                    `Límite excedido. Estás intentando cargar ${codigos.length} códigos, pero este acuerdo solo tiene ${espacioDisponible} cupos disponibles (Total: ${limiteTotal}, Ya cargados: ${yaCargados}).`,
                    "error",
                    "Validación de Capacidad"
                );
            }

            // 🚀 PETICIÓN AL BACKEND (Procede solo si hay espacio)
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Inyectando Códigos...";
            const res = await fetch('/api/terceros/codigos/carga-masiva', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-auth-token': localStorage.getItem('token') 
                },
                body: JSON.stringify({ 
                    acuerdo_id: acuerdoId, 
                    canal_id: 1, 
                    codigos: codigos 
                })
            });
            
            const json = await res.json();
            
            if(res.ok) {
                // ✅ ÉXITO: Limpiar campo y mostrar modal de resultados
                textarea.value = "";
                const modalRes = document.getElementById('modal-resultado-carga');
                document.getElementById('res-insertados').innerText = json.insertados;
                document.getElementById('res-duplicados').innerText = json.duplicados;
                
                const icono = document.getElementById('icon-resultado');
                const titulo = document.getElementById('titulo-resultado');
                
                if(json.duplicados > 0) {
                    icono.innerHTML = "⚠️"; 
                    titulo.innerText = "Carga parcial (Duplicados)";
                    titulo.style.color = "#d97706";
                    showToast(`Se cargaron ${json.insertados} códigos. ${json.duplicados} omitidos por estar repetidos en el sistema.`, "info");
                } else {
                    icono.innerHTML = "🎉"; 
                    titulo.innerText = "¡Carga Exitosa!";
                    titulo.style.color = "#16a34a";
                    showToast("Todos los códigos han sido registrados correctamente.", "success");
                }

                modalRes.classList.add('active');
                
                if(typeof cargarAcuerdos === 'function') {
                    await cargarAcuerdos(); 
                }
            } else {
                showToast(json.error || "Hubo un fallo al procesar la lista.", "error");
            }

        } catch(e) { 
            console.error("Error Carga Masiva:", e); 
            showToast(e.message || "Error de conexión con el servidor.", "error"); 
        } finally { 
            btn.innerHTML = textoOriginal; 
            btn.disabled = false; 
        }
    };

    // Función para cerrar el modal de resultados (Simple y limpia)
    window.cerrarModalResultado = function() { 
        const modal = document.getElementById('modal-resultado-carga');
        if(modal) modal.classList.remove('active'); 
    };
    // Utils de carga inicial
    function llenarSelectAcuerdos(lista) {
        const select = document.getElementById('select-acuerdo-carga');
        if(!select) return;
        select.innerHTML = '<option value="">-- Seleccione --</option>';
        lista.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.innerText = `${a.empresa} - ${a.descripcion}`;
            select.appendChild(opt);
        });
    }

    async function cargarHistorialCanjes() {
        const lista = document.getElementById('lista-ultimos-canjes');
        if(!lista) return;
        
        try {
            const res = await fetch('/api/terceros/historial', { headers: {'x-auth-token': localStorage.getItem('token')} });
            if(res.ok) {
                const data = await res.json();
                historialHoyCache = data || [];
                pagMiniActual = 1; // Resetear a página 1
                renderizarMiniHistorial();
            }
        } catch(e) { console.error(e); }
    }

    window.renderizarMiniHistorial = function() {
        const lista = document.getElementById('lista-ultimos-canjes');
        lista.innerHTML = '';

        if(historialHoyCache.length === 0) { 
            lista.innerHTML = '<li class="empty-msg">No hay canjes hoy.</li>'; 
            return; 
        }

        const totalPags = Math.ceil(historialHoyCache.length / itemsMini);
        const inicio = (pagMiniActual - 1) * itemsMini;
        const fin = inicio + itemsMini;
        const itemsPagina = historialHoyCache.slice(inicio, fin);

        itemsPagina.forEach(item => {
            const li = document.createElement('li');
            li.className = 'success';
            
            // Fecha y Hora formateada
            const fechaObj = new Date(item.fecha_canje);
            const fechaStr = fechaObj.toLocaleDateString([], {day:'2-digit', month:'2-digit'});
            const horaStr = fechaObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

            li.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%;">
                    <span>
                        <strong style="color:#334155;">${item.codigo_unico}</strong><br>
                        <small style="color:#64748b;">${item.producto || 'Producto'}</small>
                    </span>
                    <span style="text-align:right; font-size:0.75rem;">
                        <div style="font-weight:bold;">${horaStr}</div>
                        <div style="color:#94a3b8;">${fechaStr}</div>
                    </span>
                </div>
            `;
            lista.appendChild(li);
        });

        // Actualizar botones mini
        document.getElementById('txt-mini-page').innerText = `Pg ${pagMiniActual}/${totalPags}`;
        document.getElementById('btn-mini-prev').disabled = (pagMiniActual === 1);
        document.getElementById('btn-mini-next').disabled = (pagMiniActual === totalPags);
    }

    window.cambiarPaginaMini = function(dir) {
        pagMiniActual += dir;
        renderizarMiniHistorial();
    }

    // --- NUEVO: MODAL HISTORIAL TOTAL ---
    window.abrirModalHistorialTotal = function() {
        document.getElementById('modal-historial-total').classList.add('active');
        
        // Llenar select de canales en el filtro (reusamos la variable global 'canales')
        const selectFiltro = document.getElementById('filtro-hist-canal');
        selectFiltro.innerHTML = '<option value="">Todos los Socios</option>';
        canales.forEach(c => {
            selectFiltro.innerHTML += `<option value="${c.id}">${c.nombre}</option>`;
        });

        // Limpiar filtros visuales al abrir
        document.getElementById('filtro-hist-inicio').value = '';
        document.getElementById('filtro-hist-fin').value = '';
        document.getElementById('filtro-hist-search').value = '';
        
        pagHistorialTotal = 1;
        cargarTablaHistorialTotal();
    }

    window.cerrarModalHistorialTotal = function() {
        document.getElementById('modal-historial-total').classList.remove('active');
    }

    window.aplicarFiltrosHistorial = function() {
        pagHistorialTotal = 1; // Resetear a pag 1 al filtrar
        cargarTablaHistorialTotal();
    }

    window.cargarTablaHistorialTotal = async function() {
        const tbody = document.getElementById('tabla-historial-total');
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">Cargando filtros...</td></tr>';

        // Recoger valores de filtros
        const inicio = document.getElementById('filtro-hist-inicio').value;
        const fin = document.getElementById('filtro-hist-fin').value;
        const search = document.getElementById('filtro-hist-search').value;
        const canal = document.getElementById('filtro-hist-canal').value;

        // Construir URL Params
        const params = new URLSearchParams({
            page: pagHistorialTotal,
            limit: 10,
            inicio, fin, search, canal
        });

        try {
            const res = await fetch(`/api/terceros/historial-total?${params}`, { 
                headers: {'x-auth-token': localStorage.getItem('token')} 
            });
            const json = await res.json();
            
            tbody.innerHTML = '';
            document.getElementById('total-registros-hist').innerText = json.pagination?.total || 0;

            if(!json.data || json.data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#64748b;">No se encontraron resultados con esos filtros.</td></tr>';
                document.getElementById('info-hist-page').innerText = "Pg 0/0";
                return;
            }

            json.data.forEach(Row => {
                const fechaObj = new Date(Row.fecha_canje);
                const fecha = fechaObj.toLocaleDateString();
                const hora = fechaObj.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${fecha}</td>
                    <td style="color:#64748b; font-size:0.8rem;">${hora}</td>
                    <td style="font-family:monospace; font-weight:bold; color:#0f172a;">${Row.codigo_unico}</td>
                    <td><span style="background:#f0f9ff; color:#0369a1; padding:2px 6px; border-radius:4px; font-size:0.75rem; font-weight:bold;">${Row.socio_canal || '-'}</span></td>
                    <td style="font-size:0.8rem;">${Row.nombre_paquete || '-'}</td>
                    <td style="font-size:0.8rem;">${Row.usuario || 'Sistema'}</td>
                `;
                tbody.appendChild(tr);
            });

            // Actualizar controles paginación
            document.getElementById('info-hist-page').innerText = `Página ${json.pagination.paginaActual} de ${json.pagination.totalPaginas}`;
            document.getElementById('btn-hist-prev').disabled = (json.pagination.paginaActual === 1);
            document.getElementById('btn-hist-next').disabled = (json.pagination.paginaActual === json.pagination.totalPaginas);

        } catch(e) {
            console.error(e);
            tbody.innerHTML = '<tr><td colspan="6" style="color:red; text-align:center;">Error al cargar datos.</td></tr>';
        }
    }

    window.cambiarPaginaHistorial = function(dir) {
        pagHistorialTotal += dir;
        cargarTablaHistorialTotal();
    }

    // 🔥 FUNCIÓN EXPORTAR EXCEL (CORREGIDA PARA LATINOAMÉRICA Y SIN ALERTS)
    window.exportarHistorialExcel = async function() {
        const btn = event.currentTarget;
        const txtOriginal = btn.innerHTML;
        
        // 🛡️ Evitar múltiples clics
        if(btn.disabled) return;

        btn.disabled = true;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Preparando...";

        // 1. Recoger filtros del DOM
        const inicio = document.getElementById('filtro-hist-inicio').value;
        const fin = document.getElementById('filtro-hist-fin').value;
        const search = document.getElementById('filtro-hist-search').value;
        const canal = document.getElementById('filtro-hist-canal').value;

        const params = new URLSearchParams({
            exportar: 'true',
            inicio, fin, search, canal
        });

        try {
            // 2. Pedir datos al servidor
            const res = await fetch(`/api/terceros/historial-total?${params}`, { 
                headers: {'x-auth-token': localStorage.getItem('token')} 
            });
            
            if (!res.ok) throw new Error("Error en la respuesta del servidor");
            
            const data = await res.json();

            // 🛡️ REEMPLAZO DE ALERT: Validar si hay datos
            if(!data || data.length === 0) {
                showToast("No se encontraron registros con los filtros seleccionados para exportar.", "warning", "Exportación vacía");
                return;
            }

            // 3. Generar CSV optimizado para Excel (Uso de punto y coma para región LATAM)
            let csvContent = "\uFEFF"; // BOM para asegurar que Excel reconozca tildes y caracteres especiales
            
            // Encabezados limpios
            csvContent += "FECHA;HORA;CODIGO;SOCIO/CANAL;PAQUETE;PRODUCTO;USUARIO\n";

            data.forEach(row => {
                const f = new Date(row.fecha_canje);
                const fecha = f.toLocaleDateString('es-PE');
                const hora = f.toLocaleTimeString('es-PE', { hour12: false });
                
                // Limpieza y escape de datos para evitar romper el formato CSV
                const socio = `"${(row.socio_canal || "").replace(/"/g, '""')}"`;
                const paquete = `"${(row.nombre_paquete || "").replace(/"/g, '""')}"`;
                const prod = `"${(row.producto || "").replace(/"/g, '""')}"`;
                const user = `"${(row.usuario || "").replace(/"/g, '""')}"`;
                const codigo = `"${row.codigo_unico}"`;

                csvContent += `${fecha};${hora};${codigo};${socio};${paquete};${prod};${user}\n`;
            });

            // 4. Proceso de Descarga
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            
            const fechaArchivo = new Date().toISOString().slice(0,10);
            link.setAttribute("href", url);
            link.setAttribute("download", `Historial_Canjes_SuperNova_${fechaArchivo}.csv`);
            
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            // ✅ NOTIFICACIÓN DE ÉXITO
            showToast("El archivo se ha generado y descargado correctamente.", "success", "Exportación Exitosa");

        } catch(e) {
            console.error("Error al exportar:", e);
            // ❌ NOTIFICACIÓN DE ERROR
            showToast("Hubo un problema al intentar generar el archivo de Excel.", "error", "Fallo de exportación");
        } finally {
            // Restaurar estado del botón
            btn.disabled = false;
            btn.innerHTML = txtOriginal;
        }
    };

    
    window.toggleModoCarga = function(modo) {
        // Estilos botones
        document.getElementById('tab-carga-manual').className = modo === 'manual' ? 'btn-xs active' : 'btn-xs';
        document.getElementById('tab-carga-auto').className = modo === 'auto' ? 'btn-xs active' : 'btn-xs';
        
        // Visibilidad bloques
        document.getElementById('bloque-carga-manual').style.display = modo === 'manual' ? 'block' : 'none';
        document.getElementById('bloque-carga-auto').style.display = modo === 'auto' ? 'block' : 'none';
    }

    window.procesarGeneracionAutomatica = async function() {
        const acuerdoId = document.getElementById('select-acuerdo-carga').value;
        const cantidadInput = document.getElementById('gen-cantidad');
        const prefijo = document.getElementById('gen-prefijo').value;
        const cantidadAGenerar = parseInt(cantidadInput.value);

        if (!acuerdoId) return showToast("Seleccione un acuerdo primero.", "warning");
        if (!cantidadAGenerar || cantidadAGenerar <= 0) return showToast("Ingrese una cantidad válida.", "warning");

        const btn = event.currentTarget;
        const txtOriginal = btn.innerHTML;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Validando espacio...";
        btn.disabled = true;

        try {
            // 🛡️ BLINDAJE: Consultar detalle del acuerdo para ver disponibilidad real
            const resDetalle = await fetch(`/api/terceros/acuerdos/${acuerdoId}/detalle`, {
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            const detalle = await resDetalle.json();

            if (!resDetalle.ok) throw new Error("No se pudo verificar el acuerdo.");

            const limiteTotal = parseInt(detalle.cantidad_entradas);
            const yaCargados = parseInt(detalle.total_cargados);
            const espacioDisponible = limiteTotal - yaCargados;

            // Validar si sobrepasa el límite
            if (cantidadAGenerar > espacioDisponible) {
                return showToast(
                    `Límite excedido. El acuerdo es de ${limiteTotal} tickets, ya tienes ${yaCargados} cargados. Solo puedes generar ${espacioDisponible} más.`,
                    "error",
                    "Validación de Cupos"
                );
            }

            // Si pasa la validación, procedemos a generar
            const confirmado = await showConfirm(
                `¿Generar ${cantidadAGenerar} códigos para "${detalle.descripcion}"?`,
                "Confirmar Generación"
            );

            if (!confirmado) return;

            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Generando...";

            const resGen = await fetch('/api/terceros/codigos/generar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
                body: JSON.stringify({ 
                    acuerdo_id: acuerdoId, 
                    cantidad: cantidadAGenerar, 
                    prefijo: prefijo || 'GEN' 
                })
            });

            const dataGen = await resGen.json();

            if (resGen.ok) {
                showToast(`✅ Se generaron ${dataGen.generados_reales} códigos con éxito.`, "success");
                cantidadInput.value = "";
                document.getElementById('gen-prefijo').value = "";
                if (typeof cargarAcuerdos === 'function') cargarAcuerdos(); 
            } else {
                showToast(dataGen.error, "error");
            }

        } catch (e) {
            console.error(e);
            showToast("Error de conexión al validar cupos.", "error");
        } finally {
            btn.innerHTML = txtOriginal;
            btn.disabled = false;
        }
    };

    async function cargarCanales() {
        try {
            const res = await fetch('/api/terceros/canales', { headers: {'x-auth-token': localStorage.getItem('token')} });
            if(res.ok) {
                canales = await res.json();
                const select = document.getElementById('new-canal');
                if(select) {
                    select.innerHTML = '<option value="">-- Seleccionar --</option>';
                    canales.forEach(c => select.innerHTML += `<option value="${c.id}">${c.nombre}</option>`);
                }
            }
        } catch(e) {}
    }
    
    async function cargarProductos() {
        try {
            const res = await fetch('/api/inventario', { headers: {'x-auth-token': localStorage.getItem('token')} });
            if(res.ok) {
                const data = await res.json();
                const selectModal = document.getElementById('new-producto');
                const htmlOpciones = '<option value="">-- Seleccionar --</option>' + (data.productos || []).filter(p => p.tipo_item === 'fisico').map(p => `<option value="${p.id}">${p.nombre} (Stock: ${p.stock_actual})</option>`).join('');
                if(selectModal) selectModal.innerHTML = htmlOpciones;
            }
        } catch(e) {}
    }

    window.toggleInputCanal = function() {
        const divSelect = document.getElementById('div-select-canal');
        const divInput = document.getElementById('div-input-canal');
        if(divSelect.style.display === 'none') { divSelect.style.display = 'flex'; divInput.style.display = 'none'; } 
        else { divSelect.style.display = 'none'; divInput.style.display = 'flex'; document.getElementById('input-new-canal-nombre').focus(); }
    }

    // Función para guardar un nuevo canal/socio desde el input inline
    window.guardarCanalInline = async function() {
        const inputNombre = document.getElementById('input-new-canal-nombre');
        const nombre = inputNombre.value.trim();
        
        // 🛡️ VALIDACIÓN: Evitar que guarden canales sin nombre
        if(!nombre) {
            return showToast("Debe ingresar un nombre para el nuevo canal/socio.", "warning");
        }

        // Bloqueo visual del input mientras procesa
        inputNombre.disabled = true;

        try {
            const res = await fetch('/api/terceros/canales', { 
                method: 'POST', 
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-auth-token': localStorage.getItem('token') 
                }, 
                body: JSON.stringify({ 
                    nombre: nombre, 
                    tipo: 'CORPORATIVO' 
                }) 
            });

            if(res.ok) {
                // ✅ ÉXITO
                await cargarCanales(); // Recargar la lista del select
                toggleInputCanal();   // Volver a mostrar el select y ocultar el input
                
                // Seleccionar automáticamente el último canal creado en el dropdown
                const select = document.getElementById('new-canal');
                if(select) {
                    select.selectedIndex = select.options.length - 1;
                }

                showToast(`Canal "${nombre}" registrado correctamente.`, "success");
            } else {
                const data = await res.json();
                showToast(data.msg || "No se pudo registrar el canal.", "error");
            }

        } catch(e) { 
            console.error("Error al crear canal:", e);
            showToast("Error de conexión con el servidor.", "error"); 
        } finally {
            // Liberar el input
            inputNombre.disabled = false;
            inputNombre.value = ""; // Limpiar para la próxima vez
        }
    };

    window.abrirModalNuevoAcuerdo = function() { document.getElementById('modal-acuerdo').classList.add('active'); }
    window.cerrarModalAcuerdo = function() { document.getElementById('modal-acuerdo').classList.remove('active'); }
    
    window.cambiarTabTerceros = function(tabName) {
        document.querySelectorAll('.tab-content').forEach(d => d.classList.remove('active'));
        document.getElementById('view-' + tabName).classList.add('active');
        document.querySelectorAll('.tabs-terceros .tab-btn').forEach(b => b.classList.remove('active'));
        event.currentTarget.classList.add('active');
    }

    // 1. Mostrar/Ocultar Crédito/Débito
    window.toggleTarjetaCuota = function() {
        const metodo = document.getElementById('cuota-metodo').value;
        const divTarjeta = document.getElementById('sub-opcion-tarjeta');
        if (metodo === 'Tarjeta') {
            divTarjeta.style.display = 'block';
        } else {
            divTarjeta.style.display = 'none';
        }
    };

    // 2. Alternar Boleta/Factura
    window.toggleCamposFacturaCuota = function() {
        const tipo = document.querySelector('input[name="tipo_comp_cuota"]:checked').value;
        document.getElementById('grupo-dni-cuota').style.display = (tipo === 'Boleta') ? 'block' : 'none';
        document.getElementById('grupo-ruc-cuota').style.display = (tipo === 'Factura') ? 'block' : 'none';
    };

    // 3. Buscar DNI/RUC
    window.buscarEntidadCuota = async function(tipo) {
        const inputId = tipo === 'dni' ? 'cuota-dni' : 'cuota-ruc';
        const numero = document.getElementById(inputId).value.trim();
        
        // Validación rápida
        if ((tipo === 'dni' && numero.length !== 8) || (tipo === 'ruc' && numero.length !== 11)) {
            return showToast("Número de documento inválido.", "warning");
        }

        const btn = event.currentTarget;
        const icon = btn.querySelector('i');
        const originalClass = icon.className;
        icon.className = 'bx bx-loader-alt bx-spin';
        btn.disabled = true;

        try {
            const res = await fetch(`/api/consultas/${numero}`, {
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                showToast("✅ Datos encontrados.", "success");
                if (tipo === 'dni') {
                    document.getElementById('cuota-nombre').value = data.nombre;
                    document.getElementById('cuota-nombre').readOnly = true;
                } else {
                    document.getElementById('cuota-razon').value = data.nombre;
                    document.getElementById('cuota-direccion').value = data.direccion;
                    document.getElementById('cuota-razon').readOnly = true;
                    document.getElementById('cuota-direccion').readOnly = true;
                }
            } else {
                showToast("ℹ️ No encontrado. Ingrese manualmente.", "info");
                if(tipo === 'dni') document.getElementById('cuota-nombre').readOnly = false;
                else {
                    document.getElementById('cuota-razon').readOnly = false;
                    document.getElementById('cuota-direccion').readOnly = false;
                }
            }
        } catch (e) {
            showToast("Error de conexión.", "error");
        } finally {
            icon.className = originalClass;
            btn.disabled = false;
        }
    };

    initTerceros();
})();