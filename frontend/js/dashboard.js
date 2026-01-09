// Ubicacion: SuperNova/frontend/js/dashboard.js

// 1. CARGAR USUARIO REAL
let currentUser = {
    name: "Usuario",
    role: "colaborador",
    photoUrl: "https://cdn-icons-png.flaticon.com/512/149/149071.png"
};

const userStr = localStorage.getItem('user');
if (userStr) {
    const u = JSON.parse(userStr);
    
    const nombreReal = u.nombre || u.nombres || "Usuario";
    const apellidoReal = u.apellidos || "";
    
    currentUser.name = `${nombreReal} ${apellidoReal}`.trim();
    currentUser.role = u.rol || "colaborador";
    
    // 🚨 CORRECCIÓN CLAVE PARA LA FOTO:
    // Si u.foto_url existe, lo usamos. Si no, usamos el default.
    // Además, si la URL es relativa (empieza con /uploads), el navegador la encontrará.
    if (u.foto_url && u.foto_url !== "null") {
        currentUser.photoUrl = u.foto_url;
    } else {
        currentUser.photoUrl = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
    }

} else {
    window.location.href = "index.html";
}

const menuItems = [
    { id: 'inicio', icon: 'bx-grid-alt', text: 'Dashboard', roles: ['superadmin', 'admin', 'colaborador', 'gerente', 'logistica'] },
    { id: 'calendario', icon: 'bx-calendar-event', text: 'Calendario', roles: ['superadmin', 'admin', 'colaborador', 'gerente'] },
    { id: 'ventas', icon: 'bx-cart-alt', text: 'Ventas', roles: ['superadmin', 'admin', 'colaborador', 'gerente'] },
    { id: 'historial', icon: 'bx-history', text: 'Historial Ventas', roles: ['superadmin', 'admin', 'gerente'] },
    { id: 'caja', icon: 'bx-wallet', text: 'Flujo de Caja', roles: ['superadmin', 'admin', 'gerente'] },
    { id: 'inventario', icon: 'bx-box', text: 'Inventario', roles: ['superadmin', 'admin', 'colaborador', 'logistica', 'gerente'] },
    { id: 'proveedores', icon: 'bx-store-alt', text: 'Proveedores', roles: ['superadmin', 'admin', 'logistica', 'gerente'] },
    { id: 'facturas', icon: 'bx-receipt', text: 'Facturas', roles: ['superadmin', 'admin', 'gerente'] },
    { id: 'clientes', icon: 'bx-user-pin', text: 'Clientes', roles: ['superadmin', 'admin', 'colaborador', 'gerente'] },
    { id: 'crm', icon: 'bx-doughnut-chart', text: 'CRM / Leads', roles: ['superadmin', 'admin', 'colaborador', 'gerente'] },
    { id: 'analitica', icon: 'bx-bar-chart-alt-2', text: 'Analítica', roles: ['superadmin', 'admin', 'gerente'] },
    { id: 'configuracion', icon: 'bx-cog', text: 'Configuración', roles: ['superadmin', 'admin'] },
    { id: 'perfil', icon: 'bx-user', text: 'Mi Perfil', roles: ['superadmin', 'admin', 'colaborador', 'gerente', 'logistica'], hidden: true }
];

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    renderMenu();
    // Si estamos recargando y ya había un módulo activo, podríamos intentar recuperarlo, 
    // pero por defecto vamos a inicio.
    loadModule('inicio'); 
});

const body = document.querySelector('body');
const sidebar = body.querySelector('nav');
const toggle = body.querySelector(".toggle");
const tituloModulo = document.getElementById('titulo-modulo');
const contenedorDinamico = document.getElementById('contenedor-dinamico');
const menuContainer = document.getElementById('sidebar-menu');

function initSidebar() {
    if(toggle) toggle.addEventListener("click", () => sidebar.classList.toggle("close"));
    
    const profileName = document.getElementById('sidebar-profile-name');
    const profileRole = document.getElementById('sidebar-profile-role');
    const profileImg = document.getElementById('sidebar-profile-img');

    // PINTAMOS DATOS
    if(profileName) profileName.innerText = currentUser.name;
    if(profileRole) profileRole.innerText = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    
    // AQUÍ SE ACTUALIZA LA FOTO DE LA BARRA LATERAL
    if(profileImg) {
        profileImg.src = currentUser.photoUrl;
        // Si la imagen falla (ej: archivo borrado), ponemos default
        profileImg.onerror = function() {
            this.src = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
        };
    }

    const profileCard = document.querySelector('.profile-card');
    if(profileCard) {
        profileCard.addEventListener('click', () => {
            loadModule('perfil');
            document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
        });
    }
}

