// Ubicacion: SuperNova/frontend/modules/proveedores/proveedores.js

(function() {
    console.log("Modulo Proveedores Blindado 🛡️🚚");

    let proveedoresData = [];
    let proveedoresFiltrados = [];
    let paginaActual = 1;
    const filasPorPagina = 10;

    // --- 1. CARGA DE DATOS ---
    async function initProveedores() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/proveedores', {
                headers: { 'x-auth-token': token }
            });

            if(res.ok) {
                proveedoresData = await res.json();
                proveedoresFiltrados = [...proveedoresData];
                renderTabla();
            } else {
                showToast("Error al obtener la lista de socios comerciales.", "error");
            }
        } catch (error) { 
            console.error(error);
            showToast("Fallo de conexión con el servidor.", "error");
        }
    }

    // --- 2. RENDERIZADO PROFESIONAL ---
    function renderTabla() {
        const tbody = document.getElementById('tabla-proveedores-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        const inicio = (paginaActual - 1) * filasPorPagina;
        const fin = inicio + filasPorPagina;
        const datosPagina = proveedoresFiltrados.slice(inicio, fin);

        if(datosPagina.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#888;">No se encontraron registros.</td></tr>';
            return;
        }

        datosPagina.forEach(prov => {
            const tr = document.createElement('tr');
            
            // Lógica de Categorías (Coherente con CSS)
            let catLabel = (prov.categoria || 'Varios').toUpperCase();
            let statusClass = prov.estado === 'activo' ? 'status-active' : 'status-inactive';

            tr.innerHTML = `
                <td style="font-family: 'Courier New', monospace; font-weight:700;">${prov.ruc}</td>
                <td style="font-weight:600; color:var(--text-color-main);">${prov.razon_social}</td>
                <td><span class="status-badge" style="background:#f0f4ff; color:#3f51b5; border:1px solid #d1d9ff;">${catLabel}</span></td>
                <td>
                    <div class="client-contact">
                        <span><i class='bx bxs-user-circle'></i> ${prov.nombre_contacto || '-'}</span>
                        <span style="font-size:11px;"><i class='bx bxs-phone'></i> ${prov.telefono || '-'}</span>
                    </div>
                </td>
                <td style="text-align:center; font-weight:700; color:#555;">${prov.dias_credito} <small>DÍAS</small></td>
                <td><span class="status-badge ${statusClass}">${prov.estado || 'Activo'}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action edit" onclick="window.editarProveedor(${prov.id})" title="Editar"><i class='bx bx-edit-alt'></i></button>
                        <button class="btn-action delete" onclick="window.eliminarProveedor(${prov.id})" title="Eliminar"><i class='bx bx-trash'></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        actualizarPaginacion();
    }

    // --- 3. VALIDACIÓN Y GUARDADO ---
    window.guardarProveedor = async function() {
        const id = document.getElementById('prov-id').value;
        const ruc = document.getElementById('prov-ruc').value.trim();
        const razon = document.getElementById('prov-razon').value.trim();
        const categoria = document.getElementById('prov-categoria').value;
        const dias = document.getElementById('prov-dias').value;
        const email = document.getElementById('prov-email').value.trim();
        const telefono = document.getElementById('prov-telefono').value.trim();

        // 🛡️ BLINDAJE DE INPUTS (VALIDACIÓN AVANZADA)
        if (!ruc || (ruc.length !== 11 && ruc.length !== 8)) {
            return showToast("RUC inválido. Debe tener 11 dígitos (o 8 para DNI).", "error");
        }
        if (!razon) return showToast("La Razón Social es obligatoria.", "error");
        if (!categoria) return showToast("Debe seleccionar una categoría.", "error");
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return showToast("El formato de correo no es válido.", "error");
        }
        if (telefono && telefono.length < 7) {
            return showToast("El número de teléfono es demasiado corto.", "error");
        }

        const data = {
            ruc, 
            razon, 
            direccion: document.getElementById('prov-direccion').value.trim(),
            categoria,
            dias: parseInt(dias) || 0,
            contacto: document.getElementById('prov-contacto').value.trim(),
            email: email || null,
            telefono: telefono || null,
            banco: document.getElementById('prov-banco').value.trim(),
            estado: 'activo'
        };

        try {
            const token = localStorage.getItem('token');
            const url = id ? `/api/proveedores/${id}` : '/api/proveedores';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                body: JSON.stringify(data)
            });

            const resp = await res.json();
            
            if(res.ok) {
                showToast(resp.msg, "success");
                window.cerrarModalProveedor();
                initProveedores();
            } else {
                showToast(resp.msg, "error");
            }
        } catch (e) { 
            console.error(e); 
            showToast("Error de comunicación con el servidor.", "error"); 
        }
    };

    // --- 4. CRUD AUXILIARES ---
    window.editarProveedor = function(id) {
        const prov = proveedoresData.find(p => p.id === id);
        if(!prov) return;

        window.abrirModalProveedor();
        document.querySelector('.modal-header h3').innerText = "Actualizar Socio Comercial";
        
        document.getElementById('prov-id').value = prov.id;
        document.getElementById('prov-ruc').value = prov.ruc;
        document.getElementById('prov-razon').value = prov.razon_social;
        document.getElementById('prov-direccion').value = prov.direccion || '';
        document.getElementById('prov-categoria').value = prov.categoria;
        document.getElementById('prov-dias').value = prov.dias_credito;
        document.getElementById('prov-contacto').value = prov.nombre_contacto || '';
        document.getElementById('prov-email').value = prov.correo_contacto || '';
        document.getElementById('prov-telefono').value = prov.telefono || '';
        document.getElementById('prov-banco').value = prov.cuenta_bancaria || '';
    };

    window.eliminarProveedor = async function(id) {
        const confirmado = await showConfirm("¿Estás seguro? Los proveedores con facturas registradas serán archivados en lugar de eliminados.", "Confirmar Eliminación");
        
        if(!confirmado) return;

        try {
            const res = await fetch(`/api/proveedores/${id}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            const data = await res.json();
            
            if(res.ok) {
                showToast(data.msg, "success");
                initProveedores();
            } else {
                showToast(data.msg, "error");
            }
        } catch(e) {
            showToast("Error al procesar la solicitud.", "error");
        }
    };

    // --- 5. INTERFAZ Y BÚSQUEDA ---
    window.abrirModalProveedor = function() {
        document.getElementById('modal-proveedor').classList.add('active');
        document.getElementById('form-nuevo-proveedor').reset();
        document.getElementById('prov-id').value = "";
    };

    // --- 6. UTILIDAD DE PAGINACIÓN ---
    window.cambiarPaginaProv = function(delta) {
        const totalPaginas = Math.ceil(proveedoresFiltrados.length / filasPorPagina);
        const nuevaPagina = paginaActual + delta;
        
        if (nuevaPagina >= 1 && nuevaPagina <= totalPaginas) {
            paginaActual = nuevaPagina;
            renderTabla();
        }
    };
// --- FUNCIÓN DE BÚSQUEDA INTEGRADA ---
    window.buscarDatosSunat = async function(idDoc, idNombre, idDireccion) {
        console.log("🔍 Iniciando búsqueda SUNAT...");

        // 1. Obtener elementos del DOM
        const inputDoc = document.getElementById(idDoc);
        const inputNombre = document.getElementById(idNombre);
        const inputDireccion = document.getElementById(idDireccion);
        const iconBtn = document.getElementById('btn-search-prov'); // El icono de la lupa

        if (!inputDoc || !inputNombre) return console.error("Error: Inputs no encontrados en el HTML");

        const numero = inputDoc.value.trim();

        // 2. Validaciones
        if (numero.length !== 8 && numero.length !== 11) {
            return alert("⚠️ El documento debe tener 8 (DNI) u 11 (RUC) dígitos.");
        }

        // 3. Feedback Visual (Loading)
        if(iconBtn) {
            iconBtn.className = 'bx bx-loader-alt bx-spin'; // Cambiar lupa por spinner
            iconBtn.style.color = '#f59e0b'; // Color naranja
        }
        inputNombre.placeholder = "Buscando en SUNAT...";
        inputNombre.value = "";
        
        try {
            const token = localStorage.getItem('token');
            console.log(`📡 Consultando API: /api/consultas/${numero}`);

            // 4. Petición al Backend
            const res = await fetch(`/api/consultas/${numero}`, {
                headers: { 'x-auth-token': token }
            });

            const data = await res.json();
            console.log("📥 Respuesta recibida:", data);

            if (res.ok && data.success) {
                // ✅ ÉXITO: Llenar campos
                inputNombre.value = data.nombre; // Usamos el campo unificado
                
                // Efecto visual verde
                inputNombre.style.backgroundColor = "#dcfce7";
                setTimeout(() => inputNombre.style.backgroundColor = "#fff", 1500);

                // Si es RUC, llenar dirección
                if (data.tipo === 'RUC' && inputDireccion) {
                    inputDireccion.value = data.direccion || '';
                    
                    // Alerta si el RUC no está bien
                    if (data.estado !== 'ACTIVO' || data.condicion !== 'HABIDO') {
                        alert(`⚠️ ALERTA: RUC ${data.estado} / ${data.condicion}`);
                    }
                }

            } else {
                // ❌ ERROR API
                inputNombre.value = "";
                inputNombre.removeAttribute('readonly');
                inputNombre.placeholder = "No encontrado. Escriba manualmente.";
                inputNombre.focus();
                alert("⚠️ " + (data.msg || "No se encontraron datos."));
            }

        } catch (error) {
            console.error("❌ Error JS:", error);
            alert("Error de conexión con el servidor.");
        } finally {
            // 5. Restaurar Icono
            if(iconBtn) {
                iconBtn.className = 'bx bx-search-alt';
                iconBtn.style.color = '#4f46e5';
            }
        }
    };

    window.cerrarModalProveedor = function() {
        document.getElementById('modal-proveedor').classList.remove('active');
    };

    function actualizarPaginacion() {
        const totalPaginas = Math.ceil(proveedoresFiltrados.length / filasPorPagina);
        const info = document.querySelector('.pagination .page-info');
        if(info) info.innerText = `Página ${paginaActual} de ${totalPaginas || 1}`;
        
        // El HTML debe tener botones con onclick="window.cambiarPagina(1)" etc.
    }

    const buscador = document.getElementById('buscador-proveedores');
    if(buscador) {
        buscador.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            proveedoresFiltrados = proveedoresData.filter(p => 
                p.razon_social.toLowerCase().includes(term) || p.ruc.includes(term)
            );
            paginaActual = 1;
            renderTabla();
        };
    }

    initProveedores();

})();