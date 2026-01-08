// Ubicacion: SuperNova/frontend/modules/caja/caja.js

(function() {
    console.log("Modulo Caja Financiera Activo 💵");

    let cajaGlobal = [];
    let currentPage = 1;
    const ITEMS_PER_PAGE = 10;
    
    // Variable para guardar el filtro actual (vacío = todas o la del usuario)
    let filtroSedeActual = "";

    async function initCaja() {
        // 1. Primero configuramos el filtro (si es admin)
        await configurarFiltroAdmin(); 
        // 2. Luego cargamos los datos
        await cargarResumen();
        await cargarMovimientos();
    }

    // --- 0. SEGURIDAD Y FILTROS (LÓGICA CORREGIDA) ---
    async function configurarFiltroAdmin() {
        const usuarioStr = localStorage.getItem('usuario') || localStorage.getItem('user');
        if (!usuarioStr) return;

        const usuario = JSON.parse(usuarioStr);
        const rol = (usuario.rol || '').toLowerCase();
        // Aceptamos variantes de admin
        const esAdmin = rol === 'admin' || rol === 'administrador';
        
        console.log("Rol detectado:", rol, "| Es Admin:", esAdmin); // Debug

        const select = document.getElementById('filtro-sede-caja');
        if (!select) return console.error("No se encontró el select #filtro-sede-caja en el HTML");

        if (esAdmin) {
            // MOSTRAR SELECTOR
            select.style.display = 'block'; 
            
            try {
                const token = localStorage.getItem('token');
                // Llamamos a la API de sedes (según tu estructura tienes sedesController)
                const res = await fetch('/api/sedes', { headers: { 'x-auth-token': token } });
                
                if (res.ok) {
                    const sedes = await res.json();
                    
                    // Limpiamos y ponemos la opción default
                    select.innerHTML = '<option value="">🏢 Todas las Sedes (Global)</option>';
                    
                    sedes.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.innerText = `📍 ${s.nombre}`;
                        select.appendChild(opt);
                    });
                } else {
                    console.error("Error al cargar sedes:", await res.text());
                }
            } catch (e) { console.error("Error de red cargando sedes", e); }
        } else {
            // Si NO es admin, ocultamos y forzamos filtro vacío (el backend usará su sede_id)
            select.style.display = 'none';
        }
    }

    // Función global para el onchange del HTML
    window.filtrarCajaPorSede = function() {
        const select = document.getElementById('filtro-sede-caja');
        filtroSedeActual = select.value; // Capturamos el ID (ej: "1" o "")
        
        console.log("Filtrando por sede:", filtroSedeActual);

        // Recargamos todo con el nuevo filtro
        currentPage = 1;
        cargarResumen();
        cargarMovimientos();
    }

    // 1. CARGAR RESUMEN (KPIs)
    async function cargarResumen() {
        try {
            const token = localStorage.getItem('token');
            // Enviamos el parámetro ?sede=X (si está vacío, el backend admin suma todo)
            const url = `/api/caja/resumen?sede=${filtroSedeActual}`;
            
            const res = await fetch(url, { headers: { 'x-auth-token': token } });
            if(res.ok) {
                const data = await res.json();
                
                if(document.getElementById('kpi-ingresos')) 
                    document.getElementById('kpi-ingresos').innerText = `S/ ${parseFloat(data.ingresos || 0).toFixed(2)}`;
                
                if(document.getElementById('kpi-egresos')) 
                    document.getElementById('kpi-egresos').innerText = `S/ ${parseFloat(data.egresos || 0).toFixed(2)}`;
                
                const saldo = parseFloat(data.saldo || 0);
                const elSaldo = document.getElementById('kpi-saldo');
                if(elSaldo) {
                    elSaldo.innerText = `S/ ${saldo.toFixed(2)}`;
                    elSaldo.style.color = saldo >= 0 ? '#16a34a' : '#dc2626';
                }
            }
        } catch (e) { console.error(e); }
    }

    // 2. CARGAR TABLA
    async function cargarMovimientos() {
        try {
            const token = localStorage.getItem('token');
            const url = `/api/caja?sede=${filtroSedeActual}`;

            const res = await fetch(url, { headers: { 'x-auth-token': token } });
            
            if(res.ok) {
                const data = await res.json();
                cajaGlobal = Array.isArray(data) ? data : []; 
                renderizarTablaCaja();
            } else {
                console.error("Error al cargar movimientos");
            }
        } catch (e) { console.error(e); }
    }

    function renderizarTablaCaja() {
        const tbody = document.getElementById('tabla-caja-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        if(cajaGlobal.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px">Sin movimientos.</td></tr>';
            const pagDiv = document.getElementById('caja-paginacion');
            if(pagDiv) pagDiv.innerHTML = '';
            return;
        }

        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        const endIndex = startIndex + ITEMS_PER_PAGE;
        const dataToRender = cajaGlobal.slice(startIndex, endIndex);

        dataToRender.forEach(m => {
            const tr = document.createElement('tr');
            
            const fechaObj = new Date(m.fecha_registro);
            const fechaStr = fechaObj.toLocaleDateString();
            const horaStr = fechaObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            const esIngreso = m.tipo_movimiento === 'INGRESO';
            const claseBadge = esIngreso ? 'badge-ingreso' : 'badge-egreso';
            const colorMonto = esIngreso ? '#16a34a' : '#dc2626';
            const signo = esIngreso ? '+' : '-';

            // Agregamos el nombre de la sede si existe
            const sedeLabel = m.nombre_sede ? `<br><small style="color:#6366f1; font-weight:600">📍 ${m.nombre_sede}</small>` : '';

            tr.innerHTML = `
                <td>
                    <div style="font-weight:600">${fechaStr}</div>
                    <div style="font-size:12px; color:#666">${horaStr}</div>
                </td>
                <td><span class="${claseBadge}">${m.tipo_movimiento}</span></td>
                <td>
                    <strong>${m.origen || 'General'}</strong>
                    <br><small style="color:#666">${m.descripcion || ''}</small>
                    ${sedeLabel}
                </td>
                <td>${m.metodo_pago}</td>
                <td style="font-weight:bold; font-size:15px; color:${colorMonto}">${signo} S/ ${parseFloat(m.monto).toFixed(2)}</td>
                <td style="font-size:12px">${m.usuario}</td>
            `;
            tbody.appendChild(tr);
        });

        renderizarPaginacion(cajaGlobal.length);
    }

    function renderizarPaginacion(totalItems) {
        const contenedor = document.getElementById('caja-paginacion');
        if (!contenedor) return;

        const totalPaginas = Math.ceil(totalItems / ITEMS_PER_PAGE);

        if (totalPaginas <= 1) {
            contenedor.innerHTML = '';
            return;
        }

        contenedor.innerHTML = `
            <div class="pagination-wrapper" style="background:#fff; border:1px solid #ddd; border-radius:50px; padding:5px 15px; display:flex; align-items:center; gap:10px;">
                <span style="font-size:12px; color:#666;">Pág <strong>${currentPage}</strong> de <strong>${totalPaginas}</strong></span>
                <div style="display:flex; gap:5px;">
                    <button onclick="cambiarPaginaCaja(-1)" ${currentPage === 1 ? 'disabled' : ''} style="border:none; background:transparent; cursor:pointer; font-size:18px;">
                        <i class='bx bx-chevron-left'></i>
                    </button>
                    <button onclick="cambiarPaginaCaja(1)" ${currentPage >= totalPaginas ? 'disabled' : ''} style="border:none; background:transparent; cursor:pointer; font-size:18px;">
                        <i class='bx bx-chevron-right'></i>
                    </button>
                </div>
            </div>
        `;

        window.cambiarPaginaCaja = function(delta) {
            currentPage += delta;
            renderizarTablaCaja(); 
        };
    }

    // 3. REGISTRAR NUEVO MOVIMIENTO
    const form = document.getElementById('form-caja');
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const data = {
                tipo: document.getElementById('mov-tipo').value,
                origen: document.getElementById('mov-origen').value,
                monto: document.getElementById('mov-monto').value,
                metodo: document.getElementById('mov-metodo').value,
                descripcion: document.getElementById('mov-desc').value
            };

            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/caja', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                    body: JSON.stringify(data)
                });

                if(res.ok) {
                    alert("✅ Movimiento registrado");
                    cerrarModalCaja();
                    cargarResumen();
                    cargarMovimientos();
                } else {
                    alert("❌ Error al registrar");
                }
            } catch (e) { console.error(e); }
        });
    }

    // MODALES
    window.abrirModalMovimiento = function() {
        const modal = document.getElementById('modal-caja');
        if(modal) {
            modal.classList.add('active');
            if(document.getElementById('form-caja')) document.getElementById('form-caja').reset();
        }
    }
    window.cerrarModalCaja = function() {
        const modal = document.getElementById('modal-caja');
        if(modal) modal.classList.remove('active');
    }

    // INICIO
    initCaja();

})();