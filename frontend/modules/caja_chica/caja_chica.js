(function() {
    console.log("Modulo Caja Chica Mejorado 🚀");

    const categoriasIngreso = ["Reposición de Fondos", "Abono Inicial", "Devolución de Compra", "Otros Ingresos"];
    const categoriasGasto = ["Transporte / Taxi", "Alimentación", "Útiles de Aseo", "Material de Oficina", "Mantenimiento", "Pago de Servicios", "Otros Gastos"];

    async function init() {
        // Lógica de filtro admin
        const userStr = localStorage.getItem('user');
        if (userStr) {
            const user = JSON.parse(userStr);
            // Si es admin, mostramos el filtro y cargamos las sedes
            if(user.rol === 'superadmin' || user.rol === 'admin' || user.rol === 'gerente') {
                const filtro = document.getElementById('filtro-sede-chica');
                if(filtro) {
                    filtro.style.display = 'block';
                    await cargarSedesAdmin(); // 🔥 AHORA SÍ EXISTE ESTA FUNCIÓN
                }
            }
        }
        await cargarCajaChica();
    }

    // 🔥 FUNCIÓN QUE FALTABA: Cargar lista de sedes en el select
    async function cargarSedesAdmin() {
        const select = document.getElementById('filtro-sede-chica');
        if(!select) return;

        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/sedes', { headers: { 'x-auth-token': token } });
            
            if(res.ok) {
                const sedes = await res.json();
                select.innerHTML = '<option value="">🏢 Todas las Sedes</option>';
                
                sedes.forEach(s => {
                    const opt = document.createElement('option');
                    opt.value = s.id;
                    opt.innerText = `📍 ${s.nombre}`;
                    select.appendChild(opt);
                });
            }
        } catch (e) { console.error("Error cargando sedes para filtro:", e); }
    }

    window.cargarCajaChica = async function() {
        try {
            const token = localStorage.getItem('token');
            const select = document.getElementById('filtro-sede-chica');
            const sedeId = select ? select.value : ''; // Si no existe el select, manda vacío
            
            // Usamos encodeURIComponent para evitar errores si llega undefined
            const url = `/api/caja-chica?sede=${sedeId || ''}`;
            
            const res = await fetch(url, {
                headers: { 'x-auth-token': token }
            });

            if(res.ok) {
                const data = await res.json();
                
                // Actualizar Saldo
                const saldoEl = document.getElementById('lbl-saldo-chica');
                if(saldoEl) {
                    saldoEl.innerText = `S/ ${parseFloat(data.saldo).toFixed(2)}`;
                    // Si hay poco dinero (menos de 20 soles), ponerlo rojizo suave, sino blanco
                    saldoEl.style.color = data.saldo < 20 ? '#fca5a5' : '#ffffff'; 
                }

                // Renderizar Tabla
                const tbody = document.getElementById('tabla-chica-body');
                if(tbody) {
                    tbody.innerHTML = '';
                    
                    if(data.movimientos.length === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">Sin movimientos registrados.</td></tr>';
                        return;
                    }

                    data.movimientos.forEach(m => {
                        const esIngreso = m.tipo_movimiento === 'INGRESO';
                        const color = esIngreso ? '#16a34a' : '#dc2626';
                        const signo = esIngreso ? '+' : '-';
                        const bg = esIngreso ? '#dcfce7' : '#fee2e2';
                        const icon = esIngreso ? 'bx-down-arrow-circle' : 'bx-up-arrow-circle';

                        tbody.innerHTML += `
                            <tr>
                                <td>
                                    <div style="font-weight:600; color:#374151;">${new Date(m.fecha_registro).toLocaleDateString()}</div>
                                    <div style="font-size:12px; color:#9ca3af;">${new Date(m.fecha_registro).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                                </td>
                                <td><span class="badge" style="background:${bg}; color:${color}; font-weight:700;"><i class='bx ${icon}'></i> ${m.tipo_movimiento}</span></td>
                                <td><span style="font-weight:600; color:#4b5563; background:#f3f4f6; padding:4px 10px; border-radius:10px; font-size:12px;">${m.categoria || 'General'}</span></td>
                                <td>${m.descripcion}</td>
                                <td style="color:${color}; font-weight:800; font-size:15px;">${signo} S/ ${parseFloat(m.monto).toFixed(2)}</td>
                                <td>
                                    <div style="font-size:13px; font-weight:600;">${m.usuario_nombre}</div>
                                    <div style="font-size:11px; color:#9ca3af;">${m.sede_nombre}</div>
                                </td>
                            </tr>
                        `;
                    });
                }
            }
        } catch (e) { console.error("Error cargando data:", e); }
    }

    // --- MODALES Y LÓGICA DE CATEGORÍAS ---
    window.abrirModalChica = function(tipo) {
        const modalTitulo = document.getElementById('modal-chica-titulo');
        const badge = document.getElementById('badge-tipo-movimiento');
        const selectCat = document.getElementById('chica-categoria');
        
        document.getElementById('chica-tipo').value = tipo;
        selectCat.innerHTML = ''; // Limpiar categorías

        if (tipo === 'INGRESO') {
            modalTitulo.innerText = "Registrar Ingreso de Dinero";
            badge.innerText = "🟢 INGRESO (Aumenta el saldo)";
            badge.className = "badge-lg badge-ingreso";
            
            categoriasIngreso.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat; opt.text = cat;
                selectCat.appendChild(opt);
            });

        } else {
            modalTitulo.innerText = "Registrar Gasto Operativo";
            badge.innerText = "🔴 GASTO (Disminuye el saldo)";
            badge.className = "badge-lg badge-gasto";

            categoriasGasto.forEach(cat => {
                const opt = document.createElement('option');
                opt.value = cat; opt.text = cat;
                selectCat.appendChild(opt);
            });
        }

        document.getElementById('modal-chica').classList.add('active');
    }

    window.cerrarModalChica = function() {
        document.getElementById('modal-chica').classList.remove('active');
        document.getElementById('form-chica').reset();
    }

    // --- GUARDAR ---
    const form = document.getElementById('form-chica');
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const btnSubmit = form.querySelector('button[type="submit"]');
            const originalText = btnSubmit.innerText;
            btnSubmit.disabled = true;
            btnSubmit.innerText = "Guardando...";

            const data = {
                tipo: document.getElementById('chica-tipo').value,
                monto: document.getElementById('chica-monto').value,
                descripcion: document.getElementById('chica-desc').value,
                categoria: document.getElementById('chica-categoria').value
            };

            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/caja-chica', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                    body: JSON.stringify(data)
                });

                if(res.ok) {
                    alert("✅ Movimiento registrado con éxito");
                    cerrarModalChica();
                    cargarCajaChica();
                } else {
                    alert("❌ Error al registrar");
                }
            } catch (e) { console.error(e); }
            finally {
                btnSubmit.disabled = false;
                btnSubmit.innerText = originalText;
            }
        });
    }

    init();
})();