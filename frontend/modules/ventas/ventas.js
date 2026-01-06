// Ubicacion: SuperNova/frontend/modules/ventas/ventas.js

(function() {
    console.log("Modulo POS Conectado");

    let productosGlobal = [];
    let carrito = [];
    let categoriaActual = 'todos';

    // --- 1. UTILIDADES ---
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


    // --- 2. INICIALIZAR ---
    async function initPOS() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return console.error("Falta Token");

            const res = await fetch('/api/inventario', {
                headers: { 'x-auth-token': token }
            });

            if(res.ok) {
                const data = await res.json();
                
                // 🚨 NOTA: El backend devuelve { productos: array, sede: nombre_sede }. 
                // Asumiremos que el array de productos está en data.productos.
                const productosArray = data.productos || data; // Usar data.productos o data directamente
                
                // Mapeo DB -> POS
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
                
                // 🚨 CORRECCIÓN CRÍTICA: Retrasar el renderizado
                setTimeout(() => {
                    renderProductos(productosGlobal);
                    renderCarrito();
                }, 50); // Pequeño retraso de 50ms para que el DOM esté listo
                
            } else {
                console.error("Error al cargar inventario (HTTP):", res.status);
                // Mostrar mensaje de error en el catálogo si es posible
            }
        } catch (error) {
            console.error("Error al cargar inventario (Red/Parseo):", error);
        }
    }

    // --- 3. RENDER PRODUCTOS ---
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
            let disabledClass = '';
            
            // Lógica visual de Stock
            if (prod.tipo === 'fisico') {
                if (prod.stock <= 0) {
                    stockHtml = `<span class="badge-stock out">AGOTADO</span>`;
                    disabledClass = 'disabled';
                    card.style.opacity = '0.6';
                    card.style.cursor = 'not-allowed';
                } else {
                    stockHtml = `<span class="badge-stock">${prod.stock} UND</span>`;
                    card.onclick = () => agregarAlCarrito(prod);
                }
            } else {
                 // Servicios siempre clickeables
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

    // --- 4. CARRITO ---
    function agregarAlCarrito(producto) {
        const item = carrito.find(i => i.id === producto.id);
        const cantidadActual = item ? item.cantidad : 0;

        // Validar Stock antes de agregar
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
            // Validar al sumar
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

    function actualizarTotales(total) {
        const base = total / 1.18;
        const igv = total - base;

        // Actualizamos los IDs que están en tu HTML
        if(document.getElementById('lbl-subtotal')) document.getElementById('lbl-subtotal').innerText = "S/ " + base.toFixed(2);
        if(document.getElementById('lbl-igv')) document.getElementById('lbl-igv').innerText = "S/ " + igv.toFixed(2);
        if(document.getElementById('lbl-total')) document.getElementById('lbl-total').innerText = "S/ " + total.toFixed(2);
        
        const modalTotal = document.getElementById('modal-total-display');
        if(modalTotal) modalTotal.innerText = "S/ " + total.toFixed(2);
    }

    // --- 5. COBRO ---
    window.abrirModalCobro = function() {
        if(carrito.length === 0) {
            return alert("⚠️ El carrito está vacío. Agrega productos primero.");
        }
        // Agregamos la clase que hace visible el modal
        document.getElementById('modal-cobro').classList.add('active');
    }

    window.cerrarModalCobro = function() {
        document.getElementById('modal-cobro').classList.remove('active');
    }

    // FUNCION PRINCIPAL DE PAGO
    window.procesarVenta = async function() {
        if (carrito.length === 0) {
            return alert("⚠️ Carrito vacío.");
        }

        const btn = document.querySelector('.btn-primary.full-width'); // Botón Confirmar Pago
        const textoOriginal = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Procesando...";

        try {
            // Leer valores del formulario
            const metodoPago = document.querySelector('input[name="pago"]:checked').value;
            const clienteDni = document.getElementById('cliente-dni').value;
            const totalVenta = parseFloat(document.getElementById('lbl-total').innerText.replace('S/ ', ''));
            const subtotal = parseFloat(document.getElementById('lbl-subtotal').innerText.replace('S/ ', ''));
            const igv = parseFloat(document.getElementById('lbl-igv').innerText.replace('S/ ', ''));

            // Payload
            const ventaPayload = {
                metodoPago,
                clienteDni,
                totalVenta,
                subtotal,
                igv,
                carrito: carrito.map(i => ({
                    id: i.id,
                    cantidad: i.cantidad,
                    precio: i.precio,
                    nombre: i.nombre
                }))
            };

            const token = localStorage.getItem('token');
            const res = await fetch('/api/ventas', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-token': token
                },
                body: JSON.stringify(ventaPayload)
            });

            const data = await res.json();

            if (res.ok) {
                alert(`✅ ¡Venta Exitosa!\nTicket #${data.ventaId}`);
                carrito = [];
                renderCarrito();
                cerrarModalCobro();
                initPOS(); // Recargar para ver stock actualizado
            } else {
                // Si falla (ej: error 500 o stock insuficiente) mostramos el mensaje
                alert(`❌ ERROR: ${data.msg || 'Error desconocido en servidor'}`);
            }

        } catch (error) {
            console.error(error);
            alert("❌ Error de conexión. Verifique que el servidor esté encendido.");
        } finally {
            btn.disabled = false;
            btn.innerText = textoOriginal;
        }
    }

    // Filtros visuales
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