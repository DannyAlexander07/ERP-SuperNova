//Ubicacion: SUPERNOVA/frontend/modules/ordenes_compra/ordenes.js

window.initOrdenesCompra = async function() {
    console.log("Módulo Interno de Órdenes de Compra Cargado");
    const token = localStorage.getItem('token'); 

    // 1. CARGAR PROVEEDORES
    async function cargarProveedoresSelect() {
        try {
            const res = await fetch('http://localhost:3000/api/proveedores', { headers: { 'x-auth-token': token } });
            const proveedores = await res.json();
            const select = document.getElementById('oc-proveedor');
            select.innerHTML = '<option value="">Seleccione un proveedor...</option>';
            proveedores.forEach(p => select.innerHTML += `<option value="${p.id}">${p.razon_social} (RUC: ${p.ruc})</option>`);
        } catch (err) { console.error("Error cargando proveedores", err); }
    }

    // 2. CARGAR SEDES (NUEVO)
    async function cargarSedesSelect() {
        try {
            const res = await fetch('http://localhost:3000/api/sedes', { headers: { 'x-auth-token': token } });
            const sedes = await res.json();
            const select = document.getElementById('oc-sede');
            select.innerHTML = '<option value="">Seleccione una sede...</option>';
            sedes.forEach(s => select.innerHTML += `<option value="${s.id}">${s.nombre}</option>`);
        } catch (err) { console.error("Error cargando sedes", err); }
    }

    // 3. CARGAR DATOS DESDE EL API
    async function cargarTablaOC() {
        const tbody = document.getElementById('tabla-oc-interna');
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;">Cargando...</td></tr>`;
        
        try {
            const res = await fetch('http://localhost:3000/api/ordenes', { headers: { 'x-auth-token': token } });
            // 🔥 Guardamos en la variable global para paginar
            ordenesData = await res.json(); 
            
            paginaActual = 1; 
            renderizarPagina(); // Llamamos a la nueva función de dibujo
        } catch (err) { console.error("Error", err); }
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

        // Si es Retención (RxH 8%), el impuesto se RESTA del subtotal para hallar el Total a Pagar.
        // En los demás casos (IGV), se SUMA.
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
                observaciones: document.getElementById('oc-obs').value
                // 🚀 Nota: Ya no mandamos el 'codigo_oc', el backend lo autogenerará
            };

            const res = await fetch('http://localhost:3000/api/ordenes', {
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
        tbody.innerHTML = '';

        const inicio = (paginaActual - 1) * filasPorPagina;
        const fin = inicio + filasPorPagina;
        const ordenesPagina = ordenesData.slice(inicio, fin);

        ordenesPagina.forEach(oc => {
            const btnPdf = oc.archivo_pdf_url 
                ? `<a href="${oc.archivo_pdf_url}" target="_blank" style="color:#dd5555; text-decoration:none; font-weight:bold;"><i class='bx bxs-file-pdf'></i> PDF</a>` 
                : '<span style="color:#94a3b8;">Sin PDF</span>';

            tbody.innerHTML += `
                <tr>
                    <td style="color:#8aa6b4; font-weight:700;">${oc.codigo_oc}</td>
                    <td>${oc.proveedor_nombre || 'Desconocido'}</td>
                    <td>${oc.fecha_emision.split('T')[0]}</td>
                    <td><strong>${oc.moneda}</strong></td>
                    <td>${oc.moneda === 'PEN' ? 'S/' : '$'} ${parseFloat(oc.monto_total).toFixed(2)}</td>
                    <td><span class="status-badge" style="background:#dce5eb; color:#6a66c0; padding:4px 8px; border-radius:6px; font-size:11px; font-weight:bold;">${oc.estado}</span></td>
                    <td>${btnPdf}</td>
                </tr>`;
        });
        actualizarControlesPaginacion();
    }

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
