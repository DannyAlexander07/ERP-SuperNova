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

    // ==========================================
    // 🗺️ MEGA DICCIONARIO UBIGEO INCORPORADO B2B
    // ==========================================
    const UBIGEO = {
        "Amazonas": { "Chachapoyas": ["Chachapoyas"], "Bagua": ["Bagua", "Aramango"], "Utcubamba": ["Bagua Grande", "Cajaruro"] },
        "Áncash": { "Huaraz": ["Huaraz", "Independencia"], "Santa": ["Chimbote", "Nuevo Chimbote", "Casma", "Huarmey"] },
        "Apurímac": { "Abancay": ["Abancay", "Tamburco"], "Andahuaylas": ["Andahuaylas", "Talavera", "San Jerónimo"] },
        "Arequipa": { "Arequipa": ["Arequipa", "Cayma", "Cerro Colorado", "Yanahuara", "Paucarpata", "Socabaya", "Sachaca", "Tiabaya", "Hunter", "Miraflores", "Selva Alegre", "Mariano Melgar"], "Caylloma": ["Chivay", "Majes"], "Islay": ["Mollendo", "Cocachacra"], "Camaná": ["Camaná", "Samuel Pastor"] },
        "Ayacucho": { "Huamanga": ["Ayacucho", "Carmen Alto", "San Juan Bautista", "Jesús Nazareno"], "Huanta": ["Huanta"] },
        "Cajamarca": { "Cajamarca": ["Cajamarca", "Baños del Inca"], "Jaén": ["Jaén", "Bellavista"], "Chota": ["Chota"] },
        "Callao": { "Callao": ["Callao", "Bellavista", "Carmen de la Legua", "La Perla", "La Punta", "Ventanilla", "Mi Perú"] },
        "Cusco": { "Cusco": ["Cusco", "Wanchaq", "San Sebastián", "San Jerónimo", "Santiago"], "Urubamba": ["Urubamba", "Ollantaytambo", "Machupicchu"], "La Convención": ["Santa Ana", "Pichari"], "Canchis": ["Sicuani"] },
        "Huancavelica": { "Huancavelica": ["Huancavelica", "Ascensión"], "Tayacaja": ["Pampas"] },
        "Huánuco": { "Huánuco": ["Huánuco", "Amarilis", "Pillco Marca"], "Leoncio Prado": ["Rupa-Rupa", "Castillo Grande"] },
        "Ica": { "Ica": ["Ica", "La Tinguiña", "Parcona", "Subtanjalla"], "Chincha": ["Chincha Alta", "Pueblo Nuevo", "Grocio Prado"], "Pisco": ["Pisco", "San Clemente", "Túpac Amaru Inca"], "Nazca": ["Nazca", "Vista Alegre"], "Palpa": ["Palpa"] },
        "Junín": { "Huancayo": ["Huancayo", "El Tambo", "Chilca"], "Chanchamayo": ["Chanchamayo", "Pichanaqui"], "Satipo": ["Satipo", "Pangoa"], "Tarma": ["Tarma"], "Yauli": ["La Oroya"] },
        "La Libertad": { "Trujillo": ["Trujillo", "Víctor Larco", "El Porvenir", "La Esperanza", "Florencia de Mora", "Huanchaco", "Laredo", "Moche", "Salaverry"], "Ascope": ["Ascope", "Chicama", "Casa Grande"], "Pacasmayo": ["San Pedro de Lloc", "Pacasmayo", "Guadalupe"], "Chepén": ["Chepén"] },
        "Lambayeque": { "Chiclayo": ["Chiclayo", "José Leonardo Ortiz", "La Victoria", "Pimentel", "Monsefú", "Tumán"], "Lambayeque": ["Lambayeque", "Olmos", "Mochumi", "Motupe"], "Ferreñafe": ["Ferreñafe"] },
        "Lima": { 
            "Lima": ["Lima","Ancón","Ate","Barranco","Breña","Carabayllo","Chaclacayo","Chorrillos","Cieneguilla","Comas","El Agustino","Independencia","Jesús María","La Molina","La Victoria","Lince","Los Olivos","Lurigancho-Chosica","Lurín","Magdalena del Mar","Pueblo Libre","Miraflores","Pachacámac","Pucusana","Puente Piedra","Punta Hermosa","Punta Negra","Rímac","San Bartolo","San Borja","San Isidro","San Juan de Lurigancho","San Juan de Miraflores","San Luis","San Martín de Porres","San Miguel","Santa Anita","Santa María del Mar","Santa Rosa","Santiago de Surco","Surquillo","Villa El Salvador","Villa María del Triunfo"], 
            "Cañete": ["San Vicente de Cañete", "Asia", "Chilca", "Mala", "Cerro Azul", "Lunahuaná"], 
            "Huaral": ["Huaral", "Chancay", "Aucallama"], 
            "Huaura": ["Huacho", "Santa María", "Huaura", "Végueta"], 
            "Barranca": ["Barranca", "Paramonga", "Supe", "Supe Puerto"] 
        },
        "Loreto": { "Maynas": ["Iquitos", "Punchana", "Belén", "San Juan Bautista"], "Alto Amazonas": ["Yurimaguas"] },
        "Madre de Dios": { "Tambopata": ["Puerto Maldonado", "Inambari", "Laberinto"] },
        "Moquegua": { "Mariscal Nieto": ["Moquegua", "Samegua", "Torata"], "Ilo": ["Ilo", "Pacocha", "El Algarrobal"] },
        "Pasco": { "Pasco": ["Chaupimarca", "Yanacancha", "Simón Bolívar"], "Oxapampa": ["Oxapampa", "Villa Rica"] },
        "Piura": { "Piura": ["Piura", "Castilla", "Catacaos", "Tambogrande", "Veintiséis de Octubre"], "Sullana": ["Sullana", "Bellavista", "Marcavelica"], "Talara": ["Pariñas", "La Brea", "Máncora"], "Paita": ["Paita", "Colán"], "Sechura": ["Sechura"] },
        "Puno": { "Puno": ["Puno", "Ácora"], "San Román": ["Juliaca", "San Miguel"], "El Collao": ["Ilave"] },
        "San Martín": { "San Martín": ["Tarapoto", "Morales", "La Banda de Shilcayo"], "Moyobamba": ["Moyobamba", "Yantaló"], "Rioja": ["Rioja", "Nueva Cajamarca"], "Tocache": ["Tocache"] },
        "Tacna": { "Tacna": ["Tacna", "Alto de la Alianza", "Ciudad Nueva", "Gregorio Albarracín Lanchipa", "Pocollay"] },
        "Tumbes": { "Tumbes": ["Tumbes", "Corrales", "La Cruz"], "Zarumilla": ["Zarumilla", "Aguas Verdes"], "Contralmirante Villar": ["Zorritos"] },
        "Ucayali": { "Coronel Portillo": ["Callería", "Yarinacocha", "Manantay", "Campoverde"], "Padre Abad": ["Padre Abad", "Irazola"] }
    };

    // ==========================================
    // FUNCIONES DE CASCADA Y CREACIÓN DE FILAS
    // ==========================================
    window.cambiarDepB2B = function(selectDep, provSeleccionada = '') {
        const tr = selectDep.closest('tr');
        const selectProv = tr.querySelector('[data-field="prov"]');
        const selectDist = tr.querySelector('[data-field="dist"]');
        const dep = selectDep.value;

        selectProv.innerHTML = '<option value="" disabled selected>Provincia</option>';
        selectDist.innerHTML = '<option value="" disabled selected>Distrito</option>';

        if (dep && UBIGEO[dep]) {
            for (let prov in UBIGEO[dep]) {
                selectProv.innerHTML += `<option value="${prov}" ${prov === provSeleccionada ? 'selected' : ''}>${prov}</option>`;
            }
        }
    };

    window.cambiarProvB2B = function(selectProv, distSeleccionado = '') {
        const tr = selectProv.closest('tr');
        const selectDep = tr.querySelector('[data-field="dep"]');
        const selectDist = tr.querySelector('[data-field="dist"]');
        const dep = selectDep.value;
        const prov = selectProv.value;

        selectDist.innerHTML = '<option value="" disabled selected>Distrito</option>';

        if (dep && prov && UBIGEO[dep] && UBIGEO[dep][prov]) {
            UBIGEO[dep][prov].forEach(dist => {
                selectDist.innerHTML += `<option value="${dist}" ${dist === distSeleccionado ? 'selected' : ''}>${dist}</option>`;
            });
        }
    };

    window.agregarDireccion = function(dep = '', prov = '', dist = '', exacta = '') {
        const tablaDirecciones = document.getElementById('tabla-direcciones');
        if(!tablaDirecciones) return;
        const tr = document.createElement('tr');

        // Construimos las opciones de Departamento al vuelo
        let depOptions = `<option value="" disabled ${!dep ? 'selected' : ''}>Departamento</option>`;
        for (let d in UBIGEO) {
            depOptions += `<option value="${d}" ${d === dep ? 'selected' : ''}>${d}</option>`;
        }

        tr.innerHTML = `
            <td>
                <select class="form-control" data-field="dep" onchange="cambiarDepB2B(this)">
                    ${depOptions}
                </select>
            </td>
            <td>
                <select class="form-control" data-field="prov" onchange="cambiarProvB2B(this)">
                    <option value="" disabled selected>Provincia</option>
                </select>
            </td>
            <td>
                <select class="form-control" data-field="dist">
                    <option value="" disabled selected>Distrito</option>
                </select>
            </td>
            <td><input type="text" class="form-control" data-field="exacta" value="${exacta}" placeholder="Av. / Calle / Mz." required></td>
            <td><button type="button" class="btn-delete" onclick="eliminarFila(this)"><i class='bx bx-trash'></i></button></td>
        `;
        tablaDirecciones.appendChild(tr);

        // Desempaquetado inteligente (Si el proveedor ya tenía datos guardados, activamos la cascada para mostrar su info)
        if (dep) {
            const selectDep = tr.querySelector('[data-field="dep"]');
            window.cambiarDepB2B(selectDep, prov);
            if (prov) {
                const selectProv = tr.querySelector('[data-field="prov"]');
                window.cambiarProvB2B(selectProv, dist);
            }
        }
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
            
            // 🔥 EL ARREGLO: Atrapa cualquier botón de tipo submit o el primer botón del form
            const btnGuardar = form.querySelector('button[type="submit"]') || form.querySelector('button');
            let originalText = "Guardar Datos";
            
            if (btnGuardar) {
                originalText = btnGuardar.innerHTML;
                btnGuardar.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Guardando...";
                btnGuardar.disabled = true;
            }

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
                // 🔥 EL ARREGLO (Restaurar el botón solo si existe)
                if (btnGuardar) {
                    btnGuardar.innerHTML = originalText;
                    btnGuardar.disabled = false;
                }
            }
        });
    }

    // Iniciar carga al abrir el módulo
    cargarMiPerfil();
})();