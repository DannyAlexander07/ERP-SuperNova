// Ubicación: SuperNova/frontend/modules/historial/historial.js

(function() {
    console.log("Modulo Historial de Ventas Conectado 📜");

    // URL Relativa
    const API_BASE = '/api'; 

    let historialGlobal = []; 
    let currentPage = 1;      
    const ITEMS_PER_PAGE = 8; 
    
    // Variable para el filtro de Superadmin
    let filtroSedeActual = ""; 

    // --- 1. INICIALIZAR Y OBTENER DATOS ---
    window.initHistorial = async function() {
        await configurarFiltroAdmin(); // 1. Configurar permisos
        await cargarHistorial();       // 2. Cargar datos
    }

    // --- 1.1 LÓGICA SUPERADMIN (FILTRO SEDES) ---
    async function configurarFiltroAdmin() {
        const usuarioStr = localStorage.getItem('usuario') || localStorage.getItem('user');
        if (!usuarioStr) return;

        const usuario = JSON.parse(usuarioStr);
        const rol = (usuario.rol || '').toLowerCase();
        
        // Solo Superadmin o Gerente ven el filtro
        const esSuperAdmin = rol === 'superadmin' || rol === 'gerente';
        
        const select = document.getElementById('filtro-sede-historial');
        if (!select) return;

        if (esSuperAdmin) {
            select.style.display = 'block'; // Mostrar selector
            
            try {
                // Cargar lista de sedes
                const token = localStorage.getItem('token');
                const res = await fetch(`${API_BASE}/sedes`, { headers: { 'x-auth-token': token } });
                if (res.ok) {
                    const sedes = await res.json();
                    select.innerHTML = '<option value="">🏢 Todas las Sedes (Global)</option>';
                    sedes.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.innerText = `📍 ${s.nombre}`;
                        select.appendChild(opt);
                    });
                }
            } catch (e) { console.error("Error cargando sedes", e); }
        } else {
            select.style.display = 'none'; // Ocultar para admins locales
        }
    }

    // Evento del Select (HTML onchange)
    window.filtrarHistorialPorSede = function() {
        const select = document.getElementById('filtro-sede-historial');
        filtroSedeActual = select.value;
        currentPage = 1;
        cargarHistorial(); // Recargar desde Backend
    }

    // --- 1.2 CARGAR DATOS DEL BACKEND ---
    window.cargarHistorial = async function() {
        const tbody = document.getElementById('tabla-historial-body');
        if(tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">Cargando ventas...</td></tr>';

        try {
            const token = localStorage.getItem('token');
            if (!token) return console.error("No hay token");

            // 🔥 AQUÍ ENVIAMOS EL FILTRO
            const res = await fetch(`${API_BASE}/ventas/historial?sede=${filtroSedeActual}`, {
                headers: { 'x-auth-token': token }
            });
            
            const data = await res.json();
            
            if (res.ok && Array.isArray(data)) {
                historialGlobal = data;
                aplicarFiltrosYPaginacion(); 
            } else {
                if(tbody) tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:red;">${data.msg || 'Error al cargar los datos.'}</td></tr>`;
            }

        } catch (error) {
            console.error("Error historial:", error);
            if(tbody) tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; color:red;">Error de conexión.</td></tr>';
        }
    }

    // --- 2. RENDERIZAR TABLA (ACTUALIZADA CON SEDE) ---
function renderizarTablaHistorial(datos) {
    const tbody = document.getElementById('tabla-historial-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // 1. Validar si hay datos
    if (!datos || datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">No se encontraron resultados.</td></tr>';
        const paginacionDiv = document.getElementById('historial-paginacion');
        if(paginacionDiv) paginacionDiv.innerHTML = '';
        return;
    }

    // 2. Lógica de Paginación
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const dataToRender = datos.slice(startIndex, endIndex);
    
    // 3. Renderizar Filas
    dataToRender.forEach(v => {
        const tr = document.createElement('tr');
        
        // A. Fechas
        const fechaStr = v.fecha_venta ? new Date(v.fecha_venta).toLocaleDateString() : '-';
        const horaStr  = v.fecha_venta ? new Date(v.fecha_venta).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';

        // B. Cliente y Vendedor
        const clienteInfo = v.nombre_cliente_temporal || v.doc_cliente_temporal || 'Consumidor Final';
        const vendedorTexto = v.nombre_vendedor 
            ? `${v.nombre_vendedor} ${v.apellido_vendedor || ''}`.trim() 
            : '<span style="color:#aaa; font-style:italic; font-size:11px">No asignado</span>';
        const cajeroTexto = v.nombre_cajero || v.nombre_usuario || 'Sistema';

        // C. DETECTAR DESCUENTO (Lógica Visual) 🏷️
        let precioHtml = `S/ ${parseFloat(v.total_venta).toFixed(2)}`;

        // Validamos si 'observaciones' existe y tiene la palabra clave
        if (v.observaciones && (v.observaciones.includes('Descuento') || v.observaciones.includes('Convenio'))) {
            // Intentamos extraer el porcentaje, ej: "50%"
            const match = v.observaciones.match(/(\d+%)/); 
            const porcentaje = match ? match[0] : "OFF";
            
            // Etiqueta verde debajo del precio
            precioHtml += `<br><span style="background:#dcfce7; color:#166534; font-size:10px; padding:2px 6px; border-radius:4px; font-weight:bold; border:1px solid #bbf7d0;">🏷️ ${porcentaje} DESC.</span>`;
        }

        const btnDeleteHtml = `<button class="btn-icon delete" title="Anular Venta" onclick="eliminarVenta(${v.id})" style="color:#ef4444;"><i class='bx bx-block'></i></button>`;
        
        tr.innerHTML = `
            <td>
                <div style="font-weight:600">${fechaStr}</div>
                <div style="font-size:11px; color:#666">${horaStr}</div>
            </td>
            
            <td>
                <span style="background:#e0e7ff; color:#3730a3; padding:3px 8px; border-radius:4px; font-weight:700; font-size:11px;">
                    ${v.nombre_sede || 'Local'}
                </span>
            </td>

            <td style="font-weight:bold; font-size:15px; color:#333;">
                ${v.codigo_visual || '#' + v.id}
            </td>

            <td>${clienteInfo}</td>

            <td><span class="badge badge-soft-primary">${v.metodo_pago || '-'}</span></td>

            <td style="font-weight: 700; color:#16a34a; font-size:15px;">${precioHtml}</td>

            <td>
                <div style="display:flex; align-items:center; gap:5px;">
                    <i class='bx bx-star' style="color:#f59e0b;"></i>
                    <span style="font-weight:600; color:#333; font-size:13px;">${vendedorTexto}</span>
                </div>
            </td>

            <td>
                <div style="display:flex; align-items:center; gap:5px; color:#666;">
                    <i class='bx bx-desktop'></i> 
                    <span style="font-size:12px;">${cajeroTexto}</span>
                </div>
            </td>

            <td>
                <button class="btn-icon" title="Ver Detalle" onclick="verDetallesVenta(${v.id})" style="color:#4f46e5; margin-right:5px;">
                    <i class='bx bx-show'></i>
                </button>
                ${btnDeleteHtml}
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    renderizarPaginacion(datos.length, datos);
}
    // --- 3. VER DETALLE (MODAL) ---
    window.verDetallesVenta = async function(ventaId) {
        const modal = document.getElementById('modal-detalle-venta');
        const body = document.getElementById('detalle-venta-body');
        
        modal.classList.add('active');
        document.getElementById('detalle-ticket-id').innerText = "#" + ventaId;
        body.innerHTML = '<div style="text-align:center; padding:20px"><i class="bx bx-loader-alt bx-spin"></i> Cargando...</div>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE}/ventas/detalle/${ventaId}`, { // Asegúrate que esta ruta exista en tu backend (la creamos antes)
                headers: { 'x-auth-token': token }
            });
            
            // Si el backend no tiene la ruta /detalle/:id, usar la ruta vieja
            // Pero en el paso anterior creamos exports.obtenerDetalleVenta
            
            if (res.ok) {
                const data = await res.json();
                let html = `
                    <table style="width:100%; border-collapse:collapse; font-size:13px;">
                        <thead style="background:#f8fafc; color:#64748b;">
                            <tr>
                                <th style="padding:8px; text-align:left;">Producto</th>
                                <th style="padding:8px; text-align:center;">Cant.</th>
                                <th style="padding:8px; text-align:right;">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                `;
                
                data.forEach(item => {
                    html += `
                        <tr style="border-bottom:1px solid #eee;">
                            <td style="padding:8px;">${item.nombre_producto_historico}</td>
                            <td style="padding:8px; text-align:center;">${item.cantidad}</td>
                            <td style="padding:8px; text-align:right;">S/ ${parseFloat(item.subtotal).toFixed(2)}</td>
                        </tr>
                    `;
                });
                html += `</tbody></table>`;
                body.innerHTML = html;
            } else {
                body.innerHTML = `<p style="color:red;">Error al cargar detalle.</p>`;
            }
            
        } catch(e) {
            console.error(e);
            body.innerHTML = `<p style="color:red;">Error de red.</p>`;
        }
    }

    window.cerrarModalDetalle = function() {
        document.getElementById('modal-detalle-venta').classList.remove('active');
    }

    // --- 4. FILTROS LOCALES ---
    window.filtrarTablaLocal = function() { // Renombrado para coincidir con HTML nuevo
        aplicarFiltrosYPaginacion();
    }
    
    // Mantenemos compatibilidad con tu HTML viejo si usas 'filtrarHistorial'
    window.filtrarHistorial = function() { 
        aplicarFiltrosYPaginacion(); 
    }

    window.aplicarFiltrosYPaginacion = function() {
        const inputSearch = document.getElementById('historial-search');
        const termino = inputSearch ? inputSearch.value.trim().toLowerCase() : "";
        
        // Si usas filtro de fecha (opcional, si existe en tu HTML)
        const filtroFecha = document.getElementById('filtro-fecha-historial');
        const fecha = filtroFecha ? filtroFecha.value : "";
        
        let filtrados = historialGlobal;

        // 1. FILTRO DE TEXTO (Buscador)
        if (termino) {
            filtrados = filtrados.filter(v => {
                // Convertimos a string y minúsculas para comparar sin errores
                // Usamos || '' para evitar que falle si el campo viene null
                const ticket = (v.codigo_visual || '').toLowerCase();        // Busca "M-0021"
                const cliente = (v.nombre_cliente_temporal || '').toLowerCase(); // Busca "Juan Perez"
                const dni = (v.doc_cliente_temporal || '').toLowerCase();    // Busca DNI
                const vendedor = (v.nombre_vendedor || '').toLowerCase();    // Busca Vendedor
                const cajero = (v.nombre_cajero || v.nombre_usuario || '').toLowerCase(); // Busca Cajero

                return ticket.includes(termino) || 
                       cliente.includes(termino) || 
                       dni.includes(termino) ||
                       vendedor.includes(termino) ||
                       cajero.includes(termino);
            });
        }
        
        // 2. FILTRO DE FECHA
        if (fecha) {
            filtrados = filtrados.filter(v => v.fecha_venta && v.fecha_venta.startsWith(fecha));
        }

        currentPage = 1; 
        renderizarTablaHistorial(filtrados);
    }
    
    // --- 5. EXPORTAR EXCEL ---
    window.exportarHistorialVentas = function() {
        if (!historialGlobal || historialGlobal.length === 0) return alert("No hay datos.");
        if (typeof XLSX === 'undefined') return alert("Librería Excel no cargada.");

        const datosFormateados = historialGlobal.map(v => ({
            "TICKET": v.id,
            "FECHA": v.fecha_venta ? v.fecha_venta.slice(0, 10) : '-',
            "HORA": v.fecha_venta ? new Date(v.fecha_venta).toLocaleTimeString() : '-',
            "SEDE": v.nombre_sede,
            "CLIENTE": v.nombre_cliente_temporal || 'Consumidor Final',
            "DNI": v.doc_cliente_temporal || '-',
            "USUARIO": v.nombre_usuario,
            "TOTAL (S/)": parseFloat(v.total_venta).toFixed(2),
            "MÉTODO": v.metodo_pago
        }));

        const ws = XLSX.utils.json_to_sheet(datosFormateados);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Ventas");
        XLSX.writeFile(wb, `Ventas_${new Date().toISOString().slice(0, 10)}.xlsx`);
    }

    // --- 6. ELIMINAR VENTA (ANULAR) ---
    window.eliminarVenta = async function(id) {
        if (!confirm(`⚠️ ¿ANULAR Venta #${id}?\n\n- Se devolverá el stock.\n- Se restará el dinero de caja.\n- Acción irreversible.`)) return;
        
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE}/ventas/${id}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': token }
            });
            
            const data = await res.json();

            if (res.ok) {
                alert("✅ " + data.msg);
                cargarHistorial(); // Recargar tabla
            } else {
                alert("❌ " + (data.msg || "Error al anular."));
            }
        } catch (e) {
            alert("Error de conexión.");
        }
    }

    // --- 7. PAGINACIÓN ---
    function renderizarPaginacion(totalItems, datosFiltrados) {
        const contenedor = document.getElementById('historial-paginacion');
        if (!contenedor) return;

        const totalPaginas = Math.ceil(totalItems / ITEMS_PER_PAGE);

        if (totalPaginas <= 1) {
            contenedor.innerHTML = '';
            return;
        }

        contenedor.innerHTML = `
            <div class="pagination-wrapper" style="background:#fff; border:1px solid #ddd; border-radius:50px; padding:5px 15px; display:flex; align-items:center; gap:10px;">
                <span style="font-size:12px; color:#666;">Pág <strong>${currentPage}</strong> de <strong>${totalPaginas}</strong></span>
                <div style="display:flex; gap:5px;">
                    <button onclick="cambiarPaginaHistorial(-1)" ${currentPage === 1 ? 'disabled' : ''} style="border:none; background:transparent; cursor:pointer; font-size:18px;">
                        <i class='bx bx-chevron-left'></i>
                    </button>
                    <button onclick="cambiarPaginaHistorial(1)" ${currentPage >= totalPaginas ? 'disabled' : ''} style="border:none; background:transparent; cursor:pointer; font-size:18px;">
                        <i class='bx bx-chevron-right'></i>
                    </button>
                </div>
            </div>
        `;
        
        window.cambiarPaginaHistorial = function(delta) {
            currentPage += delta;
            renderizarTablaHistorial(datosFiltrados); 
        };
    }

    // INICIAR
    initHistorial();

})();