//Ubicacion: frontend/modules/ventas/ventas.js

(function() {
    console.log("Modulo POS Conectado 🚀");

    let productosGlobal = [];
    let carrito = [];
    let totalVentaOriginal = 0; 
    let categoriaActual = 'todos';

    // --- 1. UTILIDADES VISUALES ---
    function getIconBgClass(cat) {
        switch(cat) {
            case 'Cafeteria': return 'icon-bg-coffee';
            case 'Taquilla': return 'icon-bg-ticket';
            case 'Merch': return 'icon-bg-merch';
            case 'Arcade': return 'icon-bg-arcade';
            default: return '';
        }
    }

    function getDefaultIcon(cat) {
        switch(cat) {
            case 'Cafeteria': return 'bx bx-coffee';
            case 'Taquilla': return 'bx bx-ticket';
            case 'Merch': return 'bx bxs-t-shirt';
            case 'Arcade': return 'bx bx-joystick';
            default: return 'bx bx-package';
        }
    }

    // --- 2. LOGICA DE INTERFAZ NUEVA (FACTURA / TARJETA) ---
    
    // Muestra u oculta campos de RUC/Dirección según sea Boleta o Factura
    window.toggleCamposFactura = function() {
        const esFactura = document.querySelector('input[name="tipo_comprobante"]:checked').value === 'Factura';
        const divFactura = document.getElementById('campos-factura');
        const divDni = document.getElementById('campo-dni');
        const btnBoleta = document.getElementById('btn-boleta');
        const btnFactura = document.getElementById('btn-factura');

        if (esFactura) {
            divFactura.style.display = 'block';
            divDni.style.display = 'none';
            // Estilos visuales botones
            btnFactura.style.border = '2px solid #6366f1';
            btnFactura.style.background = '#e0e7ff';
            btnFactura.style.color = '#6366f1';
            
            btnBoleta.style.border = '1px solid #ccc';
            btnBoleta.style.background = '#fff';
            btnBoleta.style.color = '#666';
        } else {
            divFactura.style.display = 'none';
            divDni.style.display = 'block';
            // Estilos visuales botones
            btnBoleta.style.border = '2px solid #6366f1';
            btnBoleta.style.background = '#e0e7ff';
            btnBoleta.style.color = '#6366f1';
            
            btnFactura.style.border = '1px solid #ccc';
            btnFactura.style.background = '#fff';
            btnFactura.style.color = '#666';
        }
    }

    // Muestra u oculta sub-opciones de tarjeta (Débito/Crédito)
    window.toggleOpcionesTarjeta = function() {
        const metodo = document.querySelector('input[name="pago"]:checked').value;
        const divOpciones = document.getElementById('opciones-tarjeta');
        
        if (metodo === 'Tarjeta') {
            divOpciones.style.display = 'block';
        } else {
            divOpciones.style.display = 'none';
        }
    }

    // --- CARGAR VENDEDORES ---
    async function cargarVendedoresEnModal() {
        const select = document.getElementById('modal-vendedor');
        if(!select) return;

        const token = localStorage.getItem('token');
        let miId = null;

        try {
            const resPerfil = await fetch('/api/usuarios/perfil', { headers: { 'x-auth-token': token } });
            if(resPerfil.ok) {
                const miPerfil = await resPerfil.json();
                miId = miPerfil.id;
            }

            const resVendedores = await fetch('/api/ventas/vendedores', { headers: { 'x-auth-token': token } });
            
            if(resVendedores.ok) {
                const vendedores = await resVendedores.json();
                select.innerHTML = '';
                
                vendedores.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id;
                    opt.textContent = `${v.nombres} ${v.apellidos} (${v.rol})`; 
                    if (miId && v.id === miId) opt.selected = true;
                    select.appendChild(opt);
                });

                if (!miId) {
                    const optDefault = document.createElement('option');
                    optDefault.value = "";
                    optDefault.textContent = "Caja General (Sin asignar)";
                    optDefault.selected = true;
                    select.prepend(optDefault);
                }
            }
        } catch (error) {
            console.error("Error cargando vendedores:", error);
        }
    }

    // --- INICIALIZAR ---
    async function initPOS() {
        await cargarVendedoresEnModal();
        try {
            const token = localStorage.getItem('token');
            if (!token) return console.error("Falta Token");

            const res = await fetch('/api/inventario', { headers: { 'x-auth-token': token } });

            if(res.ok) {
                const data = await res.json();
                const productosArray = data.productos || data; 
                
                productosGlobal = productosArray.map(p => ({
                    id: p.id,
                    codigo: p.codigo_interno,
                    nombre: p.nombre,
                    precio: parseFloat(p.precio_venta),
                    cat: p.categoria,
                    stock: p.stock_actual,
                    tipo: p.tipo_item,
                    icon: p.imagen_url || getDefaultIcon(p.categoria)
                }));
                
                setTimeout(() => {
                    renderProductos(productosGlobal);
                    renderCarrito();
                }, 50);
            }
        } catch (error) {
            console.error("Error al cargar inventario:", error);
        }
    }

    // --- RENDER PRODUCTOS ---
    function renderProductos(lista) {
        const container = document.getElementById('pos-products-container');
        if(!container) return;
        container.innerHTML = '';
        
        if(!lista || lista.length === 0) {
            container.innerHTML = `<div class="empty-products"><p>Sin resultados</p></div>`;
            return;
        }
        
        lista.forEach(prod => {
            const card = document.createElement('div');
            card.className = 'product-card';
            
            let stockHtml = '';
            
            if (prod.tipo === 'fisico') {
                if (prod.stock <= 0) {
                    stockHtml = `<span class="badge-stock out">AGOTADO</span>`;
                    card.style.opacity = '0.6';
                    card.style.cursor = 'not-allowed';
                } else {
                    stockHtml = `<span class="badge-stock">${prod.stock} UND</span>`;
                    card.onclick = () => agregarAlCarrito(prod);
                }
            } else {
                 card.onclick = () => agregarAlCarrito(prod);
            }

            const iconBg = getIconBgClass(prod.cat);
            const iconContent = prod.icon.includes('http') 
                ? `<img src="${prod.icon}" style="width:100%; height:100%; border-radius:8px; object-fit:cover;">`
                : `<i class='${prod.icon}'></i>`;

            card.innerHTML = `
                <div class="product-icon ${iconBg}">${iconContent}</div>
                <div class="product-info">
                    <div class="product-meta">
                        <div class="product-name">${prod.nombre}</div>
                        <div class="product-price">S/ ${prod.precio.toFixed(2)}</div>
                    </div>
                    <div class="product-footer-row" style="display:flex; justify-content:space-between; margin-top:5px; font-size:12px;">
                         <span style="opacity:0.7">${prod.cat}</span>
                         ${stockHtml}
                    </div>
                </div>
            `;
            container.appendChild(card);
        });
    }

    // --- CARRITO ---
    function agregarAlCarrito(producto) {
        const item = carrito.find(i => i.id === producto.id);
        const cantidadActual = item ? item.cantidad : 0;

        if (producto.tipo === 'fisico' && (cantidadActual + 1) > producto.stock) {
            return alert(`⚠️ Stock insuficiente. Solo quedan ${producto.stock}.`);
        }

        if(item) {
            item.cantidad++;
        } else {
            carrito.push({ ...producto, cantidad: 1 });
        }
        renderCarrito();
    }

    window.cambiarCantidad = function(id, delta) {
        const item = carrito.find(i => i.id === id);
        if(item) {
            if (delta > 0 && item.tipo === 'fisico' && (item.cantidad + 1) > item.stock) {
                return alert("⚠️ No hay más stock disponible.");
            }
            item.cantidad += delta;
            if(item.cantidad <= 0) {
                carrito = carrito.filter(i => i.id !== id);
            }
            renderCarrito();
        }
    }

    function renderCarrito() {
        const container = document.getElementById('pos-cart-items');
        if(!container) return;
        
        container.innerHTML = '';
        let total = 0;

        carrito.forEach(item => {
            const subtotal = item.precio * item.cantidad;
            total += subtotal;
            
            const div = document.createElement('div');
            div.className = 'cart-item';
            div.innerHTML = `
                <div class="item-info">
                    <strong>${item.nombre}</strong><br>
                    <small>S/ ${item.precio.toFixed(2)} x ${item.cantidad}</small>
                </div>
                <div class="item-qty">
                    <button class="qty-btn" onclick="cambiarCantidad(${item.id}, -1)">-</button>
                    <span>${item.cantidad}</span>
                    <button class="qty-btn" onclick="cambiarCantidad(${item.id}, 1)">+</button>
                </div>
                <div class="item-total">S/ ${subtotal.toFixed(2)}</div>
            `;
            container.appendChild(div);
        });

        actualizarTotales(total);
    }

    // --- JS: ACTUALIZACIÓN ---
    function actualizarTotales(total) {
        totalVentaOriginal = total;
        const base = total / 1.18;
        const igv = total - base;

        if(document.getElementById('lbl-subtotal')) document.getElementById('lbl-subtotal').innerText = "S/ " + base.toFixed(2);
        if(document.getElementById('lbl-igv')) document.getElementById('lbl-igv').innerText = "S/ " + igv.toFixed(2);
        if(document.getElementById('lbl-total')) document.getElementById('lbl-total').innerText = "S/ " + total.toFixed(2);
        
        // 🔥 NUEVO: Actualizar botón flotante morado en móvil
        const floatBtn = document.querySelector('.float-cart-btn span'); // Busca el span dentro del botón
        if(floatBtn) floatBtn.innerText = "S/ " + total.toFixed(2);

        const modalTotal = document.getElementById('modal-total-display');
        if(modalTotal) modalTotal.innerText = "S/ " + total.toFixed(2);
        
        aplicarDescuentoConvenio(); 
    }

    // --- MODAL Y COBRO ---
    window.abrirModalCobro = function() {
        console.log("Intentando abrir modal de cobro..."); // Para depuración

        if(carrito.length === 0) return alert("⚠️ Carrito vacío.");
        
        // 1. Resetear datos visuales del modal
        document.getElementById('modal-convenio').value = "0"; 
        
        // Boleta por defecto
        const radioBoleta = document.querySelector('input[name="tipo_comprobante"][value="Boleta"]');
        if(radioBoleta) radioBoleta.checked = true;
        toggleCamposFactura(); 

        // Efectivo por defecto
        const radioEfectivo = document.querySelector('input[name="pago"][value="Efectivo"]');
        if(radioEfectivo) radioEfectivo.checked = true;
        toggleOpcionesTarjeta();

        // 2. 🔥 CORRECCIÓN CRÍTICA PARA MÓVIL:
        // Si estamos en móvil, OCULTAMOS el panel del carrito para ver el modal
        const ticketPanel = document.querySelector('.pos-ticket');
        if(ticketPanel && ticketPanel.classList.contains('active')) {
            ticketPanel.classList.remove('active');
        }

        // 3. Abrir el modal
        const modal = document.getElementById('modal-cobro');
        if(modal) {
            modal.classList.add('active');
            actualizarTotales(totalVentaOriginal); 
        } else {
            console.error("No se encontró el #modal-cobro en el HTML");
        }
    }

    window.toggleCarritoMovil = function() {
        const ticketPanel = document.getElementById('ticket-panel');
        
        // Si el panel existe, le ponemos o quitamos la clase 'active'
        if (ticketPanel) {
            ticketPanel.classList.toggle('active');
        } else {
            console.error("No se encontró el elemento #ticket-panel");
        }
    };

    window.cerrarModalCobro = function() {
        document.getElementById('modal-cobro').classList.remove('active');
    }

    window.aplicarDescuentoConvenio = function() {
        const selector = document.getElementById('modal-convenio');
        const display = document.getElementById('modal-total-display');
        
        const descuentoPorcentaje = parseFloat(selector.value); 
        const montoDescontar = totalVentaOriginal * descuentoPorcentaje;
        const nuevoTotal = totalVentaOriginal - montoDescontar;
    
        display.innerText = "S/ " + nuevoTotal.toFixed(2);
        
        if (descuentoPorcentaje > 0) {
            display.style.color = "#28a745"; 
            display.innerHTML += ` <small style='font-size:14px; color:#666;'>(Desc. -S/${montoDescontar.toFixed(2)})</small>`;
        } else {
            display.style.color = "#6366f1"; 
        }
    }
    
