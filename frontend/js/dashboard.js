// Ubicacion: SuperNova/frontend/js/dashboard.js

// 1. CARGAR USUARIO REAL
let currentUser = {
    name: "Usuario",
    role: "colaborador",
    photoUrl: "https://cdn-icons-png.flaticon.com/512/149/149071.png"
};

const userStr = localStorage.getItem('user');
const token = localStorage.getItem('token');
const APP_VERSION = '1.0.0';

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
    { id: 'prestamos', icon: 'bx-credit-card', text: 'Créditos', roles: ['superadmin', 'admin', 'gerente'] },
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
                <a href="javascript:void(0)" onclick="loadModule('${item.id}'); activarLink(this)">
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
    // 🛡️ 1. LIMPIEZA PREVENTIVA DE MODALES (Anti-Zombis)
    limpiarModalesResiduales();

    // 🛡️ Cerrar menu movil si esta abierto
    if (window.innerWidth < 768) {
        sidebar.classList.remove("mobile-active");
        document.querySelector('.overlay-movil')?.classList.remove("active");
    }

    const menuItem = menuItems.find(item => item.id === moduleId);
    if(tituloModulo) tituloModulo.innerText = menuItem ? menuItem.text : 'Módulo';

    // 2. GARBAGE COLLECTION MANUAL
    if (currentModuleCss) currentModuleCss.remove();
    if (currentModuleJs) {
        currentModuleJs.remove();
        currentModuleJs = null;
    }
    
    // Ejecutar destructor del módulo anterior si existe
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
        // 3. CARGA DE HTML (Con versionado para evitar caché)
        const htmlResponse = await fetch(`modules/${moduleId}/${moduleId}.html?v=${APP_VERSION}`);
        if (!htmlResponse.ok) throw new Error("Módulo no encontrado");
        
        const htmlContent = await htmlResponse.text();
        contenedorDinamico.innerHTML = htmlContent;

        // 4. CARGA DE CSS
        currentModuleCss = document.createElement('link');
        currentModuleCss.rel = 'stylesheet';
        currentModuleCss.href = `modules/${moduleId}/${moduleId}.css?v=${APP_VERSION}`; // <--- AQUÍ
        document.head.appendChild(currentModuleCss);

        // 5. CARGA DE JS
        const jsUrl = `modules/${moduleId}/${moduleId}.js?v=${APP_VERSION}`;
        
        currentModuleJs = document.createElement('script');
        currentModuleJs.src = jsUrl;
        currentModuleJs.async = true;
        
        currentModuleJs.onload = () => {
            console.log(`[SuperNova] 🚀 Módulo ${moduleId} cargado satisfactoriamente.`);
            
            // 🔥 MAPEO COMPLETO DE INICIALIZADORES
            const moduleInitializers = {
                'inicio': 'initDashboard',
                'facturas': 'initFacturas',
                'clientes': 'initClientes',
                'analitica': 'obtenerReporteCompleto',
                'historial': 'initHistorial',
                'crm': 'initCRM',
                'inventario': 'initInventario',
                'terceros': 'initTerceros',
                'prestamos': 'initPrestamos',
                // AGREGADOS QUE FALTABAN:
                'caja_chica': 'initCajaChica',
                'caja': 'initCaja', // Flujo de caja
                'proveedores': 'initProveedores',
                'configuracion': 'initConfiguracion',
                'perfil': 'initPerfil',
                'calendario': 'initCalendario',
                'ventas': 'initPOS' // Asegurando que ventas también se inicie si se llama 'initPOS' o 'initVentas'
            };

            // Intentamos ejecutar el inicializador
            const initFuncName = moduleInitializers[moduleId];
            
            if (initFuncName && typeof window[initFuncName] === 'function') {
                window[initFuncName](); 
            } else if (typeof window[`init${moduleId.charAt(0).toUpperCase() + moduleId.slice(1)}`] === 'function') {
                // Fallback inteligente: si no está en el mapa, intenta initModulo (ej: initProveedores)
                window[`init${moduleId.charAt(0).toUpperCase() + moduleId.slice(1)}`]();
            }
        };

        currentModuleJs.onerror = () => {
            throw new Error(`No se pudo cargar el archivo lógico de ${moduleId}`);
        };

        document.body.appendChild(currentModuleJs);

        if (!window.isHistoryNavigation) {
            history.pushState({ module: moduleId }, "", `#${moduleId}`);
        }

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
    // Si ya existe una, la quitamos para evitar acumulación
    const actual = document.querySelector('.mini-notif');
    if(actual) actual.remove();

    const notif = document.createElement('div');
    notif.className = `mini-notif ${tipo}`;
    notif.style.cssText = `
        position: fixed; top: 20px; right: 20px; padding: 15px 25px;
        background: ${tipo === 'success' ? '#28a745' : (tipo === 'error' ? '#dc3545' : '#f59e0b')};
        color: white; border-radius: 8px; z-index: 99999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15); font-weight: 500;
        animation: slideIn 0.3s ease forwards;
        display: flex; align-items: center; gap: 10px;
    `;
    
    const icono = tipo === 'success' ? 'bx-check-circle' : (tipo === 'error' ? 'bx-x-circle' : 'bx-error');
    notif.innerHTML = `<i class='bx ${icono}' style="font-size: 20px;"></i> ${mensaje}`;
    
    document.body.appendChild(notif);

    // Auto-cierre
    setTimeout(() => {
        if(notif.parentNode) {
            notif.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => notif.remove(), 300);
        }
    }, 3500);
};

