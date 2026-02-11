// Ubicación: frontend/modules/facturas/facturas.js
(function() {
    console.log("🚀 Módulo Finanzas y Tesorería CONECTADO");

    // =======================================================
    // 1. VARIABLES GLOBALES Y CONFIGURACIÓN
    // =======================================================
    let facturasData = []; 
    let cuentasData = []; // Para la tabla de tesorería

    let paginaGastos = 1;
    let paginaCuentas = 1;
    let paginaPrestamos = 1;
    const FILAS_POR_PAGINA = 10;

    // =======================================================
    // 2. INICIALIZACIÓN Y TABS
    // =======================================================
    async function initModulo() {
        // Cargas iniciales para selects
        await Promise.all([
            obtenerProveedoresParaSelect(),
            obtenerSedesParaSelect()
        ]);

        configurarFileUpload();
        configurarBuscadores();

        // Cargar datos de la pestaña activa por defecto (Gastos)
        await cargarGastos();
        
        // Exponer funciones globales
        exposeGlobalFunctions();
    }

    window.cambiarTab = async function(tabId) {
        // 1. Ocultar todos los tabs y desactivar botones
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        // 2. Mostrar el tab seleccionado
        document.getElementById(tabId).classList.add('active');
        document.querySelector(`button[onclick="cambiarTab('${tabId}')"]`).classList.add('active');

        // 3. Cargar datos específicos según el tab
        if (tabId === 'tab-gastos') await cargarGastos(); 
        if (tabId === 'tab-cuentas') {
            await cargarCuentasPorPagar();
            await cargarKpisPagos(); 
        }
    };

    // =======================================================
    // 3. LÓGICA DE GASTOS (TAB 1) - MANTENIDA Y MEJORADA
    // =======================================================
    async function cargarGastos() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/facturas', { headers: { 'x-auth-token': token } });
            const data = await res.json();

            if (res.ok) {
                facturasData = data;
                renderizarTablaGastos();
            }
        } catch (error) {
            console.error("Error cargando gastos:", error);
            showToast("Error al cargar lista de gastos.", "error");
        }
    }

    function renderizarTablaGastos() {
        const tbody = document.getElementById('tabla-facturas-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Filtrado Local
        const busqueda = (document.getElementById('buscador-facturas')?.value || '').toLowerCase();
        const fechaFiltro = document.getElementById('filtro-fecha')?.value;

        const filtrados = facturasData.filter(f => {
            const texto = (f.proveedor + f.numero_documento + f.descripcion).toLowerCase();
            const matchTexto = texto.includes(busqueda);
            const matchFecha = !fechaFiltro || f.fecha_emision.startsWith(fechaFiltro);
            return matchTexto && matchFecha;
        });

        // Paginación
        const inicio = (paginaGastos - 1) * FILAS_POR_PAGINA;
        const datosPagina = filtrados.slice(inicio, inicio + FILAS_POR_PAGINA);

        if (datosPagina.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:20px;">No se encontraron registros.</td></tr>';
            return;
        }

        datosPagina.forEach(f => {
            const tr = document.createElement('tr');
            
            // Semáforo Estado
            let estadoHtml = '';
            if(f.estado_pago === 'pagado') estadoHtml = '<span class="badge bg-green">PAGADO</span>';
            else if(f.estado_pago === 'parcial') estadoHtml = '<span class="badge bg-yellow">PARCIAL</span>';
            else estadoHtml = '<span class="badge bg-red">PENDIENTE</span>';

            // Evidencia
            let evidenciaHtml = `<button class="btn-icon" onclick="subirArchivoFaltante(${f.id})" title="Subir"><i class='bx bx-upload'></i></button>`;
            if (f.evidencia_url) {
                const url = f.evidencia_url.replace(/\\/g, '/').replace('backend/', '/');
                evidenciaHtml = `<a href="${url}" target="_blank" class="btn-icon" style="color:#e74c3c"><i class='bx bxs-file-pdf'></i></a>`;
            }

            const docVisual = f.numero_documento || '-';

            tr.innerHTML = `
                <td>${f.fecha_emision ? f.fecha_emision.slice(0, 10) : '-'}</td>
                <td style="font-weight:600">${f.proveedor || 'S/N'}</td>
                <td>${f.tipo_documento || 'Doc'} <br> <small style="color:#666">${docVisual}</small></td>
                <td style="font-weight:bold">${f.moneda === 'USD' ? '$' : 'S/'} ${parseFloat(f.monto_total).toFixed(2)}</td>
                <td>${estadoHtml}</td>
                <td>${f.fecha_vencimiento ? f.fecha_vencimiento.slice(0, 10) : '-'}</td>
                <td>${f.categoria_gasto || '-'}</td>
                <td style="text-align:center">${evidenciaHtml}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon edit" onclick="editarFactura(${f.id})"><i class='bx bx-edit'></i></button>
                        <button class="btn-icon delete" onclick="eliminarFactura(${f.id})"><i class='bx bx-trash'></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        renderizarPaginacion('facturas-paginacion', filtrados.length, paginaGastos, (p) => { paginaGastos = p; renderizarTablaGastos(); });
    }

    // Cargar KPIs de pagos para el Tab de Tesorería
    async function cargarCuentasPorPagar() {
        // Filtramos facturas que NO están pagadas al 100%
        cuentasData = facturasData.filter(f => f.estado_pago !== 'pagado' && f.estado_pago !== 'anulado');
        
        let totalPendienteGlobal = 0; // Acumulador para TODO lo que debemos
        let totalVencido = 0;         // Acumulador solo para lo VENCIDO
        
        const hoy = new Date();
        hoy.setHours(0,0,0,0); // Normalizar hora

        cuentasData.forEach(c => {
            // Calcular saldo real de esta factura
            const pagado = parseFloat(c.monto_pagado || 0);
            const total = parseFloat(c.monto_total || 0);
            
            // Si el backend trae 'saldo_pendiente' úsalo, si no calcúlalo
            const saldo = (c.saldo_pendiente !== undefined) ? parseFloat(c.saldo_pendiente) : (total - pagado);

            // 1. Sumar a la deuda global
            totalPendienteGlobal += saldo;

            // 2. Verificar si está vencida para sumar a la deuda urgente
            if (c.fecha_vencimiento) {
                const parts = c.fecha_vencimiento.split('-');
                const vence = new Date(parts[0], parts[1]-1, parts[2]);
                if (vence < hoy) {
                    totalVencido += saldo;
                }
            }
        });

        // --- ACTUALIZAR KPIS EN EL HTML ---
        
        // 1. Nuevo KPI: Total Por Pagar (Global)
        const elTotal = document.getElementById('kpi-total-pendiente');
        if (elTotal) elTotal.innerText = `S/ ${totalPendienteGlobal.toLocaleString('es-PE', {minimumFractionDigits: 2})}`;

        // 2. KPI Existente: Deuda Vencida
        const elVencido = document.getElementById('kpi-vencido');
        if (elVencido) elVencido.innerText = `S/ ${totalVencido.toLocaleString('es-PE', {minimumFractionDigits: 2})}`;

        renderizarTablaCuentas();
    }

    function renderizarTablaCuentas() {
        const tbody = document.getElementById('tabla-cuentas-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const inicio = (paginaCuentas - 1) * FILAS_POR_PAGINA;
        const datos = cuentasData.slice(inicio, inicio + FILAS_POR_PAGINA);

        if (datos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">🎉 ¡Todo al día! No hay deudas pendientes.</td></tr>';
            return;
        }

        const hoy = new Date();

        datos.forEach(c => {
            const tr = document.createElement('tr');
            const vence = new Date(c.fecha_vencimiento);
            const diasRestantes = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
            
            let semaforo = '';
            if (diasRestantes < 0) semaforo = `<span class="badge bg-red">VENCIDO (${Math.abs(diasRestantes)} días)</span>`;
            else if (diasRestantes <= 7) semaforo = `<span class="badge bg-yellow">⚠️ Vence en ${diasRestantes} días</span>`;
            else semaforo = `<span class="badge bg-green">🟢 Al día</span>`;

            const total = parseFloat(c.monto_total);
            const acuenta = parseFloat(c.monto_pagado || 0);
            const saldo = parseFloat(c.saldo_pendiente || (total - acuenta));

            tr.innerHTML = `
                <td>${c.fecha_vencimiento.slice(0, 10)}</td>
                <td>${semaforo}</td>
                <td style="font-weight:600">${c.proveedor}</td>
                <td>${c.numero_documento}</td>
                <td>${c.moneda === 'USD' ? '$' : 'S/'} ${total.toFixed(2)}</td>
                <td style="color:#2ecc71">${acuenta.toFixed(2)}</td>
                <td style="color:#e74c3c; font-weight:bold">${saldo.toFixed(2)}</td>
                <td>
                    <button class="btn-primary btn-sm" onclick="abrirModalPago('GASTO', ${c.id}, ${saldo})">
                        <i class='bx bx-dollar-circle'></i> Pagar
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }

    // --- 4. GUARDAR FACTURA (GASTO) ---
    async function guardarFactura() {
        // 1. Obtener IDs y valores básicos
        const id = document.getElementById('fac-id').value;
        const proveedorId = document.getElementById('fac-proveedor').value;
        const total = document.getElementById('fac-total').value;

        // 2. Validaciones básicas
        if (!proveedorId) return showToast("Seleccione un proveedor", "warning");
        if (!total || parseFloat(total) <= 0) return showToast("Ingrese un monto válido", "warning");

        // 3. UI: Bloquear botón
        const btn = document.querySelector('#modal-factura .btn-primary');
        const txtOriginal = btn.innerText;
        btn.innerText = "Guardando..."; 
        btn.disabled = true;

        // 4. Preparar datos para enviar
        const formData = new FormData();
        
        // -- IDs y Clasificación --
        formData.append('proveedorId', proveedorId); 
        formData.append('sede', document.getElementById('fac-sede').value);
        formData.append('categoria', document.getElementById('fac-linea').value);
        
        // -- Datos del Documento --
        formData.append('glosa', document.getElementById('fac-glosa').value);
        formData.append('tipo', document.getElementById('fac-tipo').value);

        // 🚨 AQUÍ ESTABA EL ERROR: Definimos la variable 'numeroDocumentoFinal' 🚨
        const serieInput = document.getElementById('fac-serie').value.trim().toUpperCase() || 'F001';
        const numeroInput = document.getElementById('fac-numero').value.trim() || '000000';
        
        // Creamos la variable uniendo las dos partes
        const numeroDocumentoFinal = `${serieInput}-${numeroInput}`;

        // Ahora sí la usamos (ya no dará error de 'not defined')
        formData.append('serie', numeroDocumentoFinal); 

        // -- Fechas y Montos --
        formData.append('emision', document.getElementById('fac-emision').value);
        formData.append('vencimiento', document.getElementById('fac-vencimiento').value);
        formData.append('moneda', document.getElementById('fac-moneda').value);
        formData.append('total', total);

        // -- Lógica de pago inmediato (Checkbox) --
        const checkPago = document.getElementById('check-pagar-ahora');
        const pagarAhora = checkPago ? checkPago.checked : false;
        formData.append('formaPago', pagarAhora ? 'Contado' : 'Credito');

        // -- Archivo Adjunto --
        const fileInput = document.getElementById('fac-archivo');
        if (fileInput && fileInput.files[0]) {
            formData.append('evidencia', fileInput.files[0]);
        }

        // 5. Enviar al Backend
        try {
            const token = localStorage.getItem('token');
            const url = id ? `/api/facturas/${id}` : '/api/facturas';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'x-auth-token': token },
                body: formData
            });

            const data = await res.json();

            if (res.ok) {
                showToast(id ? "Gasto actualizado" : "Gasto registrado", "success");
                cerrarModalFactura();
                await cargarGastos();           // Recargar tabla principal
                if(window.cargarCuentasPorPagar) await cargarCuentasPorPagar(); // Actualizar deudas si existe la función
            } else {
                showToast(data.msg || "Error al guardar (Backend)", "error");
                console.error("Error servidor:", data);
            }
        } catch (e) {
            console.error("Error JS/Red:", e);
            showToast("Error de conexión", "error");
        } finally {
            // 6. UI: Restaurar botón
            btn.innerText = txtOriginal;
            btn.disabled = false;
        }
    }

    // --- GESTIÓN DE PAGOS ---
    window.abrirModalPago = function(tipo, idRef, saldoPendiente, nombreEntidad = '', detalleCuota = '') {
        // 1. Guardar referencias ocultas
        document.getElementById('pago-tipo-origen').value = tipo; 
        document.getElementById('pago-ref-id').value = idRef; // Si es PRÉSTAMO, este ID es el de la CUOTA
        
        // 2. Pre-llenar monto
        const inputMonto = document.getElementById('pago-monto');
        inputMonto.value = parseFloat(saldoPendiente).toFixed(2);
        // inputMonto.max = saldoPendiente; // Opcional: Descomentar si quieres prohibir pagar de más
        
        document.getElementById('pago-fecha').valueAsDate = new Date();
        
        // 3. Generar Descripción Bonita
        let descripcion = "";
        
        if (tipo === 'GASTO') {
            // Lógica para facturas (busca en el array global facturasData)
            const fac = facturasData.find(f => f.id === idRef);
            if (fac) {
                descripcion = `Pagando a: <b>${fac.proveedor}</b><br><small>Doc: ${fac.numero_documento}</small>`;
            } else {
                descripcion = "Pagando Factura/Gasto";
            }
        } 

        document.getElementById('pago-descripcion-txt').innerHTML = descripcion;
        
        // 4. Mostrar Modal
        document.getElementById('modal-pago').classList.add('active');
    };

    window.confirmarPago = async function() {
        const tipo = document.getElementById('pago-tipo-origen').value;
        const idRef = document.getElementById('pago-ref-id').value;
        const monto = document.getElementById('pago-monto').value;
        const metodo = document.getElementById('pago-metodo').value;
        const fecha = document.getElementById('pago-fecha').value;
        const operacion = document.getElementById('pago-operacion').value;

        if (!monto || parseFloat(monto) <= 0) return showToast("Ingrese un monto válido", "warning");

        const btn = document.querySelector('#modal-pago .btn-primary');
        btn.disabled = true; btn.innerText = "Procesando...";

        try {
            const token = localStorage.getItem('token');
            // Endpoint según tipo
            const url = tipo === 'GASTO' ? `/api/facturas/pago/${idRef}` : `/api/facturas/prestamos/amortizar/${idRef}`;
            
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                // 🚨 CORRECCIÓN: Nombres de propiedades exactos según espera el backend
                body: JSON.stringify({ 
                    fechaPago: fecha, // Backend espera fechaPago
                    monto: monto, 
                    metodo: metodo, 
                    operacion: operacion 
                })
            });

            const data = await res.json();

            if (res.ok) {
                showToast("Pago registrado correctamente", "success");
                document.getElementById('modal-pago').classList.remove('active');
                
                // Recargar datos
                if (tipo === 'GASTO') { await cargarGastos(); await cargarCuentasPorPagar(); }
                if (tipo === 'PRESTAMO') await cargarPrestamos();

            } else {
                showToast(data.msg || "Error al pagar", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Error de conexión", "error");
        } finally {
            btn.disabled = false; btn.innerText = "Confirmar Egreso";
        }
    };


    // =======================================================
    // 7. API CONSULTAS (RUC / DNI)
    // =======================================================
    window.buscarProveedorRuc = async function(ruc) {
        if (!ruc || ruc.length !== 11) return showToast("El RUC debe tener 11 dígitos", "warning");
        
        const icon = document.querySelector('.input-group i.bx-search');
        icon.className = 'bx bx-loader-alt bx-spin input-icon-right'; // Loading

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/consultas/ruc/${ruc}`, { headers: { 'x-auth-token': token } });
            const data = await res.json();

            if (res.ok && data.razonSocial) {
                showToast("Proveedor encontrado", "success");
                // Crear opción temporal en el select y seleccionarla
                const select = document.getElementById('fac-proveedor');
                const opt = document.createElement('option');
                opt.value = 'NEW|' + ruc + '|' + data.razonSocial; // Valor especial para crear al vuelo
                opt.innerText = `${data.razonSocial} (NUEVO)`;
                opt.selected = true;
                select.appendChild(opt);
                select.value = opt.value;
            } else {
                showToast("No se encontraron datos en SUNAT", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Error al consultar SUNAT", "error");
        } finally {
            icon.className = 'bx bx-search input-icon-right'; // Restaurar icono
        }
    };



    // =======================================================
    // 9. HELPERS Y CIERRE
    // =======================================================
    function exposeGlobalFunctions() {
        // Exponer funciones necesarias para los botones HTML onclick=""
        window.initFacturas = initModulo;
        window.guardarFactura = guardarFactura;
        window.eliminarFactura = eliminarFactura;
        window.editarFactura = editarFactura;
        window.subirArchivoFaltante = subirArchivoFaltante;
        
        // Modales Factura
        window.abrirModalFactura = () => {
            const modal = document.getElementById('modal-factura');
            if(modal) modal.classList.add('active');
        };
        
        window.cerrarModalFactura = () => {
            const modal = document.getElementById('modal-factura');
            if(modal) modal.classList.remove('active');
            document.getElementById('form-nueva-factura').reset();
            document.getElementById('fac-id').value = "";
        };
        
        // Modales Pago
        window.cerrarModalPago = () => {
            const modal = document.getElementById('modal-pago');
            if(modal) modal.classList.remove('active');
        };
    }

    function renderizarPaginacion(containerId, totalItems, pagActual, callback) {
        const container = document.getElementById(containerId);
        if(!container) return;
        
        const totalPaginas = Math.ceil(totalItems / FILAS_POR_PAGINA);
        if (totalPaginas <= 1) { container.innerHTML = ''; return; }

        container.innerHTML = `
            <div class="pagination-controls">
                <span>Pág ${pagActual} de ${totalPaginas}</span>
                <button ${pagActual === 1 ? 'disabled' : ''} onclick="window.changePage(${pagActual - 1})">Anterior</button>
                <button ${pagActual >= totalPaginas ? 'disabled' : ''} onclick="window.changePage(${pagActual + 1})">Siguiente</button>
            </div>
        `;
        
        // Truco para pasar el callback al contexto global temporalmente
        window.changePage = (p) => callback(p);
    }

    function configurarBuscadores() {
        const inputFac = document.getElementById('buscador-facturas');
        // Solo configuramos si el elemento existe
        if(inputFac) {
            inputFac.addEventListener('input', () => { 
                paginaGastos = 1; 
                renderizarTablaGastos(); 
            });
        }
    }
    
    // --- CARGA DE SELECTS ---
    async function obtenerProveedoresParaSelect() {
        const select = document.getElementById('fac-proveedor');
        if (!select) return;
        select.innerHTML = '<option value="" disabled selected>Cargando...</option>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/proveedores', { headers: { 'x-auth-token': token } });
            const data = await res.json();
            
            select.innerHTML = '<option value="" disabled selected>-- Seleccione Proveedor --</option>';
            if (res.ok && Array.isArray(data)) {
                data.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p.id;
                    opt.innerText = `${p.razon_social} (${p.ruc})`;
                    select.appendChild(opt);
                });
            }
        } catch (e) { console.error(e); }
    }

    async function obtenerSedesParaSelect() {
        const select = document.getElementById('fac-sede');
        if (!select) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/sedes', { headers: { 'x-auth-token': token } }); // Ajusta ruta si es /api/usuarios/sedes
            const data = await res.json();

            select.innerHTML = '<option value="" disabled selected>-- Seleccione Sede --</option>';
            if (res.ok && Array.isArray(data)) {
                data.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.innerText = s.nombre;
                    select.appendChild(opt);
                });
            }
        } catch (e) { console.error(e); }
    }

    // --- CRUD DE FACTURAS ---
    async function eliminarFactura(id) {
        const confirmar = await showConfirm("¿Estás seguro?", "Se eliminará esta factura y no se podrá recuperar.");
        if (!confirmar) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/facturas/${id}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': token }
            });

            const data = await res.json();
            if (res.ok) {
                showToast("Factura eliminada correctamente", "success");
                await cargarGastos(); // Recargar tabla
                await cargarCuentasPorPagar(); // Recargar deudas
            } else {
                showToast(data.msg || "Error al eliminar", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Error de conexión", "error");
        }
    }

    // Edición: Cargar datos en el modal para editar
    async function editarFactura(id) {
        const factura = facturasData.find(f => f.id === id);
        if (!factura) return;

        document.getElementById('fac-id').value = factura.id;
        
        // Abrir modal
        document.getElementById('modal-factura').classList.add('active');

        // Usamos setTimeout para asegurar que los selects se llenen
        setTimeout(() => {
            document.getElementById('fac-proveedor').value = factura.proveedor_id;
            document.getElementById('fac-sede').value = factura.sede_id;
            document.getElementById('fac-tipo').value = factura.tipo_documento;

            // 🔥 LÓGICA DE SEPARACIÓN (SPLIT)
            let serieVal = '';
            let numeroVal = '';
            const docCompleto = factura.numero_documento || ''; // Viene de BD como "F001-000456"

            if (docCompleto.includes('-')) {
                const partes = docCompleto.split('-');
                // partes[0] es la serie, partes[1] es el correlativo (o el resto)
                serieVal = partes[0]; 
                numeroVal = partes.slice(1).join('-'); // Une el resto por si hubo más guiones
            } else {
                // Si no hay guión, asumimos que todo es el número o serie
                numeroVal = docCompleto;
            }

            document.getElementById('fac-serie').value = serieVal;
            document.getElementById('fac-numero').value = numeroVal;

            // Resto de campos
            document.getElementById('fac-emision').value = factura.fecha_emision.slice(0, 10);
            document.getElementById('fac-vencimiento').value = factura.fecha_vencimiento ? factura.fecha_vencimiento.slice(0, 10) : '';
            document.getElementById('fac-moneda').value = factura.moneda;
            document.getElementById('fac-total').value = factura.monto_total;
            document.getElementById('fac-glosa').value = factura.descripcion;
            document.getElementById('fac-linea').value = factura.categoria_gasto;
            
            calcularMontos(); // Recalcular totales visuales
        }, 100);
    }
    
    async function subirArchivoFaltante(id) {
        // Simular click en input file oculto para subir directo
        const input = document.getElementById('fac-archivo');
        document.getElementById('fac-id').value = id; // Guardar ID temporalmente
        input.click();
        
        // El evento onchange del input manejará la subida
        input.onchange = async (e) => {
            if (!e.target.files[0]) return;
            
            const formData = new FormData();
            formData.append('archivo', e.target.files[0]);
            
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/facturas/upload/${id}`, {
                method: 'POST',
                headers: { 'x-auth-token': token },
                body: formData
            });
            
            if(res.ok) {
                showToast("Archivo subido", "success");
                cargarGastos();
            }
        };
    }

    // --- HELPERS UI ---
    function configurarFileUpload() {
        const dropZone = document.getElementById('drop-zone');
        const input = document.getElementById('fac-archivo');
        const display = document.getElementById('file-name-display');
        
        if(!dropZone) return;

        dropZone.onclick = () => input.click();
        input.onchange = () => {
            if(input.files[0]) display.innerText = "📄 " + input.files[0].name;
        };
    }

    function configurarBuscadores() {
        const inputFac = document.getElementById('buscador-facturas');
        if(inputFac) inputFac.addEventListener('input', () => { paginaGastos = 1; renderizarTablaGastos(); });
    }

    function renderizarPaginacion(idContenedor, totalItems, pagActual, callback) {
        const container = document.getElementById(idContenedor);
        if(!container) return;
        
        const totalPaginas = Math.ceil(totalItems / FILAS_POR_PAGINA);
        if(totalPaginas <= 1) { container.innerHTML = ''; return; }

        container.innerHTML = `
            <div class="pagination-container">
                <span>Pág ${pagActual} de ${totalPaginas}</span>
                <div class="page-controls">
                    <button ${pagActual === 1 ? 'disabled' : ''} id="btn-prev-${idContenedor}"><i class='bx bx-chevron-left'></i></button>
                    <button ${pagActual >= totalPaginas ? 'disabled' : ''} id="btn-next-${idContenedor}"><i class='bx bx-chevron-right'></i></button>
                </div>
            </div>
        `;

        document.getElementById(`btn-prev-${idContenedor}`).onclick = () => callback(pagActual - 1);
        document.getElementById(`btn-next-${idContenedor}`).onclick = () => callback(pagActual + 1);
    }

    // --- EXPONER FUNCIONES AL HTML (WINDOW) ---
    function exposeGlobalFunctions() {
        window.initFacturas = initModulo;
        window.guardarFactura = guardarFactura; // Asegurate de tener esta funcion definida arriba
        window.eliminarFactura = eliminarFactura;
        window.editarFactura = editarFactura;
        window.subirArchivoFaltante = subirArchivoFaltante;
        
        // Modales
        window.abrirModalFactura = () => document.getElementById('modal-factura').classList.add('active');
        window.cerrarModalFactura = () => {
            document.getElementById('modal-factura').classList.remove('active');
            document.getElementById('form-nueva-factura').reset();
            document.getElementById('fac-id').value = "";
        };
        
        window.cerrarModalPago = () => document.getElementById('modal-pago').classList.remove('active');
        window.abrirModalPrestamo = () => document.getElementById('modal-prestamo').classList.add('active');
        window.cerrarModalPrestamo = () => document.getElementById('modal-prestamo').classList.remove('active');
    }

    // --- FUNCIÓN PARA CARGAR TOTALES Y FECHAS DINÁMICAS ---
    async function cargarKpisPagos() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/facturas/kpis/resumen-pagos', { headers: { 'x-auth-token': token } });
            const data = await res.json();

            if (res.ok) {
                // 1. Formatear Montos
                const fmt = (m) => `S/ ${parseFloat(m || 0).toLocaleString('es-PE', { minimumFractionDigits: 2 })}`;
                
                document.getElementById('kpi-pagado-hoy').innerText = fmt(data.total_hoy);
                document.getElementById('kpi-pagado-mes').innerText = fmt(data.total_mes);
                document.getElementById('kpi-pagado-anio').innerText = fmt(data.total_anio);

                // 2. Actualizar Etiquetas de Fecha (Dinámico)
                const hoy = new Date();
                
                // Obtener nombre del mes (ej: "Febrero")
                const nombreMes = hoy.toLocaleString('es-ES', { month: 'long' });
                const mesCapitalizado = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
                
                // Obtener año (ej: 2026)
                const anioActual = hoy.getFullYear();

                // Insertar en el HTML
                const lblMes = document.getElementById('lbl-mes');
                const lblAnio = document.getElementById('lbl-anio');

                if (lblMes) lblMes.innerText = `Acumulado ${mesCapitalizado}`; // "Acumulado Febrero"
                if (lblAnio) lblAnio.innerText = `Total Año ${anioActual}`;    // "Total Año 2026"
            }
        } catch (e) {
            console.error("Error KPIs:", e);
        }
    }

    // INICIAR
    initModulo();

})();