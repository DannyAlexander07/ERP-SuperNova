document.addEventListener('DOMContentLoaded', () => {
    // 1. 🛡️ VERIFICACIÓN DE SEGURIDAD (GUARDIÁN)
    const token = localStorage.getItem('proveedor_token');
    const userDataString = localStorage.getItem('proveedor_data');

    // Si no hay token o no hay datos, lo regresamos al login del portal
    if (!token || !userDataString) {
        window.location.href = 'index.html';
        return; 
    }

    // 2. 👤 CARGAR DATOS DEL USUARIO EN LA INTERFAZ
    try {
        const userData = JSON.parse(userDataString);
        
        // Proteccion extra: si de alguna forma se coló un empleado, lo botamos
        if (!userData.proveedor_id) {
            alert("Acceso denegado. Este portal es exclusivo para proveedores externos.");
            cerrarSesion();
            return;
        }

        // Llenamos el nombre en la barra superior
        document.getElementById('topbar-usuario-nombre').textContent = userData.nombres;

        // 🔥 NUEVO: Llenamos el Avatar si existe en LocalStorage
        if (userData.avatar_url) {
            const avatar = document.getElementById('topbar-avatar');
            if (avatar) avatar.src = userData.avatar_url;
        }
        
        // Llenamos el nombre de la empresa en el menú lateral 
        // (Por ahora ponemos "Proveedor Enlazado", luego lo traeremos desde la BD en el módulo Inicio)
        document.getElementById('sidebar-proveedor-nombre').innerHTML = `
            <i class='bx bx-buildings'></i> ID Proveedor: ${userData.proveedor_id}
        `;

    } catch (e) {
        console.error("Error parseando datos del usuario:", e);
        cerrarSesion();
    }

    // 3. 📱 LÓGICA DEL MENÚ HAMBURGUESA (MÓVILES)
    const btnToggle = document.getElementById('btn-toggle-menu');
    const sidebar = document.querySelector('.sidebar');

    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
        });
    }

    // 4. 🚀 CARGAR EL MÓDULO DE INICIO POR DEFECTO
    cargarModulo('inicio');
    
    // 🔥 Iniciar el motor de notificaciones
    actualizarNotificaciones();
    // Revisar automáticamente cada 2 minutos
    setInterval(actualizarNotificaciones, 120000);
});

// ==========================================
// FUNCIÓN MAGISTRAL PARA CARGAR MÓDULOS
// ==========================================
async function cargarModulo(nombreModulo) {
    const contenedor = document.getElementById('contenedor-dinamico');
    const tituloTopbar = document.getElementById('topbar-titulo');

    // Nombres bonitos para la barra superior
    const titulos = {
        'inicio': 'Panel de Inicio (Resumen)',
        'recepcion': 'Recepción de Facturas',
        'comprobantes': 'Mis Comprobantes y Estado de Cuenta',
        'calendario': 'Calendario de Pagos',
        'ordenes': 'Monitor de Órdenes de Compra',
        'mis_datos': 'Mis Datos Maestros'
    };

    tituloTopbar.textContent = titulos[nombreModulo] || 'Cargando...';
    contenedor.innerHTML = `<div style="text-align: center; margin-top: 50px; color: #666;"><i class='bx bx-loader-alt bx-spin' style="font-size: 3rem;"></i><p>Cargando ${nombreModulo}...</p></div>`;

    // Cambiar la clase "active" en el menú lateral
    document.querySelectorAll('.nav-links li:not(.nav-section)').forEach(li => li.classList.remove('active'));
    const linkActivo = Array.from(document.querySelectorAll('.nav-links li')).find(li => li.getAttribute('onclick') === `cargarModulo('${nombreModulo}')`);
    if(linkActivo) linkActivo.classList.add('active');

    // Cerrar menú en móviles después de hacer clic
    if (window.innerWidth <= 768) {
        document.querySelector('.sidebar').classList.remove('active');
    }

    try {
        // Hacemos el fetch al archivo HTML del módulo
        // Asume la estructura: portal_proveedores/modules/nombre_modulo/nombre_modulo.html
        const response = await fetch(`modules/${nombreModulo}/${nombreModulo}.html`);
        
        if (!response.ok) {
            throw new Error(`Módulo no encontrado (404). Asegúrate de crear el archivo modules/${nombreModulo}/${nombreModulo}.html`);
        }
        
        const html = await response.text();
        contenedor.innerHTML = html;

        // Ejecutar los scripts del módulo recién cargado (si los tiene)
        const scripts = contenedor.querySelectorAll('script');
        scripts.forEach(oldScript => {
            const newScript = document.createElement('script');
            Array.from(oldScript.attributes).forEach(attr => newScript.setAttribute(attr.name, attr.value));
            newScript.appendChild(document.createTextNode(oldScript.innerHTML));
            oldScript.parentNode.replaceChild(newScript, oldScript);
        });

    } catch (error) {
        console.error("Error al cargar el módulo:", error);
        contenedor.innerHTML = `
            <div style="text-align: center; margin-top: 50px; color: #dc3545;">
                <i class='bx bx-error-circle' style="font-size: 4rem;"></i>
                <h2>Módulo en Construcción</h2>
                <p>${error.message}</p>
            </div>
        `;
    }
}

// ==========================================
// FUNCIÓN PARA CERRAR SESIÓN
// ==========================================
function cerrarSesion() {
    // Borramos los rastros de seguridad
    localStorage.removeItem('proveedor_token');
    localStorage.removeItem('proveedor_data');
    // Redirigimos al login
    window.location.href = 'index.html';
}

