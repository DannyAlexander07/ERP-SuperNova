// Ubicacion: SuperNova/frontend/modules/caja/caja.js

(function() {
    console.log("Modulo Caja Financiera Activo 💵");

    async function initCaja() {
        await cargarResumen();
        await cargarMovimientos();
    }

    // 1. CARGAR RESUMEN (TARJETAS DE ARRIBA)
    async function cargarResumen() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/caja/resumen', { headers: { 'x-auth-token': token } });
            if(res.ok) {
                const data = await res.json();
                
                // Formatear a Soles
                document.getElementById('kpi-ingresos').innerText = `S/ ${parseFloat(data.ingresos).toFixed(2)}`;
                document.getElementById('kpi-egresos').innerText = `S/ ${parseFloat(data.egresos).toFixed(2)}`;
                
                const saldo = parseFloat(data.saldo);
                const elSaldo = document.getElementById('kpi-saldo');
                elSaldo.innerText = `S/ ${saldo.toFixed(2)}`;
                elSaldo.style.color = saldo >= 0 ? '#16a34a' : '#dc2626'; // Verde o Rojo
            }
        } catch (e) { console.error(e); }
    }

// 2. CARGAR TABLA (VERSIÓN CORREGIDA: FECHA + HORA)
    async function cargarMovimientos() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/caja', { headers: { 'x-auth-token': token } });
            
            const tbody = document.getElementById('tabla-caja-body');
            tbody.innerHTML = '';

            if(res.ok) {
                const movimientos = await res.json();
                if(movimientos.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px">Sin movimientos hoy.</td></tr>';
                    return;
                }

                movimientos.forEach(m => {
                    const tr = document.createElement('tr');
                    
                    // 🚨 CAMBIO AQUÍ: Formateamos Fecha Y Hora
                    const fechaObj = new Date(m.fecha_registro);
                    const fechaStr = fechaObj.toLocaleDateString(); // ej: 25/10/2023
                    const horaStr = fechaObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}); // ej: 01:21 p.m.
                    
                    const esIngreso = m.tipo_movimiento === 'INGRESO';
                    const claseBadge = esIngreso ? 'badge-ingreso' : 'badge-egreso';
                    const colorMonto = esIngreso ? '#16a34a' : '#dc2626';
                    const signo = esIngreso ? '+' : '-';

                    // En la primera columna ponemos Fecha arriba y Hora abajo chiquita
                    tr.innerHTML = `
                        <td>
                            <div style="font-weight:600">${fechaStr}</div>
                            <div style="font-size:12px; color:#666">${horaStr}</div>
                        </td>
                        <td><span class="${claseBadge}">${m.tipo_movimiento}</span></td>
                        <td>
                            <strong>${m.origen || 'General'}</strong>
                            <br><small style="color:#666">${m.descripcion || ''}</small>
                        </td>
                        <td>${m.metodo_pago}</td>
                        <td style="font-weight:bold; font-size:15px; color:${colorMonto}">${signo} S/ ${parseFloat(m.monto).toFixed(2)}</td>
                        <td style="font-size:12px">${m.usuario}</td>
                    `;
                    tbody.appendChild(tr);
                });
            }
        } catch (e) { console.error(e); }
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
                    initCaja(); // Recargar todo
                } else {
                    alert("❌ Error al registrar");
                }
            } catch (e) { console.error(e); }
        });
    }

    // MODALES
    window.abrirModalMovimiento = function() {
        document.getElementById('modal-caja').classList.add('active');
        document.getElementById('form-caja').reset();
    }
    window.cerrarModalCaja = function() {
        document.getElementById('modal-caja').classList.remove('active');
    }

    // INICIO
    initCaja();

})();