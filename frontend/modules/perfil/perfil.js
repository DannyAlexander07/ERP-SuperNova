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

    // Exponemos la función al entorno global para que el HTML la pueda llamar
    window.actualizarMiPerfil = async function() {
        const formProfile = document.getElementById('form-update-profile');
        if(!formProfile) return;

        const btn = formProfile.querySelector('.btn-save');
        const txtOriginal = btn.innerHTML;
        
        // Bloqueo visual del botón
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Guardando..."; 
        btn.disabled = true;

        // Usamos JSON porque el endpoint 'actualizarPerfil' espera JSON.
        // Nota: Para la foto habría que habilitar multer en el backend.
        const data = {
            nombres: document.getElementById('me-nombres').value,
            apellidos: document.getElementById('me-apellidos').value,
            telefono: document.getElementById('me-celular').value, // IMPORTANTE: El backend espera 'telefono', no 'celular'
            direccion: document.getElementById('me-direccion').value,
            cargo: document.getElementById('me-cargo').value,
            password: document.getElementById('me-password').value
        };

        try {
            const token = localStorage.getItem('token');
            
            // PUT a /api/usuarios/perfil
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
                // Usamos la función showToast que vimos en módulos anteriores para mantener la estética
                if (typeof showToast === 'function') {
                    showToast(result.msg, "success");
                    setTimeout(() => location.reload(), 1500); // Recargamos para ver los cambios aplicados
                } else {
                    alert("✅ " + result.msg);
                    location.reload();
                }
            } else {
                throw new Error(result.msg || "Error al actualizar perfil");
            }
        } catch (error) {
            console.error(error);
            if (typeof showToast === 'function') {
                showToast(error.message, "error");
            } else {
                alert("❌ Error: " + error.message);
            }
        } finally {
            // Restaurar botón
            btn.innerHTML = txtOriginal; 
            btn.disabled = false;
        }
    };


    // INICIO: Exponemos la función globalmente para que el Router de SuperNova la encuentre
    window.initPerfil = function() {
        console.log("▶️ Iniciando módulo Perfil...");
        cargarSedes().then(() => {
            cargarDatosPerfil();
            // setTimeout(activarSubidaFoto, 100); // (Puedes borrar esta línea si ocultaste el botón de foto)
        });
    };

    // Si estás en una página que carga este script de forma tradicional, 
    // la ejecutamos por si acaso. Si el router la llama, se ejecutará cuando deba.
    if (document.getElementById('form-update-profile')) {
        window.initPerfil();
    }

})(); 