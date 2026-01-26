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

    // --- 3. CREAR NUEVO ACUERDO ---
    const form = document.getElementById('form-acuerdo');
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const canalId = document.getElementById('new-canal').value;
            const desc = document.getElementById('new-desc').value;
            const cant = document.getElementById('new-cant').value;
            const precio = document.getElementById('new-precio').value;
            const prodId = document.getElementById('new-producto').value; 
            const condicion = document.getElementById('new-condicion').value;
            
            let cuotas = 1;
            if(condicion === 'custom') {
                cuotas = document.getElementById('new-num-cuotas').value;
            }

            if(!prodId) return alert("Selecciona un producto.");
            
            try {
                const res = await fetch('/api/terceros/acuerdos', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
                    body: JSON.stringify({
                        canal_id: canalId,
                        descripcion: desc,
                        cantidad: cant,
                        precio_unitario: precio,
                        producto_id: prodId,
                        numero_cuotas: cuotas
                    })
                });
                if(res.ok) {
                    alert("✅ Acuerdo registrado. Ahora configura los pagos si es necesario.");
                    cerrarModalAcuerdo();
                    cargarAcuerdos();
                } else {
                    alert("Error al guardar");
                }
            } catch(e) { console.error(e); alert("Error de conexión"); }
        });
    }

    // --- 4. GESTIÓN DE PAGOS Y CUOTAS (TU PEDIDO PRINCIPAL) ---
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
        const nuevoMonto = document.getElementById('edit-monto').value;
        const nuevaFecha = document.getElementById('edit-fecha').value;

        if(isNaN(nuevoMonto) || nuevoMonto <= 0) return alert("El monto debe ser mayor a 0.");
        if(!nuevaFecha) return alert("La fecha es obligatoria.");

        // Feedback visual en el botón
        const btn = event.currentTarget;
        const textoOriginal = btn.innerText;
        btn.innerText = "Guardando...";
        btn.disabled = true;

        try {
            const res = await fetch(`/api/terceros/cuotas/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
                body: JSON.stringify({ nuevo_monto: nuevoMonto, nueva_fecha: nuevaFecha })
            });

            if(res.ok) {
                // Cerrar modal edición
                cerrarModalEdicion();
                // Cerrar modal lista para obligar al usuario a recargar y ver el recalculo
                cerrarModalPagos(); 
                alert("✅ Cuota actualizada. El saldo restante se ha redistribuido a la siguiente cuota.");
            } else {
                const data = await res.json();
                alert("Error: " + (data.error || "No se pudo actualizar"));
            }
        } catch(e) { 
            console.error(e); 
            alert("Error de conexión"); 
        } finally {
            btn.innerText = textoOriginal;
            btn.disabled = false;
        }
    }

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

    // D. EJECUTAR EL PAGO REAL (ACTUALIZADO)
    window.ejecutarPago = async function() {
        const cuotaId = document.getElementById('conf-cuota-id').value;
        const btn = event.currentTarget;
        
        // 1. Estado de carga visual
        btn.disabled = true;
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Procesando...";

        try {
            // 2. Petición al Backend
            const res = await fetch(`/api/terceros/cuotas/${cuotaId}/pagar`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-auth-token': localStorage.getItem('token') 
                },
                body: JSON.stringify({ 
                    metodo_pago: 'TRANSFERENCIA' 
                    // Nota: Si agregas un select de sede en el HTML, podrías enviar:
                    // sede_destino: document.getElementById('tu-select-sede').value
                }) 
            });

            const data = await res.json();

            if(res.ok) {
                // ✅ ÉXITO
                cerrarModalConfirmacion();
                cerrarModalPagos(); // Cerramos la lista para forzar recarga al volver a abrir
                alert(data.msg || "✅ Pago registrado exitosamente en Caja.");
                
                // Actualizar la tabla principal de acuerdos para reflejar cambios si es necesario
                if(typeof cargarAcuerdos === 'function') {
                    cargarAcuerdos(); 
                }
            } else {
                // ❌ ERROR DEL BACKEND (Muestra el mensaje real del error 500 si ocurre)
                alert("Error: " + (data.error || "No se pudo registrar el pago."));
            }

        } catch(e) { 
            console.error("Error de red:", e); 
            alert("Error de conexión con el servidor."); 
        } finally {
            // 3. Restaurar botón
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
        }
    }

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
        if(!confirm("¿Confirmar recepción del dinero?\nSe creará un INGRESO en CAJA.")) return;

        try {
            const res = await fetch(`/api/terceros/cuotas/${cuotaId}/pagar`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
                body: JSON.stringify({ metodo_pago: 'TRANSFERENCIA' }) 
            });
            if(res.ok) {
                alert("✅ Pago registrado.");
                document.getElementById('modal-pagos').classList.remove('active');
            } else {
                alert("Error al registrar pago.");
            }
        } catch(e) { alert("Error de conexión"); }
    }

    window.cerrarModalPagos = function() {
        document.getElementById('modal-pagos').classList.remove('active');
    }

// --- 5. OTRAS FUNCIONES ---
    window.validarCodigo = async function() {
        const input = document.getElementById('input-codigo-canje');
        const resultadoBox = document.getElementById('resultado-validacion');
        const codigo = input.value.trim();
        
        if(!codigo) return;
        
        // Reiniciar estado visual
        resultadoBox.className = 'result-box hidden';
        input.disabled = true;

        try {
            const res = await fetch('/api/terceros/validar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
                body: JSON.stringify({ codigo })
            });
            
            const data = await res.json();

            // 🔥 CAMBIO CLAVE AQUÍ:
            // Ahora verificamos data.success en lugar de res.ok
            if(data.success === true) {
                // ✅ CASO ÉXITO (VERDE)
                resultadoBox.className = 'result-box success';
                resultadoBox.innerHTML = `
                    <span class="result-title"><i class='bx bx-check-circle'></i> ACCESO PERMITIDO</span>
                    <p>Código válido.</p>
                    <div class="result-product">📦 ${data.producto || 'Producto Generico'}</div>
                `;
                cargarHistorialCanjes();
                input.value = ''; // Limpiamos solo si fue éxito
            } else {
                // ❌ CASO ERROR / YA USADO (ROJO)
                // El backend devuelve 200 OK, pero con success: false y el mensaje de error
                resultadoBox.className = 'result-box error';
                resultadoBox.innerHTML = `<span class="result-title"><i class='bx bx-error'></i> DENEGADO</span><p>${data.msg}</p>`;
                input.select(); // Seleccionamos el texto para que corrijan fácil
            }

        } catch (e) { 
            console.error(e); 
            resultadoBox.className = 'result-box error';
            resultadoBox.innerHTML = `<span class="result-title"><i class='bx bx-wifi-off'></i> ERROR RED</span><p>No se pudo conectar al servidor.</p>`;
        } 
        finally {
            input.disabled = false; 
            input.focus();
        }
    }

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
        if(!confirm("¿Estás seguro de ELIMINAR este acuerdo?")) return;
        try {
            const res = await fetch(`/api/terceros/acuerdos/${id}`, { method: 'DELETE', headers: { 'x-auth-token': localStorage.getItem('token') } });
            const json = await res.json();
            if(res.ok) { alert(json.msg); cargarAcuerdos(); } else { alert("Error: " + json.error); }
        } catch(e) { console.error(e); alert("Error de conexión"); }
    }

    window.procesarCargaMasiva = async function() {
        const select = document.getElementById('select-acuerdo-carga');
        const acuerdoId = select.value;
        const texto = document.getElementById('txt-codigos-masivos').value;
        if(!acuerdoId) return alert("Selecciona un acuerdo primero.");
        const codigos = texto.split(/\r?\n/).map(c => c.trim()).filter(c => c.length > 0);
        if(codigos.length === 0) return alert("Pega los códigos primero.");
        
        const btn = event.currentTarget;
        const textoOriginal = btn.innerHTML;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Cargando...";
        btn.disabled = true;

        try {
            const res = await fetch('/api/terceros/codigos/carga-masiva', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
                body: JSON.stringify({ acuerdo_id: acuerdoId, canal_id: 1, codigos: codigos })
            });
            const json = await res.json();
            if(res.ok) {
                document.getElementById('txt-codigos-masivos').value = "";
                const modalRes = document.getElementById('modal-resultado-carga');
                document.getElementById('res-insertados').innerText = json.insertados;
                document.getElementById('res-duplicados').innerText = json.duplicados;
                
                const icono = document.getElementById('icon-resultado');
                const titulo = document.getElementById('titulo-resultado');
                if(json.duplicados > 0) {
                    icono.innerHTML = "⚠️"; titulo.innerText = "Carga con Duplicados"; titulo.style.color = "#d97706";
                } else {
                    icono.innerHTML = "🎉"; titulo.innerText = "Carga Exitosa"; titulo.style.color = "#16a34a";
                }
                modalRes.classList.add('active');
                cargarAcuerdos(); 
            } else { alert("Error: " + json.error); }
        } catch(e) { console.error(e); alert("Error de conexión"); } finally { btn.innerHTML = textoOriginal; btn.disabled = false; }
    }
    window.cerrarModalResultado = function() { document.getElementById('modal-resultado-carga').classList.remove('active'); }

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

// 🔥 FUNCIÓN EXPORTAR EXCEL (CORREGIDA PARA EXCEL ESPAÑOL/LATINO)
    // 🔥 FUNCIÓN EXPORTAR EXCEL (CORREGIDA PARA LATINOAMÉRICA: USO DE PUNTO Y COMA)
    window.exportarHistorialExcel = async function() {
        const btn = event.currentTarget;
        const txtOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";

        // 1. Recoger filtros
        const inicio = document.getElementById('filtro-hist-inicio').value;
        const fin = document.getElementById('filtro-hist-fin').value;
        const search = document.getElementById('filtro-hist-search').value;
        const canal = document.getElementById('filtro-hist-canal').value;

        const params = new URLSearchParams({
            exportar: 'true',
            inicio, fin, search, canal
        });

        try {
            // 2. Pedir datos
            const res = await fetch(`/api/terceros/historial-total?${params}`, { 
                headers: {'x-auth-token': localStorage.getItem('token')} 
            });
            const data = await res.json();

            if(data.length === 0) {
                alert("No hay datos para exportar.");
                return;
            }

            // 3. Generar CSV con PUNTO Y COMA (;)
            let csvContent = "\uFEFF"; // BOM para tildes
            
            // CABECERAS CON PUNTO Y COMA
            csvContent += "FECHA;HORA;CODIGO;SOCIO/CANAL;PAQUETE;PRODUCTO;USUARIO\n";

            data.forEach(row => {
                const f = new Date(row.fecha_canje);
                const fecha = f.toLocaleDateString();
                const hora = f.toLocaleTimeString();
                
                // Limpieza de comillas internas (doble comilla para escapar en CSV)
                // Envolvemos en comillas por seguridad, pero usamos ; para separar
                const socio = `"${(row.socio_canal || "").replace(/"/g, '""')}"`;
                const paquete = `"${(row.nombre_paquete || "").replace(/"/g, '""')}"`;
                const prod = `"${(row.producto || "").replace(/"/g, '""')}"`;
                const user = `"${(row.usuario || "").replace(/"/g, '""')}"`;
                const codigo = `"${row.codigo_unico}"`;

                // UNIMOS CON PUNTO Y COMA
                csvContent += `${fecha};${hora};${codigo};${socio};${paquete};${prod};${user}\n`;
            });

            // 4. Descargar
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", `Historial_Canjes_${new Date().toISOString().slice(0,10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

        } catch(e) {
            console.error(e);
            alert("Error al exportar.");
        } finally {
            btn.disabled = false;
            btn.innerHTML = txtOriginal;
        }
    }

    
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
        const cantidad = document.getElementById('gen-cantidad').value;
        const prefijo = document.getElementById('gen-prefijo').value;

        if (!acuerdoId) return alert("Selecciona un acuerdo primero.");
        if (!cantidad || cantidad <= 0) return alert("Ingresa una cantidad válida.");

        if (!confirm(`¿Generar ${cantidad} códigos nuevos para este acuerdo?`)) return;

        const btn = event.currentTarget;
        const txtOriginal = btn.innerHTML;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Generando...";
        btn.disabled = true;

        try {
            const res = await fetch('/api/terceros/codigos/generar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
                body: JSON.stringify({ 
                    acuerdo_id: acuerdoId, 
                    cantidad: cantidad, 
                    prefijo: prefijo || 'GEN' 
                })
            });

            const data = await res.json();

            if (res.ok) {
                alert(`✅ Éxito: Se generaron ${data.generados_reales} códigos.`);
                cargarAcuerdos(); // Refrescar contadores
                
                // Limpiar inputs
                document.getElementById('gen-cantidad').value = "";
                document.getElementById('gen-prefijo').value = "";
            } else {
                alert("Error: " + data.error);
            }

        } catch (e) {
            console.error(e);
            alert("Error de conexión");
        } finally {
            btn.innerHTML = txtOriginal;
            btn.disabled = false;
        }
    }

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
    window.guardarCanalInline = async function() {
        const nombre = document.getElementById('input-new-canal-nombre').value;
        if(!nombre) return;
        try {
            const res = await fetch('/api/terceros/canales', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') }, body: JSON.stringify({ nombre, tipo: 'CORPORATIVO' }) });
            if(res.ok) { await cargarCanales(); toggleInputCanal(); const select = document.getElementById('new-canal'); select.selectedIndex = select.options.length - 1; }
        } catch(e) { alert("Error al crear canal"); }
    }

    window.abrirModalNuevoAcuerdo = function() { document.getElementById('modal-acuerdo').classList.add('active'); }
    window.cerrarModalAcuerdo = function() { document.getElementById('modal-acuerdo').classList.remove('active'); }
    
    window.cambiarTabTerceros = function(tabName) {
        document.querySelectorAll('.tab-content').forEach(d => d.classList.remove('active'));
        document.getElementById('view-' + tabName).classList.add('active');
        document.querySelectorAll('.tabs-terceros .tab-btn').forEach(b => b.classList.remove('active'));
        event.currentTarget.classList.add('active');
    }

    initTerceros();
})();