// Estilos rápidos para las animaciones
if (!document.getElementById('notif-styles')) {
    const style = document.createElement('style');
    style.id = 'notif-styles';
    style.innerHTML = `
        @keyframes slideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        @keyframes slideOut { from { transform: translateX(0); opacity: 1; } to { transform: translateX(100%); opacity: 0; } }
    `;
    document.head.appendChild(style);
}

// Al cambiar a cualquier módulo, forzamos la limpieza de modales residuales
function limpiarModalesResiduales() {
    // 1. Quitar clase active de todos los modales comunes
    const modales = document.querySelectorAll('.modal, .modal-custom, .modal-overlay, #modal-cobro, #modal-success');
    modales.forEach(m => {
        m.classList.remove('active');
        m.style.display = ''; // Limpiar estilos inline si los hubiera
    });

    // 2. Eliminar backdrops residuales de bootstrap si usaras, o overlays manuales
    const overlays = document.querySelectorAll('.overlay-movil');
    overlays.forEach(o => o.classList.remove('active'));
}


// Bandera para saber si el cambio viene del botón Atrás/Adelante
window.isHistoryNavigation = false;

document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    renderMenu();
    
    // Leemos el hash de la URL (ej: #ventas)
    const hash = window.location.hash.replace('#', '');
    if (hash) {
        loadModule(hash);
        // Marcamos visualmente el menú activo
        setTimeout(() => {
            const link = document.querySelector(`a[onclick*="'${hash}'"]`);
            if(link) activarLink(link);
        }, 500); // Pequeña espera para asegurar que el menú se renderizó
    } else {
        loadModule('inicio');
    }
});

// Detectar clic en Atrás/Adelante
window.addEventListener('popstate', (event) => {
    // Activamos bandera para que loadModule no guarde historial duplicado
    window.isHistoryNavigation = true;

    if (event.state && event.state.module) {
        // Si el navegador recuerda el módulo, lo cargamos
        loadModule(event.state.module);
        
        // Actualizamos el menú visualmente
        const link = document.querySelector(`a[onclick*="'${event.state.module}'"]`);
        if(link) activarLink(link);
    } else {
        // Si no hay estado, verificamos el hash por si acaso
        const hash = window.location.hash.replace('#', '');
        if (hash) {
            loadModule(hash);
        } else {
            loadModule('inicio');
        }
    }
    
    // Desactivamos la bandera
    setTimeout(() => { window.isHistoryNavigation = false; }, 100);
});