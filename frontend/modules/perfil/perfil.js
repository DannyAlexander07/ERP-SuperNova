// Ubicacion: SuperNova/frontend/modules/perfil/perfil.js

(function() {
    console.log("Modulo Perfil Conectado 👤");

    // 1. CARGAR DATOS DEL PERFIL (Usando la ruta correcta)
    async function cargarDatosPerfil() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 🔥 CAMBIO CLAVE: Usamos la ruta específica de perfil
            const res = await fetch('/api/usuarios/perfil', { 
                method: 'GET',
                headers: { 'x-auth-token': token } 
            });
            
            if (res.ok) {
                const miPerfil = await res.json();
                llenarFormulario(miPerfil);
            } else {
                console.error("Error al cargar perfil:", res.status);
                // Si falla por token vencido, podrías redirigir al login aquí
            }
        } catch (error) { console.error(error); }
    }

    // 2. CARGAR SEDES (Para el select)
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

    // 3. LLENAR HTML
    function llenarFormulario(user) {
        // Tarjeta de Presentación
        setText('display-name', `${user.nombres} ${user.apellidos || ''}`);
        setText('display-cargo', user.cargo || 'Sin Cargo');
        setText('display-sede', user.nombre_sede || 'Sin Sede');
        setText('display-celular', user.telefono || '-'); // Nota: Backend devuelve 'telefono' (alias de celular)
        setText('display-email', user.email || '-');
        setText('display-direccion', user.direccion || '-');
        
        const rolEl = document.getElementById('display-rol');
        if(rolEl) rolEl.innerText = (user.rol || 'Usuario').toUpperCase();

        const previewImg = document.getElementById('profile-preview-img');
        if(previewImg) previewImg.src = user.foto_url || "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";

        // Formulario de Edición
        setVal('me-nombres', user.nombres);
        setVal('me-apellidos', user.apellidos);
        setVal('me-cargo', user.cargo);
        setVal('me-celular', user.telefono); // Usamos 'telefono' que viene del backend
        setVal('me-direccion', user.direccion);
        // El email suele ser de solo lectura para evitar problemas de login
        const emailInput = document.getElementById('me-email');
        if(emailInput) {
            emailInput.value = user.email;
            emailInput.disabled = true; 
        }
        
        // Seleccionar Sede
        const selectSede = document.getElementById('me-sede');
        if(selectSede && user.sede_id) {
            selectSede.value = user.sede_id;
            selectSede.disabled = true; // Generalmente el usuario no se cambia de sede solo
        }
    }

    function setText(id, txt) { const el = document.getElementById(id); if(el) el.innerText = txt; }
    function setVal(id, val) { const el = document.getElementById(id); if(el) el.value = val || ''; }

    // 4. PREVISUALIZAR FOTO
    function activarSubidaFoto() {
        const uploadInput = document.getElementById('upload-avatar');
        const previewImg = document.getElementById('profile-preview-img');

        if(uploadInput && previewImg) {
            uploadInput.onchange = function(e) {
                const file = e.target.files[0];
                if (file) {
                    if (!file.type.startsWith('image/')) return alert("Solo imágenes JPG/PNG.");
                    const reader = new FileReader();
                    reader.onload = function(evt) {
                        previewImg.src = evt.target.result;
                    };
                    reader.readAsDataURL(file);
                }
            };
        }
    }

    // 5. GUARDAR CAMBIOS (A LA RUTA DE PERFIL)
    const formProfile = document.getElementById('form-update-profile');
    if(formProfile) {
        formProfile.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = formProfile.querySelector('.btn-save');
            const txtOriginal = btn.innerHTML;
            btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Guardando..."; 
            btn.disabled = true;

            // Usamos JSON porque tu endpoint 'actualizarPerfil' espera JSON, no FormData
            // (Si quisieras subir foto, tendríamos que cambiar el backend para usar Multer en /perfil)
            const data = {
                nombres: document.getElementById('me-nombres').value,
                apellidos: document.getElementById('me-apellidos').value,
                celular: document.getElementById('me-celular').value,
                direccion: document.getElementById('me-direccion').value,
                cargo: document.getElementById('me-cargo').value,
                password: document.getElementById('me-password').value
            };

            try {
                const token = localStorage.getItem('token');
                
                // 🔥 CAMBIO CLAVE: PUT a /api/usuarios/perfil
                const res = await fetch('/api/usuarios/perfil', {
                    method: 'PUT',
                    headers: { 
                        'Content-Type': 'application/json',
                        'x-auth-token': token 
                    }, 
                    body: JSON.stringify(data)
                });

                const result = await res.json();

                if (res.ok) {
                    alert("✅ " + result.msg);
                    location.reload();
                } else {
                    alert("❌ Error: " + result.msg);
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

    // INICIO
    // Primero cargamos sedes, luego el perfil
    cargarSedes().then(() => {
        cargarDatosPerfil();
        setTimeout(activarSubidaFoto, 100);
    });

})();