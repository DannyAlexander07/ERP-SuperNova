// Ubicacion: SuperNova/frontend/modules/clientes/clientes.js

(function() {
    console.log("Modulo Clientes CRM Conectado a DB - Blindado 🛡️");

    let clientesData = []; 
    let clientesFiltrados = [];
    let paginaActual = 1;
    const filasPorPagina = 8;

    // --- 1. INICIALIZACIÓN ---
    async function initClientes() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const res = await fetch('/api/clientes', {
                headers: { 'x-auth-token': token }
            });
            const data = await res.json();

            if (res.ok) {
                clientesData = data.map(c => ({
                    id: String(c.id), 
                    nombre: c.nombre_completo,
                    dni: c.documento_id,      
                    ruc: c.ruc,
                    telefono: c.telefono,
                    correo: c.correo,
                    direccion: c.direccion,
                    hijo: c.nombre_hijo,
                    parentesco: c.parentesco,
                    nacimiento: c.fecha_nacimiento_hijo ? c.fecha_nacimiento_hijo.slice(0, 10) : null,
                    alergias: c.observaciones_medicas,
                    categoria: c.categoria,
                    ultVisita: new Date(c.ultima_visita || c.fecha_registro).toLocaleDateString('es-PE')
                }));
                
                clientesFiltrados = [...clientesData];
                renderizarTablaClientes();
            } else {
                showToast("Error cargando clientes.", "error", "Acceso Denegado");
            }
        } catch (error) {
            console.error("Error de conexión:", error);
            showToast("No se pudo conectar con el servidor.", "error");
        }
    }

    // --- 2. RENDERIZADO CON PAGINACIÓN CORREGIDA ---
    function renderizarTablaClientes() {
        const tbody = document.getElementById('tabla-clientes-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const inicio = (paginaActual - 1) * filasPorPagina;
        const fin = inicio + filasPorPagina;
        const datosPagina = clientesFiltrados.slice(inicio, fin);
        const totalPaginas = Math.ceil(clientesFiltrados.length / filasPorPagina);

        if (datosPagina.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:#94a3b8;">No se encontraron clientes.</td></tr>';
        }

        datosPagina.forEach(cli => {
            const tr = document.createElement('tr');
            
            let badgeClass = 'cat-nuevo';
            if(cli.categoria === 'frecuente') badgeClass = 'cat-frecuente';
            if(cli.categoria === 'vip') badgeClass = 'cat-vip';

            let alertaMedica = '';
            if(cli.alergias && cli.alergias.toLowerCase() !== 'ninguna' && cli.alergias.trim() !== '') {
                alertaMedica = `<i class='bx bxs-first-aid' title="ALERTA MÉDICA: ${cli.alergias}" style="color:#e91e63; margin-left:5px; cursor:help; font-size:18px;"></i>`;
            }

            let edadHtml = '';
            if(cli.nacimiento) {
                const hoy = new Date();
                const cumple = new Date(cli.nacimiento);
                let edad = hoy.getFullYear() - cumple.getFullYear();
                if (hoy.getMonth() < cumple.getMonth() || (hoy.getMonth() === cumple.getMonth() && hoy.getDate() < cumple.getDate())) edad--;
                edadHtml = `<span style="font-size:11px; color:#888;">(${edad} años)</span>`;
            }

            tr.innerHTML = `
                <td>
                    <div style="font-weight:600; color:#333;">${cli.nombre}</div>
                    <div style="font-size:11px; color:#888;">DNI: ${cli.dni} ${cli.ruc ? '| RUC: ' + cli.ruc : ''}</div>
                </td>
                <td>
                    <div class="client-contact">
                        <span><i class='bx bxs-phone'></i> ${cli.telefono}</span>
                        <span><i class='bx bxs-envelope'></i> ${cli.correo || '-'}</span>
                    </div>
                </td>
                <td>
                    <div class="kid-info">
                        <div class="kid-icon"><i class='bx bxs-face'></i></div>
                        <div>
                            <div class="kid-name">${cli.hijo || 'No reg.'} ${alertaMedica}</div>
                            ${edadHtml}
                        </div>
                    </div>
                </td>
                <td><span class="badge-cat ${badgeClass}">${cli.categoria.toUpperCase()}</span></td>
                <td style="font-size:13px;">${cli.ultVisita}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action edit" onclick="window.editarCliente(${cli.id})" title="Editar"><i class='bx bx-edit-alt'></i></button>
                        <button class="btn-action delete" onclick="window.eliminarCliente(${cli.id})" title="Eliminar"><i class='bx bx-trash'></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        actualizarControlesPaginacion(totalPaginas);
    }

    function actualizarControlesPaginacion(total) {
        const info = document.querySelector('.pagination .page-info');
        const prevBtn = document.querySelector('.pagination button:first-child');
        const nextBtn = document.querySelector('.pagination button:last-child');
        const container = document.querySelector('.pagination .page-controls');

        if(info) info.innerText = `Página ${paginaActual} de ${total || 1}`;
        if(prevBtn) prevBtn.disabled = paginaActual === 1;
        if(nextBtn) nextBtn.disabled = paginaActual === total || total === 0;

        // Limpiar y recrear números de página si lo deseas, o usar solo flechas
        if(container) {
            container.innerHTML = `
                <button onclick="window.cambiarPaginaCliente(-1)" ${paginaActual === 1 ? 'disabled' : ''}><i class='bx bx-chevron-left'></i></button>
                <button class="active">${paginaActual}</button>
                <button onclick="window.cambiarPaginaCliente(1)" ${paginaActual === total || total === 0 ? 'disabled' : ''}><i class='bx bx-chevron-right'></i></button>
            `;
        }
    }

    window.cambiarPaginaCliente = function(delta) {
        paginaActual += delta;
        renderizarTablaClientes();
    };

    // --- 3. VALIDACIÓN AVANZADA Y GUARDADO ---
    window.guardarCliente = async function() {
        const id = document.getElementById('cli-id').value;
        const nombre = document.getElementById('cli-nombre').value.trim();
        const dni = document.getElementById('cli-dni').value.trim();
        const ruc = document.getElementById('cli-ruc').value.trim();
        const telefono = document.getElementById('cli-telefono').value.trim();
        const email = document.getElementById('cli-email').value.trim();
        const nacimiento = document.getElementById('cli-nacimiento').value;

        // 🛡️ VALIDACIONES OBLIGATORIAS Y FORMATOS
        if(!nombre) return showToast("El nombre del titular es obligatorio", "error");
        
        if(!dni || dni.length < 8) return showToast("DNI inválido (Mínimo 8 dígitos)", "error");
        
        if(ruc && ruc.length !== 11) return showToast("El RUC debe tener exactamente 11 dígitos", "error");
        
        if(!telefono || telefono.length < 9) return showToast("Teléfono inválido", "error");

        if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast("Formato de correo electrónico no válido", "error");

        if(!nacimiento) return showToast("La fecha de nacimiento del niño es obligatoria", "error");

        const payload = {
            nombre_completo: nombre,
            documento_id: dni,
            ruc: ruc || null,
            telefono: telefono,
            correo: email || null,
            direccion: document.getElementById('cli-direccion').value.trim(),
            nombre_hijo: document.getElementById('cli-hijo').value.trim() || "Sin nombre",
            parentesco: document.getElementById('cli-parentesco').value,
            fecha_nacimiento_hijo: nacimiento,
            observaciones_medicas: document.getElementById('cli-alergias').value.trim() || "Ninguna",
            categoria: document.getElementById('cli-categoria').value,
        };

        try {
            const token = localStorage.getItem('token');
            const url = id ? `/api/clientes/${id}` : '/api/clientes';
            const method = id ? 'PUT' : 'POST';

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (res.ok) {
                showToast(`Cliente ${id ? 'actualizado' : 'creado'} correctamente.`, "success");
                window.cerrarModalCliente();
                initClientes(); 
            } else {
                showToast(data.msg || "Error en el servidor", "error");
            }
        } catch (error) {
            showToast("Error de conexión", "error");
        }
    };

    // --- 4. CRUD: EDITAR (READ INTO FORM) ---
    window.editarCliente = function(id) {
        const cli = clientesData.find(c => c.id == id);
        if (!cli) return showToast("Error: Cliente no encontrado", "error");

        window.abrirModalCliente();
        document.querySelector('#modal-title').innerText = "Actualizar Expediente";
        
        document.getElementById('cli-id').value = cli.id;
        document.getElementById('cli-nombre').value = cli.nombre;
        document.getElementById('cli-dni').value = cli.dni;
        document.getElementById('cli-ruc').value = cli.ruc || '';
        document.getElementById('cli-telefono').value = cli.telefono;
        document.getElementById('cli-email').value = cli.correo || '';
        document.getElementById('cli-direccion').value = cli.direccion || '';
        document.getElementById('cli-hijo').value = cli.hijo || '';
        document.getElementById('cli-parentesco').value = cli.parentesco || "Madre";
        document.getElementById('cli-nacimiento').value = cli.nacimiento;
        document.getElementById('cli-alergias').value = cli.alergias || '';
        document.getElementById('cli-categoria').value = cli.categoria;

        window.calcularEdad(); 
    };

    // --- 5. CRUD: ELIMINAR ---
    window.eliminarCliente = async function(id) {
        const confirmado = await showConfirm(
            "Se archivará el cliente pero se mantendrá su historial de ventas.", 
            "¿Eliminar Cliente?"
        );

        if (confirmado) {
            try {
                const token = localStorage.getItem('token');
                const res = await fetch(`/api/clientes/${id}`, {
                    method: 'DELETE',
                    headers: { 'x-auth-token': token }
                });

                if (res.ok) {
                    showToast("Cliente removido con éxito.", "success");
                    initClientes();
                } else {
                    const data = await res.json();
                    showToast(data.msg || "No se pudo eliminar.", "error");
                }
            } catch (error) {
                showToast("Error de comunicación.", "error");
            }
        }
    };

    // --- INTERFAZ Y AUXILIARES ---
    window.abrirModalCliente = function() {
        document.getElementById('modal-cliente').classList.add('active');
        document.getElementById('cli-id').value = ""; 
        document.getElementById('form-cliente').reset();
        document.getElementById('cli-edad-calc').value = "";
    };

    window.cerrarModalCliente = function() {
        document.getElementById('modal-cliente').classList.remove('active');
    };

    window.calcularEdad = function() {
        const fechaVal = document.getElementById('cli-nacimiento').value;
        const inputEdad = document.getElementById('cli-edad-calc');
        
        if(fechaVal) {
            const hoy = new Date();
            const cumple = new Date(fechaVal);
            let edad = hoy.getFullYear() - cumple.getFullYear();
            if (hoy.getMonth() < cumple.getMonth() || (hoy.getMonth() === cumple.getMonth() && hoy.getDate() < cumple.getDate())) edad--;
            inputEdad.value = edad + (edad === 1 ? " año" : " años");
        } else {
            inputEdad.value = "";
        }
    };

    // Función para Exportar Clientes a Excel de forma profesional
    window.exportarClientes = function() {
        if (!clientesFiltrados || clientesFiltrados.length === 0) {
            return showToast("No hay datos para exportar en este momento", "warning");
        }

        if (typeof XLSX === 'undefined') {
            return showToast("Error: Librería de Excel no detectada", "error");
        }

        try {
            // Preparar la data con nombres de columnas limpios
            const dataParaExcel = clientesFiltrados.map(c => ({
                "NOMBRE TITULAR": c.nombre,
                "DNI / CE": c.dni,
                "RUC": c.ruc || '-',
                "TELEFONO": c.telefono,
                "CORREO": c.correo || '-',
                "DIRECCIÓN": c.direccion || '-',
                "HIJO (CUMPLEAÑERO)": c.hijo || '-',
                "FECHA NACIMIENTO": c.nacimiento || '-',
                "CATEGORÍA": c.categoria.toUpperCase(),
                "ÚLTIMA VISITA": c.ultVisita
            }));

            // Crear el libro y la hoja
            const worksheet = XLSX.utils.json_to_sheet(dataParaExcel);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Directorio Clientes");

            // Ajustar anchos de columna automáticamente
            const wscols = [
                {wch: 30}, {wch: 15}, {wch: 15}, {wch: 15}, {wch: 25}, 
                {wch: 30}, {wch: 25}, {wch: 18}, {wch: 12}, {wch: 15}
            ];
            worksheet['!cols'] = wscols;

            // Descargar archivo
            const fechaArchivo = new Date().toISOString().split('T')[0];
            XLSX.writeFile(workbook, `Reporte_Clientes_${fechaArchivo}.xlsx`);
            
            showToast("Excel generado correctamente", "success");

        } catch (error) {
            console.error("Error al exportar Excel:", error);
            showToast("Fallo al generar el archivo Excel", "error");
        }
    };

    // Buscador en tiempo real con reset de página
    const buscador = document.getElementById('buscador-clientes');
    if(buscador) {
        buscador.addEventListener('input', (e) => {
            const term = e.target.value.toLowerCase();
            clientesFiltrados = clientesData.filter(c => 
                c.nombre.toLowerCase().includes(term) || 
                c.dni.includes(term) ||
                c.hijo?.toLowerCase().includes(term) ||
                c.telefono.includes(term)
            );
            paginaActual = 1; // RESET IMPORTANTE
            renderizarTablaClientes();
        });
    }

    // Escuchar cambio en fecha para autocalcular edad
    const inputFecha = document.getElementById('cli-nacimiento');
    if(inputFecha) inputFecha.addEventListener('change', window.calcularEdad);

    // Función para buscar datos de cliente por DNI o RUC con UX mejorada
    window.buscarDatosClienteModal = async function() {
        // 1. Detectar si buscamos por DNI o por RUC
        // Prioridad: Si hay algo escrito en RUC, busca RUC. Si no, busca DNI.
        const inputDni = document.getElementById('cli-dni');
        const inputRuc = document.getElementById('cli-ruc');
        const dniVal = inputDni.value.trim();
        const rucVal = inputRuc.value.trim();

        let numero = "";
        let tipo = "";

        if (rucVal.length === 11) {
            numero = rucVal;
            tipo = "ruc";
        } else if (dniVal.length === 8) {
            numero = dniVal;
            tipo = "dni";
        } else {
            return showToast("Ingrese un DNI (8 dígitos) o RUC (11 dígitos) válido para buscar.", "warning");
        }

        // 2. Efecto Visual Profesional (Sin saltos)
        const btn = event.currentTarget; // El botón lupa presionado
        const icon = btn.querySelector('i');
        const originalClass = icon ? icon.className : '';
        
        if(icon) icon.className = 'bx bx-loader-alt bx-spin'; // Spinner
        btn.disabled = true;

        // 3. Bloqueo de campos mientras busca
        const inputNombre = document.getElementById('cli-nombre');
        const inputDireccion = document.getElementById('cli-direccion');
        
        inputNombre.placeholder = "Consultando...";
        inputNombre.style.backgroundColor = "#f1f5f9";

        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/consultas/${numero}`, {
                headers: { 'x-auth-token': token }
            });
            const data = await res.json();

            if (res.ok && data.success) {
                showToast(`✅ Encontrado: ${data.nombre}`, "success");
                
                // Llenar datos
                inputNombre.value = data.nombre;
                inputNombre.style.backgroundColor = "#dcfce7"; // Verde éxito

                // Si es RUC, llenamos dirección
                if (tipo === "ruc" && data.direccion) {
                    inputDireccion.value = data.direccion;
                }

                // Advertencia SUNAT si no está activo
                if (data.estado && data.estado !== 'ACTIVO') {
                    showToast(`⚠️ Estado SUNAT: ${data.estado}`, "warning");
                }

            } else {
                showToast("ℹ️ No encontrado. Ingrese los datos manualmente.", "info");
                inputNombre.value = "";
                inputNombre.style.backgroundColor = "#fff";
                inputNombre.focus();
            }

        } catch (error) {
            console.error("Error búsqueda cliente:", error);
            showToast("Error de conexión al buscar datos.", "error");
            inputNombre.style.backgroundColor = "#fff";
        } finally {
            // 4. Restaurar botón
            if(icon) icon.className = originalClass;
            btn.disabled = false;
            inputNombre.placeholder = " ";
        }
    };

    initClientes();

})();