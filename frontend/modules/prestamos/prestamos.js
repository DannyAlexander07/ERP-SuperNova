// Ubicacion: frontend/modules/prestamos/prestamos.js

console.log("🚀 Módulo de Créditos y Cobranzas CARGADO CORRECTAMENTE");

// =======================================================
// 1. VARIABLES GLOBALES
// =======================================================
let creditosData = [];        // Almacena la lista para el buscador local
let detalleActual = null;     // Almacena el préstamo que se está viendo (para el PDF)
let prestamoIdEdicion = null; // null = Modo Crear, ID = Modo Editar

// =======================================================
// 2. FUNCIONES DE INTERFAZ (TABS Y FLUIJO) - GLOBALES
// =======================================================

// Esta función debe estar FUERA del DOMContentLoaded para que el HTML la encuentre siempre
window.cambiarTab = function(tabId) {
    // 1. Quitar clase active de todo el contenido
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    // 2. Quitar clase active de todos los botones
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    // 3. Activar el contenido seleccionado
    const tabTarget = document.getElementById(tabId);
    if(tabTarget) tabTarget.classList.add('active');
    
    // 4. Activar el botón visualmente
    // Buscamos el botón que tenga el onclick apuntando a este tabId
    const btn = document.querySelector(`button[onclick="cambiarTab('${tabId}')"]`);
    if(btn) btn.classList.add('active');

    // 5. Si volvemos a la lista, recargar datos
    if(tabId === 'tab-creditos') {
        if(typeof initPrestamos === 'function') initPrestamos();
    }
};

// Helper: Cambiar etiquetas según flujo (Recibido/Otorgado)
window.cambiarTipoFlujo = function() {
    const radio = document.querySelector('input[name="tipo_flujo"]:checked');
    if(!radio) return;

    const tipo = radio.value;
    const labelTercero = document.querySelector('#cred-tercero + label');
    
    if(labelTercero) {
        if (tipo === 'RECIBIDO') {
            labelTercero.innerText = "Entidad Prestamista (Acreedor)";
        } else {
            labelTercero.innerText = "Empresa / Cliente (Deudor)";
        }
    }
};

// =======================================================
// 3. INICIALIZACIÓN (EVENT LISTENERS)
// =======================================================
document.addEventListener('DOMContentLoaded', () => {
    initPrestamos();
    
    // Configurar buscador
    const inputBuscador = document.getElementById('buscador-creditos');
    if(inputBuscador) {
        inputBuscador.addEventListener('keyup', renderizarTablaCreditos);
    }
});

// ==========================================
// 4. LISTAR PRÉSTAMOS (TABLA PRINCIPAL)
// ==========================================
window.initPrestamos = async function() {
    const tbody = document.getElementById('tabla-creditos-body');
    if(!tbody) return; 
    
    tbody.innerHTML = "<tr><td colspan='9' class='text-center'>Cargando operaciones...</td></tr>";

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/prestamos', {
            headers: { 'x-auth-token': token }
        });
        
        if (!res.ok) throw new Error("Error al cargar préstamos");
        
        const data = await res.json();
        creditosData = data; // Guardamos para el filtro
        tbody.innerHTML = ""; 

        if (data.length === 0) {
            tbody.innerHTML = "<tr><td colspan='9' class='text-center'>No hay operaciones registradas.</td></tr>";
            actualizarKpisResumen([]);
            return;
        }

        // Calcular KPIs y Dibujar Tabla
        actualizarKpisResumen(data);
        renderizarTablaCreditos();

    } catch (error) {
        console.error(error);
        tbody.innerHTML = "<tr><td colspan='9' class='text-center text-danger'>Error de conexión con el servidor.</td></tr>";
    }
};

