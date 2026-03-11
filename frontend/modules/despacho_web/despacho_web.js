// UBICACIÓN: frontend/modules/despacho_web/despacho_web.js

(function() {
    // Variables globales
    let pedidosWebGlobal = [];
    let historialWebGlobal = [];
    let tabActivo = 'pendientes'; // Pestaña por defecto

    let paginaActualPendientes = 1;
    let paginaActualHistorial = 1;
    const registrosPorPagina = 10;

    // ==========================================
    // 1. NAVEGACIÓN ENTRE PESTAÑAS (TABS)
    // ==========================================
    window.cambiarTab = function(tabId) {
        tabActivo = tabId;
        
        // Quitar clase active de todos los botones y contenidos
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
            content.style.display = 'none';
        });

        // Activar el botón y contenido seleccionado
        document.getElementById(`tab-${tabId}`).classList.add('active');
        const vistaActiva = document.getElementById(`vista-${tabId}`);
        vistaActiva.classList.add('active');
        vistaActiva.style.display = 'block';

        // Cargar los datos correspondientes si no se han cargado
        actualizarVistaActiva();
    };

    window.actualizarVistaActiva = function() {
        if (tabActivo === 'pendientes') {
            cargarPedidosWeb();
        } else if (tabActivo === 'historial') {
            cargarHistorialWeb();
        }
    };


    // ==========================================
    // 2. LÓGICA DE LA PESTAÑA: PENDIENTES
    // ==========================================
    window.cargarPedidosWeb = async function() {
        const tbody = document.getElementById('tabla-pedidos-web');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:40px;"><i class='bx bx-loader-alt bx-spin'></i> Cargando...</td></tr>`;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/ecommerce/pedidos', { headers: { 'x-auth-token': token } });

            if (res.ok) {
                const todosLosPedidos = await res.json();
                pedidosWebGlobal = todosLosPedidos.filter(p => p.estado_despacho !== 'entregado');
                paginaActualPendientes = 1; // Reiniciar a página 1 al cargar
                renderizarTablaPedidosWeb(pedidosWebGlobal);
            }
        } catch (error) {
            console.error(error);
        }
    };

    function renderizarTablaPedidosWeb(pedidos) {
        const tbody = document.getElementById('tabla-pedidos-web');
        tbody.innerHTML = '';

        if (pedidos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:30px;">No hay pedidos pendientes.</td></tr>`;
            return;
        }

        // --- LÓGICA DE PAGINACIÓN ---
        const inicio = (paginaActualPendientes - 1) * registrosPorPagina;
        const fin = inicio + registrosPorPagina;
        const itemsPaginados = pedidos.slice(inicio, fin);
        const totalPaginas = Math.ceil(pedidos.length / registrosPorPagina);

        itemsPaginados.forEach(p => {
            const fechaObj = new Date(p.fecha_venta);
            const fechaStr = fechaObj.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });
            // Convertimos a minúsculas antes de comparar para que acepte "PENDIENTE" o "pendiente"
            const esPendiente = (p.estado_despacho || '').toLowerCase().trim() === 'pendiente';

            const btnEntregar = esPendiente 
                ? `<button class="btn-entregar" onclick="confirmarEntrega(${p.id}, '${p.codigo_recojo}')" style="padding: 6px 12px;"><i class='bx bx-check-circle'></i> Entregar</button>`
                : `<button class="btn-entregar" disabled style="background:#e2e8f0; color:#94a3b8; padding: 6px 12px;"><i class='bx bx-check-double'></i> Listo</button>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color: #64748b; font-size: 13px;">${fechaStr}</td>
                <td style="font-weight: 500;">${p.cliente_nombre || 'Cliente Web'}</td>
                <td><strong style="color: #3b82f6; letter-spacing: 1px;">${p.codigo_recojo || 'S/C'}</strong></td>
                <td style="font-weight: bold; color: #0f172a;">S/ ${parseFloat(p.total_venta).toFixed(2)}</td>
                <td><span class="badge-estado badge-pendiente">Pendiente</span></td>
                <td style="text-align: center; display: flex; gap: 8px; justify-content: center;">
                    <button class="btn btn-secondary" style="padding: 6px 10px; font-size: 13px;" onclick="verDetalleWeb(${p.id})"><i class='bx bx-show'></i></button>
                    ${btnEntregar}
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Inyectar controles de paginación
        renderizarControlesPaginacion('paginacion-pendientes', paginaActualPendientes, totalPaginas, 'cambiarPaginaPendientes');
    }

    // FUNCIÓN PARA RENDERIZAR LOS BOTONES DE ANTERIOR/SIGUIENTE
    function renderizarControlesPaginacion(idContenedor, paginaActual, totalPaginas, nombreFuncion) {
        const contenedor = document.getElementById(idContenedor);
        if (!contenedor) return;

        contenedor.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; gap:15px; margin-top:15px; padding:10px; background:#f8fafc; border-radius:8px;">
                <button class="btn btn-secondary" ${paginaActual === 1 ? 'disabled' : ''} onclick="window.${nombreFuncion}(-1)">
                    <i class='bx bx-chevron-left'></i> Anterior
                </button>
                <span style="font-size:13px; font-weight:600; color:#475569;">Página ${paginaActual} de ${totalPaginas || 1}</span>
                <button class="btn btn-secondary" ${paginaActual >= totalPaginas ? 'disabled' : ''} onclick="window.${nombreFuncion}(1)">
                    Siguiente <i class='bx bx-chevron-right'></i>
                </button>
            </div>
        `;
    }

    // Funciones para los botones
    window.cambiarPaginaPendientes = function(delta) {
        paginaActualPendientes += delta;
        renderizarTablaPedidosWeb(pedidosWebGlobal);
    };

    window.cambiarPaginaHistorial = function(delta) {
        paginaActualHistorial += delta;
        renderizarTablaHistorialWeb(historialWebGlobal);
    };

    window.filtrarPedidosWeb = function() {
        const texto = document.getElementById('buscar-codigo-web').value.toLowerCase();
        const filtrados = pedidosWebGlobal.filter(p => {
            const codigo = (p.codigo_recojo || '').toLowerCase();
            const cliente = (p.cliente_nombre || '').toLowerCase();
            return codigo.includes(texto) || cliente.includes(texto);
        });
        renderizarTablaPedidosWeb(filtrados);
    };

    // 4. FUNCIÓN PARA CONFIRMAR Y MARCAR COMO ENTREGADO (Con Modal y Notificaciones)
    window.confirmarEntrega = function(idVenta, codigo) {
        // Modal dinámico de confirmación
        const modalHtml = `
            <div id="modal-confirm-entrega" class="modal-overlay active" style="display:flex; align-items:center; justify-content:center; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999;">
                <div style="background:#fff; padding:25px; border-radius:10px; width:350px; text-align:center; animation: fadeIn 0.3s;">
                    <i class='bx bx-package' style="font-size:50px; color:#3b82f6; margin-bottom:15px;"></i>
                    <h3 style="margin:0 0 10px 0; color:#1e293b;">Confirmar Entrega</h3>
                    <p style="color:#64748b; margin-bottom:20px; font-size:14px;">¿Estás seguro de entregar el pedido <b>${codigo}</b> al cliente?</p>
                    <div style="display:flex; gap:10px; justify-content:center;">
                        <button onclick="document.getElementById('modal-confirm-entrega').remove()" class="btn btn-secondary" style="flex:1;">Cancelar</button>
                        <button onclick="ejecutarEntregaWeb(${idVenta}); document.getElementById('modal-confirm-entrega').remove()" class="btn-entregar" style="flex:1;">Sí, Entregar</button>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    };

    window.ejecutarEntregaWeb = async function(idVenta) {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/ecommerce/pedidos/${idVenta}/entregar`, {
                method: 'PUT',
                headers: { 'x-auth-token': token }
            });
            const data = await res.json();

            if (res.ok) {
                showMiniNotif(data.msg, 'success'); // Notificación elegante verde
                cargarPedidosWeb(); 
            } else {
                showMiniNotif('Error: ' + data.msg, 'error'); // Notificación elegante roja
            }
        } catch (error) {
            console.error(error);
            showMiniNotif('Ocurrió un error al intentar comunicar con el servidor.', 'error');
        }
    };

    // ==========================================
    // 3. LÓGICA DE LA PESTAÑA: HISTORIAL WEB
    // ==========================================
    window.cargarHistorialWeb = async function() {
        const tbody = document.getElementById('tabla-historial-web');
        if (!tbody) return;

        tbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align: center; padding: 40px; color: #64748b;">
                    <i class='bx bx-loader-alt bx-spin' style="font-size: 28px; margin-bottom: 10px;"></i><br>
                    Cargando historial completo de E-commerce...
                </td>
            </tr>
        `;

        try {
            const token = localStorage.getItem('token');
            // Haremos una petición al nuevo endpoint que crearemos en el backend
            const res = await fetch('/api/ecommerce/historial', {
                headers: { 'x-auth-token': token }
            });

            if (res.ok) {
                historialWebGlobal = await res.json();
                renderizarTablaHistorialWeb(historialWebGlobal);
            } else {
                throw new Error("Error al cargar el historial web");
            }
        } catch (error) {
            console.error(error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" style="text-align: center; padding: 30px; color: #ef4444;">
                        <i class='bx bx-error-circle' style="font-size: 24px;"></i><br>
                        Error de conexión. Asegúrate de configurar el Backend para el historial.
                    </td>
                </tr>
            `;
        }
    };

    // 3. RENDERIZAR TABLA HISTORIAL (CON PAGINACIÓN)
    function renderizarTablaHistorialWeb(historial) {
        const tbody = document.getElementById('tabla-historial-web');
        tbody.innerHTML = '';

        if (historial.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px;">No hay registros.</td></tr>`;
            return;
        }

        const inicio = (paginaActualHistorial - 1) * registrosPorPagina;
        const fin = inicio + registrosPorPagina;
        const itemsPaginados = historial.slice(inicio, fin);
        const totalPaginas = Math.ceil(historial.length / registrosPorPagina);

        itemsPaginados.forEach(p => {
            const fechaObj = new Date(p.fecha_venta);
            const fechaStr = fechaObj.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });

            const docLabel = p.tipo_comprobante === 'BOLETA' ? 'B' : (p.tipo_comprobante === 'FACTURA' ? 'F' : 'T');
            // Añadimos icono de ticket al badge
            const docBadge = `<span style="font-size:11px; background:#f1f5f9; padding:2px 6px; border-radius:4px; border:1px solid #cbd5e1; display: inline-flex; align-items: center; gap: 4px;">
                                <i class='bx bx-receipt' style="color: #64748b;"></i> ${docLabel} - ${p.serie || ''}-${p.correlativo || ''}
                              </span>`;
            
            let btnPdf = '';
            if (p.enlace_pdf) {
                btnPdf = `<a href="${p.enlace_pdf}" target="_blank" title="Ver PDF" style="color:#ef4444; font-size:18px; margin-right:8px; display: inline-block; vertical-align: middle;">
                            <i class='bx bxs-file-pdf'></i>
                          </a>`;
            }

            const esPendiente = (p.estado_despacho || '').toLowerCase().trim() === 'pendiente';
            const badgeClase = esPendiente ? 'badge-pendiente' : 'badge-entregado';
            const badgeTexto = esPendiente ? 'Pendiente' : 'Entregado';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color: #64748b; font-size: 12px;">${fechaStr}</td>
                <td>
                    <div style="font-weight: 500; font-size: 13px;">${p.cliente_nombre || 'Cliente Web'}</div>
                    <div style="font-size: 11px; color: #94a3b8;">Doc: ${p.doc_cliente || 'S/N'}</div>
                </td>
                <td>${docBadge}</td>
                <td style="font-size: 12px; font-weight:500;">
                    <i class='bx bx-credit-card' style="color:#3b82f6;"></i> ${p.metodo_pago || 'MERCADO PAGO'}
                </td>
                <td style="font-weight: bold; color: #0f172a;">S/ ${parseFloat(p.total_venta).toFixed(2)}</td>
                <td style="color: #3b82f6; font-size: 13px;">${p.codigo_recojo || '-'}</td>
                <td><span class="badge-estado ${badgeClase}">${badgeTexto}</span></td>
                <td style="text-align: center;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 5px;">
                        ${btnPdf}
                        <button class="btn btn-secondary" style="padding: 4px 8px; font-size: 11px; display: flex; align-items: center;" onclick="verDetalleWeb(${p.id})">
                            <i class='bx bx-show'></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        renderizarControlesPaginacion('paginacion-historial', paginaActualHistorial, totalPaginas, 'cambiarPaginaHistorial');
    }

    // 4. FUNCIÓN PARA EXPORTAR A EXCEL (CSV)
    window.exportarExcelWeb = function() {
        if (historialWebGlobal.length === 0) {
            return showMiniNotif("No hay datos para exportar", "error");
        }

        // Cabeceras del CSV
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Fecha,Cliente,Documento,Comprobante,Metodo Pago,Total,Codigo Recojo,Estado Entrega\n";

        // Filas del CSV
        historialWebGlobal.forEach(p => {
            const fecha = new Date(p.fecha_venta).toLocaleDateString('es-PE');
            const cliente = (p.cliente_nombre || 'S/N').replace(/,/g, ''); // Quitar comas para no romper el CSV
            const doc = p.doc_cliente || 'S/N';
            const comprobante = `${p.tipo_comprobante} ${p.serie}-${p.correlativo}`;
            const metodo = p.metodo_pago || 'S/N';
            const total = parseFloat(p.total_venta).toFixed(2);
            const codigo = p.codigo_recojo || '-';
            const estado = p.estado_despacho || 'pendiente';

            const fila = `${fecha},${cliente},${doc},${comprobante},${metodo},${total},${codigo},${estado}`;
            csvContent += fila + "\n";
        });

        // Crear link de descarga
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `Historial_Ventas_Web_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        
        link.click();
        document.body.removeChild(link);
        
        showMiniNotif("Exportación completada", "success");
    };

    window.filtrarHistorialWeb = function() {
        const texto = document.getElementById('buscar-historial-web').value.toLowerCase();
        const filtrados = historialWebGlobal.filter(p => {
            const cliente = (p.cliente_nombre || '').toLowerCase();
            const doc = (p.doc_cliente || '').toLowerCase();
            const codigo = (p.codigo_recojo || '').toLowerCase();
            const metodo = (p.metodo_pago || '').toLowerCase();
            return cliente.includes(texto) || doc.includes(texto) || codigo.includes(texto) || metodo.includes(texto);
        });
        renderizarTablaHistorialWeb(filtrados);
    };

    window.verDetalleWeb = async function(id) {
        // Buscamos los datos básicos del pedido localmente
        const pedido = pedidosWebGlobal.find(p => p.id === id) || historialWebGlobal.find(p => p.id === id);
        if(!pedido) return;

        // Levantamos un modal temporal "Cargando..."
        const loadingId = 'modal-loading-' + Date.now();
        const modalLoading = `
            <div id="${loadingId}" class="modal-overlay active" style="display:flex; align-items:center; justify-content:center; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999;">
                <div style="background:#fff; padding:30px; border-radius:10px; text-align:center;">
                    <i class='bx bx-loader-alt bx-spin' style="font-size:30px; color:#3b82f6;"></i>
                    <p style="margin-top:10px; color:#64748b;">Cargando detalles...</p>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalLoading);

        try {
            // Traemos los productos reales desde la nueva ruta del Backend
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/ecommerce/pedidos/${id}/detalle`, {
                headers: { 'x-auth-token': token }
            });
            
            if(document.getElementById(loadingId)) document.getElementById(loadingId).remove(); // Quitamos el loader

            if (!res.ok) throw new Error("No se pudo cargar el detalle");
            
            const data = await res.json();
            const { venta, productos } = data;

            // 1. LÓGICA DE PRODUCTOS (Corrigiendo el NaN y calculando subtotales)
            let productosHtml = '';
            if (!productos || productos.length === 0) {
                productosHtml = `<tr><td colspan="4" style="text-align:center; padding:15px; color:#94a3b8;">No se encontraron productos en esta orden.</td></tr>`;
            } else {
                productos.forEach(prod => {
                    // CORRECCIÓN NAN: Aseguramos valores numéricos para el cálculo
                    const cant = parseFloat(prod.cantidad) || 0;
                    const precio = parseFloat(prod.precio_unitario) || 0;
                    const subCalc = cant * precio;

                    productosHtml += `
                        <tr>
                            <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#1e293b;">
                                ${prod.nombre_producto || prod.nombre || 'Producto desconocido'}
                            </td>
                            <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; text-align:center;">${cant}</td>
                            <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; text-align:right;">S/ ${precio.toFixed(2)}</td>
                            <td style="padding:10px; border-bottom:1px solid #e2e8f0; font-size:13px; text-align:right; font-weight:600;">S/ ${subCalc.toFixed(2)}</td>
                        </tr>
                    `;
                });
            }

            const codCanje = (venta.codigo_recojo && venta.codigo_recojo.trim() !== '' && venta.codigo_recojo !== 'S/C') 
                ? venta.codigo_recojo 
                : 'ESPERANDO PAGO / CANJE';

            let comprobanteTxt = venta.tipo_comprobante || 'TICKET INTERNO';
            if (venta.serie && venta.correlativo) {
                comprobanteTxt += `: ${venta.serie}-${venta.correlativo}`;
            } else {
                // Si no hay serie, evitamos los guiones vacíos
                comprobanteTxt += ' (Pendiente de emisión)';
            }

            // 3. RENDERIZADO DEL MODAL FINAL
            const modalHtml = `
                <div id="modal-detalle-web" class="modal-overlay active" style="display:flex; align-items:center; justify-content:center; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); z-index:9999;">
                    <div style="background:#fff; border-radius:10px; width:650px; max-width:95%; animation: fadeIn 0.3s; overflow:hidden;">
                        
                        <div style="background:#f8fafc; padding:15px 20px; border-bottom:1px solid #e2e8f0; display:flex; justify-content:space-between; align-items:center;">
                            <h3 style="margin:0; font-size:16px; color:#1e293b; display:flex; align-items:center; gap:8px;">
                                <i class='bx bx-receipt' style="color:#3b82f6;"></i> Detalle de Orden Web #${venta.id || id}
                            </h3>
                            <i class='bx bx-x' style="font-size:24px; cursor:pointer; color:#64748b;" onclick="document.getElementById('modal-detalle-web').remove()"></i>
                        </div>
                        
                        <div style="padding:20px; max-height:75vh; overflow-y:auto;">
                            
                            <div style="background:#f1f5f9; padding:15px; border-radius:8px; margin-bottom:20px; display:grid; grid-template-columns: 1fr 1fr; gap:15px;">
                                <div>
                                    <span style="color:#64748b; font-size:11px; text-transform:uppercase; font-weight:600;">Cliente</span>
                                    <strong style="color:#1e293b; font-size:13px; display:block;">${venta.nombre_cliente_temporal || pedido.cliente_nombre || 'Cliente Web'}</strong>
                                </div>
                                <div>
                                    <span style="color:#64748b; font-size:11px; text-transform:uppercase; font-weight:600;">Sede de Recojo</span>
                                    <strong style="color:#10b981; font-size:13px; display:block;">${venta.nombre_sede || 'Sede Principal'}</strong>
                                </div>
                                <div>
                                    <span style="color:#64748b; font-size:11px; text-transform:uppercase; font-weight:600;">CÓDIGO DE RECOJO / CANJE</span>
                                    <strong style="color:#3b82f6; font-size:15px; letter-spacing:1px; display:block;">${codCanje}</strong>
                                </div>
                                <div>
                                    <span style="color:#64748b; font-size:11px; text-transform:uppercase; font-weight:600;">Comprobante</span>
                                    <strong style="color:#1e293b; font-size:13px; display:block;">${comprobanteTxt}</strong>
                                </div>
                            </div>
                            
                            <h4 style="margin:0 0 10px 0; color:#475569; font-size:13px; display:flex; align-items:center; gap:5px;">
                                <i class='bx bx-box'></i> Productos de la Orden
                            </h4>
                            <table style="width:100%; border-collapse:collapse; margin-bottom:15px;">
                                <thead>
                                    <tr style="background:#f8fafc;">
                                        <th style="padding:10px; border-bottom:2px solid #e2e8f0; color:#64748b; font-size:11px; text-align:left;">PRODUCTO</th>
                                        <th style="padding:10px; border-bottom:2px solid #e2e8f0; color:#64748b; font-size:11px; text-align:center;">CANT.</th>
                                        <th style="padding:10px; border-bottom:2px solid #e2e8f0; color:#64748b; font-size:11px; text-align:right;">P. UNIT</th>
                                        <th style="padding:10px; border-bottom:2px solid #e2e8f0; color:#64748b; font-size:11px; text-align:right;">SUBTOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${productosHtml}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colspan="3" style="text-align:right; padding:15px 10px 0 0; color:#64748b; font-size:14px;">Total Pagado:</td>
                                        <td style="text-align:right; padding:15px 10px 0 0; color:#0f172a; font-size:18px; font-weight:bold;">S/ ${parseFloat(venta.total_venta || pedido.total_venta).toFixed(2)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                        
                        <div style="padding:15px 20px; background:#f8fafc; text-align:right; border-top:1px solid #e2e8f0;">
                            <button onclick="document.getElementById('modal-detalle-web').remove()" class="btn btn-secondary" style="padding: 8px 20px; border-radius: 5px; cursor: pointer; border: 1px solid #cbd5e1; background: #fff;">Cerrar Detalle</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', modalHtml);

        } catch (error) {
            console.error("Error al abrir detalle web:", error);
            if(document.getElementById(loadingId)) document.getElementById(loadingId).remove();
            if(typeof showMiniNotif === "function") {
                showMiniNotif("Error al cargar los detalles", "error");
            } else {
                alert("Error al cargar los detalles del pedido");
            }
        }
    };

    // ==========================================
    // 4. INICIALIZADOR
    // ==========================================
    window.initDespachoWeb = function() {
        console.log("▶️ Iniciando módulo de E-commerce...");
        // Forzamos que siempre empiece en la pestaña de pendientes
        cambiarTab('pendientes'); 
    };

    if (document.getElementById('tabla-pedidos-web')) {
        initDespachoWeb();
    }

    // Exportar Historial Completo
    window.exportarExcelWeb = function() {
        procesarDescargaExcel(historialWebGlobal, "Historial_Ventas_Web");
    };

    // Exportar solo Pendientes
    window.exportarExcelPendientes = function() {
        procesarDescargaExcel(pedidosWebGlobal, "Pedidos_Pendientes_Web");
    };

    // Motor de exportación (Única función para ambos)
    function procesarDescargaExcel(datos, nombreArchivo) {
        if (!datos || datos.length === 0) return showMiniNotif("No hay datos para exportar", "error");

        // 1. Añadimos el BOM para que Excel reconozca tildes y eñes (UTF-8)
        // 2. Usamos punto y coma (;) como separador, que es el estándar de Excel en español
        let csvContent = "\uFEFF"; 
        
        // Cabeceras con punto y coma
        csvContent += "Fecha;Cliente;Documento;Comprobante;Metodo Pago;Total;Codigo Recojo;Estado\n";

        datos.forEach(p => {
            const fila = [
                new Date(p.fecha_venta).toLocaleDateString('es-PE'),
                (p.cliente_nombre || 'S/N').replace(/;/g, ''), // Limpiamos si hay puntos y coma en el nombre
                (p.doc_cliente || p.doc_cliente_temporal || 'S/N'),
                `${p.tipo_comprobante || 'S/N'} ${p.serie || ''}-${p.correlativo || ''}`,
                (p.metodo_pago || 'WEB'),
                parseFloat(p.total_venta).toFixed(2),
                (p.codigo_recojo || '-'),
                (p.estado_despacho || 'pendiente').toUpperCase()
            ].join(";"); // UNIMOS CON PUNTO Y COMA
            
            csvContent += fila + "\n";
        });

        // Crear el archivo Blob para una descarga más compatible
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${nombreArchivo}_${new Date().toLocaleDateString('es-PE').replace(/\//g, '-')}.csv`);
        document.body.appendChild(link);
        
        link.click();
        document.body.removeChild(link);
        
        showMiniNotif("Excel generado correctamente", "success");
    }

})();