function renderMenu() {
    menuContainer.innerHTML = '';
    menuItems.forEach(item => {
        if (item.roles.includes(currentUser.role) && !item.hidden) {
            const li = document.createElement('li');
            li.className = 'nav-link';
            li.innerHTML = `
                <a href="#" onclick="loadModule('${item.id}'); activarLink(this)">
                    <i class='bx ${item.icon} icon'></i>
                    <span class="text nav-text">${item.text}</span>
                </a>
            `;
            menuContainer.appendChild(li);
        }
    });
}

function activarLink(element) {
    document.querySelectorAll('.nav-link').forEach(el => el.classList.remove('active'));
    element.parentElement.classList.add('active');
}

function toggleMenuMovil() {
    sidebar.classList.toggle("mobile-active");
    let overlay = document.querySelector('.overlay-movil');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'overlay-movil';
        body.appendChild(overlay);
        overlay.addEventListener('click', () => {
            sidebar.classList.remove("mobile-active");
            overlay.classList.remove("active");
        });
    }
    overlay.classList.toggle("active");
}

let currentModuleCss = null;
let currentModuleJs = null;


async function loadModule(moduleId) {
    if (window.innerWidth < 768) {
        sidebar.classList.remove("mobile-active");
        document.querySelector('.overlay-movil')?.classList.remove("active");
    }

    const menuItem = menuItems.find(item => item.id === moduleId);
    if(tituloModulo) tituloModulo.innerText = menuItem ? menuItem.text : 'Módulo';

    if (currentModuleCss) currentModuleCss.remove();
    if (currentModuleJs) currentModuleJs.remove();
    
    contenedorDinamico.innerHTML = '<div style="text-align:center; padding:40px; color:#666;">Cargando...</div>';

    try {
        const htmlResponse = await fetch(`modules/${moduleId}/${moduleId}.html`);
        if (!htmlResponse.ok) throw new Error("Modulo no encontrado");
        
        const htmlContent = await htmlResponse.text();
        contenedorDinamico.innerHTML = htmlContent;

        // Cargar CSS
        currentModuleCss = document.createElement('link');
        currentModuleCss.rel = 'stylesheet';
        currentModuleCss.href = `modules/${moduleId}/${moduleId}.css`;
        document.head.appendChild(currentModuleCss);

        // Cargar JS con "cache-busting" (para forzar recarga)
        const jsResponse = await fetch(`modules/${moduleId}/${moduleId}.js?t=${Date.now()}`);
        if (jsResponse.ok) {
            currentModuleJs = document.createElement('script');
            currentModuleJs.src = `modules/${moduleId}/${moduleId}.js?t=${Date.now()}`;
            
            // 🚨 NUEVA LÓGICA DE RECARGA AUTOMÁTICA
            currentModuleJs.onload = () => {
                console.log(`Módulo ${moduleId} cargado.`);
                
                // Mapa de funciones de inicialización según el módulo
                // Si el módulo expuso su función con window.initX, la llamamos aquí.
                if (moduleId === 'facturas' && typeof window.initFacturas === 'function') window.initFacturas();
                if (moduleId === 'clientes' && typeof window.initClientes === 'function') window.initClientes();
                if (moduleId === 'analitica' && typeof window.obtenerReporteCompleto === 'function') window.obtenerReporteCompleto();
                if (moduleId === 'historial' && typeof window.initHistorial === 'function') window.initHistorial();
                if (moduleId === 'crm' && typeof window.initCRM === 'function') window.initCRM();
                if (moduleId === 'inventario' && typeof window.initInventario === 'function') window.initInventario();
            };

            document.body.appendChild(currentModuleJs);
        }

    } catch (error) {
        console.error(error);
        contenedorDinamico.innerHTML = `<div style="padding:20px">Error cargando módulo.</div>`;
    }
}

function cerrarSesion() {
    localStorage.clear();
    window.location.href = "index.html";
}