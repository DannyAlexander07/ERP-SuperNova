// Ubicacion: SuperNova/frontend/js/notifications.js

// 1. INYECTAR CONTENEDORES AL CARGAR
document.addEventListener('DOMContentLoaded', () => {
    // Contenedor de Toasts
    if (!document.getElementById('toast-container')) {
        const container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    // Contenedor del Modal de Confirmación
    if (!document.getElementById('custom-confirm')) {
        const confirmModal = document.createElement('div');
        confirmModal.id = 'custom-confirm';
        confirmModal.className = 'custom-confirm-overlay';
        confirmModal.innerHTML = `
            <div class="confirm-box">
                <div class="confirm-icon"><i class='bx bx-help-circle'></i></div>
                <h3 class="confirm-title">¿Estás seguro?</h3>
                <p class="confirm-desc" id="confirm-msg">Esta acción no se puede deshacer.</p>
                <div class="confirm-actions">
                    <button class="btn-confirm-no" id="btn-no">Cancelar</button>
                    <button class="btn-confirm-yes" id="btn-yes">Sí, Eliminar</button>
                </div>
            </div>
        `;
        document.body.appendChild(confirmModal);
    }
});

// 2. FUNCIÓN TOAST (Notificación)
// Uso: showToast("Guardado Correctamente", "success");
// Tipos: success, error, info
window.showToast = function(message, type = 'info', title = '') {
    const container = document.getElementById('toast-container');
    
    // Definir iconos y títulos por defecto
    let icon = 'bx-info-circle';
    if (type === 'success') { icon = 'bx-check-circle'; if(!title) title = 'Éxito'; }
    if (type === 'error') { icon = 'bx-x-circle'; if(!title) title = 'Error'; }
    if (type === 'info') { icon = 'bx-info-circle'; if(!title) title = 'Información'; }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <i class='bx ${icon}'></i>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-msg">${message}</div>
        </div>
    `;

    container.appendChild(toast);

    // Animación de entrada
    setTimeout(() => toast.classList.add('show'), 100);

    // Auto eliminar después de 3 segundos
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); // Esperar a que termine la animación de salida
    }, 3000);
}

// 3. FUNCIÓN CONFIRM (Promesa)
// Uso: if (await showConfirm("¿Borrar?")) { ... }
window.showConfirm = function(message, title = "¿Estás seguro?") {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-confirm');
        const msgEl = document.getElementById('confirm-msg');
        const titleEl = modal.querySelector('.confirm-title');
        const btnYes = document.getElementById('btn-yes');
        const btnNo = document.getElementById('btn-no');

        // Configurar textos
        msgEl.innerText = message;
        titleEl.innerText = title;

        // Mostrar modal
        modal.classList.add('active');

        // Definir funciones de limpieza
        const close = () => {
            modal.classList.remove('active');
            btnYes.replaceWith(btnYes.cloneNode(true)); // Limpiar listeners viejos
            btnNo.replaceWith(btnNo.cloneNode(true));
        };

        // Listeners únicos para esta promesa
        btnYes.onclick = () => {
            close();
            resolve(true); // El usuario dijo SI
        };

        btnNo.onclick = () => {
            close();
            resolve(false); // El usuario dijo NO
        };
    });
}