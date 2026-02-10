// Ubicacion: frontend/modules/historial/historial.js

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
        if(tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center">Cargando ventas...</td></tr>';

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
                if(tbody) tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:red;">${data.msg || 'Error al cargar los datos.'}</td></tr>`;
            }

        } catch (error) {
            console.error("Error historial:", error);
            if(tbody) tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; color:red;">Error de conexión.</td></tr>';
        }
    }

// --- 2. RENDERIZAR TABLA (FINAL: ANULACIÓN HABILITADA PARA B2B/TERCEROS) ---
function renderizarTablaHistorial(datos) {
    const tbody = document.getElementById('tabla-historial-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // 1. Validar si hay datos
    if (!datos || datos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center; padding:20px;">No se encontraron resultados.</td></tr>';
        const paginacionDiv = document.getElementById('historial-paginacion');
        if(paginacionDiv) paginacionDiv.innerHTML = '';
        return;
    }

    // 2. Paginación
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
        const vendedorTexto = v.nombre_vendedor ? `${v.nombre_vendedor}`.trim() : '<span style="color:#aaa;">No asignado</span>';
        const cajeroTexto = v.nombre_cajero || v.nombre_usuario || 'Sistema';

        // C. Precios y Descuentos (% DINÁMICO)
        const totalVenta = parseFloat(v.total_venta || 0);
        let precioHtml = "";

        if (totalVenta === 0 && (v.nombre_producto_historico || "").includes("(Hijo)")) {
            precioHtml = `<span style="color:#94a3b8; font-size:11px; font-weight:700;">[INCLUIDO EN COMBO]</span>`;
        } else {
            precioHtml = `<span style="font-weight: 700; color:#16a34a; font-size:15px;">S/ ${totalVenta.toFixed(2)}</span>`;
            
            // Lógica para mostrar etiqueta de descuento
            if (v.observaciones && (v.observaciones.includes('Descuento') || v.observaciones.includes('Convenio'))) {
                // Intenta extraer el número del porcentaje (ej: "Descuento: 20%")
                const matchPorcentaje = v.observaciones.match(/(\d+)%/);
                const etiquetaTexto = matchPorcentaje ? `-${matchPorcentaje[1]}%` : 'OFF';
                
                precioHtml += `<br><span style="background:#dcfce7; color:#15803d; font-size:10px; padding:1px 6px; border-radius:4px; font-weight:800; border:1px solid #bbf7d0;">🏷️ ${etiquetaTexto}</span>`;
            }
        }

        // D. Estado SUNAT y Tipo Doc
        let tipoDocHtml = '';
        let estadoSunatHtml = '';

        if (v.sunat_estado && v.sunat_estado !== 'NO_APLICA') {
            let colorEstado = '#64748b'; 
            let iconEstado = '';
            let btnRefrescar = '';
            
            if (v.sunat_estado === 'ACEPTADA') { colorEstado = '#10b981'; iconEstado='bx-check'; } 
            else if (v.sunat_estado === 'PENDIENTE') { 
                colorEstado = '#f59e0b'; iconEstado='bx-time'; 
                btnRefrescar = `<i class='bx bx-refresh' onclick="consultarEstadoSunat(${v.id})" style="cursor:pointer; margin-left:5px; font-size:14px; vertical-align:middle;" title="Actualizar estado Nubefact"></i>`;
            }
            else if (v.sunat_estado === 'ANULADA') { colorEstado = '#ef4444'; iconEstado='bx-x'; } 
            else if (v.sunat_estado === 'ERROR') { colorEstado = '#dc2626'; iconEstado='bx-error'; }

            estadoSunatHtml = `<div style="margin-top:2px; font-size:10px; color:${colorEstado}; font-weight:700;">
                <i class='bx ${iconEstado}'></i> ${v.sunat_estado} ${btnRefrescar}
            </div>`;
        }

        const serieCorr = (v.serie && v.correlativo) ? `<br><small style="color:#666; font-family:monospace;">${v.serie}-${v.correlativo}</small>` : '';

        if (v.tipo_comprobante === 'Factura') tipoDocHtml = `<span class="badge" style="background:#e0e7ff; color:#4338ca; border:1px solid #c7d2fe;">FACTURA</span>${serieCorr}${estadoSunatHtml}`;
        else if (v.tipo_comprobante === 'Recibo Interno') tipoDocHtml = `<span class="badge" style="background:#fff7ed; color:#c2410c; border:1px solid #fdba74;">RECIBO</span>`;
        else tipoDocHtml = `<span class="badge" style="background:#f3f4f6; color:#4b5563; border:1px solid #e5e7eb;">BOLETA</span>${serieCorr}${estadoSunatHtml}`;

        // E. Método Pago
        let metodoHtml = `<span class="badge badge-soft-primary">${v.metodo_pago || '-'}</span>`;
        if (v.metodo_pago === 'Tarjeta') metodoHtml += `<div style="font-size:10px; color:#666; margin-top:2px;">${v.tipo_tarjeta === 'Credito' ? '🏦' : '💳'} ${v.tipo_tarjeta || ''}</div>`;
        else if (v.metodo_pago === 'Yape') metodoHtml = `<span class="badge-pago badge-yape" style="font-size:11px"><i class='bx bx-qr'></i> Yape</span>`;
        else if (v.metodo_pago === 'Plin') metodoHtml = `<span class="badge-pago badge-plin" style="font-size:11px"><i class='bx bx-mobile-alt'></i> Plin</span>`;

        // 🔥 F. ACCIONES (LIMPIAS, SIN DUPLICADOS Y DATOS COMPLETOS)
        let acciones = [];

        // 1. OJO (Ver Detalle)
        // Permitimos ver detalle de todos, incluido COBRO_CUOTA
        if (v.origen === 'VENTA_POS' || !v.origen || v.origen === 'CRM_SALDO' || v.origen === 'COBRO_CUOTA') {
            acciones.push(`<button class="btn-icon" title="Ver Detalle" onclick="verDetallesVenta(${v.id}, '${v.codigo_visual}')" style="color:#4f46e5;"><i class='bx bx-show'></i></button>`);
        } else {
            acciones.push(`<button class="btn-icon" title="${v.observaciones}" style="color:#059669; cursor:help;"><i class='bx bx-info-circle'></i></button>`);
        }

        // 2. DOCUMENTOS Y COMPARTIR
        if (v.enlace_pdf) {
            // PDF Rojo
            acciones.push(`<a href="${v.enlace_pdf}" target="_blank" class="btn-icon" title="Imprimir" style="color:#dc2626;"><i class='bx bxs-file-pdf'></i></a>`);
            
            // WHATSAPP (Verde - Pasamos TODOS los datos)
            const nombreClean = (v.nombre_cliente_temporal || 'Cliente').replace(/'/g, ""); 
            const ticketClean = v.codigo_visual || `${v.serie}-${v.correlativo}`; // ✅ Valor real
            const totalClean = parseFloat(v.total_venta || 0).toFixed(2);        // ✅ Valor real

            acciones.push(`<button onclick="abrirModalWhatsapp('${v.enlace_pdf}', '${nombreClean}', '${ticketClean}', '${totalClean}')" class="btn-icon" title="WhatsApp" style="color:#25D366; border:none; background:transparent; cursor:pointer;"><i class='bx bxl-whatsapp' style="font-size: 1.2rem;"></i></button>`);
            
            // CORREO (Azul)
            acciones.push(`<button onclick="abrirModalCorreo(${v.id})" class="btn-icon" title="Email" style="color:#0ea5e9; border:none; background:transparent; cursor:pointer;"><i class='bx bx-envelope' style="font-size: 1.2rem;"></i></button>`);
        }

        // 3. XML (Gris - Ícono código)
        if (v.enlace_xml) {
            acciones.push(`<a href="${v.enlace_xml}" target="_blank" class="btn-icon" title="Descargar XML" style="color:#475569; border:none; background:transparent;"><i class='bx bx-code-alt' style="font-size: 1.2rem;"></i></a>`);
        }
        
        // 4. ANULAR (Rojo)
        // 🚫 BLOQUEO: CRM y EVENTOS
        if (v.origen === 'CRM_SALDO' || v.origen === 'EVENTOS') {
            acciones.push(`<button class="btn-icon" title="Bloqueado por CRM" style="color:#cbd5e1; cursor:not-allowed;"><i class='bx bxs-lock-alt'></i></button>`);
        } 
        // 🚫 BLOQUEO: YA ANULADA
        else if (v.sunat_estado === 'ANULADA') {
            acciones.push(`<button class="btn-icon" title="Anulado" style="color:#ccc; cursor:not-allowed;"><i class='bx bx-block'></i></button>`);
        } 
        // ✅ PERMITIDO: POS, MANUAL y AHORA TERCEROS (COBRO_CUOTA)
        else if (v.origen === 'VENTA_POS' || !v.origen || v.origen === 'COBRO_CUOTA') {
            acciones.push(`<button class="btn-icon delete" title="Anular" onclick="eliminarVenta(${v.id}, '${v.codigo_visual}')" style="color:#ef4444;"><i class='bx bx-trash'></i></button>`);
        } 
        // 🚫 BLOQUEO: OTROS ORIGENES DESCONOCIDOS
        else {
            acciones.push(`<button class="btn-icon" title="Origen Protegido" style="color:#cbd5e1; cursor:not-allowed;"><i class='bx bx-block'></i></button>`);
        }

        // Unir todo
        const botonesAccionHtml = `<div style="display:flex; gap:8px; align-items:center; justify-content:center;">${acciones.join('')}</div>`;

        tr.innerHTML = `
            <td>
                <div style="font-weight:600">${fechaStr}</div>
                <div style="font-size:11px; color:#666">${horaStr}</div>
            </td>
            <td><span style="background:#e0e7ff; color:#3730a3; padding:3px 8px; border-radius:4px; font-weight:700; font-size:11px;">${v.nombre_sede || 'Local'}</span></td>
            <td style="font-weight:bold; font-size:14px; color:#333;">${v.codigo_visual || '#' + v.id}</td>
            <td>${tipoDocHtml}</td>
            <td>${clienteInfo}</td>
            <td>${metodoHtml}</td>
            <td style="text-align:right; padding-right:20px;">${precioHtml}</td>
            <td>
                <div style="display:flex; align-items:center; gap:5px;">
                    <i class='bx bx-user' style="color:#f59e0b;"></i>
                    <span style="font-weight:600; color:#333; font-size:12px;">${vendedorTexto}</span>
                </div>
            </td>
            <td>
                <div style="display:flex; align-items:center; gap:5px; color:#666;">
                    <i class='bx bx-desktop'></i> 
                    <span style="font-size:12px;">${cajeroTexto}</span>
                </div>
            </td>
            <td>${botonesAccionHtml}</td>
        `;
        tbody.appendChild(tr);
    });
    
    renderizarPaginacion(datos.length, datos);
}

