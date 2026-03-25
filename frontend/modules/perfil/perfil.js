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
        const uploadInput = document.getElementById('upload-avatar'); // El <input type="file">
        const previewImg = document.getElementById('profile-preview-img'); // La <img> de la tarjeta
        // Dentro de activarSubidaFoto, cuando el archivo existe:
        const btnGuardar = document.querySelector('.btn-save');
        if(btnGuardar) {
            btnGuardar.classList.add('pulse-animation'); // Una animación para avisar que debe guardar
        }

        if (uploadInput && previewImg) {
            uploadInput.onchange = function(e) {
                const file = e.target.files[0];
                if (file) {
                    // 🛡️ Validación rápida de tipo
                    if (!file.type.startsWith('image/')) {
                        alert("Por favor, selecciona un archivo de imagen válido.");
                        return;
                    }

                    // 🔥 LA MAGIA: Crea una URL temporal del archivo local
                    const urlTemporal = URL.createObjectURL(file);
                    previewImg.src = urlTemporal;

                    // Opcional: Cambiar el estilo para mostrar que hay un cambio pendiente
                    previewImg.style.border = "3px solid #3498db"; 
                    console.log("📸 Vista previa actualizada localmente");
                }
            };
        }
    }

    window.actualizarMiPerfil = async function() {
        const formProfile = document.getElementById('form-update-profile');
        if(!formProfile) return;

        const btn = formProfile.querySelector('.btn-save');
        const txtOriginal = btn.innerHTML;
        
        btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Guardando..."; 
        btn.disabled = true;

        try {
            const token = localStorage.getItem('token');
            
            // 🔥 CAMBIO CLAVE: Usamos FormData para poder enviar el archivo
            const formData = new FormData();
            
            // Agregamos los campos de texto
            formData.append('nombres', document.getElementById('me-nombres').value);
            formData.append('apellidos', document.getElementById('me-apellidos').value);
            formData.append('telefono', document.getElementById('me-celular').value); 
            formData.append('direccion', document.getElementById('me-direccion').value);
            formData.append('cargo', document.getElementById('me-cargo').value);
            formData.append('password', document.getElementById('me-password').value);

            // 🔥 AGREGAMOS LA FOTO (Si el usuario seleccionó una)
            const fotoInput = document.getElementById('upload-avatar');
            if (fotoInput && fotoInput.files.length > 0) {
                // 'foto' debe coincidir con upload.single('foto') en tu backend/routes
                formData.append('foto', fotoInput.files[0]); 
            }

            // Enviamos el PUT
            const res = await fetch('/api/usuarios/perfil', {
                method: 'PUT',
                headers: { 
                    // ⚠️ IMPORTANTE: NO pongas 'Content-Type' aquí. 
                    // El navegador lo pondrá solo al detectar que es FormData.
                    'x-auth-token': token 
                }, 
                body: formData // Enviamos el objeto FormData directamente
            });

            const result = await res.json();

            if (res.ok) {
                // 1. Recopilamos los datos que el usuario acaba de escribir
                const datosActualizados = {
                    nombres: document.getElementById('me-nombres').value,
                    apellidos: document.getElementById('me-apellidos').value,
                    // Usamos la URL que nos devuelve Cloudinary en el JSON (result.foto_url)
                    foto_url: result.foto_url || null 
                };

                // 2. Le avisamos al Dashboard que actualice el menú lateral
                if (typeof window.actualizarSidebarUI === 'function') {
                    window.actualizarSidebarUI(datosActualizados);
                }

                // 3. Notificación de éxito
                if (typeof showMiniNotif === 'function') {
                    showMiniNotif("Perfil actualizado con éxito", "success");
                } else {
                    alert("✅ Perfil actualizado");
                }
            }
        } catch (error) {
            console.error(error);
            alert("❌ Error: " + error.message);
        } finally {
            btn.innerHTML = txtOriginal; 
            btn.disabled = false;
        }
    };


    window.initPerfil = function() {
        console.log("▶️ Iniciando módulo Perfil...");
        cargarSedes().then(() => {
            cargarDatosPerfil().then(() => {
                // 🔥 IMPORTANTE: Vinculamos el evento del input después de cargar los datos
                activarSubidaFoto();
            });
        });
    };

    // Si estás en una página que carga este script de forma tradicional, 
    // la ejecutamos por si acaso. Si el router la llama, se ejecutará cuando deba.
    if (document.getElementById('form-update-profile')) {
        window.initPerfil();
    }

})(); 