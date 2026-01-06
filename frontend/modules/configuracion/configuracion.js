// Ubicacion: SuperNova/frontend/modules/configuracion/configuracion.js

(function() { // Cápsula de seguridad
    console.log("Módulo Configuración Cargado");

    let isListView = false;

    // --- 1. INICIALIZACIÓN ---
    async function initConfig() {
        await cargarSedesEnSelect();
        // Si estuviéramos en vista lista, cargaríamos usuarios
    }

    // --- 2. CARGAR SEDES DINÁMICAMENTE ---
    async function cargarSedesEnSelect() {
        const selectSede = document.getElementById('sede');
        if(!selectSede) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/usuarios/sedes', {
                headers: { 'x-auth-token': token }
            });
            
            if(res.ok) {
                const sedes = await res.json();
                // Limpiar y poner opción por defecto
                selectSede.innerHTML = '<option value="" disabled selected>Seleccionar Sede...</option>';
                
                sedes.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id; // El value será el ID (ej: 3, 4)
                    opt.textContent = s.nombre; // El texto será "Primavera", "Molina"
                    selectSede.appendChild(opt);
                });
            }
        } catch (error) {
            console.error("Error cargando sedes:", error);
        }
    }

    // --- 3. CARGAR USUARIOS (VISTA LISTA) ---
    async function cargarListaUsuarios() {
        const tbody = document.getElementById('tabla-usuarios-body');
        if (!tbody) return;
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center">Cargando...</td></tr>';

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/usuarios', {
                headers: { 'x-auth-token': token }
            });
            const usuarios = await res.json();

            tbody.innerHTML = '';
            usuarios.forEach(u => {
                let badgeClass = 'role-colab';
                if (u.rol === 'admin') badgeClass = 'role-admin';
                if (u.rol === 'logistica') badgeClass = 'role-logis';
                
                // Imagen por defecto si no tiene
                const imgUrl = u.foto_url || "https://cdn-icons-png.flaticon.com/512/149/149071.png";

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div class="user-profile-cell">
                            <img src="${imgUrl}" class="user-mini-img">
                            <div class="user-info">
                                <h4>${u.nombres} ${u.apellidos || ''}</h4>
                                <span>${u.correo}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div style="font-size:14px; font-weight:500;">${u.cargo || '-'}</div>
                        <div style="font-size:12px; color:#888;">${u.nombre_sede || 'Sin Sede'}</div>
                    </td>
                    <td><span class="role-tag ${badgeClass}">${u.rol.toUpperCase()}</span></td>
                    <td><span style="color:#28a745; font-weight:600; font-size:13px;">${u.estado}</span></td>
                    <td>
                        <button class="btn-action-mini btn-edit" title="Editar"><i class='bx bx-edit-alt'></i></button>
                        <button class="btn-action-mini btn-del" title="Eliminar"><i class='bx bx-trash'></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

        } catch (error) {
            console.error(error);
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red">Error al cargar usuarios</td></tr>';
        }
    }

    // --- 4. LOGICA VISUAL (TOGGLE) ---
    window.toggleUserView = function() {
        const viewCreate = document.getElementById('view-create');
        const viewList = document.getElementById('view-list');
        const btnToggle = document.getElementById('btn-toggle-view');
        const title = document.getElementById('config-title');
        const desc = document.getElementById('config-desc');

        isListView = !isListView;

        if (isListView) {
            viewCreate.style.display = 'none';
            viewList.style.display = 'block';
            btnToggle.innerHTML = "<i class='bx bx-plus'></i> Nuevo Usuario";
            title.innerText = "Lista de Usuarios";
            desc.innerText = "Visualiza y gestiona el personal registrado.";
            cargarListaUsuarios(); // Cargar datos reales
        } else {
            viewList.style.display = 'none';
            viewCreate.style.display = 'grid';
            btnToggle.innerHTML = "<i class='bx bx-list-ul'></i> Ver Lista de Usuarios";
            title.innerText = "Administración de Usuarios";
            desc.innerText = "Crea y gestiona las cuentas de acceso al sistema.";
        }
    }

    // --- 5. GUARDAR USUARIO ---
    const form = document.getElementById('form-crear-usuario-completo');
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            // 1. Capturar datos del formulario
            const datosUsuario = {
                nombres: document.getElementById('nombres').value,
                apellidos: document.getElementById('apellidos').value,
                dni: document.getElementById('dni').value,
                celular: document.getElementById('celular').value,
                direccion: document.getElementById('direccion').value,
                cargo: document.getElementById('cargo').value,
                sede_id: document.getElementById('sede').value, // Ahora enviamos el ID numérico
                rol: document.getElementById('rol').value,
                email: document.getElementById('email').value,
                password: document.getElementById('password').value
            };

            const btnSubmit = form.querySelector('.btn-save');
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Guardando...";
            btnSubmit.disabled = true;

            try {
                const token = localStorage.getItem('token');
                // 2. Enviar al Backend
                const response = await fetch('/api/usuarios', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-auth-token': token
                    },
                    body: JSON.stringify(datosUsuario)
                });

                const data = await response.json();

                if(response.ok) {
                    alert("✅ " + data.msg);
                    form.reset();
                    document.getElementById('preview-img').src = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
                } else {
                    alert("❌ Error: " + data.msg);
                }

            } catch (error) {
                console.error(error);
                alert("❌ Error de conexión con el servidor");
            } finally {
                btnSubmit.innerHTML = originalText;
                btnSubmit.disabled = false;
            }
        });
    }

    // Previsualizar foto (Visual)
    setTimeout(() => {
        const fileInput = document.getElementById('input-foto');
        const previewImg = document.getElementById('preview-img');
        if (fileInput) {
            fileInput.addEventListener('change', function(e) {
                const file = e.target.files[0];
                if (file) {
                    const reader = new FileReader();
                    reader.onload = function(evt) { if (previewImg) previewImg.src = evt.target.result; };
                    reader.readAsDataURL(file);
                }
            });
        }
    }, 500);

    // Arrancar
    initConfig();

})();