(function() {
    console.log("Módulo Recepción de Facturas Cargado");

    const subtotalInput = document.getElementById('rec-subtotal');
    const igvInput = document.getElementById('rec-igv');
    const totalInput = document.getElementById('rec-total');
    const form = document.getElementById('form-subir-factura');

    // ==========================================
    // 1. CÁLCULO MATEMÁTICO AUTOMÁTICO (IGV 18%)
    // ==========================================
    subtotalInput.addEventListener('input', () => {
        let subtotal = parseFloat(subtotalInput.value);
        if (isNaN(subtotal) || subtotal < 0) {
            igvInput.value = '';
            totalInput.value = '';
            return;
        }

        // Calculamos IGV (18%)
        let igv = subtotal * 0.18;
        let total = subtotal + igv;

        igvInput.value = igv.toFixed(2);
        totalInput.value = total.toFixed(2);
    });

    // ==========================================
    // 2. LÓGICA DE ARCHIVOS (CAMBIO DE TEXTO)
    // ==========================================
    function setupFileInput(inputId, textId, dropZoneId) {
        const fileInput = document.getElementById(inputId);
        const textElement = document.getElementById(textId);
        const dropZone = document.getElementById(dropZoneId);

        fileInput.addEventListener('change', function() {
            if (this.files && this.files.length > 0) {
                const fileName = this.files[0].name;
                textElement.innerHTML = `<strong><i class='bx bx-check'></i> Archivo cargado:</strong><br>${fileName}`;
                dropZone.classList.add('file-ready');
            } else {
                textElement.innerHTML = "Arrastre el archivo aquí o haga clic para explorar";
                dropZone.classList.remove('file-ready');
            }
        });
    }

    setupFileInput('file-pdf', 'text-pdf', 'drop-pdf');
    setupFileInput('file-xml', 'text-xml', 'drop-xml');

    // ==========================================
    // 3. ENVÍO REAL AL BACKEND (CON FETCH Y FORMDATA)
    // ==========================================
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const filePdf = document.getElementById('file-pdf').files[0];
        const fileXml = document.getElementById('file-xml').files[0];

        if (!filePdf || !fileXml) {
            alert("⚠️ Por favor, debe adjuntar obligatoriamente el archivo PDF y el XML.");
            return;
        }

        const btnSubmit = form.querySelector('.btn-submit');
        const originalText = btnSubmit.innerHTML;
        
        btnSubmit.disabled = true;
        btnSubmit.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Subiendo archivos a SuperNova...";

        try {
            // Empaquetamos todo en un FormData (Necesario para enviar archivos)
            const formData = new FormData();
            formData.append('tipo_documento', document.getElementById('rec-tipo').value);
            formData.append('serie', document.getElementById('rec-serie').value);
            formData.append('numero_documento', document.getElementById('rec-numero').value);
            formData.append('fecha_emision', document.getElementById('rec-fecha').value);
            formData.append('orden_compra', document.getElementById('rec-oc').value);
            formData.append('moneda', document.getElementById('rec-moneda').value);
            formData.append('base_imponible', document.getElementById('rec-subtotal').value);
            formData.append('monto_igv', document.getElementById('rec-igv').value);
            formData.append('monto_total', document.getElementById('rec-total').value);
            
            // Adjuntamos los archivos
            formData.append('pdf', filePdf);
            formData.append('xml', fileXml);

            // Obtenemos el Token de seguridad del proveedor
            const token = localStorage.getItem('proveedor_token');

            // Hacemos la petición al backend
            const res = await fetch('http://localhost:3000/api/facturas/b2b/recepcion', {
                method: 'POST',
                headers: {
                    'x-auth-token': token // Enviamos la llave de seguridad
                },
                body: formData // Nota: No se pone 'Content-Type' cuando se usa FormData
            });

            const data = await res.json();

            if (res.ok) {
                alert("✅ " + data.msg);
                
                // Limpiamos el formulario visualmente
                form.reset();
                document.getElementById('text-pdf').innerHTML = "Arrastre el archivo aquí o haga clic para explorar";
                document.getElementById('drop-pdf').classList.remove('file-ready');
                document.getElementById('text-xml').innerHTML = "Arrastre el archivo aquí o haga clic para explorar";
                document.getElementById('drop-xml').classList.remove('file-ready');

                // Redirigir a "Mis Comprobantes" para que la vea en la lista
                cargarModulo('comprobantes');
            } else {
                alert("❌ Error: " + (data.msg || "No se pudo subir la factura"));
            }

        } catch (error) {
            console.error("Error de red:", error);
            alert("Error de conexión con el servidor. Revise su internet.");
        } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = originalText;
        }
    });

})();