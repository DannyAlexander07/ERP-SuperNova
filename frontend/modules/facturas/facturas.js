// Ubicacion: SuperNova/frontend/modules/facturas/facturas.js
(function() { // <--- AGREGAR ESTO AL INICIO
    console.log("Modulo Facturas CONECTADO a DB");

    let facturasData = []; // Ahora se llena desde el servidor
    let paginaActual = 1;      // 🆕 AGREGAR ESTO
    const FILAS_POR_PAGINA = 10; // 🆕 AGREGAR ESTO

    function abrirModalPago(idFactura) {
        document.getElementById('pago-id-factura').value = idFactura;
        document.getElementById('modal-pago').classList.add('active');
    }

    function cerrarModalPago() {
        document.getElementById('modal-pago').classList.remove('active');
    }


    async function confirmarPago() {
        const idFactura = document.getElementById('pago-id-factura').value;
        const fechaPago = document.getElementById('pago-fecha').value;
        const metodoPago = document.getElementById('pago-metodo').value;
        const operacion = document.getElementById('pago-operacion').value;

        if (!fechaPago || !metodoPago || !operacion) {
            return showToast("Complete todos los campos del pago.", "error");
        }

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/facturas/pago/${idFactura}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-auth-token': token
                },
                body: JSON.stringify({
                    fechaPago,
                    metodoPago,
                    operacion
                })
            });

            const data = await res.json();

            // 🚨 CAMBIO CRÍTICO: Procesar primero el estado HTTP y luego el mensaje de error del cuerpo
            if (res.ok) {
                
                if (data.msg && data.msg.includes('Error')) {
                    // Si el backend envía un 200 OK pero con un mensaje de error interno (ej: factura ya pagada)
                    showToast(data.msg, "error");
                } else {
                    // Éxito real: La transacción completó
                    showToast("Pago registrado con éxito.", "success");
                    cerrarModalPago();
                    initFacturas(); // ⬅️ Recarga la tabla para mostrar PAGADO
                }
            } else {
                // Maneja 400, 500, etc.
                showToast(data.msg || "Error al registrar el pago.", "error");
            }
        } catch (error) {
            console.error("Fallo de red o parseo:", error);
            showToast("Error de conexión al registrar el pago.", "error");
        }
    }

    function subirArchivoFaltante(idFactura) {
        document.getElementById('fac-id').value = idFactura;
        document.getElementById('fac-archivo').click(); // Activa el input file
    }

    document.getElementById('fac-archivo').addEventListener('change', async function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const idFactura = document.getElementById('fac-id').value;
        const formData = new FormData();
        formData.append('archivo', file);

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/facturas/upload/${idFactura}`, {
                method: 'POST',
                headers: {
                    'x-auth-token': token
                },
                body: formData
            });

            const data = await res.json();
            if (res.ok) {
                showToast("Archivo subido con éxito.", "success");
                initFacturas(); // Recarga la tabla
            } else {
                showToast(data.msg || "Error al subir el archivo.", "error");
            }
        } catch (error) {
            showToast("Error de conexión al subir el archivo.", "error");
        }
    });

    // 1. RENDERIZAR TABLA DE FACTURAS
    function renderizarTablaFacturas(datos = facturasData) {
        const tbody = document.getElementById('tabla-facturas-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (datos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding:20px;">No hay gastos registrados.</td></tr>';
            return;
        }

        const inicio = (paginaActual - 1) * FILAS_POR_PAGINA;
        const fin = inicio + FILAS_POR_PAGINA;
        const datosPagina = datos.slice(inicio, fin);

        datosPagina.forEach(fac => {
            const tr = document.createElement('tr');
            const simbolo = fac.moneda === 'USD' ? '$' : 'S/';
            
            // Estado (Badges de colores)
            let estadoHtml = fac.estado_pago === 'pagado' 
                ? `<span class="badge bg-green" style="background:#dcfce7; color:#166534; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold;">PAGADO</span>` 
                : `<span class="badge bg-red" style="background:#fee2e2; color:#991b1b; padding:4px 8px; border-radius:4px; font-size:11px; font-weight:bold;">PENDIENTE</span>`;

            let btnPagar = fac.estado_pago === 'pendiente' 
                ? `<button class="btn-action btn-pay" title="Registrar Pago" data-id="${fac.id}"><i class='bx bx-dollar-circle'></i></button>`
                : ``;

            // --- LÓGICA DE EVIDENCIA (CORREGIDA) ---
            // El backend ahora manda 'evidencia_url', no 'url_archivo'
            const urlArchivo = fac.evidencia_url; 
            let evidenciaHtml = `<button class="btn-action btn-upload" title="Falta Evidencia" onclick="subirArchivoFaltante(${fac.id})"><i class='bx bx-upload'></i></button>`;
            
            if (urlArchivo && urlArchivo !== 'null') {
                // Limpiamos la ruta para que funcione en Windows y Linux
                // Si viene como "backend/uploads/foto.jpg", lo dejamos como "/uploads/foto.jpg"
                const rutaLimpia = urlArchivo.replace(/\\/g, '/').replace('backend/', '/');
                
                evidenciaHtml = `
                    <a href="${rutaLimpia}" target="_blank" class="btn-action btn-view" title="Ver Documento" style="text-decoration:none; color:#e74c3c;">
                        <i class='bx bxs-file-pdf' style="font-size:20px;"></i>
                    </a>
                `;
            }

            const fechaEmision = fac.fecha_emision ? fac.fecha_emision.slice(0, 10) : '-';
            const fechaVence = fac.fecha_vencimiento ? fac.fecha_vencimiento.slice(0, 10) : '-';

            tr.innerHTML = `
                <td>${fechaEmision}</td>
                <td><div style="font-weight:600;">${fac.proveedor || 'Sin Proveedor'}</div></td>
                <td style="font-family:monospace;">${fac.numero_documento || '-'}</td>
                <td style="font-weight:bold; color:#333;">${simbolo} ${parseFloat(fac.monto_neto_pagar || fac.monto_total).toFixed(2)}</td>
                <td>${fechaVence}</td>
                <td>${estadoHtml}</td>
                <td style="font-size:12px; color:#666;">${fac.sede || 'General'}</td>
                <td style="font-size:12px; color:#666;">${fac.categoria_gasto || '-'}</td>
                <td style="font-size:12px; color:#666;">${fac.orden_compra || '-'}</td>
                <td style="text-align:center;">${evidenciaHtml}</td>
                <td>
                    <div class="action-buttons">
                        ${btnPagar}
                        <button class="btn-action edit" title="Editar" data-id="${fac.id}"><i class='bx bx-edit-alt'></i></button>
                        <button class="btn-action delete" title="Eliminar" data-id="${fac.id}"><i class='bx bx-trash'></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Delegación de eventos (Para que funcionen los botones generados)
        tbody.onclick = (e) => {
            const btnPay = e.target.closest('.btn-pay');
            const btnEdit = e.target.closest('.edit');
            const btnDel = e.target.closest('.delete');

            if (btnPay) abrirModalPago(parseInt(btnPay.dataset.id));
            if (btnEdit) editarFactura(parseInt(btnEdit.dataset.id));
            if (btnDel) eliminarFactura(parseInt(btnDel.dataset.id));
        };

        renderizarPaginacion(datos.length)
    }

    // 2. FUNCIÓN DE INICIO PRINCIPAL (CONEXIÓN BACKEND)
    async function initFacturas() {
        // 1. Cargar Proveedores y Sedes para los SELECTS
        await obtenerProveedoresParaSelect();
        // 🚨 AÑADIMOS LA CARGA DE SEDES
        await obtenerSedesParaSelect(); 
        
        // 2. Configurar el file upload (debe ir aquí)
        configurarFileUpload();
        
        // 3. Cargar Facturas para la TABLA
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/facturas', { headers: { 'x-auth-token': token } });
            const data = await res.json();

            if (res.ok && Array.isArray(data)) {
                // Guardamos el array global con todos los datos (incluyendo razon_social del join)
                facturasData = data; 
                renderizarTablaFacturas(facturasData);
            } else if (res.status === 401) {
                showToast("Sesión expirada o no autorizado.", "error", "Acceso Denegado");
            }
        } catch (error) {
            console.error("Error al cargar la lista de facturas:", error);
        }
    }



    async function guardarFactura() {
        // 🚨 CRÍTICO: Leemos el ID al inicio para determinar el método (POST/PUT)
        const id = document.getElementById('fac-id').value;
        
        const proveedorId = document.getElementById('fac-proveedor').value;
        const total = parseFloat(document.getElementById('fac-total').value) || 0;
        
        // Validación (mínima)
        if(!proveedorId || !document.getElementById('fac-glosa').value || total <= 0) {
            return showToast("Datos incompletos (Proveedor, Glosa o Monto).", "error");
        }

        const formData = new FormData();
        
        formData.append('proveedorId', proveedorId);
        
        // CAMPOS P&L
        formData.append('sede', document.getElementById('fac-sede').value); 
        formData.append('categoria', document.getElementById('fac-linea').value); 
        
        // CAMPOS GENERALES Y DOCUMENTO
        formData.append('glosa', document.getElementById('fac-glosa').value);
        formData.append('tipo', document.getElementById('fac-tipo').value);
        formData.append('serie', document.getElementById('fac-serie').value); 
        formData.append('emision', document.getElementById('fac-emision').value);
        formData.append('formaPago', document.getElementById('fac-forma-pago').value);
        formData.append('vencimiento', document.getElementById('fac-vencimiento').value);
        formData.append('moneda', document.getElementById('fac-moneda').value);
        formData.append('total', total);
        
        // DETRACCIONES
        formData.append('neto', document.getElementById('fac-neto').value);
        formData.append('tieneDetraccion', document.getElementById('check-detraccion').checked);
        formData.append('porcentajeDet', document.getElementById('fac-porcentaje-det').value);
        formData.append('montoDet', document.getElementById('fac-monto-det').value);
        formData.append('oc', document.getElementById('fac-oc').value);
        


        // ARCHIVO
        const fileInput = document.getElementById('fac-archivo');
        if(fileInput.files[0]) formData.append('evidencia', fileInput.files[0]);

        const btn = document.querySelector('#modal-factura .btn-primary');
        const txtOriginal = btn.innerText;
        btn.innerText = "Guardando..."; btn.disabled = true;

        try {
            const token = localStorage.getItem('token');
            // 🚨 USO DEL ID PARA DEFINIR URL y MÉTODO: Soluciona la duplicación
            const url = id ? `/api/facturas/${id}` : '/api/facturas';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'x-auth-token': token },
                body: formData
            });
            
            const data = await res.json();

            if (res.ok) {
                showToast(`Factura ${id ? 'actualizada' : 'registrada'}.`, "success");
                cerrarModalFactura();
                initFacturas();
            } else {
                showToast(`Error: ${data.msg}`, "error");
            }
        } catch (e) { 
            console.error(e);
            showToast("Error de conexión", "error");
        } finally {
            btn.innerText = txtOriginal; btn.disabled = false;
        }
    }

    // 4. CRUD: EDITAR
    async function editarFactura(id) {
        const factura = facturasData.find(f => f.id == id);
        if (!factura) return showToast("Factura no encontrada.", "error");

        // 1. Asignación del ID (CRÍTICO para evitar duplicación)
        document.getElementById('fac-id').value = factura.id; 
        
        // 2. Abrir modal y disparar la carga de selects
        // La función abrirModalFactura ya maneja la llamada ASÍNCRONA a la carga de datos.
        await abrirModalFactura();
        
        document.querySelector('.modal-header h3').innerText = "Editar Factura";
        
        // 🚨 PROBLEMA: La asignación debe esperar a que la carga termine.
        // Usaremos un setTimeout para dar tiempo al navegador de llenar los selects.
        
        setTimeout(() => {
            // 3. ASIGNACIÓN DE CAMPOS
            
            // Asignamos Proveedor (fac-proveedor) y Sede (fac-sede)
            // CRÍTICO: El DOM debe estar cargado
            document.getElementById('fac-proveedor').value = factura.proveedor_id || ""; 
            document.getElementById('fac-sede').value = factura.sede_id || "";
            
            // Campos que no son selects (ya deberían estar bien)
            document.getElementById('fac-glosa').value = factura.descripcion;
            document.getElementById('fac-oc').value = factura.orden_compra || ''; 
            
            // ... (El resto de la asignación de campos sigue igual) ...
            document.getElementById('fac-linea').value = factura.categoria_gasto || "";
            document.getElementById('fac-tipo').value = factura.tipo_documento || 'Factura';
            document.getElementById('fac-serie').value = factura.numero_documento; 
            document.getElementById('fac-emision').value = factura.fecha_emision.slice(0, 10);
            document.getElementById('fac-vencimiento').value = factura.fecha_vencimiento ? factura.fecha_vencimiento.slice(0, 10) : "";
            document.getElementById('fac-moneda').value = factura.moneda; 
            document.getElementById('fac-total').value = factura.monto_total;
            
            // Detracción
            const checkDet = document.getElementById('check-detraccion');
            checkDet.checked = factura.tiene_detraccion;
            
            calcularMontos(); 
            toggleDetraccion(); 
            
            // Muestra archivo si existe
            const display = document.getElementById('file-name-display');
            const urlArchivo = factura.evidencia_url;
            if (urlArchivo) {
                const nombreArchivo = urlArchivo.split('/').pop();
                display.innerText = "📄 Archivo actual: " + nombreArchivo;
            }

        }, 200); // 🚨 Esperar 200ms para que las llamadas ASÍNCRONAS de fetch terminen de llenar los selects.
    }

    // 5. CRUD: ELIMINAR
    async function eliminarFactura(id) {
        const confirmado = await showConfirm("Esta acción no se puede deshacer.", "¿Eliminar Factura?");

        if (confirmado) {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`/api/facturas/${id}`, {
                    method: 'DELETE',
                    headers: { 'x-auth-token': token }
                });

                if (res.ok) {
                    showToast("Factura eliminada.", "success");
                    initFacturas();
                } else {
                    showToast("Fallo al eliminar.", "error");
                }
            } catch (error) {
                showToast("Error de conexión", "error");
            }
        }
    }


    // --- 6. UTILIDADES DE CÁLCULO ---
    function calcularVencimiento() {
        const emision = document.getElementById('fac-emision').value;
        const formaPago = document.getElementById('fac-forma-pago').value;
        const vencimientoInput = document.getElementById('fac-vencimiento');

        // Only auto-calculate if the due date field is empty (allows manual override)
        if(emision && !vencimientoInput.value) {
            const fecha = new Date(emision);
            let dias = 0;
            if(formaPago.includes("7")) dias = 7;
            if(formaPago.includes("15")) dias = 15;
            if(formaPago.includes("30")) dias = 30;

            fecha.setDate(fecha.getDate() + dias + 1);
            vencimientoInput.value = fecha.toISOString().split('T')[0];
        }
    }

    function toggleDetraccion() {
        const check = document.getElementById('check-detraccion');
        const bloque = document.getElementById('bloque-detraccion');
        if(bloque) bloque.style.display = check.checked ? 'grid' : 'none';
        calcularMontos(); 
    }

    function calcularMontos() {
        const totalInput = parseFloat(document.getElementById('fac-total').value) || 0;
        
        // A. Detracción
        const checkDetraccion = document.getElementById('check-detraccion');
        let montoDetraccion = 0;
        
        if (checkDetraccion && checkDetraccion.checked) {
            const porcentaje = parseFloat(document.getElementById('fac-porcentaje-det').value) || 0;
            
            // 🛡️ BLINDAJE MATEMÁTICO: Redondeo a 2 decimales para evitar errores de precisión de JS
            // (Monto * Porcentaje) / 100 con corrección de decimales
            montoDetraccion = Math.round((totalInput * (porcentaje / 100)) * 100) / 100;
        }

        // B. Cálculo del Neto
        // Se resta usando enteros (multiplicando por 100) para garantizar precisión monetaria
        const netoPagar = Math.round((totalInput - montoDetraccion) * 100) / 100;

        // C. Mostrar montos finales en la UI
        const inputMontoDet = document.getElementById('fac-monto-det');
        if (inputMontoDet) {
            inputMontoDet.value = montoDetraccion.toFixed(2);
        }
        
        const inputNeto = document.getElementById('fac-neto');
        if (inputNeto) {
            inputNeto.value = netoPagar.toFixed(2);
        }

        // Registro en consola para auditoría rápida en desarrollo
        console.log(`Cálculo: Total ${totalInput} | Detracc. ${montoDetraccion} | Neto ${netoPagar}`);
    }

    // 7. FUNCIÓN PARA LLENAR EL SELECT DE PROVEEDORES
    async function obtenerProveedoresParaSelect() {
        const selectProv = document.getElementById('fac-proveedor');
        if (!selectProv) return;

        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const res = await fetch('/api/proveedores', { headers: { 'x-auth-token': token } });
            const data = await res.json();

            if (res.ok && Array.isArray(data)) {
                selectProv.innerHTML = '<option value="" disabled selected>Seleccionar...</option>';
                data.forEach(p => {
                    let opt = document.createElement('option');
                    opt.value = p.id; 
                    opt.innerText = `${p.razon_social} (${p.ruc.substring(0,4)}...)`;
                    selectProv.appendChild(opt);
                });
            }
        } catch (error) {
            console.error("Error cargando proveedores para select:", error);
        }
    }


    // 7. FUNCIÓN PARA LLENAR EL SELECT DE SEDES (CENTRO DE COSTO)
    async function obtenerSedesParaSelect() {
        const selectSede = document.getElementById('fac-sede');
        if (!selectSede) return;
        
        // Limpieza inicial
        selectSede.innerHTML = '<option value="" disabled selected>Seleccionar Sede...</option>';

        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // Asumimos que el endpoint /api/usuarios/sedes devuelve { id, nombre }
            const res = await fetch('/api/usuarios/sedes', { headers: { 'x-auth-token': token } }); 
            const data = await res.json();

            if (res.ok && Array.isArray(data)) {
                data.forEach(s => {
                    let opt = document.createElement('option');
                    opt.value = s.id; 
                    opt.innerText = s.nombre;
                    selectSede.appendChild(opt);
                });
            }
        } catch (error) {
            console.error("Error cargando sedes para select:", error);
            selectSede.innerHTML = '<option value="" disabled selected>Error de carga</option>';
        }
    }


    // 8. CONTROL DEL MODAL (MEJORADO)
    async function abrirModalFactura() { 
        // 🚨 MODIFICACIÓN CRÍTICA: La función debe esperar la carga de selects
        
        // 1. Ejecutar las cargas ASÍNCRONAS y esperar su finalización
        await Promise.all([
            obtenerProveedoresParaSelect(),
            obtenerSedesParaSelect()
        ]);
        
        // 2. Abrir el modal SÓLO cuando los datos estén listos
        document.getElementById('modal-factura').classList.add('active');
        
        // 3. (Resto de la lógica sigue igual)
        if(!document.getElementById('fac-id').value) {
            document.getElementById('fac-emision').valueAsDate = new Date();
        }
    }


    function cerrarModalFactura() { 
        document.getElementById('modal-factura').classList.remove('active');
        
        const form = document.getElementById('form-nueva-factura');
        form.reset();
        
        // 🚨 CORRECCIÓN CRÍTICA: Se limpia el ID solo DESPUÉS del proceso de edición/creación.
        // Esto asegura que si EDITAR FACTURA llama a esta función, el ID no se borre inmediatamente.
        // Aunque la lógica de editarFactura está diseñada para setear el valor ANTES de que el modal se abra,
        // debemos forzar la limpieza aquí para que el próximo clic en "Registrar Gasto" (Crear) empiece limpio.
        document.getElementById('fac-id').value = ""; 
        
        // Restaurar estado visual
        const inputs = document.querySelectorAll('#form-nueva-factura input, #form-nueva-factura select');
        inputs.forEach(input => input.disabled = false);
        document.querySelector('.modal-footer .btn-primary').style.display = 'block';
        document.querySelector('.modal-header h3').innerText = "Nuevo Gasto / Compra";
        document.getElementById('bloque-detraccion').style.display = 'none';
        document.getElementById('file-name-display').innerText = "";
    }

    // 9. EXPORTAR A EXCEL (VERSIÓN ACTUALIZADA Y BLINDADA)
    function exportarExcel() {
        if (!facturasData || facturasData.length === 0) {
            return showToast("No hay datos para exportar.", "info");
        }

        // 1. Mapeo y Formato de Datos Profesional
        const datosFormateados = facturasData.map(fac => {
            // Cálculos de seguridad para el reporte
            const montoTotal = parseFloat(fac.monto_total) || 0;
            const montoNeto = parseFloat(fac.monto_neto_pagar || fac.monto_total) || 0;
            const montoDetraccion = Math.round((montoTotal - montoNeto) * 100) / 100;
            
            return {
                "ID SISTEMA": fac.id,
                "FECHA EMISIÓN": fac.fecha_emision ? fac.fecha_emision.slice(0, 10) : '-',
                "PROVEEDOR": (fac.proveedor || 'Sin Proveedor').toUpperCase(),
                "SEDE / CENTRO COSTO": (fac.sede || 'General').toUpperCase(),
                "LÍNEA DE NEGOCIO": (fac.categoria_gasto || '-').toUpperCase(),
                "TIPO DOC": (fac.tipo_documento || 'Factura').toUpperCase(),
                "SERIE-CORRELATIVO": fac.numero_documento || '-',
                "ORDEN COMPRA": fac.orden_compra || '-',
                "DESCRIPCIÓN / GLOSA": fac.descripcion || '',
                "MONEDA": fac.moneda || 'PEN',
                "MONTO TOTAL": montoTotal.toFixed(2),
                "DETRACCIÓN": montoDetraccion.toFixed(2),
                "NETO A PAGAR": montoNeto.toFixed(2),
                "FECHA VENCIMIENTO": fac.fecha_vencimiento ? fac.fecha_vencimiento.slice(0, 10) : '-',
                "ESTADO PAGO": (fac.estado_pago || 'PENDIENTE').toUpperCase(),
                "N° OPERACIÓN": fac.numero_operacion || '-'
            };
        });

        // 2. Crear la Hoja de Trabajo (Worksheet)
        const ws = XLSX.utils.json_to_sheet(datosFormateados);

        // 🛡️ BLINDAJE VISUAL: Configurar anchos de columna automáticos para mejor lectura
        const colWidths = [
            { wch: 10 }, // ID
            { wch: 15 }, // Fecha Emisión
            { wch: 35 }, // Proveedor
            { wch: 20 }, // Sede
            { wch: 20 }, // Línea
            { wch: 12 }, // Tipo Doc
            { wch: 20 }, // Serie
            { wch: 15 }, // OC
            { wch: 40 }, // Descripción
            { wch: 10 }, // Moneda
            { wch: 15 }, // Total
            { wch: 15 }, // Detracción
            { wch: 15 }, // Neto
            { wch: 15 }, // Vencimiento
            { wch: 15 }, // Estado
            { wch: 15 }  // Operación
        ];
        ws['!cols'] = colWidths;

        // 3. Crear el Libro de Trabajo (Workbook)
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reporte_Gastos");

        // 4. Generar y Descargar el Archivo con nombre fechado
        const fechaDescarga = new Date().toISOString().slice(0, 10);
        const nombreArchivo = `SuperNova_Reporte_Gastos_${fechaDescarga}.xlsx`;
        
        try {
            XLSX.writeFile(wb, nombreArchivo);
            showToast("Archivo Excel generado con éxito.", "success", "Exportación");
        } catch (error) {
            console.error("Error al exportar Excel:", error);
            showToast("Error al generar el archivo Excel.", "error");
        }
    }

    // 8. CONFIGURAR SUBIDA DE ARCHIVOS (Visual)
        function configurarFileUpload() {
            const dropZone = document.getElementById('drop-zone');
            const fileInput = document.getElementById('fac-archivo');
            const display = document.getElementById('file-name-display');

            if(!dropZone || !fileInput) return;

            // Click en el cuadro gris abre el selector
            dropZone.onclick = () => fileInput.click();
            
            // Cuando seleccionan archivo, mostrar nombre
            fileInput.onchange = () => {
                if(fileInput.files[0]) {
                    display.innerText = "📄 " + fileInput.files[0].name;
                    dropZone.style.borderColor = "#4caf50"; // Verde
                }
            };

            // Efectos visuales Drag & Drop (Opcional pero pro)
            dropZone.ondragover = (e) => { e.preventDefault(); dropZone.style.borderColor = "#695CFE"; dropZone.style.background = "#f0f0ff"; };
            dropZone.ondragleave = () => { dropZone.style.borderColor = "#ccc"; dropZone.style.background = "transparent"; };
            dropZone.ondrop = (e) => {
                e.preventDefault();
                dropZone.style.borderColor = "#4caf50";
                if(e.dataTransfer.files[0]) {
                    fileInput.files = e.dataTransfer.files; // Asignar archivo soltado
                    display.innerText = "📄 " + e.dataTransfer.files[0].name;
                }
            };
        }

        // --- FUNCIONES DE PAGINACIÓN ACTUALIZADAS ---

    function renderizarPaginacion(totalItems) {
        const contenedor = document.getElementById('facturas-paginacion');
        if (!contenedor) return;

        // 🛡️ BLINDAJE LÓGICO: Recalcular total de páginas
        const totalPaginas = Math.ceil(totalItems / FILAS_POR_PAGINA);
        
        // Si no hay ítems o solo hay una página, ocultamos los controles
        if (totalPaginas <= 1) {
            contenedor.innerHTML = '';
            return;
        }

        // 🛡️ SEGURIDAD DE RANGO: Si al filtrar la páginaActual queda fuera de rango, resetear a la última disponible
        if (paginaActual > totalPaginas) {
            paginaActual = totalPaginas;
        }
        if (paginaActual < 1) {
            paginaActual = 1;
        }

        // Renderizado con estilos unificados de SuperNova
        contenedor.innerHTML = `
            <div class="pagination-container">
                <span>Mostrando página <strong>${paginaActual}</strong> de <strong>${totalPaginas}</strong></span>
                <div style="display: flex; gap: 8px;">
                    <button 
                        class="btn-secondary" 
                        onclick="cambiarPaginaFacturas(-1)" 
                        ${paginaActual === 1 ? 'disabled' : ''} 
                        title="Anterior"
                    >
                        <i class='bx bx-chevron-left'></i>
                    </button>
                    <button 
                        class="btn-secondary" 
                        onclick="cambiarPaginaFacturas(1)" 
                        ${paginaActual >= totalPaginas ? 'disabled' : ''} 
                        title="Siguiente"
                    >
                        <i class='bx bx-chevron-right'></i>
                    </button>
                </div>
            </div>
        `;
    }

    // Función auxiliar para el cambio de página (Asegúrate de tenerla así)
    window.cambiarPaginaFacturas = function(delta) {
        paginaActual += delta;
        
        // Al cambiar de página, volvemos arriba de la tabla para mejorar la UX
        const tablaContenedor = document.querySelector('.table-responsive');
        if (tablaContenedor) {
            tablaContenedor.scrollTop = 0;
        }

        // Redibujar la tabla (usa facturasData que es el array global con los datos cargados)
        renderizarTablaFacturas(facturasData); 
    };

    function filtrarFacturas() {
        const busqueda = document.getElementById('buscador-facturas').value.toLowerCase();
        const fechaFiltro = document.getElementById('filtro-fecha').value;

        const filtrados = facturasData.filter(fac => {
            const coincideTexto = (fac.proveedor || '').toLowerCase().includes(busqueda) || 
                                (fac.numero_documento || '').toLowerCase().includes(busqueda) ||
                                (fac.descripcion || '').toLowerCase().includes(busqueda);
            
            const coincideFecha = !fechaFiltro || (fac.fecha_emision && fac.fecha_emision.startsWith(fechaFiltro));
            
            return coincideTexto && coincideFecha;
        });

        paginaActual = 1; // Resetear a la primera página al filtrar
        renderizarTablaFacturas(filtrados);
    }

    // Vincular listeners de búsqueda
    const inputBuscador = document.getElementById('buscador-facturas');
    if(inputBuscador) inputBuscador.addEventListener('input', filtrarFacturas);

    const inputFecha = document.getElementById('filtro-fecha');
    if(inputFecha) inputFecha.addEventListener('change', filtrarFacturas);

    // Exponer funciones al contexto global (window) para que el HTML las vea
    window.initFacturas = initFacturas;
    window.guardarFactura = guardarFactura;
    window.editarFactura = editarFactura;
    window.eliminarFactura = eliminarFactura;
    window.abrirModalPago = abrirModalPago;
    window.cerrarModalPago = cerrarModalPago;
    window.confirmarPago = confirmarPago;
    window.subirArchivoFaltante = subirArchivoFaltante;
    window.abrirModalFactura = abrirModalFactura;
    window.cerrarModalFactura = cerrarModalFactura;
    window.exportarExcel = exportarExcel;
    window.calcularVencimiento = calcularVencimiento;
    window.toggleDetraccion = toggleDetraccion;
    window.calcularMontos = calcularMontos;
    window.filtrarFacturas = filtrarFacturas;
    window.cambiarPaginaFacturas = cambiarPaginaFacturas; // Agregué esta que faltaba en tu lista

    // Inicializar al cargar
    initFacturas();

})();