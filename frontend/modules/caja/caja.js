// Ubicacion: SuperNova/frontend/modules/caja/caja.js

(function() {
    console.log("Modulo Caja Financiera (Solo Lectura) Activo 💵");

    let cajaGlobal = [];
    let currentPage = 1;
    const ITEMS_PER_PAGE = 10;
    let resumenGlobal = null;
    
    // Variable para guardar el filtro actual (vacío = todas o la del usuario)
    let filtroSedeActual = "";

    async function initCaja() {
        // 1. Primero configuramos el filtro (si es admin)
        await configurarFiltroAdmin(); 
        // 2. Luego cargamos los datos
        await cargarResumen();
        await cargarMovimientos();
    }

    // --- 0. SEGURIDAD Y FILTROS ---
    async function configurarFiltroAdmin() {
        const usuarioStr = localStorage.getItem('usuario') || localStorage.getItem('user');
        if (!usuarioStr) return;

        const usuario = JSON.parse(usuarioStr);
        const rol = (usuario.rol || '').toLowerCase();
        
        const esAdmin = rol === 'superadmin' || rol === 'admin' || rol === 'administrador' || rol === 'gerente';
        
        const select = document.getElementById('filtro-sede-caja');
        if (!select) return; 

        if (esAdmin) {
            select.style.display = 'block'; 
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/sedes', { headers: { 'x-auth-token': token } });
                
                if (res.ok) {
                    const sedes = await res.json();
                    select.innerHTML = '<option value="">🏢 Todas las Sedes (Global)</option>';
                    sedes.forEach(s => {
                        const opt = document.createElement('option');
                        opt.value = s.id;
                        opt.innerText = `📍 ${s.nombre}`;
                        select.appendChild(opt);
                    });
                }
            } catch (e) { console.error("Error cargando sedes", e); }
        } else {
            select.style.display = 'none';
        }
    }

    // Función global para el onchange del HTML
    window.filtrarCajaPorSede = function() {
        const select = document.getElementById('filtro-sede-caja');
        filtroSedeActual = select.value; 
        
        // Recargamos todo con el nuevo filtro
        currentPage = 1;
        cargarResumen();
        cargarMovimientos();
    }

    // --- 1. CARGAR KPIS Y RESUMEN ---
// --- 1. CARGAR KPIS Y RESUMEN ---
    async function cargarResumen() {
        try {
            const token = localStorage.getItem('token');
            const url = `/api/caja/resumen?sede=${filtroSedeActual}`;
            
            const res = await fetch(url, { headers: { 'x-auth-token': token } });
            
            if(res.ok) {
                const data = await res.json();
                resumenGlobal = data.desglose; 

                // Pintar los cuadros de arriba (Total General)
                const setKpi = (id, valor) => {
                    const el = document.getElementById(id);
                    if(!el) return;
                    const val = parseFloat(valor || 0);
                    el.innerText = `S/ ${val.toFixed(2)}`;
                    el.style.color = val >= 0 ? '#1e293b' : '#dc2626'; 
                };

                setKpi('kpi-dia', data.dia);
                setKpi('kpi-semana', data.semana);
                setKpi('kpi-mes', data.mes);
                setKpi('kpi-anio', data.anio);
                
                // ❌ AQUÍ BORRASTE TODO EL BLOQUE DE 'const setPerdida' y sus llamadas

                actualizarVistaDesglose('hoy'); 
            }
        } catch (e) { console.error("Error KPIs:", e); }
    }
    // --- FUNCIONES PARA LAS PESTAÑAS DE DESGLOSE ---
    window.cambiarPeriodoDesglose = function(periodo, btn) {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        if(btn) btn.classList.add('active');
        actualizarVistaDesglose(periodo);
    }

    function actualizarVistaDesglose(periodo) {
        if (!resumenGlobal || !resumenGlobal[periodo]) return;

        const datos = resumenGlobal[periodo];
        const updateVal = (id, val) => {
            const el = document.getElementById(id);
            if(el) el.innerText = `S/ ${parseFloat(val || 0).toFixed(2)}`;
        };

        updateVal('val-efectivo', datos.efectivo);
        updateVal('val-yape', datos.yape);
        updateVal('val-plin', datos.plin);
        updateVal('val-transferencia', datos.transferencia);
        updateVal('val-debito', datos.debito);
        updateVal('val-credito', datos.credito);
    }

    // --- 2. CARGAR MOVIMIENTOS (TABLA) ---
    async function cargarMovimientos() {
        try {
            const token = localStorage.getItem('token');
            const url = `/api/caja?sede=${filtroSedeActual}`; 

            const res = await fetch(url, { headers: { 'x-auth-token': token } });
            
            if(res.ok) {
                const data = await res.json();
                cajaGlobal = Array.isArray(data) ? data : []; 
                currentPage = 1; 
                renderizarTablaCaja();
            } else {
                console.error("Error al cargar movimientos");
            }
        } catch (e) { console.error(e); }
    }

    // --- RENDERIZAR TABLA ---
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
            const colorMonto = esIngreso ? '#16a34a' : '#dc2626';
            const signo = esIngreso ? '+' : '-';

            // 1. ORIGEN / DETALLE
            let detalleHtml = `<strong>${m.origen || 'General'}</strong>`;
            
            if (m.origen === 'VENTA_POS') {
                detalleHtml += `<br><small style="color:#666">${m.descripcion || ''}</small>`;
                if (m.tipo_comprobante) {
                    const esFactura = m.tipo_comprobante === 'Factura';
                    const colorDoc = esFactura ? '#4338ca' : '#4b5563';
                    const bgDoc = esFactura ? '#e0e7ff' : '#f3f4f6';
                    const icono = esFactura ? '🏢' : '📄';
                    
                    detalleHtml += `<br><span style="font-size:10px; font-weight:700; color:${colorDoc}; background:${bgDoc}; padding:2px 6px; border-radius:4px; margin-top:3px; display:inline-block; border:1px solid ${esFactura ? '#c7d2fe' : '#e5e7eb'};">
                        ${icono} ${m.tipo_comprobante.toUpperCase()}
                    </span>`;
                }
            } else {
                detalleHtml += `<br><small style="color:#666; font-style:italic;">${m.descripcion || ''}</small>`;
            }
            
            if(m.nombre_sede) {
                detalleHtml += `<br><small style="color:#6366f1; font-weight:600">📍 ${m.nombre_sede}</small>`;
            }

            // 2. MÉTODO DE PAGO
            let metodoHtml = m.metodo_pago;
            if (m.metodo_pago === 'Tarjeta' && m.tipo_tarjeta) {
                const iconoCard = m.tipo_tarjeta === 'Credito' ? '🏦' : '💳';
                metodoHtml += `<div style="font-size:10px; color:#666; margin-top:2px;">${iconoCard} ${m.tipo_tarjeta}</div>`;
            } else if (m.metodo_pago === 'Yape') {
                 metodoHtml = `<span style="color:#a855f7; font-weight:600;">📱 Yape</span>`;
            } else if (m.metodo_pago === 'Plin') {
                 metodoHtml = `<span style="color:#0ea5e9; font-weight:600;">📱 Plin</span>`;
            }

            tr.innerHTML = `
                <td>
                    <div style="font-weight:600">${fechaStr}</div>
                    <div style="font-size:12px; color:#666">${horaStr}</div>
                </td>
                <td><span class="badge ${esIngreso ? 'badge-soft-success' : 'badge-soft-danger'}">${m.tipo_movimiento}</span></td>
                <td>${detalleHtml}</td>
                <td>${metodoHtml}</td>
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

    // --- FUNCIÓN EXPORTAR A EXCEL ---
    window.exportarTablaCaja = function() {
        let dataParaExportar = cajaGlobal; 

        if (!dataParaExportar || dataParaExportar.length === 0) {
            return alert("No hay datos cargados en la pantalla para exportar.");
        }

        const inputBuscador = document.getElementById('search-caja'); 
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

        let csvContent = [];
        csvContent.push("sep=;"); 
        csvContent.push("FECHA;HORA;TIPO;ORIGEN;DESCRIPCION;METODO;MONTO;USUARIO;SEDE");

        dataParaExportar.forEach(mov => {
            const fechaObj = new Date(mov.fecha_registro);
            const fecha = fechaObj.toLocaleDateString('es-PE');
            const hora = fechaObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            let desc = (mov.descripcion || "").replace(/(\r\n|\n|\r)/gm, " ").replace(/;/g, ",").replace(/"/g, '""');
            let origen = (mov.origen || "General").replace(/;/g, ",");
            let monto = parseFloat(mov.monto).toFixed(2);
            if(mov.tipo_movimiento === 'EGRESO') monto = `-${monto}`;

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