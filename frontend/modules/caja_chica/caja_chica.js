(function() {

    let currentPage = 1;
    const ITEMS_PER_PAGE = 8;
    // 🛡️ Variable de control para blindaje de saldo (Añadir debajo de categoriasGasto)
    let saldoDisponibleActual = 0;
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
    // --- CARGAR CAJA CHICA (CON PAGINACIÓN INTEGRADA) ---
    window.cargarCajaChica = async function() {
        try {
            const token = localStorage.getItem('token');
            const select = document.getElementById('filtro-sede-chica');
            const sedeId = select ? select.value : ''; 
            
            const url = `/api/caja-chica?sede=${sedeId || ''}`;
            
            const res = await fetch(url, {
                headers: { 'x-auth-token': token }
            });

            if(res.ok) {
                const data = await res.json();
                
                // 🛡️ ACTUALIZACIÓN CRÍTICA: Guardamos el saldo para validación preventiva
                saldoDisponibleActual = parseFloat(data.saldo || 0);

                // Actualizar Saldo Visual
                const saldoCard = document.querySelector('.saldo-card');
                const saldoEl = document.getElementById('lbl-saldo-chica');
                if(saldoEl && saldoCard) {
                    saldoEl.innerText = `S/ ${saldoDisponibleActual.toFixed(2)}`;
                    
                    // 🚨 BLINDAJE: Si el saldo es menor a 200, activar parpadeo divertido
                    if (saldoDisponibleActual < 200) {
                        saldoCard.classList.add('low-balance-alert');
                        console.log("⚠️ ¡Caja agonizando! Saldo bajo 200.");
                    } else {
                        saldoCard.classList.remove('low-balance-alert');
                    }
                }

                // Renderizar Tabla con Paginación
                const tbody = document.getElementById('tabla-chica-body');
                if(tbody) {
                    tbody.innerHTML = '';
                    
                    const movimientos = data.movimientos || [];
                    const totalItems = movimientos.length;

                    if(totalItems === 0) {
                        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:20px; color:#999;">Sin movimientos registrados.</td></tr>';
                        renderizarPaginacionChica(0); // Limpiar paginación si no hay datos
                        return;
                    }

                    // Lógica para recortar los datos por página
                    // currentPage y ITEMS_PER_PAGE deben estar definidos al inicio del archivo
                    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
                    const endIndex = startIndex + ITEMS_PER_PAGE;
                    const dataToRender = movimientos.slice(startIndex, endIndex);

                    dataToRender.forEach(m => {
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

                    // Llamamos a la función para pintar los botones de página
                    renderizarPaginacionChica(totalItems);
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

    // --- RENDERIZAR BOTONES DE PAGINACIÓN ---
    function renderizarPaginacionChica(totalItems) {
        const contenedor = document.getElementById('caja-paginacion');
        if (!contenedor) return;

        const totalPaginas = Math.ceil(totalItems / ITEMS_PER_PAGE);

        if (totalPaginas <= 1) {
            contenedor.innerHTML = '';
            return;
        }

        contenedor.innerHTML = `
            <div class="pagination-wrapper" style="display:flex; align-items:center; gap:10px; background:#f8fafc; padding:8px 15px; border-radius:50px; border:1px solid #e2e8f0;">
                <span style="font-size:12px; color:#64748b;">Pág <b>${currentPage}</b> de ${totalPaginas}</span>
                <div style="display:flex; gap:5px;">
                    <button onclick="cambiarPaginaChica(-1)" ${currentPage === 1 ? 'disabled' : ''} 
                        style="border:none; background:transparent; cursor:pointer; font-size:20px; color:${currentPage === 1 ? '#cbd5e1' : '#6366f1'};">
                        <i class='bx bx-chevron-left'></i>
                    </button>
                    <button onclick="cambiarPaginaChica(1)" ${currentPage === totalPaginas ? 'disabled' : ''} 
                        style="border:none; background:transparent; cursor:pointer; font-size:20px; color:${currentPage === totalPaginas ? '#cbd5e1' : '#6366f1'};">
                        <i class='bx bx-chevron-right'></i>
                    </button>
                </div>
            </div>
        `;
    }

    // --- FUNCIÓN PARA CAMBIAR DE PÁGINA ---
    window.cambiarPaginaChica = function(delta) {
        currentPage += delta;
        cargarCajaChica(); // Recargamos para mostrar los siguientes 10
    };

    window.cambiarPaginaChica = function(delta) {
        currentPage += delta;
        cargarCajaChica();
    };

// --- GUARDAR (BLINDAJE TOTAL E INDEPENDIENTE) ---
    const form = document.getElementById('form-chica');
    if(form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const tipo = document.getElementById('chica-tipo').value;
            const montoStr = document.getElementById('chica-monto').value;
            const monto = parseFloat(montoStr);
            const descripcion = document.getElementById('chica-desc').value;
            const categoria = document.getElementById('chica-categoria').value;

            // 🛡️ Validación de saldo con Notificación Local
            if (tipo === 'GASTO' && monto > saldoDisponibleActual) {
                const msg = `Saldo Insuficiente. Intentas gastar S/ ${monto.toFixed(2)} pero solo hay S/ ${saldoDisponibleActual.toFixed(2)}.`;
                ejecutarNotificacionLocal("error", msg);
                return;
            }

            const btnSubmit = form.querySelector('button[type="submit"]');
            const originalText = btnSubmit.innerText;
            btnSubmit.disabled = true;
            btnSubmit.innerText = "Guardando...";

            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/caja-chica', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
                    body: JSON.stringify({ tipo, monto, descripcion, categoria })
                });

                const responseData = await res.json();

                // --- DENTRO DEL EVENTO SUBMIT DEL FORMULARIO ---
                if(res.ok) {
                    cerrarModalChica();
                    await cargarCajaChica(); // Aquí se actualiza saldoDisponibleActual

                    let mensajeFinal = "";
                    
                    // 💀 CASO CRÍTICO: SE QUEDÓ EN CERO
                    if (saldoDisponibleActual <= 0) {
                        mensajeFinal = `¡TE LO DIJE! 😭 Nos quedamos en S/ 0.00. ¡Estamos en la quiebra técnica! 🚩 Llama a Contabilidad, ¡Marioooo! 🆘💸`;
                    } 
                    // 💰 CASO: INGRESO DE DINERO
                    else if (tipo === 'INGRESO') {
                        mensajeFinal = `¡Rico, rico! 🤑 Entraron S/ ${monto.toFixed(2)}. ¡Cuidalos bien que estamos a las justas! ✨🥳`;
                    } 
                    // 💸 CASO: GASTO NORMAL
                    else {
                        mensajeFinal = `¡Auuch! 💸 S/ ${monto.toFixed(2)} se nos fueron. ¡Me dolió , no gastes tanto que aún me duele! 😂💔`;
                        
                        // Si el saldo es bajo (< 200) pero no es cero
                        if (saldoDisponibleActual < 200) {
                            mensajeFinal += `\n\n⚠️ ¡Oye! Solo quedan S/ ${saldoDisponibleActual.toFixed(2)}. ¡Pide reposición ya mismo antes de que muera! 😱`;
                        }
                    }

                    // Mostrar el modal con el nuevo mensaje
                    ejecutarNotificacionLocal("success", mensajeFinal);
                } else {
                    ejecutarNotificacionLocal("error", responseData.msg || "No se pudo registrar el movimiento");
                }
            } catch (e) { 
                console.error("Error en la petición:", e);
                ejecutarNotificacionLocal("error", "Error de conexión al servidor. Revisa tu internet.");
            }
            finally {
                btnSubmit.disabled = false;
                btnSubmit.innerText = originalText;
            }
        });
    }

    function ejecutarNotificacionLocal(tipo, mensaje) {
        const modalId = (tipo === "success") ? "modal-success" : "modal-error";
        const msgId = (tipo === "success") ? "success-msg" : "error-msg";
        
        const modal = document.getElementById(modalId);
        const texto = document.getElementById(msgId);

        if (modal && texto) {
            texto.innerText = mensaje;
            modal.classList.add('active');
            
            // 🕒 Tiempo extendido (10 segundos) si el saldo es cero para que lean el drama
            const tiempo = (saldoDisponibleActual <= 0) ? 12000 : 9000;

            // Limpiar cualquier timeout previo si existiera
            if (window.timerModal) clearTimeout(window.timerModal);

            window.timerModal = setTimeout(() => {
                modal.classList.remove('active');
            }, tiempo);
        }
    }

    // --- 4. SISTEMA DE MODALES PERSONALIZADOS ---
    window.mostrarExitoChica = function(mensaje) {
        const modal = document.getElementById('modal-success');
        const msgEl = document.getElementById('success-msg');
        if (modal && msgEl) {
            msgEl.innerText = mensaje;
            modal.classList.add('active');
        } else {
            console.log("✅ Éxito:", mensaje);
        }
    };

    window.mostrarErrorChica = function(mensaje) {
        const modal = document.getElementById('modal-error');
        const msgEl = document.getElementById('error-msg');
        if (modal && msgEl) {
            msgEl.innerText = mensaje;
            modal.classList.add('active');
        } else {
            console.error("❌ Error:", mensaje);
        }
    };

    init();
})();