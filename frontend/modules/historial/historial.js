// Ubicacion: SuperNova/frontend/modules/historial/historial.js

(function() {
    console.log("Modulo Historial de Ventas Conectado 📜");

    // URL Relativa (Mejor práctica para producción)
    const API_BASE = '/api'; 

    let historialGlobal = []; 
    let currentPage = 1;      
    const ITEMS_PER_PAGE = 15; 
    
    // --- 1. INICIALIZAR Y OBTENER DATOS ---
    async function initHistorial() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return console.error("No hay token");

            const res = await fetch(`${API_BASE}/ventas/historial`, {
                headers: { 'x-auth-token': token }
            });
            
            const data = await res.json();
            
            if (res.ok && Array.isArray(data)) {
                historialGlobal = data;
                aplicarFiltrosYPaginacion(); 
            } else {
                document.getElementById('tabla-historial-body').innerHTML = 
                    `<tr><td colspan="7" style="text-align:center; color:red;">${data.msg || 'Error al cargar los datos.'}</td></tr>`;
            }

        } catch (error) {
            console.error("Error historial:", error);
            document.getElementById('tabla-historial-body').innerHTML = 
                '<tr><td colspan="7" style="text-align:center; color:red;">Error de conexión.</td></tr>';
        }
    }

    // --- 2. RENDERIZAR TABLA ---
    function renderizarTablaHistorial(datos) {
        const tbody = document.getElementById('tabla-historial-body');
        if (!tbody) return;
        tbody.innerHTML = '';
        
        if (datos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">No se encontraron resultados.</td></tr>';
            return;
        }

        // Detectar Admin para mostrar botón de eliminar
        const currentUser = JSON.parse(localStorage.getItem('usuario') || localStorage.getItem('user')) || {};
        // Aceptamos 'admin' o 'administrador' (case insensitive)
        const rol = (currentUser.rol || '').toLowerCase();
        const isAdmin = rol === 'admin' || rol === 'administrador';
        
        // Paginación
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const dataToRender = datos.slice(startIndex, endIndex);
        
        dataToRender.forEach(v => {
            const tr = document.createElement('tr');
            
            const nombreCompleto = `${v.nombre_usuario} ${v.apellido_usuario || ''}`.trim();
            const clienteInfo = v.nombre_cliente_temporal || v.doc_cliente_temporal || 'Consumidor Final';

            let btnDeleteHtml = ''; 
            if (isAdmin) {
                 btnDeleteHtml = `<button class="btn-action delete" title="Eliminar Venta" onclick="eliminarVenta(${v.id})"><i class='bx bx-trash'></i></button>`;
            }
            
            tr.innerHTML = `
                <td><strong>#${v.id}</strong></td>
                <td>${v.fecha_venta ? new Date(v.fecha_venta).toLocaleString() : '-'}</td>
                <td>${clienteInfo}</td>
                <td>
                    <small>${v.nombre_sede}</small><br>
                    <small style="color:#666">${nombreCompleto}</small>
                </td>
                <td style="font-weight: 700; color:#333; text-align:right;">S/ ${parseFloat(v.total_venta).toFixed(2)}</td>
                <td>${v.metodo_pago || '-'}</td>
                <td>
                    <button class="btn-action btn-view" title="Ver Detalle" onclick="verDetallesVenta(${v.id})">
                        <i class='bx bx-search-alt'></i>
                    </button>
                    ${btnDeleteHtml}
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // Aquí podrías llamar a una función para dibujar los botones de paginación si tienes el HTML
        // renderizarPaginacion(datos.length);
    }

    // --- 3. VER DETALLE (MODAL) ---
    window.verDetallesVenta = async function(ventaId) {
        const modal = document.getElementById('modal-detalle-venta');
        const body = document.getElementById('detalle-venta-body');
        
        modal.classList.add('active');
        document.getElementById('detalle-ticket-id').innerText = ventaId;
        body.innerHTML = '<div style="text-align:center; padding:20px"><i class="bx bx-loader-alt bx-spin"></i> Cargando...</div>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE}/ventas/detalle/${ventaId}`, {
                headers: { 'x-auth-token': token }
            });
            
            const data = await res.json();
            
            if (res.ok && Array.isArray(data)) {
                let html = '<ul style="list-style:none; padding:0;">';
                data.forEach(item => {
                    html += `
                        <li style="padding:10px; border-bottom:1px solid #eee; display:flex; justify-content:space-between;">
                            <div>
                                <strong>${item.cantidad} x ${item.nombre_producto_historico}</strong>
                                <br><small style="color:#666">Unit: S/ ${parseFloat(item.precio_unitario).toFixed(2)}</small>
                            </div>
                            <div style="font-weight:bold;">S/ ${parseFloat(item.subtotal).toFixed(2)}</div>
                        </li>
                    `;
                });
                html += '</ul>';
                body.innerHTML = html;
            } else {
                body.innerHTML = `<p style="color:red;">Error: ${data.msg || 'Fallo al cargar el detalle.'}</p>`;
            }
            
        } catch(e) {
            console.error(e);
            body.innerHTML = `<p style="color:red;">Error de red.</p>`;
        }
    }

    window.cerrarModalDetalle = function() {
        document.getElementById('modal-detalle-venta').classList.remove('active');
    }

    // --- 4. FILTROS ---
    window.filtrarHistorial = function() { // Función unificada para llamar desde el HTML
        aplicarFiltrosYPaginacion();
    }

    window.aplicarFiltrosYPaginacion = function() {
        const termino = document.getElementById('historial-search').value.toLowerCase();
        const fecha = document.getElementById('filtro-fecha-historial').value;
        
        let filtrados = historialGlobal;

        if (termino) {
            filtrados = filtrados.filter(v => 
                (v.nombre_usuario && v.nombre_usuario.toLowerCase().includes(termino)) ||
                (v.doc_cliente_temporal && v.doc_cliente_temporal.includes(termino)) ||
                String(v.id).includes(termino)
            );
        }
        
        if (fecha) {
            filtrados = filtrados.filter(v => v.fecha_venta.startsWith(fecha));
        }

        currentPage = 1; // Resetear al filtrar
        renderizarTablaHistorial(filtrados);
    }

    // --- 5. EXPORTAR EXCEL ---
    window.exportarHistorialVentas = function() {
        if (!historialGlobal || historialGlobal.length === 0) {
            // Usamos alert si no tienes showToast global
            return alert("No hay datos para exportar.");
        }

        if (typeof XLSX === 'undefined') return alert("Error: Librería Excel no cargada.");

        const datosFormateados = historialGlobal.map(v => ({
            "TICKET": v.id,
            "FECHA": v.fecha_venta ? v.fecha_venta.slice(0, 10) : '-',
            "CLIENTE": v.nombre_cliente_temporal || v.doc_cliente_temporal || 'Consumidor Final',
            "SEDE": v.nombre_sede,
            "USUARIO": v.nombre_usuario,
            "TOTAL": parseFloat(v.total_venta).toFixed(2),
            "MÉTODO": v.metodo_pago
        }));

        const ws = XLSX.utils.json_to_sheet(datosFormateados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Ventas");

        const fechaHoy = new Date().toISOString().slice(0, 10);
        XLSX.writeFile(wb, `Ventas_SuperNova_${fechaHoy}.xlsx`);
    }

    // --- 6. ELIMINAR VENTA ---
    window.eliminarVenta = async function(id) {
        if (!confirm(`¿Eliminar la Venta N° ${id} permanentemente?\nEsto borrará el dinero de la caja, pero NO devolverá el stock.`)) {
            return;
        }
        
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE}/ventas/${id}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': token }
            });
            
            const data = await res.json();

            if (res.ok) {
                alert("✅ " + data.msg);
                initHistorial(); // Recarga la tabla
            } else {
                alert("❌ " + (data.msg || "Fallo al eliminar venta."));
            }
        } catch (e) {
            alert("Error de conexión al eliminar.");
        }
    }

    // INICIAR
    initHistorial();

})();