// =======================================================
// 5. RENDERIZADO Y FILTROS
// =======================================================
window.renderizarTablaCreditos = function() {
    const tbody = document.getElementById('tabla-creditos-body');
    if(!tbody) return;
    tbody.innerHTML = '';

    // Filtro local por texto
    const inputBusqueda = document.getElementById('buscador-creditos');
    const busqueda = inputBusqueda ? inputBusqueda.value.toLowerCase() : '';
    
    const filtrados = creditosData.filter(c => 
        (c.codigo_prestamo || '').toLowerCase().includes(busqueda) ||
        (c.contraparte || '').toLowerCase().includes(busqueda)
    );

    if (filtrados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center">No se encontraron coincidencias.</td></tr>';
        return;
    }

    filtrados.forEach(c => {
        const tr = document.createElement('tr');
        
        // Lógica de Badges (Etiquetas de color)
        let tipoBadge = c.tipo_flujo === 'RECIBIDO' 
            ? '<span class="badge bg-red" style="color:#ef4444; background:#fee2e2"><i class="bx bx-down-arrow-alt"></i> Deuda</span>'
            : '<span class="badge bg-green" style="color:#16a34a; background:#dcfce7"><i class="bx bx-up-arrow-alt"></i> Cobranza</span>';
        
        let estadoBadge = c.estado === 'ACTIVO' 
            ? '<span class="badge bg-blue" style="color:#2563eb; background:#eff6ff">VIGENTE</span>' 
            : '<span class="badge bg-green" style="color:#16a34a; background:#dcfce7">PAGADO</span>';
            
        if(c.estado === 'ANULADO') estadoBadge = '<span class="badge bg-gray">ANULADO</span>';

        const simbolo = c.moneda === 'USD' ? '$' : 'S/';

        tr.innerHTML = `
            <td style="font-weight:bold; color:#64748b;">${c.codigo_prestamo}</td>
            <td>${tipoBadge}</td>
            <td>${c.contraparte || 'Desconocido'}</td>
            <td style="font-family:monospace; font-size:1.05rem;">${simbolo} ${parseFloat(c.monto_capital).toFixed(2)}</td>
            <td><small>${c.tasa_interes}% (${c.cuotas_pendientes} cuotas pend.)</small></td>
            <td style="font-weight:bold; color:${c.tipo_flujo==='RECIBIDO' ? '#ef4444':'#10b981'}">
                ${c.cuotas_pendientes > 0 ? c.cuotas_pendientes + ' Cuotas' : 'PAGADO'}
            </td>
            <td>${estadoBadge}</td>
            
            <td class="text-center">
                <i class='bx bxs-file-doc' style="color:#cbd5e1; font-size:1.2rem;"></i>
            </td>

            <td style="text-align:center; white-space:nowrap;">
                <button class="btn-icon" onclick="verDetallePrestamo(${c.id})" title="Ver Detalle">
                    <i class='bx bx-show'></i>
                </button>
                
                <button class="btn-icon" onclick="cargarDatosEditar(${c.id})" title="Editar">
                    <i class='bx bx-pencil'></i>
                </button>
                
                <button class="btn-icon" onclick="descargarPDFTabla(${c.id})" title="Descargar Contrato">
                    <i class='bx bxs-file-pdf'></i>
                </button>
                
                <button class="btn-icon" onclick="eliminarPrestamo(${c.id})" title="Eliminar" style="color:#ef4444;">
                    <i class='bx bx-trash'></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// Calcular Totales Superiores
function actualizarKpisResumen(data) {
    let porPagar = 0;
    let porCobrar = 0;

    data.forEach(c => {
        const monto = parseFloat(c.monto_capital); 
        // Solo sumamos lo que está ACTIVO
        if (c.estado === 'ACTIVO') {
            if (c.tipo_flujo === 'RECIBIDO') porPagar += monto;
            else porCobrar += monto;
        }
    });

    const elPagar = document.getElementById('kpi-total-pagar');
    const elCobrar = document.getElementById('kpi-total-cobrar');

    if(elPagar) elPagar.innerText = `S/ ${porPagar.toLocaleString('es-PE', {minimumFractionDigits: 2})}`;
    if(elCobrar) elCobrar.innerText = `S/ ${porCobrar.toLocaleString('es-PE', {minimumFractionDigits: 2})}`;
}

// =======================================================
// 6. GESTIÓN DE MODALES (ABRIR/CERRAR)
// =======================================================

// --- MODAL NUEVO/EDITAR ---
window.abrirModalNuevoCredito = async function() {
    prestamoIdEdicion = null; // Modo Crear
    document.getElementById('form-credito').reset();
    document.querySelector('#modal-credito h3').innerHTML = "<i class='bx bxs-bank'></i> Registrar Operación Financiera";
    document.getElementById('modal-credito').classList.add('active');
    
    const simRes = document.getElementById('simulation-result');
    if(simRes) simRes.classList.add('hidden'); // Ocultar simulador previo
    
    await cargarProveedoresSelect(); // Cargar lista de empresas
};

window.cerrarModalCredito = function() {
    document.getElementById('modal-credito').classList.remove('active');
    document.getElementById('form-credito').reset();
    const simRes = document.getElementById('simulation-result');
    if(simRes) simRes.classList.add('hidden');
};

// --- MODAL DETALLE (CRONOGRAMA) ---
window.cerrarModalDetalle = function() {
    document.getElementById('modal-detalle-credito').classList.remove('active');
};

// --- MODAL PAGO ---
window.cerrarModalPagoCuota = function() {
    document.getElementById('modal-pagar-cuota').classList.remove('active');
};

// Helper: Cargar Proveedores en Select
async function cargarProveedoresSelect() {
    const select = document.getElementById('cred-tercero');
    if(!select || select.options.length > 1) return; // Si ya tiene datos, no recargar

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/proveedores', { headers: { 'x-auth-token': token } });
        const data = await res.json();
        
        data.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.innerText = `${p.razon_social} (${p.ruc})`;
            select.appendChild(opt);
        });
    } catch (e) { console.error(e); }
}

// =======================================================
// 7. LÓGICA DE NEGOCIO (SIMULAR, GUARDAR, EDITAR)
// =======================================================

// A. SIMULAR (Previsualizar en Modal)
window.simularCronograma = async function() {
    const btn = document.querySelector('.simulation-trigger button');
    const originalTxt = btn.innerHTML;
    btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Calculando...";
    btn.disabled = true;

    const payload = {
        monto_capital: document.getElementById('cred-capital').value,
        tasa_interes: document.getElementById('cred-tasa').value,
        tipo_tasa: document.getElementById('cred-tipo-tasa').value,
        plazo_cuotas: document.getElementById('cred-plazo').value,
        periodo_gracia: document.getElementById('cred-gracia').value,
        fecha_inicio_pago: document.getElementById('cred-fecha-inicio').value,
        frecuencia: document.getElementById('cred-frecuencia').value
    };

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/prestamos/simular', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
            body: JSON.stringify(payload)
        });
        
        const data = await res.json();

        if (res.ok && Array.isArray(data)) {
            // Mostrar resultados en la tabla mini
            document.getElementById('simulation-result').classList.remove('hidden');
            const tbody = document.getElementById('sim-body');
            tbody.innerHTML = '';
            
            let totalInt = 0, totalPag = 0;
            data.forEach(r => {
                totalInt += parseFloat(r.interes);
                totalPag += parseFloat(r.cuota);
                tbody.innerHTML += `<tr><td>${r.numero}</td><td>${r.fecha}</td><td>${r.capital}</td><td>${r.interes}</td><td><b>${r.cuota}</b></td><td>${r.saldo}</td></tr>`;
            });
            
            document.getElementById('sim-cuota').innerText = "S/ " + data[0].cuota; // Aprox
            document.getElementById('sim-interes').innerText = "S/ " + totalInt.toFixed(2);
            document.getElementById('sim-total').innerText = "S/ " + totalPag.toFixed(2);

        } else {
            showToast(data.msg || "Error al simular", "error");
        }
    } catch (e) { console.error(e); } finally {
        btn.innerHTML = originalTxt; btn.disabled = false;
    }
};

// B. GUARDAR (Crear o Editar)
window.guardarCredito = async function() {
    const btn = document.querySelector('#modal-credito .btn-primary');
    btn.disabled = true;

    const payload = {
        tercero_id: document.getElementById('cred-tercero').value,
        tipo_flujo: document.querySelector('input[name="tipo_flujo"]:checked').value,
        moneda: document.getElementById('cred-moneda').value,
        monto_capital: document.getElementById('cred-capital').value,
        tasa_interes: document.getElementById('cred-tasa').value,
        tipo_tasa: document.getElementById('cred-tipo-tasa').value,
        plazo_cuotas: document.getElementById('cred-plazo').value,
        frecuencia: document.getElementById('cred-frecuencia').value,
        periodo_gracia: document.getElementById('cred-gracia').value,
        fecha_inicio_pago: document.getElementById('cred-fecha-inicio').value,
        banco: document.getElementById('cred-banco').value,
        cuenta: document.getElementById('cred-cuenta').value,
        // Datos Legales
        rep_nombre: document.getElementById('cred-rep-nombre').value,
        rep_dni: document.getElementById('cred-rep-dni').value,
        partida: document.getElementById('cred-partida').value
    };

    try {
        const token = localStorage.getItem('token');
        let url = '/api/prestamos';
        let method = 'POST';

        if (prestamoIdEdicion) {
            url = `/api/prestamos/${prestamoIdEdicion}`;
            method = 'PUT';
        }

        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast(prestamoIdEdicion ? "Actualizado correctamente" : "Préstamo creado", "success");
            cerrarModalCredito();
            initPrestamos(); // Recargar tabla
        } else {
            const err = await res.json();
            showToast(err.msg || "Error al guardar", "error");
        }
    } catch (e) {
        showToast("Error de conexión", "error");
    } finally {
        btn.disabled = false;
    }
};

// C. CARGAR DATOS PARA EDITAR (Llenar Modal)
window.cargarDatosEditar = async function(id) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/prestamos/${id}`, { headers: { 'x-auth-token': token } });
        const data = await res.json();
        
        if(!res.ok) throw new Error(data.msg);

        const d = data.datos; 
        prestamoIdEdicion = id; 

        // Abrir modal y cargar selects
        await cargarProveedoresSelect();
        document.getElementById('modal-credito').classList.add('active');
        document.querySelector('#modal-credito h3').innerText = "✏️ Editar Contrato y Datos";

        // Llenar campos
        document.getElementById('cred-tercero').value = d.tercero_id;
        // Check radio button
        const radio = document.querySelector(`input[name="tipo_flujo"][value="${d.tipo_flujo}"]`);
        if(radio) radio.checked = true;

        document.getElementById('cred-moneda').value = d.moneda;
        document.getElementById('cred-capital').value = d.monto_capital;
        document.getElementById('cred-tasa').value = d.tasa_interes;
        document.getElementById('cred-plazo').value = d.plazo_cuotas;
        document.getElementById('cred-frecuencia').value = d.frecuencia;
        document.getElementById('cred-fecha-inicio').value = d.fecha_inicio_pago.split('T')[0];
        document.getElementById('cred-banco').value = d.banco_destino || '';
        document.getElementById('cred-cuenta').value = d.numero_cuenta_destino || '';
        document.getElementById('cred-rep-nombre').value = d.representante_legal || '';
        document.getElementById('cred-rep-dni').value = d.dni_representante || '';
        document.getElementById('cred-partida').value = d.partida_registral || '';

    } catch (e) { showToast("Error al cargar datos", "error"); }
};

