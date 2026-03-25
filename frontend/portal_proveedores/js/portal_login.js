//Ubicacion: 

// ==========================================
// 🎨 SISTEMA DE NOTIFICACIONES (TOASTS)
// ==========================================
window.mostrarToast = function(mensaje, tipo = 'success') {
    let container = document.querySelector('.toast-container');
    if (!container) {
        container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    const icono = tipo === 'success' ? 'bx-check-circle' : 'bx-error-circle';
    const color = tipo === 'success' ? '#10b981' : '#ef4444';

    toast.innerHTML = `
        <i class='bx ${icono}' style="color: ${color}"></i>
        <span style="color: #334155; font-weight: 500;">${mensaje}</span>
    `;

    container.appendChild(toast);

    // Animación de salida y remoción
    setTimeout(() => {
        toast.style.animation = "slideIn 0.3s ease reverse forwards";
        setTimeout(() => toast.remove(), 300);
    }, 4000);
};

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
                // ✅ CORREGIDO: Cambiamos alert por mostrarToast
                mostrarToast(data.msg || "Error al iniciar sesión", "error");
            }
            } catch (error) {
                console.error("Error de red:", error);
                // ✅ CORREGIDO: Cambiamos alert por mostrarToast
                mostrarToast("Error de conexión con el servidor", "error");
            } finally {
                btnSubmit.disabled = false;
                btnSubmit.innerHTML = textoOriginal;
            }
        });
    }
});

// --- LÓGICA DEL MODAL DE REGISTRO ---

window.abrirModalRegistro = function() {
    document.getElementById('modal-registro').classList.remove('hidden');
}

window.cerrarModalRegistro = function() {
    document.getElementById('modal-registro').classList.add('hidden');
    // Limpieza masiva de campos
    ['reg-codigo', 'reg-ruc', 'reg-razon', 'reg-rep-legal', 'reg-nombre', 'reg-telefono', 'reg-correo', 'reg-clave', 'reg-otp'].forEach(id => {
        const el = document.getElementById(id);
        if(el) el.value = '';
    });
    // Reset de estado OTP
    document.getElementById('seccion-otp').style.display = 'none';
    document.getElementById('email-verificado').value = 'false';
}

async function procesarRegistro() {
    // --- 🛡️ 1. VALIDACIÓN DE SEGURIDAD OTP (NUEVO) ---
    const verificado = document.getElementById('email-verificado').value;
    
    if (verificado !== "true") {
        mostrarToast("⚠️ Debe verificar su correo antes de registrarse", "error");
        return;
    }

    // --- 2. CAPTURA DE DATOS DEL FORMULARIO ---
    const codigo_acceso = document.getElementById('reg-codigo').value.trim();
    const ruc = document.getElementById('reg-ruc').value.trim();
    const razon_social = document.getElementById('reg-razon').value.trim();
    const rep_legal = document.getElementById('reg-rep-legal').value.trim();
    const nombre = document.getElementById('reg-nombre').value.trim();
    const telefono = document.getElementById('reg-telefono').value.trim();
    const correo = document.getElementById('reg-correo').value.trim();
    const clave = document.getElementById('reg-clave').value;

    // --- 3. VALIDACIONES DE CAMPOS ---
    if (!codigo_acceso || !ruc || !razon_social || !rep_legal || !correo || !clave || !nombre || !telefono) {
        mostrarToast("Por favor, completa todos los campos", "error");
        return;
    }

    if (ruc.length !== 11 && ruc.length !== 8) {
        // ✅ CORREGIDO: Cambiamos alert por mostrarToast
        mostrarToast("El RUC/DNI debe tener 8 u 11 dígitos", "error");
        return;
    }

    // --- 4. ESTADO DE CARGA DEL BOTÓN ---
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
            mostrarToast(data.msg, "success"); 
            cerrarModalRegistro(); 
            document.getElementById('correo-proveedor').value = correo; 
        } else {
            mostrarToast(data.msg || "Error en el registro", "error");
        }
        } catch (error) {
            mostrarToast("Error de conexión con el servidor", "error");
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
        mostrarToast("Ingresa tu correo electrónico", "error");
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
        // ✅ CORREGIDO: Cambiamos el alert de éxito por Toast
        mostrarToast("Clave temporal enviada al correo con éxito", "success"); 
        cerrarModalRecuperar(); 
    } else {
        // ✅ CORREGIDO: Cambiamos alert de error por Toast
        mostrarToast(data.msg || "Error en la recuperación", "error");
    }
    } catch (error) {
        console.error("Error de red:", error);
        mostrarToast("Error de conexión con el servidor", "error");
    } finally {
            btnSubmit.disabled = false;
            btnSubmit.innerHTML = textoOriginal;
    }
}

// 1. SOLICITAR EL CÓDIGO AL BACKEND (CORREGIDA)
async function solicitarCodigoOTP() {
    const correo = document.getElementById('reg-correo').value.trim();
    const btn = document.getElementById('btn-enviar-otp');

    if (!correo.includes('@')) {
        mostrarToast("Ingrese un correo válido", "error");
        return;
    }

    // Bloquear botón y poner cargando
    btn.disabled = true;
    const textoOriginal = "Enviar Código"; // Guardamos el texto por si acaso
    btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i>";

    try {
        const response = await fetch('http://localhost:3000/api/auth/solicitar-verificacion-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo })
        });
        
        const data = await response.json();

        if (response.ok) {
            mostrarToast("Código enviado con éxito", "success");
            document.getElementById('seccion-otp').style.display = 'block';
            btn.innerHTML = "Reenviar";
            btn.disabled = false; // Lo habilitamos para que pueda reenviar después
        } else {
            // 🔥 AQUÍ ESTABA EL ERROR: Si el correo existe, debemos liberar el botón
            mostrarToast(data.msg, "error");
            btn.disabled = false; 
            btn.innerHTML = "Enviar Código"; 
        }
    } catch (error) {
        // 🔥 TAMBIÉN AQUÍ: Por si se cae el internet
        mostrarToast("Error al solicitar código", "error");
        btn.disabled = false;
        btn.innerHTML = "Enviar Código";
    }
}

// 2. VERIFICAR SI EL CÓDIGO ES CORRECTO
window.verificarCodigoOTP = async function() {
    const correo = document.getElementById('reg-correo').value.trim();
    const codigo = document.getElementById('reg-otp').value.trim().toUpperCase();

    if (codigo.length < 5) {
        mostrarToast("El código debe tener 5 caracteres", "error");
        return;
    }

    try {
        const response = await fetch('http://localhost:3000/api/auth/validar-codigo-email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ correo, codigo })
        });

        if (response.ok) {
            document.getElementById('email-verificado').value = "true";
            // Bloqueo de campos
            document.getElementById('reg-correo').readOnly = true;
            document.getElementById('reg-otp').readOnly = true;
            mostrarToast("¡Correo verificado con éxito!", "success");
        } else {
            const data = await response.json();
            mostrarToast(data.msg, "error");
        }
    } catch (error) {
        mostrarToast("Error al verificar código", "error");
    }
}
