// Ubicacion: SuperNova/frontend/modules/clientes/clientes.js

console.log("Modulo Clientes CRM Conectado a DB");

let clientesData = []; // Ahora se llena desde el servidor

// --- HELPERS GLOBALES ---

// Función utilitaria para formato de fecha (necesaria para el input type=date)
function formatToISODate(dateString) {
    if (!dateString) return '';
    try {
        const dateObj = new Date(dateString);
        return dateObj.toISOString().slice(0, 10);
    } catch (e) {
        // Fallback simple si la cadena es mal formada
        return '';
    }
}

function calcularEdad() {
    const fechaVal = document.getElementById('cli-nacimiento').value;
    const inputEdad = document.getElementById('cli-edad-calc');
    
    if(fechaVal) {
        const hoy = new Date();
        const cumple = new Date(fechaVal);
        let edad = hoy.getFullYear() - cumple.getFullYear();
        const m = hoy.getMonth() - cumple.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) {
            edad--;
        }
        inputEdad.value = edad + " años";
    } else {
        inputEdad.value = "";
    }
}


// --- 1. CARGA DE DATOS (READ) ---
async function initClientes() {
    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await fetch('/api/clientes', {
            headers: { 'x-auth-token': token }
        });
        const data = await res.json();

        if (res.ok) {
            // Mapeamos los datos de la BD (columnas largas) a la variable local
            clientesData = data.map(c => ({
                id: String(c.id), 
                nombre: c.nombre_completo, // Nombre Apoderado
                dni: c.documento_id,      // DNI
                ruc: c.ruc,
                telefono: c.telefono,
                correo: c.correo,
                direccion: c.direccion,
                hijo: c.nombre_hijo,
                parentesco: c.parentesco,
                nacimiento: c.fecha_nacimiento_hijo ? c.fecha_nacimiento_hijo.slice(0, 10) : null,
                alergias: c.observaciones_medicas,
                categoria: c.categoria,
                ultVisita: new Date(c.ultima_visita || c.fecha_registro).toLocaleDateString()
            }));
            
            renderizarTablaClientes();
        } else {
            showToast("Error cargando clientes. Acceso denegado.", "error", "Carga Fallida");
        }
    } catch (error) {
        console.error("Error de conexión:", error);
    }
}