// =======================================================
// 8. DETALLE Y PAGO DE CUOTAS
// =======================================================
window.verDetallePrestamo = async function(id) {
    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/prestamos/${id}`, { headers: { 'x-auth-token': token } });
        const data = await res.json();

        if (res.ok) {
            detalleActual = data; 
            renderizarModalDetalle(data);
        } else {
            showToast("Error al cargar detalle", "error");
        }
    } catch (e) { console.error(e); }
};

function renderizarModalDetalle(data) {
    const head = data.datos;
    const cron = data.cronograma;
    const simbolo = head.moneda === 'USD' ? '$' : 'S/';

    document.getElementById('det-titulo').innerText = `${head.codigo_prestamo} - ${head.tipo_flujo}`;
    document.getElementById('det-cliente').innerText = head.razon_social || "Sin Nombre";
    document.getElementById('det-capital').innerText = `${simbolo} ${parseFloat(head.monto_capital).toFixed(2)}`;
    document.getElementById('det-tasa').innerText = `${head.tasa_interes}% (${head.tipo_tasa})`;
    
    let saldoReal = 0;
    cron.forEach(c => { if(c.estado !== 'PAGADO') saldoReal += parseFloat(c.cuota_total); });
    document.getElementById('det-saldo').innerText = `${simbolo} ${saldoReal.toFixed(2)}`;

    const tbody = document.getElementById('tabla-detalle-body');
    tbody.innerHTML = '';

    cron.forEach(getRow => {
        const tr = document.createElement('tr');
        const esPagado = getRow.estado === 'PAGADO';
        
        let btnAccion = esPagado 
            ? `<span class="badge bg-green"><i class='bx bx-check'></i> Pagado</span>` 
            : `<button class="btn-primary btn-sm" onclick="abrirModalPagoCuota(${getRow.id}, '${getRow.cuota_total}', ${getRow.numero_cuota})"><i class='bx bx-money'></i> Pagar</button>`;

        tr.innerHTML = `
            <td>${getRow.numero_cuota}</td>
            <td>${new Date(getRow.fecha_vencimiento).toLocaleDateString('es-PE')}</td>
            <td style="font-weight:bold">${simbolo} ${parseFloat(getRow.cuota_total).toFixed(2)}</td>
            <td style="color:#64748b">${parseFloat(getRow.capital_amortizado).toFixed(2)}</td>
            <td style="color:#64748b">${parseFloat(getRow.interes_periodo).toFixed(2)}</td>
            <td>${parseFloat(getRow.saldo_restante).toFixed(2)}</td>
            <td>${esPagado ? '<span class="badge bg-green">PAGADO</span>' : '<span class="badge bg-yellow">PENDIENTE</span>'}</td>
            <td>${btnAccion}</td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('modal-detalle-credito').classList.add('active');
}

