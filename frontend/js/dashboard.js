// Ubicacion: SuperNova/frontend/js/dashboard.js

// 1. CARGAR USUARIO REAL
let currentUser = {
    name: "Usuario",
    role: "colaborador",
    photoUrl: "https://cdn-icons-png.flaticon.com/512/149/149071.png"
};

const userStr = localStorage.getItem('user');
const token = localStorage.getItem('token');

// 🛡️ SEGURIDAD INICIAL: Si no hay token o usuario, rebotar al login
if (userStr && token) {
    try {
        const u = JSON.parse(userStr);
        
        const nombreReal = u.nombre || u.nombres || "Usuario";
        const apellidoReal = u.apellidos || "";
        
        currentUser.name = `${nombreReal} ${apellidoReal}`.trim();
        // Normalizamos el rol a minúsculas para evitar errores (Admin vs admin)
        currentUser.role = (u.rol || "colaborador").toLowerCase().trim();
        
        if (u.foto_url && u.foto_url !== "null") {
            currentUser.photoUrl = u.foto_url;
        } else {
            currentUser.photoUrl = "https://cdn-icons-png.flaticon.com/512/3135/3135715.png";
        }
    } catch (e) {
        console.error("Error parseando usuario:", e);
        cerrarSesion();
    }
} else {
    window.location.href = "index.html";
}
document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
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
    if(!menuContainer) return;
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

// --- FUNCIÓN PRINCIPAL DE CARGA DE MÓDULOS (VERSION REFORZADA) ---
async function loadModule(moduleId) {
    // 🛡️ Cerrar menu movil si esta abierto
    if (window.innerWidth < 768) {
        sidebar.classList.remove("mobile-active");
        document.querySelector('.overlay-movil')?.classList.remove("active");
    }

    const menuItem = menuItems.find(item => item.id === moduleId);
    if(tituloModulo) tituloModulo.innerText = menuItem ? menuItem.text : 'Módulo';

    // 1. LIMPIEZA DE RECURSOS (Garbage Collection Manual para evitar que se caiga el navegador)
    if (currentModuleCss) currentModuleCss.remove();
    if (currentModuleJs) {
        // Al remover el script del DOM ayudamos a liberar memoria
        currentModuleJs.remove();
        currentModuleJs = null;
    }
    
    // Si el módulo anterior dejó una función de limpieza, la ejecutamos
    if (typeof window.destroyCurrentModule === 'function') {
        try { window.destroyCurrentModule(); } catch(e) {}
        window.destroyCurrentModule = null;
    }
    
    contenedorDinamico.innerHTML = `
        <div style="text-align:center; padding:60px; color:#666;">
            <i class="bx bx-loader-alt bx-spin" style="font-size:40px; color:#695cfe;"></i>
            <br><span style="margin-top:10px; display:inline-block; font-weight:500;">Cargando ${menuItem?.text || ''}...</span>
        </div>`;

    try {
        // 2. Carga HTML (Añadimos version para evitar cache viejo)
        const htmlResponse = await fetch(`modules/${moduleId}/${moduleId}.html?v=${Date.now()}`);
        if (!htmlResponse.ok) throw new Error("Módulo no encontrado");
        
        const htmlContent = await htmlResponse.text();
        contenedorDinamico.innerHTML = htmlContent;

        // 3. Carga CSS
        currentModuleCss = document.createElement('link');
        currentModuleCss.rel = 'stylesheet';
        currentModuleCss.href = `modules/${moduleId}/${moduleId}.css?v=${Date.now()}`;
        document.head.appendChild(currentModuleCss);

        // 4. Carga JS con cache-busting
        const jsUrl = `modules/${moduleId}/${moduleId}.js?v=${Date.now()}`;
        
        currentModuleJs = document.createElement('script');
        currentModuleJs.src = jsUrl;
        currentModuleJs.async = true;
        
        currentModuleJs.onload = () => {
            console.log(`[SuperNova] 🚀 Módulo ${moduleId} cargado satisfactoriamente.`);
            
            // 🔥 MAPEO DE INICIALIZADORES (Mantenemos tu lógica pero centralizada)
            const moduleInitializers = {
                'inicio': 'initDashboard',
                'facturas': 'initFacturas',
                'clientes': 'initClientes',
                'analitica': 'obtenerReporteCompleto',
                'historial': 'initHistorial',
                'crm': 'initCRM',
                'inventario': 'initInventario',
                'terceros': 'initTerceros'
            };

            const initFuncName = moduleInitializers[moduleId];
            if (initFuncName && typeof window[initFuncName] === 'function') {
                window[initFuncName](); 
            }
        };

        currentModuleJs.onerror = () => {
            throw new Error(`No se pudo cargar el archivo lógico de ${moduleId}`);
        };

        document.body.appendChild(currentModuleJs);

    } catch (error) {
        console.error("Error crítico de carga:", error);
        contenedorDinamico.innerHTML = `
            <div style="padding:40px; text-align:center; color:#e74c3c;">
                <i class='bx bx-error-circle' style="font-size:50px"></i>
                <h3 style="margin-top:15px;">Error al cargar el módulo</h3>
                <p style="color:#666;">${error.message}</p>
                <button onclick="loadModule('${moduleId}')" style="margin-top:20px; padding:10px 20px; background:#695cfe; color:white; border:none; border-radius:5px; cursor:pointer;">
                    <i class='bx bx-refresh'></i> Reintentar
                </button>
            </div>`;
    }
}

function cerrarSesion() {
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = "index.html";
}

// --- SISTEMA DE NOTIFICACIONES SUPERNOVA ---

window.showMiniNotif = function(mensaje, tipo = 'success') {
    // Si ya existe una, la quitamos
    const actual = document.querySelector('.mini-notif');
    if(actual) actual.remove();

    const notif = document.createElement('div');
    notif.className = `mini-notif ${tipo}`;
    notif.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 15px 25px;
        background: ${tipo === 'success' ? '#28a745' : '#dc3545'};
        color: white; border-radius: 8px; z-index: 99999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-weight: 500;
        animation: slideIn 0.3s ease forwards;
    `;
    notif.innerHTML = `<i class='bx ${tipo === 'success' ? 'bx-check-circle' : 'bx-error'}'></i> ${mensaje}`;
    document.body.appendChild(notif);

    setTimeout(() => {
        notif.style.animation = 'slideOut 0.3s ease forwards';
        setTimeout(() => notif.remove(), 300);
    }, 3000);
};

// Estilos rápidos para las animaciones
const style = document.createElement('style');
style.innerHTML = `
    @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
    @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
`;
document.head.appendChild(style);

// Al cambiar a cualquier módulo, forzamos la limpieza de modales residuales
function limpiarModalesResiduales() {
    const modalesParaCerrar = [
        'modal-success', 
        'modal-cobro', 
        'modal-confirmar-anulacion'
    ];
    
    modalesParaCerrar.forEach(id => {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('active');
            // Si usas display: block/none manual:
            modal.style.display = 'none'; 
        }
    });
}

