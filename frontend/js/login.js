// Ubicacion: SuperNova/frontend/js/login.js

const loginForm = document.getElementById('loginForm');
const btnLogin = document.getElementById('btnLogin');
const btnText = document.querySelector('.btn-text');

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
            
            // Guardamos el token en el navegador
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.usuario));

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
        
        // Mostrar alerta (puedes mejorar esto con un toast después)
        alert("❌ " + error.message);
    }
});