// Ubicacion: SuperNova/frontend/js/login.js

const loginForm = document.getElementById('loginForm');
const btnLogin = document.getElementById('btnLogin');
const btnText = document.querySelector('.btn-text');

// --- 🆕 NUEVA FUNCIÓN: Toast de Notificación Elegante ---
function mostrarNotificacionLogin(mensaje) {
    let container = document.getElementById('toast-login-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-login-container';
        // Estilos del contenedor flotante arriba a la derecha
        container.style.cssText = 'position:fixed; top:20px; right:20px; z-index:9999; display:flex; flex-direction:column; gap:10px;';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    // Diseño del recuadro rojo premium
    toast.style.cssText = 'background:#fef2f2; border-left:4px solid #ef4444; color:#991b1b; padding:15px 20px; border-radius:6px; box-shadow:0 4px 12px rgba(0,0,0,0.1); display:flex; align-items:center; gap:10px; font-weight:500; font-family: sans-serif; opacity:0; transform:translateX(100%); transition:all 0.3s ease;';
    
    // Icono y texto (limpiamos el "Error:" genérico que a veces trae el JS)
    const textoLimpio = mensaje.replace('Error: ', '');
    toast.innerHTML = `<i class='bx bx-error-circle' style='font-size:1.5rem; color:#ef4444;'></i> <span>${textoLimpio}</span>`;
    
    container.appendChild(toast);

    // Animación de entrada
    setTimeout(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
    }, 10);

    // Animación de salida y borrado automático (después de 4 segundos)
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        setTimeout(() => toast.remove(), 300); // Se elimina del HTML al terminar
    }, 4000);
}

// --- LÓGICA DEL FORMULARIO ---
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    // Efecto de carga
    btnLogin.classList.add('loading');

    try {
        // 1. Petición al Backend
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });

        const data = await response.json();

        if (response.ok) {
            // 2. Éxito: Guardar Token y Datos
            console.log("Login Exitoso", data);
            
            // Guardamos el token y los datos en el navegador
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.usuario));
            
            // 👇 NUEVA LÍNEA CLAVE: Guardamos el rol suelto para que el sistema lo lea rápido
            localStorage.setItem('rol', data.usuario.rol);
            localStorage.setItem('nombres', data.usuario.nombres); // Opcional, pero muy útil para saludarlo en el dashboard

            // Animación de salida
            document.body.style.opacity = '0';
            document.body.style.transition = 'opacity 0.5s ease';
            
            setTimeout(() => {
                window.location.href = "/dashboard";
            }, 500);

        } else {
            // 3. Error (Contraseña mal, correo no existe)
            throw new Error(data.msg || 'Error al iniciar sesión');
        }

    } catch (error) {
        console.error(error);
        btnLogin.classList.remove('loading');
        
        // 🆕 LLAMAMOS A LA NOTIFICACIÓN ELEGANTE EN LUGAR DEL ALERT()
        mostrarNotificacionLogin(error.message);
    }
});