// --- PAGO DE CUOTA ---
window.abrirModalPagoCuota = function(idCuota, monto, numero) {
    document.getElementById('pago-cuota-id').value = idCuota; // Input oculto
    document.getElementById('pago-cuota-txt').innerHTML = `Registrar pago de la <b>Cuota #${numero}</b> por <b>S/ ${monto}</b>`;
    document.getElementById('pago-cuota-fecha').valueAsDate = new Date();
    document.getElementById('modal-pagar-cuota').classList.add('active');
};

window.confirmarPagoCuota = async function() {
    const id = document.getElementById('pago-cuota-id').value;
    const fecha = document.getElementById('pago-cuota-fecha').value;
    const metodo = document.getElementById('pago-cuota-metodo').value;
    const operacion = document.getElementById('pago-cuota-operacion').value;

    const btn = document.querySelector('#modal-pagar-cuota .btn-primary');
    btn.disabled = true; btn.innerText = "Procesando...";

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/prestamos/cuota/${id}/pagar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
            body: JSON.stringify({ fecha_pago: fecha, metodo_pago: metodo, numero_operacion: operacion })
        });

        if (res.ok) {
            showToast("Cuota pagada correctamente", "success");
            cerrarModalPagoCuota();
            if (detalleActual) verDetallePrestamo(detalleActual.datos.id); // Recargar detalle
            initPrestamos(); // Recargar tabla principal
        } else {
            const data = await res.json();
            showToast(data.msg || "Error al pagar", "error");
        }
    } catch (e) { showToast("Error de conexión", "error"); } 
    finally { btn.disabled = false; btn.innerText = "Procesar Pago"; }
};

