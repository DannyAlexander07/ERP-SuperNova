// Ubicacion: SuperNova/frontend/modules/ventas/ventas.js

(function() {
    console.log("Modulo POS Conectado");

    let productosGlobal = [];
    let carrito = [];
    let totalVentaOriginal = 0; // Para guardar el total sin descuento
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

    // --- CARGAR VENDEDORES EN EL MODAL ---
    async function cargarVendedoresEnModal() {
        const select = document.getElementById('modal-vendedor');
        if(!select) return;

        const token = localStorage.getItem('token');
        let miId = null;

        try {
            // PASO 1: Averiguar quién está conectado (Tú)
            // Usamos la ruta de perfil que ya arreglamos anteriormente
            const resPerfil = await fetch('/api/usuarios/perfil', {
                headers: { 'x-auth-token': token }
            });
            if(resPerfil.ok) {
                const miPerfil = await resPerfil.json();
                miId = miPerfil.id;
                // console.log("Usuario logueado ID:", miId);
            }

            // PASO 2: Obtener la lista de TODOS los vendedores (de todas las sedes)
            const resVendedores = await fetch('/api/ventas/vendedores', {
                headers: { 'x-auth-token': token }
            });
            
            if(resVendedores.ok) {
                const vendedores = await resVendedores.json();
                
                // Limpiamos el select
                select.innerHTML = '';

                // Opción opcional por si quieres dejarlo en blanco
                // select.innerHTML = '<option value="">-- Seleccionar --</option>';
                
                // PASO 3: Llenar la lista y marcarte a ti
                vendedores.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.id;
                    // Mostramos Nombre y Sede para que sea fácil ubicar a gente de otras tiendas
                    // (Asumiendo que el backend devuelva la sede, si no, solo nombre)
                    opt.textContent = `${v.nombres} ${v.apellidos} (${v.rol})`; 

                    // 🔥 AQUÍ ESTÁ LA MAGIA: Si el ID coincide contigo, se selecciona solo
                    if (miId && v.id === miId) {
                        opt.selected = true;
                    }

                    select.appendChild(opt);
                });

                // Si no se encontró tu ID (raro), agregamos una opción de "Caja General" al inicio
                if (!miId) {
                    const optDefault = document.createElement('option');
                    opt.value = "";
                    opt.textContent = "Caja General (Sin asignar)";
                    opt.selected = true;
                    select.prepend(optDefault);
                }
            }
        } catch (error) {
            console.error("Error cargando vendedores:", error);
            select.innerHTML = '<option>Error al cargar lista</option>';
        }
    }

    // --- 2. INICIALIZAR ---
    async function initPOS() {
        await cargarVendedoresEnModal();
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
        totalVentaOriginal = total;
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
        if(carrito.length === 0) return alert("⚠️ Carrito vacío.");
        
        // Resetear selector
        const selector = document.getElementById('modal-convenio');
        if(selector) selector.value = "0"; 
        
        // Resetear texto total
        actualizarTotales(totalVentaOriginal); 

        document.getElementById('modal-cobro').classList.add('active');
    }
    window.cerrarModalCobro = function() {
        document.getElementById('modal-cobro').classList.remove('active');
    }

    
    window.procesarVenta = async function() {
        if (carrito.length === 0) return alert("⚠️ Carrito vacío.");

        const btn = document.querySelector('.btn-primary.full-width');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = "Procesando...";

        try {
            // Recopilar datos
            const vendedorId = document.getElementById('modal-vendedor').value;
            const tipoVenta = document.getElementById('modal-tipo-venta').value;
            const metodoPago = document.querySelector('input[name="pago"]:checked').value;
            const clienteDni = document.getElementById('cliente-dni').value;
            const selectorConvenio = document.getElementById('modal-convenio');
            const descuentoFactor = parseFloat(selectorConvenio.value) || 0; // 0.50
            const nombreConvenio = selectorConvenio.options[selectorConvenio.selectedIndex].text;

            // 🔥 ENVIAMOS TODO JUNTO (Carrito completo)
            // El backend se encarga de recorrerlo, descontar stock y generar 1 solo ticket.
            const payload = {
                carrito: carrito.map(i => ({ id: i.id, cantidad: i.cantidad })),
                vendedor_id: vendedorId,
                tipo_venta: tipoVenta,
                metodoPago: metodoPago,
                clienteDni: clienteDni,
                observaciones: (descuentoFactor > 0) ? `Convenio Aplicado: ${nombreConvenio}` : "", // Guardamos en observaciones
                descuento_factor: descuentoFactor // Enviamos el factor numérico
            };

            const token = localStorage.getItem('token');
            const res = await fetch('/api/ventas', { // Asegúrate que la ruta sea POST /api/ventas
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-token': token
                },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok) {
                alert(`✅ ¡Venta Exitosa!\nTicket: ${data.ticketCodigo}\nTotal: S/ ${parseFloat(data.total).toFixed(2)}`);
                carrito = [];
                renderCarrito();
                cerrarModalCobro();
                initPOS(); // Recargar inventario
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

    window.aplicarDescuentoConvenio = function() {
    const selector = document.getElementById('modal-convenio');
    const display = document.getElementById('modal-total-display');
    
    const descuentoPorcentaje = parseFloat(selector.value); // ej: 0.50
    const montoDescontar = totalVentaOriginal * descuentoPorcentaje;
    const nuevoTotal = totalVentaOriginal - montoDescontar;

    display.innerText = "S/ " + nuevoTotal.toFixed(2);
    
    // Cambio visual si hay descuento
    if (descuentoPorcentaje > 0) {
        display.style.color = "#28a745"; // Verde
        display.innerHTML += ` <small style='font-size:14px; color:#666;'>(Desc. -S/${montoDescontar.toFixed(2)})</small>`;
    } else {
        display.style.color = ""; // Color original
    }
}

    initPOS();
})();