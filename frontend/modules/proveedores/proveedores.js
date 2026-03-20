// Ubicacion: SuperNova/frontend/modules/proveedores/proveedores.js

(function() {
    console.log("Modulo Proveedores B2B PARITY 🛡️🚚");

    let proveedoresData = [];
    let proveedoresFiltrados = [];
    let paginaActual = 1;
    const filasPorPagina = 10;

    // --- 1. CARGA DE DATOS ---
    window.initProveedores = async function() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/proveedores', {
                headers: { 'x-auth-token': token }
            });

            if(res.ok) {
                proveedoresData = await res.json();
                proveedoresFiltrados = [...proveedoresData];
                renderTabla();
            } else {
                showToast("Error al obtener la lista de socios comerciales.", "error");
            }
        } catch (error) { 
            console.error(error);
            showToast("Fallo de conexión con el servidor.", "error");
        }
    }

    // --- 2. RENDERIZADO DE TABLA PRINCIPAL ---
    function renderTabla() {
        const tbody = document.getElementById('tabla-proveedores-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        const inicio = (paginaActual - 1) * filasPorPagina;
        const fin = inicio + filasPorPagina;
        const datosPagina = proveedoresFiltrados.slice(inicio, fin);

        if(datosPagina.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:#888;">No se encontraron registros.</td></tr>';
            return;
        }

        datosPagina.forEach(prov => {
            const tr = document.createElement('tr');
            let catLabel = (prov.categoria || 'Varios').toUpperCase();
            let statusClass = prov.estado === 'activo' ? 'status-active' : 'status-inactive';

            // Desempaquetar Teléfono para mostrar en la tabla resumen
            let telPrincipal = '-';
            try {
                const telArray = JSON.parse(prov.telefono);
                if(telArray.length > 0) telPrincipal = telArray[0].numero;
            } catch(e) { telPrincipal = prov.telefono || '-'; }

            tr.innerHTML = `
                <td style="font-family: 'Courier New', monospace; font-weight:700;">${prov.ruc}</td>
                <td style="font-weight:600; color:var(--text-color-main);">${prov.razon_social}</td>
                <td><span class="status-badge" style="background:#f0f4ff; color:#3f51b5; border:1px solid #d1d9ff;">${catLabel}</span></td>
                <td>
                    <div class="client-contact">
                        <span><i class='bx bxs-user-circle'></i> ${prov.representante_legal || prov.nombre_contacto || '-'}</span>
                        <span style="font-size:11px;"><i class='bx bxs-phone'></i> ${telPrincipal}</span>
                    </div>
                </td>
                <td style="text-align:center; font-weight:700; color:#555;">${prov.dias_credito} <small>DÍAS</small></td>
                <td><span class="status-badge ${statusClass}">${prov.estado || 'Activo'}</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action" style="color:#ef4444; background:#fee2e2; border-color:#fca5a5;" onclick="window.abrirModalAccesoB2B(${prov.id})" title="Forzar Contraseña B2B"><i class='bx bx-lock-open-alt'></i></button>
                        
                        <button class="btn-action edit" onclick="window.editarProveedor(${prov.id})" title="Editar"><i class='bx bx-edit-alt'></i></button>
                        <button class="btn-action delete" onclick="window.eliminarProveedor(${prov.id})" title="Eliminar"><i class='bx bx-trash'></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        actualizarPaginacion();
    }

    // ==========================================
    // 3. FUNCIONES DE LAS TABLITAS DEL SUPER MODAL
    // ==========================================
    window.eliminarFilaERP = function(btn) {
        btn.closest('tr').remove();
    }

    // 🗺️ MEGA DICCIONARIO UBIGEO (Ejemplo con las principales, puedes agregar más)
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

    // Hacemos que esté disponible globalmente para que proveedores.js lo pueda leer
    window.UBIGEO = UBIGEO;

    // 🔄 Función: Cuando cambia el Departamento
    window.cambiarDep = function(selectDep, provSeleccionada = '') {
        const tr = selectDep.closest('tr');
        const selectProv = tr.querySelector('[data-f="prov"]');
        const selectDist = tr.querySelector('[data-f="dist"]');
        const dep = selectDep.value;

        // Limpiar selects hijos
        selectProv.innerHTML = '<option value="" disabled selected>Provincia</option>';
        selectDist.innerHTML = '<option value="" disabled selected>Distrito</option>';

        if (dep && UBIGEO[dep]) {
            for (let prov in UBIGEO[dep]) {
                selectProv.innerHTML += `<option value="${prov}" ${prov === provSeleccionada ? 'selected' : ''}>${prov}</option>`;
            }
        }
    };

    // 🔄 Función: Cuando cambia la Provincia
    window.cambiarProv = function(selectProv, distSeleccionado = '') {
        const tr = selectProv.closest('tr');
        const selectDep = tr.querySelector('[data-f="dep"]');
        const selectDist = tr.querySelector('[data-f="dist"]');
        const dep = selectDep.value;
        const prov = selectProv.value;

        // Limpiar select hijo
        selectDist.innerHTML = '<option value="" disabled selected>Distrito</option>';

        if (dep && prov && UBIGEO[dep] && UBIGEO[dep][prov]) {
            UBIGEO[dep][prov].forEach(dist => {
                selectDist.innerHTML += `<option value="${dist}" ${dist === distSeleccionado ? 'selected' : ''}>${dist}</option>`;
            });
        }
    };

    // 📍 LA NUEVA FUNCIÓN CON SELECTS
    window.agregarDirERP = function(exacta = '', dist = '', prov = '', dep = '') {
        const tb = document.getElementById('lista-dir-erp');
        const tr = document.createElement('tr');

        // Construir las opciones iniciales de Departamentos
        let depOptions = `<option value="" disabled ${!dep ? 'selected' : ''}>Departamento</option>`;
        for (let d in UBIGEO) {
            depOptions += `<option value="${d}" ${d === dep ? 'selected' : ''}>${d}</option>`;
        }

        tr.innerHTML = `
            <td>
                <select data-f="dep" onchange="cambiarDep(this)" style="width:100%; border:none; border-bottom:1px solid #ddd; padding:8px 5px; background:transparent; color:#333; outline:none; font-size:13px; cursor:pointer;">
                    ${depOptions}
                </select>
            </td>
            <td>
                <select data-f="prov" onchange="cambiarProv(this)" style="width:100%; border:none; border-bottom:1px solid #ddd; padding:8px 5px; background:transparent; color:#333; outline:none; font-size:13px; cursor:pointer;">
                    <option value="" disabled selected>Provincia</option>
                </select>
            </td>
            <td>
                <select data-f="dist" style="width:100%; border:none; border-bottom:1px solid #ddd; padding:8px 5px; background:transparent; color:#333; outline:none; font-size:13px; cursor:pointer;">
                    <option value="" disabled selected>Distrito</option>
                </select>
            </td>
            <td>
                <input type="text" data-f="exacta" value="${exacta}" placeholder="Av. / Calle" required style="width:100%; border:none; border-bottom:1px solid #ddd; padding:8px 5px; background:transparent; font-size:13px; outline:none;">
            </td>
            <td style="width:30px; text-align:center;">
                <button type="button" onclick="eliminarFilaERP(this)" style="color:red; background:none; border:none; cursor:pointer;"><i class='bx bx-trash'></i></button>
            </td>
        `;
        tb.appendChild(tr);

        // 🧠 MAGIA: Si estamos Editando un proveedor y ya tiene datos, disparamos las cascadas
        if (dep) {
            const selectDep = tr.querySelector('[data-f="dep"]');
            cambiarDep(selectDep, prov);
            if (prov) {
                const selectProv = tr.querySelector('[data-f="prov"]');
                cambiarProv(selectProv, dist);
            }
        }
    };

    window.agregarTelERP = function(numero = '', persona = '', anexo = '', principal = false) {
        const tb = document.getElementById('lista-tel-erp');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" data-f="numero" value="${numero}" placeholder="N° Teléfono" required style="width:100%; border:none; border-bottom:1px solid #ddd;"></td>
            <td><input type="text" data-f="anexo" value="${anexo}" placeholder="Anexo" style="width:100%; border:none; border-bottom:1px solid #ddd;"></td>
            <td><input type="text" data-f="persona" value="${persona}" placeholder="Contacto" style="width:100%; border:none; border-bottom:1px solid #ddd;"></td>
            <td style="text-align:center; width:50px;"><input type="checkbox" data-f="principal" ${principal ? 'checked' : ''}></td>
            <td style="width:30px;"><button type="button" onclick="eliminarFilaERP(this)" style="color:red; background:none; border:none; cursor:pointer;"><i class='bx bx-trash'></i></button></td>
        `;
        tb.appendChild(tr);
    }

    window.agregarCorreoERP = function(correo = '', tipo = 'Ventas', principal = false) {
        const tb = document.getElementById('lista-correo-erp');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="email" data-f="correo" value="${correo}" placeholder="correo@empresa.com" required style="width:100%; border:none; border-bottom:1px solid #ddd;"></td>
            <td><input type="text" data-f="tipo" value="${tipo}" placeholder="Área" style="width:100%; border:none; border-bottom:1px solid #ddd;"></td>
            <td style="text-align:center; width:50px;"><input type="checkbox" data-f="principal" ${principal ? 'checked' : ''}></td>
            <td style="width:30px;"><button type="button" onclick="eliminarFilaERP(this)" style="color:red; background:none; border:none; cursor:pointer;"><i class='bx bx-trash'></i></button></td>
        `;
        tb.appendChild(tr);
    }

    // 🏦 TABLITA DE BANCOS (CON ANCHOS CORREGIDOS)
    window.agregarBancoERP = function(banco = 'BCP', tipo = 'Cuenta Corriente', moneda = 'Soles (PEN)', cuenta = '', cci = '') {
        const tb = document.getElementById('lista-banco-erp');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="width: 15%;">
                <select data-f="banco" style="width:100%; border:none; border-bottom:1px solid #ddd; padding:8px 5px; background:transparent; font-size:13px; outline:none;">
                    <option ${banco==='BCP'?'selected':''}>BCP</option>
                    <option ${banco==='BBVA'?'selected':''}>BBVA</option>
                    <option ${banco==='Interbank'?'selected':''}>Interbank</option>
                    <option ${banco==='Scotiabank'?'selected':''}>Scotiabank</option>
                    <option ${banco==='Banco de la Nación'?'selected':''}>Banco de la Nación</option>
                </select>
            </td>
            <td style="width: 25%; min-width: 140px;">
                <select data-f="tipo" style="width:100%; border:none; border-bottom:1px solid #ddd; padding:8px 5px; background:transparent; font-size:13px; outline:none;">
                    <option ${tipo==='Cuenta Corriente'?'selected':''}>Cuenta Corriente</option>
                    <option ${tipo==='Cuenta de Ahorros'?'selected':''}>Cuenta de Ahorros</option>
                    <option ${tipo==='Cuenta Detracción'?'selected':''}>Cuenta Detracción</option>
                </select>
            </td>
            <td style="width: 20%; min-width: 120px;">
                <select data-f="moneda" style="width:100%; border:none; border-bottom:1px solid #ddd; padding:8px 5px; background:transparent; font-size:13px; outline:none;">
                    <option ${moneda==='Soles (PEN)'?'selected':''}>Soles (PEN)</option>
                    <option ${moneda==='Dólares (USD)'?'selected':''}>Dólares (USD)</option>
                </select>
            </td>
            <td style="width: 18%;"><input type="text" data-f="cuenta" value="${cuenta}" placeholder="N° Cuenta" style="width:100%; border:none; border-bottom:1px solid #ddd; padding:8px 5px; background:transparent; font-size:13px; outline:none;"></td>
            <td style="width: 18%;"><input type="text" data-f="cci" value="${cci}" placeholder="CCI" style="width:100%; border:none; border-bottom:1px solid #ddd; padding:8px 5px; background:transparent; font-size:13px; outline:none;"></td>
            <td style="width: 4%; text-align:center;"><button type="button" onclick="eliminarFilaERP(this)" style="color:red; background:none; border:none; cursor:pointer;"><i class='bx bx-trash'></i></button></td>
        `;
        tb.appendChild(tr);
    };

    // ==========================================
    // 4. ABRIR Y DESEMPAQUETAR (EDITAR)
    // ==========================================
    window.editarProveedor = function(id) {
        const prov = proveedoresData.find(p => p.id === id);
        if(!prov) return;

        window.abrirModalProveedor();
        document.querySelector('.modal-header h3').innerText = "Actualizar Socio Comercial";
        
        document.getElementById('prov-id').value = prov.id;
        document.getElementById('prov-ruc').value = prov.ruc;
        document.getElementById('prov-razon').value = prov.razon_social;
        document.getElementById('prov-rep-legal').value = prov.representante_legal || '';
        document.getElementById('prov-categoria').value = prov.categoria || '';
        document.getElementById('prov-dias').value = prov.dias_credito || 0;

        // Limpiar tablitas
        document.getElementById('lista-dir-erp').innerHTML = '';
        document.getElementById('lista-tel-erp').innerHTML = '';
        document.getElementById('lista-correo-erp').innerHTML = '';
        document.getElementById('lista-banco-erp').innerHTML = '';

        // 📦 DESEMPAQUETAR JSONS A TABLAS
        try {
            const dirs = JSON.parse(prov.direccion);
            if(dirs.length > 0) dirs.forEach(d => agregarDirERP(d.exacta, d.dist, d.prov, d.dep));
            else agregarDirERP();
        } catch(e) { agregarDirERP(prov.direccion || ''); }

        try {
            const tels = JSON.parse(prov.telefono);
            if(tels.length > 0) tels.forEach(t => agregarTelERP(t.numero, t.persona, t.anexo, t.principal));
            else agregarTelERP();
        } catch(e) { agregarTelERP(prov.telefono || ''); }

        try {
            const cors = JSON.parse(prov.correo_contacto);
            if(cors.length > 0) cors.forEach(c => agregarCorreoERP(c.correo, c.tipo, c.principal));
            else agregarCorreoERP();
        } catch(e) { agregarCorreoERP(prov.correo_contacto || ''); }

        // 🔥 AQUÍ ESTÁ LA CORRECCIÓN DE LOS BANCOS
        try {
            const bans = JSON.parse(prov.cuenta_bancaria);
            if(bans.length > 0) bans.forEach(b => agregarBancoERP(b.banco, b.tipo, b.moneda, b.cuenta, b.cci));
            else agregarBancoERP();
        } catch(e) { 
            // Si no es JSON (dato antiguo), lo pone en la cajita de cuenta
            agregarBancoERP('BCP', 'Cuenta Corriente', 'Soles (PEN)', prov.cuenta_bancaria || '', ''); 
        }
    };

    window.abrirModalProveedor = function() {
        document.getElementById('modal-proveedor').classList.remove('hidden');
        document.getElementById('modal-proveedor').classList.add('active');
        document.getElementById('form-nuevo-proveedor').reset();
        document.getElementById('prov-id').value = "";
        
        // Limpiar tablitas y poner 1 fila vacía por defecto
        document.getElementById('lista-dir-erp').innerHTML = '';
        document.getElementById('lista-tel-erp').innerHTML = '';
        document.getElementById('lista-correo-erp').innerHTML = '';
        document.getElementById('lista-banco-erp').innerHTML = '';
        agregarDirERP();
        agregarTelERP();
        agregarCorreoERP();
        agregarBancoERP();
    };

    window.cerrarModalProveedor = function() {
        document.getElementById('modal-proveedor').classList.remove('active');
        document.getElementById('modal-proveedor').classList.add('hidden');
    };

    // ==========================================
    // 5. EMPAQUETAR Y GUARDAR 
    // ==========================================
    window.guardarProveedor = async function() {
        const id = document.getElementById('prov-id').value;
        const ruc = document.getElementById('prov-ruc').value.trim();
        const razon = document.getElementById('prov-razon').value.trim();
        const rep_legal = document.getElementById('prov-rep-legal').value.trim();
        const categoria = document.getElementById('prov-categoria').value;
        const dias = document.getElementById('prov-dias').value;

        if (!ruc || (ruc.length !== 11 && ruc.length !== 8)) return showToast("RUC / DNI inválido.", "error");
        if (!razon) return showToast("La Razón Social es obligatoria.", "error");
        if (!categoria) return showToast("Debe seleccionar una categoría.", "error");

        // 📦 EMPAQUETAR DIRECCIONES
        const dirArr = [];
        document.querySelectorAll('#lista-dir-erp tr').forEach(tr => {
            dirArr.push({
                dep: tr.querySelector('[data-f="dep"]').value || '',
                prov: tr.querySelector('[data-f="prov"]').value || '',
                dist: tr.querySelector('[data-f="dist"]').value || '',
                exacta: tr.querySelector('[data-f="exacta"]').value || ''
            });
        });

        // 📦 EMPAQUETAR TELÉFONOS
        const telArr = [];
        document.querySelectorAll('#lista-tel-erp tr').forEach(tr => {
            telArr.push({
                pais: 'Perú (+51)', // Agregado para hacer espejo con B2B
                numero: tr.querySelector('[data-f="numero"]').value || '',
                anexo: tr.querySelector('[data-f="anexo"]').value || '',
                persona: tr.querySelector('[data-f="persona"]').value || '',
                principal: tr.querySelector('[data-f="principal"]').checked
            });
        });

        // 📦 EMPAQUETAR CORREOS
        const correoArr = [];
        document.querySelectorAll('#lista-correo-erp tr').forEach(tr => {
            correoArr.push({
                correo: tr.querySelector('[data-f="correo"]').value || '',
                tipo: tr.querySelector('[data-f="tipo"]').value || 'Ventas',
                principal: tr.querySelector('[data-f="principal"]').checked
            });
        });

        // 📦 EMPAQUETAR BANCOS (¡Ahora con Tipo y Moneda!)
        const bancoArr = [];
        document.querySelectorAll('#lista-banco-erp tr').forEach(tr => {
            bancoArr.push({
                banco: tr.querySelector('[data-f="banco"]').value || '',
                tipo: tr.querySelector('[data-f="tipo"]').value || '',
                moneda: tr.querySelector('[data-f="moneda"]').value || '',
                cuenta: tr.querySelector('[data-f="cuenta"]').value || '',
                cci: tr.querySelector('[data-f="cci"]').value || ''
            });
        });

        // 🚀 ARMANDO EL PAQUETE FINAL
        const data = {
            ruc, 
            razon_social: razon, // Ajustado para BD
            representante_legal: rep_legal,
            categoria,
            dias_credito: parseInt(dias) || 0, // Ajustado para BD
            nombre_contacto: 'Múltiples Contactos (Ver detalle)', // Espejo B2B
            direccion: JSON.stringify(dirArr),
            telefono: JSON.stringify(telArr),
            correo_contacto: JSON.stringify(correoArr),
            cuenta_bancaria: JSON.stringify(bancoArr),
            estado: 'activo'
        };

        const btnSave = document.getElementById('btn-guardar-proveedor');
        let txtOriginal = btnSave.innerHTML;
        btnSave.disabled = true;
        btnSave.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Guardando...";

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(id ? `/api/proveedores/${id}` : '/api/proveedores', {
                method: id ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                body: JSON.stringify(data)
            });

            const resp = await res.json();
            
            if(res.ok) {
                showToast(resp.msg, "success");
                window.cerrarModalProveedor();
                window.initProveedores();
            } else {
                showToast(resp.msg, "error");
            }
        } catch (e) { 
            console.error(e);
            showToast("Error de comunicación con el servidor.", "error"); 
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = txtOriginal;
        }
    };

    // ==========================================
    // 6. UTILIDADES RESTANTES (Sunat, Eliminar, etc)
    // ==========================================
    window.eliminarProveedor = async function(id) {
        if(!await showConfirm("¿Estás seguro de eliminar este proveedor?", "Confirmar")) return;
        try {
            const res = await fetch(`/api/proveedores/${id}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            const data = await res.json();
            if(res.ok) { showToast(data.msg, "success"); window.initProveedores(); } 
            else showToast(data.msg, "error");
        } catch(e) { showToast("Error al procesar.", "error"); }
    };

    window.buscarDatosSunat = async function(idDoc, idNombre, idDireccion) {
        const inputDoc = document.getElementById(idDoc);
        const inputNombre = document.getElementById(idNombre);
        const numero = inputDoc.value.trim();
        if (numero.length !== 8 && numero.length !== 11) return showToast("DNI u RUC inválido.", "warning");

        inputNombre.placeholder = "Buscando...";
        try {
            const res = await fetch(`/api/consultas/${numero}`, { headers: { 'x-auth-token': localStorage.getItem('token') } });
            const data = await res.json();
            if (res.ok && data.success) {
                inputNombre.value = data.nombre;
                // Si es ruc, llenar la primera fila de la tablita de direcciones
                if (data.tipo === 'RUC') {
                    const dirInput = document.querySelector('#lista-dir-erp tr [data-f="exacta"]');
                    if(dirInput) dirInput.value = data.direccion || '';
                }
            } else { showToast("No encontrado.", "error"); }
        } catch (error) { showToast("Error de API.", "error"); }
    };

    function actualizarPaginacion() {
        const totalPaginas = Math.ceil(proveedoresFiltrados.length / filasPorPagina);
        const info = document.querySelector('.pagination .page-info');
        if(info) info.innerText = `Página ${paginaActual} de ${totalPaginas || 1}`;
    }

    const buscador = document.getElementById('buscador-proveedores');
    if(buscador) {
        buscador.oninput = (e) => {
            const term = e.target.value.toLowerCase();
            proveedoresFiltrados = proveedoresData.filter(p => 
                p.razon_social.toLowerCase().includes(term) || p.ruc.includes(term)
            );
            paginaActual = 1;
            renderTabla();
        };
    }

    // ==========================================
    // 🔐 GESTIÓN DE ACCESO AL PORTAL B2B (MODAL LLAVECITA)
    // ==========================================
    window.abrirModalAccesoB2B = function(id) {
        const prov = proveedoresData.find(p => p.id === id);
        if(!prov) return;

        // 1. Buscamos el correo REAL de acceso B2B (el que cruzó el backend)
        let correoB2B = prov.correo_b2b;

        // Si el proveedor es nuevo y AÚN NO TIENE usuario creado, le sugerimos su correo de contacto principal
        if (!correoB2B) {
            try {
                const correos = JSON.parse(prov.correo_contacto);
                const principal = correos.find(c => c.principal === true) || correos[0];
                if (principal && principal.correo) correoB2B = principal.correo;
            } catch(e) {
                if(prov.correo_contacto) correoB2B = prov.correo_contacto;
            }
        }

        // Si después de buscar por todos lados sigue sin tener, mostramos este texto
        if (!correoB2B) {
            correoB2B = "No tiene correo registrado";
        }

        // 2. Llenamos el modal visualmente
        document.getElementById('b2b-prov-id').value = prov.id;
        document.getElementById('b2b-proveedor-nombre').innerText = prov.razon_social;
        document.getElementById('b2b-correo').value = correoB2B;
        document.getElementById('b2b-nueva-pass').value = '';

        // 3. Mostramos el modal (¡AHORA CON LA CLASE ACTIVE!)
        const modalB2B = document.getElementById('modal-acceso-b2b');
        modalB2B.classList.remove('hidden');
        modalB2B.classList.add('active'); // 🔥 Esta era la pieza faltante
    };

    window.cerrarModalB2B = function() {
        const modalB2B = document.getElementById('modal-acceso-b2b');
        modalB2B.classList.remove('active'); // 🔥 Se la quitamos al cerrar
        modalB2B.classList.add('hidden');
    };

    // 4. ENVÍO REAL DEL CAMBIO DE CONTRASEÑA
    document.getElementById('form-acceso-b2b').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const provId = document.getElementById('b2b-prov-id').value;
        const nuevaPass = document.getElementById('b2b-nueva-pass').value.trim();
        const correoBase = document.getElementById('b2b-correo').value;
        const btnSave = document.getElementById('btn-guardar-b2b');

        if(nuevaPass.length < 6) {
            return showToast("La nueva contraseña debe tener al menos 6 caracteres.", "warning");
        }

        if(correoBase === "No tiene correo registrado") {
            return showToast("El proveedor primero debe tener un correo registrado en sus datos fiscales.", "error");
        }

        if(!confirm(`⚠️ ATENCIÓN:\n\nVa a sobrescribir la contraseña de acceso al portal B2B para:\n${document.getElementById('b2b-proveedor-nombre').innerText}.\n\n¿Desea continuar?`)) {
            return;
        }

        const txtOriginal = btnSave.innerHTML;
        btnSave.disabled = true;
        btnSave.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Aplicando...";

        try {
            const token = localStorage.getItem('token');
            // 🔥 Llamada a la nueva ruta secreta del backend
            const res = await fetch(`/api/proveedores/${provId}/forzar-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                body: JSON.stringify({ nuevaPassword: nuevaPass, correo: correoBase })
            });

            const data = await res.json();
            
            if(res.ok) {
                showToast("✅ Contraseña sobrescrita exitosamente.", "success");
                
                // Le mostramos al usuario interno un alert para que la copie y se la mande al proveedor
                prompt("Acceso restaurado. Copie esta información y envíesela al proveedor:", `Usuario: ${correoBase}\nNueva Contraseña: ${nuevaPass}`);
                
                cerrarModalB2B();
            } else {
                showToast(data.msg, "error");
            }
        } catch (error) {
            console.error(error);
            showToast("Error crítico al forzar la contraseña.", "error");
        } finally {
            btnSave.disabled = false;
            btnSave.innerHTML = txtOriginal;
        }
    });

    window.generarInvitacionProveedor = async function() {
        if(!confirm('¿Generar código de invitación?')) return;
        try {
            const res = await fetch('/api/proveedores/generar-invitacion', {
                method: 'POST',
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            const data = await res.json();
            if (res.ok) {
                prompt(`✅ CÓDIGO GENERADO:\n\nEnvíe este código al proveedor:`, data.codigo);
                window.initProveedores();
            } else showToast(data.msg, "error");
        } catch (err) { showToast('Error de conexión.', "error"); }
    };

    window.initProveedores();

})();