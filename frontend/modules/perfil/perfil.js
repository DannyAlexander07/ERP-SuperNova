// Ubicacion: SuperNova/frontend/modules/perfil/perfil.js

(function() {
    console.log("Modulo Perfil Conectado 👤");

    const userStr = localStorage.getItem('user');
    if (!userStr) return; 
    const usuarioLogueado = JSON.parse(userStr);

    // 1. CARGAR SEDES
    async function cargarSedes() {
        const select = document.getElementById('me-sede');
        if(!select) return;
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/usuarios/sedes', { headers: { 'x-auth-token': token } });
            if(res.ok) {
                const sedes = await res.json();
                select.innerHTML = ''; 
                const defaultOpt = document.createElement('option');
                defaultOpt.value = ""; defaultOpt.textContent = "Seleccionar...";
                select.appendChild(defaultOpt);
                sedes.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id; opt.textContent = s.nombre;
                    select.appendChild(opt);
                });
            }
        } catch (e) { console.error(e); }
    }

    // 2. CARGAR DATOS
    async function cargarDatosPerfil() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/usuarios', { headers: { 'x-auth-token': token } });
            
            if (res.ok) {
                const usuarios = await res.json();
                const miPerfil = usuarios.find(u => u.id === usuarioLogueado.id);
                if (miPerfil) {
                    llenarFormulario(miPerfil);
                }
            }
        } catch (error) { console.error(error); }
    }

    // 3. LLENAR HTML
    function llenarFormulario(user) {
        setText('display-name', `${user.nombres} ${user.apellidos || ''}`);
        setText('display-cargo', user.cargo || 'Sin Cargo');
        setText('display-sede', user.nombre_sede || 'Sin Sede');
        setText('display-celular', user.celular || '-');
        setText('display-email', user.correo || '-');
        setText('display-direccion', user.direccion || '-');
        
        const rolEl = document.getElementById('display-rol');
        if(rolEl) rolEl.innerText = (user.rol || 'Usuario').toUpperCase();

        const previewImg = document.getElementById('profile-preview-img');
        // Si hay foto guardada, la ponemos. Si no, la default.
        if(previewImg) previewImg.src = user.foto_url || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

        setVal('me-nombres', user.nombres);
        setVal('me-apellidos', user.apellidos);
        setVal('me-cargo', user.cargo);
        setVal('me-celular', user.celular);
        setVal('me-direccion', user.direccion);
        setVal('me-email', user.correo);
        
        const selectSede = document.getElementById('me-sede');
        if(selectSede && user.nombre_sede) {
            for (let i = 0; i < selectSede.options.length; i++) {
                if (selectSede.options[i].text === user.nombre_sede) {
                    selectSede.selectedIndex = i;
                    break;
                }
            }
        }
    }

    function setText(id, txt) { const el = document.getElementById(id); if(el) el.innerText = txt; }
    function setVal(id, val) { const el = document.getElementById(id); if(el) el.value = val || ''; }

    // 4. PREVISUALIZAR FOTO (CORREGIDO Y BLINDADO)
    function activarSubidaFoto() {
        const uploadInput = document.getElementById('upload-avatar');
        const previewImg = document.getElementById('profile-preview-img');

        if(uploadInput && previewImg) {
            console.log("📸 Sistema de foto activado");
            
            // Removemos eventos anteriores para evitar duplicados
            uploadInput.onchange = null;

            uploadInput.onchange = function(e) {
                console.log("📂 Archivo seleccionado...");
                const file = e.target.files[0];
                
                if (file) {
                    // Validar que sea imagen
                    if (!file.type.startsWith('image/')) {
                        alert("Por favor selecciona un archivo de imagen (JPG, PNG).");
                        return;
                    }

                    const reader = new FileReader();
                    reader.onload = function(evt) {
                        console.log("✅ Vista previa generada");
                        previewImg.src = evt.target.result; // Cambiar la foto en pantalla
                    };
                    reader.readAsDataURL(file);
                }
            };
        } else {
            console.error("❌ No se encontró el input de foto (upload-avatar)");
        }
    }

// 6. GUARDAR CAMBIOS (CON SOPORTE DE FOTOS)
    const formProfile = document.getElementById('form-update-profile');
    
    if(formProfile) {
        formProfile.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = formProfile.querySelector('.btn-save');
            const txtOriginal = btn.innerHTML; // Guardamos el icono también
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Subiendo..."; 
            btn.disabled = true;

            // USAMOS FORMDATA (Necesario para enviar archivos)
            const formData = new FormData();
            formData.append('nombres', document.getElementById('me-nombres').value);
            formData.append('apellidos', document.getElementById('me-apellidos').value);
            formData.append('celular', document.getElementById('me-celular').value);
            formData.append('direccion', document.getElementById('me-direccion').value);
            formData.append('cargo', document.getElementById('me-cargo').value);
            formData.append('sede_id', document.getElementById('me-sede').value || usuarioLogueado.sede_id);
            formData.append('password', document.getElementById('me-password').value);

            // ¿Hay foto seleccionada?
            const fileInput = document.getElementById('upload-avatar');
            if (fileInput.files[0]) {
                formData.append('foto', fileInput.files[0]); // El nombre 'foto' debe coincidir con el backend
            }

            try {
                const token = localStorage.getItem('token');
                
                // IMPORTANTE: Al usar FormData, NO ponemos 'Content-Type': 'application/json'
                // El navegador se encarga de eso.
                const res = await fetch(`/api/usuarios/${usuarioLogueado.id}`, {
                    method: 'PUT',
                    headers: { 'x-auth-token': token }, 
                    body: formData
                });

                const data = await res.json();

                if (res.ok) {
                    alert("✅ " + data.msg);
                    
                    // Actualizar memoria local
                    const userActualizado = { ...usuarioLogueado, ...data.usuario };
                    localStorage.setItem('user', JSON.stringify(userActualizado));
                    
                    // Recargar para ver la foto nueva en el menú lateral
                    location.reload();
                } else {
                    alert("❌ Error: " + data.msg);
                }
            } catch (error) {
                console.error(error);
                alert("❌ Error de conexión");
            } finally {
                btn.innerHTML = txtOriginal; 
                btn.disabled = false;
            }
        });
    }

    // ORDEN DE EJECUCIÓN
    cargarSedes().then(() => {
        cargarDatosPerfil();
        
        // Retrasamos un poquito la activación de la foto para asegurar que el HTML existe
        setTimeout(activarSubidaFoto, 100);
    });

})();