document.addEventListener('DOMContentLoaded', () => {
    // --- LÓGICA DE LOGIN ---
    const formLogin = document.getElementById('form-login-proveedor');

    if (formLogin) {
        formLogin.addEventListener('submit', async (e) => {
            e.preventDefault();

            const email = document.getElementById('correo-proveedor').value.trim();
            const password = document.getElementById('clave-proveedor').value;
            const btnSubmit = formLogin.querySelector('button[type="submit"]');

            const textoOriginal = btnSubmit.innerHTML;
            btnSubmit.disabled = true;
            btnSubmit.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Validando...";

            try {
                const res = await fetch('http://localhost:3000/api/auth/login-proveedor', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await res.json();

                if (res.ok) {
                    localStorage.setItem('proveedor_token', data.token);
                    localStorage.setItem('proveedor_data', JSON.stringify(data.usuario));
                    window.location.href = 'portal.html';
                } else {
                    alert(data.msg || "Error al iniciar sesión.");
                }

            } catch (error) {
                console.error("Error de red:", error);
                alert("Error de conexión con el servidor.");
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = textoOriginal;
            }
        });
    }
});

// --- LÓGICA DEL MODAL DE REGISTRO ---

function abrirModalRegistro() {
    document.getElementById('modal-registro').classList.remove('hidden');
}

function cerrarModalRegistro() {
    document.getElementById('modal-registro').classList.add('hidden');
    // Limpiar campos
    document.getElementById('reg-codigo').value = '';
    document.getElementById('reg-correo').value = '';
    document.getElementById('reg-clave').value = '';
    document.getElementById('reg-nombre').value = '';
}

async function procesarRegistro() {
    const codigo_acceso = document.getElementById('reg-codigo').value.trim();
    const ruc = document.getElementById('reg-ruc').value.trim();
    const razon_social = document.getElementById('reg-razon').value.trim();
    const rep_legal = document.getElementById('reg-rep-legal').value.trim(); // 🔥 NUEVO
    const nombre = document.getElementById('reg-nombre').value.trim();
    const telefono = document.getElementById('reg-telefono').value.trim(); // 🔥 NUEVO
    const correo = document.getElementById('reg-correo').value.trim();
    const clave = document.getElementById('reg-clave').value;

    if (!codigo_acceso || !ruc || !razon_social || !rep_legal || !correo || !clave || !nombre || !telefono) {
        alert("Por favor, completa todos los campos del formulario.");
        return;
    }

    if (ruc.length !== 11 && ruc.length !== 8) {
        alert("El RUC/DNI debe tener 8 u 11 dígitos.");
        return;
    }

    const btnSubmit = document.querySelector('#modal-registro .btn-ingresar');
    const textoOriginal = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Registrando empresa...";

    try {
        const res = await fetch('http://localhost:3000/api/auth/registrar-proveedor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo_acceso, ruc, razon_social, rep_legal, correo, clave, nombre, telefono })
        });

        const data = await res.json();

        if (res.ok) {
            alert("✅ " + data.msg); 
            cerrarModalRegistro(); 
            const inputCorreoLogin = document.getElementById('correo-proveedor');
            if(inputCorreoLogin) inputCorreoLogin.value = correo; 
        } else {
            alert("❌ " + (data.msg || "Error en el registro."));
        }

    } catch (error) {
        console.error("Error de red:", error);
        alert("Error de conexión con el servidor.");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = textoOriginal;
    }
}

// Actualizar también la función de limpiar el modal para que borre los campos nuevos
function cerrarModalRegistro() {
    const modal = document.getElementById('modal-registro');
    if(modal) modal.classList.add('hidden');
    
    // Limpiar campos
    document.getElementById('reg-codigo').value = '';
    document.getElementById('reg-ruc').value = '';
    document.getElementById('reg-razon').value = '';
    document.getElementById('reg-correo').value = '';
    document.getElementById('reg-clave').value = '';
    document.getElementById('reg-nombre').value = '';
}

// --- FUNCIONES DEL MODAL RECUPERAR ---
function abrirModalRecuperar() {
    const modal = document.getElementById('modal-recuperar');
    if(modal) {
        modal.classList.remove('hidden');
        modal.classList.add('active');
    }
}

function cerrarModalRecuperar() {
    const modal = document.getElementById('modal-recuperar');
    if(modal) {
        modal.classList.remove('active');
        modal.classList.add('hidden');
    }
}

async function procesarRecuperacion() {
    const correo = document.getElementById('rec-correo').value.trim();

    if (!correo) {
        alert("Por favor, ingresa tu correo electrónico.");
        return;
    }

    const btnSubmit = document.querySelector('#modal-recuperar .btn-ingresar');
    const textoOriginal = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Procesando...";

    try {
        const res = await fetch('http://localhost:3000/api/auth/recuperar-clave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo })
        });

        const data = await res.json();

        if (res.ok) {
            // En un sistema real, esto se envía por email. 
            // Para fines prácticos de este ERP, se lo mostraremos en pantalla.
            alert("✅ ¡ÉXITO!\n\n" + data.msg); 
            cerrarModalRecuperar(); 
        } else {
            alert("❌ " + (data.msg || "Error en la recuperación."));
        }

    } catch (error) {
        console.error("Error de red:", error);
        alert("Error de conexión con el servidor.");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = textoOriginal;
    }
}