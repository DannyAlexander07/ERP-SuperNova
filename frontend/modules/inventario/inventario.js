// Ubicacion: SuperNova/frontend/modules/inventario/inventario.js

(function() {
    console.log("Modulo Inventario FINAL Activo 🏢");

    let productosData = [];
    
    let filtroActual = 'todos';
    let nombreSedeActual = "";
    // Variables de Paginación Inventario
    let pagInvActual = 1;
    const filasInv = 7; // Cantidad de productos por página
    // Variable Global para guardar el historial y filtrar/exportar
    // Variables para Paginación del Kardex
    let movimientosKardex = [];  
    let movimientosFiltrados = [];  // Datos que se están mostrando
    let paginaActual = 1;
    const filasPorPagina = 7;       // Cantidad de filas por hoja

    // 1. CARGAR DATOS
    async function initInventario() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return console.warn("No token");

            const res = await fetch('/api/inventario', {
                method: 'GET',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': token }
            });

            if(res.ok) {
                const data = await res.json();
                nombreSedeActual = data.sede; 

                // Título Dinámico
                const lblSede = document.getElementById('lbl-sede-actual');
                if(lblSede && data.sede) {
                    lblSede.innerHTML = `<i class='bx bxs-store'></i> Inventario Local: <strong>${data.sede}</strong>`;
                }

                // Mapeo
                productosData = (data.productos || []).map(p => ({
                    id: p.id,
                    codigo: p.codigo_interno,
                    nombre: p.nombre,
                    categoria: p.categoria,
                    stock: parseInt(p.stock_actual),
                    minimo: p.stock_minimo || 5,
                    precio: parseFloat(p.precio_venta),
                    costo: parseFloat(p.costo_compra),
                    tipo: p.tipo_item,
                    unidad: p.unidad_medida,
                    icon: p.imagen_url || getDefaultIcon(p.categoria) 
                }));
                
                renderizarTabla();
            }
        } catch (error) { console.error(error); }
    }

    // --- RENDERIZADO ---
    function renderizarTabla(datos = productosData) {
        const tbody = document.getElementById('tabla-productos-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // 1. Filtrar
        const datosFiltrados = filtroActual === 'todos' ? datos : datos.filter(p => p.tipo === filtroActual);

        if (datosFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No se encontraron productos.</td></tr>';
            actualizarControlesPaginacionInv(0);
            return;
        }

        // 2. PAGINACIÓN: Cortar el array
        const inicio = (pagInvActual - 1) * filasInv;
        const fin = inicio + filasInv;
        const datosPagina = datosFiltrados.slice(inicio, fin);

        // 3. Renderizar solo la página actual
        datosPagina.forEach(prod => {
            const tr = document.createElement('tr');
            
            let stockHtml = '';
            let mostrarBotonStock = 'none';

            if (prod.tipo === 'fisico') {
                mostrarBotonStock = 'inline-flex';
                if (prod.stock <= 0) stockHtml = `<span style="color:red; font-weight:bold;">🔴 Agotado</span>`;
                else if (prod.stock <= prod.minimo) stockHtml = `<span style="color:orange; font-weight:bold;">⚠️ ${prod.stock} (Bajo)</span>`;
                else stockHtml = `<span style="color:green; font-weight:bold;">🟢 ${prod.stock} UND</span>`;
            } else {
                stockHtml = `<span style="color:#999;">∞</span>`;
            }

            const bgClass = getIconClass(prod.categoria);
            const iconClass = prod.icon.includes('http') ? 'bx bxs-image' : prod.icon;

            tr.innerHTML = `
                <td>
                    <div class="product-cell">
                        <div class="product-icon-table ${bgClass}"><i class='${iconClass}'></i></div>
                        <div><h4>${prod.nombre}</h4><span class="prod-code">${prod.codigo}</span></div>
                    </div>
                </td>
                <td><span class="badge-cat">${prod.categoria}</span></td>
                <td><span class="badge-type">${prod.tipo}</span></td>
                <td>${stockHtml}</td>
                <td>S/ ${prod.precio.toFixed(2)}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action add-stock" data-id="${prod.id}" style="display:${mostrarBotonStock}; background:#dcfce7; color:#16a34a;" title="Sumar Stock"><i class='bx bx-plus-medical'></i></button>
                        <button class="btn-action edit" data-id="${prod.id}"><i class='bx bx-edit-alt'></i></button>
                        <button class="btn-action delete" data-id="${prod.id}"><i class='bx bx-trash'></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // 4. Lógica de Clicks
        tbody.onclick = (e) => {
            const btnStock = e.target.closest('.add-stock');
            const btnEdit = e.target.closest('.edit');
            const btnDel = e.target.closest('.delete');
            if (btnStock) window.abrirModalStock(parseInt(btnStock.dataset.id));
            if (btnEdit) editarProducto(parseInt(btnEdit.dataset.id));
            if (btnDel) eliminarProducto(parseInt(btnDel.dataset.id));
        };

        // 5. Actualizar los botones de abajo
        actualizarControlesPaginacionInv(datosFiltrados.length);
    }

    function actualizarControlesPaginacionInv(totalItems) {
        const totalPaginas = Math.ceil(totalItems / filasInv) || 1;
        
        // Actualizar texto info (ej: Mostrando 1 - 7 de 50)
        const info = document.querySelector('.pagination .page-info');
        if(info) {
            const inicio = (pagInvActual - 1) * filasInv + 1;
            const fin = Math.min(pagInvActual * filasInv, totalItems);
            info.innerText = totalItems > 0 ? `Mostrando ${inicio} - ${fin} de ${totalItems} productos` : 'Sin resultados';
        }

        // Actualizar botones
        const contenedor = document.querySelector('.pagination .page-controls');
        if(contenedor) {
            contenedor.innerHTML = `
                <button ${pagInvActual === 1 ? 'disabled' : ''} onclick="cambiarPaginaInv(-1)">
                    <i class='bx bx-chevron-left'></i>
                </button>
                <button class="active">${pagInvActual}</button>
                <button ${pagInvActual >= totalPaginas ? 'disabled' : ''} onclick="cambiarPaginaInv(1)">
                    <i class='bx bx-chevron-right'></i>
                </button>
            `;
        }
    }

    // Función global para el onclick del HTML
    window.cambiarPaginaInv = function(delta) {
        pagInvActual += delta;
        renderizarTabla();
    }

    // --- 3. KARDEX ---
    window.verKardex = async function() {
        document.getElementById('modal-kardex').classList.add('active');
        
        // Llenar Filtro (Solo si está vacío para no duplicar)
        const selectFiltro = document.getElementById('filtro-producto-kardex');
        if(selectFiltro && selectFiltro.options.length <= 1 && productosData.length > 0) {
            selectFiltro.innerHTML = '<option value="">Todos los Productos</option>';
            productosData.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.nombre; 
                opt.textContent = p.nombre;
                selectFiltro.appendChild(opt);
            });
        }

        const tbody = document.getElementById('tabla-kardex-body');
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center">Cargando...</td></tr>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/inventario/kardex', {
                headers: { 'x-auth-token': token }
            });
            
            if(res.ok) {
                movimientosKardex = await res.json(); 
                movimientosFiltrados = [...movimientosKardex]; // Iniciamos con todo sin filtrar
                paginaActual = 1; // Siempre empezar en la 1
                renderKardexPaginado(); // <--- LLAMADA NUEVA
            }
        } catch (e) { console.error(e); }
    }

    // Función que renderiza SOLO la página actual
    function renderKardexPaginado() {
        const tbody = document.getElementById('tabla-kardex-body');
        tbody.innerHTML = '';

        if(movimientosFiltrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">Sin movimientos.</td></tr>';
            document.getElementById('kardex-page-info').innerText = "0 de 0";
            document.getElementById('kardex-pagination-controls').innerHTML = "";
            return;
        }

        // CÁLCULO MATEMÁTICO DE PÁGINA
        const inicio = (paginaActual - 1) * filasPorPagina;
        const fin = inicio + filasPorPagina;
        const datosPagina = movimientosFiltrados.slice(inicio, fin);
        const totalPaginas = Math.ceil(movimientosFiltrados.length / filasPorPagina);

        // RENDERIZAR FILAS
        datosPagina.forEach(m => {
            const tr = document.createElement('tr');
            const fecha = new Date(m.fecha).toLocaleString();
            
            const esPositivo = m.cantidad > 0;
            let color = esPositivo ? "#16a34a" : "#dc2626";
            let signo = esPositivo ? "+" : "";
            let icono = esPositivo ? "bx-up-arrow-alt" : "bx-down-arrow-alt";
            let tipoTexto = esPositivo ? "Entrada" : "Salida";
            
            if (m.tipo_movimiento && m.tipo_movimiento.includes('ajuste')) tipoTexto = "Ajuste";

            // Dinero
            const costo = parseFloat(m.costo_unitario) || 0;
            const total = Math.abs(m.cantidad) * costo;

            tr.innerHTML = `
                <td style="font-size:12px; color:#666;">${fecha}</td>
                
                <td>
                    <span style="background:#e0e7ff; color:#3730a3; padding:4px 8px; border-radius:6px; font-weight:700; font-size:11px;">
                        ${m.nombre_sede || 'Sede'}
                    </span>
                </td>

                <td style="font-weight:600; font-size:13px;">${m.producto}</td>
                <td>
                    <span style="color:${color}; font-weight:bold; font-size:12px;">
                        <i class='bx ${icono}'></i> ${tipoTexto}
                    </span>
                    <br><small style="color:#888; font-size:10px;">${m.motivo || '-'}</small>
                </td>
                <td style="text-align:center; font-weight:bold; color:${color}">${signo}${m.cantidad}</td>
                <td style="text-align:right; font-size:12px;">S/ ${costo.toFixed(2)}</td>
                <td style="text-align:right; font-weight:bold; font-size:12px; color:#333;">S/ ${total.toFixed(2)}</td>
                <td style="text-align:center; font-weight:bold">${m.stock_resultante}</td>
                <td style="font-size:11px;">${m.usuario || 'Sistema'}</td>
            `;
            tbody.appendChild(tr);
        });

        // ACTUALIZAR CONTROLES DE PAGINACIÓN
        const info = document.getElementById('kardex-page-info');
        if(info) info.innerText = `Mostrando ${inicio + 1} - ${Math.min(fin, movimientosFiltrados.length)} de ${movimientosFiltrados.length}`;

        const controls = document.getElementById('kardex-pagination-controls');
        if(controls) {
            controls.innerHTML = `
                <button class="page-btn" ${paginaActual === 1 ? 'disabled' : ''} onclick="cambiarPaginaKardex(-1)">
                    <i class='bx bx-chevron-left'></i>
                </button>
                <span style="font-size:13px; font-weight:bold; margin:0 10px;">${paginaActual} / ${totalPaginas}</span>
                <button class="page-btn" ${paginaActual === totalPaginas ? 'disabled' : ''} onclick="cambiarPaginaKardex(1)">
                    <i class='bx bx-chevron-right'></i>
                </button>
            `;
        }
    }

    window.cambiarPaginaKardex = function(delta) {
        paginaActual += delta;
        renderKardexPaginado();
    }

    // --- 4. FILTRAR KARDEX ---
    window.filtrarTablaKardex = function() {
        const productoSeleccionado = document.getElementById('filtro-producto-kardex').value;
        
        if (!productoSeleccionado) {
            movimientosFiltrados = [...movimientosKardex];
        } else {
            movimientosFiltrados = movimientosKardex.filter(m => m.producto === productoSeleccionado);
        }
        
        paginaActual = 1; // IMPORTANTE: Volver a la primera página al filtrar
        renderKardexPaginado();
    }

    // --- 5. EXPORTAR EXCEL ---
// --- EXPORTAR EXCEL COMPLETO (CON DINERO) ---
    window.exportarKardexExcel = function() {
        if(movimientosKardex.length === 0) return alert("⚠️ No hay datos para exportar.");

        if (typeof XLSX === 'undefined') return alert("⚠️ Error librería Excel.");

        const datosParaExcel = movimientosKardex.map(m => {
            const esEntrada = m.cantidad > 0;
            const costo = parseFloat(m.costo_unitario) || 0;
            const total = Math.abs(m.cantidad) * costo;

            return {
                "Fecha": new Date(m.fecha).toLocaleString(),
                "Producto": m.producto,
                "Movimiento": esEntrada ? "ENTRADA" : "SALIDA",
                "Detalle": m.motivo,
                "Cantidad": m.cantidad,
                "Costo Unitario": costo,  // Nuevo campo
                "Valor Total": total,     // Nuevo campo
                "Saldo Stock": m.stock_resultante,
                "Responsable": m.usuario
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(datosParaExcel);
        const workbook = XLSX.utils.book_new();
        
        // Ajustar ancho
        const wscols = [
            {wch: 20}, {wch: 25}, {wch: 10}, {wch: 25}, {wch: 8}, 
            {wch: 12}, {wch: 12}, {wch: 10}, {wch: 15}
        ];
        worksheet['!cols'] = wscols;

        XLSX.utils.book_append_sheet(workbook, worksheet, "Kardex Valorizado");
        
        const fechaHoy = new Date().toISOString().split('T')[0];
        XLSX.writeFile(workbook, `Kardex_Valorizado_${fechaHoy}.xlsx`);
    }

    // --- MODALES ---
    window.abrirModalStock = function(id) {
        const prod = productosData.find(p => p.id === id);
        if(!prod) return;
        
        document.getElementById('modal-stock').classList.add('active');
        document.getElementById('stk-id').value = prod.id;
        
        // Info Visual
        document.getElementById('stk-nombre-display').innerText = prod.nombre;
        document.getElementById('stk-actual-display').innerText = prod.stock + " " + prod.unidad;
        
        // Reset inputs
        document.getElementById('stk-cantidad').value = "";
        document.getElementById('stk-costo').value = prod.costo || "";
        
        // Default a Entrada
        setTipoStock('entrada');
    }

    window.setTipoStock = function(tipo) {
        document.getElementById('stk-tipo').value = tipo;
        
        const tabEntrada = document.getElementById('tab-entrada');
        const tabSalida = document.getElementById('tab-salida');
        const btnSubmit = document.getElementById('btn-stock-submit');
        const groupCosto = document.getElementById('group-costo');
        const selectMotivo = document.getElementById('stk-motivo');

        // Estilos
        if(tipo === 'entrada') {
            tabEntrada.style.background = '#fff'; tabEntrada.style.color = '#16a34a'; tabEntrada.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
            tabSalida.style.background = 'transparent'; tabSalida.style.color = '#64748b'; tabSalida.style.boxShadow = 'none';
            
            btnSubmit.style.backgroundColor = '#16a34a';
            btnSubmit.innerText = "Confirmar Ingreso";
            groupCosto.style.display = 'block'; // Costo editable en entrada

            // Motivos de Entrada
            selectMotivo.innerHTML = `
                <option value="Compra a Proveedor">Compra a Proveedor</option>
                <option value="Devolución Cliente">Devolución Cliente</option>
                <option value="Ajuste Inventario (+)">Ajuste Inventario (+)</option>
            `;
        } else {
            // SALIDA (ROJO)
            tabSalida.style.background = '#fff'; tabSalida.style.color = '#dc2626'; tabSalida.style.boxShadow = '0 2px 5px rgba(0,0,0,0.05)';
            tabEntrada.style.background = 'transparent'; tabEntrada.style.color = '#64748b'; tabEntrada.style.boxShadow = 'none';
            
            btnSubmit.style.backgroundColor = '#dc2626';
            btnSubmit.innerText = "Confirmar Baja/Merma";
            groupCosto.style.display = 'none'; // Costo oculto en salida (usa promedio)

            // Motivos de Salida
            selectMotivo.innerHTML = `
                <option value="Venta Manual">Venta Manual</option>
                <option value="Consumo Interno">Consumo Interno</option>
                <option value="MERMA: Vencimiento">MERMA: Vencimiento</option>
                <option value="MERMA: Rotura/Daño">MERMA: Rotura/Daño</option>
                <option value="MARKETING: Cortesía">MARKETING: Cortesía</option>
                <option value="Robo/Pérdida">Robo/Pérdida</option>
                <option value="Ajuste Inventario (-)">Ajuste Inventario (-)</option>
            `;
        }
    }

    window.cerrarModalStock = function() { document.getElementById('modal-stock').classList.remove('active'); }
    window.cerrarModalKardex = function() { document.getElementById('modal-kardex').classList.remove('active'); }
    window.abrirModalProducto = function() {
        document.getElementById('modal-producto').classList.add('active');
        document.getElementById('form-producto').reset();
        document.getElementById('prod-id').value = "";
        document.querySelector('#modal-title').innerText = "Nuevo Ítem";
        const inputCodigo = document.getElementById('prod-codigo');
        if (inputCodigo) inputCodigo.value = getPrefijoSede();
        toggleTipoProducto();
    }
    window.cerrarModalProducto = function() { document.getElementById('modal-producto').classList.remove('active'); }

    // --- FORMULARIO PRODUCTO ---
    window.guardarProducto = async function() {
        const id = document.getElementById('prod-id').value;
        const nombre = document.getElementById('prod-nombre').value;
        const codigo = document.getElementById('prod-codigo').value;
        const precio = document.getElementById('prod-precio').value;
        const tipo = document.getElementById('prod-tipo').value;
        const categoria = document.getElementById('prod-categoria').value;
        
        if(!nombre || !codigo || !precio) return alert("Faltan datos obligatorios.");

        // 🧠 LÓGICA INTELIGENTE: Inferir Línea de Negocio para el P&L
        let lineaNegocioCalculada = 'CAFETERIA'; // Default
        const catUpper = categoria.toUpperCase();
        
        if (catUpper.includes('ENTRADA') || catUpper.includes('TICKET') || catUpper.includes('PULSERA')) {
            lineaNegocioCalculada = 'TAQUILLA';
        } else if (catUpper.includes('MERCH') || catUpper.includes('ROPA') || catUpper.includes('MEDIA')) {
            lineaNegocioCalculada = 'MERCH';
        } else if (catUpper.includes('EVENTO') || catUpper.includes('CUMPLEAÑOS')) {
            lineaNegocioCalculada = 'EVENTO';
        }

        const formObj = {
            nombre, codigo, categoria, tipo,
            unidad: document.getElementById('prod-unidad').value,
            precio: parseFloat(precio),
            costo: parseFloat(document.getElementById('prod-costo').value) || 0,
            stock: parseInt(document.getElementById('prod-stock').value) || 0,
            stock_minimo: parseInt(document.getElementById('prod-minimo').value) || 0,
            imagen: getDefaultIcon(categoria),
            comboDetalles: [],
            // 🚨 ENVIAMOS LA LÍNEA CALCULADA
            lineaNegocio: lineaNegocioCalculada 
        };

        const btnSave = document.querySelector('#modal-producto .btn-primary');
        const txtOriginal = btnSave.innerText;
        btnSave.innerText = "Guardando..."; btnSave.disabled = true;

        try {
            let url = '/api/inventario';
            let method = 'POST';
            if(id) { 
                // Nota: Si es editar, podrías necesitar otra lógica o enviarlo igual
                url = `/api/inventario/${id}`; 
                // En editar también solemos querer actualizar la línea de negocio
                // pero necesitaríamos actualizar la función 'actualizarProducto' en el backend también.
                // Por ahora, nos enfocamos en CREAR.
                method = 'PUT'; 
            }

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
                body: JSON.stringify(formObj)
            });
            
            const data = await res.json();
            if(res.ok) {
                alert("✅ " + data.msg);
                cerrarModalProducto();
                await initInventario();
            } else {
                alert("❌ Error: " + data.msg);
            }
        } catch (error) { console.error(error); alert("Error conexión"); }
        finally {
            btnSave.innerText = txtOriginal; btnSave.disabled = false;
        }
    }

    // --- FORMULARIO STOCK ---
    const formStock = document.getElementById('form-stock');
    if(formStock) {
        formStock.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const id = document.getElementById('stk-id').value;
            const tipoAjuste = document.getElementById('stk-tipo').value;
            const cantidad = document.getElementById('stk-cantidad').value;
            const costo = document.getElementById('stk-costo').value;
            const motivo = document.getElementById('stk-motivo').value;

            if(cantidad <= 0) return alert("Cantidad inválida");

            const btn = document.getElementById('btn-stock-submit');
            const txt = btn.innerText;
            btn.disabled = true; btn.innerText = "Procesando...";

            try {
                // 🚨 CAMBIO: La ruta sigue siendo la misma, pero el backend ahora usa 'ajustarStock'
                const res = await fetch(`/api/inventario/${id}/stock`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
                    body: JSON.stringify({ cantidad, costo, motivo, tipoAjuste }) // Enviamos tipoAjuste
                });

                const data = await res.json();
                if(res.ok) {
                    // Mensaje diferente según éxito
                    const msg = tipoAjuste === 'salida' ? "Baja registrada (Merma)." : "Ingreso registrado.";
                    // Usar toast o alert
                    alert("✅ " + msg);
                    cerrarModalStock();
                    initInventario(); 
                } else {
                    alert("❌ " + data.msg);
                }
            } catch(error) { console.error(error); alert("Error de conexión"); }
            finally { btn.disabled = false; btn.innerText = txt; }
        });
    }

    // --- UTILIDADES ---
    function getPrefijoSede() {
        if(!nombreSedeActual) return "";
        if(nombreSedeActual.includes("Molina")) return "M-";
        if(nombreSedeActual.includes("Primavera")) return "P-";
        if(nombreSedeActual.includes("ReX")) return "R-";
        if(nombreSedeActual.includes("Lurigancho")) return "SJL-";
        return "GEN-";
    }

    window.toggleTipoProducto = function() { 
        const tipo = document.getElementById('prod-tipo').value;
        const seccionStock = document.getElementById('seccion-stock');
        const groupUnidad = document.getElementById('group-unidad');
        if(seccionStock) seccionStock.style.display = (tipo === 'fisico') ? 'block' : 'none';
        if(groupUnidad) groupUnidad.style.visibility = (tipo === 'combo') ? 'hidden' : 'visible';
    }

    function getDefaultIcon(cat) {
        if(cat === 'Cafeteria') return 'bx bxs-coffee';
        if(cat === 'Taquilla') return 'bx bxs-coupon';
        if(cat === 'Merch') return 'bx bxs-t-shirt';
        return 'bx bxs-package';
    }

    function getIconClass(cat) {
        if(cat === 'Cafeteria') return 'bg-coffee';
        if(cat === 'Taquilla') return 'bg-ticket';
        if(cat === 'Merch') return 'bg-merch';
        return 'bg-default';
    }

    // EDITAR Y ELIMINAR
    function editarProducto(id) {
        const prod = productosData.find(p => p.id === id);
        if(!prod) return;
        document.getElementById('modal-producto').classList.add('active');
        document.querySelector('#modal-title').innerText = "Editar Producto";
        document.getElementById('prod-id').value = prod.id;
        document.getElementById('prod-nombre').value = prod.nombre;
        document.getElementById('prod-codigo').value = prod.codigo;
        document.getElementById('prod-categoria').value = prod.categoria;
        document.getElementById('prod-tipo').value = prod.tipo;
        document.getElementById('prod-unidad').value = prod.unidad;
        document.getElementById('prod-precio').value = prod.precio;
        document.getElementById('prod-costo').value = prod.costo || 0;
        document.getElementById('prod-stock').value = prod.stock;
        document.getElementById('prod-minimo').value = prod.minimo;
        toggleTipoProducto();
    }

// --- ELIMINAR PRODUCTO (VERSIÓN MODERNA) ---
    async function eliminarProducto(id) {
        // 1. Usamos nuestro modal personalizado (esperamos la respuesta)
        const confirmado = await showConfirm(
            "Si eliminas este producto, se perderá su historial en el Kardex de esta sede.", 
            "¿Eliminar Producto?"
        );

        if (!confirmado) return; // Si dijo Cancelar, no hacemos nada

        try {
            const response = await fetch(`/api/inventario/${id}`, { 
                method: 'DELETE',
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            
            if(response.ok) { 
                // 2. Notificación Elegante
                showToast("Producto eliminado correctamente", "success");
                await initInventario(); // Recargar tabla
            } else {
                const data = await response.json();
                showToast(data.msg || "Error al eliminar", "error");
            }
        } catch (error) { 
            console.error(error);
            showToast("Error de conexión con el servidor", "error");
        }
    }

    // Filtros y Búsqueda
    window.filtrarTab = function(tipo, btn) {
        filtroActual = tipo;
        pagInvActual = 1;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderizarTabla();
    }

    window.filtrarPorCategoria = function() {
        pagInvActual = 1;
        const cat = document.getElementById('filtro-categoria').value;
        if(!cat) { renderizarTabla(productosData); return; }
        const filtrados = productosData.filter(p => p.categoria === cat);
        renderizarTabla(filtrados);
    }

    const buscador = document.getElementById('buscador-productos');
    if(buscador) {
        buscador.onkeyup = (e) => {
            pagInvActual = 1;
            const term = e.target.value.toLowerCase();
            const filtrados = productosData.filter(p => 
                p.nombre.toLowerCase().includes(term) || p.codigo.toLowerCase().includes(term)
            );
            renderizarTabla(filtrados);
        };
    }

    // INICIO
    initInventario();

})();