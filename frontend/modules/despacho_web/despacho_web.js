// UBICACIÓN: frontend/modules/despacho_web/despacho_web.js

(function() {
    // Variable global para guardar los pedidos y poder filtrarlos rápido sin llamar a la BD a cada rato
    let pedidosWebGlobal = [];

    // 1. FUNCIÓN PRINCIPAL: Traer los pedidos del Backend
    window.cargarPedidosWeb = async function() {
        const tbody = document.getElementById('tabla-pedidos-web');
        if (!tbody) return;

        // Mostrar estado de carga
        tbody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #64748b;">
                    <i class='bx bx-loader-alt bx-spin' style="font-size: 28px; margin-bottom: 10px;"></i><br>
                    Cargando pedidos de internet...
                </td>
            </tr>
        `;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/ecommerce/pedidos', {
                headers: { 'x-auth-token': token }
            });

            if (res.ok) {
                pedidosWebGlobal = await res.json();
                renderizarTablaPedidosWeb(pedidosWebGlobal);
            } else {
                throw new Error("No se pudieron cargar los pedidos");
            }
        } catch (error) {
            console.error(error);
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 30px; color: #ef4444;">
                        <i class='bx bx-error-circle' style="font-size: 24px;"></i><br>
                        Error de conexión al cargar los pedidos.
                    </td>
                </tr>
            `;
        }
    };

    // 2. FUNCIÓN PARA PINTAR LA TABLA (Con colores y botones)
    function renderizarTablaPedidosWeb(pedidos) {
        const tbody = document.getElementById('tabla-pedidos-web');
        tbody.innerHTML = '';

        if (pedidos.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 30px; color: #64748b;">
                        <i class='bx bx-package' style="font-size: 30px; color: #cbd5e1; margin-bottom: 10px;"></i><br>
                        No hay pedidos de internet para esta sede o la búsqueda no coincide.
                    </td>
                </tr>
            `;
            return;
        }

        pedidos.forEach(p => {
            // Formatear Fecha
            const fechaObj = new Date(p.fecha_venta);
            const fechaStr = fechaObj.toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });

            // Lógica de Estados (Pendiente vs Entregado)
            const esPendiente = p.estado_despacho === 'pendiente' || !p.estado_despacho;
            const badgeClase = esPendiente ? 'badge-pendiente' : 'badge-entregado';
            const badgeTexto = esPendiente ? 'Pendiente' : 'Entregado';
            
            // Botón de Entregar (Se bloquea si ya está entregado)
            const btnHtml = esPendiente 
                ? `<button class="btn-entregar" onclick="entregarPedidoWeb(${p.id}, '${p.codigo_recojo}')"><i class='bx bx-check-circle'></i> Entregar</button>`
                : `<button class="btn-entregar" disabled style="background:#e2e8f0; color:#94a3b8;"><i class='bx bx-check-double'></i> Listo</button>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="color: #64748b; font-size: 13px;">${fechaStr}</td>
                <td style="font-weight: 500;">${p.cliente_nombre || 'Cliente Web'}</td>
                <td><strong style="color: #3b82f6; letter-spacing: 1px;">${p.codigo_recojo || 'S/C'}</strong></td>
                <td style="font-weight: bold; color: #0f172a;">S/ ${parseFloat(p.total_venta).toFixed(2)}</td>
                <td><span class="badge-estado ${badgeClase}">${badgeTexto}</span></td>
                <td style="text-align: center;">${btnHtml}</td>
            `;
            tbody.appendChild(tr);
        });
    }

    // 3. FUNCIÓN DEL BUSCADOR EN TIEMPO REAL (Filtro)
    window.filtrarPedidosWeb = function() {
        const texto = document.getElementById('buscar-codigo-web').value.toLowerCase();
        
        // Filtramos buscando por código de recojo o por nombre del cliente
        const filtrados = pedidosWebGlobal.filter(p => {
            const codigo = (p.codigo_recojo || '').toLowerCase();
            const cliente = (p.cliente_nombre || '').toLowerCase();
            return codigo.includes(texto) || cliente.includes(texto);
        });

        renderizarTablaPedidosWeb(filtrados);
    };

    // 4. FUNCIÓN PARA MARCAR COMO ENTREGADO (Habla con el Backend)
    window.entregarPedidoWeb = async function(idVenta, codigo) {
        // Doble confirmación para evitar clics por accidente
        if (!confirm(`¿Estás seguro de entregar el pedido ${codigo}?`)) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/ecommerce/pedidos/${idVenta}/entregar`, {
                method: 'PUT',
                headers: { 'x-auth-token': token }
            });

            const data = await res.json();

            if (res.ok) {
                // Usamos la función global si existe, o un alert simple
                if (typeof showToast === 'function') {
                    showToast(data.msg, 'success');
                } else {
                    alert('✅ ' + data.msg);
                }
                
                // Recargamos la tabla para que el botón pase a gris ("Listo")
                cargarPedidosWeb();
            } else {
                alert('❌ Error: ' + data.msg);
            }
        } catch (error) {
            console.error(error);
            alert('❌ Ocurrió un error al intentar comunicar con el servidor.');
        }
    };

    // 5. INICIALIZADOR: Se ejecuta al abrir el módulo
    window.initDespachoWeb = function() {
        console.log("▶️ Iniciando módulo de Despacho E-commerce...");
        cargarPedidosWeb();
    };

    // Auto-arranque si la tabla ya está en el HTML (Por si acaso)
    if (document.getElementById('tabla-pedidos-web')) {
        initDespachoWeb();
    }
})();