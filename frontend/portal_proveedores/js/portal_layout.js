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
        
        // 1. Clonamos el botón para quitar el evento viejo y que no choque
        const btnToggle = btnToggleOld.cloneNode(true);
        btnToggleOld.parentNode.replaceChild(btnToggle, btnToggleOld);

        // 2. Creamos la capa oscura (overlay) dinámicamente
        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);

        // 3. Al tocar las rayitas (abrir)
        btnToggle.addEventListener('click', () => {
            sidebar.classList.add('active');
            overlay.classList.add('active');
        });

        // 4. Al tocar la capa oscura (cerrar)
        overlay.addEventListener('click', () => {
            sidebar.classList.remove('active');
            overlay.classList.remove('active');
        });

        // 5. Al tocar un enlace del menú, también cerramos automáticamente
        document.querySelectorAll('.nav-links li').forEach(li => {
            li.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    sidebar.classList.remove('active');
                    overlay.classList.remove('active');
                }
            });
        });
    }, 100); // Pequeño retraso para asegurar que carga después del layout original
});