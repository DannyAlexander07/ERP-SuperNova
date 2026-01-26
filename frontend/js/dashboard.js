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
    // Normalizamos el rol a minúsculas para evitar errores (Admin vs admin)
    currentUser.role = (u.rol || "colaborador").toLowerCase();
    
    if (u.foto_url && u.foto_url !== "null") {
        currentUser.photoUrl = u.foto_url;
    } else {
        currentUser.photoUrl = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
    }

} else {
    window.location.href = "index.html";
}

// 2. DEFINICIÓN DE MENÚ Y PERMISOS
const menuItems = [
    { id: 'inicio', icon: 'bx-grid-alt', text: 'Dashboard', roles: ['superadmin', 'admin', 'colaborador', 'gerente', 'logistica'] },
    { id: 'calendario', icon: 'bx-calendar-event', text: 'Calendario', roles: ['superadmin', 'admin', 'colaborador', 'gerente'] },
    { id: 'ventas', icon: 'bx-cart-alt', text: 'Ventas', roles: ['superadmin', 'admin', 'colaborador', 'gerente'] },
    { id: 'terceros', icon: 'bx-qr-scan', text: 'Canjes / Terceros', roles: ['superadmin', 'admin', 'gerente', 'colaborador'] },
    { id: 'historial', icon: 'bx-history', text: 'Historial Ventas', roles: ['superadmin', 'admin', 'gerente'] },
    { id: 'caja', icon: 'bx-wallet', text: 'Flujo de Caja', roles: ['superadmin', 'admin', 'gerente', 'colaborador'] },
    { id: 'caja_chica', icon: 'bx-wallet-alt', text: 'Caja Chica', roles: ['superadmin', 'admin', 'gerente', 'colaborador'] },
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
    loadModule('inicio'); // Carga inicial
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

    if(profileName) profileName.innerText = currentUser.name;
    if(profileRole) profileRole.innerText = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
    
    if(profileImg) {
        profileImg.src = currentUser.photoUrl;
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

// --- FUNCIÓN PRINCIPAL DE CARGA DE MÓDULOS ---
async function loadModule(moduleId) {
    if (window.innerWidth < 768) {
        sidebar.classList.remove("mobile-active");
        document.querySelector('.overlay-movil')?.classList.remove("active");
    }

    const menuItem = menuItems.find(item => item.id === moduleId);
    if(tituloModulo) tituloModulo.innerText = menuItem ? menuItem.text : 'Módulo';

    // 1. Limpieza de recursos anteriores
    if (currentModuleCss) currentModuleCss.remove();
    if (currentModuleJs) currentModuleJs.remove();
    
    // Limpieza de funciones globales si existen (Garbage Collection manual)
    if (typeof window.destroyCurrentModule === 'function') {
        window.destroyCurrentModule();
        window.destroyCurrentModule = null;
    }
    
    contenedorDinamico.innerHTML = '<div style="text-align:center; padding:40px; color:#666;"><i class="bx bx-loader-alt bx-spin" style="font-size:30px"></i><br>Cargando...</div>';

    try {
        // 2. Carga HTML
        const htmlResponse = await fetch(`modules/${moduleId}/${moduleId}.html`);
        if (!htmlResponse.ok) throw new Error("Módulo no encontrado");
        
        const htmlContent = await htmlResponse.text();
        contenedorDinamico.innerHTML = htmlContent;

        // 3. Carga CSS
        currentModuleCss = document.createElement('link');
        currentModuleCss.rel = 'stylesheet';
        currentModuleCss.href = `modules/${moduleId}/${moduleId}.css`;
        document.head.appendChild(currentModuleCss);

        // 4. Carga JS con cache-busting
        const jsResponse = await fetch(`modules/${moduleId}/${moduleId}.js?t=${Date.now()}`);
        if (jsResponse.ok) {
            currentModuleJs = document.createElement('script');
            currentModuleJs.src = `modules/${moduleId}/${moduleId}.js?t=${Date.now()}`;
            
            currentModuleJs.onload = () => {
                console.log(`✅ Módulo ${moduleId} cargado.`);
                
                // 🔥 INICIALIZADORES ESPECÍFICOS POR MÓDULO 🔥
                // Esto permite que el módulo "sepa" que acaba de nacer.
                
                // INICIO (DASHBOARD)
                if (moduleId === 'inicio' && typeof window.initDashboard === 'function') {
                    window.initDashboard(); 
                }

                // OTROS MÓDULOS
                if (moduleId === 'facturas' && typeof window.initFacturas === 'function') window.initFacturas();
                if (moduleId === 'clientes' && typeof window.initClientes === 'function') window.initClientes();
                if (moduleId === 'analitica' && typeof window.obtenerReporteCompleto === 'function') window.obtenerReporteCompleto();
                if (moduleId === 'historial' && typeof window.initHistorial === 'function') window.initHistorial();
                if (moduleId === 'crm' && typeof window.initCRM === 'function') window.initCRM();
                if (moduleId === 'inventario' && typeof window.initInventario === 'function') window.initInventario();
                if (moduleId === 'terceros' && typeof window.initTerceros === 'function') window.initTerceros();
            };

            document.body.appendChild(currentModuleJs);
        }

    } catch (error) {
        console.error(error);
        contenedorDinamico.innerHTML = `<div style="padding:20px; text-align:center; color:red;">
            <i class='bx bx-error-circle' style="font-size:40px"></i>
            <p>Error cargando el módulo "${moduleId}".<br>Verifica que los archivos existan.</p>
        </div>`;
    }
}

function cerrarSesion() {
    localStorage.clear();
    window.location.href = "index.html";
}