// --- FUNCIÓN PARA CONSULTAR ESTADO ACTUAL EN NUBEFACT (OPTIMIZADA) ---
window.consultarEstadoSunat = async function(ventaId) {
    console.log(`🔍 Consultando estado SUNAT para Venta ID: ${ventaId}`);

    // 🔥 1. VALIDACIÓN PREVIA VISUAL (OPTIMIZACIÓN)
    // Buscamos el elemento que disparó el clic para analizar la fila
    const trigger = document.querySelector(`[onclick*="consultarEstadoSunat(${ventaId})"]`);
    
    if (trigger) {
        const fila = trigger.closest('tr');
        // Si visualmente ya es un RECIBO o dice NO_APLICA, bloqueamos la llamada
        if (fila && (fila.innerText.includes('RECIBO') || fila.innerText.includes('NO_APLICA'))) {
            return mostrarError("⚠️ Este es un documento interno. No se reporta a SUNAT.");
        }
    }

    try {
        const token = localStorage.getItem('token');
        if (!token) return console.error("No se encontró token de autenticación.");

        // Feedback visual inmediato (opcional, cambia el cursor)
        document.body.style.cursor = 'wait';

        // 2. Llamada al endpoint de facturación
        const res = await fetch(`${API_BASE}/facturacion/consultar-estado/${ventaId}`, {
            method: 'GET',
            headers: { 
                'x-auth-token': token,
                'Content-Type': 'application/json'
            }
        });

        const data = await res.json();

        if (res.ok) {
            // ✅ ÉXITO: El estado cambió o se confirmó
            const msgFinal = `Estado actualizado: ${data.sunat_estado || 'Procesado'}`;
            
            // Usar sistema de notificación disponible
            if (window.showMiniNotif) {
                window.showMiniNotif(msgFinal, 'success');
            } else if (window.mostrarExito) {
                mostrarExito(msgFinal);
            } else {
                alert("✅ " + msgFinal);
            }

            // 🔄 Recargamos el historial para actualizar colores y botones (PDF/XML)
            await cargarHistorial(); 
        } else {
            // ❌ ERROR: Nubefact rechazó o el documento no existe en la nube
            const errorMsg = data.msg || "No se pudo actualizar el estado. Verifique si el comprobante fue enviado.";
            if (window.mostrarError) {
                mostrarError(errorMsg);
            } else {
                alert("❌ " + errorMsg);
            }
        }

    } catch (error) {
        console.error("Error en consultarEstadoSunat:", error);
        const netError = "Error de conexión al intentar consultar con SUNAT/Nubefact.";
        if (window.mostrarError) window.mostrarError(netError); else alert(netError);
    } finally {
        document.body.style.cursor = 'default'; // Restaurar cursor
    }
};
    
