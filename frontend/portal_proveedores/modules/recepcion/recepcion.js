// Ubicacion: SuperNova/frontend/modules/recepcion/recepcion.js

(function() {
    console.log("Módulo Recepción de Facturas Cargado (Versión Final Blindada) 🛡️");
    // ==========================================
    // 0. MOTOR DEL MODAL CAMALEÓN
    // ==========================================
    let alertaCallback = null;
    let tasaDeLaOC = null

    window.mostrarAlertaB2B = function(titulo, mensaje, tipo = 'success', callback = null) {
        const overlay = document.getElementById('modal-alerta-b2b');
        const iconDiv = document.getElementById('modal-b2b-icon');
        const titleEl = document.getElementById('modal-b2b-title');
        const msgEl = document.getElementById('modal-b2b-message');
        const btnEl = document.getElementById('modal-b2b-btn');

        // Aplicar colores
        iconDiv.className = 'modal-b2b-icon ' + tipo;
        btnEl.className = 'btn-b2b-confirm ' + tipo;

        // Cambiar icono
        if (tipo === 'success') iconDiv.innerHTML = "<i class='bx bx-check-circle'></i>";
        if (tipo === 'error') iconDiv.innerHTML = "<i class='bx bx-x-circle'></i>";
        if (tipo === 'warning') iconDiv.innerHTML = "<i class='bx bx-error-circle'></i>";

        titleEl.innerText = titulo;
        msgEl.innerText = mensaje;
        alertaCallback = callback; // Guardar acción futura

        overlay.classList.add('active');
    };

    window.cerrarAlertaB2B = function() {
        document.getElementById('modal-alerta-b2b').classList.remove('active');
        if (alertaCallback) alertaCallback(); // Recarga la página si se configuró así
    };

    // Seleccionamos los elementos principales
    const subtotalInput = document.getElementById('rec-subtotal');
    const igvInput = document.getElementById('rec-igv');
    const totalInput = document.getElementById('rec-total');
    const form = document.getElementById('form-subir-factura');

    // ==========================================
    // 1. CÁLCULO MATEMÁTICO AUTOMÁTICO (INTELIGENTE)
    // ==========================================
    const tipoDocSelect = document.getElementById('rec-tipo');
    const tipoImpuestoSelect = document.getElementById('rec-tipo-impuesto');

    function calcularMontos() {
        if (!subtotalInput) return;
        
        let subtotal = parseFloat(subtotalInput.value);
        let tasa = parseFloat(tipoImpuestoSelect.value);
        
        if (isNaN(subtotal) || subtotal <= 0) {
            igvInput.value = '';
            totalInput.value = '';
            return;
        }

        let montoImpuesto = subtotal * tasa;
        let total = 0;

        // Si es Retención (8%), se RESTA del subtotal. Si es IGV, se SUMA.
        if (tasa === 0.08) {
            total = subtotal - montoImpuesto;
        } else {
            total = subtotal + montoImpuesto;
        }

        igvInput.value = montoImpuesto.toFixed(2);
        totalInput.value = total.toFixed(2);
    }

    if (subtotalInput) subtotalInput.addEventListener('input', calcularMontos);
    if (tipoImpuestoSelect) tipoImpuestoSelect.addEventListener('change', calcularMontos);

    // 🔥 LA MAGIA CONTABLE: Cambiar opciones y ocultar XML según el documento
    if (tipoDocSelect) {
        tipoDocSelect.addEventListener('change', function() {
            const dropXml = document.getElementById('drop-xml');

            const fileXmlInput = document.getElementById('file-xml');

            // --- 🛡️ PROTECCIÓN: Si ya validó una OC, no dejamos cambiar impuestos ---
            if (tasaDeLaOC !== null) {
                if (this.value === 'Recibo') dropXml.style.display = 'none';
                else dropXml.style.display = 'flex';
                return; // Detenemos aquí para no resetear el select de impuestos
            }
            
            // Limpiamos las opciones del select de impuestos
            tipoImpuestoSelect.innerHTML = '';

            if (this.value === 'Recibo') {
                // 1. Ocultamos la caja para subir XML
                if (dropXml) dropXml.style.display = 'none';
                if (fileXmlInput) fileXmlInput.value = ''; // Limpiamos si había subido algo por error

                // 2. Llenamos los impuestos SOLO permitidos para Recibos
                tipoImpuestoSelect.innerHTML = `
                    <option value="0.08">Retención RxH (8%)</option>
                    <option value="0">Exonerado / Inafecto (0%)</option>
                `;
            } else {
                // 1. Mostramos la caja de XML (Porque es Factura o Nota de Crédito)
                if (dropXml) dropXml.style.display = 'flex'; 

                // 2. Llenamos los impuestos permitidos para Facturas
                tipoImpuestoSelect.innerHTML = `
                    <option value="0.18">IGV (18%)</option>
                    <option value="0.105">IGV (10.5%)</option>
                    <option value="0">Exonerado / Inafecto (0%)</option>
                `;
            }
            // Recalculamos los montos con la nueva tasa
            calcularMontos(); 
        });

        // Disparamos el evento al cargar la página para que se configure correctamente desde el inicio
        tipoDocSelect.dispatchEvent(new Event('change'));
    }

    // ==========================================
    // 2. LÓGICA DE ARCHIVOS (VISUAL)
    // ==========================================
    function setupFileInput(inputId, textId, dropZoneId) {
        const fileInput = document.getElementById(inputId);
        const textElement = document.getElementById(textId);
        const dropZone = document.getElementById(dropZoneId);

        if (fileInput && textElement && dropZone) {
            fileInput.addEventListener('change', function() {
                if (this.files && this.files.length > 0) {
                    const fileName = this.files[0].name;
                    textElement.innerHTML = `<strong><i class='bx bx-check'></i> Cargado:</strong><br>${fileName}`;
                    dropZone.classList.add('file-ready');
                    // 🔥 Cambiamos el color de la cajita de la OC si sube algo
                    if(inputId === 'file-oc') {
                        dropZone.style.borderColor = '#10b981';
                        dropZone.style.backgroundColor = '#ecfdf5';
                    }
                } else {
                    textElement.innerHTML = inputId === 'file-oc' ? "Si aplica" : "Haga clic o arrastre aquí";
                    dropZone.classList.remove('file-ready');
                    if(inputId === 'file-oc') {
                        dropZone.style.borderColor = '';
                        dropZone.style.backgroundColor = '';
                    }
                }
            });
        }
    }

    setupFileInput('file-pdf', 'text-pdf', 'drop-pdf');
    setupFileInput('file-xml', 'text-xml', 'drop-xml');
    setupFileInput('file-oc', 'text-oc', 'drop-oc');

    // ==========================================
    // 3. ENVÍO REAL AL BACKEND (POST)
    // ==========================================
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            // 🕵️‍♂️ CAPTURA DINÁMICA DEL ID (Para evitar el 'undefined')
            const idHidden = document.getElementById('rec-oc-id');
            const idOC = idHidden ? idHidden.value : null;
            
            console.log("DEBUG SUBMIT - Valor capturado de OC ID:", idOC);

            // Validaciones básicas antes de subir
            if (!idOC || idOC === "" || idOC === "undefined" || isNaN(parseInt(idOC))) {
                mostrarAlertaB2B("Validación Necesaria", "Debe validar una Orden de Compra usando la lupa antes de enviar su comprobante.", "warning");
                return;
            }

            const filePdf = document.getElementById('file-pdf').files[0];
            const fileXml = document.getElementById('file-xml').files[0];
            const fileOc = document.getElementById('file-oc').files[0]; 
            const tipoDocumento = document.getElementById('rec-tipo').value;

            // 1. El PDF de la factura siempre es obligatorio
            if (!filePdf) {
                mostrarAlertaB2B("Archivo Faltante", "Por favor, adjunte obligatoriamente el archivo PDF de su comprobante.", "warning");
                return;
            }

            // 2. El XML es obligatorio SOLO si no es Recibo
            if (tipoDocumento !== 'Recibo' && !fileXml) {
                mostrarAlertaB2B("XML Requerido", "Por favor, adjunte obligatoriamente el archivo XML emitido por SUNAT para su Factura.", "warning");
                return;
            }

            // 3. 🔥 El PDF de la Orden de Compra es obligatorio SOLO si usó la lupa
            if (idOC && idOC !== "0" && idOC !== "") {
                if (!fileOc) {
                    mostrarAlertaB2B("Orden de Compra Faltante", "Ha vinculado una Orden de Compra. Es obligatorio adjuntar su PDF para fines de auditoría.", "warning");
                    return;
                }
            }

            const btnSubmit = form.querySelector('.btn-submit');
            const originalText = btnSubmit.innerHTML;
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Procesando...";

            try {
                const formData = new FormData();
                
                // Datos del Comprobante
                formData.append('tipo_documento', document.getElementById('rec-tipo').value);
                formData.append('serie', document.getElementById('rec-serie').value.toUpperCase());
                formData.append('numero_documento', document.getElementById('rec-numero').value);
                formData.append('fecha_emision', document.getElementById('rec-fecha').value);
                formData.append('fecha_vencimiento', document.getElementById('rec-vencimiento').value);
                
                // Relación con OC
                formData.append('orden_compra', document.getElementById('rec-oc').value);
                formData.append('orden_compra_id', parseInt(idOC)); 

                // Importes
                formData.append('moneda', document.getElementById('rec-moneda').value);
                formData.append('base_imponible', document.getElementById('rec-subtotal').value);
                formData.append('tasa_impuesto', document.getElementById('rec-tipo-impuesto').value);
                formData.append('monto_igv', document.getElementById('rec-igv').value);
                formData.append('monto_total', document.getElementById('rec-total').value);
                
                // Archivos (Blindados)
                formData.append('pdf', filePdf); // El PDF siempre va porque ya lo validamos arriba
                if (fileXml) formData.append('xml', fileXml); // Solo se envía si existe
                if (fileOc) formData.append('pdf_oc', fileOc); // Solo se envía si existe

                const token = localStorage.getItem('proveedor_token');

                const res = await fetch('/api/facturas/b2b/recepcion', {
                    method: 'POST',
                    headers: { 'x-auth-token': token },
                    body: formData
                });

                const data = await res.json();

                // REEMPLAZA EL BLOQUE if (res.ok) COMPLETO POR ESTO:
                if (res.ok) {
                    mostrarAlertaB2B("¡Éxito!", data.msg, "success", () => {
                        location.reload(); // Esto se ejecuta al cerrar el modal
                    });
                } else {
                    mostrarAlertaB2B("Error al subir", data.msg, "error");
                }

            } catch (error) {
                console.error("Error en el envío:", error);
                // REEMPLAZA: alert("Error de conexión con el servidor.");
                mostrarAlertaB2B("Error de Conexión", "No se pudo comunicar con el servidor.", "error");
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = originalText;
            }
        });
    }

    // ==========================================
    // 🔍 VALIDACIÓN DE OC (LA LUPA)
    // ==========================================
    window.validarOrdenCompra = async function() {
        const ocInput = document.getElementById('rec-oc');
        const hiddenInput = document.getElementById('rec-oc-id');
        const codigoOC = ocInput ? ocInput.value.trim() : "";

        if (!codigoOC) {
            mostrarAlertaB2B("Campo Vacío", "Por favor, ingrese el número de la Orden de Compra.", "warning");
            return;
        }

        const btnValidar = document.querySelector('.btn-validar-oc');
        const originalText = btnValidar.innerHTML;
        btnValidar.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";
        btnValidar.disabled = true;

        try {
            const token = localStorage.getItem('proveedor_token');
            const res = await fetch(`/api/ordenes/validar-b2b/${codigoOC}`, {
                headers: { 'x-auth-token': token }
            });
            
            const data = await res.json();

            if (res.ok) {
                // 🔥 BLINDAJE: Buscamos el ID en varias opciones por si acaso
                const idReal = data.orden?.id || data.id;
                tasaDeLaOC = data.orden?.porcentaje_impuesto ? (parseFloat(data.orden.porcentaje_impuesto) / 100) : null;
                
                if (tipoImpuestoSelect && tasaDeLaOC !== null) {
                    // Buscamos si la opción existe, si no, la creamos dinámicamente
                    let existeOpcion = Array.from(tipoImpuestoSelect.options).some(opt => parseFloat(opt.value) === tasaDeLaOC);
                    
                    if (!existeOpcion) {
                        const nuevaOpt = document.createElement('option');
                        nuevaOpt.value = tasaDeLaOC;
                        nuevaOpt.text = `Tasa OC (${data.orden.porcentaje_impuesto}%)`;
                        tipoImpuestoSelect.add(nuevaOpt);
                    }
                    
                    tipoImpuestoSelect.value = tasaDeLaOC;
                    tipoImpuestoSelect.disabled = true; // Bloqueamos para que no lo cambien
                    tipoImpuestoSelect.style.background = '#f1f5f9';
                }

                if (hiddenInput && idReal) {
                    hiddenInput.value = idReal; 
                    console.log("✅ ID Guardado exitosamente:", hiddenInput.value);
                } else {
                    // REEMPLAZA: alert("Hubo un problema al recuperar el ID...");
                    mostrarAlertaB2B("Error de Sistema", "Hubo un problema al recuperar el ID de la orden. Contacte a soporte.", "error");
                    return;
                }
                
                // Asignar Moneda
                const selectMoneda = document.getElementById('rec-moneda');
                if (selectMoneda) {
                    selectMoneda.value = data.orden?.moneda || "";
                    selectMoneda.style.pointerEvents = 'none';
                    selectMoneda.style.background = '#f1f5f9';
                }

                // Asignar Montos (con fallback a 0 si falla)
                const inSubtotal = document.getElementById('rec-subtotal');
                const inIgv = document.getElementById('rec-igv');
                const inTotal = document.getElementById('rec-total');

                if (inSubtotal) inSubtotal.value = data.orden?.subtotal || 0;
                if (inIgv) inIgv.value = data.orden?.igv || 0;
                if (inTotal) inTotal.value = data.orden?.total || 0;

                if (inSubtotal) {
                    inSubtotal.readOnly = true;
                    inSubtotal.style.background = '#f1f5f9';
                    inSubtotal.style.cursor = 'not-allowed';
                }

                // Estilo Éxito OC
                if (ocInput) {
                    ocInput.readOnly = true;
                    ocInput.style.background = '#dcfce7';
                    ocInput.style.color = '#16a34a';
                    ocInput.style.fontWeight = 'bold';
                }
                
                mostrarAlertaB2B("OC Validada", "La Orden de Compra fue validada con éxito. Los montos han sido bloqueados.", "success");
            } else {
                mostrarAlertaB2B("No Validada", data.msg || "Error al validar la orden", "error");
            }

        } catch (error) {
            console.error("Error al validar OC:", error);
            // REEMPLAZA: alert("Error de comunicación con el servidor.");
            mostrarAlertaB2B("Error de Comunicación", "No se pudo conectar con el servidor para validar.", "error");
        } finally {
            btnValidar.innerHTML = originalText;
            btnValidar.disabled = false;
        }
    };

})();