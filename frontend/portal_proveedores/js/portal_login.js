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

// 🔥 LA NUEVA FUNCIÓN QUE CONECTA CON TU BACKEND
async function procesarRegistro() {
    const codigo_acceso = document.getElementById('reg-codigo').value.trim();
    const correo = document.getElementById('reg-correo').value.trim();
    const clave = document.getElementById('reg-clave').value;
    const nombre = document.getElementById('reg-nombre').value.trim();

    if (!codigo_acceso || !correo || !clave || !nombre) {
        alert("Por favor, completa todos los campos del formulario.");
        return;
    }

    const btnSubmit = document.querySelector('#modal-registro .btn-ingresar');
    const textoOriginal = btnSubmit.innerHTML;
    btnSubmit.disabled = true;
    btnSubmit.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Registrando...";

    try {
        const res = await fetch('http://localhost:3000/api/auth/registrar-proveedor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ codigo_acceso, correo, clave, nombre })
        });

        const data = await res.json();

        if (res.ok) {
            alert(data.msg); // Muestra mensaje de éxito
            cerrarModalRegistro(); // Cierra el modal
            // Opcional: Rellenar el correo en el form de login para que le sea más fácil
            document.getElementById('correo-proveedor').value = correo; 
        } else {
            alert(data.msg || "Error en el registro.");
        }

    } catch (error) {
        console.error("Error de red:", error);
        alert("Error de conexión con el servidor.");
    } finally {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = textoOriginal;
    }
}