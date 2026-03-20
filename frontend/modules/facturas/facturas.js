// Ubicación: frontend/modules/facturas/facturas.js
(function() {
    window.tesoreriaData = window.tesoreriaData || [];
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

    // 2.2 CAMBIAR TAB (ACTUALIZADO: Sincronización Triple de Tesorería)
    window.cambiarTab = async function(tabId) {
        // 1. Ocultar todos los tabs y desactivar estilos de botones
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

        // 2. Mostrar el tab seleccionado y activar su botón correspondiente
        const content = document.getElementById(tabId);
        if (content) content.classList.add('active');

        // Buscamos el botón por su atributo onclick para asegurar compatibilidad
        const btn = document.querySelector(`button[onclick*="cambiarTab('${tabId}')"]`);
        if (btn) btn.classList.add('active');

        // 3. Carga y Sincronización de Datos según el Tab
        try {
            if (tabId === 'tab-gastos') {
                // Recargamos el historial completo de facturas
                await cargarGastos(); 
            }
            
            if (tabId === 'tab-cuentas') {
                // Sincronización forzada: cargamos facturas base y luego procesamos cuentas
                await cargarGastos(); 
                if (typeof cargarCuentasPorPagar === 'function') await cargarCuentasPorPagar();
                // Actualizamos los KPIs superiores (Pagado hoy, Acumulado, Deuda Global)
                if (typeof cargarKpisPagos === 'function') await cargarKpisPagos(); 
            }

            // 🆕 LÓGICA PARA LA VENTANA DE TESORERÍA (PAGOS DE HOY)
            if (tabId === 'tab-tesoreria') {
                // Esta función carga tanto la tabla de pagos como los 3 bloques (Operativo, Imp, Fin)
                if (typeof cargarTesoriaDiaria === 'function') {
                    await cargarTesoriaDiaria();
                } else {
                    console.warn("⚠️ La función cargarTesoriaDiaria aún no ha sido cargada en el DOM.");
                }
            }
        } catch (error) {
            console.error(`❌ Error crítico al cambiar al tab ${tabId}:`, error);
            if (typeof showToast === 'function') {
                showToast("Error al sincronizar la vista. Verifique su conexión.", "error");
            }
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

    /**
     * Renderiza la tabla de historial de compras con filtros internos (Proveedor y N°).
     * Verificado para funcionar con el input onkeyup="renderizarTablaGastos(true)".
     * Sincronizado con la lógica de fechas de Cuentas por Pagar.
     */
    function renderizarTablaGastos(resetPagina = false) {
        const tbody = document.getElementById('tabla-facturas-body');
        if (!tbody) return;

        // 1. GESTIÓN DE PAGINACIÓN AL FILTRAR
        if (resetPagina) {
            paginaGastos = 1;
        }

        tbody.innerHTML = '';

        // 2. CAPTURA DE VALORES DE LOS BUSCADORES DE COLUMNA
        const filtroProv = (document.getElementById('buscador-proveedor-compras')?.value || '').toLowerCase().trim();
        const filtroNum = (document.getElementById('buscador-numero-compras')?.value || '').toLowerCase().trim();

        // 3. LÓGICA DE FILTRADO
        const filtrados = facturasData.filter(f => {
            const matchProv = (f.proveedor || '').toLowerCase().includes(filtroProv);
            const matchNum = (f.numero_documento || '').toLowerCase().includes(filtroNum);
            return matchProv && matchNum;
        });

        // 4. LÓGICA DE SEGMENTACIÓN (PAGINACIÓN)
        const inicio = (paginaGastos - 1) * FILAS_POR_PAGINA;
        const datosPagina = filtrados.slice(inicio, inicio + FILAS_POR_PAGINA);

        // Caso: No hay resultados
        if (datosPagina.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:40px; color: #64748b;">No se encontraron registros con los filtros aplicados.</td></tr>';
            const pagContainer = document.getElementById('facturas-paginacion');
            if (pagContainer) pagContainer.innerHTML = '';
            return;
        }

        // --- OBTENER FECHA ACTUAL (Normalizada a medianoche) ---
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        // 5. RENDERIZADO DE FILAS
        datosPagina.forEach(f => {
            const tr = document.createElement('tr');

            // --- 📅 CÁLCULO DE SEMÁFORO (Sincronizado con Cuentas) ---
            let diasVencidosHtml = '';
            
            if (f.estado_pago !== 'pagado') {
                // Parseo robusto de la fecha de vencimiento
                const parts = (f.fecha_vencimiento || "").split('-');
                if (parts.length === 3) {
                    const vence = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                    vence.setHours(0, 0, 0, 0);

                    const diffTime = vence.getTime() - hoy.getTime();
                    const diasMora = Math.round(diffTime / (1000 * 60 * 60 * 24));

                    if (diasMora < 0) {
                        const absDias = Math.abs(diasMora);
                        diasVencidosHtml = `<span class="badge" style="font-weight:900; padding: 5px 10px; border-radius: 4px; font-size: 0.65rem; background-color: #fee2e2; color: #dc2626;">${absDias} DÍAS VENC.</span>`;
                    } else if (diasMora <= 7) {
                        diasVencidosHtml = `<span class="badge" style="padding: 5px 10px; border-radius: 4px; font-size: 0.65rem; background-color: #fef9c3; color: #ca8a04;">⚠️ VENCE EN ${diasMora} DÍAS</span>`;
                    } else {
                        diasVencidosHtml = `<span class="badge" style="padding: 5px 10px; border-radius: 4px; font-size: 0.65rem; background-color: #dcfce7; color: #16a34a;">AL DÍA</span>`;
                    }
                } else {
                    diasVencidosHtml = '<span class="badge" style="color:#cbd5e1">S/V</span>';
                }
            } else {
                // Si ya está pagado, mostramos check verde
                diasVencidosHtml = '<span class="badge" style="padding: 5px 10px; border-radius: 4px; background-color: #dcfce7; color: #16a34a;font-size: 0.65rem"><i class="bx bx-check"></i></span>';
            }
            
            // --- BADGE DE ESTADO ---
            let estadoHtml = '';
            if(f.estado_pago === 'pagado') {
                estadoHtml = '<span class="badge" style="background-color: #dcfce7; color: #16a34a; padding: 4px 8px; border-radius: 4px; font-weight: 600;font-size: 0.65rem">PAGADO</span>';
            } else if(f.estado_pago === 'parcial') {
                estadoHtml = '<span class="badge" style="background-color: #fef9c3; color: #ca8a04; padding: 4px 8px; border-radius: 4px; font-weight: 600;font-size: 0.65rem">PARCIAL</span>';
            } else {
                estadoHtml = '<span class="badge" style="background-color: #fee2e2; color: #dc2626; padding: 4px 8px; border-radius: 4px; font-weight: 600;font-size: 0.65rem">PENDIENTE</span>';
            }

            // --- LÓGICA PREMIUM DEFINITIVA PARA EVIDENCIA (Frontend) ---
            let evidenciaHtml = `<button class="btn-icon" onclick="subirArchivoFaltante(${f.id}, this)" title="Subir PDF"><i class='bx bx-upload'></i></button>`;
            
            if (f.evidencia_url) {
                let urlFinal = f.evidencia_url;

                // 1. Detectamos si la URL es externa (Cloudinary empieza con http)
                if (urlFinal.startsWith('http')) {
                    // ES CLOUDINARY: No tocar nada de la base de datos, está lista.
                } else {
                    // ES ARCHIVO ANTIGUO (Path Local): Aplicamos la limpieza que ya tenías
                    // Limpiamos barras invertidas (\) y nos aseguramos de no prepender 'backend/'
                    // Asumimos que tu servidor sirve estáticos en /
                    urlFinal = urlFinal.replace(/\\/g, '/'); // Convierte \ a /
                    
                    // Si la URL empieza con /backend/, se la quitamos para que sea relativa al sitio
                    if (urlFinal.startsWith('/backend/')) {
                        urlFinal = urlFinal.replace('/backend/', '/');
                    } else if (urlFinal.startsWith('backend/')) {
                        urlFinal = urlFinal.replace('backend/', '/');
                    }
                }

                evidenciaHtml = `<a href="${urlFinal}" target="_blank" class="btn-icon" style="color:#e74c3c" title="Ver PDF"><i class='bx bxs-file-pdf'></i></a>`;
            }

            // --- CLASIFICACIÓN ---
            const clasif = f.clasificacion || 'Operativo';
            let colorClasif = '#3b82f6'; 
            if (clasif.toLowerCase().includes('implementaci')) colorClasif = '#8b5cf6';
            if (clasif.toLowerCase().includes('financiero')) colorClasif = '#f59e0b';

            tr.innerHTML = `
                <td>${f.fecha_emision ? f.fecha_emision.slice(0, 10) : '-'}</td>
                <td style="color:#6366f1; font-weight:500;">
                    ${f.fecha_programacion ? f.fecha_programacion.slice(0, 10) : '-'}
                </td>
                <td>${f.fecha_vencimiento ? f.fecha_vencimiento.slice(0, 10) : '-'}</td>
                <td style="font-weight:600; font-size: 0.65rem;">${f.proveedor || 'S/N'}</td>
                <td style="font-size: 0.65rem">${f.tipo_documento || 'Doc'} <br> <small style="color:#666">${f.numero_documento || '-'}</small></td>
                <td style="font-weight:bold; font-size: 0.65rem;">${f.moneda === 'USD' ? '$' : 'S/'} ${parseFloat(f.monto_total || 0).toFixed(2)}</td>
                <td style="font-size: 0.65rem">${estadoHtml}</td>
                <td style="text-align:center;font-size: 0.65rem;">${diasVencidosHtml}</td> 
                <td><span style="color:${colorClasif}; font-weight:700; font-size:0.65rem;">● ${clasif.toUpperCase()}</span></td>
                <td style="text-align:center">${evidenciaHtml}</td>
                <td>
                    <div class="action-buttons" style="display: flex; gap: 5px; justify-content: center; font-size: 0.65rem;">
                        <button class="btn-icon" style="color:#3b82f6; background:#eff6ff; font-size: 0.65rem;" onclick="abrirModalDetallesVer(${f.id})" title="Ver Detalles">
                            <i class='bx bx-show'></i>
                        </button>
                        <button class="btn-icon edit" style="color:#2563eb; background:#dbeafe; font-size: 0.65rem;" onclick="editarFactura(${f.id})" title="Editar"><i class='bx bx-edit'></i></button>
                        <button class="btn-icon delete" style="color:#dc2626; background:#fee2e2; font-size: 0.65rem;" onclick="eliminarFactura(${f.id})" title="Eliminar"><i class='bx bx-trash'></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // 6. ACTUALIZACIÓN DE COMPONENTE DE PAGINACIÓN
        renderizarPaginacion('facturas-paginacion', filtrados.length, paginaGastos, (p) => { 
            paginaGastos = p; 
            renderizarTablaGastos(); 
        });

        // 7. ALERTAS (Solo en la primera carga o página 1)
        if (paginaGastos === 1 && typeof verificarAlertasVencimiento === 'function') {
            verificarAlertasVencimiento(facturasData);
        }
    }

        // Variable global para manejar el estado del ordenamiento
    let ordenActual = { columna: null, direccion: 'asc' };

    async function cargarCuentasPorPagar() {
        // 1. Sincronizamos y filtramos: Solo pendientes que NO estén programados para hoy
        // Esto asegura que si se mueve a Tesorería, desaparezca de esta lista
        cuentasData = facturasData.filter(f => 
            f.estado_pago !== 'pagado' && 
            f.estado_pago !== 'anulado' && 
            f.programado_hoy === false
        );
        
        let totalPendienteGlobalPEN = 0;
        let totalPendienteGlobalUSD = 0;
        let totalVencidoPEN = 0;
        let totalVencidoUSD = 0;
        
        const hoy = new Date();
        hoy.setHours(0,0,0,0);

        cuentasData.forEach(c => {
            const total = parseFloat(c.monto_total || 0);
            const pagado = parseFloat(c.monto_pagado || 0);
            const saldo = (c.saldo_pendiente !== undefined) ? parseFloat(c.saldo_pendiente) : (total - pagado);

            // A. Acumuladores de Deuda Global por Moneda
            if (c.moneda === 'USD') {
                totalPendienteGlobalUSD += saldo;
            } else {
                totalPendienteGlobalPEN += saldo;
            }

            // B. Verificar vencimiento
            if (c.fecha_vencimiento) {
                const parts = c.fecha_vencimiento.split('-');
                const vence = new Date(parts[0], parts[1]-1, parts[2]);
                
                if (vence < hoy) {
                    if (c.moneda === 'USD') totalVencidoUSD += saldo;
                    else totalVencidoPEN += saldo;
                }
            }
        });
        
        // 2. Actualizar KPIs con formato de moneda (PEN y USD)
        const fmt = (m) => m.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        if (document.getElementById('kpi-total-pendiente-pen')) 
            document.getElementById('kpi-total-pendiente-pen').innerText = `S/ ${fmt(totalPendienteGlobalPEN)}`;
        if (document.getElementById('kpi-total-pendiente-usd')) 
            document.getElementById('kpi-total-pendiente-usd').innerText = `$ ${fmt(totalPendienteGlobalUSD)}`;
        
        if (document.getElementById('kpi-vencido-pen')) 
            document.getElementById('kpi-vencido-pen').innerText = `S/ ${fmt(totalVencidoPEN)}`;
        if (document.getElementById('kpi-vencido-usd')) 
            document.getElementById('kpi-vencido-usd').innerText = `$ ${fmt(totalVencidoUSD)}`;

        // 3. Redibujar la tabla
        if (typeof renderizarTablaCuentas === 'function') {
            renderizarTablaCuentas();
        }
    }

    window.exportarExcelCuentas = function() {
        if (!cuentasData || cuentasData.length === 0) {
            return showToast("No hay datos para exportar", "warning");
        }

        // Preparar los datos para Excel
        const reporte = cuentasData.map(c => ({
            'Vencimiento': c.fecha_vencimiento ? c.fecha_vencimiento.slice(0,10) : '',
            'Programación': c.fecha_programacion ? c.fecha_programacion.slice(0,10) : 'No prog.',
            'Proveedor': c.proveedor,
            'N° Documento': c.numero_documento,
            'Moneda': c.moneda,
            'Total': parseFloat(c.monto_total),
            'Amortizado': parseFloat(c.monto_pagado || 0),
            'Saldo Pendiente': parseFloat(c.saldo_pendiente),
            'Estado': (c.estado_pago || 'pendiente').toUpperCase()
        }));

        const worksheet = XLSX.utils.json_to_sheet(reporte);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Cuentas Por Pagar");

        // Guardar archivo
        const fecha = new Date().toISOString().slice(0,10);
        XLSX.writeFile(workbook, `Cuentas_Por_Pagar_${fecha}.xlsx`);
        showToast("Excel generado correctamente", "success");
    };

    window.ordenarCuentas = function(columna) {
        // Alternar dirección
        if (ordenActual.columna === columna) {
            ordenActual.direccion = ordenActual.direccion === 'asc' ? 'desc' : 'asc';
        } else {
            ordenActual.columna = columna;
            ordenActual.direccion = 'asc';
        }

        cuentasData.sort((a, b) => {
            let valA = a[columna];
            let valB = b[columna];

            // Lógica para fechas
            if (columna.includes('fecha')) {
                valA = new Date(valA || '1900-01-01');
                valB = new Date(valB || '1900-01-01');
            } 
            // Lógica para números
            else if (columna === 'monto_total' || columna === 'saldo_pendiente' || columna === 'amortizar') {
                valA = parseFloat(valA || 0);
                valB = parseFloat(valB || 0);
            }

            if (valA < valB) return ordenActual.direccion === 'asc' ? -1 : 1;
            if (valA > valB) return ordenActual.direccion === 'asc' ? 1 : -1;
            return 0;
        });

        renderizarTablaCuentas();
    };

    /**
     * 2.3 RENDERIZAR TABLA DE CUENTAS POR PAGAR (ACTUALIZADO: Indicador de Tesorería y Bloqueo de Duplicados)
     * Sincronizado visualmente y lógicamente con la tabla de Registro de Gastos.
     */
    function renderizarTablaCuentas() {
        const tbody = document.getElementById('tabla-cuentas-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // 1. Lógica de Paginación
        const inicio = (paginaCuentas - 1) * FILAS_POR_PAGINA;
        const datos = cuentasData.slice(inicio, inicio + FILAS_POR_PAGINA);

        // Caso: No hay datos
        if (datos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:30px; color:#64748b;">🎉 ¡Todo al día! No hay deudas pendientes por programar.</td></tr>';
            const pagContainer = document.getElementById('cuentas-paginacion');
            if (pagContainer) pagContainer.innerHTML = '';
            return;
        }

        // --- OBTENER FECHA ACTUAL (Normalizada a medianoche) ---
        const hoy = new Date();
        hoy.setHours(0, 0, 0, 0);

        datos.forEach(c => {
            const tr = document.createElement('tr');
            
            // --- 🔍 PASO 1: DETECTAR ESTADO EN TESORERÍA ---
            const enTesoreria = c.programado_hoy === true;

            // --- 📅 PASO 2: CÁLCULO DE SEMÁFORO (Sincronización Total y Blindada) ---
            let semaforo = '';
            
            // 🛡️ BLINDAJE: Verificamos si realmente existe la fecha_vencimiento
            if (c.fecha_vencimiento) {
                // Parseo seguro de fecha YYYY-MM-DD
                const parts = c.fecha_vencimiento.split('-');
                const vence = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                vence.setHours(0, 0, 0, 0);

                // Diferencia exacta en días
                const diffTime = vence.getTime() - hoy.getTime();
                const diasRestantes = Math.round(diffTime / (1000 * 60 * 60 * 24));
                
                if (diasRestantes < 0) {
                    // ROJO INTENSO SI ESTÁ VENCIDO
                    const diasVencidos = Math.abs(diasRestantes);
                    semaforo = `<span class="badge" style="font-weight:900; padding: 5px 10px; border-radius: 4px; font-size: 0.65rem; background-color: #fee2e2; color: #dc2626;">${diasVencidos} DÍAS VENC.</span>`;
                } else if (diasRestantes <= 7) {
                    // AMARILLO SI VENCE PRONTO
                    semaforo = `<span class="badge" style="padding: 5px 10px; border-radius: 4px; font-size: 0.65rem; background-color: #fef9c3; color: #ca8a04;">⚠️ VENCE EN ${diasRestantes} DÍAS</span>`;
                } else {
                    // VERDE SI ESTÁ AL DÍA
                    semaforo = `<span class="badge" style="padding: 5px 10px; border-radius: 4px; font-size: 0.65rem; background-color: #dcfce7; color: #16a34a;">AL DÍA</span>`;
                }
            } else {
                // 🛡️ Si la factura es antigua y no tiene fecha en la BD
                semaforo = `<span class="badge" style="padding: 5px 10px; border-radius: 4px; font-size: 0.65rem; background-color: #f1f5f9; color: #64748b;">SIN FECHA</span>`;
            }

            // Cálculos financieros
            const total = parseFloat(c.monto_total || 0);
            const acuenta = parseFloat(c.monto_pagado || 0);
            const saldo = parseFloat(c.saldo_pendiente || (total - acuenta));
            const monedaSym = c.moneda === 'USD' ? '$' : 'S/';

            // --- 🎨 PASO 3: BADGE VISUAL PARA TESORERÍA ---
            const badgeRevision = enTesoreria 
                ? `<br><span style="background: #eef2ff; color: #6366f1; border: 1px solid #c7d2fe; font-size: 10px; padding: 2px 6px; border-radius: 4px; margin-top: 4px; display: inline-block; font-weight: 700;">
                    <i class='bx bx-time-five'></i> EN TESORERÍA</span>` 
                : '';

            // --- 🛡️ PASO 4: BOTONES DE ACCIÓN (BLOQUEO SEGÚN ESTADO) ---
            const btnProgramarHoy = enTesoreria 
                ? `<button class="btn-icon" 
                    style="color:#cbd5e1; background:#f8fafc; border: 1px solid #e2e8f0; cursor: not-allowed;" 
                    title="Esta factura ya se encuentra en la lista de pagos de hoy">
                    <i class='bx bx-check-double'></i>
                </button>`
                : `<button class="btn-icon" 
                    style="color:#059669; background:#dcfce7; border: 1px solid #bbf7d0;" 
                    onclick="alternarProgramacionHoy(${c.id}, true)" 
                    title="Mover a Tesorería para pagar HOY">
                    <i class='bx bx-calendar-check'></i>
                </button>`;

            const btnVerDetalles = `
                <button class="btn-icon" 
                    style="color:#3b82f6; background:#eff6ff; border: 1px solid #dbeafe;" 
                    onclick="abrirModalDetallesVer(${c.id})" 
                    title="Ver Información y Documentos">
                    <i class='bx bx-show'></i>
                </button>`;

            // Construcción de la fila
            tr.innerHTML = `
                <td style="font-weight: 500;font-size: 0.65rem;">${c.fecha_vencimiento ? c.fecha_vencimiento.slice(0, 10) : '-'}</td>
                <td style="text-align:center;font-size: 0.65rem;">${semaforo}</td>
                <td style="color:#6366f1; font-weight:500;font-size: 0.65rem;">
                    ${c.fecha_programacion ? c.fecha_programacion.slice(0, 10) : '<small style="color:#cbd5e1">No prog.</small>'}
                </td>
                <td style="font-weight:600; color: #1e293b; font-size: 0.65rem;">${c.proveedor}</td>
                <td style="color: #64748b;">
                    ${c.numero_documento}
                    ${badgeRevision}
                </td>
                <td style="font-weight: 600;font-size: 0.65rem;">${monedaSym} ${total.toFixed(2)}</td>
                <td style="color:#10b981; font-weight: 500;font-size: 0.8rem;">${monedaSym} ${acuenta.toFixed(2)}</td>
                <td style="color:#ef4444; font-weight:bold; font-size: 0.85rem;">${monedaSym} ${saldo.toFixed(2)}</td>
                <td>
                    <div style="display: flex; gap: 10px; align-items: center; justify-content: center;font-size: 0.65rem;">
                        ${btnVerDetalles}
                        ${btnProgramarHoy}
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // 3. RENDERIZAR PAGINACIÓN
        renderizarPaginacion('cuentas-paginacion', cuentasData.length, paginaCuentas, (p) => { 
            paginaCuentas = p; 
            renderizarTablaCuentas(); 
        });

        // Actualizar estados visuales de ordenamiento si la función existe
        if (typeof actualizarVisualOrdenamiento === 'function') {
            actualizarVisualOrdenamiento();
        }
    }

    /**
     * Función auxiliar para resaltar visualmente qué columna está mandando
     */
    function actualizarVisualOrdenamiento() {
        if (!ordenActual.columna) return;
        
        // Quitamos la clase active de todos los iconos
        document.querySelectorAll('.premium-table th i').forEach(icon => {
            icon.style.color = '#cbd5e1';
        });

        // Buscamos el th que corresponde a la columna ordenada
        // Nota: El texto del TH debe coincidir o puedes usar un data-attribute
        const headers = document.querySelectorAll('.premium-table th');
        headers.forEach(th => {
            if (th.getAttribute('onclick')?.includes(`'${ordenActual.columna}'`)) {
                const icon = th.querySelector('i');
                if (icon) icon.style.color = '#3b82f6';
            }
        });
    }

    /**
     * Muestra u oculta los campos de impuesto personalizado
     */
    window.toggleImpuestoOtros = function() {
        const select = document.getElementById('fac-impuesto-porc');
        const container = document.getElementById('fac-otros-container');
        
        if (select.value === 'otros') {
            container.style.display = 'grid';
        } else {
            container.style.display = 'none';
            // Limpiamos el valor de otros para no crear confusión
            document.getElementById('fac-otros-porcentaje').value = '';
        }
    };

    /**
     * 🧮 CALCULAR TOTAL IMPUESTO
     * Soporte para: Base Gravada, Impuestos (Suma/Resta/Otros) y Múltiples Adicionales No Gravados.
     * Actualizado con manejo de precisión decimal y validación de contenedores.
     */
    window.calcularTotalImpuesto = function() {
        // 1. Capturar la Base Gravada (Monto que afecta el impuesto)
        const baseInput = document.getElementById('fac-base');
        if (!baseInput) return;
        const base = parseFloat(baseInput.value) || 0;
        
        // 2. Determinar Porcentaje y Tipo de Operación
        const impuestoSelect = document.getElementById('fac-impuesto-porc').value;
        let porcentaje = 0;
        let operacion = 'suma'; 

        if (impuestoSelect === 'otros') {
            // Valores desde los campos personalizados (fac-otros-container)
            const inputOtroPorc = document.getElementById('fac-otros-porcentaje');
            const inputOtroOper = document.getElementById('fac-otros-operacion');
            
            porcentaje = inputOtroPorc ? (parseFloat(inputOtroPorc.value) || 0) : 0;
            operacion = inputOtroOper ? inputOtroOper.value : 'suma';
        } else {
            // Valores desde el select estándar
            porcentaje = parseFloat(impuestoSelect) || 0;
            
            // Lógica de negocio específica: 
            // El 8% (Recibo por Honorarios) es tradicionalmente una Retención (Resta).
            if (porcentaje === 8) {
                operacion = 'resta';
            }
        }

        // 3. Calcular el monto del impuesto
        // Usamos redondeo a 4 decimales durante el cálculo para evitar errores de coma flotante
        const montoImpuesto = Math.round((base * (porcentaje / 100)) * 10000) / 10000;
        
        // 4. Calcular Subtotal (Base con el impuesto aplicado)
        let subtotalConImpuesto = 0;
        if (operacion === 'resta') {
            subtotalConImpuesto = base - montoImpuesto;
        } else {
            subtotalConImpuesto = base + montoImpuesto;
        }

        // 5. Sumar todos los Adicionales No Gravados (Dinamismo)
        let sumaAdicionales = 0;
        const inputsMontoAdicional = document.querySelectorAll('.adicional-monto');
        
        inputsMontoAdicional.forEach(input => {
            const valor = parseFloat(input.value) || 0;
            sumaAdicionales += valor;
        });

        // 6. Resultado Final
        // Sumamos el subtotal (Base +/- Impuesto) + los adicionales (Envío, Propinas, etc.)
        const totalFinal = subtotalConImpuesto + sumaAdicionales;
        
        // 7. Actualizar la Interfaz de Usuario
        const campoTotal = document.getElementById('fac-total-final');
        if (campoTotal) {
            // Mostramos 2 decimales fijos
            campoTotal.value = totalFinal.toFixed(2);
            
            // Mejora visual: Si el total es negativo (error de entrada), ponerlo en rojo
            if (totalFinal < 0) {
                campoTotal.style.color = "#ef4444";
            } else {
                campoTotal.style.color = "#0f172a";
            }
        }

        // Depuración en consola (útil para verificar cálculos rápidos)
        console.log(`[Cálculo] Base: ${base.toFixed(2)} | %: ${porcentaje} (${operacion}) | Impuesto: ${montoImpuesto.toFixed(2)} | Adicionales: ${sumaAdicionales.toFixed(2)} | Total: ${totalFinal.toFixed(2)}`);
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

    /**
     * 💾 GUARDAR FACTURA 
     * Actualizado: Soporte para múltiples adicionales (JSONB), operación de impuesto (suma/resta) 
     * y sincronización total con el backend.
     */
    async function guardarFactura() {
        // 1. Obtener IDs y valores básicos
        const id = document.getElementById('fac-id').value;
        const proveedorId = document.getElementById('fac-proveedor').value;
        const totalCalculado = document.getElementById('fac-total-final').value;
        
        // 🛡️ CORRECCIÓN PARA CLASIFICACIÓN
        const selectClasif = document.getElementById('fac-clasificacion');
        let clasificacion = (selectClasif && selectClasif.value.trim() !== "") 
                            ? selectClasif.value 
                            : "Operativo"; 

        // 2. Validaciones básicas
        if (!proveedorId) return showToast("Seleccione un proveedor", "warning");
        if (!totalCalculado || parseFloat(totalCalculado) <= 0) {
            return showToast("El monto total no es válido", "warning");
        }

        // 3. UI: Bloquear botón para evitar duplicados
        const btn = document.querySelector('#modal-factura button.btn-primary') || 
                    document.querySelector('#modal-factura button[onclick="guardarFactura()"]');
        const txtOriginal = btn ? btn.innerText : "Guardar Compra";
        
        // 🔥 NUEVO: Activar la pantalla de carga (Bloquea todo)
        const loadingOverlay = document.getElementById('loading-overlay');
        if (loadingOverlay) loadingOverlay.style.display = 'flex';

        if(btn) { 
            btn.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Guardando...`; // Se ve más pro
            btn.disabled = true; 
        }

        // 4. Preparar datos para enviar (FormData)
        const formData = new FormData();
        
        // --- 🚨 NORMALIZACIÓN DE CLASIFICACIÓN 🚨 ---
        // Aseguramos que 'Implementacion' siempre lleve tilde para la base de datos
        if (clasificacion.toLowerCase().includes('implement')) {
            clasificacion = 'Implementación';
        } else if (clasificacion.toLowerCase().includes('financier')) {
            clasificacion = 'Financiero';
        } else {
            clasificacion = 'Operativo';
        }
        
        formData.append('proveedorId', proveedorId); 
        formData.append('sede', document.getElementById('fac-sede').value);
        formData.append('clasificacion', clasificacion); 
        formData.append('glosa', document.getElementById('fac-glosa').value);
        formData.append('categoria', document.getElementById('fac-linea').value); 
        
        const tipoDoc = document.getElementById('fac-tipo').value;
        formData.append('tipo', tipoDoc);

        // Lógica de número de documento (Serie-Número o Único)
        let numeroDocumentoFinal = '';
        if (tipoDoc === 'Factura' || tipoDoc === 'Boleta' || tipoDoc === 'RHE') {
            const serie = document.getElementById('fac-serie').value.trim().toUpperCase() || 'F001';
            const correlativo = document.getElementById('fac-numero').value.trim() || '000000';
            numeroDocumentoFinal = `${serie}-${correlativo}`;
        } else {
            const docUnico = document.getElementById('fac-doc-unico');
            numeroDocumentoFinal = docUnico ? docUnico.value.trim() : 'S/N';
        }
        formData.append('serie', numeroDocumentoFinal);

        // Fechas
        formData.append('emision', document.getElementById('fac-emision').value);
        formData.append('programacion', document.getElementById('fac-programacion').value); 
        formData.append('vencimiento', document.getElementById('fac-vencimiento').value);
        
        // --- MONTOS E IMPUESTOS ---
        formData.append('moneda', document.getElementById('fac-moneda').value);
        const montoBase = document.getElementById('fac-base').value || "0";
        formData.append('monto_base', montoBase); 
        
        const impuestoSelect = document.getElementById('fac-impuesto-porc').value;
        let impuestoFinal = 0;
        let operacionImpuesto = 'suma';

        if (impuestoSelect === 'otros') {
            impuestoFinal = document.getElementById('fac-otros-porcentaje').value || "0";
            operacionImpuesto = document.getElementById('fac-otros-operacion').value;
        } else {
            impuestoFinal = impuestoSelect;
            if (parseFloat(impuestoSelect) === 8) operacionImpuesto = 'resta';
        }

        formData.append('impuesto_porcentaje', impuestoFinal); 
        formData.append('operacion_impuesto', operacionImpuesto);

        // --- ADICIONALES DINÁMICOS ---
        const adicionales = [];
        document.querySelectorAll('.fila-adicional').forEach(fila => {
            const inputGlosa = fila.querySelector('.adicional-glosa');
            const inputMonto = fila.querySelector('.adicional-monto');
            
            if (inputGlosa && inputMonto) {
                const glosaAdj = inputGlosa.value.trim();
                const montoAdj = parseFloat(inputMonto.value) || 0;
                if (montoAdj !== 0) {
                    adicionales.push({ glosa: glosaAdj, monto: montoAdj });
                }
            }
        });

        formData.append('adicionales', JSON.stringify(adicionales));
        formData.append('total', totalCalculado); 

        // Datos Bancarios
        formData.append('banco', document.getElementById('fac-banco').value);
        formData.append('cuenta', document.getElementById('fac-cuenta').value);
        formData.append('cci', document.getElementById('fac-cci').value);

        // Forma de pago
        const checkPago = document.getElementById('check-pagar-ahora');
        formData.append('formaPago', (checkPago && checkPago.checked) ? 'Contado' : 'Credito');

        // Archivo Adjunto
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

            // 🛡️ Manejo del error asíncrono: validamos si la respuesta es JSON
            const contentType = res.headers.get("content-type");
            let data = {};
            if (contentType && contentType.indexOf("application/json") !== -1) {
                data = await res.json();
            }

            if (res.ok) {
                showToast(id ? "✅ Gasto actualizado con éxito" : "✅ Gasto registrado con éxito", "success");
                
                // Cerrar modal de forma segura
                if (typeof cerrarModalFactura === 'function') {
                    cerrarModalFactura();
                } else {
                    const modal = document.getElementById('modal-factura');
                    if (modal) modal.classList.remove('active');
                }
                
                // 🔄 Recargar datos (con protecciones try/catch individuales)
                try { if (typeof cargarGastos === 'function') await cargarGastos(); } catch(e) {}
                try { if (window.cargarCuentasPorPagar) await window.cargarCuentasPorPagar(); } catch(e) {}
                try { if (window.cargarTesoriaDiaria) await window.cargarTesoriaDiaria(); } catch(e) {}
                
            } else {
                showToast(data.msg || "Error al procesar la solicitud", "error");
            }
        } catch (e) {
            console.error("Error en guardarFactura:", e);
            showToast("Error de conexión con el servidor", "error");
        } finally {
            // 🔥 NUEVO: Apagar la pantalla de carga (Libera el sistema)
            if (loadingOverlay) loadingOverlay.style.display = 'none';

            if(btn) { 
                btn.innerText = txtOriginal; 
                btn.disabled = false; 
            }
        }
    }

    /**
     * ➕ AGREGAR FILA ADICIONAL
     * Crea dinámicamente campos para montos no gravados (propinas, envíos, etc).
     * @param {string} glosa - Texto para el concepto (se usa al cargar datos en edición).
     * @param {number|string} monto - Valor numérico (se usa al cargar datos en edición).
     */
    window.agregarFilaAdicional = function(glosa = '', monto = '') {
        const contenedor = document.getElementById('contenedor-adicionales');
        
        // 1. Verificación de seguridad
        if (!contenedor) {
            console.error("No se encontró el contenedor 'contenedor-adicionales'");
            return;
        }

        // 2. Normalización de valores (Evita errores en los cálculos)
        // Si el monto viene como string vacío o null, aseguramos que sea manejable
        const montoLimpio = (monto !== '' && monto !== null) ? parseFloat(monto).toFixed(2) : '';

        // 3. Crear el elemento fila
        const nuevaFila = document.createElement('div');
        nuevaFila.className = 'fila-adicional';
        
        // Estilos de diseño (Grid coincidente con los encabezados)
        nuevaFila.style.display = 'grid';
        nuevaFila.style.gridTemplateColumns = '2fr 1fr auto';
        nuevaFila.style.gap = '10px';
        nuevaFila.style.marginBottom = '8px';
        nuevaFila.style.alignItems = 'center';

        // 4. Estructura HTML
        // Usamos 'static' en el label si existe valor para evitar que el label flote sobre el texto.
        const labelClass = (glosa !== '' || montoLimpio !== '') ? 'static' : '';

        nuevaFila.innerHTML = `
            <div class="input-group" style="margin-bottom: 0;">
                <input type="text" 
                    class="adicional-glosa" 
                    placeholder="Ej: Propina, Envío, Redondeo..." 
                    value="${glosa}"
                    style="width: 100%;">
                <label class="${labelClass}">Descripción</label>
            </div>
            
            <div class="input-group" style="margin-bottom: 0;">
                <input type="number" 
                    class="adicional-monto" 
                    placeholder="0.00" 
                    step="0.01" 
                    value="${montoLimpio}"
                    oninput="if(typeof calcularTotalImpuesto === 'function') calcularTotalImpuesto()" 
                    style="width: 100%; text-align: right;">
                <label class="${labelClass}">Monto</label>
            </div>

            <button type="button" 
                    class="btn-eliminar-adicional"
                    title="Eliminar concepto"
                    onclick="this.parentElement.remove(); if(typeof calcularTotalImpuesto === 'function') calcularTotalImpuesto();" 
                    style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:1.4rem; display: flex; align-items: center; justify-content: center; padding: 5px; transition: transform 0.2s;"
                    onmouseover="this.style.transform='scale(1.1)'"
                    onmouseout="this.style.transform='scale(1)'">
                <i class='bx bx-trash'></i>
            </button>
        `;

        // 5. Agregar al DOM
        contenedor.appendChild(nuevaFila);

        // 6. Gestión de Focus
        // Si la fila es nueva (manual), ponemos el cursor en la descripción
        if (glosa === '') {
            const inputGlosa = nuevaFila.querySelector('.adicional-glosa');
            if (inputGlosa) {
                // Un pequeño delay asegura que el navegador procese el render antes del focus
                setTimeout(() => inputGlosa.focus(), 10);
            }
        }
        
        // 7. Sincronización Matemática
        // Forzamos el recálculo para que el total final siempre sea coherente
        if (typeof calcularTotalImpuesto === 'function') {
            calcularTotalImpuesto();
        }
    };

    // --- GESTIÓN DE PAGOS (ACTUALIZADO: Sincronización de IDs y Descripciones) ---
    window.abrirModalPago = function(tipo, idRef, saldoPendiente, nombreEntidad = '', detalleCuota = '') {
        // 1. Guardar referencias ocultas
        // Seteamos 'pago-factura-id' para que window.confirmarPago lo encuentre sin errores
        const inputIdRef = document.getElementById('pago-factura-id') || document.getElementById('pago-ref-id');
        if (inputIdRef) {
            inputIdRef.value = idRef;
        }

        const inputTipo = document.getElementById('pago-tipo-origen');
        if (inputTipo) {
            inputTipo.value = tipo;
        }
        
        // 2. Pre-llenar monto y fecha
        const inputMonto = document.getElementById('pago-monto');
        if (inputMonto) {
            inputMonto.value = parseFloat(saldoPendiente).toFixed(2);
        }
        
        const inputFecha = document.getElementById('pago-fecha');
        if (inputFecha) {
            inputFecha.valueAsDate = new Date();
        }
        
        // 3. Generar Descripción Dinámica
        let descripcion = "";
        
        if (tipo === 'GASTO') {
            // Buscamos en facturasData o tesoreriaData según lo que esté disponible
            const listaBusqueda = (typeof facturasData !== 'undefined') ? facturasData : (window.tesoreriaData || []);
            const fac = listaBusqueda.find(f => f.id == idRef);
            
            if (fac) {
                descripcion = `Pagando a: <b>${fac.proveedor || fac.proveedor_nombre || 'Proveedor'}</b><br>
                            <small>Doc: ${fac.numero_documento || fac.serie || 'S/N'}</small><br>
                            <span class="text-primary">Saldo: ${parseFloat(saldoPendiente).toFixed(2)}</span>`;
            } else if (nombreEntidad) {
                descripcion = `Pagando a: <b>${nombreEntidad}</b><br><small>Ref: ${idRef}</small>`;
            } else {
                descripcion = "Pagando Factura / Gasto Seleccionado";
            }
        } else if (tipo === 'PRESTAMO') {
            descripcion = `Amortización de Préstamo: <b>${nombreEntidad}</b><br><small>${detalleCuota}</small>`;
        }

        const txtDesc = document.getElementById('pago-descripcion-txt');
        if (txtDesc) {
            txtDesc.innerHTML = descripcion;
        }
        
        // 4. Mostrar Modal (Compatibilidad con clases manuales y Bootstrap)
        const modalPago = document.getElementById('modal-pago') || document.getElementById('modal-registro-pago');
        
        if (modalPago) {
            modalPago.classList.add('active'); // Para estilos personalizados
            
            // Si usas Bootstrap 5, forzamos la apertura
            if (typeof bootstrap !== 'undefined') {
                let inst = bootstrap.Modal.getInstance(modalPago);
                if (!inst) inst = new bootstrap.Modal(modalPago);
                inst.show();
            }
        } else {
            console.error("❌ No se encontró el modal de pago en el DOM");
            showToast("Error al abrir el panel de pago", "error");
        }
    };

    // --- 5. CONFIRMAR PAGO (MODAL) - VERSIÓN FINAL SINCRONIZADA ---
    window.confirmarPago = async function() {
        // 1. Obtener valores del DOM (Priorizando el ID real de tu HTML: pago-ref-id)
        const elId = document.getElementById('pago-ref-id') || 
                    document.getElementById('pago-factura-id') || 
                    document.getElementById('pago-id');

        const idRef = elId?.value;
        const tipo = document.getElementById('pago-tipo-origen')?.value || 'GASTO'; 
        const monto = document.getElementById('pago-monto')?.value;
        const metodo = document.getElementById('pago-metodo')?.value;
        const fecha = document.getElementById('pago-fecha')?.value;
        const operacion = document.getElementById('pago-operacion')?.value;

        // 2. Validaciones de entrada y Depuración Crítica
        if (!idRef || idRef === "" || idRef === "undefined") {
            console.error("❌ Error de DOM: No se encontró el ID de referencia. IDs probados: pago-ref-id, pago-factura-id");
            return showToast("No se detectó el ID de la factura. Reintente abrir el modal.", "error");
        }
        
        if (!monto || parseFloat(monto) <= 0) {
            return showToast("Ingrese un monto válido", "warning");
        }
        
        if (!fecha) {
            return showToast("Seleccione una fecha de pago", "warning");
        }

        // 3. UI: Bloquear botón para evitar duplicidad de transacciones
        const btn = document.querySelector('#modal-pago .btn-primary') || 
                    document.querySelector('#modal-registro-pago .btn-primary') ||
                    document.querySelector('button[onclick="confirmarPago()"]');

        let txtOriginal = "Confirmar Pago";
        
        if (btn) {
            txtOriginal = btn.innerHTML; // Guardamos HTML por si tiene iconos
            btn.disabled = true; 
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Procesando...";
        }

        try {
            const token = localStorage.getItem('token');
            
            // Definir URL del endpoint según el tipo de origen
            const url = tipo === 'GASTO' 
                ? `/api/facturas/pago/${idRef}` 
                : `/api/facturas/prestamos/amortizar/${idRef}`;
            
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
                    // redundancia para compatibilidad de controladores
                    fecha_pago: fecha, 
                    metodo_pago: metodo,
                    descripcion: operacion ? `Operación: ${operacion}` : 'Pago de Factura'
                })
            });

            const data = await res.json();

            if (res.ok) {
                showToast("✅ Pago registrado y saldos actualizados", "success");
                
                // --- 🔄 CIERRE DE MODAL ---
                const modalPago = document.getElementById('modal-pago') || document.getElementById('modal-registro-pago');
                if (modalPago) {
                    modalPago.classList.remove('active');
                    // Si el modal usa inline styles de display
                    if (modalPago.style.display === 'flex' || modalPago.style.display === 'block') {
                        modalPago.style.display = 'none';
                    }
                    // Limpieza de Bootstrap si aplica
                    if (typeof bootstrap !== 'undefined') {
                        const inst = bootstrap.Modal.getInstance(modalPago);
                        if (inst) inst.hide();
                    }
                }
                
                // --- 🔄 ACTUALIZACIÓN INTEGRAL DE LA INTERFAZ ---
                if (tipo === 'GASTO') { 
                    // 1. Limpiar estado de aprobación local en tesorería para evitar "fantamas" visuales
                    if (window.tesoreriaData && Array.isArray(window.tesoreriaData)) {
                        const facturaIdx = window.tesoreriaData.findIndex(f => f.id == idRef);
                        if (facturaIdx !== -1) {
                            window.tesoreriaData[facturaIdx].aprobado_tesoreria = false;
                            window.tesoreriaData[facturaIdx].monto_aprobado = 0;
                        }
                    }

                    // 2. Ejecutar recargas de datos (solo si las funciones existen)
                    const promesas = [];
                    if (typeof cargarGastos === 'function') promesas.push(cargarGastos()); 
                    if (typeof window.cargarTesoriaDiaria === 'function') promesas.push(window.cargarTesoriaDiaria());
                    if (typeof cargarCuentasPorPagar === 'function') promesas.push(cargarCuentasPorPagar());
                    if (typeof cargarKpisPagos === 'function') promesas.push(cargarKpisPagos());
                    
                    await Promise.all(promesas);
                }

                if (tipo === 'PRESTAMO') {
                    if (typeof cargarPrestamos === 'function') await cargarPrestamos();
                }

            } else {
                showToast(data.msg || "Error al procesar el pago", "error");
            }
        } catch (e) {
            console.error("❌ Error fatal en confirmarPago:", e);
            showToast("Error de conexión con el servidor", "error");
        } finally {
            if(btn) {
                btn.disabled = false; 
                btn.innerHTML = txtOriginal; 
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

    /**
     * Edición: Cargar datos en el modal para editar 
     * (ACTUALIZADO: Clasificación, Tesorería, Adicionales e Impuestos Personalizados)
     */
    async function editarFactura(id) {
        // Buscamos la factura en el set de datos actual
        const factura = facturasData.find(f => f.id === id);
        if (!factura) {
            console.error("No se encontró la factura con ID:", id);
            return;
        }

        // Seteamos el ID oculto para el modo edición
        const inputId = document.getElementById('fac-id');
        if (inputId) inputId.value = factura.id;
        
        // Abrir modal visualmente
        const modal = document.getElementById('modal-factura');
        if (modal) modal.classList.add('active');

        // Usamos un delay ligeramente mayor para asegurar renderizado de componentes complejos
        setTimeout(() => {
            // 1. Datos de Identificación y Sede
            const setVal = (id, val) => {
                const el = document.getElementById(id);
                if (el) el.value = val || '';
            };

            setVal('fac-proveedor', factura.proveedor_id);
            setVal('fac-sede', factura.sede_id);
            setVal('fac-glosa', factura.descripcion);
            
            // --- 🛡️ CARGA CRÍTICA: CLASIFICACIÓN ---
            const inputClasificacion = document.getElementById('fac-clasificacion');
            if (inputClasificacion) {
                // Normalizamos para asegurar que coincida con el value del <option>
                let clasif = factura.clasificacion || 'Operativo';
                // Si viene con tilde desde la BD ("Implementación"), normalizamos a "Implementacion" para el select
                if (clasif === 'Implementación') clasif = 'Implementacion';
                inputClasificacion.value = clasif;
            }

            const comboLinea = document.getElementById('fac-linea');
            if (comboLinea) comboLinea.value = factura.categoria_gasto || '';

            // 2. Lógica del Documento
            const tipoDoc = factura.tipo_documento || 'Factura';
            setVal('fac-tipo', tipoDoc);

            // Ejecutamos la función visual para mostrar los inputs correctos (Serie/Correlativo o Único)
            if (typeof toggleInputsDocumento === 'function') toggleInputsDocumento();

            const docCompleto = factura.numero_documento || ''; 

            if (tipoDoc === 'Factura' || tipoDoc === 'Boleta' || tipoDoc === 'RHE') {
                let serieVal = '';
                let numeroVal = '';
                
                if (docCompleto.includes('-')) {
                    const partes = docCompleto.split('-');
                    serieVal = partes[0]; 
                    numeroVal = partes.slice(1).join('-'); 
                } else {
                    numeroVal = docCompleto;
                }
                
                setVal('fac-serie', serieVal);
                setVal('fac-numero', numeroVal);
            } else {
                const inputUnico = document.getElementById('fac-doc-unico');
                if (inputUnico) inputUnico.value = docCompleto;
            }

            // 3. Fechas (Normalización YYYY-MM-DD)
            setVal('fac-emision', factura.fecha_emision ? factura.fecha_emision.slice(0, 10) : '');
            setVal('fac-vencimiento', factura.fecha_vencimiento ? factura.fecha_vencimiento.slice(0, 10) : '');
            
            const inputProg = document.getElementById('fac-programacion');
            if (inputProg) {
                inputProg.value = factura.fecha_programacion ? factura.fecha_programacion.slice(0, 10) : '';
            }

            // 4. Datos Financieros (Base e Impuestos)
            setVal('fac-moneda', factura.moneda || 'PEN');
            
            const base = factura.base_imponible !== null ? factura.base_imponible : (factura.monto_neto_pagar || 0); 
            const inputBase = document.getElementById('fac-base');
            if (inputBase) inputBase.value = parseFloat(base).toFixed(2);

            // --- 🚨 LÓGICA DE IMPUESTO (Soporte para estándar y 'Otros') 🚨 ---
            const selectImpuesto = document.getElementById('fac-impuesto-porc');
            const containerOtros = document.getElementById('fac-otros-container'); 
            
            if (selectImpuesto) {
                let impuestoVal = factura.porcentaje_detraccion !== null ? parseFloat(factura.porcentaje_detraccion).toString() : "0";
                const valoresEstandar = ["0", "18", "10.5", "8"];

                if (valoresEstandar.includes(impuestoVal)) {
                    selectImpuesto.value = impuestoVal;
                    if (containerOtros) containerOtros.style.display = 'none';
                } else {
                    selectImpuesto.value = 'otros';
                    if (containerOtros) containerOtros.style.display = 'grid'; 
                    
                    const inputOtroPorcentaje = document.getElementById('fac-otros-porcentaje');
                    const inputOtroOperacion = document.getElementById('fac-otros-operacion');
                    
                    if (inputOtroPorcentaje) inputOtroPorcentaje.value = impuestoVal;
                    if (inputOtroOperacion) inputOtroOperacion.value = factura.operacion_impuesto || 'suma';
                }
            }

            // --- 🚨 CARGAR ADICIONALES NO GRAVADOS (Dinamismo) 🚨 ---
            const contenedorAdicionales = document.getElementById('contenedor-adicionales');
            if (contenedorAdicionales) {
                contenedorAdicionales.innerHTML = ''; // Limpiar filas previas

                const itemsAdicionales = (typeof factura.adicionales === 'string') 
                    ? JSON.parse(factura.adicionales) 
                    : (factura.adicionales || []);

                if (Array.isArray(itemsAdicionales) && itemsAdicionales.length > 0) {
                    itemsAdicionales.forEach(item => {
                        if (window.agregarFilaAdicional) {
                            window.agregarFilaAdicional(item.glosa, item.monto);
                        }
                    });
                } else {
                    // Si no hay adicionales, cargamos una fila vacía por defecto
                    if (window.agregarFilaAdicional) window.agregarFilaAdicional();
                }
            }

            // 5. Datos Bancarios
            setVal('fac-banco', factura.banco);
            setVal('fac-cuenta', factura.numero_cuenta);
            setVal('fac-cci', factura.cci);

            // 6. Sincronizar Total Final
            // Recalcular todo el presupuesto del modal (Base + Impuesto +/- Adicionales)
            if (window.calcularTotalImpuesto) {
                window.calcularTotalImpuesto();
            }

            // 7. Lógica del Check de Pago
            const checkPago = document.getElementById('check-pagar-ahora');
            if (checkPago) {
                // Si ya está pagado o autorizado en tesorería, protegemos el estado
                const yaPagado = factura.estado_pago === 'pagado' || factura.forma_pago === 'Contado';
                checkPago.checked = yaPagado;
                checkPago.disabled = yaPagado; 
            }

        }, 200); // Tiempo ajustado para asegurar estabilidad del DOM
    }
    
    async function subirArchivoFaltante(id, btnElement = null) {
        const input = document.getElementById('fac-archivo');
        document.getElementById('fac-id').value = id; 
        
        // 💡 TRUCO: Limpiamos el input antes de hacer clic. 
        // Así, si el usuario selecciona el mismo archivo, el evento 'change' se dispara de todos modos.
        input.value = ''; 
        input.click();
        
        // El evento onchange del input manejará la subida
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return; // Si cancela la ventana, no hace nada
            
            // 1. --- ⏳ EFECTO VISUAL DE CARGA ---
            const originalText = btnElement ? btnElement.innerHTML : '';
            if (btnElement) {
                btnElement.disabled = true;
                btnElement.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Subiendo...`;
                btnElement.style.fontSize = '0.68rem'
                btnElement.style.opacity = '0.6';
                btnElement.style.cursor = 'wait';
            } else {
                // Si no nos pasan el botón, usamos tu sistema de Toasts
                showToast("⏳ Subiendo a la nube, por favor espere...", "info");
            }
            
            const formData = new FormData();
            formData.append('archivo', file);
            
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`/api/facturas/upload/${id}`, {
                    method: 'POST',
                    headers: { 'x-auth-token': token },
                    body: formData
                });
                
                if (res.ok) {
                    showToast("✅ Archivo subido exitosamente", "success");
                    cargarGastos(); // Recarga la tabla para que el botón cambie a "Ver"
                } else {
                    const errorData = await res.json();
                    showToast("❌ Error al subir: " + (errorData.msg || "Desconocido"), "error");
                }
            } catch (error) {
                console.error("Error en la subida:", error);
                showToast("❌ Error de conexión con el servidor", "error");
            } finally {
                // 2. --- 🔄 RESTAURAR BOTÓN (en caso de error) ---
                if (btnElement) {
                    btnElement.disabled = false;
                    btnElement.innerHTML = originalText;
                    btnElement.style.opacity = '1';
                    btnElement.style.cursor = 'pointer';
                }
            }
        };
    }
    
    // 🆕 LÓGICA VISUAL: CAMBIAR INPUTS SEGÚN TIPO DOC
    window.toggleInputsDocumento = function() {
        const tipo = document.getElementById('fac-tipo').value;
        const bloqueDoble = document.getElementById('bloque-doble-input');
        const bloqueUnico = document.getElementById('bloque-unico-input');

        // Si es Factura o Boleta -> Mostrar 2 inputs
        if (tipo === 'Factura' || tipo === 'Boleta'|| tipo === 'RHE') {
            bloqueDoble.style.display = 'contents'; // Mantiene el grid
            bloqueUnico.style.display = 'none';
        } else {
            // Invoice, Sin Documento -> Mostrar 1 input
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

    /**
     * --- EXPONER FUNCIONES AL HTML (WINDOW) ---
     * Centraliza todas las funciones necesarias para los eventos onclick="" del HTML.
     * Incluye limpieza de datos, gestión de estados de aprobación y confirmaciones por modal.
     */
    function exposeGlobalFunctions() {
        // 1. Gestión Básica de Facturas y CRUD
        window.initFacturas = initModulo;
        window.guardarFactura = guardarFactura; 
        window.eliminarFactura = eliminarFactura;
        window.editarFactura = editarFactura;
        window.subirArchivoFaltante = subirArchivoFaltante;
        
        // 2. Gestión de Tesorería y Flujo de Aprobación
        window.alternarProgramacionHoy = alternarProgramacionHoy;
        window.toggleAprobacionIndividual = toggleAprobacionIndividual;
        window.toggleAprobacionMasiva = toggleAprobacionMasiva;
        window.enviarPlanPagosEmail = enviarPlanPagosEmail;
        window.actualizarMontoLocal = actualizarMontoLocal;
        window.abrirModalPagoAprobado = abrirModalPagoAprobado; // Carga el monto autorizado
        window.confirmarPago = confirmarPago;

        // 3. Sistema de Confirmación por Modal (Nuevo)
        window.solicitarConfirmacionFlujo = solicitarConfirmacionFlujo;
        window.cerrarModalFlujo = () => {
            const modal = document.getElementById('modal-confirmar-flujo');
            if (modal) {
                modal.classList.remove('active');
                // Resetear el botón de confirmación para el siguiente uso
                const btn = document.getElementById('flujo-modal-btn');
                if (btn) {
                    btn.disabled = false;
                    btn.innerText = "Sí, Confirmar";
                }
            }
        };

        // 4. Control de Modales (Factura)
        window.abrirModalFactura = () => {
            const modal = document.getElementById('modal-factura');
            if (modal) modal.classList.add('active');
        };
        
        window.cerrarModalFactura = () => {
            const modal = document.getElementById('modal-factura');
            const form = document.getElementById('form-nueva-factura');
            if (modal) modal.classList.remove('active');
            if (form) form.reset();
            const idField = document.getElementById('fac-id');
            if (idField) idField.value = "";
        };

        // 5. Control de Modales (Pago) con Limpieza de Datos
        window.cerrarModalPago = () => {
            const modal = document.getElementById('modal-pago');
            if (modal) {
                modal.classList.remove('active');
                
                // Limpiar campos de entrada para evitar rastro de datos anteriores
                const fields = ['pago-ref-id', 'pago-monto', 'pago-operacion', 'pago-tipo-origen'];
                fields.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });

                // Limpiar etiquetas de texto informativas
                const labels = ['pago-proveedor-txt', 'pago-doc-txt', 'pago-saldo-txt'];
                labels.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.innerText = '-';
                });
            }
        };

        // 6. Gestión de Préstamos y Detalles
        window.abrirModalPrestamo = () => {
            const modal = document.getElementById('modal-prestamo');
            if (modal) modal.classList.add('active');
        };
        
        window.cerrarModalPrestamo = () => {
            const modal = document.getElementById('modal-prestamo');
            if (modal) modal.classList.remove('active');
        };

        window.abrirModalDetallesVer = abrirModalDetallesVer;
        window.cerrarModalDetallesVer = () => {
            const modal = document.getElementById('modal-detalles-ver');
            if (modal) modal.classList.remove('active');
        };

        console.log("✅ Todas las funciones globales (incluyendo confirmación) expuestas correctamente.");
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

    // 1. ABRIR EL SÚPER MODAL Y LLENAR DATOS (ACTUALIZADO: Desglose Económico y Adicionales)
    window.abrirModalDetallesVer = async function(id) {
        // 1. Buscar la factura en nuestros datos cargados
        const factura = (typeof facturasData !== 'undefined' ? facturasData.find(f => f.id === id) : null) 
                    || (typeof cuentasData !== 'undefined' ? cuentasData.find(f => f.id === id) : null)
                    || (typeof tesoreriaData !== 'undefined' ? tesoreriaData.find(f => f.id === id) : null);
        
        if (!factura) {
            return showToast("Error: No se encontró la información de la factura.", "error");
        }

        // --- A. Llenar Encabezado y Pestaña "Información" ---
        document.getElementById('ver-modal-doc').innerText = `${factura.tipo_documento || 'Doc'} ${factura.numero_documento || ''}`;
        document.getElementById('ver-info-proveedor').innerText = factura.proveedor || 'Sin Proveedor';
        document.getElementById('ver-info-clasificacion').innerText = (factura.clasificacion || 'Operativo').toUpperCase();
        document.getElementById('ver-info-sede').innerText = factura.sede || 'No especificada';
        document.getElementById('ver-info-categoria').innerText = factura.categoria_gasto || 'General';
        document.getElementById('ver-info-glosa').innerText = factura.descripcion || 'Sin descripción detallada registrada.';

        // Datos del Documento y Estado
        document.getElementById('ver-info-tipo-doc').innerText = factura.tipo_documento || '-';
        document.getElementById('ver-info-num-doc').innerText = factura.numero_documento || '-';
        
        const estado = factura.estado_pago || 'pendiente';
        let colorEstado = '#ef4444'; 
        if (estado === 'pagado') colorEstado = '#10b981';
        if (estado === 'parcial') colorEstado = '#f59e0b';
        
        const badgeEstado = `<span class="badge" style="background:${colorEstado}15; color:${colorEstado}; border: 1px solid ${colorEstado}30;">${estado.toUpperCase()}</span>`;
        document.getElementById('ver-info-estado-pago').innerHTML = badgeEstado;

        // --- B. Llenar Fechas ---
        document.getElementById('ver-info-emision').innerText = factura.fecha_emision ? factura.fecha_emision.slice(0, 10) : '-';
        document.getElementById('ver-info-vencimiento').innerText = factura.fecha_vencimiento ? factura.fecha_vencimiento.slice(0, 10) : '-';
        document.getElementById('ver-info-programacion').innerText = factura.fecha_programacion ? factura.fecha_programacion.slice(0, 10) : 'No programada';

        // --- C. DESGLOSE FINANCIERO DINÁMICO ---
        const monedaSym = factura.moneda === 'USD' ? '$' : 'S/';
        const fmt = (m) => `${monedaSym} ${parseFloat(m || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

        // 1. Base e Impuesto
        const baseVal = factura.base_imponible || factura.monto_neto_pagar || 0;
        const impuestoPorc = factura.porcentaje_detraccion || 0;
        const operacion = factura.operacion_impuesto || 'suma';
        
        document.getElementById('ver-info-base').innerText = fmt(baseVal);
        document.getElementById('ver-info-impuesto-p').innerText = impuestoPorc;
        document.getElementById('ver-info-operacion').innerText = operacion.toUpperCase();
        document.getElementById('ver-info-operacion').style.background = operacion === 'suma' ? '#dcfce7' : '#fee2e2';
        document.getElementById('ver-info-operacion').style.color = operacion === 'suma' ? '#166534' : '#991b1b';

        // Cálculo del monto del impuesto para la vista
        const montoImpuesto = (parseFloat(baseVal) * parseFloat(impuestoPorc)) / 100;
        document.getElementById('ver-info-impuesto-monto').innerText = (operacion === 'suma' ? '+ ' : '- ') + fmt(montoImpuesto);

        // 2. Renderizar Adicionales (JSONB)
        const tablaCuerpo = document.getElementById('ver-info-desglose-cuerpo');
        // Limpiamos pero mantenemos las dos primeras filas (Base e Impuesto)
        const filasBaseHtml = tablaCuerpo.querySelectorAll('tr');
        const baseRow = filasBaseHtml[0].outerHTML;
        const taxRow = filasBaseHtml[1].outerHTML;
        tablaCuerpo.innerHTML = baseRow + taxRow;

        // Parsear adicionales si vienen como string
        let adicionales = [];
        try {
            adicionales = typeof factura.adicionales === 'string' ? JSON.parse(factura.adicionales) : (factura.adicionales || []);
        } catch (e) { adicionales = []; }

        if (Array.isArray(adicionales)) {
            adicionales.forEach(adj => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = "1px solid #f1f5f9";
                tr.innerHTML = `
                    <td style="padding: 10px 15px; color: #64748b;">${adj.glosa || 'Adicional'}</td>
                    <td style="padding: 10px 15px; text-align: right; font-weight: 600;">+ ${fmt(adj.monto)}</td>
                `;
                tablaCuerpo.appendChild(tr);
            });
        }

        // --- D. Totales y Saldos ---
        const total = parseFloat(factura.monto_total || 0);
        const pagado = parseFloat(factura.monto_pagado || 0);
        const deuda = total - pagado;

        document.getElementById('ver-info-total').innerText = fmt(total);
        document.getElementById('ver-info-pagado').innerText = fmt(pagado);
        document.getElementById('ver-info-deuda').innerText = fmt(deuda);

        // --- E. Datos Bancarios ---
        document.getElementById('ver-info-banco').innerText = factura.banco || 'No registrado';
        document.getElementById('ver-info-cuenta').innerText = factura.numero_cuenta || 'No registrado';
        document.getElementById('ver-info-cci').innerText = factura.cci || 'No registrado';

        // --- F. Finalizar ---
        document.getElementById('ver-modal-factura-id').value = id;
        cambiarTabModalVer('info');
        document.getElementById('modal-detalles-ver').classList.add('active');

        // Cargas asíncronas
        if (typeof cargarDocumentosExtra === 'function') cargarDocumentosExtra(id);
        if (typeof cargarHistorialPagos === 'function') cargarHistorialPagos(id);
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

    /**
     * 💰 CARGAR HISTORIAL DE PAGOS
     * Obtiene desde el servidor todos los abonos o pagos totales realizados a esta factura.
     */
    window.cargarHistorialPagos = async function(id) {
        const tbody = document.getElementById('ver-tabla-pagos-body');
        
        // 1. Estado de carga inicial
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align:center; padding: 20px;">
                    <i class='bx bx-loader-alt bx-spin' style='font-size: 2rem; color: #3b82f6;'></i>
                    <p style="margin-top: 10px; color: #64748b;">Consultando historial de pagos...</p>
                </td>
            </tr>`;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/facturas/${id}/pagos`, { 
                headers: { 'x-auth-token': token } 
            });

            if (!res.ok) throw new Error("Error en la respuesta del servidor");

            const pagos = await res.json();

            tbody.innerHTML = '';
            
            // 2. Si no hay pagos
            if (!pagos || pagos.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align:center; padding: 30px; color: #94a3b8;">
                            <i class='bx bx-info-circle' style='font-size: 1.5rem;'></i><br>
                            No hay pagos registrados aún para este documento.
                        </td>
                    </tr>`;
                return;
            }

            // 3. Renderizar cada pago
            pagos.forEach(p => {
                const tr = document.createElement('tr');
                
                // Detectar moneda (si el backend no la envía, asumimos soles por defecto)
                const monedaSimbolo = p.moneda === 'USD' ? '$' : 'S/';
                const montoFormateado = parseFloat(p.monto).toLocaleString('es-PE', { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                });

                // Formatear Fecha
                const fechaPago = p.fecha_pago ? p.fecha_pago.slice(0, 10) : 
                                (p.fecha_creacion ? p.fecha_creacion.slice(0, 10) : '-');

                tr.innerHTML = `
                    <td style="font-weight: 500;">${fechaPago}</td>
                    <td style="font-weight: 800; color: #10b981;">
                        ${monedaSimbolo} ${montoFormateado}
                    </td>
                    <td>
                        <span class="badge" style="background: #eff6ff; color: #3b82f6; border: 1px solid #dbeafe;">
                            <i class='bx bx-credit-card-front' style='vertical-align: middle; margin-right: 4px;'></i>
                            ${p.metodo_pago || 'Transferencia'}
                        </span>
                    </td>
                    <td style="font-size: 0.85rem; color: #475569;">
                        ${p.descripcion || p.referencia || '-'}
                    </td>
                `;
                tbody.appendChild(tr);
            });

        } catch (e) {
            console.error("Error al cargar historial de pagos:", e);
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align:center; padding: 20px; color: #ef4444;">
                        <i class='bx bx-error-circle' style='font-size: 1.5rem;'></i><br>
                        No se pudo conectar con el servidor para obtener los pagos.
                    </td>
                </tr>`;
        }
    };

    /**
     * 📂 CARGAR DOCUMENTOS EXTRA
     * Obtiene los archivos adjuntos (vouchers, facturas, PDFs) relacionados al gasto.
     */
window.cargarDocumentosExtra = async function(id) {
        const tbody = document.getElementById('ver-tabla-docs-body');
        
        // 1. Estado de carga con Spinner
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align:center; padding: 20px;">
                    <i class='bx bx-loader-alt bx-spin' style='font-size: 1.8rem; color: #3b82f6;'></i>
                    <p style="margin-top: 8px; color: #64748b; font-size: 0.9rem;">Buscando archivos...</p>
                </td>
            </tr>`;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/facturas/${id}/documentos`, { 
                headers: { 'x-auth-token': token } 
            });

            if (!res.ok) throw new Error("Error al obtener documentos");

            const docs = await res.json();

            tbody.innerHTML = '';

            // 2. Si no hay documentos
            if (!docs || docs.length === 0) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="3" style="text-align:center; padding: 30px; color: #94a3b8;">
                            <i class='bx bx-folder-open' style='font-size: 2rem; display: block; margin-bottom: 10px;'></i>
                            No hay documentos adicionales adjuntos.
                        </td>
                    </tr>`;
                return;
            }

            // 3. Renderizar cada documento
            docs.forEach(d => {
                // 🔥 LÓGICA PREMIUM: Detectar Nube vs Servidor Local
                let urlLimpia = d.ruta_archivo;
                
                if (!urlLimpia.startsWith('http')) {
                    // Es un archivo local viejo, lo limpiamos
                    urlLimpia = urlLimpia.replace(/\\/g, '/');
                    if (urlLimpia.startsWith('backend/')) {
                        urlLimpia = urlLimpia.replace('backend/', '/');
                    } else if (!urlLimpia.startsWith('/')) {
                        urlLimpia = `/${urlLimpia}`;
                    }
                }
                
                // Función auxiliar para íconos según extensión (por si no la tienes o la mejoramos)
                const extension = d.nombre_archivo.split('.').pop().toLowerCase();
                let iconClass = 'bxs-file';
                if (['pdf'].includes(extension)) iconClass = 'bxs-file-pdf';
                else if (['doc', 'docx'].includes(extension)) iconClass = 'bxs-file-doc';
                else if (['xls', 'xlsx', 'csv'].includes(extension)) iconClass = 'bxs-file-blank'; // No hay icono nativo de excel en boxicons standard a veces, usamos blank
                else if (['png', 'jpg', 'jpeg'].includes(extension)) iconClass = 'bxs-file-image';

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="max-width: 280px; padding: 12px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class='bx ${iconClass}' style='font-size: 1.5rem; color: #3b82f6;'></i>
                            <div style="overflow: hidden;">
                                <strong style="color: #1e293b; display: block; white-space: nowrap; text-overflow: ellipsis; overflow: hidden;" title="${d.nombre_archivo}">
                                    ${d.nombre_archivo}
                                </strong>
                                <small style="color:#64748b; text-transform: uppercase; font-size: 0.7rem; font-weight: 600;">
                                    ${d.tipo_documento || 'ADJUNTO'}
                                </small>
                            </div>
                        </div>
                    </td>
                    <td style="color: #475569; font-size: 0.9rem;">
                        ${d.fecha_subida ? new Date(d.fecha_subida).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-'}
                    </td>
                    <td style="text-align:center; white-space: nowrap; padding: 12px;">
                        <div style="display: flex; gap: 8px; justify-content: center;">
                            <a href="${urlLimpia}" target="_blank" class="btn-icon" 
                            style="color:#3b82f6; background:#eff6ff; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; text-decoration: none; transition: all 0.2s;" 
                            title="Ver / Descargar"
                            onmouseover="this.style.background='#dbeafe'"
                            onmouseout="this.style.background='#eff6ff'">
                                <i class='bx bx-download' style='font-size: 1.2rem;'></i>
                            </a>
                            <button class="btn-icon" 
                                    style="color:#ef4444; background:#fef2f2; width: 32px; height: 32px; border-radius: 6px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" 
                                    onclick="eliminarDocumentoExtra(${d.id}, ${id})" 
                                    title="Eliminar Archivo"
                                    onmouseover="this.style.background='#fee2e2'"
                                    onmouseout="this.style.background='#fef2f2'">
                                <i class='bx bx-trash' style='font-size: 1.2rem;'></i>
                            </button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (e) {
            console.error("Error en cargarDocumentosExtra:", e);
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align:center; padding: 20px; color: #ef4444;">
                        <i class='bx bx-error-circle' style='font-size: 1.5rem;'></i><br>
                        Error al cargar documentos.
                    </td>
                </tr>`;
        }
    };

    /**
     * Función auxiliar para poner el ícono correcto según la extensión
     */
    function getIconByFileType(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        switch(ext) {
            case 'pdf': return 'bxs-file-pdf';
            case 'jpg':
            case 'jpeg':
            case 'png': return 'bxs-file-image';
            case 'doc':
            case 'docx': return 'bxs-file-doc';
            default: return 'bxs-file';
        }
    }

    /**
     * ☁️ SUBIR NUEVO DOCUMENTO EXTRA
     * Captura el archivo del input, lo envía al servidor y actualiza la lista visual.
     */
    window.ejecutarSubidaDocumentoExtra = async function(event) {
        const file = event.target.files[0];
        if (!file) return;

        // 1. Validaciones previas de seguridad (Opcional pero recomendado)
        const MAX_SIZE_MB = 10;
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
            showToast(`El archivo es muy pesado. Máximo ${MAX_SIZE_MB}MB`, "error");
            event.target.value = '';
            return;
        }

        const facturaId = document.getElementById('ver-modal-factura-id').value;
        const token = localStorage.getItem('token');
        
        // 2. Referencia al botón para feedback visual
        const btnSubir = document.querySelector('[onclick*="input-subir-doc-extra"]');
        const originalHTML = btnSubir ? btnSubir.innerHTML : '';

        const formData = new FormData();
        formData.append('archivo', file);
        // Podemos dinamizar el tipo de documento si fuera necesario
        formData.append('tipo_documento', 'Comprobante Adicional');

        try {
            // Bloqueo visual del botón
            if (btnSubir) {
                btnSubir.disabled = true;
                btnSubir.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Subiendo...`;
            }

            const res = await fetch(`/api/facturas/${facturaId}/documentos`, {
                method: 'POST',
                headers: { 'x-auth-token': token },
                body: formData
            });

            const data = await res.json();

            if (res.ok) {
                showToast("Documento subido correctamente", "success");
                // Recargar la tabla de documentos para mostrar el nuevo archivo
                if (typeof cargarDocumentosExtra === 'function') {
                    await cargarDocumentosExtra(facturaId);
                }
            } else {
                showToast(data.msg || "Error al subir documento", "error");
            }
        } catch (e) {
            console.error("Error en ejecutarSubidaDocumentoExtra:", e);
            showToast("Error de conexión al servidor", "error");
        } finally {
            // 3. Restaurar estado del botón y limpiar input
            if (btnSubir) {
                btnSubir.disabled = false;
                btnSubir.innerHTML = originalHTML;
            }
            document.getElementById('input-subir-doc-extra').value = ''; 
        }
    };

    /**
     * 7. ELIMINAR DOCUMENTO EXTRA (Paso 1: Preparar IDs y Abrir Modal)
     */
    window.eliminarDocumentoExtra = function(docId, facturaId) {
        // 1. Validar que los campos donde guardaremos los IDs existan
        const inputDocId = document.getElementById('delete-doc-id');
        const inputFacId = document.getElementById('delete-doc-factura-id');

        if (!inputDocId || !inputFacId) {
            console.error("Error: Campos ocultos de eliminación no encontrados en el DOM.");
            return;
        }

        // 2. Guardar los IDs en los inputs del modal de confirmación
        inputDocId.value = docId;
        inputFacId.value = facturaId;
        
        // 3. Mostrar el modal de confirmación
        const modal = document.getElementById('modal-confirmar-eliminar-doc');
        if (modal) {
            modal.classList.add('active');
        } else {
            // Fallback en caso de que el modal no esté en el HTML
            if (confirm("¿Estás seguro de que deseas eliminar este documento permanentemente?")) {
                ejecutarEliminacionDoc();
            }
        }
    };

    /**
     * CERRAR MODAL DE CONFIRMACIÓN
     */
    window.cerrarModalEliminarDoc = function() {
        const modal = document.getElementById('modal-confirmar-eliminar-doc');
        if (modal) {
            modal.classList.remove('active');
        }
    };

    /**
     * EJECUTAR ELIMINACIÓN REAL (Paso 2: Comunicación con el Backend)
     */
    window.ejecutarEliminacionDoc = async function() {
        // 1. Leer los IDs guardados
        const docId = document.getElementById('delete-doc-id').value;
        const facturaId = document.getElementById('delete-doc-factura-id').value;
        const token = localStorage.getItem('token');

        // 2. Referencia al botón para feedback visual
        // Intentamos buscar el botón de "Confirmar" dentro del modal
        const btnConfirmar = document.querySelector('#modal-confirmar-eliminar-doc .btn-danger') || 
                            document.querySelector('#modal-confirmar-eliminar-doc button[onclick*="ejecutarEliminacionDoc"]');
        
        const originalHTML = btnConfirmar ? btnConfirmar.innerHTML : '';

        try {
            // Bloqueo visual del botón para evitar múltiples clics
            if (btnConfirmar) {
                btnConfirmar.disabled = true;
                btnConfirmar.innerHTML = `<i class='bx bx-loader-alt bx-spin'></i> Eliminando...`;
            }

            const res = await fetch(`/api/facturas/documentos/${docId}`, {
                method: 'DELETE',
                headers: { 
                    'x-auth-token': token,
                    'Content-Type': 'application/json'
                }
            });

            if (res.ok) {
                showToast("Documento eliminado correctamente", "success");
                cerrarModalEliminarDoc(); // Ocultar el modal de confirmación
                
                // Recargar la tablita de archivos en el modal de "Ver Detalles"
                if (typeof cargarDocumentosExtra === 'function') {
                    await cargarDocumentosExtra(facturaId);
                }
            } else {
                const data = await res.json();
                showToast(data.msg || "Error al eliminar el documento", "error");
                cerrarModalEliminarDoc();
            }
        } catch (e) {
            console.error("Error en ejecutarEliminacionDoc:", e);
            showToast("Error de conexión con el servidor", "error");
            cerrarModalEliminarDoc();
        } finally {
            // 3. Restaurar el estado del botón
            if (btnConfirmar) {
                btnConfirmar.disabled = false;
                btnConfirmar.innerHTML = originalHTML;
            }
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

    /**
     * ABRIR MODAL DE PAGO CON INFORMACIÓN EXTENDIDA (Sincronizado con Aprobación de Gerencia)
     * @param {number} id - ID de la factura
     * @param {number} saldoPendiente - Saldo total pendiente de la factura
     * @param {string} proveedor - Nombre del proveedor
     * @param {string} documento - Número de documento
     * @param {string} moneda - PEN o USD
     */
    window.abrirModalPagoExtendido = function(id, saldoPendiente, proveedor, documento, moneda) {
        // 1. Rellenar la tarjeta informativa superior
        document.getElementById('pago-proveedor-txt').innerText = proveedor || 'Proveedor Desconocido';
        document.getElementById('pago-doc-txt').innerText = documento || 'S/N';
        
        const monedaSym = moneda === 'USD' ? '$' : 'S/';
        document.getElementById('pago-saldo-txt').innerText = `${monedaSym} ${parseFloat(saldoPendiente).toFixed(2)}`;

        // 2. LÓGICA DE MONTO SUGERIDO (Prioriza el monto aprobado por Gerencia)
        let montoASugerir = parseFloat(saldoPendiente);

        // Buscamos si la factura está en el listado de tesorería y tiene monto_aprobado
        if (typeof tesoreriaData !== 'undefined') {
            const facturaTesoreria = tesoreriaData.find(f => f.id === id);
            // Se debe eliminar "facturaTrobado" que no existe en el contexto
            if (facturaTesoreria && facturaTesoreria.aprobado_tesoreria) {
                // Si Gerencia aprobó un monto específico (ej: 500 de 1000), sugerimos ese monto
                montoASugerir = parseFloat(facturaTesoreria.monto_aprobado);
            }
        }

        // 3. Rellenar los inputs del formulario
        document.getElementById('pago-ref-id').value = id;
        document.getElementById('pago-monto').value = montoASugerir.toFixed(2);
        
        // 4. Configuración por defecto
        document.getElementById('pago-fecha').value = new Date().toISOString().split('T')[0];
        document.getElementById('pago-operacion').value = '';

        // 5. Mostrar modal
        const modalPago = document.getElementById('modal-pago');
        if (modalPago) {
            modalPago.classList.add('active');
            
            // Foco automático en el monto por si se desea ajustar manualmente
            setTimeout(() => {
                document.getElementById('pago-monto').focus();
                document.getElementById('pago-monto').select();
            }, 300);
        }
    };

    // =======================================================
    // 10. NUEVAS FUNCIONES: MÓDULO TESORERÍA DIARIA 🚀
    // =======================================================

    /**
     * 10.1 ALTERNAR PROGRAMACIÓN (ACTUALIZADO: Bloqueo de facturas autorizadas)
     * Mueve la factura entre 'Cuentas por Pagar' y 'Tesorería Diaria'.
     */
    window.alternarProgramacionHoy = async function(id, estado) {
        try {
            const token = localStorage.getItem('token');
            
            // 🛡️ PASO DE SEGURIDAD: Si se intenta regresar (estado false), verificar aprobación
            if (estado === false && typeof tesoreriaData !== 'undefined') {
                const factura = tesoreriaData.find(f => f.id === id);
                if (factura && factura.aprobado_tesoreria === true) {
                    return showToast("⚠️ No se puede regresar una factura que ya ha sido AUTORIZADA. Desapruebe el pago primero.", "warning");
                }
            }

            // 1. Petición al backend para actualizar la columna programado_hoy
            const res = await fetch(`/api/facturas/${id}/programar`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-token': token 
                },
                body: JSON.stringify({ estado: estado })
            });

            const data = await res.json();

            if (res.ok) {
                showToast(data.msg, "success");
                
                // 2. 🔄 ACTUALIZACIÓN DINÁMICA DE VISTAS (Paralela para mejor rendimiento)
                await cargarGastos(); 
                
                const actualizaciones = [];
                if (window.cargarCuentasPorPagar) actualizaciones.push(cargarCuentasPorPagar());
                if (window.cargarKpisPagos) actualizaciones.push(cargarKpisPagos());
                
                // Si el estado es true, pre-cargamos la tesorería antes del salto
                if (estado === true && window.cargarTesoriaDiaria) {
                    actualizaciones.push(cargarTesoriaDiaria());
                }

                await Promise.all(actualizaciones);
                
                // 3. 🚀 SALTO AUTOMÁTICO Y FEEDBACK VISUAL
                if (estado === true) {
                    // Pequeño delay para que el usuario note que la fila desapareció de la tabla actual
                    setTimeout(() => {
                        cambiarTab('tab-tesoreria');
                    }, 250);
                } else {
                    // Si estamos regresando la factura de Tesorería a Cuentas, 
                    // nos aseguramos de refrescar la vista actual de tesorería
                    if (window.cargarTesoriaDiaria) await cargarTesoriaDiaria();
                }

            } else {
                showToast(data.msg || "Error al procesar la programación", "error");
            }
        } catch (error) {
            console.error("❌ Error en alternarProgramacionHoy:", error);
            showToast("Error de conexión con el servidor", "error");
        }
    };

    /**
     * 10.2 CARGAR DATOS DE TESORERÍA (Actualizado: Persistencia en tesoreriaData)
     * Ejecuta las cargas y sincroniza la variable global para evitar errores de referencia.
     */
    window.cargarTesoriaDiaria = async function() {
        try {
            const token = localStorage.getItem('token');
            
            // 🚀 Asegurar que tesoreriaData esté disponible globalmente para evitar ReferenceError
            if (typeof window.tesoreriaData === 'undefined') {
                window.tesoreriaData = [];
            }
            
            // Ejecutamos ambas cargas en paralelo para mayor velocidad
            const [resTabla, resResumen] = await Promise.all([
                fetch('/api/facturas/programacion/hoy', { headers: { 'x-auth-token': token } }),
                fetch('/api/facturas/programacion/resumen', { headers: { 'x-auth-token': token } })
            ]);

            if (resTabla.ok && resResumen.ok) {
                const facturasProgramadas = await resTabla.json();
                const resumenBloques = await resResumen.json();

                // 🚀 ASIGNACIÓN CRÍTICA: Guardar los datos en la variable global
                // Esto permite que el buscador y los aprobadores individuales funcionen correctamente.
                window.tesoreriaData = facturasProgramadas;

                // Renderizar componentes visuales
                renderizarTablaTesoreria(facturasProgramadas);
                cargarBloquesResumen(resumenBloques);
                
                console.log("✅ Tesorería sincronizada con tesoreriaData");
            } else {
                console.error("Error en respuesta de servidor:", resTabla.status, resResumen.status);
                showToast("Error al obtener datos del servidor.", "error");
            }
        } catch (error) {
            console.error("❌ Error cargando Tesorería Diaria:", error);
            showToast("Error al obtener datos de tesorería.", "error");
        }
    };


    /**
     * 10.3 RENDERIZAR TABLA DE TESORERÍA (PERSISTENTE Y SEGURA)
     * Muestra el estado de aprobación, bloquea montos autorizados y actualiza KPIs.
     */
    function renderizarTablaTesoreria(datos) {
        const tbody = document.getElementById('tabla-tesoreria-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        // Si no hay datos, limpiamos la tabla y reseteamos los bloques KPI a cero
        if (!datos || datos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:40px; color:#64748b;">
                <i class='bx bx-info-circle' style="font-size: 2rem; display: block; margin-bottom: 10px; color: #cbd5e1;"></i>
                No hay pagos programados para hoy.</td></tr>`;
            
            // Resetear bloques KPI a cero si no hay datos
            if (typeof cargarBloquesResumen === 'function') {
                cargarBloquesResumen({
                    Operativo: { pen: 0, usd: 0 },
                    Implementacion: { pen: 0, usd: 0 },
                    Financiero: { pen: 0, usd: 0 }
                });
            }
            return;
        }

        // Inicializar acumuladores para los bloques KPI
        const totales = {
            Operativo: { pen: 0, usd: 0 },
            Implementacion: { pen: 0, usd: 0 },
            Financiero: { pen: 0, usd: 0 }
        };

        // Asegura que los botones de Aprobar Todo / Desaprobar Todo estén visibles
        renderizarControlesMasivosTesoreria();

        datos.forEach(f => {
            const tr = document.createElement('tr');
            tr.id = `fila-tesoreria-${f.id}`; 
            
            // --- LÓGICA DE CLASIFICACIÓN Y ACUMULACIÓN ---
            const clasifOriginal = f.clasificacion || 'Operativo';
            const clasifNormalizada = clasifOriginal.toUpperCase().trim();
            
            let colorClasif = '#3b82f6'; // Azul - Operativo
            let categoriaClave = 'Operativo';

            if (clasifNormalizada.includes('IMPLEMENT')) {
                colorClasif = '#8b5cf6'; // Morado - Implementación
                categoriaClave = 'Implementacion';
            } else if (clasifNormalizada.includes('FINANCIER')) {
                colorClasif = '#f59e0b'; // Naranja - Financiero
                categoriaClave = 'Financiero';
            }

            // Acumular montos para los bloques KPI (usando el saldo pendiente)
            const montoNumerico = parseFloat(f.saldo_pendiente) || 0;
            if (f.moneda === 'USD') {
                totales[categoriaClave].usd += montoNumerico;
            } else {
                totales[categoriaClave].pen += montoNumerico;
            }

            // --- ESTADO DE APROBACIÓN ---
            const isAprobado = f.aprobado_tesoreria === true;
            
            // Priorizamos el monto_aprobado (local o de DB) sobre el saldo original
            const montoAMostrar = f.monto_aprobado !== undefined ? f.monto_aprobado : f.saldo_pendiente;
            const montoAutorizado = parseFloat(montoAMostrar).toFixed(2);
            
            const badgeAprobacion = isAprobado 
                ? `<span class="badge" style="background:#dcfce7; color:#16a34a; border:1px solid #bbf7d0; font-weight:700;">AUTORIZADO</span>`
                : `<span class="badge" style="background:#f1f5f9; color:#64748b; border:1px solid #e2e8f0;">PENDIENTE</span>`;

            // --- COMPONENTES UI ---
            const inputMontoAprobado = `
                <div style="display:flex; align-items:center; gap:5px; justify-content:flex-end;">
                    <span style="font-size:0.8rem; font-weight:700;">${f.moneda === 'USD' ? '$' : 'S/'}</span>
                    <input type="number" 
                        id="input-aprob-amount-${f.id}"
                        value="${montoAutorizado}" 
                        step="0.01" 
                        ${isAprobado ? 'disabled' : ''} 
                        style="width:90px; padding:4px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold; text-align:right; 
                            color:${isAprobado ? '#16a34a' : '#ef4444'}; 
                            background:${isAprobado ? '#f8fafc' : '#ffffff'}; 
                            cursor:${isAprobado ? 'not-allowed' : 'auto'};"
                        oninput="actualizarMontoLocal(${f.id}, this.value)">
                </div>
            `;

            const datosBancos = `<div style="font-size:0.8rem; line-height:1.2;">
                <strong style="color:#1e293b;">${f.banco || 'S/B'}</strong><br>
                <span style="color:#64748b;">CCI: ${f.cci || f.numero_cuenta || '-'}</span>
            </div>`;

            const btnRegresar = `
                <button class="btn-icon" 
                    style="color:#64748b; background:${isAprobado ? '#f8fafc' : '#f1f5f9'}; cursor:${isAprobado ? 'not-allowed' : 'pointer'}; opacity:${isAprobado ? '0.5' : '1'};" 
                    ${isAprobado ? 'disabled' : `onclick="alternarProgramacionHoy(${f.id}, false)"`} 
                    title="${isAprobado ? 'Acción Bloqueada: El pago ya fue autorizado' : 'Regresar a Cuentas por Pagar'}">
                    <i class='bx bx-undo'></i>
                </button>`;

            tr.innerHTML = `
                <td><span class="badge" style="background:${colorClasif}15; color:${colorClasif}; border:1px solid ${colorClasif}30;">${clasifOriginal.toUpperCase()}</span></td>
                <td style="font-weight:600; color:#1e293b;">${f.proveedor}</td>
                <td><small>${f.tipo_documento}</small><br><strong>${f.numero_documento}</strong></td>
                <td>${datosBancos}</td>
                <td style="text-align:center;">${badgeAprobacion}</td>
                <td style="color:#64748b; font-size:0.85rem; text-align:right;">
                    Original: ${f.moneda === 'USD' ? '$' : 'S/'} ${parseFloat(f.saldo_pendiente).toFixed(2)}
                </td>
                <td>${inputMontoAprobado}</td>
                <td>
                    <div style="display:flex; gap:6px; justify-content:center;">
                        <button class="btn-icon" 
                            style="color:${isAprobado ? '#ef4444' : '#10b981'}; background:${isAprobado ? '#fee2e2' : '#ecfdf5'}; border: 1px solid ${isAprobado ? '#fecaca' : '#a7f3d0'};" 
                            onclick="toggleAprobacionIndividual(${f.id}, ${!isAprobado})" 
                            title="${isAprobado ? 'Quitar Aprobación' : 'Aprobar Pago'}">
                            <i class='bx ${isAprobado ? 'bx-x-circle' : 'bx-check-shield'}'></i>
                        </button>

                        ${btnRegresar}
                        
                        <button class="btn-icon" 
                            style="color:#ffffff; background:${isAprobado ? '#10b981' : '#cbd5e1'}; cursor:${isAprobado ? 'pointer' : 'not-allowed'};" 
                            ${isAprobado ? `onclick="abrirModalPagoAprobado(${f.id})"` : 'disabled'}
                            title="${isAprobado ? 'Registrar Salida de Dinero' : 'Requiere autorización de Gerencia'}">
                            <i class='bx bx-dollar-circle'></i>
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Actualizar los bloques KPI superiores con los totales calculados
        if (typeof cargarBloquesResumen === 'function') {
            cargarBloquesResumen(totales);
        }
    }

    /**
     * 2.3 ABRIR MODAL DE PAGO (ACTUALIZADO: Sincronización exacta con el DOM)
     * Carga el monto autorizado por Gerencia y llena los campos informativos.
     */
    window.abrirModalPagoAprobado = function(id) {
        // 1. Buscar la factura en la memoria global
        const dataLocal = window.tesoreriaData || [];
        const factura = dataLocal.find(f => f.id === parseInt(id));

        if (!factura) {
            return showToast("No se encontró la información de la factura.", "error");
        }

        // 2. Verificar aprobación (Seguridad para el flujo de caja)
        // Se admite true o 1 para compatibilidad con la base de datos
        if (factura.aprobado_tesoreria !== true && factura.aprobado_tesoreria != 1) {
            return showToast("Esta factura aún no ha sido autorizada para pago.", "warning");
        }

        // 3. Referenciar elementos según los IDs reales de tu HTML
        const modal = document.getElementById('modal-pago'); 
        const inputMonto = document.getElementById('pago-monto');
        const inputIdRef = document.getElementById('pago-factura-id') || document.getElementById('pago-ref-id');
        const inputTipoOrigen = document.getElementById('pago-tipo-origen');
        
        // Elementos informativos del modal
        const txtProveedor = document.getElementById('pago-proveedor-txt');
        const txtDocumento = document.getElementById('pago-doc-txt');
        const txtSaldo = document.getElementById('pago-saldo-txt');

        // Validación de existencia en el DOM
        if (!modal || !inputMonto || !inputIdRef) {
            console.error("❌ Error: No se encontraron los elementos críticos del modal-pago en el DOM.");
            return;
        }

        // 🚀 PASO CRÍTICO: Cargar el monto autorizado
        // Usamos el monto_aprobado capturado en la tabla de tesorería
        const montoFinal = factura.monto_aprobado !== undefined ? factura.monto_aprobado : factura.saldo_pendiente;
        
        // 4. Llenado de datos en el modal
        inputIdRef.value = id;
        if (inputTipoOrigen) inputTipoOrigen.value = 'GASTO';
        
        inputMonto.value = parseFloat(montoFinal).toFixed(2);
        
        // Actualizar textos visuales para que el cajero sepa qué está pagando
        if (txtProveedor) txtProveedor.innerText = factura.proveedor;
        if (txtDocumento) txtDocumento.innerText = `${factura.tipo_documento} ${factura.numero_documento}`;
        if (txtSaldo) {
            const simbolo = factura.moneda === 'USD' ? '$' : 'S/';
            txtSaldo.innerText = `${simbolo} ${parseFloat(factura.saldo_pendiente).toFixed(2)}`;
        }

        // 5. Mostrar el modal activando la clase de visibilidad
        modal.classList.add('active');
        
        console.log(`✅ Modal de pago abierto para factura ${id} con monto autorizado: ${montoFinal}`);
    };

    /**
     * Aprobación Individual: Guarda el monto específico y protege los demás cambios locales
     */
    window.toggleAprobacionIndividual = async function(id, nuevoEstado) {
        // 1. Obtener el monto actual del input de ESTA factura
        const inputActual = document.getElementById(`input-aprob-amount-${id}`);
        const monto = inputActual ? parseFloat(inputActual.value) : 0;

        if (nuevoEstado && (isNaN(monto) || monto <= 0)) {
            return showToast("Ingrese un monto válido para aprobar", "warning");
        }

        try {
            // 🚀 PASO CLAVE: Sincronizar todos los montos de la tabla al array local 
            // antes de la petición para que no se pierdan al recargar
            tesoreriaData.forEach(f => {
                const el = document.getElementById(`input-aprob-amount-${f.id}`);
                if (el && !f.aprobado_tesoreria) {
                    f.monto_aprobado = parseFloat(el.value);
                }
            });

            const res = await fetch('/api/facturas/aprobar-individual', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json', 
                    'x-auth-token': localStorage.getItem('token') 
                },
                body: JSON.stringify({ 
                    id, 
                    aprobado: nuevoEstado, 
                    monto_aprobado: monto 
                })
            });

            if (res.ok) {
                // Actualizar el estado en el array local para reflejar el cambio inmediato
                const index = tesoreriaData.findIndex(f => f.id === id);
                if (index !== -1) {
                    tesoreriaData[index].aprobado_tesoreria = nuevoEstado;
                    tesoreriaData[index].monto_aprobado = monto;
                }

                showToast(nuevoEstado ? "Pago autorizado con éxito" : "Aprobación removida", "success");
                
                // Recargar datos del servidor para asegurar sincronización total
                await cargarTesoriaDiaria(); 
            } else {
                const error = await res.json();
                showToast(error.msg || "Error al procesar aprobación", "error");
            }
        } catch (e) {
            console.error("Error en toggleAprobacionIndividual:", e);
            showToast("Error al conectar con el servidor", "error");
        }
    };

    /**
     * Aprobación Masiva: Captura montos manuales, sincroniza memoria global y procesa
     * la acción mediante un modal de confirmación en lugar de un alert.
     * @param {boolean} aprobado - true para aprobar, false para desaprobar
     */
    window.toggleAprobacionMasiva = async function(aprobado) {
        // 1. Configuración del mensaje y estilo del modal
        const configModal = {
            titulo: aprobado ? "Autorización Masiva" : "Desautorización Masiva",
            mensaje: aprobado 
                ? "¿Desea autorizar todos los pagos con los montos indicados en la tabla?" 
                : "¿Desea quitar la autorización a todos los pagos programados?",
            tipo: aprobado ? "primary" : "danger",
            accion: async () => {
                try {
                    // 2. Acceso a la variable global de datos
                    const dataLocal = window.tesoreriaData || (typeof tesoreriaData !== 'undefined' ? tesoreriaData : []);

                    if (dataLocal.length === 0) {
                        return showToast("No hay facturas para procesar", "warning");
                    }

                    // 3. 🚀 CAPTURA Y ACTUALIZACIÓN DE MEMORIA GLOBAL
                    const facturasConMontos = dataLocal.map(f => {
                        const inputMonto = document.getElementById(`input-aprob-amount-${f.id}`);
                        let montoFinal;

                        if (inputMonto) {
                            montoFinal = parseFloat(inputMonto.value);
                        } else {
                            montoFinal = f.monto_aprobado !== undefined ? f.monto_aprobado : f.saldo_pendiente;
                        }

                        const valorInput = document.getElementById(`input-aprob-amount-${f.id}`)?.value;
                        const montoValidado = parseFloat(valorInput) || 0;

                        // Sincronización inmediata en memoria para persistencia
                        f.monto_aprobado = montoValidado;
                        f.aprobado_tesoreria = aprobado;

                        return {
                            id: f.id,
                            monto_aprobado: montoValidado
                        };
                    });

                    // Validar montos si se va a aprobar
                    if (aprobado && facturasConMontos.some(f => f.monto_aprobado <= 0)) {
                        return showToast("Hay facturas con monto 0 o inválido. Verifique antes de aprobar.", "error");
                    }

                    // 4. Petición al Servidor
                    const res = await fetch('/api/facturas/aprobar-masiva', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'x-auth-token': localStorage.getItem('token') 
                        },
                        body: JSON.stringify({ 
                            aprobado, 
                            facturas: facturasConMontos 
                        })
                    });

                    if (res.ok) {
                        const resultData = await res.json();
                        showToast(resultData.msg, "success");

                        // 5. 🔄 RECARGA Y SINCRONIZACIÓN DE VISTAS
                        await cargarTesoriaDiaria(); 
                        
                        if (typeof renderizarTablaTesoreria === 'function') {
                            renderizarTablaTesoreria(window.tesoreriaData);
                        }
                    } else {
                        const errorData = await res.json();
                        showToast(errorData.msg || "Error en el proceso masivo", "error");
                    }
                } catch (e) {
                    console.error("❌ Error en toggleAprobacionMasiva:", e);
                    showToast("Error de conexión con el servidor", "error");
                }
            }
        };

        // 6. Disparar el modal de confirmación personalizado
        if (typeof window.solicitarConfirmacionFlujo === 'function') {
            window.solicitarConfirmacionFlujo(configModal);
        } else {
            // Fallback de seguridad por si el modal no está cargado
            if (confirm(configModal.mensaje)) configModal.accion();
        }
    };

    /**
     * Renderiza los botones de Aprobar Todo y Enviar Correo en el Toolbar
     */
    function renderizarControlesMasivosTesoreria() {
        const container = document.querySelector('#tab-tesoreria .filter-actions');
        if (!container) return;

        // Evitar duplicados
        if (document.getElementById('btn-email-tesoreria')) return;

        const controlesExtra = `
            <button class="btn-primary" style="background:#8b5cf6; border:none;" onclick="toggleAprobacionMasiva(true)" title="Aprobar todo el listado">
                <i class='bx bx-done-all'></i> Aprobar Todo
            </button>
            <button class="btn-cancel" style="background:#f1f5f9; color:#475569;" onclick="toggleAprobacionMasiva(false)" title="Desaprobar todo">
                Desaprobar Todo
            </button>
            <button id="btn-email-tesoreria" class="btn-icon" onclick="enviarPlanPagosEmail()" title="Enviar Plan de Pagos por Correo">
                <i class='bx bx-envelope' style="color: #4f46e5; font-size: 1.8rem;"></i>
            </button>
        `;
        container.insertAdjacentHTML('afterbegin', controlesExtra);
    }

    /**
     * Actualiza el monto en el array local cuando gerencia edita el input.
     * Se sincroniza con window.tesoreriaData para evitar errores de ReferenceError.
     */
    window.actualizarMontoLocal = function(id, valor) {
        // 🛡️ Verificamos que la variable global exista antes de buscar
        const data = window.tesoreriaData || (typeof tesoreriaData !== 'undefined' ? tesoreriaData : null);
        
        if (!data) {
            console.warn("⚠️ Advertencia: tesoreriaData aún no ha sido inicializada.");
            return;
        }

        // Buscamos la factura específica por ID
        const factura = data.find(f => f.id === id);
        
        if (factura) {
            // Convertimos el valor del input a número, manejando casos vacíos como 0
            factura.monto_aprobado = parseFloat(valor) || 0;
            
            // Log de seguimiento para depuración en consola
            console.log(`✅ Monto local actualizado: ID ${id} -> ${factura.monto_aprobado}`);
        } else {
            console.error(`❌ No se encontró la factura con ID ${id} en tesoreriaData.`);
        }
    };

    // ==========================================
    // SECCIÓN: UTILIDADES DE CONTROL DE FLUJO
    // ==========================================

    /**
     * Abre el modal de confirmación dinámico en lugar de usar confirm() nativo.
     * Se sincroniza con el HTML 'modal-confirmar-flujo'.
     */
    window.solicitarConfirmacionFlujo = function(config) {
        const modal = document.getElementById('modal-confirmar-flujo');
        const title = document.getElementById('flujo-modal-title');
        const text = document.getElementById('flujo-modal-text');
        const btn = document.getElementById('flujo-modal-btn');
        const iconContainer = document.getElementById('flujo-modal-icon');

        if (!modal) {
            console.warn("⚠️ Error: No se encontró el modal-confirmar-flujo en el HTML.");
            return;
        }

        // 1. Configurar contenido dinámico
        title.innerText = config.titulo || "Confirmar Acción";
        text.innerText = config.mensaje || "¿Estás seguro de continuar?";
        
        // 2. Configurar icono y color de botón según el tipo (danger o primary)
        if (config.tipo === 'danger') {
            iconContainer.innerHTML = "<i class='bx bx-error-circle' style='color: #ef4444; font-size: 3.5rem;'></i>";
            btn.style.backgroundColor = "#ef4444";
            btn.style.borderColor = "#ef4444";
        } else {
            iconContainer.innerHTML = "<i class='bx bx-help-circle' style='color: #3b82f6; font-size: 3.5rem;'></i>";
            btn.style.backgroundColor = "#3b82f6";
            btn.style.borderColor = "#3b82f6";
        }

        // 3. Asignar la acción de ejecución al botón
        btn.onclick = async () => {
            btn.disabled = true;
            btn.innerText = "Procesando...";
            
            try {
                await config.accion(); // Ejecuta la función (aprobar, enviar correo, etc.)
            } catch (error) {
                console.error("Error en la acción del modal:", error);
            } finally {
                cerrarModalFlujo();
                btn.disabled = false;
                btn.innerText = "Sí, Confirmar";
            }
        };

        // 4. Activar el modal visualmente
        modal.classList.add('active');
    };

    /**
     * Cierra el modal de confirmación de flujo
     */
    window.cerrarModalFlujo = () => {
        const modal = document.getElementById('modal-confirmar-flujo');
        if (modal) modal.classList.remove('active');
    };

    /**
     * Envía el Plan de Pagos vía Email con los montos finales aprobados,
     * utilizando el modal de confirmación personalizado del sistema.
     */
    window.enviarPlanPagosEmail = async function() {
        // 1. Acceso robusto a la data global para evitar ReferenceError
        const dataActual = window.tesoreriaData || (typeof tesoreriaData !== 'undefined' ? tesoreriaData : []);
        
        // 2. Filtro de facturas autorizadas
        const aprobados = dataActual.filter(f => f.aprobado_tesoreria === true || f.aprobado_tesoreria == 1);
        
        if (aprobados.length === 0) {
            return showToast("No hay facturas aprobadas para enviar el reporte. Verifique que aparezcan como 'AUTORIZADO'.", "warning");
        }

        // 3. Configuración del Modal de Confirmación en lugar de alert/confirm
        const configModal = {
            titulo: "Enviar Reporte de Pagos",
            mensaje: `¿Desea enviar el reporte de los ${aprobados.length} pagos autorizados a Gerencia por correo electrónico?`,
            tipo: "primary",
            accion: async () => {
                try {
                    // 4. Mapeo de datos con montos capturados de los inputs
                    const datosParaEnvio = aprobados.map(f => {
                        const inputMonto = document.getElementById(`input-aprob-amount-${f.id}`);
                        
                        // Prioridad: 1. Valor del input visual, 2. Valor guardado en el objeto
                        const montoFinal = inputMonto ? parseFloat(inputMonto.value) : (f.monto_aprobado || f.saldo_pendiente);
                        
                        return {
                            proveedor: f.proveedor,
                            numero_documento: f.numero_documento,
                            moneda: f.moneda,
                            monto_aprobado: montoFinal,
                            banco: f.banco || 'S/B',
                            cci: f.cci || f.numero_cuenta || '-'
                        };
                    });

                    // 5. Petición de envío al servidor
                    const res = await fetch('/api/facturas/enviar-plan-pagos', {
                        method: 'POST',
                        headers: { 
                            'Content-Type': 'application/json', 
                            'x-auth-token': localStorage.getItem('token') 
                        },
                        body: JSON.stringify({ facturas: datosParaEnvio })
                    });

                    const data = await res.json();

                    if (res.ok) {
                        showToast("✅ Plan de pagos enviado correctamente", "success");
                    } else {
                        showToast(data.msg || "Error al enviar el reporte por correo", "error");
                    }
                } catch (e) {
                    console.error("❌ Error envío email:", e);
                    showToast("Error de conexión al servidor", "error");
                }
            }
        };

        // 6. Ejecutar el modal personalizado
        if (typeof window.solicitarConfirmacionFlujo === 'function') {
            window.solicitarConfirmacionFlujo(configModal);
        } else {
            // Fallback preventivo
            if (confirm(configModal.mensaje)) configModal.accion();
        }
    };

    /**
     * 10.4 CARGAR BLOQUES DE RESUMEN (KPIs Superiores)
     * Actualizado con validación de existencia de datos y manejo de errores.
     */
    function cargarBloquesResumen(data) {
        // Definición interna del formateador de moneda local
        const fmt = (m, mon) => {
            const monto = parseFloat(m) || 0;
            const simbolo = mon === 'pen' ? 'S/ ' : '$ ';
            return simbolo + monto.toLocaleString('es-PE', { 
                minimumFractionDigits: 2, 
                maximumFractionDigits: 2 
            });
        };

        // Validación: Si no hay data, inicializamos un objeto vacío para evitar errores
        const safeData = data || {
            Operativo: { pen: 0, usd: 0 },
            Implementacion: { pen: 0, usd: 0 },
            Financiero: { pen: 0, usd: 0 }
        };

        try {
            // --- Bloque Operativo ---
            const opPen = document.getElementById('block-op-pen');
            const opUsd = document.getElementById('block-op-usd');
            if (opPen) opPen.innerText = fmt(safeData.Operativo?.pen || 0, 'pen');
            if (opUsd) opUsd.innerText = fmt(safeData.Operativo?.usd || 0, 'usd');

            // --- Bloque Implementación ---
            const impPen = document.getElementById('block-imp-pen');
            const impUsd = document.getElementById('block-imp-usd');
            if (impPen) impPen.innerText = fmt(safeData.Implementacion?.pen || 0, 'pen');
            if (impUsd) impUsd.innerText = fmt(safeData.Implementacion?.usd || 0, 'usd');

            // --- Bloque Financiero ---
            const finPen = document.getElementById('block-fin-pen');
            const finUsd = document.getElementById('block-fin-usd');
            if (finPen) finPen.innerText = fmt(safeData.Financiero?.pen || 0, 'pen');
            if (finUsd) finUsd.innerText = fmt(safeData.Financiero?.usd || 0, 'usd');

        } catch (error) {
            console.error("❌ Error al cargar los bloques de resumen:", error);
        }
    }
    // Variables para controlar el estado del orden (fuera de la función)
    let ordenColumnaGasto = '';
    let ordenAscendenteGasto = true;

   /**
     * 10.6 ORDENAR GASTOS (Corregido para Días de Mora)
     */
    window.ordenarGastos = function(columna) {
        console.log("Ordenando por:", columna);

        if (ordenColumnaGasto === columna) {
            ordenAscendenteGasto = !ordenAscendenteGasto;
        } else {
            ordenColumnaGasto = columna;
            ordenAscendenteGasto = true;
        }

        facturasData.sort((a, b) => {
            let valA = a[columna];
            let valB = b[columna];

            // --- CASO ESPECIAL: DÍAS DE MORA ---
            if (columna === 'dias_mora' || columna === 'dias_vencimiento') {
                // Convertimos a número puro. Si es null/undefined, usamos 0.
                // Si viene como string "10 días", parseInt extraerá el 10.
                let numA = parseInt(valA) || 0;
                let numB = parseInt(valB) || 0;
                
                return ordenAscendenteGasto ? numA - numB : numB - numA;
            }

            // --- CASO ESPECIAL: MONTOS ---
            if (columna === 'monto_total') {
                let montoA = parseFloat(valA) || 0;
                let montoB = parseFloat(valB) || 0;
                return ordenAscendenteGasto ? montoA - montoB : montoB - montoA;
            }

            // --- CASO GENERAL: FECHAS O TEXTO ---
            valA = (valA || '').toString().toLowerCase();
            valB = (valB || '').toString().toLowerCase();

            if (ordenAscendenteGasto) {
                return valA.localeCompare(valB);
            } else {
                return valB.localeCompare(valA);
            }
        });

        // Reiniciar paginación para ver los resultados desde el principio
        if (typeof paginaGastos !== 'undefined') paginaGastos = 1;
        
        // IMPORTANTE: Volver a dibujar la tabla
        renderizarTablaGastos();
    };

    /**
     * 10.5 FILTRAR POR COLUMNA (Actualizado para respetar paginación)
     */
    window.filtrarColumna = function(input, colIndex, tbodyId) {
        const filter = input.value.toLowerCase().trim();
        
        if (tbodyId === 'tabla-cuentas-body') {
            // Filtrar sobre los datos reales para no romper la paginación
            paginaCuentas = 1;
            
            // Volvemos a llenar la variable desde la base
            const baseCuentas = facturasData.filter(f => 
                f.estado_pago !== 'pagado' && f.estado_pago !== 'anulado' && f.programado_hoy === false
            );

            if (filter === '') {
                cuentasData = [...baseCuentas];
            } else {
                cuentasData = baseCuentas.filter(c => {
                    // colIndex 3 = Proveedor, colIndex 4 = Documento
                    if (colIndex === 3) return (c.proveedor || '').toLowerCase().includes(filter);
                    if (colIndex === 4) return (c.numero_documento || '').toLowerCase().includes(filter);
                    return true;
                });
            }
            renderizarTablaCuentas();
        } else if (tbodyId === 'tabla-facturas-body') {
            // Ya tienes la lógica correcta en renderizarTablaGastos()
            paginaGastos = 1;
            renderizarTablaGastos();
        }
    };

    /**
     * 10.6 EXPORTAR EXCEL ESPECÍFICO DE TESORERÍA
     */
    window.exportarExcelTesoreria = function() {
        const dataLocal = window.tesoreriaData || [];
        if (dataLocal.length === 0) {
            return showToast("No hay datos autorizados o programados para exportar hoy.", "warning");
        }
        
        const separador = ";"; 
        let csvContent = "\uFEFF"; // BOM para Excel LATAM
        
        const headers = ["Clasificación", "Proveedor", "N° Documento", "Banco", "Cuenta", "CCI", "Moneda", "Deuda Original", "Monto a Pagar Hoy", "Estado Tesorería"];
        csvContent += headers.join(separador) + "\n";

        dataLocal.forEach(f => {
            const clasif = f.clasificacion || 'Operativo';
            const prov = f.proveedor ? `"${f.proveedor}"` : '""';
            const doc = f.numero_documento ? `"${f.numero_documento}\t"` : '""'; // \t evita formato científico
            const banco = f.banco ? `"${f.banco}"` : '""';
            const cta = f.numero_cuenta ? `"${f.numero_cuenta}\t"` : '""';
            const cci = f.cci ? `"${f.cci}\t"` : '""';
            
            // Si está autorizado usa el monto_aprobado, si no, muestra lo que debe (saldo)
            const montoPagar = f.aprobado_tesoreria ? (f.monto_aprobado || f.saldo_pendiente) : 0;
            const estadoStr = f.aprobado_tesoreria ? "AUTORIZADO" : "PENDIENTE";

            const row = [
                clasif, prov, doc, banco, cta, cci, f.moneda || 'PEN',
                parseFloat(f.saldo_pendiente).toFixed(2).replace('.', ','),
                parseFloat(montoPagar).toFixed(2).replace('.', ','),
                estadoStr
            ];
            
            csvContent += row.join(separador) + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.setAttribute("href", URL.createObjectURL(blob));
        link.setAttribute("download", `Plan_Tesoreria_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast("Plan de Tesorería descargado correctamente", "success");
    };

// --- ARRANQUE FACTURAS (Con Timeout protector) ---
    window.initFacturas = function() {
        console.log("▶️ Iniciando módulo Finanzas y Tesorería...");
        setTimeout(() => {
            if (typeof initModulo === 'function') initModulo(); 
        }, 150);
    };

    if (document.getElementById('tabla-facturas-body') || document.querySelector('.facturas-container')) {
        window.initFacturas();
    }
})();