// --- 🔥 FUNCIÓN PRINCIPAL: PROCESAR VENTA (CON IMPRESIÓN) ---
    window.procesarVenta = async function() {
        if (carrito.length === 0) return alert("⚠️ Carrito vacío.");

        const btn = document.querySelector('.btn-primary.full-width');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Procesando...";

        try {
            // 1. Recopilar datos básicos
            const vendedorId = document.getElementById('modal-vendedor').value;
            const tipoVenta = document.getElementById('modal-tipo-venta').value;
            const selectorConvenio = document.getElementById('modal-convenio');
            const descuentoFactor = parseFloat(selectorConvenio.value) || 0;
            const nombreConvenio = selectorConvenio.options[selectorConvenio.selectedIndex].text;
            
            // 2. Recopilar Método de Pago
            const metodoPago = document.querySelector('input[name="pago"]:checked').value;
            let tipoTarjeta = null;
            if (metodoPago === 'Tarjeta') {
                tipoTarjeta = document.querySelector('input[name="tipo_tarjeta"]:checked').value; 
            }

            // 3. Recopilar Datos de Comprobante
            const tipoComprobante = document.querySelector('input[name="tipo_comprobante"]:checked').value;
            let docCliente = null;
            let razonSocial = null;
            let direccion = null;
            
            if (tipoComprobante === 'Factura') {
                docCliente = document.getElementById('cliente-ruc').value;
                if(!docCliente) {
                    alert("⚠️ Para FACTURA el RUC es obligatorio.");
                    btn.disabled = false; btn.innerText = originalText;
                    return;
                }
                razonSocial = document.getElementById('cliente-razon').value;
                direccion = document.getElementById('cliente-direccion').value;
            } else {
                docCliente = document.getElementById('cliente-dni').value;
            }

            // 4. Preparar Payload
            const payload = {
                carrito: carrito.map(i => ({ id: i.id, cantidad: i.cantidad })),
                vendedor_id: vendedorId,
                tipo_venta: tipoVenta,
                metodoPago: metodoPago,
                
                tipo_comprobante: tipoComprobante,
                clienteDni: docCliente, 
                cliente_razon_social: razonSocial,
                cliente_direccion: direccion,
                tipo_tarjeta: tipoTarjeta,

                observaciones: (descuentoFactor > 0) ? `Convenio: ${nombreConvenio}` : "",
                descuento_factor: descuentoFactor
            };

            const token = localStorage.getItem('token');
            const res = await fetch('/api/ventas', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-token': token
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok) {
                // ✅ VENTA EXITOSA
                let mensaje = `✅ ¡Venta Exitosa!\nTicket: ${data.ticketCodigo || 'OK'}`;
                
                // 🔥 SI HAY PDF (Nubefact respondió rápido), ABRIRLO
                // Intentamos abrir el PDF en una pestaña nueva automáticamente
                // Esperamos un segundo para que el backend asíncrono termine (si fue muy rápido)
                // O mejor, le decimos al usuario que vaya al historial si no sale aquí.
                
                // NOTA: Como la facturación es ASÍNCRONA en el backend, es probable que 'data.pdf'
                // no llegue en esta respuesta inmediata. El usuario tendrá que ir al Historial a imprimir.
                // Sin embargo, si llegara a responder rápido, lo mostramos.
                
                alert(mensaje);

                carrito = [];
                renderCarrito();
                cerrarModalCobro();
                
                const ticketPanel = document.querySelector('.pos-ticket');
                if(ticketPanel) ticketPanel.classList.remove('active');
                
                initPOS(); 
            } else {
                alert(`❌ Error: ${data.msg}`);
            }

        } catch (error) {
            console.error(error);
            alert("❌ Error de conexión.");
        } finally {
            btn.disabled = false;
            btn.innerText = originalText;
        }
    }
    // --- JS: AGREGAR SI FALTA ---
window.toggleCarritoMovil = function() {
    // Busca por clase .pos-ticket (es más seguro que por ID si cambiaste el HTML)
    const ticketPanel = document.querySelector('.pos-ticket'); 
    if (ticketPanel) {
        ticketPanel.classList.toggle('active');
    } else {
        console.error("No se encontró el panel del carrito (.pos-ticket)");
    }
};

    // Filtros
    window.filtrarCategoriaPOS = function(cat, btn) {
        categoriaActual = cat;
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        if(btn) btn.classList.add('active');
        aplicarFiltros();
    }
    window.filtrarProductosPOS = function() { aplicarFiltros(); }

    function aplicarFiltros() {
        const termino = document.getElementById('pos-search').value.toLowerCase();
        let filtrados = productosGlobal;
        if(categoriaActual !== 'todos') filtrados = filtrados.filter(p => p.cat === categoriaActual);
        if(termino) filtrados = filtrados.filter(p => p.nombre.toLowerCase().includes(termino));
        renderProductos(filtrados);
    }

    initPOS();
})();