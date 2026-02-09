// Ubicacion: SuperNova/frontend/modules/inventario/inventario.js

(function() {
    console.log("Modulo Inventario FINAL Activo 🏢");

    // --- 🚨 INICIO CORRECCIÓN 1: CAZAFANTASMAS ---
    // Esto detecta si el inventario se cargó dos veces y borra los modales viejos
    const modalesViejos = document.querySelectorAll('#modal-producto');
    if (modalesViejos.length > 1) {
        console.warn(`⚠️ Se detectaron ${modalesViejos.length} modales duplicados. Limpiando...`);
        // Borramos todos menos el último (que es el nuevo y correcto)
        for (let i = 0; i < modalesViejos.length - 1; i++) {
            modalesViejos[i].remove();
        }
        // Limpiamos también los otros modales por seguridad
        document.querySelectorAll('#modal-stock').forEach((m, i, arr) => { if(i < arr.length-1) m.remove(); });
        document.querySelectorAll('#modal-kardex').forEach((m, i, arr) => { if(i < arr.length-1) m.remove(); });
    }

    let productosData = [];
    let comboDetallesTemp = []; // Aquí guardaremos la "receta" temporalmente
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
                verificarAlertasMasivas();
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

            // 🔥 CORRECCIÓN: Ahora mostramos stock real y botón (+) también para COMBOS
            // Antes: if (prod.tipo === 'fisico')
            if (prod.tipo === 'fisico' || prod.tipo === 'combo') {
                mostrarBotonStock = 'inline-flex';
                
                // Formato visual del stock
                if (prod.stock <= 0) {
                    // AGOTADO (Rojo + Icono Palpitante)
                    stockHtml = `
                        <div style="display:flex; align-items:center;">
                            <i class='bx bxs-error-circle icono-alerta-pulsante'></i> 
                            <div>
                                <span style="color:#dc2626; font-weight:bold;">0 AGOTADO</span>
                                <span class="texto-alerta-bajo">¡Reponer ya!</span>
                            </div>
                        </div>
                    `;
                }
                else if (prod.stock <= prod.minimo) {
                    // BAJO (Naranja/Rojo + Icono Palpitante)
                    stockHtml = `
                        <div style="display:flex; align-items:center;">
                            <i class='bx bxs-bell-ring icono-alerta-pulsante' style="color:#f59e0b;"></i>
                            <div>
                                <span style="color:#d97706; font-weight:bold;">${prod.stock} UND</span>
                                <span class="texto-alerta-bajo" style="color:#d97706;">¡Quedan solo ${prod.stock}!</span>
                            </div>
                        </div>
                    `;
                }
                else {
                    // NORMAL (Verde)
                    stockHtml = `<span style="color:#16a34a; font-weight:bold;">🟢 ${prod.stock} UND</span>`;
                }
            
            } else {
                stockHtml = `<span style="color:#94a3b8;">∞ Servicio</span>`;
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
                        <button class="btn-action add-stock" data-id="${prod.id}" style="display:${mostrarBotonStock}; background:#dcfce7; color:#16a34a;" title="Sumar/Restar Stock"><i class='bx bx-plus-medical'></i></button>
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

    // --- 🔥 NUEVAS FUNCIONES PARA NOTIFICACIONES FLOTANTES ---
    function verificarAlertasMasivas() {
        const contenedor = document.getElementById('stock-toast-container');
        if(!contenedor) return;
        contenedor.innerHTML = ''; // Limpiar anteriores

        // Filtramos productos físicos con stock bajo
        const criticos = productosData.filter(p => 
            p.tipo === 'fisico' && p.stock <= p.minimo
        );

        // Limitamos a 4 alertas para no saturar
        const mostrar = criticos.slice(0, 4);

        mostrar.forEach((prod, index) => {
            // Delay para efecto cascada
            setTimeout(() => {
                crearToastStock(prod);
            }, index * 300);
        });
    }

    function crearToastStock(prod) {
        const contenedor = document.getElementById('stock-toast-container');
        const div = document.createElement('div');
        div.className = 'stock-toast';
        
        let mensaje = `Quedan solo <strong>${prod.stock}</strong> unidades.`;
        if(prod.stock <= 0) mensaje = `<strong>¡Producto Agotado!</strong> (0 Stock)`;

        div.innerHTML = `
            <i class='bx bxs-alarm-exclamation bx-tada'></i>
            <div class="stock-toast-content">
                <h4>${prod.nombre}</h4>
                <p>${mensaje}</p>
            </div>
        `;

        contenedor.appendChild(div);

        // Desaparecer automáticamente a los 6 segundos
        setTimeout(() => {
            div.style.opacity = '0';
            div.style.transform = 'translateX(50px)';
            setTimeout(() => div.remove(), 500);
        }, 6000);
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

// Función que renderiza SOLO la página actual (CORREGIDO: VENTAS SOLO EN SALIDAS)
    function renderKardexPaginado() {
        const tbody = document.getElementById('tabla-kardex-body');
        tbody.innerHTML = '';

        if(movimientosFiltrados.length === 0) {
            // Ajustamos el colspan a 11 para cubrir todas las columnas
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px;">Sin movimientos.</td></tr>';
            document.getElementById('kardex-page-info').innerText = "0 de 0";
            document.getElementById('kardex-pagination-controls').innerHTML = "";
            return;
        }

        const inicio = (paginaActual - 1) * filasPorPagina;
        const fin = inicio + filasPorPagina;
        const datosPagina = movimientosFiltrados.slice(inicio, fin);
        const totalPaginas = Math.ceil(movimientosFiltrados.length / filasPorPagina);

        datosPagina.forEach(m => {
            const tr = document.createElement('tr');
            const fecha = new Date(m.fecha).toLocaleString();
            
            const esPositivo = m.cantidad > 0;
            let color = esPositivo ? "#16a34a" : "#dc2626";
            let signo = esPositivo ? "+" : "";
            let icono = esPositivo ? "bx-up-arrow-alt" : "bx-down-arrow-alt";
            let tipoTexto = esPositivo ? "Entrada" : "Salida";
            
            if (m.tipo_movimiento && m.tipo_movimiento.includes('ajuste')) tipoTexto = "Ajuste";

            // --- CÁLCULOS FINANCIEROS ---
            const costo = parseFloat(m.costo_unitario) || 0;
            const precioVenta = parseFloat(m.precio_venta) || 0;
            
            // 1. Total Costo (Valor de inventario): SIEMPRE VISIBLE
            const totalCosto = Math.abs(m.cantidad) * costo;

            // 2. Total Venta (Ganancia esperada/real):
            const totalVentaCalculado = Math.abs(m.cantidad) * precioVenta;

            // --- LÓGICA VISUAL ---
            
            // A. Precio Venta Unitario:
            // Si es SALIDA (Venta), mostramos precio. Si es ENTRADA, guion.
            const textoPrecioVenta = !esPositivo ? `S/ ${precioVenta.toFixed(2)}` : '-';

            // B. Total Venta:
            // Si es SALIDA (Venta), mostramos el total en negrita azul oscuro.
            // Si es ENTRADA, mostramos guion.
            const textoTotalVenta = !esPositivo 
                ? `<span style="color:#0f172a; font-weight:bold;">S/ ${totalVentaCalculado.toFixed(2)}</span>` 
                : '-';

            tr.innerHTML = `
                <td style="font-size:11px; color:#666;">${fecha}</td>
                <td>
                    <span style="background:#e0e7ff; color:#3730a3; padding:2px 6px; border-radius:4px; font-weight:700; font-size:10px;">
                        ${m.nombre_sede || 'Sede'}
                    </span>
                </td>
                <td style="font-weight:600; font-size:12px;">${m.producto}</td>
                <td>
                    <span style="color:${color}; font-weight:bold; font-size:11px;">
                        <i class='bx ${icono}'></i> ${tipoTexto}
                    </span>
                    <br><small style="color:#888; font-size:10px;">${m.motivo || '-'}</small>
                </td>
                
                <td style="text-align:center; font-weight:bold; color:${color}">${signo}${m.cantidad}</td>
                
                <td style="text-align:right; font-size:11px; color:#64748b;">S/ ${costo.toFixed(2)}</td>
                <td style="text-align:right; font-size:11px; font-weight:bold; color:#000;">S/ ${totalCosto.toFixed(2)}</td>

                <td style="text-align:right; font-size:11px; color:#0f172a;">${textoPrecioVenta}</td>
                <td style="text-align:right; font-size:11px;">${textoTotalVenta}</td>

                <td style="text-align:center; font-weight:bold">${m.stock_resultante}</td>
                <td style="font-size:10px;">${m.usuario || 'Sistema'}</td>
            `;
            tbody.appendChild(tr);
        });

        // ACTUALIZAR CONTROLES
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

// --- 4. FILTRAR KARDEX (CORREGIDO: FECHA + PRODUCTO) ---
    window.filtrarTablaKardex = function() {
        console.group("🔍 Depuración Filtro Kardex");
        
        // 1. Obtener valores de los filtros
        const selectProducto = document.getElementById('filtro-producto-kardex');
        const productoSeleccionado = selectProducto ? selectProducto.value : '';
        
        // Buscamos el input de fecha (como no tiene ID en tu HTML, lo buscamos por clase dentro del modal)
        const inputFecha = document.querySelector('#modal-kardex .date-filter');
        const fechaSeleccionada = inputFecha ? inputFecha.value : '';

        console.log("🎯 Producto buscado:", productoSeleccionado || "(Todos)");
        console.log("📅 Fecha buscada:", fechaSeleccionada || "(Todas)");
        console.log("📦 Total movimientos antes de filtrar:", movimientosKardex.length);

        // 2. Aplicar Filtros (Lógica combinada)
        movimientosFiltrados = movimientosKardex.filter(m => {
            let cumpleProducto = true;
            let cumpleFecha = true;

            // A. Validar Producto (si se seleccionó uno)
            if (productoSeleccionado && productoSeleccionado !== "") {
                // Usamos trim() para evitar errores por espacios vacíos
                cumpleProducto = m.producto.trim() === productoSeleccionado.trim();
            }

            // B. Validar Fecha (si se seleccionó una)
            if (fechaSeleccionada) {
                // La fecha viene del servidor usualmente como "2024-01-29T14:00:00..."
                // Cortamos los primeros 10 caracteres para tener solo "2024-01-29"
                let fechaMovimiento = "";
                if(m.fecha) {
                    fechaMovimiento = new Date(m.fecha).toISOString().split('T')[0];
                }
                
                cumpleFecha = fechaMovimiento === fechaSeleccionada;
            }

            // El registro debe cumplir AMBAS condiciones
            return cumpleProducto && cumpleFecha;
        });
        
        console.log("✅ Resultados encontrados:", movimientosFiltrados.length);
        console.groupEnd();

        // 3. Resetear a la página 1 y dibujar
        paginaActual = 1; 
        renderKardexPaginado();
    }

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

    // --- 6. EXPORTAR INVENTARIO (TABLA PRINCIPAL) ---
    window.exportarInventario = function() {
        // 1. Validaciones
        if (!productosData || productosData.length === 0) {
            return showToast("⚠️ No hay productos para exportar.", "warning");
        }

        if (typeof XLSX === 'undefined') {
            return showToast("⚠️ Error: La librería de Excel no se cargó correctamente.", "error");
        }

        // 2. Preparar los datos limpios para el Excel
        const datosParaExcel = productosData.map(p => {
            const costo = parseFloat(p.costo) || 0;
            const precio = parseFloat(p.precio) || 0;
            const stock = parseInt(p.stock) || 0;

            return {
                "Código SKU": p.codigo,
                "Producto": p.nombre,
                "Categoría": p.categoria,
                "Tipo": p.tipo === 'fisico' ? 'Físico' : (p.tipo === 'combo' ? 'Combo' : 'Servicio'),
                "Stock Actual": stock,
                "Unidad": p.unidad,
                "Costo Unit. (S/)": costo.toFixed(2),
                "Precio Venta (S/)": precio.toFixed(2),
                "Valorizado (Costo Total)": (stock * costo).toFixed(2), // Cuánto dinero tienes invertido
                "Valorizado (Venta Total)": (stock * precio).toFixed(2) // Cuánto ganarías si vendes todo
            };
        });

        // 3. Crear el libro de Excel
        const worksheet = XLSX.utils.json_to_sheet(datosParaExcel);
        const workbook = XLSX.utils.book_new();
        
        // 4. Ajustar ancho de columnas para que se vea profesional
        const wscols = [
            {wch: 15}, // Código
            {wch: 35}, // Nombre
            {wch: 15}, // Categoría
            {wch: 10}, // Tipo
            {wch: 10}, // Stock
            {wch: 8},  // Unidad
            {wch: 12}, // Costo
            {wch: 12}, // Precio
            {wch: 15}, // Val. Costo
            {wch: 15}  // Val. Venta
        ];
        worksheet['!cols'] = wscols;

        // 5. Descargar archivo
        XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario General");
        const fecha = new Date().toISOString().split('T')[0]; // Formato YYYY-MM-DD
        XLSX.writeFile(workbook, `Inventario_General_${fecha}.xlsx`);
        
        showToast("✅ Excel generado correctamente", "success");
    }


    // --- MODALES (ACTUALIZADO: BLOQUEA COSTO EN COMBOS) ---
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
        
        const inputCosto = document.getElementById('stk-costo');
        
        // 🔥 CORRECCIÓN AQUÍ: Usamos .toFixed(2) para que solo muestre 2 decimales
        const costoVisual = prod.costo ? parseFloat(prod.costo).toFixed(2) : "";
        inputCosto.value = costoVisual;
        
        // LÓGICA DE BLOQUEO (Mantener lo que hicimos antes)
        if (prod.tipo === 'combo') {
            inputCosto.readOnly = true;
            inputCosto.style.backgroundColor = "#f1f5f9";
            inputCosto.style.color = "#64748b";
            inputCosto.title = "Automático (Suma de ingredientes)";
            inputCosto.placeholder = "Automático";
        } else {
            inputCosto.readOnly = false;
            inputCosto.style.backgroundColor = "";
            inputCosto.style.color = "";
            inputCosto.title = "Ingrese nuevo costo si varió";
            inputCosto.placeholder = " ";
        }
        
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
        
        // --- LIMPIEZA DE COMBOS ---
        comboDetallesTemp = []; // Reiniciar receta
        renderizarTablaCombo(); // Limpiar tabla visual
        
        const inputCodigo = document.getElementById('prod-codigo');
        if (inputCodigo) inputCodigo.value = getPrefijoSede();
        toggleTipoProducto();
    }

    window.cerrarModalProducto = function() { document.getElementById('modal-producto').classList.remove('active'); }

// --- GUARDAR PRODUCTO (VALIDACIÓN VISUAL + TIEMPO REAL) ---
window.guardarProducto = async function() {
    console.log("🚀 Iniciando Guardado de Producto...");

    const modalActivo = document.querySelector('#modal-producto.active');
    if (!modalActivo) return showToast("Error: No se detectó el modal activo.", "error");

    // 1. Obtener referencias a los inputs
    const inputs = {
        id: modalActivo.querySelector('#prod-id'),
        nombre: modalActivo.querySelector('#prod-nombre'),
        codigo: modalActivo.querySelector('#prod-codigo'),
        categoria: modalActivo.querySelector('#prod-categoria'),
        tipo: modalActivo.querySelector('#prod-tipo'),
        unidad: modalActivo.querySelector('#prod-unidad'),
        precio: modalActivo.querySelector('#prod-precio'),
        costo: modalActivo.querySelector('#prod-costo'),
        stock: modalActivo.querySelector('#prod-stock'),
        minimo: modalActivo.querySelector('#prod-minimo')
    };

    // 2. Limpieza inicial (Quitar bordes rojos previos)
    Object.values(inputs).forEach(el => {
        if(el) el.style.border = "1px solid #ccc";
    });

    // 3. --- VALIDACIÓN DE CAMPOS OBLIGATORIOS ---
    let errores = [];

    const marcarError = (input, nombreCampo) => {
        input.style.border = "2px solid #EF4444"; // Borde Rojo
        errores.push(nombreCampo);

        // 🔥 UX MEJORADA: Quitar el rojo apenas el usuario empiece a escribir
        input.addEventListener('input', function() {
            this.style.border = "1px solid #ccc";
        }, { once: true }); // 'once: true' borra el evento después de usarse para ahorrar memoria
    };

    // Validamos uno por uno
    if (!inputs.nombre.value.trim()) marcarError(inputs.nombre, "Nombre");
    if (!inputs.codigo.value.trim()) marcarError(inputs.codigo, "Código SKU");
    if (!inputs.categoria.value) marcarError(inputs.categoria, "Categoría");
    if (!inputs.precio.value.trim()) marcarError(inputs.precio, "Precio Venta");

    // Si hay errores, mostramos Toast y detenemos
    if (errores.length > 0) {
        return showToast("Completa los campos marcados en rojo.", "error");
    }

    // 4. Preparar valores
    const stockIngresado = parseInt(inputs.stock.value) || 0;
    const tipoVal = inputs.tipo.value;

    console.log(`📊 Datos: Tipo=${tipoVal}, Stock=${stockIngresado}, Receta=${comboDetallesTemp.length}`);

    // --- 5. VALIDACIÓN DE COMBOS (Stock vs Receta) ---
    if (tipoVal === 'combo' && stockIngresado > 0) {
        
        if (comboDetallesTemp.length === 0) return showToast("⚠️ La receta del combo está vacía.", "warning");

        for (const itemReceta of comboDetallesTemp) {
            const idIngrediente = parseInt(itemReceta.id_producto);
            const productoReal = productosData.find(p => p.id === idIngrediente);

            if (productoReal) {
                const totalNecesario = stockIngresado * itemReceta.cantidad;
                const stockDisponible = parseInt(productoReal.stock);

                if (stockDisponible < totalNecesario) {
                    console.error("❌ BLOQUEO POR STOCK INSUFICIENTE");
                    return showToast(
                        `Falta stock de: ${itemReceta.nombre} (Tienes: ${stockDisponible}, Necesitas: ${totalNecesario})`, 
                        "error"
                    );
                }
            } else {
                return showToast(`Error crítico: El ingrediente "${itemReceta.nombre}" no está disponible.`, "error");
            }
        }
    } else {
        console.log("ℹ️ Saltando validación estricta (No es combo o Stock es 0)");
    }

    // --- 6. Preparar Objeto para Backend ---
    let lineaNegocioCalculada = 'CAFETERIA'; 
    const catUpper = inputs.categoria.value.toUpperCase();
    if (catUpper.includes('ENTRADA') || catUpper.includes('TICKET')) lineaNegocioCalculada = 'TAQUILLA';
    else if (catUpper.includes('MERCH') || catUpper.includes('ROPA')) lineaNegocioCalculada = 'MERCH';
    else if (catUpper.includes('ARCADE') || catUpper.includes('JUEGO')) lineaNegocioCalculada = 'JUEGOS';
    else if (catUpper.includes('EVENTO')) lineaNegocioCalculada = 'EVENTOS';

    const detallesEnviar = (tipoVal === 'combo') ? comboDetallesTemp : [];

    const formObj = {
        nombre: inputs.nombre.value.trim(),
        codigo: inputs.codigo.value.trim(),
        categoria: inputs.categoria.value,
        tipo: inputs.tipo.value,
        unidad: inputs.unidad.value,
        precio: parseFloat(inputs.precio.value),
        costo: parseFloat(inputs.costo.value) || 0,
        stock: stockIngresado,
        stock_minimo: parseInt(inputs.minimo.value) || 0,
        imagen: getDefaultIcon(inputs.categoria.value),
        comboDetalles: detallesEnviar,
        lineaNegocio: lineaNegocioCalculada 
    };

    // --- 7. Enviar al Backend ---
    const btnSave = modalActivo.querySelector('.btn-primary');
    const txtOriginal = btnSave.innerText;
    btnSave.innerText = "Guardando..."; 
    btnSave.disabled = true;

    try {
        let url = '/api/inventario';
        let method = 'POST';
        // Si hay ID, es edición (PUT)
        if(inputs.id.value) { url = `/api/inventario/${inputs.id.value}`; method = 'PUT'; }

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
            body: JSON.stringify(formObj)
        });
        
        const data = await res.json();

        if(res.ok) {
            showToast("✅ " + data.msg, "success");
            cerrarModalProducto();
            await initInventario(); // Recargar tabla
        } else {
            // Error del Backend (Ej: Código duplicado)
            showToast("❌ " + data.msg, "error");
            
            // Si el error menciona "Código", resaltamos ese input específico
            if(data.msg && (data.msg.includes('Código') || data.msg.includes('SKU'))) {
                marcarError(inputs.codigo, "Código");
                inputs.codigo.focus();
            }
        }
    } catch (error) { 
        console.error(error); 
        showToast("Error de conexión con el servidor", "error"); 
    } finally { 
        btnSave.innerText = txtOriginal; 
        btnSave.disabled = false; 
    }
}

// --- FORMULARIO STOCK (ACTUALIZADO: CON TOASTS) ---
const formStock = document.getElementById('form-stock');
if(formStock) {
    formStock.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = parseInt(document.getElementById('stk-id').value);
        const tipoAjuste = document.getElementById('stk-tipo').value;
        const cantidad = document.getElementById('stk-cantidad').value;
        const costo = document.getElementById('stk-costo').value;
        const motivo = document.getElementById('stk-motivo').value;

        if(cantidad <= 0) return showToast("Cantidad inválida", "error");

        const btn = document.getElementById('btn-stock-submit');
        const txt = btn.innerText;
        btn.disabled = true; btn.innerText = "Procesando...";

        try {
            const res = await fetch(`/api/inventario/${id}/stock`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
                body: JSON.stringify({ cantidad, costo, motivo, tipoAjuste })
            });

            const data = await res.json();
            
            if(res.ok) {
                const msg = tipoAjuste === 'salida' ? "Baja registrada (Merma)." : "Ingreso registrado.";
                showToast("✅ " + msg, "success");
                
                // 1. Actualizar EL PRODUCTO PRINCIPAL
                const prodIndex = productosData.findIndex(p => p.id === id);
                if (prodIndex !== -1) {
                    if (data.nuevo_stock !== undefined) productosData[prodIndex].stock = parseInt(data.nuevo_stock);
                    
                    // 🔥 CORRECCIÓN: Redondear costo
                    if (data.nuevo_costo !== undefined) {
                        productosData[prodIndex].costo = parseFloat(parseFloat(data.nuevo_costo).toFixed(2));
                    }
                }

                // 2. 🔥 ACTUALIZAR COMBOS AFECTADOS (CASCADA)
                if (data.combos_afectados && data.combos_afectados.length > 0) {
                    data.combos_afectados.forEach(combo => {
                        const comboIndex = productosData.findIndex(p => p.id === combo.id);
                        if (comboIndex !== -1) {
                            productosData[comboIndex].costo = combo.nuevo_costo;
                            console.log(`🔄 Combo actualizado localmente: ID ${combo.id} -> Nuevo Costo: ${combo.nuevo_costo}`);
                        }
                    });
                }

                cerrarModalStock();
                renderizarTabla(); 

            } else {
                showToast("❌ " + data.msg, "error");
            }
        } catch(error) { 
            console.error(error); 
            showToast("Error de conexión", "error"); 
        } finally { 
            btn.disabled = false; 
            btn.innerText = txt; 
        }
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
    const seccionCombo = document.getElementById('seccion-combo');
    const inputCosto = document.getElementById('prod-costo');
    const inputStock = document.getElementById('prod-stock');

    // 1. VISIBILIDAD STOCK: Ahora visible para Físico Y Combo
    if(seccionStock) {
        seccionStock.style.display = (tipo === 'fisico' || tipo === 'combo') ? 'block' : 'none';
    }
    
    // 2. Unidad de medida (oculta en combos)
    if(groupUnidad) groupUnidad.style.visibility = (tipo === 'combo') ? 'hidden' : 'visible';
    
    // 3. Sección Receta Combo
    if(seccionCombo) seccionCombo.style.display = (tipo === 'combo') ? 'block' : 'none';

    // 4. Lógica de Costo (Bloqueado en Combo)
    if(inputCosto) {
        if(tipo === 'combo') {
            inputCosto.readOnly = true;
            inputCosto.style.backgroundColor = "#f1f5f9";
            // Si hay receta, recalcula. Si no, 0.
            if (typeof recalcularCostoCombo === 'function' && comboDetallesTemp.length > 0) {
                recalcularCostoCombo();
            } else {
                inputCosto.value = 0;
            }
        } else {
            inputCosto.readOnly = false;
            inputCosto.style.backgroundColor = "";
        }
    }

    // 5. UX: Cambiar placeholder del stock
    if (inputStock) {
        if (tipo === 'combo') {
            inputStock.placeholder = "Cant. a armar (ej: 10)";
            inputStock.title = "¿Cuántos combos vas a dejar listos?";
        } else {
            inputStock.placeholder = "Stock Inicial";
            inputStock.title = "Cantidad actual en almacén";
        }
    }
}

    // 1. Filtrar mientras escribes
    window.filtrarBusquedaCombo = function() {
        const input = document.getElementById('combo-search');
        if (!input) return;
        const lista = document.getElementById('combo-results');
        const texto = input.value.toLowerCase();

        // Limpiamos selección anterior
        document.getElementById('combo-selected-id').value = "";

        if (texto.length < 1) {
            lista.classList.remove('active');
            return;
        }

        // Filtramos solo físicos
        const coincidencias = productosData.filter(p => 
            p.tipo === 'fisico' && 
            (p.nombre.toLowerCase().includes(texto) || p.codigo.toLowerCase().includes(texto))
        );

        lista.innerHTML = '';
        
        if (coincidencias.length === 0) {
            lista.innerHTML = '<div class="combo-option" style="color:#999; cursor:default;">No encontrado</div>';
        } else {
            coincidencias.forEach(p => {
                const div = document.createElement('div');
                div.className = 'combo-option';
                div.innerHTML = `
                    <span>${p.nombre}</span> 
                    <span class="stock-badge">Stock: ${p.stock}</span>
                `;
                // Al hacer click, seleccionamos
                div.onclick = () => seleccionarProductoCombo(p.id, p.nombre);
                lista.appendChild(div);
            });
        }
        
        lista.classList.add('active');
    }

    // 2. Seleccionar un item de la lista
    window.seleccionarProductoCombo = function(id, nombre) {
        document.getElementById('combo-search').value = nombre; // Mostrar nombre
        document.getElementById('combo-selected-id').value = id; // Guardar ID oculto
        document.getElementById('combo-results').classList.remove('active'); // Ocultar lista
        document.getElementById('combo-qty').focus(); // Saltar a cantidad
    }

    // 3. Modificamos agregarItemAlCombo para usar el ID oculto
    window.agregarItemAlCombo = function() {
        const idSeleccionado = document.getElementById('combo-selected-id').value;
        const nombreInput = document.getElementById('combo-search').value;
        const cantidad = parseInt(document.getElementById('combo-qty').value);

        // Validación
        if (!nombreInput || cantidad <= 0) return showToast("Selecciona un producto y cantidad válida.", "warning");

        // 1. Si tenemos ID oculto (seleccionado de la lista)
        if (idSeleccionado) {
            return procesarAgregado(parseInt(idSeleccionado), nombreInput, cantidad);
        }

        // 2. Si NO tenemos ID (escribió el nombre a mano), buscamos en la data
        const prod = productosData.find(p => p.nombre.toLowerCase() === nombreInput.toLowerCase() && p.tipo === 'fisico');
        
        if(!prod) return showToast("Producto no encontrado en el inventario o no es físico.", "error");
        
        procesarAgregado(prod.id, prod.nombre, cantidad);
    }

    function procesarAgregado(id, nombre, cantidad) {
        if (cantidad <= 0) return showToast("Cantidad inválida.", "warning");

        // 1. Buscar el COSTO del producto original
        const productoOriginal = productosData.find(p => p.id === id);
        const costoUnitario = productoOriginal ? (productoOriginal.costo || 0) : 0;

        // 2. Verificar si ya existe en la receta
        const existe = comboDetallesTemp.find(d => d.id_producto === id);
        
        if (existe) {
            existe.cantidad += cantidad;
        } else {
            comboDetallesTemp.push({ 
                id_producto: id, 
                nombre: nombre, 
                cantidad: cantidad,
                costo: costoUnitario 
            });
        }

        // 3. Resetear UI
        document.getElementById('combo-search').value = '';
        document.getElementById('combo-selected-id').value = '';
        document.getElementById('combo-qty').value = 1;
        
        renderizarTablaCombo();
        recalcularCostoCombo(); 
    }

    // Cierra el menú si haces click fuera
    document.addEventListener('click', function(e) {
        const wrapper = document.querySelector('.custom-dropdown-wrapper');
        const lista = document.getElementById('combo-results');
        if (lista && !wrapper.contains(e.target)) {
            lista.classList.remove('active');
        }
    });

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

// --- EDICIÓN MULTIOBJETIVO (Con Carga de Receta) ---
window.editarProducto = async function(id) {
    console.log("📝 Editando ID:", id);
    
    // 1. Buscar producto en memoria
    const prod = productosData.find(p => p.id === id);
    if(!prod) return;

    // 2. DETECTAR TODOS LOS MODALES (Fantasmas y Reales)
    const modales = document.querySelectorAll('#modal-producto');
    console.log(`⚠️ Se encontraron ${modales.length} modales en pantalla.`);

    // 3. ACTUALIZARLOS TODOS
    modales.forEach((modal) => {
        modal.classList.add('active');
        
        // Buscamos los inputs
        const titulo = modal.querySelector('#modal-title');
        const iId = modal.querySelector('#prod-id');
        const iNombre = modal.querySelector('#prod-nombre');
        const iCodigo = modal.querySelector('#prod-codigo');
        const iUnidad = modal.querySelector('#prod-unidad');
        const iPrecio = modal.querySelector('#prod-precio');
        const iCosto = modal.querySelector('#prod-costo');
        const iStock = modal.querySelector('#prod-stock');
        const iMinimo = modal.querySelector('#prod-minimo');
        const sCategoria = modal.querySelector('#prod-categoria');
        const sTipo = modal.querySelector('#prod-tipo');

        // Llenamos datos básicos
        if(titulo) titulo.innerText = "Editar Producto";
        if(iId) iId.value = prod.id;
        if(iNombre) iNombre.value = prod.nombre;
        if(iCodigo) iCodigo.value = prod.codigo;
        if(iUnidad) iUnidad.value = prod.unidad;
        if(iPrecio) iPrecio.value = prod.precio;
        if(iCosto) iCosto.value = prod.costo || 0;
        if(iStock) iStock.value = prod.stock;
        if(iMinimo) iMinimo.value = prod.minimo;

        // Categoría
        if(sCategoria) {
            sCategoria.value = prod.categoria;
            if(sCategoria.selectedIndex === -1) {
                Array.from(sCategoria.options).forEach(opt => {
                    if(opt.value.toLowerCase() === (prod.categoria||'').toLowerCase()) {
                        sCategoria.value = opt.value;
                    }
                });
            }
        }

        // Tipo de ítem
        if(sTipo) {
            let tipoBD = (prod.tipo || 'fisico').toLowerCase().trim();
            if (tipoBD === 'físico') tipoBD = 'fisico';
            sTipo.value = tipoBD;
            if (sTipo.selectedIndex === -1) sTipo.value = 'fisico';
        }
    });

    // 4. FORZAR VISIBILIDAD DE STOCK (Toggle Visual)
    if(window.toggleTipoProducto) window.toggleTipoProducto();

    // 5. 🔥 CARGAR RECETA SI ES COMBO 🔥
    // Esta es la parte nueva que te faltaba
    if (prod.tipo === 'combo') {
        try {
            // Mostrar "Cargando..." en la tabla del combo
            document.querySelectorAll('#tabla-combo-items').forEach(tbody => {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center">Cargando ingredientes...</td></tr>';
            });

            // Pedir receta al backend
            const res = await fetch(`/api/inventario/${id}/receta`, {
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            
            if (res.ok) {
                const receta = await res.json();
                // Llenar variable global
                comboDetallesTemp = receta.map(r => ({
                    id_producto: r.id_producto,
                    nombre: r.nombre,
                    cantidad: r.cantidad,
                    costo: parseFloat(r.costo) || 0
                }));
                
                // Actualizar UI
                renderizarTablaCombo();
                recalcularCostoCombo();
            } else {
                console.error("Error al cargar receta:", await res.text());
                comboDetallesTemp = [];
                renderizarTablaCombo();
            }
        } catch (e) {
            console.error("Error de red cargando receta", e);
        }
    } else {
        // Si no es combo, limpiamos la memoria de combos
        comboDetallesTemp = [];
        renderizarTablaCombo();
    }
}
    // Asegúrate de que esta función sea global (window.)
    window.editarProducto = editarProducto;

        // --- ELIMINAR PRODUCTO (MODERNO) ---
    async function eliminarProducto(id) {
        // 1. Usamos nuestra confirmación personalizada (esperamos la respuesta)
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

    // --- FUNCIONES PARA COMBOS ---

    function llenarDatalistCombos() {
        const datalist = document.getElementById('lista-productos-combo');
        if(!datalist) return;
        
        datalist.innerHTML = '';
        const candidatos = productosData.filter(p => p.tipo === 'fisico');
        
        candidatos.forEach(p => {
            const option = document.createElement('option');
            option.value = p.nombre; 
            option.dataset.id = p.id; 
            datalist.appendChild(option);
        });
    }

    // B. Agregar Item a la lista temporal
    window.agregarItemAlCombo = function() {
        const idSeleccionado = document.getElementById('combo-selected-id').value;
        const nombreInput = document.getElementById('combo-search').value;
        const cantidad = parseInt(document.getElementById('combo-qty').value);

        // Validación
        if (!nombreInput || cantidad <= 0) return alert("Selecciona un producto y cantidad válida.");

        // 1. Si tenemos ID oculto (seleccionado de la lista)
        if (idSeleccionado) {
            return procesarAgregado(parseInt(idSeleccionado), nombreInput, cantidad);
        }

        // 2. Si NO tenemos ID (escribió el nombre a mano), buscamos en la data
        const prod = productosData.find(p => p.nombre.toLowerCase() === nombreInput.toLowerCase() && p.tipo === 'fisico');
        
        if(!prod) return alert("Producto no encontrado en el inventario o no es físico.");
        
        procesarAgregado(prod.id, prod.nombre, cantidad);
    } 

    // C. Renderizar la tabla visual de ingredientes
function renderizarTablaCombo() {
        const tbody = document.getElementById('tabla-combo-items');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (comboDetallesTemp.length === 0) {
            tbody.innerHTML = '<tr id="combo-empty-msg"><td colspan="3" style="text-align:center; padding: 15px; color:#94a3b8; font-size:12px;">Sin ingredientes agregados</td></tr>';
            return;
        }

        comboDetallesTemp.forEach((item, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 8px; font-size: 13px; color: #334155;">${item.nombre}</td>
                <td style="padding: 8px; text-align: center; font-weight: bold;">${item.cantidad}</td>
                <td style="padding: 8px; text-align: right;">
                    <button type="button" onclick="eliminarItemCombo(${index})" style="background:none; border:none; color:#ef4444; cursor:pointer;">
                        <i class='bx bx-trash'></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // D. Eliminar item de la lista
    window.eliminarItemCombo = function(index) {
        comboDetallesTemp.splice(index, 1);
        renderizarTablaCombo();
        recalcularCostoCombo(); // <--- Recalcular Total al borrar
    }

    function recalcularCostoCombo() {
        const tipo = document.getElementById('prod-tipo').value;
        // Solo calculamos si es tipo Combo
        if (tipo !== 'combo') return;

        let costoTotal = 0;
        
        comboDetallesTemp.forEach(item => {
            // (Costo Unitario del producto * Cantidad en la receta)
            costoTotal += (item.costo * item.cantidad);
        });

        // Actualizar el input
        const inputCosto = document.getElementById('prod-costo');
        if (inputCosto) {
            inputCosto.value = costoTotal.toFixed(2);
            // Efecto visual rápido
            inputCosto.style.backgroundColor = "#e0e7ff"; 
            setTimeout(() => inputCosto.style.backgroundColor = "#f1f5f9", 300); // Volver al gris de readOnly
        }
    }

    // --- UTILIDAD: TOAST PERSONALIZADO (Reemplazo de Alert) ---
    function showToast(mensaje, tipo = 'success') {
        // Buscar si ya existe el contenedor, si no, crearlo
        let container = document.getElementById('toast-container-custom');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container-custom';
            container.style.cssText = `
                position: fixed; top: 20px; right: 20px; z-index: 9999;
                display: flex; flex-direction: column; gap: 10px;
            `;
            document.body.appendChild(container);
        }

        // Crear el elemento del toast
        const toast = document.createElement('div');
        
        // Colores según tipo
        const colores = {
            success: { bg: '#10B981', icon: 'bx-check-circle' }, // Verde
            error:   { bg: '#EF4444', icon: 'bx-x-circle' },     // Rojo
            warning: { bg: '#F59E0B', icon: 'bx-error' }         // Naranja
        };
        const estilo = colores[tipo] || colores.success;

        toast.style.cssText = `
            background: white; border-left: 5px solid ${estilo.bg};
            color: #333; padding: 15px 20px; border-radius: 4px;
            box-shadow: 0 5px 15px rgba(0,0,0,0.15); display: flex; align-items: center; gap: 12px;
            font-family: 'Segoe UI', sans-serif; font-size: 14px; min-width: 300px;
            opacity: 0; transform: translateX(50px); transition: all 0.3s ease;
        `;

        toast.innerHTML = `
            <i class='bx ${estilo.icon}' style="font-size: 20px; color: ${estilo.bg};"></i>
            <span style="flex:1; font-weight:500;">${mensaje}</span>
        `;

        container.appendChild(toast);

        // Animación de entrada
        requestAnimationFrame(() => {
            toast.style.opacity = '1';
            toast.style.transform = 'translateX(0)';
        });

        // Auto eliminar
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(50px)';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- UTILIDAD: CONFIRMACIÓN PERSONALIZADA (Promesa) ---
    function showConfirm(mensaje, titulo = "¿Estás seguro?") {
        return new Promise((resolve) => {
            // Crear overlay
            const overlay = document.createElement('div');
            overlay.style.cssText = `
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0,0,0,0.5); z-index: 10000;
                display: flex; justify-content: center; align-items: center;
            `;

            // Crear tarjeta
            const card = document.createElement('div');
            card.style.cssText = `
                background: white; padding: 25px; border-radius: 12px;
                width: 320px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                text-align: center; font-family: 'Segoe UI', sans-serif;
                transform: scale(0.9); transition: transform 0.2s;
            `;
            // Animación simple
            setTimeout(() => card.style.transform = 'scale(1)', 10);

            card.innerHTML = `
                <div style="font-size: 40px; color: #F59E0B; margin-bottom: 10px;">
                    <i class='bx bx-error-circle'></i>
                </div>
                <h3 style="margin: 0 0 10px; color: #333;">${titulo}</h3>
                <p style="margin: 0 0 20px; color: #666; font-size: 14px;">${mensaje}</p>
                <div style="display: flex; gap: 10px; justify-content: center;">
                    <button id="btn-cancel-confirm" style="padding: 8px 16px; border: 1px solid #ccc; background: white; border-radius: 6px; cursor: pointer; color: #555;">Cancelar</button>
                    <button id="btn-ok-confirm" style="padding: 8px 16px; border: none; background: #EF4444; color: white; border-radius: 6px; cursor: pointer; font-weight: bold;">Sí, Eliminar</button>
                </div>
            `;

            overlay.appendChild(card);
            document.body.appendChild(overlay);

            // Eventos
            document.getElementById('btn-cancel-confirm').onclick = () => {
                document.body.removeChild(overlay);
                resolve(false);
            };
            document.getElementById('btn-ok-confirm').onclick = () => {
                document.body.removeChild(overlay);
                resolve(true);
            };
        });
    }

    // INICIO
    initInventario();

})();