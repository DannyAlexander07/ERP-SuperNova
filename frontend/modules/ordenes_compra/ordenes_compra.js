//Ubicacion: SUPERNOVA/frontend/modules/ordenes_compra/ordenes_compra.js

window.initOrdenesCompra = async function() {
    console.log("Módulo Interno de Órdenes de Compra Cargado");
    const token = localStorage.getItem('token'); 

    // 1. CARGAR PROVEEDORES
    async function cargarProveedoresSelect() {
        try {
            const res = await fetch('/api/proveedores', { headers: { 'x-auth-token': token } });
            const proveedores = await res.json();
            const select = document.getElementById('oc-proveedor');
            if(!select) return;
            let options = '<option value="">Seleccione un proveedor...</option>';
            proveedores.forEach(p => options += `<option value="${p.id}">${p.razon_social} (RUC: ${p.ruc})</option>`);
            select.innerHTML = options;
        } catch (err) { console.error("Error cargando proveedores", err); }
    }

    // 2. CARGAR SEDES (NUEVO)
    async function cargarSedesSelect() {
        try {
            const res = await fetch('/api/sedes', { headers: { 'x-auth-token': token } });
            const sedes = await res.json();
            const select = document.getElementById('oc-sede');
            if(!select) return;
            let options = '<option value="">Seleccione una sede...</option>';
            sedes.forEach(s => options += `<option value="${s.id}">${s.nombre}</option>`);
            select.innerHTML = options;
        } catch (err) { console.error("Error cargando sedes", err); }
    }

    // 3. CARGAR DATOS DESDE EL API
    async function cargarTablaOC() {
        const tbody = document.getElementById('tabla-oc-interna');
        if(!tbody) return;
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;"><i class='bx bx-loader-alt bx-spin'></i> Cargando...</td></tr>`;
        
        try {
            const res = await fetch('/api/ordenes', { headers: { 'x-auth-token': token } });
            ordenesData = await res.json(); 
            paginaActual = 1; 
            renderizarPagina(); 
        } catch (err) { 
            console.error("Error", err); 
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:red;">Error al cargar datos</td></tr>`;
        }
    }

   // 4. LÓGICA MATEMÁTICA (CÁLCULO AUTOMÁTICO DE IMPUESTOS Y TOTAL)
    const subtotalInput = document.getElementById('oc-subtotal');
    const impuestoSelect = document.getElementById('oc-tipo-impuesto');
    const igvInput = document.getElementById('oc-igv');
    const totalInput = document.getElementById('oc-total');

    function calcularMontos() {
        let subtotal = parseFloat(subtotalInput.value) || 0;
        let tasaImpuesto = parseFloat(impuestoSelect.value) || 0;

        if (subtotal <= 0) {
            igvInput.value = '';
            totalInput.value = '';
            return;
        }

        let montoImpuestoCalculado = subtotal * tasaImpuesto;
        let montoTotalCalculado = 0;

        // Lógica dinámica: Si es Retención (0.08) se resta, cualquier otra tasa (0.18, 0.105) se suma.
        if (tasaImpuesto === 0.08) {
            montoTotalCalculado = subtotal - montoImpuestoCalculado;
        } else {
            montoTotalCalculado = subtotal + montoImpuestoCalculado;
        }

        igvInput.value = montoImpuestoCalculado.toFixed(2);
        totalInput.value = montoTotalCalculado.toFixed(2);
    }

    // Escuchamos cuando el usuario escribe el subtotal o cambia el tipo de impuesto
    subtotalInput.addEventListener('input', calcularMontos);
    impuestoSelect.addEventListener('change', calcularMontos);

    // ==========================================
    // 5. ENVIAR FORMULARIO (GENERAR OC Y PDF MÁGICO)
    // ==========================================
    document.getElementById('form-crear-oc').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-submit-oc');
        const originalText = btn.innerHTML;
        
        btn.disabled = true;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Generando OC y PDF...";

        try {
            // 🔥 AHORA ENVIAMOS UN JSON NORMAL (Ya no usamos FormData porque no subimos archivos manuales)
            const payload = {
                proveedor_id: document.getElementById('oc-proveedor').value,
                sede_id: document.getElementById('oc-sede').value,
                fecha_emision: document.getElementById('oc-emision').value,
                fecha_entrega_esperada: document.getElementById('oc-entrega').value || null,
                moneda: document.getElementById('oc-moneda').value,
                condicion_pago: document.getElementById('oc-condicion').value || 'Al contado',
                monto_subtotal: document.getElementById('oc-subtotal').value,
                monto_igv: document.getElementById('oc-igv').value,
                monto_total: document.getElementById('oc-total').value,
                observaciones: document.getElementById('oc-obs').value,
                porcentaje_impuesto: (parseFloat(document.getElementById('oc-tipo-impuesto').value) * 100).toFixed(2)
            };

            const res = await fetch('/api/ordenes', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-token': token 
                },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();

            if(res.ok) {
                // Asumiendo que usas 'showMiniNotif' o 'alert'
                if(typeof showMiniNotif === 'function') {
                    showMiniNotif(`¡Éxito! Orden ${data.orden.codigo_oc} generada`, "success");
                } else {
                    alert(`✅ ¡Éxito! Orden de Compra generada: ${data.orden.codigo_oc}`);
                }
                
                cerrarModalOC();
                cargarTablaOC(); // Recargar la tabla para ver el nuevo PDF
            } else {
                if(typeof showMiniNotif === 'function') {
                    showMiniNotif(data.msg, "error");
                } else {
                    alert("❌ Error: " + data.msg);
                }
            }
        } catch (err) {
            console.error(err);
            if(typeof showMiniNotif === 'function') {
                showMiniNotif("Error de conexión al generar la Orden de Compra.", "error");
            } else {
                alert("Error de conexión al generar la Orden de Compra.");
            }
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalText;
        }
    });

    let ordenesData = []; // Array global
    let paginaActual = 1;
    const filasPorPagina = 8;

    // --- 🔥 NUEVAS FUNCIONES DE PAGINACIÓN ---
    function renderizarPagina() {
        const tbody = document.getElementById('tabla-oc-interna');
        if(!tbody) return;
        let html = ''; // Acumulador

        const inicio = (paginaActual - 1) * filasPorPagina;
        const fin = inicio + filasPorPagina;
        const ordenesPagina = ordenesData.slice(inicio, fin);

        ordenesPagina.forEach(oc => {
            const btnPdf = oc.archivo_pdf_url 
                ? `<a href="${oc.archivo_pdf_url}" target="_blank" style="color:#dd5555; text-decoration:none; font-weight:bold;"><i class='bx bxs-file-pdf'></i> PDF</a>` 
                : '<span style="color:#94a3b8;">Sin PDF</span>';

            const fechaLimpia = oc.fecha_emision ? oc.fecha_emision.split('T')[0] : 'S/F';

            html += `
                <tr>
                    <td style="color:#8aa6b4; font-weight:700;">${oc.codigo_oc}</td>
                    <td>${oc.proveedor_nombre || 'Desconocido'}</td>
                    <td>${fechaLimpia}</td>
                    <td><strong>${oc.moneda}</strong></td>
                    <td>${oc.moneda === 'PEN' ? 'S/' : '$'} ${parseFloat(oc.monto_total || 0).toFixed(2)}</td>
                    <td><span class="status-badge" style="background:#dce5eb; color:#6a66c0; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold;">${oc.estado}</span></td>
                    <td>${btnPdf}</td>
                </tr>`;
        });
        tbody.innerHTML = html; // Asignación única al DOM
        actualizarControlesPaginacion();
    }

    // 🔥 NUEVA FUNCIÓN: EXPORTAR A EXCEL
    window.exportarOrdenesExcel = function() {
        if (!ordenesData || ordenesData.length === 0) {
            if(typeof mostrarToast === 'function') mostrarToast("No hay datos para exportar", "error");
            else alert("No hay datos para exportar");
            return;
        }

        // 1. Preparar los datos para SheetJS (Nombres de columnas limpios)
        const datosExcel = ordenesData.map(oc => ({
            "CÓDIGO OC": oc.codigo_oc,
            "PROVEEDOR": oc.proveedor_nombre,
            "RUC": oc.proveedor_ruc,
            "FECHA EMISIÓN": oc.fecha_emision ? oc.fecha_emision.split('T')[0] : '',
            "MONEDA": oc.moneda,
            "SUBTOTAL": parseFloat(oc.monto_subtotal).toFixed(2),
            "IMPUESTO": parseFloat(oc.monto_igv).toFixed(2),
            "TOTAL": parseFloat(oc.monto_total).toFixed(2),
            "ESTADO": oc.estado,
            "CONDICIÓN": oc.condicion_pago
        }));

        // 2. Crear el libro y la hoja
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(datosExcel);

        // 3. Añadir la hoja al libro y descargar
        XLSX.utils.book_append_sheet(wb, ws, "Ordenes_Compra");
        XLSX.writeFile(wb, `Reporte_OC_SuperNova_${new Date().toISOString().slice(0,10)}.xlsx`);

        if(typeof mostrarToast === 'function') mostrarToast("Excel generado con éxito", "success");
    };

    function actualizarControlesPaginacion() {
        const totalPaginas = Math.ceil(ordenesData.length / filasPorPagina);
        const contenedor = document.getElementById('oc-page-controls');
        const info = document.getElementById('oc-page-info');

        info.innerText = `Página ${paginaActual} de ${totalPaginas || 1}`;
        contenedor.innerHTML = '';

        // Botón Anterior
        const btnPrev = document.createElement('button');
        btnPrev.innerHTML = "<i class='bx bx-chevron-left'></i>";
        btnPrev.disabled = paginaActual === 1;
        btnPrev.onclick = () => { paginaActual--; renderizarPagina(); };
        contenedor.appendChild(btnPrev);

        // Botón Siguiente
        const btnNext = document.createElement('button');
        btnNext.innerHTML = "<i class='bx bx-chevron-right'></i>";
        btnNext.disabled = paginaActual === totalPaginas || totalPaginas === 0;
        btnNext.onclick = () => { paginaActual++; renderizarPagina(); };
        contenedor.appendChild(btnNext);
    }

    // ==========================================
    // 6. INICIALIZACIÓN Y MODALES
    // ==========================================
    cargarProveedoresSelect();
    cargarSedesSelect();
    cargarTablaOC();

    window.abrirModalCrearOC = () => {
        document.getElementById('form-crear-oc').reset();
        
        // Asignar fecha de hoy por defecto a la emisión
        const hoy = new Date().toISOString().split('T')[0];
        document.getElementById('oc-emision').value = hoy;
        
        // Limpiamos los calculos numéricos
        igvInput.value = '';
        totalInput.value = '';
        
        document.getElementById('modal-crear-oc').classList.remove('hidden');
    };
    
    window.cerrarModalOC = () => {
        document.getElementById('modal-crear-oc').classList.add('hidden');
    };
};
