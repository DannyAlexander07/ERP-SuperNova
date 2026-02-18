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
                
                // 🔥 CORRECCIÓN DEFINITIVA DE IMAGEN (ANTI-404)
                let imgUrl = "https://cdn-icons-png.flaticon.com/512/149/149071.png"; // Imagen default
                
                if (u.foto_url && u.foto_url !== 'null') {
                    if(u.foto_url.startsWith('http')) {
                        imgUrl = u.foto_url;
                    } else {
                        // 1. Limpiar barras invertidas de Windows y el prefijo 'backend/' si existe
                        let cleanPath = u.foto_url.replace(/\\/g, '/').replace('backend/', '');
                        
                        // 2. Eliminar el slash inicial si existe para evitar la doble barra (//)
                        if (cleanPath.startsWith('/')) {
                            cleanPath = cleanPath.substring(1);
                        }
                        
                        // 3. Concatenar con el host limpio
                        imgUrl = `http://localhost:3000/${cleanPath}`; 
                    }
                }
                const opacityStyle = (u.estado || '').toLowerCase() === 'eliminado' ? 'opacity: 0.5; filter: grayscale(1);' : '';

                // Y en el tr:
                const tr = document.createElement('tr');
                tr.style = opacityStyle;
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
                        <span style="color:${(u.estado || '').toLowerCase() === 'activo' ? '#16a34a' : '#dc2626'}; font-weight:700; font-size:12px; text-transform:uppercase;">
                            ${u.estado || (u.activo ? 'ACTIVO' : 'INACTIVO')}
                        </span>
                    </td>
                    <td>
                        <button class="btn-action-mini btn-edit" title="Editar" onclick="editarUsuario(${u.id})">
                            <i class='bx bx-edit-alt'></i>
                        </button>
                        <button class="btn-action-mini btn-del" title="Gestionar Estado / Inhabilitar" onclick="eliminarUsuario(${u.id})">
                            <i class='bx bx-user-x'></i>
                        </button>
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
            // 🆕 Usar tu función de toast en lugar del alert feo
            if (typeof showToast === 'function') {
                showToast("No se pudieron cargar los datos del usuario para editar.", "error");
            } else {
                alert("❌ No se pudieron cargar los datos del usuario para editar.");
            }
        }
    };

    // Función auxiliar para borrar usuario
    window.eliminarUsuario = async function(id) {
        // 1. Buscamos los datos del usuario localmente para cargarlos rápido
        // (O podemos hacer un fetch al server si prefieres)
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/usuarios/${id}`, {
                headers: { 'x-auth-token': token }
            });
            const usuario = await res.json();

            if (!res.ok) throw new Error("No se pudo obtener la información del usuario");

            // 2. En lugar de borrarlo directamente, abrimos el formulario de edición
            // para que el admin elija: Inhabilitado o Eliminado.
            prepararFormularioEdicion(usuario);
            
            // 3. Notificación informativa al usuario
            if (typeof showToast === 'function') {
                showToast("Modo Gestión: Cambie el 'Estado del Usuario' según corresponda.", "info");
            } else {
                console.log("Cambiando a modo gestión de estado para el usuario: " + usuario.nombres);
            }

            // 4. Hacemos scroll suave hacia arriba para que vea el formulario
            window.scrollTo({ top: 0, behavior: 'smooth' });

        } catch (e) {
            console.error(e);
            if (typeof showToast === 'function') showToast("Error al cargar gestión de usuario", "error");
        }
    };

    // --- 5. LÓGICA DEL FORMULARIO (CREAR / EDITAR) ---
    function prepararFormularioEdicion(usuario) {
        // 1. Cambiar a la vista de formulario si estamos en la lista
        if (isListView) toggleUserView(); 

        // 2. Marcar el ID del usuario que estamos editando
        editModeUserId = usuario.id; 

        // 3. Actualizar la interfaz (Títulos y Botones)
        document.getElementById('config-title').innerText = "Editar Usuario";
        const btnSave = document.querySelector('#form-crear-usuario-completo .btn-save');
        if (btnSave) {
            btnSave.innerHTML = "<i class='bx bx-save'></i> Actualizar Usuario";
        }
        
        // 4. Llenado de campos de texto básicos
        document.getElementById('nombres').value = usuario.nombres || '';
        document.getElementById('apellidos').value = usuario.apellidos || '';
        
        // El campo dni en el objeto puede venir como 'dni' o 'documento_id'
        document.getElementById('dni').value = usuario.dni || usuario.documento_id || '';
        document.getElementById('celular').value = usuario.celular || '';
        document.getElementById('direccion').value = usuario.direccion || '';
        document.getElementById('cargo').value = usuario.cargo || '';
        
        // 5. Llenado de Selects (Sede y Rol)
        document.getElementById('sede').value = usuario.sede_id || '';
        
        // Aseguramos que el ID 'rol-usuario' coincida con tu HTML actualizado
        const rolSelect = document.getElementById('rol-usuario');
        if (rolSelect) {
            rolSelect.value = usuario.rol || '';
        }
        
        // 6. 🔥 CORRECCIÓN: Correo corporativo (Campo 'correo' en DB -> Input 'email' en HTML)
        const emailInput = document.getElementById('email');
        if (emailInput) {
            emailInput.value = usuario.correo || usuario.email || '';
        }
        
        // 7. 🔥 CORRECCIÓN: Estado del Usuario
        const estadoSelect = document.getElementById('edit-estado');
        if (estadoSelect) {
            // Normalizamos a minúsculas para que coincida con los values: 'activo', 'eliminado', etc.
            estadoSelect.value = (usuario.estado || 'activo').toLowerCase();
        }
        
        // 8. Gestión de Contraseña (No obligatoria en edición)
        const passInput = document.getElementById('password');
        if (passInput) {
            passInput.required = false;
            passInput.placeholder = "Dejar en blanco para mantener la actual";
            passInput.value = ""; // Limpiar cualquier intento previo
        }

        // 9. 🔥 CORRECCIÓN ANTI-404: Previsualización de Foto
        const previewImg = document.getElementById('preview-img');
        if (previewImg) {
            if (usuario.foto_url && usuario.foto_url !== 'null') {
                // Limpieza de ruta: quitamos 'backend/' y evitamos dobles slashes
                let cleanPath = usuario.foto_url.replace(/\\/g, '/').replace('backend/', '');
                
                if (cleanPath.startsWith('/')) {
                    cleanPath = cleanPath.substring(1);
                }
                
                // Construimos URL final
                previewImg.src = cleanPath.startsWith('http') ? cleanPath : `http://localhost:3000/${cleanPath}`;
            } else {
                // Foto por defecto
                previewImg.src = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
            }
        }

        // 10. Resetear el input file físico
        const fileInput = document.getElementById('input-foto');
        if (fileInput) {
            fileInput.value = '';
        }
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
        
        // Bloqueamos el botón y mostramos carga
        btnSubmit.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Procesando...";
        btnSubmit.disabled = true;

        try {
            const formData = new FormData();

            // --- 🛡️ FUNCIÓN DE CAPTURA SEGURA ---
            // Evita que el código se rompa si un ID no existe en el HTML
            const safeAppend = (id, key) => {
                const el = document.getElementById(id);
                if (el) {
                    formData.append(key, el.value);
                } else {
                    console.warn(`⚠️ Advertencia: No se encontró el elemento con ID "${id}"`);
                }
            };

            // Captura de datos (Ajustado a los IDs reales de tu HTML)
            safeAppend('nombres', 'nombres');
            safeAppend('apellidos', 'apellidos');
            safeAppend('dni', 'dni');
            safeAppend('celular', 'celular');
            safeAppend('direccion', 'direccion');
            safeAppend('cargo', 'cargo');
            safeAppend('sede', 'sede_id');
            safeAppend('rol-usuario', 'rol'); // ✅ Corregido de 'rol' a 'rol-usuario'
            safeAppend('email', 'email');
            
            // 🔥 Estado seleccionado
            const estadoSelect = document.getElementById('edit-estado');
            if (estadoSelect) {
                formData.append('estado', estadoSelect.value);
            }

            // Contraseña (Solo si se escribe)
            const passwordEl = document.getElementById('password');
            if (passwordEl && passwordEl.value) {
                formData.append('password', passwordEl.value);
            }

            // Foto (Solo si se selecciona)
            const fileInput = document.getElementById('input-foto');
            if (fileInput && fileInput.files[0]) {
                formData.append('foto', fileInput.files[0]);
            }

            // --- 🚀 ENVÍO AL BACKEND ---
            const token = localStorage.getItem('token');
            let url = '/api/usuarios';
            let method = 'POST';

            if (editModeUserId) {
                url = `/api/usuarios/${editModeUserId}`;
                method = 'PUT';
            }

            const response = await fetch(url, {
                method: method,
                headers: { 'x-auth-token': token },
                body: formData
            });

            const data = await response.json();

            if (response.ok) {
                if (typeof showToast === 'function') {
                    showToast(data.msg, "success");
                } else {
                    alert("✅ " + data.msg);
                }

                if (editModeUserId) {
                    toggleUserView();
                } else {
                    resetearFormulario();
                }
            } else {
                throw new Error(data.msg || "Operación fallida");
            }

        } catch (error) {
            console.error("❌ Error en submit:", error);
            
            // Notificación de error
            const errorMsg = error.message || "Error de conexión con el servidor";
            if (typeof showToast === 'function') {
                showToast(errorMsg, "error");
            } else {
                alert("❌ " + errorMsg);
            }
        } finally {
            // ✅ SIEMPRE se restaura el botón, pase lo que pase
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