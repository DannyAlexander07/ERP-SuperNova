// Ubicacion: SuperNova/frontend/modules/caja/caja.js

(function() {
    console.log("Modulo Caja Financiera Activo 💵");

    let cajaGlobal = [];
    let listaParaExcel = [];
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
        
        // 🔥 CORRECCIÓN: Agregamos 'superadmin' y 'gerente' a la lista VIP
        const esAdmin = rol === 'superadmin' || rol === 'admin' || rol === 'administrador' || rol === 'gerente';
        
        console.log("Rol detectado:", rol, "| Permiso Admin:", esAdmin);

        const select = document.getElementById('filtro-sede-caja');
        if (!select) return; // Si no existe el HTML, salimos sin error

        if (esAdmin) {
            // MOSTRAR SELECTOR
            select.style.display = 'block'; 
            
            try {
                const token = localStorage.getItem('token');
                // Cargamos las sedes desde la API
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
                }
            } catch (e) { console.error("Error de red cargando sedes", e); }
        } else {
            // Si NO es admin, ocultamos
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

// EN CAJA.JS - Reemplaza cargarResumen

    async function cargarResumen() {
        try {
            const token = localStorage.getItem('token');
            const url = `/api/caja/resumen?sede=${filtroSedeActual}`;
            
            const res = await fetch(url, { headers: { 'x-auth-token': token } });
            
            if(res.ok) {
                const data = await res.json();
                
                // Pinta el Balance Grande (Neto)
                const setKpi = (id, valor) => {
                    const el = document.getElementById(id);
                    if(!el) return;
                    const val = parseFloat(valor || 0);
                    el.innerText = `S/ ${val.toFixed(2)}`;
                    el.style.color = val >= 0 ? '#1e293b' : '#dc2626'; 
                };

                // Pinta la Cajita Roja (Suma de Gasto + Merma)
                const setPerdida = (id, gasto, merma) => {
                    const el = document.getElementById(id);
                    const badge = document.getElementById('badge-' + id);
                    if(!el) return;
                    
                    const total = parseFloat(gasto || 0) + parseFloat(merma || 0);
                    el.innerText = `S/ ${total.toFixed(2)}`;
                    
                    // Cambiamos el texto de "Merma" a "Egresos" si hay gastos, o lo dejamos genérico
                    // Opcional: buscar el span hermano y cambiarle el texto a "Salidas"
                    
                    if (total > 0) {
                        el.style.color = '#ef4444'; 
                        if(badge) badge.style.opacity = "1";
                    } else {
                        el.style.color = '#94a3b8'; 
                        if(badge) badge.style.opacity = "0.6"; 
                    }
                };

                // 1. BALANCES
                setKpi('kpi-dia', data.dia);
                setKpi('kpi-semana', data.semana);
                setKpi('kpi-mes', data.mes);
                setKpi('kpi-anio', data.anio);
                
                // 2. SALIDAS (GASTOS DE CAJA + MERMAS DE INVENTARIO)
                setPerdida('merma-dia', data.gastos.hoy, data.mermas.hoy);
                setPerdida('merma-semana', data.gastos.semana, data.mermas.semana);
                setPerdida('merma-mes', data.gastos.mes, data.mermas.mes);
                setPerdida('merma-anio', data.gastos.anio, data.mermas.anio);

                // 3. SALDO TOTAL
                const elSaldo = document.getElementById('kpi-saldo');
                if(elSaldo) {
                    const saldo = parseFloat(data.saldo || 0);
                    elSaldo.innerText = `S/ ${saldo.toFixed(2)}`;
                    elSaldo.style.color = '#1e293b'; 
                }
            }
        } catch (e) { console.error("Error KPIs:", e); }
    }

    // 2. CARGAR TABLA
    async function cargarMovimientos() {
        try {
            const token = localStorage.getItem('token');
            const url = `/api/caja?sede=${filtroSedeActual}`; // El backend ya filtra por sede aquí

            const res = await fetch(url, { headers: { 'x-auth-token': token } });
            
            if(res.ok) {
                const data = await res.json();
                // Guardamos TODO lo que trajo el servidor en cajaGlobal
                cajaGlobal = Array.isArray(data) ? data : []; 
                
                // Reiniciamos a página 1 al cargar nuevos datos
                currentPage = 1; 
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

    // --- FUNCIÓN EXPORTAR A EXCEL (DATA COMPLETA Y FILTRADA) ---
    window.exportarTablaCaja = function() {
        // 1. Usamos cajaGlobal que contiene TODOS los datos traídos del servidor
        let dataParaExportar = cajaGlobal; 

        // 2. Validar si hay datos
        if (!dataParaExportar || dataParaExportar.length === 0) {
            return alert("No hay datos cargados en la pantalla para exportar.");
        }

        // --- APLICAR FILTRO DE TEXTO (BUSCADOR) ---
        // (El filtro de Sede NO es necesario hacerlo aquí porque el Backend YA nos mandó la lista filtrada)
        
        const inputBuscador = document.getElementById('search-caja'); // O el ID que tenga tu buscador
        if (inputBuscador && inputBuscador.value.trim() !== "") {
            const texto = inputBuscador.value.toLowerCase();
            
            dataParaExportar = dataParaExportar.filter(mov => {
                const descripcion = (mov.descripcion || "").toLowerCase();
                const usuario = (mov.usuario || mov.usuario_nombre || "").toLowerCase();
                const metodo = (mov.metodo_pago || "").toLowerCase();
                const origen = (mov.origen || "").toLowerCase();
                
                return descripcion.includes(texto) || 
                       usuario.includes(texto) || 
                       metodo.includes(texto) ||
                       origen.includes(texto);
            });
        }

        // 3. Generar CSV
        let csvContent = [];
        csvContent.push("sep=;"); // Truco para Excel
        
        // Encabezados
        csvContent.push("FECHA;HORA;TIPO;ORIGEN;DESCRIPCION;METODO;MONTO;USUARIO;SEDE");

        dataParaExportar.forEach(mov => {
            // A. Formatear Fecha y Hora
            const fechaObj = new Date(mov.fecha_registro);
            const fecha = fechaObj.toLocaleDateString('es-PE');
            const hora = fechaObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            // B. Limpiar Textos
            let desc = (mov.descripcion || "").replace(/(\r\n|\n|\r)/gm, " ").replace(/;/g, ",").replace(/"/g, '""');
            let origen = (mov.origen || "General").replace(/;/g, ",");

            // C. Formatear Monto
            let monto = parseFloat(mov.monto).toFixed(2);
            // Opcional: Si es egreso ponerle negativo visualmente
            if(mov.tipo_movimiento === 'EGRESO') monto = `-${monto}`;

            // D. Nombres
            let nombreUsuario = mov.usuario || mov.usuario_nombre || "-";
            let nombreSede = mov.nombre_sede || mov.sede_id || "-";

            let row = [
                `"${fecha}"`,
                `"${hora}"`,
                `"${mov.tipo_movimiento}"`,
                `"${origen}"`,
                `"${desc}"`,
                `"${mov.metodo_pago}"`,
                monto,
                `"${nombreUsuario}"`,
                `"${nombreSede}"`
            ];

            csvContent.push(row.join(";"));
        });

        // 4. Descargar
        let csvString = "\uFEFF" + csvContent.join("\n");
        let blob = new Blob([csvString], { type: "text/csv;charset=utf-8;" });
        let link = document.createElement("a");
        link.setAttribute("href", URL.createObjectURL(blob));
        link.setAttribute("download", `Caja_Reporte_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
    // INICIO
    initCaja();

})();