// 2. RENDERIZAR TABLA
function renderizarTablaClientes(datos = clientesData) {
    const tbody = document.getElementById('tabla-clientes-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    // ... (Tu lógica de renderizado se mantiene igual) ...

    datos.forEach(cli => {
        const tr = document.createElement('tr');
        
        let badgeClass = 'cat-nuevo';
        if(cli.categoria === 'frecuente') badgeClass = 'cat-frecuente';
        if(cli.categoria === 'vip') badgeClass = 'cat-vip';

        let alertaMedica = '';
        if(cli.alergias && cli.alergias !== 'Ninguna' && cli.alergias !== '') {
            alertaMedica = `<i class='bx bxs-first-aid' title="Alergia: ${cli.alergias}" style="color:#e91e63; margin-left:5px; cursor:help;"></i>`;
        }

        let edadHtml = '';
        if(cli.nacimiento) {
            const edad = new Date().getFullYear() - new Date(cli.nacimiento).getFullYear();
            edadHtml = `<span style="font-size:11px; color:#888;">(${edad} años)</span>`;
        }

        tr.innerHTML = `
            <td>
                <div style="font-weight:600; color:#333;">${cli.nombre}</div>
                <div style="font-size:11px; color:#888;">DNI: ${cli.dni} ${cli.ruc ? '/ RUC' : ''}</div>
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
                    <button class="btn-action edit" onclick="editarCliente(${cli.id})"><i class='bx bx-edit-alt'></i></button>
                    <button class="btn-action delete" onclick="eliminarCliente(${cli.id})"><i class='bx bx-trash'></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// 3. CRUD: GUARDAR (CREATE/UPDATE)
async function guardarCliente() {
    const id = document.getElementById('cli-id').value;
    const nombre = document.getElementById('cli-nombre').value;
    const telefono = document.getElementById('cli-telefono').value;
    
    if(!nombre || !telefono) return showToast("Nombre y Teléfono son obligatorios", "error");

    // Mapeo al formato que el Backend (DB) espera
    const clienteData = {
        nombre_completo: nombre,
        documento_id: document.getElementById('cli-dni').value, // BD espera documento_id
        ruc: document.getElementById('cli-ruc').value,
        telefono: telefono,
        correo: document.getElementById('cli-email').value,
        direccion: document.getElementById('cli-direccion').value,
        nombre_hijo: document.getElementById('cli-hijo').value,
        parentesco: document.getElementById('cli-parentesco').value,
        fecha_nacimiento_hijo: document.getElementById('cli-nacimiento').value, // Ya está en ISO (YYYY-MM-DD)
        observaciones_medicas: document.getElementById('cli-alergias').value,
        categoria: document.getElementById('cli-categoria').value,
    };

    try {
        const token = localStorage.getItem('token');
        const url = id ? `/api/clientes/${id}` : '/api/clientes';
        const method = id ? 'PUT' : 'POST';

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
            body: JSON.stringify(clienteData)
        });

        const data = await res.json();

        if (res.ok) {
            showToast(`Cliente ${id ? 'actualizado' : 'creado'} con éxito.`, "success");
            cerrarModalCliente();
            initClientes(); // Recargar datos
        } else {
            showToast(`Error: ${data.msg}`, "error", "Error de servidor");
        }
    } catch (error) {
        showToast("Error de conexión con el servidor", "error");
    }
}

// 4. CRUD: EDITAR (READ INTO FORM)
function editarCliente(id) {
    const cli = clientesData.find(c => c.id == id);
    if (!cli) return showToast("Cliente no encontrado para edición", "error");

    abrirModalCliente();
    document.querySelector('#modal-title').innerText = "Editar Cliente";
    
    // Mapeo de BD al Formulario
    document.getElementById('cli-id').value = cli.id;
    document.getElementById('cli-nombre').value = cli.nombre;
    document.getElementById('cli-dni').value = cli.dni;
    document.getElementById('cli-ruc').value = cli.ruc || '';
    document.getElementById('cli-telefono').value = cli.telefono;
    document.getElementById('cli-email').value = cli.correo || '';
    document.getElementById('cli-direccion').value = cli.direccion || '';
    
    document.getElementById('cli-hijo').value = cli.hijo || '';
    document.getElementById('cli-parentesco').value = cli.parentesco || "Madre";
    
    // FIX: La fecha ya está en ISO (YYYY-MM-DD) en la variable local, la cargamos directo
    document.getElementById('cli-nacimiento').value = cli.nacimiento;
    
    document.getElementById('cli-alergias').value = cli.alergias || '';
    document.getElementById('cli-categoria').value = cli.categoria;

    calcularEdad(); 
}

// 5. CRUD: ELIMINAR
async function eliminarCliente(id) {
    const confirmado = await showConfirm("Esta acción no se puede deshacer.", "¿Eliminar Cliente?");

    if (confirmado) {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/clientes/${id}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': token }
            });

            if (res.ok) {
                showToast("Cliente eliminado.", "success");
                initClientes();
            } else {
                showToast("Fallo al eliminar.", "error");
            }
        } catch (error) {
            showToast("Error de conexión", "error");
        }
    }
}

// 3. CRUD
function abrirModalCliente() {
    document.getElementById('modal-cliente').classList.add('active');
    document.querySelector('#modal-title').innerText = "Nuevo Cliente";
    document.getElementById('cli-id').value = ""; 
    document.getElementById('form-cliente').reset();
    document.getElementById('cli-edad-calc').value = "";
}

function cerrarModalCliente() {
    document.getElementById('modal-cliente').classList.remove('active');
}

function calcularEdad() {
    const fechaVal = document.getElementById('cli-nacimiento').value;
    const inputEdad = document.getElementById('cli-edad-calc');
    
    if(fechaVal) {
        const hoy = new Date();
        const cumple = new Date(fechaVal);
        let edad = hoy.getFullYear() - cumple.getFullYear();
        const m = hoy.getMonth() - cumple.getMonth();
        if (m < 0 || (m === 0 && hoy.getDate() < cumple.getDate())) {
            edad--;
        }
        inputEdad.value = edad + " años";
    } else {
        inputEdad.value = "";
    }
}

function exportarClientes() {
    alert("Exportando base de datos de clientes...");
}


const buscador = document.getElementById('buscador-clientes');
if(buscador) {
    buscador.addEventListener('keyup', (e) => {
        const term = e.target.value.toLowerCase();
        const filtrados = clientesData.filter(c => 
            c.nombre.toLowerCase().includes(term) || 
            c.dni.includes(term) ||
            c.hijo?.toLowerCase().includes(term)
        );
        renderizarTablaClientes(filtrados);
    });
}



renderizarTablaClientes();

window.initClientes = initClientes;

// Arrancamos la carga inicial
initClientes();