// --- 3. VER DETALLE (MODAL ACTUALIZADO) ---
window.verDetallesVenta = async function(ventaId, codigoVisual) {
    const modal = document.getElementById('modal-detalle-venta');
    const body = document.getElementById('detalle-venta-body');
    
    modal.classList.add('active');
    
    // 🔥 MODIFICADO: Usa el código visual (ej: M-0052) o el ID si no hay código
    const tituloTicket = codigoVisual || ("#" + ventaId);
    document.getElementById('detalle-ticket-id').innerText = tituloTicket;
    
    body.innerHTML = '<div style="text-align:center; padding:20px"><i class="bx bx-loader-alt bx-spin"></i> Cargando...</div>';

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE}/ventas/detalle/${ventaId}`, { 
            headers: { 'x-auth-token': token }
        });
        
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
        
        let filtrados = historialGlobal;

        // 1. FILTRO DE TEXTO (Buscador)
        if (termino) {
            filtrados = filtrados.filter(v => {
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
        
        currentPage = 1; 
        renderizarTablaHistorial(filtrados);
    }
    
    // --- 5. EXPORTAR EXCEL ---
    window.exportarHistorialVentas = function() {
        // 🛡️ BLINDAJE 1: Sustitución de alert por showToast
        if (!historialGlobal || historialGlobal.length === 0) {
            return showToast("No hay datos de ventas para exportar.", "warning");
        }

        if (typeof XLSX === 'undefined') {
            return showToast("La librería de exportación no está disponible.", "error");
        }

        // 🛡️ BLINDAJE 2: Mapeo con limpieza de caracteres para asegurar compatibilidad
        const datosFormateados = historialGlobal.map(v => {
            // Aseguramos que los campos de texto no tengan nulos y se manejen como string
            const cliente = (v.nombre_cliente_temporal || 'Consumidor Final').trim();
            const usuario = (v.nombre_usuario || 'Sistema').trim();
            const sede = (v.nombre_sede || 'General').trim();

            return {
                "TICKET": v.codigo_visual || v.id,
                "FECHA": v.fecha_venta ? v.fecha_venta.slice(0, 10) : '-',
                "HORA": v.fecha_venta ? new Date(v.fecha_venta).toLocaleTimeString('es-PE') : '-',
                "SEDE": sede,
                "DOC": v.tipo_comprobante || 'Boleta',
                "CLIENTE": cliente,
                "DNI/RUC": v.doc_cliente_temporal || '-',
                "USUARIO": usuario,
                "TOTAL (S/)": parseFloat(v.total_venta || 0).toFixed(2),
                "MÉTODO": (v.metodo_pago || 'EFECTIVO').toUpperCase(),
                "DETALLE PAGO": v.tipo_tarjeta || '-'
            };
        });

        try {
            // 🚀 PROCESO DE EXPORTACIÓN (Formato XLSX nativo para evitar errores de Ñ)
            const ws = XLSX.utils.json_to_sheet(datosFormateados);
            
            // Ajustar ancho de columnas automáticamente para que se vea premium
            const wscols = [
                {wch: 12}, // Ticket
                {wch: 12}, // Fecha
                {wch: 12}, // Hora
                {wch: 20}, // Sede
                {wch: 15}, // Doc
                {wch: 30}, // Cliente
                {wch: 15}, // DNI
                {wch: 20}, // Usuario
                {wch: 12}, // Total
                {wch: 15}, // Método
                {wch: 15}  // Detalle
            ];
            ws['!cols'] = wscols;

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Reporte de Ventas");

            // Generar descarga
            const fechaActual = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `SuperNova_Ventas_${fechaActual}.xlsx`);

            showToast("Reporte de ventas descargado correctamente.", "success", "Exportación Exitosa");

        } catch (error) {
            console.error("Error al exportar ventas:", error);
            showToast("Ocurrió un error al generar el archivo Excel.", "error");
        }
    };

    
    // Variable global dentro del módulo para retener el ID
    let idVentaParaAnular = null; 

    // Paso 1: Abrir Modal de Confirmación
    window.eliminarVenta = async function(id, codigoVisual) {
        idVentaParaAnular = id; 
        console.log("🛑 Preparando anulación de venta ID:", idVentaParaAnular);

        const modal = document.getElementById('modal-confirmar-anulacion');
        const texto = document.getElementById('texto-confirmar-anulacion');
        
        if (modal && texto) {
            // 🛡️ BLINDAJE 1: Actualización de mensaje con advertencia de integridad
            texto.innerHTML = `
                ¿Confirmas que deseas anular la venta <b>${codigoVisual || '#' + id}</b>?
                <br><br>
                <span style="color:#ef4444; font-size:12px; font-weight:700;">
                    ⚠️ IMPACTO: Se devolverán los productos (e ingredientes) al stock y se restará el ingreso de la caja chica.
                </span>`;
            modal.classList.add('active');
        } else {
            // 🛡️ BLINDAJE 2: Sustitución de confirm nativo por modal SuperNova
            const confirmado = await showConfirm(
                `¿Deseas anular la venta ${codigoVisual || '#' + id}? Esta acción es irreversible.`,
                "Confirmar Anulación"
            );
            
            if (confirmado) {
                confirmarAnulacionBackend();
            }
        }
    };

    // Paso 2: Ejecutar Borrado
    window.confirmarAnulacionBackend = async function() {
        if (!idVentaParaAnular) return;
        
        // Identificamos el botón dentro del modal para dar feedback visual
        const btnConfirmar = document.querySelector('#modal-confirmar-anulacion .btn-primary');
        const textoOriginal = btnConfirmar ? btnConfirmar.innerHTML : 'Confirmar';

        try {
            // 🛡️ BLINDAJE 1: Bloqueo de UI para evitar múltiples clics
            if (btnConfirmar) {
                btnConfirmar.disabled = true;
                btnConfirmar.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Procesando...";
            }

            const token = localStorage.getItem('token');
            const res = await fetch(`${API_BASE}/ventas/${idVentaParaAnular}`, {
                method: 'DELETE',
                headers: { 
                    'x-auth-token': token,
                    'Content-Type': 'application/json'
                }
            });
            
            const data = await res.json();

            // Cerramos el modal de confirmación antes de mostrar el resultado
            cerrarModalConfirmacion(); 

            if (res.ok) {
                // ✅ ÉXITO: Los productos e ingredientes han vuelto al stock
                showToast(data.msg || "Venta anulada. El stock y la caja han sido actualizados.", "success");
                
                // Recargar la tabla con los datos frescos del servidor
                if (typeof cargarHistorial === 'function') {
                    await cargarHistorial(); 
                }
            } else {
                // ❌ ERROR: Problemas de lógica (ej. venta ya anulada o periodo de cierre de caja)
                showToast(data.msg || "No se pudo completar la anulación.", "error");
            }
        } catch (e) {
            console.error("Error crítico en anulación:", e);
            showToast("Error de conexión: No se pudo comunicar con el servidor.", "error");
        } finally {
            // 🛡️ BLINDAJE 2: Limpieza de variables y restauración de UI
            idVentaParaAnular = null;
            if (btnConfirmar) {
                btnConfirmar.disabled = false;
                btnConfirmar.innerHTML = textoOriginal;
            }
        }
    };

    window.cerrarModalConfirmacion = function() {
        const modal = document.getElementById('modal-confirmar-anulacion');
        if(modal) modal.classList.remove('active');
    }

    window.mostrarExito = function(mensaje) {
        const modal = document.getElementById('modal-success');
        const texto = document.getElementById('success-msg');
        if (modal && texto) {
            texto.innerText = mensaje;
            modal.classList.add('active');
        } else {
            alert("✅ " + mensaje); // Respaldo por si falla el HTML
        }
    }

    window.mostrarError = function(mensaje) {
        const modal = document.getElementById('modal-error');
        const texto = document.getElementById('error-msg');
        if (modal && texto) {
            texto.innerText = mensaje;
            modal.classList.add('active');
        } else {
            alert("❌ " + mensaje); // Respaldo por si falla el HTML
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

    // 1. WhatsApp
    window.abrirModalWhatsapp = function(link, nombre, ticket, total) {
        // 1. Guardamos los datos en los inputs ocultos (HTML) en lugar de variables volátiles
        document.getElementById('hidden-link-pdf-wsp').value = link;
        document.getElementById('hidden-cliente-wsp').value = nombre;
        document.getElementById('hidden-ticket-wsp').value = ticket;
        document.getElementById('hidden-total-wsp').value = total;

        // 2. Limpiamos input y mostramos modal
        const modal = document.getElementById('modal-envio-whatsapp');
        document.getElementById('input-wsp-envio').value = ""; 
        
        if(modal) {
            modal.classList.add('active');
            // Resetear botón por si quedó cargando antes
            const btn = modal.querySelector('.btn-primary');
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class='bx bxs-paper-plane'></i> Enviar WhatsApp`;
                btn.style.opacity = "1";
            }
            setTimeout(() => document.getElementById('input-wsp-envio').focus(), 100);
        }
    }

    window.cerrarModalWhatsapp = function() {
        document.getElementById('modal-envio-whatsapp').classList.remove('active');
    }

    window.confirmarEnvioWhatsapp = function() {
        const numero = document.getElementById('input-wsp-envio').value.trim();
        const notificar = window.showMiniNotif || window.showToast || alert;

        if(numero.length < 9) {
            return notificar("⚠️ El número debe tener 9 dígitos", "warning");
        }

        // Efecto Loading
        const modal = document.getElementById('modal-envio-whatsapp');
        const btn = modal.querySelector('.btn-primary');
        const textoOriginal = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Abriendo...`;

        // 1. Recuperamos datos
        const link = document.getElementById('hidden-link-pdf-wsp').value;
        const nombre = document.getElementById('hidden-cliente-wsp').value;
        const ticket = document.getElementById('hidden-ticket-wsp').value;
        const total = document.getElementById('hidden-total-wsp').value;

        // 🔍 DEPURACIÓN: Verificamos en consola que no sean undefined
        console.log("DATOS WHATSAPP:", { link, nombre, ticket, total });

        // 2. Saludo Inteligente
        let saludo = "Hola!";
        if (nombre && nombre !== 'null' && nombre !== 'undefined' && nombre.trim() !== '' && nombre !== 'Cliente') {
            saludo = `Hola ^-^ `;
        }

        // 3. Mensaje (USANDO SÍMBOLOS SEGUROS, NO EMOJIS COMPLEJOS)
        // Usamos saltos de línea y asteriscos
        const mensaje = 
        `${saludo}, gracias por tu visita a *SuperNova*.
        Aqui tienes tu comprobante electronico:

        > Ticket: *${ticket}*
        > Total: *S/ ${total}*

        Descargalo aqui:
        ${link}`;

        // 4. Enviar
        const url = `https://wa.me/51${numero}?text=${encodeURIComponent(mensaje)}`;
        
        setTimeout(() => {
            window.open(url, '_blank');
            btn.disabled = false;
            btn.innerHTML = textoOriginal;
            cerrarModalWhatsapp();
        }, 800);
    }

    // 2. Correo
    window.abrirModalCorreo = function(id) {
        document.getElementById('modal-envio-correo').classList.add('active');
        document.getElementById('hidden-venta-id-correo').value = id;
        document.getElementById('input-email-envio').value = "";
        document.getElementById('input-email-envio').focus();
    }

    window.cerrarModalCorreo = function() {
        document.getElementById('modal-envio-correo').classList.remove('active');
    }

    // 3. Correo: Envío usando NUESTRO BACKEND (Mejorado con Loading y Feedback)
    window.confirmarEnvioCorreo = async function() {
        const ventaId = document.getElementById('hidden-venta-id-correo').value;
        const email = document.getElementById('input-email-envio').value.trim();

        // Detectamos qué sistema de notificación tienes activo
        const notificar = window.showMiniNotif || window.showToast || alert;

        if(!email || !email.includes('@')) {
            return notificar("⚠️ Por favor ingresa un correo válido", "error");
        }

        // 1. CAPTURAR EL BOTÓN Y ACTIVAR ESTADO DE CARGA
        const modal = document.getElementById('modal-envio-correo');
        const btn = modal.querySelector('.btn-primary');
        const textoOriginal = btn.innerHTML; // Guardamos el texto original ("Enviar")

        // Bloqueo visual
        btn.disabled = true;
        btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Enviando...`;
        btn.style.opacity = "0.7";
        btn.style.cursor = "not-allowed";

        try {
            const token = localStorage.getItem('token');
            
            // Llamada al backend
            const res = await fetch('/api/facturacion/reenviar-email', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-token': token 
                },
                body: JSON.stringify({ venta_id: ventaId, cliente_email: email })
            });

            const data = await res.json();

            if(res.ok) {
                // ✅ ÉXITO
                notificar(`✅ Correo enviado correctamente a: ${email}`, "success");
                cerrarModalCorreo();
            } else {
                // ❌ ERROR DEL BACKEND
                notificar(`❌ Error: ${data.msg || 'No se pudo enviar'}`, "error");
            }

        } catch (error) {
            console.error(error);
            notificar("❌ Error de conexión con el servidor", "error");
        } finally {
            // 🔄 SIEMPRE RESTAURAR EL BOTÓN (Al final, salga bien o mal)
            if(btn) {
                btn.disabled = false;
                btn.innerHTML = textoOriginal;
                btn.style.opacity = "1";
                btn.style.cursor = "pointer";
            }
        }
    }

    // INICIAR
    initHistorial();

})();