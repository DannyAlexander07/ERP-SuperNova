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

    // 3. CARGAR LA TABLA DE ÓRDENES
    async function cargarTablaOC() {
        const tbody = document.getElementById('tabla-oc-interna');
        tbody.innerHTML = `<tr><td colspan="7">Cargando...</td></tr>`;
        
        try {
            const res = await fetch('http://localhost:3000/api/ordenes', { headers: { 'x-auth-token': token } });
            const ordenes = await res.json();
            
            tbody.innerHTML = '';
            ordenes.forEach(oc => {
                const btnPdf = oc.archivo_pdf_url 
                    ? `<a href="${oc.archivo_pdf_url}" target="_blank" class="btn-pdf"><i class='bx bxs-file-pdf'></i> PDF</a>` 
                    : '<span style="color:#94a3b8; font-size:12px;">Sin PDF</span>';

                tbody.innerHTML += `
                    <tr>
                        <td style="color:#0ea5e9; font-weight:700;">${oc.codigo_oc}</td>
                        <td>${oc.proveedor_nombre || 'Desconocido'}</td>
                        <td>${oc.fecha_emision.split('T')[0]}</td>
                        <td><strong>${oc.moneda}</strong></td>
                        <td>${oc.moneda === 'PEN' ? 'S/' : '$'} ${parseFloat(oc.monto_total).toFixed(2)}</td>
                        <td><span class="status">${oc.estado}</span></td>
                        <td>${btnPdf}</td>
                    </tr>
                `;
            });
        } catch (err) { console.error("Error cargando tabla OC", err); }
    }

    // 4. LÓGICA MATEMÁTICA (CÁLCULO AUTOMÁTICO DE IMPUESTOS Y TOTAL)
    const subtotalInput = document.getElementById('oc-subtotal');
    const impuestoSelect = document.getElementById('oc-tipo-impuesto');
    const igvInput = document.getElementById('oc-igv');
    const totalInput = document.getElementById('oc-total');

    function calcularMontos() {
        let subtotal = parseFloat(subtotalInput.value) || 0;
        let tasaImpuesto = parseFloat(impuestoSelect.value) || 0;

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

    // 5. ENVIAR FORMULARIO (CREAR OC)
    document.getElementById('form-crear-oc').addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('btn-submit-oc');
        btn.disabled = true;
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Subiendo...";

        const formData = new FormData();
        formData.append('proveedor_id', document.getElementById('oc-proveedor').value);
        formData.append('sede_id', document.getElementById('oc-sede').value);
        
        // 🚀 MAGIA: Juntamos el "OC-" fijo con el número que digitó el usuario
        const codigoFinal = "OC-" + document.getElementById('oc-codigo').value;
        formData.append('codigo_oc', codigoFinal);
        
        formData.append('fecha_emision', document.getElementById('oc-emision').value);
        formData.append('fecha_entrega_esperada', document.getElementById('oc-entrega').value);
        formData.append('moneda', document.getElementById('oc-moneda').value);
        formData.append('condicion_pago', document.getElementById('oc-condicion').value);
        
        // Enviamos los montos calculados
        formData.append('monto_subtotal', document.getElementById('oc-subtotal').value);
        formData.append('monto_igv', document.getElementById('oc-igv').value);
        formData.append('monto_total', document.getElementById('oc-total').value);
        
        formData.append('observaciones', document.getElementById('oc-obs').value);
        
        const pdfFile = document.getElementById('oc-pdf').files[0];
        if(pdfFile) formData.append('pdf', pdfFile);

        try {
            const res = await fetch('http://localhost:3000/api/ordenes', {
                method: 'POST',
                headers: { 'x-auth-token': token },
                body: formData
            });
            const data = await res.json();

            if(res.ok) {
                showMiniNotif("Orden de Compra generada y enviada a Cloudinary", "success");
                cerrarModalOC();
                cargarTablaOC(); // Recargar la tabla
            } else {
                showMiniNotif(data.msg, "error");
            }
        } catch (err) {
            showMiniNotif("Error de conexión al subir el PDF.", "error");
        } finally {
            btn.disabled = false;
            btn.innerHTML = "<i class='bx bx-save'></i> Guardar y Emitir";
        }
    });

    // Inicializar cargas base
    cargarProveedoresSelect();
    cargarSedesSelect();
    cargarTablaOC();

    // Funciones del Modal
    window.abrirModalCrearOC = () => {
        document.getElementById('form-crear-oc').reset();
        // Limpiamos los calculos en rojo/verde
        igvInput.value = '';
        totalInput.value = '';
        document.getElementById('modal-crear-oc').classList.remove('hidden');
    };
    window.cerrarModalOC = () => document.getElementById('modal-crear-oc').classList.add('hidden');
};