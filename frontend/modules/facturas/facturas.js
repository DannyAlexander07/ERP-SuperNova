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
    const FILAS_POR_PAGINA = 8;

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

    // Agregar esto dentro de tu DOMContentLoaded o al final del script
    document.addEventListener("DOMContentLoaded", () => {
        // Escuchar cambios en el filtro de fecha
        const fechaInput = document.getElementById('filtro-fecha'); // Asegúrate que tu input HTML tenga este ID
        if(fechaInput) {
            fechaInput.addEventListener('change', () => {
                paginaGastos = 1; // Resetear a pag 1
                renderizarTablaGastos(); // Volver a pintar
            });
        }

        // Escuchar clic en botón Excel
        const btnExcel = document.querySelector('.btn-excel'); // O el ID que tenga tu botón verde
        if(btnExcel) {
            btnExcel.onclick = exportarExcel;
        }
    });

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
    
    // --- FILTRAR TABLA AL CAMBIAR LA FECHA ---
    window.filtrarPorFecha = function() {
        // 1. Regresamos a la página 1 por si estábamos en la 3 y hay pocos resultados
        paginaGastos = 1; 
        
        // 2. Volvemos a dibujar la tabla (esta función ya leerá el input automáticamente)
        renderizarTablaGastos(); 
    };

    function renderizarTablaGastos() {
        const tbody = document.getElementById('tabla-facturas-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // 1. Filtrado Local (Buscador y Filtro de Fecha)
        const busqueda = (document.getElementById('buscador-facturas')?.value || '').toLowerCase();
        const fechaFiltro = document.getElementById('filtro-fecha')?.value;

        const filtrados = facturasData.filter(f => {
            const texto = (f.proveedor + f.numero_documento + f.descripcion).toLowerCase();
            const matchTexto = texto.includes(busqueda);
            const matchFecha = !fechaFiltro || f.fecha_emision.startsWith(fechaFiltro);
            return matchTexto && matchFecha;
        });

        // 2. Lógica de Paginación
        const inicio = (paginaGastos - 1) * FILAS_POR_PAGINA;
        const datosPagina = filtrados.slice(inicio, inicio + FILAS_POR_PAGINA);

        if (datosPagina.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px;">No se encontraron registros.</td></tr>';
            return;
        }

        // 3. Renderizado de Filas
        datosPagina.forEach(f => {
            const tr = document.createElement('tr');

            // --- 🚀 CÁLCULO DE DÍAS VENCIDOS (Sincronizado con el Backend) ---
            let diasVencidosHtml = '<span class="badge bg-green" style="padding: 5px 10px; border-radius: 4px; font-size: 11px;">AL DÍA</span>';
            
            if (f.estado_pago !== 'pagado') {
                const diasNum = parseInt(f.dias_vencidos_count) || 0;
                if (diasNum > 0) {
                    diasVencidosHtml = `<span class="badge bg-red" style="font-weight:900; padding: 5px 10px; border-radius: 4px; font-size: 11px; background-color: #fee2e2; color: #dc2626;">${diasNum} DÍAS VENC.</span>`;
                }
            } else if (f.estado_pago === 'pagado') {
                diasVencidosHtml = '<span class="badge bg-green" style="padding: 5px 10px; border-radius: 4px; background-color: #dcfce7; color: #16a34a;"><i class="bx bx-check"></i></span>';
            }
            
            // --- SEMÁFORO ESTADO ---
            let estadoHtml = '';
            if(f.estado_pago === 'pagado') {
                estadoHtml = '<span class="badge bg-green" style="background-color: #dcfce7; color: #16a34a; padding: 4px 8px; border-radius: 4px; font-weight: 600;">PAGADO</span>';
            } else if(f.estado_pago === 'parcial') {
                estadoHtml = '<span class="badge bg-yellow" style="background-color: #fef9c3; color: #ca8a04; padding: 4px 8px; border-radius: 4px; font-weight: 600;">PARCIAL</span>';
            } else {
                estadoHtml = '<span class="badge bg-red" style="background-color: #fee2e2; color: #dc2626; padding: 4px 8px; border-radius: 4px; font-weight: 600;">PENDIENTE</span>';
            }

            // --- EVIDENCIA ---
            let evidenciaHtml = `<button class="btn-icon" onclick="subirArchivoFaltante(${f.id})" title="Subir"><i class='bx bx-upload'></i></button>`;
            if (f.evidencia_url) {
                const url = f.evidencia_url.replace(/\\/g, '/').replace('backend/', '/');
                evidenciaHtml = `<a href="${url}" target="_blank" class="btn-icon" style="color:#e74c3c"><i class='bx bxs-file-pdf'></i></a>`;
            }

            const docVisual = f.numero_documento || '-';

            // ⚠️ COLUMNA ACCIONES ACTUALIZADA: Se añade el botón "Ver Detalle" (abrirModalDetallesVer)
            tr.innerHTML = `
                <td>${f.fecha_emision ? f.fecha_emision.slice(0, 10) : '-'}</td>

                <td style="color:#6366f1; font-weight:500;">
                    ${f.fecha_programacion ? f.fecha_programacion.slice(0, 10) : '-'}
                </td>
                
                <td>${f.fecha_vencimiento ? f.fecha_vencimiento.slice(0, 10) : '-'}</td>

                <td style="font-weight:600">${f.proveedor || 'S/N'}</td>
                
                <td>${f.tipo_documento || 'Doc'} <br> <small style="color:#666">${docVisual}</small></td>
                
                <td style="font-weight:bold">${f.moneda === 'USD' ? '$' : 'S/'} ${parseFloat(f.monto_total).toFixed(2)}</td>
                
                <td>${estadoHtml}</td>
                
                <td style="text-align:center;">${diasVencidosHtml}</td> 

                <td>${f.categoria_gasto || '-'}</td>
                
                <td style="text-align:center">${evidenciaHtml}</td>
                
                <td>
                    <div class="action-buttons" style="display: flex; gap: 5px; justify-content: center;">
                        <button class="btn-icon" style="color:#3b82f6; background:#eff6ff;" onclick="abrirModalDetallesVer(${f.id})" title="Ver Historial y Documentos">
                            <i class='bx bx-show'></i>
                        </button>
                        <button class="btn-icon edit" onclick="editarFactura(${f.id})"><i class='bx bx-edit'></i></button>
                        <button class="btn-icon delete" onclick="eliminarFactura(${f.id})"><i class='bx bx-trash'></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        // 4. Actualizar Controles de Paginación
        renderizarPaginacion('facturas-paginacion', filtrados.length, paginaGastos, (p) => { 
            paginaGastos = p; 
            renderizarTablaGastos(); 
        });
        
        // Alerta de vencimientos solo en la primera página
        if (paginaGastos === 1) verificarAlertasVencimiento(facturasData);
    }

    // Cargar KPIs de pagos para el Tab de Tesorería - ACTUALIZADO PARA ACTUALIZACIÓN INSTANTÁNEA
    async function cargarCuentasPorPagar() {
        // 1. Sincronizamos cuentasData con la versión más reciente de facturasData (que viene del backend)
        cuentasData = facturasData.filter(f => f.estado_pago !== 'pagado' && f.estado_pago !== 'anulado');
        
        let totalPendienteGlobal = 0; // Acumulador para la Deuda Global
        let totalVencido = 0;         // Acumulador para la Deuda Vencida
        
        // 🚀 Normalizamos fecha actual a las 00:00:00 (Hora Lima) para cálculos exactos
        const hoy = new Date();
        hoy.setHours(0,0,0,0);

        cuentasData.forEach(c => {
            // Calculamos saldos reales basados en la respuesta actualizada del servidor
            const pagado = parseFloat(c.monto_pagado || 0);
            const total = parseFloat(c.monto_total || 0);
            
            // Usamos el saldo_pendiente calculado por el backend para evitar desfases en el frontend
            const saldo = (c.saldo_pendiente !== undefined) ? parseFloat(c.saldo_pendiente) : (total - pagado);

            // A. Sumar a la deuda global
            totalPendienteGlobal += saldo;

            // B. Verificar vencimiento usando la lógica de medianoche
            if (c.fecha_vencimiento) {
                const parts = c.fecha_vencimiento.split('-');
                // Mes -1 porque en JS Enero es 0
                const vence = new Date(parts[0], parts[1]-1, parts[2]);
                
                // Si la fecha de vencimiento es estrictamente menor a hoy, se considera vencida
                if (vence < hoy) {
                    totalVencido += saldo;
                }
            }
        });
        
        // 1. KPI: Total Por Pagar (Deuda Global)
        const elTotal = document.getElementById('kpi-total-pendiente');
        if (elTotal) {
            elTotal.innerText = `S/ ${totalPendienteGlobal.toLocaleString('es-PE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}`;
        }

        // 2. KPI: Deuda Vencida (Urgente)
        const elVencido = document.getElementById('kpi-vencido');
        if (elVencido) {
            elVencido.innerText = `S/ ${totalVencido.toLocaleString('es-PE', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })}`;
        }

        // 3. Redibujar la tabla con los saldos recién calculados
        if (typeof renderizarTablaCuentas === 'function') {
            renderizarTablaCuentas();
        }
    }

    function renderizarTablaCuentas() {
        const tbody = document.getElementById('tabla-cuentas-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // 1. Lógica de Paginación: Cortar el array cuentasData según la página actual
        const inicio = (paginaCuentas - 1) * FILAS_POR_PAGINA;
        const datos = cuentasData.slice(inicio, inicio + FILAS_POR_PAGINA);

        if (datos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px;">🎉 ¡Todo al día! No hay deudas pendientes.</td></tr>';
            // Limpiar paginación si no hay datos
            const pagContainer = document.getElementById('cuentas-paginacion');
            if (pagContainer) pagContainer.innerHTML = '';
            return;
        }

        const hoy = new Date();
        // Normalizamos hoy para la comparación del semáforo
        hoy.setHours(0,0,0,0); 

        // 🛡️ OBTENEMOS EL ROL DEL USUARIO ACTUAL
        const userRole = (localStorage.getItem('rol') || '').toLowerCase(); 

        // 🛡️ DEFINIMOS QUÉ ROLES PUEDEN HACER QUÉ ACCIÓN
        const rolesProgramar = ['superadmin', 'gerente', 'director'];
        const rolesAprobar = ['superadmin', 'contador', 'finanzas'];

        datos.forEach(c => {
            const tr = document.createElement('tr');
            
            // Cálculo de días restantes para el semáforo
            const parts = c.fecha_vencimiento.split('-');
            const vence = new Date(parts[0], parts[1]-1, parts[2]);
            const diasRestantes = Math.ceil((vence - hoy) / (1000 * 60 * 60 * 24));
            
            let semaforo = '';
            if (diasRestantes < 0) semaforo = `<span class="badge bg-red">VENCIDO (${Math.abs(diasRestantes)} días)</span>`;
            else if (diasRestantes <= 7) semaforo = `<span class="badge bg-yellow">⚠️ Vence en ${diasRestantes} días</span>`;
            else semaforo = `<span class="badge bg-green">🟢 Al día</span>`;

            const total = parseFloat(c.monto_total);
            const acuenta = parseFloat(c.monto_pagado || 0);
            const saldo = parseFloat(c.saldo_pendiente || (total - acuenta));

            // --- 🛡️ LÓGICA DE BOTONES DE FLUJO Y BLOQUEO DE PAGO CON PERMISOS ---
            const estadoFlujo = c.estado_aprobacion || 'registrado';
            let btnFlujo = '';
            let btnPagar = '';
            
            if (estadoFlujo === 'registrado') {
                if (rolesProgramar.includes(userRole)) {
                    btnFlujo = `
                        <button class="btn-icon" style="color:#f59e0b; background:#fef3c7;" onclick="cambiarEstadoFlujo(${c.id}, 'programado')" title="Programar Pago">
                            <i class='bx bx-calendar-star'></i>
                        </button>`;
                } else {
                    btnFlujo = `
                        <button class="btn-icon" style="color:#cbd5e1; background:#f8fafc; cursor:not-allowed;" title="Esperando que Gerencia programe el pago">
                            <i class='bx bx-calendar-star'></i>
                        </button>`;
                }
                
                btnPagar = `
                    <button class="btn-icon" style="color:#94a3b8; background:#f1f5f9; cursor:not-allowed;" title="Requiere ser programado y aprobado primero">
                        <i class='bx bx-dollar-circle'></i>
                    </button>`;

            } else if (estadoFlujo === 'programado') {
                if (rolesAprobar.includes(userRole)) {
                    btnFlujo = `
                        <button class="btn-icon" style="color:#8b5cf6; background:#f3e8ff;" onclick="cambiarEstadoFlujo(${c.id}, 'pendiente')" title="Aprobar para Pago">
                            <i class='bx bx-check-double'></i>
                        </button>`;
                } else {
                    btnFlujo = `
                        <button class="btn-icon" style="color:#cbd5e1; background:#f8fafc; cursor:not-allowed;" title="Esperando que Contabilidad apruebe la recepción">
                            <i class='bx bx-check-double'></i>
                        </button>`;
                }

                btnPagar = `
                    <button class="btn-icon" style="color:#94a3b8; background:#f1f5f9; cursor:not-allowed;" title="Esperando aprobación de Contabilidad">
                        <i class='bx bx-dollar-circle'></i>
                    </button>`;

            } else {
                btnFlujo = `<span class="badge bg-green" style="padding: 5px;" title="Aprobado"><i class='bx bx-check'></i></span>`;
                
                btnPagar = `
                    <button class="btn-icon" style="color:#10b981; background:#ecfdf5;" onclick="abrirModalPagoExtendido(${c.id}, ${saldo}, '${c.proveedor}', '${c.numero_documento}', '${c.moneda}')" title="Registrar Salida de Dinero">
                        <i class='bx bx-dollar-circle'></i>
                    </button>`;
            }

            tr.innerHTML = `
                <td>${c.fecha_vencimiento.slice(0, 10)}</td>
                <td>${semaforo}</td>
                <td style="font-weight:600">${c.proveedor}</td>
                <td>${c.numero_documento}</td>
                <td>${c.moneda === 'USD' ? '$' : 'S/'} ${total.toFixed(2)}</td>
                <td style="color:#2ecc71">${acuenta.toFixed(2)}</td>
                <td style="color:#e74c3c; font-weight:bold">${saldo.toFixed(2)}</td>
                
                <td>
                    <div style="display: flex; gap: 5px; align-items: center; justify-content: center;">
                        <button class="btn-icon" style="color:#3b82f6; background:#eff6ff;" onclick="abrirModalDetallesVer(${c.id})" title="Ver Detalles, Documentos y Pagos">
                            <i class='bx bx-show'></i>
                        </button>
                        
                        ${btnFlujo}

                        ${btnPagar}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // 2. 🔥 ACTIVAR CONTROLES DE PAGINACIÓN PARA CUENTAS
        // Asegúrate de tener el contenedor <div id="cuentas-paginacion"></div> en tu HTML
        renderizarPaginacion('cuentas-paginacion', cuentasData.length, paginaCuentas, (p) => { 
            paginaCuentas = p; 
            renderizarTablaCuentas(); 
        });
    }

    window.calcularTotalImpuesto = function() {
        const base = parseFloat(document.getElementById('fac-base').value) || 0;
        const porcentaje = parseFloat(document.getElementById('fac-impuesto-porc').value) || 0;
        let total = 0;

        if (porcentaje === 8) {
            // Caso especial: 8% RESTA al monto base
            total = base - (base * 0.08);
        } else {
            // Casos 18%, 10.5%, 0%: SUMAN al monto base
            total = base + (base * (porcentaje / 100));
        }

        // Mostrar resultado bloqueado
        document.getElementById('fac-total-final').value = total.toFixed(2);
    };

    // 🆕 FUNCIÓN ALERTA VENCIMIENTOS
    function verificarAlertasVencimiento(data) {
        const hoy = new Date();
        hoy.setHours(0,0,0,0);
        
        // Filtrar cuántas están vencidas y no pagadas
        const vencidas = data.filter(f => {
            if (!f.fecha_vencimiento || f.estado_pago === 'pagado') return false;
            const v = new Date(f.fecha_vencimiento);
            return v < hoy; // Si la fecha de vencimiento es menor a hoy
        });

        if (vencidas.length > 0) {
            // Usamos tu showToast o un alert custom. Si quieres algo más intrusivo:
            showToast(`⚠️ ATENCIÓN: Tienes ${vencidas.length} facturas vencidas.`, "warning");
        }
    }

    // --- 4. GUARDAR FACTURA (GASTO) ---
    async function guardarFactura() {
        // 1. Obtener IDs y valores básicos
        const id = document.getElementById('fac-id').value;
        const proveedorId = document.getElementById('fac-proveedor').value;
        const totalCalculado = document.getElementById('fac-total-final').value;

        // 2. Validaciones básicas
        if (!proveedorId) return showToast("Seleccione un proveedor", "warning");
        if (!totalCalculado || parseFloat(totalCalculado) <= 0) return showToast("El monto total no es válido", "warning");

        // 3. UI: Bloquear botón (Buscamos dentro del modal activo)
        const btn = document.querySelector('#modal-factura button.btn-primary');
        const txtOriginal = btn ? btn.innerText : "Guardar";
        if(btn) { btn.innerText = "Guardando..."; btn.disabled = true; }

        // 4. Preparar datos para enviar
        const formData = new FormData();
        
        // -- IDs y Clasificación --
        formData.append('proveedorId', proveedorId); 
        formData.append('sede', document.getElementById('fac-sede').value);
        formData.append('categoria', document.getElementById('fac-clasificacion').value);
        
        // -- Datos del Documento --
        formData.append('glosa', document.getElementById('fac-glosa').value);
        
        // Lógica Dinámica de Documento
        const tipoDoc = document.getElementById('fac-tipo').value;
        formData.append('tipo', tipoDoc);

        let numeroDocumentoFinal = '';

        if (tipoDoc === 'Factura' || tipoDoc === 'Boleta') {
            // Usamos los 2 inputs (Serie - Correlativo)
            const serie = document.getElementById('fac-serie').value.trim().toUpperCase() || 'F001';
            const correlativo = document.getElementById('fac-numero').value.trim() || '000000';
            numeroDocumentoFinal = `${serie}-${correlativo}`;
        } else {
            // Usamos el input único
            const docUnico = document.getElementById('fac-doc-unico');
            numeroDocumentoFinal = docUnico ? docUnico.value.trim() : 'S/N';
        }
        formData.append('serie', numeroDocumentoFinal);

        // -- Fechas --
        formData.append('emision', document.getElementById('fac-emision').value);
        // Enviamos fecha de programación (puede ir vacía)
        formData.append('programacion', document.getElementById('fac-programacion').value); 
        formData.append('vencimiento', document.getElementById('fac-vencimiento').value);
        
        // -- MONTOS E IMPUESTOS --
        formData.append('moneda', document.getElementById('fac-moneda').value);
        
        // 🚨 CORRECCIÓN CLAVE PARA EL ERROR NUMERIC: "" 🚨
        // Si el input está vacío, enviamos "0"
        const montoBase = document.getElementById('fac-base').value || "0";
        formData.append('monto_base', montoBase); 
        
        const impuesto = document.getElementById('fac-impuesto-porc').value || "0";
        formData.append('impuesto_porcentaje', impuesto); 
        
        formData.append('total', totalCalculado); 

        // -- DATOS BANCARIOS --
        formData.append('banco', document.getElementById('fac-banco').value);
        formData.append('cuenta', document.getElementById('fac-cuenta').value);
        formData.append('cci', document.getElementById('fac-cci').value);

        // -- Lógica de pago inmediato --
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
                await cargarGastos();           
                if(window.cargarCuentasPorPagar) await cargarCuentasPorPagar(); 
            } else {
                showToast(data.msg || "Error al guardar (Backend)", "error");
                console.error("Error servidor:", data);
            }
        } catch (e) {
            console.error("Error JS/Red:", e);
            showToast("Error de conexión", "error");
        } finally {
            // 6. UI: Restaurar botón
            if(btn) { btn.innerText = txtOriginal; btn.disabled = false; }
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

    // --- 5. CONFIRMAR PAGO (MODAL) ---
    // --- 5. CONFIRMAR PAGO (MODAL) - ACTUALIZADO PARA ACTUALIZACIÓN INSTANTÁNEA ---
    window.confirmarPago = async function() {
        // 1. Obtener valores del DOM
        const tipo = document.getElementById('pago-tipo-origen').value || 'GASTO'; 
        const idRef = document.getElementById('pago-ref-id').value;
        const monto = document.getElementById('pago-monto').value;
        const metodo = document.getElementById('pago-metodo').value;
        const fecha = document.getElementById('pago-fecha').value;
        const operacion = document.getElementById('pago-operacion').value;

        // 2. Validaciones de entrada
        if (!monto || parseFloat(monto) <= 0) return showToast("Ingrese un monto válido", "warning");
        if (!fecha) return showToast("Seleccione una fecha de pago", "warning");

        // 3. UI: Bloquear botón para evitar doble clic
        const btn = document.querySelector('#modal-pago .btn-primary');
        let txtOriginal = "Confirmar Egreso";
        
        if (btn) {
            txtOriginal = btn.innerText;
            btn.disabled = true; 
            btn.innerText = "Procesando...";
        }

        try {
            const token = localStorage.getItem('token');
            // Endpoint dinámico según el origen (Gasto normal o Préstamo)
            const url = tipo === 'GASTO' ? `/api/facturas/pago/${idRef}` : `/api/facturas/prestamos/amortizar/${idRef}`;
            
            const res = await fetch(url, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-auth-token': token 
                },
                body: JSON.stringify({ 
                    fechaPago: fecha, 
                    monto: parseFloat(monto), 
                    metodo: metodo, 
                    operacion: operacion,
                    // Compatibilidad con backend (mapeo de campos)
                    fecha_pago: fecha,
                    metodo_pago: metodo,
                    descripcion: operacion ? `Operación: ${operacion}` : 'Pago de Factura'
                })
            });

            const data = await res.json();

            if (res.ok) {
                showToast("✅ Pago registrado correctamente", "success");
                
                // Cerrar modal de pago
                document.getElementById('modal-pago').classList.remove('active');
                
                // --- 🔄 FLUJO DE ACTUALIZACIÓN INSTANTÁNEA ---
                if (tipo === 'GASTO') { 
                    // 1. Recargar los datos del servidor (esto actualiza facturasData con los nuevos saldos)
                    await cargarGastos(); 
                    
                    // 2. Si estamos viendo Tesorería, actualizamos cuentasData y la tabla "Acuenta"
                    if (typeof cargarCuentasPorPagar === 'function') {
                        await cargarCuentasPorPagar(); 
                    }

                    // 3. Refrescar los cuadros de resumen superiores (Pagado Hoy, Deuda Vencida)
                    if (typeof cargarKpisPagos === 'function') {
                        await cargarKpisPagos(); 
                    }
                }

                if (tipo === 'PRESTAMO') {
                    if (typeof cargarPrestamos === 'function') await cargarPrestamos();
                }

            } else {
                showToast(data.msg || "Error al procesar el pago", "error");
            }
        } catch (e) {
            console.error("❌ Error en confirmarPago:", e);
            showToast("Error de conexión con el servidor", "error");
        } finally {
            // 4. UI: Restaurar botón original
            if(btn) {
                btn.disabled = false; 
                btn.innerText = txtOriginal; 
            }
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
        if (!container) return;
        
        const totalPaginas = Math.ceil(totalItems / FILAS_POR_PAGINA);
        
        // Si no hay suficientes items para una segunda página, limpiamos el contenedor
        if (totalPaginas <= 1) { 
            container.innerHTML = ''; 
            return; 
        }

        // Estructura sincronizada con el CSS profesional
        container.innerHTML = `
            <div class="pagination-container">
                <span>Pág ${pagActual} de ${totalPaginas}</span>
                <div class="page-controls">
                    <button id="btn-prev-${containerId}" ${pagActual === 1 ? 'disabled' : ''} title="Anterior">
                        <i class='bx bx-chevron-left'></i>
                    </button>
                    <button id="btn-next-${containerId}" ${pagActual >= totalPaginas ? 'disabled' : ''} title="Siguiente">
                        <i class='bx bx-chevron-right'></i>
                    </button>
                </div>
            </div>
        `;
        
        // Asignación de eventos directa (Evita conflictos entre tablas)
        const btnPrev = document.getElementById(`btn-prev-${containerId}`);
        const btnNext = document.getElementById(`btn-next-${containerId}`);

        if (btnPrev && pagActual > 1) {
            btnPrev.onclick = (e) => {
                e.preventDefault();
                callback(pagActual - 1);
            };
        }

        if (btnNext && pagActual < totalPaginas) {
            btnNext.onclick = (e) => {
                e.preventDefault();
                callback(pagActual + 1);
            };
        }
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

   // Edición: Cargar datos en el modal para editar (CORREGIDO % IMPUESTO)
    async function editarFactura(id) {
        const factura = facturasData.find(f => f.id === id);
        if (!factura) return;

        document.getElementById('fac-id').value = factura.id;
        
        // Abrir modal
        document.getElementById('modal-factura').classList.add('active');

        // Usamos setTimeout para asegurar que los selects se llenen y el DOM esté listo
        setTimeout(() => {
            // 1. Datos Básicos
            document.getElementById('fac-proveedor').value = factura.proveedor_id;
            document.getElementById('fac-sede').value = factura.sede_id;
            document.getElementById('fac-glosa').value = factura.descripcion;
            
            // Clasificación (Manejo de nombres antiguos o nuevos del ID)
            const comboCategoria = document.getElementById('fac-clasificacion') || document.getElementById('fac-linea');
            if(comboCategoria) comboCategoria.value = factura.categoria_gasto;

            // 2. Tipo de Documento y Lógica Visual
            const tipoDoc = factura.tipo_documento;
            document.getElementById('fac-tipo').value = tipoDoc;

            // 🔥 Ejecutamos la función visual para mostrar los inputs correctos (Doble o Único)
            if (typeof toggleInputsDocumento === 'function') toggleInputsDocumento();

            // 3. Carga de Serie/Número según el tipo
            const docCompleto = factura.numero_documento || ''; 

            if (tipoDoc === 'Factura' || tipoDoc === 'Boleta') {
                // Lógica de 2 inputs (Serie y Correlativo)
                let serieVal = '';
                let numeroVal = '';
                
                if (docCompleto.includes('-')) {
                    const partes = docCompleto.split('-');
                    serieVal = partes[0]; 
                    numeroVal = partes.slice(1).join('-'); 
                } else {
                    numeroVal = docCompleto;
                }
                
                document.getElementById('fac-serie').value = serieVal;
                document.getElementById('fac-numero').value = numeroVal;
            } else {
                // Lógica de 1 input (Invoice, RHE, Sin Doc)
                const inputUnico = document.getElementById('fac-doc-unico');
                if (inputUnico) inputUnico.value = docCompleto;
            }

            // 4. Fechas
            document.getElementById('fac-emision').value = factura.fecha_emision ? factura.fecha_emision.slice(0, 10) : '';
            document.getElementById('fac-vencimiento').value = factura.fecha_vencimiento ? factura.fecha_vencimiento.slice(0, 10) : '';
            
            // 🆕 Fecha Programación
            const inputProg = document.getElementById('fac-programacion');
            if (inputProg) {
                inputProg.value = factura.fecha_programacion ? factura.fecha_programacion.slice(0, 10) : '';
            }

            // 5. Datos Financieros (Base, Impuesto, Total)
            document.getElementById('fac-moneda').value = factura.moneda;
            
            // Cargar Monto Base 
            // Si base_imponible es null (registros viejos), usamos monto_neto o 0
            const base = factura.base_imponible !== null ? factura.base_imponible : (factura.monto_neto_pagar || 0); 
            document.getElementById('fac-base').value = parseFloat(base).toFixed(2);

            // --- 🚨 CORRECCIÓN DEL SELECT DE IMPUESTO 🚨 ---
            let impuestoVal = factura.porcentaje_detraccion;

            // Si es null/undefined, ponemos 0
            if (impuestoVal === null || impuestoVal === undefined) {
                impuestoVal = 0;
            }

            // Truco: Convertir a float y luego a string elimina los decimales extra innecesarios (.00)
            // Ejemplo: "18.00" se convierte en "18", que SÍ coincide con <option value="18">
            const impuestoStr = parseFloat(impuestoVal).toString();

            const selectImpuesto = document.getElementById('fac-impuesto-porc');
            selectImpuesto.value = impuestoStr;

            // Fallback: Si el valor no existe en el select, forzamos "0"
            if (!selectImpuesto.value) {
                selectImpuesto.value = "0";
            }

            // Cargar Total Final (Readonly)
            document.getElementById('fac-total-final').value = parseFloat(factura.monto_total).toFixed(2);

            // 6. Datos Bancarios
            document.getElementById('fac-banco').value = factura.banco || '';
            document.getElementById('fac-cuenta').value = factura.numero_cuenta || '';
            document.getElementById('fac-cci').value = factura.cci || '';

            // Forzar recálculo visual para que todo cuadre
            if(window.calcularTotalImpuesto) window.calcularTotalImpuesto();

            const checkPago = document.getElementById('check-pagar-ahora');
            if (checkPago) {
                // Verificamos si ya está pagado o si fue al contado
                if (factura.estado_pago === 'pagado' || factura.forma_pago === 'Contado') {
                    checkPago.checked = true;
                    checkPago.disabled = true; // Lo bloqueamos por seguridad
                } else {
                    checkPago.checked = false;
                    checkPago.disabled = false; // Habilitado para que puedan marcarlo si se olvidaron antes
                }
            }
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
    // 🆕 LÓGICA VISUAL: CAMBIAR INPUTS SEGÚN TIPO DOC
    window.toggleInputsDocumento = function() {
        const tipo = document.getElementById('fac-tipo').value;
        const bloqueDoble = document.getElementById('bloque-doble-input');
        const bloqueUnico = document.getElementById('bloque-unico-input');

        // Si es Factura o Boleta -> Mostrar 2 inputs
        if (tipo === 'Factura' || tipo === 'Boleta') {
            bloqueDoble.style.display = 'contents'; // Mantiene el grid
            bloqueUnico.style.display = 'none';
        } else {
            // Invoice, RHE, Sin Documento -> Mostrar 1 input
            bloqueDoble.style.display = 'none';
            bloqueUnico.style.display = 'block';
        }
    };

    // --- CONFIGURACIÓN DE SUBIDA DE ARCHIVOS (DRAG & DROP + REEMPLAZO) ---
    function configurarFileUpload() {
        const dropZone = document.getElementById('drop-zone');
        const input = document.getElementById('fac-archivo');
        const display = document.getElementById('file-name-display');
        
        if(!dropZone || !input) return;

        // 1. Clic para abrir explorador
        dropZone.onclick = () => input.click();

        // 2. Al seleccionar archivo (Input estándar)
        input.onchange = () => {
            if(input.files && input.files[0]) {
                actualizarVistaArchivo(input.files[0]);
            }
        };

        // 3. Eventos Drag & Drop (Arrastrar y Soltar)
        // Prevenir comportamientos por defecto del navegador
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        // Efecto visual al arrastrar encima (border azul)
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.add('highlight'); // Necesitas CSS para esto
                dropZone.style.borderColor = '#3b82f6';
                dropZone.style.backgroundColor = '#eff6ff';
            }, false);
        });

        // Quitar efecto al salir
        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, () => {
                dropZone.classList.remove('highlight');
                dropZone.style.borderColor = '#ccc'; // Color original (ajústalo a tu CSS)
                dropZone.style.backgroundColor = 'transparent';
            }, false);
        });

        // 4. Soltar archivo (Drop)
        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = dt.files;

            if (files && files.length > 0) {
                input.files = files; // Asignamos el archivo al input real
                actualizarVistaArchivo(files[0]);
            }
        });

        // Función auxiliar para mostrar nombre y permitir cambio
        function actualizarVistaArchivo(file) {
            // Muestra ícono y nombre
            display.innerHTML = `
                <div style="color:#16a34a; font-weight:bold; margin-top:5px;">
                    <i class='bx bxs-file-pdf'></i> ${file.name}
                </div>
                <small style="color:#666; display:block; margin-top:2px;">
                    (Clic aquí para cambiar el archivo)
                </small>
            `;
            // Borde verde para indicar éxito
            dropZone.style.borderColor = '#16a34a';
            dropZone.style.borderStyle = 'solid';
            dropZone.style.backgroundColor = '#f0fdf4';
        }
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

// --- FUNCIÓN PARA CARGAR TOTALES Y FECHAS DINÁMICAS (ACTUALIZADA SOLES/DÓLARES) ---
    async function cargarKpisPagos() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/facturas/kpis/resumen-pagos', { headers: { 'x-auth-token': token } });
            
            if (res.ok) {
                const data = await res.json();

                // 1. Formatear Montos (Helpers para Soles y Dólares)
                const fmtPEN = (m) => `S/ ${parseFloat(m || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const fmtUSD = (m) => `$ ${parseFloat(m || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                
                // 2. Actualizar Bloques de PAGOS (Verde / Azul / Amarillo)
                const elHoyPen = document.getElementById('kpi-pagado-hoy-pen');
                const elHoyUsd = document.getElementById('kpi-pagado-hoy-usd');
                const elMesPen = document.getElementById('kpi-pagado-mes-pen');
                const elMesUsd = document.getElementById('kpi-pagado-mes-usd');
                const elAnioPen = document.getElementById('kpi-pagado-anio-pen');
                const elAnioUsd = document.getElementById('kpi-pagado-anio-usd');

                if (elHoyPen) elHoyPen.innerText = fmtPEN(data.total_hoy_pen);
                if (elHoyUsd) elHoyUsd.innerText = fmtUSD(data.total_hoy_usd);
                
                if (elMesPen) elMesPen.innerText = fmtPEN(data.total_mes_pen);
                if (elMesUsd) elMesUsd.innerText = fmtUSD(data.total_mes_usd);
                
                if (elAnioPen) elAnioPen.innerText = fmtPEN(data.total_anio_pen);
                if (elAnioUsd) elAnioUsd.innerText = fmtUSD(data.total_anio_usd);

                // 3. 🆕 Actualizar Bloques de DEUDA (Morado / Rojo)
                const elPendientePen = document.getElementById('kpi-total-pendiente-pen');
                const elPendienteUsd = document.getElementById('kpi-total-pendiente-usd');
                const elVencidoPen = document.getElementById('kpi-vencido-pen');
                const elVencidoUsd = document.getElementById('kpi-vencido-usd');

                if (elPendientePen) elPendientePen.innerText = fmtPEN(data.total_pendiente_pen);
                if (elPendienteUsd) elPendienteUsd.innerText = fmtUSD(data.total_pendiente_usd);
                
                if (elVencidoPen) elVencidoPen.innerText = fmtPEN(data.total_vencido_pen);
                if (elVencidoUsd) elVencidoUsd.innerText = fmtUSD(data.total_vencido_usd);

                // 4. Actualizar Etiquetas de Fecha (Texto Dinámico)
                const hoy = new Date();
                const nombreMes = hoy.toLocaleString('es-ES', { month: 'long' });
                const mesCapitalizado = nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1);
                const anioActual = hoy.getFullYear();

                const lblMes = document.getElementById('lbl-mes');
                const lblAnio = document.getElementById('lbl-anio');

                if (lblMes) lblMes.innerText = `Acumulado ${mesCapitalizado}`; 
                if (lblAnio) lblAnio.innerText = `Total Año ${anioActual}`; 
            }
        } catch (e) {
            console.error("Error cargando KPIs:", e);
        }
    }

    // --- 7. EXPORTAR A EXCEL (TEXTO LIMPIO SIN FÓRMULAS VISIBLES) ---
    window.exportarExcel = function() {
        if (!facturasData || facturasData.length === 0) {
            return showToast("No hay datos para exportar", "warning");
        }

        const hoy = new Date();
        hoy.setHours(0,0,0,0);

        // 🚨 Usamos punto y coma (;) como separador para Excel en español
        const separador = ";"; 
        
        // El carácter BOM (\uFEFF) ayuda a Excel a leer tildes y ñ correctamente
        let csvContent = "\uFEFF"; 
        
        // Nuevas cabeceras
        const headers = [
            "Emisión",
            "Programación",
            "Vencimiento",
            "Proveedor",
            "Tipo Documento",
            "Número Documento",
            "Descripción/Glosa",
            "Moneda",
            "Monto Base",
            "% Impuesto",
            "Total Final",
            "Estado",
            "Días Vencido",
            "Clasificación",
            "Banco",
            "N° Cuenta",
            "CCI",
            "Tiene Evidencia"
        ];
        csvContent += headers.join(separador) + "\n";

        // 3. Iterar y crear filas
        facturasData.forEach(f => {
            // --- Cálculo de Días Vencidos ---
            let diasVencidosTxt = '';
            if (f.fecha_vencimiento && f.estado_pago !== 'pagado') {
                const parts = f.fecha_vencimiento.split('-');
                const venc = new Date(parts[0], parts[1]-1, parts[2]); 
                const diffTime = hoy - venc; 
                const diasNum = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

                if (diasNum > 0) {
                    diasVencidosTxt = `${diasNum} días vencido`;
                } else {
                    diasVencidosTxt = 'Al día';
                }
            } else if (f.estado_pago === 'pagado') {
                diasVencidosTxt = '-';
            }

            // --- Extracción de Datos Protegidos ---
            const descripcion = f.descripcion ? `"${f.descripcion.replace(/"/g, '""')}"` : '""';
            const proveedor = f.proveedor ? `"${f.proveedor}"` : '"Sin Proveedor"';
            const banco = f.banco ? `"${f.banco}"` : '""';

            // 🚨 SOLUCIÓN NUEVA: Agregamos un tabulador invisible (\t) al final.
            // Obliga a Excel a tratarlo como texto puro, sin la molesta notación "E+" y sin mostrar el "=".
            const numeroDoc = f.numero_documento ? `"${f.numero_documento}\t"` : '""';
            const cuenta = f.numero_cuenta ? `"${f.numero_cuenta}\t"` : '""';
            const cci = f.cci ? `"${f.cci}\t"` : '""';

            // Manejo de valores nulos numéricos
            const base = f.base_imponible !== null ? f.base_imponible : (f.monto_neto_pagar || 0);
            const impuesto = f.porcentaje_detraccion !== null ? f.porcentaje_detraccion : 0;

            // Fila con todos los datos alineados a los headers
            const row = [
                f.fecha_emision ? f.fecha_emision.slice(0, 10) : '-',
                f.fecha_programacion ? f.fecha_programacion.slice(0, 10) : '-',
                f.fecha_vencimiento ? f.fecha_vencimiento.slice(0, 10) : '-',
                proveedor,
                f.tipo_documento || '-',
                numeroDoc,
                descripcion,
                f.moneda || 'PEN',
                parseFloat(base).toFixed(2).replace('.', ','),          // Base
                `${impuesto}%`,                                         // Impuesto
                parseFloat(f.monto_total).toFixed(2).replace('.', ','), // Total Final
                f.estado_pago ? f.estado_pago.toUpperCase() : '-',
                diasVencidosTxt,
                `"${f.categoria_gasto || '-'}"`,
                banco,
                cuenta,
                cci,
                f.evidencia_url ? "SÍ" : "NO"
            ];
            
            // Unimos la fila con el punto y coma
            csvContent += row.join(separador) + "\n";
        });

        // 4. Crear y Descargar Archivo (.csv)
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const link = document.createElement("a");
        link.setAttribute("href", url);
        const fechaStr = new Date().toISOString().slice(0,10);
        link.setAttribute("download", `Reporte_Gastos_${fechaStr}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        
        link.click();
        document.body.removeChild(link);
    };

    // =====================================================================
    // FASE 4: LÓGICA DEL SÚPER MODAL "VER", DOCUMENTOS Y FLUJO DE APROBACIÓN
    // =====================================================================

    // 1. ABRIR EL SÚPER MODAL Y LLENAR DATOS
    window.abrirModalDetallesVer = async function(id) {
        // Buscar la factura en nuestros datos cargados
        const factura = (typeof facturasData !== 'undefined' ? facturasData.find(f => f.id === id) : null) 
                    || (typeof cuentasData !== 'undefined' ? cuentasData.find(f => f.id === id) : null);
        
        if (!factura) {
            return showToast("Error: No se encontró la información de la factura.", "error");
        }

        // Llenar Pestaña "Información"
        document.getElementById('ver-modal-doc').innerText = `${factura.tipo_documento || 'Doc'} ${factura.numero_documento || ''}`;
        document.getElementById('ver-info-proveedor').innerText = factura.proveedor || 'Sin Proveedor';
        document.getElementById('ver-info-clasificacion').innerText = factura.categoria_gasto || 'Gasto General';
        
        document.getElementById('ver-info-emision').innerText = factura.fecha_emision ? factura.fecha_emision.slice(0, 10) : '-';
        document.getElementById('ver-info-vencimiento').innerText = factura.fecha_vencimiento ? factura.fecha_vencimiento.slice(0, 10) : '-';
        document.getElementById('ver-info-programacion').innerText = factura.fecha_programacion ? factura.fecha_programacion.slice(0, 10) : 'No programada';

        // Cálculos Monetarios
        const monedaSym = factura.moneda === 'USD' ? '$' : 'S/';
        const total = parseFloat(factura.monto_total || 0);
        const pagado = parseFloat(factura.monto_pagado || 0);
        const deuda = total - pagado;

        const fmt = (m) => `${monedaSym} ${m.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        
        document.getElementById('ver-info-total').innerText = fmt(total);
        document.getElementById('ver-info-pagado').innerText = fmt(pagado);
        document.getElementById('ver-info-deuda').innerText = fmt(deuda);

        // Datos Bancarios
        document.getElementById('ver-info-banco').innerText = factura.banco || 'No registrado';
        document.getElementById('ver-info-cuenta').innerText = factura.numero_cuenta || 'No registrado';
        document.getElementById('ver-info-cci').innerText = factura.cci || 'No registrado';

        // Guardar el ID de la factura activa en un campo oculto
        document.getElementById('ver-modal-factura-id').value = id;

        // Reiniciar las pestañas a la primera (Información)
        cambiarTabModalVer('info');

        // Mostrar el modal
        document.getElementById('modal-detalles-ver').classList.add('active');

        // Cargar asíncronamente los documentos y pagos desde el Backend
        cargarDocumentosExtra(id);
        cargarHistorialPagos(id);
    };

    // 2. CERRAR EL MODAL
    window.cerrarModalDetallesVer = function() {
        document.getElementById('modal-detalles-ver').classList.remove('active');
    };

    // 3. CAMBIAR PESTAÑAS DENTRO DEL MODAL
    window.cambiarTabModalVer = function(tabName) {
        // Ocultar todos los contenidos
        document.getElementById('tab-ver-info').style.display = 'none';
        document.getElementById('tab-ver-docs').style.display = 'none';
        document.getElementById('tab-ver-pagos').style.display = 'none';

        // Quitar la clase 'active' de todos los botones de pestaña
        document.querySelectorAll('#modal-detalles-ver .tab-btn').forEach(btn => btn.classList.remove('active'));

        // Mostrar la seleccionada
        document.getElementById(`tab-ver-${tabName}`).style.display = 'block';
        
        // Activar el botón correspondiente
        if(tabName === 'info') document.getElementById('btn-tab-ver-info').classList.add('active');
        if(tabName === 'docs') document.getElementById('btn-tab-ver-docs').classList.add('active');
        if(tabName === 'pagos') document.getElementById('btn-tab-ver-pagos').classList.add('active');
    };

    // 4. CARGAR HISTORIAL DE PAGOS
    window.cargarHistorialPagos = async function(id) {
        const tbody = document.getElementById('ver-tabla-pagos-body');
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Cargando pagos...</td></tr>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/facturas/${id}/pagos`, { headers: { 'x-auth-token': token } });
            const pagos = await res.json();

            tbody.innerHTML = '';
            if (pagos.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay pagos registrados aún.</td></tr>';
                return;
            }

            pagos.forEach(p => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>${p.fecha_creacion ? p.fecha_creacion.slice(0, 10) : '-'}</td>
                    <td style="font-weight:bold; color:#10b981;">S/ ${parseFloat(p.monto).toFixed(2)}</td>
                    <td><span class="badge bg-blue">${p.metodo_pago || 'Caja'}</span></td>
                    <td>${p.descripcion || '-'}</td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:red;">Error al cargar pagos.</td></tr>';
        }
    };

   // 5. CARGAR DOCUMENTOS EXTRA (ACTUALIZADO: Ícono de descarga y ajuste de texto)
    window.cargarDocumentosExtra = async function(id) {
        const tbody = document.getElementById('ver-tabla-docs-body');
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Cargando documentos...</td></tr>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/facturas/${id}/documentos`, { headers: { 'x-auth-token': token } });
            const docs = await res.json();

            tbody.innerHTML = '';
            if (docs.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No hay documentos adicionales adjuntos.</td></tr>';
                return;
            }

            docs.forEach(d => {
                const url = d.ruta_archivo.replace(/\\/g, '/');
                const urlLimpia = url.startsWith('/') ? url : `/${url}`;
                
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="max-width: 250px; white-space: normal; word-wrap: break-word; overflow-wrap: anywhere;">
                        <strong style="color: #1e293b;">${d.nombre_archivo}</strong><br>
                        <small style="color:#64748b; text-transform: uppercase; font-size: 0.75rem;">${d.tipo_documento}</small>
                    </td>
                    <td style="color: #475569;">${d.fecha_subida ? new Date(d.fecha_subida).toLocaleDateString() : '-'}</td>
                    <td style="text-align:center; white-space: nowrap;">
                        <a href="${urlLimpia}" target="_blank" class="btn-icon" style="color:#3b82f6; background:#eff6ff;" title="Descargar Documento">
                            <i class='bx bx-download'></i>
                        </a>
                        <button class="btn-icon" style="color:#ef4444; background:#fef2f2;" onclick="eliminarDocumentoExtra(${d.id}, ${id})" title="Eliminar">
                            <i class='bx bx-trash'></i>
                        </button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red;">Error al cargar documentos.</td></tr>';
        }
    };

    // 6. SUBIR NUEVO DOCUMENTO EXTRA
    window.ejecutarSubidaDocumentoExtra = async function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const facturaId = document.getElementById('ver-modal-factura-id').value;
        const token = localStorage.getItem('token');
        
        const formData = new FormData();
        formData.append('archivo', file);
        formData.append('tipo_documento', 'Comprobante Adicional');

        try {
            const res = await fetch(`/api/facturas/${facturaId}/documentos`, {
                method: 'POST',
                headers: { 'x-auth-token': token },
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                showToast("Documento subido con éxito", "success");
                cargarDocumentosExtra(facturaId); // Recargar la tabla de documentos
            } else {
                showToast(data.msg || "Error al subir documento", "error");
            }
        } catch (e) {
            console.error(e);
            showToast("Error de conexión al subir", "error");
        } finally {
            // Limpiar el input para permitir subir el mismo archivo si es necesario
            document.getElementById('input-subir-doc-extra').value = ''; 
        }
    };

    // 7. ELIMINAR DOCUMENTO EXTRA
    window.eliminarDocumentoExtra = function(docId, facturaId) {
        // 1. Guardar los IDs en el modal
        document.getElementById('delete-doc-id').value = docId;
        document.getElementById('delete-doc-factura-id').value = facturaId;
        
        // 2. Mostrar el modal de confirmación
        document.getElementById('modal-confirmar-eliminar-doc').classList.add('active');
    };

    window.cerrarModalEliminarDoc = function() {
        document.getElementById('modal-confirmar-eliminar-doc').classList.remove('active');
    };

    window.ejecutarEliminacionDoc = async function() {
        // Leer los IDs guardados
        const docId = document.getElementById('delete-doc-id').value;
        const facturaId = document.getElementById('delete-doc-factura-id').value;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/facturas/documentos/${docId}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': token }
            });

            if (res.ok) {
                showToast("Documento eliminado correctamente", "success");
                cerrarModalEliminarDoc(); // Ocultar el modal de confirmación
                cargarDocumentosExtra(facturaId); // Recargar la tablita de archivos
            } else {
                const data = await res.json();
                showToast(data.msg || "Error al eliminar el documento", "error");
                cerrarModalEliminarDoc();
            }
        } catch (e) {
            console.error(e);
            showToast("Error de conexión con el servidor", "error");
            cerrarModalEliminarDoc();
        }
    };

    // 8. FLUJO DE APROBACIÓN (CON MODAL ELEGANTE)
    window.cambiarEstadoFlujo = function(id, nuevoEstado) {
        // 1. Guardar datos en el modal
        document.getElementById('flujo-factura-id').value = id;
        document.getElementById('flujo-nuevo-estado').value = nuevoEstado;

        // 2. Personalizar visualmente el modal según la acción
        const icono = document.getElementById('flujo-modal-icon');
        const titulo = document.getElementById('flujo-modal-title');
        const texto = document.getElementById('flujo-modal-text');
        const boton = document.getElementById('flujo-modal-btn');

        if (nuevoEstado === 'programado') {
            icono.innerHTML = "<i class='bx bx-calendar-star'></i>";
            icono.style.color = "#f59e0b"; // Amarillo/Naranja
            titulo.innerText = "Programar Factura";
            texto.innerText = "¿Deseas PROGRAMAR esta factura? Pasará al estado de programación para que contabilidad la reciba.";
            boton.style.backgroundColor = "#f59e0b";
            boton.style.borderColor = "#f59e0b";
            boton.innerText = "Sí, Programar";
        } else if (nuevoEstado === 'pendiente') {
            icono.innerHTML = "<i class='bx bx-check-double'></i>";
            icono.style.color = "#8b5cf6"; // Morado
            titulo.innerText = "Aprobar para Pago";
            texto.innerText = "¿Confirmas la recepción y APROBACIÓN de esta factura para habilitar su pago?";
            boton.style.backgroundColor = "#8b5cf6";
            boton.style.borderColor = "#8b5cf6";
            boton.innerText = "Sí, Aprobar";
        }

        // 3. Mostrar el modal
        document.getElementById('modal-confirmar-flujo').classList.add('active');
    };

    // 8.1 CERRAR MODAL DE FLUJO
    window.cerrarModalFlujo = function() {
        document.getElementById('modal-confirmar-flujo').classList.remove('active');
    };

    // 8.2 EJECUTAR EL CAMBIO DE ESTADO EN BASE DE DATOS E INTERFAZ
    window.ejecutarCambioFlujo = async function() {
        const id = document.getElementById('flujo-factura-id').value;
        const nuevoEstado = document.getElementById('flujo-nuevo-estado').value;
        const boton = document.getElementById('flujo-modal-btn');
        
        const textoOriginal = boton.innerText;
        boton.innerText = "Procesando...";
        boton.disabled = true;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/facturas/${id}/estado`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                body: JSON.stringify({ nuevoEstado })
            });

            if (res.ok) {
                showToast(`Factura actualizada a: ${nuevoEstado.toUpperCase()}`, "success");
                cerrarModalFlujo();
                
                // ACTUALIZACIÓN VISUAL AL INSTANTE
                // Buscamos la factura en la memoria y le cambiamos el estado
                if(typeof cuentasData !== 'undefined') {
                    const index = cuentasData.findIndex(f => f.id == id);
                    if (index !== -1) cuentasData[index].estado_aprobacion = nuevoEstado;
                    renderizarTablaCuentas(); // Volvemos a dibujar la tabla de cuentas
                }
                if(typeof facturasData !== 'undefined') {
                    const indexGastos = facturasData.findIndex(f => f.id == id);
                    if (indexGastos !== -1) facturasData[indexGastos].estado_aprobacion = nuevoEstado;
                    if(typeof renderizarTablaGastos === 'function') renderizarTablaGastos(); // Dibujar tabla principal
                }
            } else {
                const data = await res.json();
                showToast(data.msg || "Error al cambiar estado", "error");
                cerrarModalFlujo();
            }
        } catch (e) {
            console.error(e);
            showToast("Error de conexión al servidor", "error");
            cerrarModalFlujo();
        } finally {
            boton.innerText = textoOriginal;
            boton.disabled = false;
        }
    };

    // ABRIR MODAL DE PAGO CON INFORMACIÓN EXTENDIDA
    window.abrirModalPagoExtendido = function(id, saldoPendiente, proveedor, documento, moneda) {
        // Rellenar la tarjeta informativa superior
        document.getElementById('pago-proveedor-txt').innerText = proveedor || 'Proveedor Desconocido';
        document.getElementById('pago-doc-txt').innerText = documento || 'S/N';
        
        const monedaSym = moneda === 'USD' ? '$' : 'S/';
        document.getElementById('pago-saldo-txt').innerText = `${monedaSym} ${parseFloat(saldoPendiente).toFixed(2)}`;

        // Rellenar los inputs del formulario
        document.getElementById('pago-ref-id').value = id;
        document.getElementById('pago-monto').value = parseFloat(saldoPendiente).toFixed(2); // Sugiere pagar el total por defecto
        
        // Fecha actual por defecto
        document.getElementById('pago-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('pago-operacion').value = '';

        // Mostrar modal
        document.getElementById('modal-pago').classList.add('active');
    };

    // INICIAR
    initModulo();

})();