// ==========================================
// FIX MÓVIL: OVERLAY Y CIERRE TÁCTIL MÁGICO
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const sidebar = document.querySelector('.sidebar');
        const btnToggleOld = document.getElementById('btn-toggle-menu');
        if(!btnToggleOld) return;

        const btnToggle = btnToggleOld.cloneNode(true);
        btnToggleOld.parentNode.replaceChild(btnToggle, btnToggleOld);

        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);

        btnToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        });

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });

        document.querySelectorAll('.nav-links li').forEach(li => {
            li.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                    overlay.classList.remove('active');
                }
            });
        });
    }, 100); 
});

// --- 🆕 MOTOR DE NOTIFICACIONES B2B ---

async function actualizarNotificaciones() {
    const token = localStorage.getItem('proveedor_token');
    const badge = document.getElementById('noti-badge');
    if (!token || !badge) return;

    try {
        // ✅ CORREGIDO: Ruta relativa para producción
        const res = await fetch('/api/facturas/b2b/notificaciones', {
            headers: { 'x-auth-token': token }
        });
        const data = await res.json();

        if (res.ok) {
            window.misNotificaciones = data;
            const noLeidas = data.filter(n => !n.leido).length;
            badge.textContent = noLeidas;
            badge.style.display = noLeidas > 0 ? 'flex' : 'none';
        }
    } catch (error) {
        console.error("Error cargando notificaciones", error);
    }
}

// Lógica para el Dropdown flotante
document.querySelector('.notification-box').addEventListener('click', (e) => {
    e.stopPropagation(); // Evita que se cierre al hacer clic en sí mismo
    mostrarDropdownNotificaciones();
});

async function mostrarDropdownNotificaciones() {
    const container = document.querySelector('.notification-box');
    
    // 1. Si ya existe el dropdown, lo quitamos (Efecto Toggle)
    const existingMenu = document.getElementById('noti-dropdown');
    if (existingMenu) {
        existingMenu.remove();
        return;
    }

    // 2. Crear el contenedor del dropdown
    const dropdown = document.createElement('div');
    dropdown.id = 'noti-dropdown';
    dropdown.className = 'noti-dropdown-menu'; // Asegúrate de tener los estilos CSS que te pasé

    let listaHTML = `<div class="noti-header">Notificaciones</div>`;
    
    // 3. Validar si hay notificaciones en la variable global
    if (!window.misNotificaciones || window.misNotificaciones.length === 0) {
        listaHTML += `
            <div class="noti-empty" style="padding: 20px; text-align: center; color: #94a3b8; font-size: 0.85rem;">
                <i class='bx bx-bell-off' style="font-size: 2rem; display: block; margin-bottom: 5px;"></i>
                No tiene notificaciones nuevas
            </div>`;
    } else {
        listaHTML += `<div class="noti-scroll">`;
        
        window.misNotificaciones.forEach(n => {
            const tiempo = calcularTiempoHace(n.fecha_creacion);
            const claseLeido = n.leido ? '' : 'unread';
            
            // Determinar icono y color según el tipo
            let icono = 'bx-info-circle';
            let colorClass = '';
            
            if (n.tipo === 'rechazo') {
                icono = 'bx-x-circle';
                colorClass = 'text-danger';
            } else if (n.tipo === 'pago') {
                icono = 'bx-check-circle';
                colorClass = 'text-success';
            } else if (n.tipo === 'orden') {
                icono = 'bx-receipt';
                colorClass = 'text-primary';
            }

            listaHTML += `
                <div class="noti-item ${claseLeido}">
                    <i class='bx ${icono} ${colorClass}'></i>
                    <div class="noti-content">
                        <p class="noti-title">${n.titulo}</p>
                        <p class="noti-text">${n.mensaje}</p>
                        <span class="noti-time">${tiempo}</span>
                    </div>
                </div>
            `;
        });
        
        listaHTML += `</div>`; // Cerrar noti-scroll
        listaHTML += `
            <div class="noti-footer" onclick="marcarTodoComoLeido()">
                <i class='bx bx-check-double'></i> Marcar todas como leídas
            </div>`;
    }

    dropdown.innerHTML = listaHTML;
    container.appendChild(dropdown);

    // 4. Lógica de cierre mejorada: Evitar conflictos con el click de apertura
    // Usamos un pequeño timeout para que el evento de click que abre el dropdown
    // no sea el mismo que lo cierre inmediatamente.
    setTimeout(() => {
        const cerrarAlClickFuera = (e) => {
            const box = document.querySelector('.notification-box');
            if (dropdown && !dropdown.contains(e.target) && !box.contains(e.target)) {
                dropdown.remove();
                document.removeEventListener('click', cerrarAlClickFuera);
            }
        };
        document.addEventListener('click', cerrarAlClickFuera);
    }, 10);
}

async function marcarTodoComoLeido() {
    const token = localStorage.getItem('proveedor_token');
    try {
        // ✅ CORREGIDO: Ruta relativa
        const res = await fetch('/api/facturas/b2b/notificaciones/leer', {
            method: 'PUT',
            headers: { 'x-auth-token': token }
        });
        if (res.ok) {
            actualizarNotificaciones();
            const dropdown = document.getElementById('noti-dropdown');
            if (dropdown) dropdown.remove();
        }
    } catch (error) {
        console.error("Error al marcar como leído", error);
    }
}

// Helper para el tiempo (Ej: "Hace 5 min")
function calcularTiempoHace(fechaStr) {
    const ahora = new Date();
    const fecha = new Date(fechaStr);
    const difMs = ahora - fecha;
    const difMin = Math.floor(difMs / 60000);
    const difHrs = Math.floor(difMin / 60);
    const difDias = Math.floor(difHrs / 24);

    if (difMin < 60) return `Hace ${difMin} min`;
    if (difHrs < 24) return `Hace ${difHrs} h`;
    return `Hace ${difDias} días`;
}

