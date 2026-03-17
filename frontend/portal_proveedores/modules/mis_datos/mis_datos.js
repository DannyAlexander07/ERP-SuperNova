(async function() {
    console.log("Módulo Datos Maestros Cargado - Versión Completa 🚀");
    
    const token = localStorage.getItem('proveedor_token');
    
    // Referencias a la vista (Datos Fijos)
    const readonlyInputs = document.querySelectorAll('.readonly-input');
    const rucInput = document.getElementById('perfil-ruc') || readonlyInputs[3]; 
    const razonInput = document.getElementById('perfil-razon') || readonlyInputs[4];
    const repInput = document.getElementById('perfil-rep') || readonlyInputs[5];
    
    // Referencias a las tablas dinámicas
    const tablaTelefonos = document.getElementById('tabla-telefonos');
    const tablaCorreos = document.getElementById('tabla-correos');
    const tablaDirecciones = document.getElementById('tabla-direcciones');
    const tablaBancos = document.getElementById('tabla-bancos');

    // ==========================================
    // 1. FUNCIONES VISUALES (Agregar / Eliminar Filas)
    // ==========================================

    window.eliminarFila = function(boton) {
        const fila = boton.closest('tr');
        fila.remove();
    };

    // --- AGREGAR TELÉFONO ---
    window.agregarTelefono = function(pais = 'Perú (+51)', numero = '', anexo = '', persona = '', principal = false) {
        if(!tablaTelefonos) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="form-control" data-field="pais" value="${pais}" placeholder="Ej: Perú (+51)"></td>
            <td><input type="text" class="form-control" data-field="numero" value="${numero}" placeholder="000 000 000" required></td>
            <td><input type="text" class="form-control" data-field="anexo" value="${anexo}" placeholder="Ej: 101"></td>
            <td><input type="text" class="form-control" data-field="persona" value="${persona}" placeholder="Nombre de contacto"></td>
            <td style="text-align:center;"><input type="checkbox" data-field="principal" style="transform: scale(1.5); cursor: pointer;" ${principal ? 'checked' : ''}></td>
            <td><button type="button" class="btn-delete" onclick="eliminarFila(this)"><i class='bx bx-trash'></i></button></td>
        `;
        tablaTelefonos.appendChild(tr);
    };

    // --- AGREGAR CORREO ---
    window.agregarCorreo = function(correo = '', tipo = 'Correo de Pagos', principal = false) {
        if(!tablaCorreos) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="email" class="form-control" data-field="correo" value="${correo}" placeholder="ejemplo@empresa.com" required></td>
            <td>
                <select class="form-control" data-field="tipo">
                    <option ${tipo==='Correo de Pagos'?'selected':''}>Correo de Pagos</option>
                    <option ${tipo==='Correo Comercial'?'selected':''}>Correo Comercial</option>
                    <option ${tipo==='Representante Legal'?'selected':''}>Representante Legal</option>
                    <option ${tipo==='Facturación Electrónica'?'selected':''}>Facturación Electrónica</option>
                </select>
            </td>
            <td style="text-align:center;"><input type="checkbox" data-field="principal" style="transform: scale(1.5); cursor: pointer;" ${principal ? 'checked' : ''}></td>
            <td><button type="button" class="btn-delete" onclick="eliminarFila(this)"><i class='bx bx-trash'></i></button></td>
        `;
        tablaCorreos.appendChild(tr);
    };

    // --- AGREGAR DIRECCIÓN ---
    window.agregarDireccion = function(dep = '', prov = '', dist = '', exacta = '') {
        if(!tablaDirecciones) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="form-control" data-field="dep" value="${dep}" placeholder="Departamento"></td>
            <td><input type="text" class="form-control" data-field="prov" value="${prov}" placeholder="Provincia"></td>
            <td><input type="text" class="form-control" data-field="dist" value="${dist}" placeholder="Distrito"></td>
            <td><input type="text" class="form-control" data-field="exacta" value="${exacta}" placeholder="Av. / Calle / Mz." required></td>
            <td><button type="button" class="btn-delete" onclick="eliminarFila(this)"><i class='bx bx-trash'></i></button></td>
        `;
        tablaDirecciones.appendChild(tr);
    };

    // --- AGREGAR CUENTA BANCARIA ---
    window.agregarCuentaBancaria = function(banco = 'BCP', tipo = 'Cuenta Corriente', moneda = 'Soles (PEN)', cuenta = '', cci = '') {
        if(!tablaBancos) return;
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <select class="form-control" data-field="banco">
                    <option ${banco==='BCP'?'selected':''}>BCP</option>
                    <option ${banco==='BBVA'?'selected':''}>BBVA</option>
                    <option ${banco==='Interbank'?'selected':''}>Interbank</option>
                    <option ${banco==='Scotiabank'?'selected':''}>Scotiabank</option>
                    <option ${banco==='Banco de la Nación'?'selected':''}>Banco de la Nación</option>
                </select>
            </td>
            <td>
                <select class="form-control" data-field="tipo">
                    <option ${tipo==='Cuenta Corriente'?'selected':''}>Cuenta Corriente</option>
                    <option ${tipo==='Cuenta de Ahorros'?'selected':''}>Cuenta de Ahorros</option>
                    <option ${tipo==='Cuenta Detracción'?'selected':''}>Cuenta Detracción</option>
                </select>
            </td>
            <td>
                <select class="form-control" data-field="moneda">
                    <option ${moneda==='Soles (PEN)'?'selected':''}>Soles (PEN)</option>
                    <option ${moneda==='Dólares (USD)'?'selected':''}>Dólares (USD)</option>
                </select>
            </td>
            <td><input type="text" class="form-control" data-field="cuenta" value="${cuenta}" placeholder="000-00000000"></td>
            <td><input type="text" class="form-control" data-field="cci" value="${cci}" placeholder="00000000000000000000"></td>
            <td><button type="button" class="btn-delete" onclick="eliminarFila(this)"><i class='bx bx-trash'></i></button></td>
        `;
        tablaBancos.appendChild(tr);
    };

    // ==========================================
    // 2. CONEXIÓN CON EL BACKEND (DESEMPAQUETAR)
    // ==========================================
    async function cargarMiPerfil() {
        try {
            const res = await fetch('http://localhost:3000/api/proveedores/b2b/mi-perfil', {
                headers: { 'x-auth-token': token }
            });
            const data = await res.json();

            if (res.ok) {
                // Llenar datos fijos de la empresa (Solo lectura)
                if (rucInput) rucInput.value = data.ruc || '';
                if (razonInput) razonInput.value = data.razon_social || '';
                if (repInput) repInput.value = data.representante_legal || '';

                // 📦 Desempaquetar TELÉFONOS
                if(tablaTelefonos) {
                    tablaTelefonos.innerHTML = '';
                    try {
                        const telefonos = JSON.parse(data.telefono || '[]');
                        if (telefonos.length > 0) {
                            telefonos.forEach(t => agregarTelefono(t.pais, t.numero, t.anexo, t.persona, t.principal));
                        } else {
                            agregarTelefono(); // Fila vacía por defecto
                        }
                    } catch (e) {
                        agregarTelefono('Perú (+51)', data.telefono || '');
                    }
                }

                // 📦 Desempaquetar CORREOS
                if(tablaCorreos) {
                    tablaCorreos.innerHTML = '';
                    try {
                        const correos = JSON.parse(data.correo_contacto || '[]');
                        if (correos.length > 0) {
                            correos.forEach(c => agregarCorreo(c.correo, c.tipo, c.principal));
                        } else {
                            agregarCorreo(data.correo_contacto || '', 'Correo de Pagos', true);
                        }
                    } catch (e) {
                        agregarCorreo(data.correo_contacto || '', 'Correo de Pagos', true);
                    }
                }

                // 📦 Desempaquetar DIRECCIONES
                if(tablaDirecciones) {
                    tablaDirecciones.innerHTML = '';
                    try {
                        const direcciones = JSON.parse(data.direccion || '[]');
                        if (direcciones.length > 0) {
                            direcciones.forEach(d => agregarDireccion(d.dep, d.prov, d.dist, d.exacta));
                        } else {
                            agregarDireccion(); // Fila vacía
                        }
                    } catch (e) {
                        agregarDireccion('', '', '', data.direccion || '');
                    }
                }

                // 📦 Desempaquetar CUENTAS BANCARIAS
                if(tablaBancos) {
                    tablaBancos.innerHTML = '';
                    try {
                        const cuentas = JSON.parse(data.cuenta_bancaria || '[]');
                        if (cuentas.length > 0) {
                            cuentas.forEach(c => agregarCuentaBancaria(c.banco, c.tipo, c.moneda, c.cuenta, c.cci));
                        } else {
                            agregarCuentaBancaria(); // Fila vacía
                        }
                    } catch (e) {
                        agregarCuentaBancaria('BCP', 'Cuenta Corriente', 'Soles (PEN)', data.cuenta_bancaria || '', '');
                    }
                }
            }
        } catch (err) {
            console.error("Error cargando perfil", err);
        }
    }

    // ==========================================
    // 3. CONEXIÓN CON EL BACKEND (EMPAQUETAR Y GUARDAR)
    // ==========================================
    const form = document.getElementById('form-datos-maestros');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btnGuardar = form.querySelector('.btn-guardar');
            const originalText = btnGuardar.innerHTML;
            btnGuardar.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Guardando...";
            btnGuardar.disabled = true;

            try {
                // 📦 Empaquetar TELÉFONOS
                const telefonosArray = [];
                if(tablaTelefonos) {
                    tablaTelefonos.querySelectorAll('tr').forEach(tr => {
                        telefonosArray.push({
                            pais: tr.querySelector('[data-field="pais"]').value,
                            numero: tr.querySelector('[data-field="numero"]').value,
                            anexo: tr.querySelector('[data-field="anexo"]').value,
                            persona: tr.querySelector('[data-field="persona"]').value,
                            principal: tr.querySelector('[data-field="principal"]').checked
                        });
                    });
                }

                // 📦 Empaquetar CORREOS
                const correosArray = [];
                if(tablaCorreos) {
                    tablaCorreos.querySelectorAll('tr').forEach(tr => {
                        correosArray.push({
                            correo: tr.querySelector('[data-field="correo"]').value,
                            tipo: tr.querySelector('[data-field="tipo"]').value,
                            principal: tr.querySelector('[data-field="principal"]').checked
                        });
                    });
                }

                // 📦 Empaquetar DIRECCIONES
                const direccionesArray = [];
                if(tablaDirecciones) {
                    tablaDirecciones.querySelectorAll('tr').forEach(tr => {
                        direccionesArray.push({
                            dep: tr.querySelector('[data-field="dep"]').value,
                            prov: tr.querySelector('[data-field="prov"]').value,
                            dist: tr.querySelector('[data-field="dist"]').value,
                            exacta: tr.querySelector('[data-field="exacta"]').value
                        });
                    });
                }

                // 📦 Empaquetar BANCOS
                const cuentasArray = [];
                if(tablaBancos) {
                    tablaBancos.querySelectorAll('tr').forEach(tr => {
                        cuentasArray.push({
                            banco: tr.querySelector('[data-field="banco"]').value,
                            tipo: tr.querySelector('[data-field="tipo"]').value,
                            moneda: tr.querySelector('[data-field="moneda"]').value,
                            cuenta: tr.querySelector('[data-field="cuenta"]').value,
                            cci: tr.querySelector('[data-field="cci"]').value
                        });
                    });
                }

                // Armar el payload para el backend
                const payload = {
                    nombre_contacto: 'Múltiples Contactos (Ver detalle)',
                    correo_contacto: JSON.stringify(correosArray),
                    cuenta_bancaria: JSON.stringify(cuentasArray),
                    telefono: JSON.stringify(telefonosArray), 
                    direccion: JSON.stringify(direccionesArray)
                };

                const res = await fetch('http://localhost:3000/api/proveedores/b2b/mi-perfil', {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-auth-token': token 
                    },
                    body: JSON.stringify(payload)
                });
                
                const responseData = await res.json();

                if (res.ok) {
                    alert("✅ " + responseData.msg);
                } else {
                    alert("❌ Error: " + responseData.msg);
                }
            } catch (err) {
                console.error(err);
                alert("Error de conexión al guardar los datos.");
            } finally {
                btnGuardar.innerHTML = originalText;
                btnGuardar.disabled = false;
            }
        });
    }

    // Iniciar carga al abrir el módulo
    cargarMiPerfil();
})();