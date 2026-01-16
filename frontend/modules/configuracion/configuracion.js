// Ubicacion: SuperNova/frontend/modules/configuracion/configuracion.js

(function() { 
    console.log("Módulo Configuración Cargado ⚙️");

    let isListView = false;
    let editModeUserId = null; // Variable para saber si estamos editando a alguien
    let paginaActual = 1;
    let totalPaginas = 1;
    let terminoBusqueda = "";
    // --- 1. INICIALIZACIÓN ---
    async function initConfig() {
        await cargarSedesEnSelect();
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
                selectSede.innerHTML = '<option value="" disabled selected>Seleccionar Sede...</option>';
                if (Array.isArray(sedes)) {
                    sedes.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.id; 
                        opt.textContent = s.nombre; 
                        selectSede.appendChild(opt);
                    });
                }
            }
        } catch (error) {
            console.error("Error cargando sedes:", error);
        }
    }

    // --- 3. CARGAR USUARIOS (VISTA LISTA) ---
async function cargarListaUsuarios() {
        const tbody = document.getElementById('tabla-usuarios-body');
        // Asegúrate de tener estos elementos en tu HTML (o agrégalos dinámicamente)
        const infoPag = document.getElementById('info-paginacion'); 
        const btnPrev = document.getElementById('btn-prev');
        const btnNext = document.getElementById('btn-next');

        if (!tbody) return;
        
        tbody.innerHTML = '<tr><td colspan="6" class="loading-cell" style="text-align:center; padding:20px;"><i class="bx bx-loader-alt bx-spin"></i> Cargando...</td></tr>';

        try {
            const token = localStorage.getItem('token');
            // 🔥 AHORA ENVIAMOS PARAMETROS: q (búsqueda) y page (página)
            const url = `/api/usuarios?q=${encodeURIComponent(terminoBusqueda)}&page=${paginaActual}`;
            
            const res = await fetch(url, { headers: { 'x-auth-token': token } });

            if (!res.ok) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Error al cargar datos.</td></tr>';
                return;
            }

            // Recibimos estructura compleja: { usuarios: [...], pagination: {...} }
            const data = await res.json(); 
            // Si el backend aun devuelve array simple, esto evita que rompa:
            const usuarios = Array.isArray(data) ? data : (data.usuarios || []);
            const pag = data.pagination || { page: 1, totalPaginas: 1, totalRegistros: usuarios.length };

            // Actualizar variables globales
            totalPaginas = pag.totalPaginas;
            
            // Actualizar Botones de Paginación (Si existen en el HTML)
            if(infoPag) infoPag.innerText = `Página ${pag.page} de ${pag.totalPaginas}`;
            if(btnPrev) btnPrev.disabled = (pag.page <= 1);
            if(btnNext) btnNext.disabled = (pag.page >= pag.totalPaginas);

            tbody.innerHTML = '';

            if (usuarios.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px;">No se encontraron resultados.</td></tr>';
                return;
            }

            usuarios.forEach(u => {
                let badgeClass = 'role-colab';
                const r = (u.rol || '').toLowerCase();
                if (r.includes('admin') || r.includes('gerente')) badgeClass = 'role-admin';
                else if (r.includes('logistica')) badgeClass = 'role-logis';
                else if (r.includes('super')) badgeClass = 'role-superadmin'; // Asumiendo que tienes clase CSS para super
                
                // 🔥 CORRECCIÓN DEFINITIVA DE IMAGEN
                let imgUrl = "https://cdn-icons-png.flaticon.com/512/149/149071.png"; // Imagen default
                
                if (u.foto_url && u.foto_url !== 'null') {
                    if(u.foto_url.startsWith('http')) {
                        // Si ya es una URL web (ej: Cloudinary), usarla tal cual
                        imgUrl = u.foto_url;
                    } else {
                        // Si es local:
                        // 1. Reemplazar backslashes de Windows (\) por slashes web (/)
                        let cleanPath = u.foto_url.replace(/\\/g, '/');
                        // 2. Asegurar que no tenga doble slash al inicio
                        if (cleanPath.startsWith('/') || cleanPath.startsWith('backend/')) {
                            // Ajusta esto según cómo guardes la ruta. Normalmente queremos "uploads/foto.jpg"
                            // Si tu ruta en DB es "backend/uploads/foto.jpg", úsala tal cual con el host.
                        }
                        // 3. Prepend el host (Asumiendo que tu backend corre en el 3000)
                        imgUrl = `http://localhost:3000/${cleanPath}`; 
                    }
                }

                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td>
                        <div class="user-profile-cell">
                            <img src="${imgUrl}" class="user-mini-img" 
                                 onerror="this.onerror=null; this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png';">
                            <div class="user-info">
                                <h4>${u.nombres} ${u.apellidos || ''}</h4>
                                <span>${u.correo || u.email || 'Sin correo'}</span>
                            </div>
                        </div>
                    </td>
                    <td>
                        <div style="font-size:14px; font-weight:500;">${u.cargo || '-'}</div>
                        <div style="font-size:12px; color:#888;">${u.nombre_sede || 'Global'}</div>
                    </td>
                    <td><span class="role-tag ${badgeClass}">${(u.rol || '').toUpperCase()}</span></td>
                    <td>
                        <span style="color:${u.estado === 'Activo' || u.activo ? '#16a34a' : '#dc2626'}; font-weight:700; font-size:12px; text-transform:uppercase;">
                            ${u.estado || (u.activo ? 'ACTIVO' : 'INACTIVO')}
                        </span>
                    </td>
                    <td>
                        <button class="btn-action-mini btn-edit" title="Editar" onclick="editarUsuario(${u.id})"><i class='bx bx-edit-alt'></i></button>
                        <button class="btn-action-mini btn-del" title="Eliminar" onclick="eliminarUsuario(${u.id})"><i class='bx bx-trash'></i></button>
                    </td>
                `;
                tbody.appendChild(tr);
            });

        } catch (error) {
            console.error(error);
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; color:red;">Error de conexión.</td></tr>';
        }
    }
    // A. Escuchar el buscador
    const buscador = document.getElementById('buscador-usuarios');
    if(buscador) {
        let timeout = null;
        buscador.addEventListener('input', (e) => {
            clearTimeout(timeout);
            // Retardo de 300ms para no saturar al escribir rápido
            timeout = setTimeout(() => {
                terminoBusqueda = e.target.value.trim();
                
                // 🔥 CLAVE: Al buscar, siempre reseteamos a la página 1
                // Esto garantiza que busques en "todas las páginas" y veas los primeros resultados
                paginaActual = 1; 
                
                cargarListaUsuarios();
            }, 300); 
        });
    }

    // B. Botones Anterior/Siguiente
    window.cambiarPagina = function(direccion) {
        const nuevaPagina = paginaActual + direccion;
        if (nuevaPagina > 0 && nuevaPagina <= totalPaginas) {
            paginaActual = nuevaPagina;
            cargarListaUsuarios();
        }
    };
    // --- 4. FUNCIONES DE ACCIÓN (GLOBALES) ---

    // 🔥 FUNCIÓN EDITAR REAL
    window.editarUsuario = async function(id) {
        const token = localStorage.getItem('token');
        try {
            // 1. Pedir los datos del usuario al backend
            const res = await fetch(`/api/usuarios/${id}`, {
                headers: { 'x-auth-token': token }
            });

            if (!res.ok) throw new Error("Error al obtener datos del usuario.");

            const usuario = await res.json();

            // 2. Llenar el formulario y cambiar a la vista de edición
            prepararFormularioEdicion(usuario);

        } catch (error) {
            console.error(error);
            alert("❌ No se pudieron cargar los datos del usuario para editar.");
        }
    };

    // Función auxiliar para borrar usuario
    window.eliminarUsuario = async function(id) {
        if(!confirm("¿Estás seguro de eliminar este usuario? Esta acción no se puede deshacer.")) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/usuarios/${id}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': token }
            });
            const data = await res.json();
            if(res.ok) {
                alert("✅ " + data.msg);
                cargarListaUsuarios();
            } else {
                alert("❌ Error: " + (data.msg || "No se pudo eliminar"));
            }
        } catch(e) { 
            console.error(e); 
            alert("Error de conexión.");
        }
    };

    // --- 5. LÓGICA DEL FORMULARIO (CREAR / EDITAR) ---

    // Llena el formulario con datos para editar
    function prepararFormularioEdicion(usuario) {
        if (isListView) toggleUserView(); // Ir a la vista de formulario

        editModeUserId = usuario.id; // Marcar que estamos editando

        // Cambiar títulos y botones
        document.getElementById('config-title').innerText = "Editar Usuario";
        document.querySelector('#form-crear-usuario-completo .btn-save').innerHTML = "<i class='bx bx-save'></i> Actualizar Usuario";
        
        // Llenar campos
        document.getElementById('nombres').value = usuario.nombres || '';
        document.getElementById('apellidos').value = usuario.apellidos || '';
        document.getElementById('dni').value = usuario.dni || '';
        document.getElementById('celular').value = usuario.celular || '';
        document.getElementById('direccion').value = usuario.direccion || '';
        document.getElementById('cargo').value = usuario.cargo || '';
        document.getElementById('sede').value = usuario.sede_id || '';
        document.getElementById('rol').value = usuario.rol || '';
        document.getElementById('email').value = usuario.correo || '';
        
        // La contraseña no es obligatoria al editar
        const passInput = document.getElementById('password');
        passInput.required = false;
        passInput.placeholder = "Dejar en blanco para mantener la actual";

        // Previsualizar foto actual si existe
        const previewImg = document.getElementById('preview-img');
        if (usuario.foto_url) {
            let cleanPath = usuario.foto_url.replace(/\\/g, '/');
            if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);
            previewImg.src = `http://localhost:3000/${cleanPath}`;
        } else {
            previewImg.src = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
        }
        // Limpiar input de archivo para no re-subir la misma foto
        document.getElementById('input-foto').value = '';
    }

    // Resetea el formulario al estado "Crear Nuevo"
    function resetearFormulario() {
        const form = document.getElementById('form-crear-usuario-completo');
        form.reset();
        editModeUserId = null; // Ya no estamos editando

        document.getElementById('config-title').innerText = "Administración de Usuarios";
        form.querySelector('.btn-save').innerHTML = "<i class='bx bx-user-plus'></i> Registrar Usuario";
        
        const passInput = document.getElementById('password');
        passInput.required = true;
        passInput.placeholder = " ";
        document.getElementById('preview-img').src = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
    }


    // --- 6. CONTROLADOR DE VISTAS (TOGGLE) ---
    window.toggleUserView = function() {
        const viewCreate = document.getElementById('view-create');
        const viewList = document.getElementById('view-list');
        const btnToggle = document.getElementById('btn-toggle-view');
        
        isListView = !isListView;

        if (isListView) {
            // Cambiando a VISTA LISTA
            viewCreate.style.display = 'none';
            viewList.style.display = 'block';
            btnToggle.innerHTML = "<i class='bx bx-plus'></i> Nuevo Usuario";
            cargarListaUsuarios();
            // Si estábamos editando, cancelamos y reseteamos el formulario
            if (editModeUserId) resetearFormulario();
        } else {
            // Cambiando a VISTA FORMULARIO
            viewList.style.display = 'none';
            viewCreate.style.display = 'grid';
            btnToggle.innerHTML = "<i class='bx bx-list-ul'></i> Ver Lista de Usuarios";
            // Si no estamos en modo edición, aseguramos que el formulario esté limpio
            if (!editModeUserId) resetearFormulario();
        }
    }

    // --- 7. ENVÍO DEL FORMULARIO (CREAR O ACTUALIZAR) ---
    const form = document.getElementById('form-crear-usuario-completo');
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btnSubmit = form.querySelector('.btn-save');
            const originalText = btnSubmit.innerHTML;
            btnSubmit.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Procesando...";
            btnSubmit.disabled = true;

            // 🔥 USAMOS FORMDATA PARA ENVIAR ARCHIVOS Y DATOS
            const formData = new FormData();
            formData.append('nombres', document.getElementById('nombres').value);
            formData.append('apellidos', document.getElementById('apellidos').value);
            formData.append('dni', document.getElementById('dni').value);
            formData.append('celular', document.getElementById('celular').value);
            formData.append('direccion', document.getElementById('direccion').value);
            formData.append('cargo', document.getElementById('cargo').value);
            formData.append('sede_id', document.getElementById('sede').value);
            formData.append('rol', document.getElementById('rol').value);
            formData.append('email', document.getElementById('email').value);
            
            const password = document.getElementById('password').value;
            // Solo enviar contraseña si se escribió algo (importante al editar)
            if (password) {
                formData.append('password', password);
            }

            const fileInput = document.getElementById('input-foto');
            if (fileInput.files[0]) {
                formData.append('foto', fileInput.files[0]);
            }

            try {
                const token = localStorage.getItem('token');
                let url = '/api/usuarios';
                let method = 'POST';

                // Si estamos editando, cambiamos la URL y el método
                if (editModeUserId) {
                    url = `/api/usuarios/${editModeUserId}`;
                    method = 'PUT';
                }

                const response = await fetch(url, {
                    method: method,
                    headers: { 'x-auth-token': token }, // ¡NO poner Content-Type con FormData!
                    body: formData
                });

                const data = await response.json();

                if(response.ok) {
                    alert("✅ " + data.msg);
                    if (editModeUserId) {
                        // Si fue una actualización, volvemos a la lista
                        toggleUserView();
                    } else {
                        // Si fue creación, solo reseteamos el formulario
                        resetearFormulario();
                    }
                } else {
                    alert("❌ Error: " + (data.msg || "Operación fallida"));
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

    // Previsualizar foto al seleccionar archivo
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

    initConfig();
})();