// =======================================================
// 9. DESCARGAS Y ELIMINACIÓN
// =======================================================

// DESCARGAR PDF (Botón en Modal Detalle)
window.imprimirContratoDetalle = async function() {
    if (!detalleActual) return;
    descargarPDFTabla(detalleActual.datos.id);
};

// DESCARGAR PDF (Botón en Tabla)
window.descargarPDFTabla = async function(id) {
    const token = localStorage.getItem('token');
    showToast("Generando PDF...", "info");
    
    try {
        const res = await fetch(`/api/prestamos/${id}/contrato`, {
            method: 'GET',
            headers: { 'x-auth-token': token }
        });
        if(res.ok) {
            const blob = await res.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Contrato_Prestamo_${id}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
        }
    } catch(e) { console.error(e); }
};

// ==========================================
// ELIMINAR CON MODAL (SIN ALERT)
// ==========================================

let idParaEliminar = null; // Variable temporal para guardar el ID

// 1. Esta función se llama desde el botón de basura en la tabla
window.eliminarPrestamo = function(id) {
    idParaEliminar = id; // Guardamos el ID
    document.getElementById('modal-confirmar-borrado').classList.add('active'); // Abrimos modal
};

// 2. Esta función se llama desde el botón "Sí, Eliminar" del modal
window.ejecutarEliminacion = async function() {
    if (!idParaEliminar) return;

    const btn = document.getElementById('btn-delete-confirm');
    const originalText = btn.innerHTML;
    
    // Efecto de carga
    btn.innerHTML = "<i class='bx bx-loader-alt bx-spin'></i> Borrando...";
    btn.disabled = true;

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/prestamos/${idParaEliminar}`, {
            method: 'DELETE',
            headers: { 'x-auth-token': token }
        });

        if (res.ok) {
            showToast("Préstamo eliminado correctamente", "success");
            initPrestamos(); // Recargar tabla
        } else {
            const data = await res.json();
            showToast(data.msg || "No se pudo eliminar", "error");
        }
    } catch (e) {
        console.error(e);
        showToast("Error de conexión", "error");
    } finally {
        // Cerrar y limpiar
        document.getElementById('modal-confirmar-borrado').classList.remove('active');
        btn.innerHTML = originalText;
        btn.disabled = false;
        idParaEliminar = null;
    }
};

// 3. Cerrar el modal si se arrepiente
window.cerrarModalConfirmar = function() {
    document.getElementById('modal-confirmar-borrado').classList.remove('active');
    idParaEliminar = null;
};

// =======================================================
// 10. SIMULADOR PESTAÑA (TAB)
// =======================================================
window.calcularSimulacionTab = async function() {
    const btn = document.querySelector('#tab-simulador button');
    const originalTxt = btn.innerHTML;
    btn.innerHTML = "..."; btn.disabled = true;

    const payload = {
        monto_capital: document.getElementById('sim-tab-capital').value,
        tasa_interes: document.getElementById('sim-tab-tasa').value,
        tipo_tasa: document.getElementById('sim-tab-tipo-tasa').value,
        plazo_cuotas: document.getElementById('sim-tab-plazo').value,
        periodo_gracia: document.getElementById('sim-tab-gracia').value,
        fecha_inicio_pago: new Date().toISOString().slice(0,10),
        frecuencia: 'MENSUAL'
    };

    try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/prestamos/simular', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        
        if(res.ok) {
            document.getElementById('sim-tab-resultado').classList.remove('hidden');
            const tbody = document.getElementById('res-tab-body');
            tbody.innerHTML = '';
            let totInt = 0, totPag = 0;
            data.forEach(r => {
                totInt += parseFloat(r.interes);
                totPag += parseFloat(r.cuota);
                tbody.innerHTML += `<tr><td>${r.numero}</td><td>${r.capital}</td><td>${r.interes}</td><td>${r.cuota}</td><td>${r.saldo}</td></tr>`;
            });
            document.getElementById('res-tab-cuota').innerText = data[0].cuota;
            document.getElementById('res-tab-interes').innerText = totInt.toFixed(2);
            document.getElementById('res-tab-total').innerText = totPag.toFixed(2);
        }
    } catch(e) { console.error(e); } 
    finally { btn.innerHTML = originalTxt; btn.disabled = false; }
};