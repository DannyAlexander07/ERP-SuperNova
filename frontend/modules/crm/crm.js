(function() {

console.log("Modulo CRM Cargado y Conectado");

let leadsData = []; 

function mapEstadoToColumna(estadoDB) {
    if (estadoDB === 'nuevo' || estadoDB === 'cotizado' || estadoDB === 'señal_pagada' || estadoDB === 'reservado') {
        return 'nuevo';
    }
    if (estadoDB === 'contactado' || estadoDB === 'seguimiento') {
        return 'contactado';
    }
    // Incluye 'celebrado', 'cancelado', 'perdido', etc.
    return 'cerrado';
}
    
const KANBAN_ESTADOS_SIMPLIFICADOS = ['nuevo', 'contactado', 'cerrado']; 

async function initCRM() {
    leadsData = [];
    KANBAN_ESTADOS_SIMPLIFICADOS.forEach(estado => {
        const lista = document.getElementById(`list-${estado}`);
        const contador = document.getElementById(`count-${estado}`);
        if(lista) lista.innerHTML = '';
        if(contador) contador.innerText = '0';
    });

    try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await fetch('/api/crm', { headers: { 'x-auth-token': token } });
        const data = await res.json();

        if (res.ok) {
            leadsData = data.map(l => { 
                let fechaMostrar = "Sin fecha";
                let fechaRaw = null;
                let horaInicio = l.hora_inicio ? l.hora_inicio.substring(0, 5) : '16:00';
                let horaFin = l.hora_fin ? l.hora_fin.substring(0, 5) : '19:00';

                if (l.fecha_tentativa) {
                    const f = new Date(l.fecha_tentativa);
                    fechaRaw = l.fecha_tentativa;
                    const dia = String(f.getDate()).padStart(2,'0');
                    const mes = String(f.getMonth()+1).padStart(2,'0');
                    fechaMostrar = `${dia}/${mes} ${horaInicio}`;
                }

                return {
                    id: String(l.id),
                    nombre: l.nombre_apoderado,
                    telefono: l.telefono,
                    email: l.email || '',
                    origen: l.canal_origen,
                    hijo: l.nombre_hijo,
                    sede: l.sede_interes, 
                    estado: mapEstadoToColumna(l.estado),
                    fechaRaw: fechaRaw, 
                    fechaVisual: fechaMostrar,
                    notas: l.notas || '',
                    
                    // 🚨 CORRECCIÓN 1: Guardamos AMBOS datos (Texto e ID)
                    sala_nombre: l.sala_interes, 
                    salon_id: l.salon_id, // Necesario para el select

                    paquete: l.paquete_interes,
                    valor: l.valor_estimado,
                    hora_inicio: horaInicio, 
                    hora_fin: horaFin,
                };
            });
            renderKanban(); 
        }
    } catch (error) {
        console.error("Error CRM:", error);
    }
}

function renderKanban() {
    const KANBAN_ESTADOS_SIMPLIFICADOS = ['nuevo', 'contactado', 'cerrado'];
    
    KANBAN_ESTADOS_SIMPLIFICADOS.forEach(estado => {
        const lista = document.getElementById(`list-${estado}`);
        const contador = document.getElementById(`count-${estado}`);
        if(lista) lista.innerHTML = '';
        if(contador) contador.innerText = '0';
    });

    leadsData.forEach(lead => {
        const card = document.createElement('div');
        card.className = 'lead-card';
        card.draggable = true;
        card.id = lead.id;
        
        let originIcon = 'bx-globe';
        let originClass = 'badge-web';
        if(lead.origen === 'WhatsApp') { originIcon = 'bxl-whatsapp'; originClass = 'badge-whatsapp'; }
        else if(lead.origen === 'Facebook') { originIcon = 'bxl-facebook'; originClass = 'badge-facebook'; }
        else if(lead.origen === 'Instagram') { originIcon = 'bxl-instagram'; originClass = 'badge-instagram'; }

        card.innerHTML = `
            <div class="card-header">
                <h4 class="card-title" style="cursor:pointer" data-id="${lead.id}">${lead.nombre}</h4>
                <span class="origin-badge ${originClass}">
                    <i class='bx ${originIcon}'></i> ${lead.origen}
                </span>
            </div>
            <div class="card-body">
                <div class="card-detail">
                    <i class='bx bx-cake'></i> ${lead.hijo ? lead.hijo : '-'}
                </div>
                <div class="card-detail">
                    <i class='bx bx-phone'></i> ${lead.telefono}
                </div>
            </div>
            <div class="card-footer">
                <span class="lead-time" style="font-size: 11px;"><i class='bx bx-time'></i> ${lead.fechaVisual}</span>
                <div class="card-actions">
                    <button class="btn-quick-action edit-btn" data-id="${lead.id}"><i class='bx bx-edit-alt'></i></button>
                    <button class="btn-quick-action delete-btn" data-id="${lead.id}"><i class='bx bx-trash'></i></button>
                    <a href="https://wa.me/51${lead.telefono.replace(/\D/g,'')}" target="_blank" class="btn-quick-action wsp">
                        <i class='bx bxl-whatsapp'></i>
                    </a>
                </div>
            </div>
        `;

        card.addEventListener('dragstart', dragStart);
        card.addEventListener('dragend', dragEnd);

        const btnEdit = card.querySelector('.edit-btn');
        btnEdit.onclick = () => editarLead(lead.id);

        const btnDelete = card.querySelector('.delete-btn');
        btnDelete.onclick = () => eliminarLead(lead.id);

        const title = card.querySelector('.card-title');
        title.onclick = () => editarLead(lead.id);

        const col = document.getElementById(`list-${lead.estado}`);
        if(col) {
            col.appendChild(card);
            const count = document.getElementById(`count-${lead.estado}`);
            count.innerText = parseInt(count.innerText) + 1;
        }
    });
}

function dragStart(e) {
    e.dataTransfer.setData('text/plain', e.target.id);
    setTimeout(() => e.target.classList.add('dragging'), 0);
}

function dragEnd(e) {
    e.target.classList.remove('dragging');
    actualizarContadores();
}

// 🚨 CORRECCIÓN 2: Función editarLead ASÍNCRONA (async/await)
window.editarLead = async function(id) {
    const lead = leadsData.find(l => l.id === id); 
    if (!lead) return;

    window.abrirModalLead();
    document.querySelector('.modal-header h3').innerText = "Editar Prospecto";
    
    document.getElementById('lead-id').value = lead.id; 
    document.getElementById('lead-nombre').value = lead.nombre;
    document.getElementById('lead-telefono').value = lead.telefono;
    document.getElementById('lead-email').value = lead.email;
    document.getElementById('lead-canal').value = lead.origen || 'WhatsApp';
    document.getElementById('lead-hijo').value = lead.hijo || '';
    
    // Set Sede
    document.getElementById('lead-sede').value = lead.sede || ''; 
    
    document.getElementById('lead-obs').value = lead.notas || '';
    document.getElementById('lead-paquete').value = lead.paquete || '';
    document.getElementById('lead-valor').value = lead.valor || '';
    
    if (lead.fechaRaw) {
        const fechaBase = lead.fechaRaw.substring(0, 10);
        document.getElementById('lead-fecha').value = fechaBase;
    } else {
        document.getElementById('lead-fecha').value = '';
    }

    document.getElementById('lead-hora-inicio').value = lead.hora_inicio || '16:00';
    document.getElementById('lead-hora-fin').value = lead.hora_fin || '19:00';

    // 🚨 EL FIX PRINCIPAL: Esperamos a que carguen las salas antes de seleccionar
    if(lead.sede) {
        // Primero cargamos las salas y ESPERAMOS (await)
        await window.cargarSalasPorSede(); 
        
        // Una vez cargadas, seleccionamos usando el ID (salon_id)
        if(lead.salon_id) {
             document.getElementById('lead-sala').value = lead.salon_id;
        }
    } else {
        document.getElementById('lead-sala').disabled = true;
    }

    const btnCobrar = document.getElementById('btn-cobrar-saldo');
    if(btnCobrar) {
        if (lead.estado !== 'cerrado') {
            btnCobrar.style.display = 'inline-block'; 
        } else {
            btnCobrar.style.display = 'none'; 
        }
    }
}

// 🚨 CORRECCIÓN 3: cargarSalasPorSede retorna Promesa
window.cargarSalasPorSede = async function() {
    const sedeId = document.getElementById('lead-sede').value;
    const salaSelect = document.getElementById('lead-sala');
    
    salaSelect.innerHTML = '<option value="">Cargando...</option>';
    salaSelect.disabled = true;

    if (!sedeId) {
        salaSelect.innerHTML = '<option value="">← Elige sede primero</option>';
        return; // Retorna void, que es una promesa resuelta
    }
    
    try {
        const token = localStorage.getItem('token');
        // Este endpoint DEBE existir
        const res = await fetch(`/api/sedes/salones/${sedeId}`, { headers: { 'x-auth-token': token } });
        
        if (!res.ok) throw new Error('Error al cargar salas');

        const salas = await res.json(); 

        salaSelect.innerHTML = '<option value="">Seleccionar Sala</option>';
        salas.forEach(sala => {
            const opt = document.createElement('option');
            opt.value = sala.id; // VALUE es el ID
            opt.textContent = sala.nombre; // TEXT es el nombre
            salaSelect.appendChild(opt);
        });
        salaSelect.disabled = false;

    } catch (error) {
        console.error("Error cargando salas:", error);
        salaSelect.innerHTML = '<option value="">Error al cargar salas</option>';
    }
}

window.abrirModalLead = function() {
    document.getElementById('lead-id').value = '';
    document.querySelector('.modal-header h3').innerText = "Nuevo Prospecto";
    document.getElementById('lead-fecha').value = '';
    document.getElementById('lead-hora-inicio').value = '16:00';
    document.getElementById('lead-hora-fin').value = '19:00';
    document.getElementById('lead-sede').value = '';
    document.getElementById('lead-sala').innerHTML = '<option value="">← Elige sede primero</option>';
    document.getElementById('lead-sala').disabled = true;
    
    document.getElementById('modal-lead').classList.add('active'); 
    
    // Reset manual seguro
    document.getElementById('lead-nombre').value = '';
    document.getElementById('lead-telefono').value = '';
    document.getElementById('lead-email').value = '';
    document.getElementById('lead-hijo').value = '';
    document.getElementById('lead-obs').value = '';
    document.getElementById('lead-valor').value = '';
    
    const btnCobrar = document.getElementById('btn-cobrar-saldo');
    if(btnCobrar) btnCobrar.style.display = 'none';
}

window.cerrarModalLead = function() {
    document.getElementById('modal-lead').classList.remove('active'); 
}

window.guardarLead = async function() {
    const leadId = document.getElementById('lead-id').value;
    const nombre = document.getElementById('lead-nombre').value;
    const telefono = document.getElementById('lead-telefono').value;
    
    if(!nombre || !telefono) {
        showToast("Nombre y Teléfono son obligatorios", "error");
        return;
    }

    const fechaInput = document.getElementById('lead-fecha').value;
    const horaInicioInput = document.getElementById('lead-hora-inicio').value; 
    const horaFinInput = document.getElementById('lead-hora-fin').value; 
    
    let fechaTentativaFinal = null;
    let horaInicioFinal = null;
    let horaFinFinal = null;

    if (fechaInput) {
        fechaTentativaFinal = fechaInput; 
        horaInicioFinal = horaInicioInput || '16:00';
        horaFinFinal = horaFinInput || '19:00';
    }

    const sedeValue = document.getElementById('lead-sede').value;
    const salonValue = document.getElementById('lead-sala').value;

    const leadData = {
        nombre_apoderado: nombre,
        telefono: telefono,
        email: document.getElementById('lead-email').value,
        canal_origen: document.getElementById('lead-canal').value,
        nombre_hijo: document.getElementById('lead-hijo').value,
        fecha_tentativa: fechaTentativaFinal, 
        hora_inicio: horaInicioFinal, 
        hora_fin: horaFinFinal,
        notas: document.getElementById('lead-obs').value,
        
        sede_interes: sedeValue ? parseInt(sedeValue) : null,
        salon_id: salonValue ? parseInt(salonValue) : null, // Enviamos ID
        
        paquete_interes: document.getElementById('lead-paquete').value, 
        valor_estimado: document.getElementById('lead-valor').value || 0 
    };
    
    try {
        const token = localStorage.getItem('token');
        let url = '/api/crm';
        let method = 'POST';

        if (leadId) {
            url = `/api/crm/${leadId}`; 
            method = 'PUT'; 
        }
        
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
            body: JSON.stringify(leadData)
        });

        if(res.ok) {
            const data = await res.json();
            showToast(data.msg || "Guardado correctamente", "success");
            await initCRM(); 
            window.cerrarModalLead();
        } else {
            const errData = await res.json();
            showToast(`Error al guardar: ${errData.msg || 'Desconocido'}`, "error");
        }
    } catch (error) {
        showToast("Error de conexión con el servidor.", "error");
    }
}

window.eliminarLead = async function(id) {
    if (!(await showConfirm("¿Eliminar este Lead? Se cancelará el evento asociado."))) return;

    try {
        const token = localStorage.getItem('token');
        
        const res = await fetch(`/api/crm/${id}`, {
            method: 'DELETE',
            headers: { 'x-auth-token': token }
        });
        
        if(res.ok) {
            initCRM();
            showToast("Lead eliminado.", "success");
        } else {
            const errorData = await res.json();
            showToast(`Error: ${errorData.msg || 'Desconocido'}`, "error");
        }
    } catch (e) { 
        showToast("Error de conexión.", "error");
    }
}

window.allowDrop = function(e) {
    e.preventDefault();
    const col = e.currentTarget.querySelector('.column-body');
    if(col) col.classList.add('drag-over');
}

window.drop = async function(e) {
    e.preventDefault();
    const leadId = e.dataTransfer.getData('text/plain');
    const cardToMove = document.getElementById(leadId);
    const column = e.target.closest('.kanban-column');
    const list = column.querySelector('.column-body');
    list.classList.remove('drag-over');

    if (cardToMove) {
        const nuevoEstado = column.id.replace('col-', '');
        const token = localStorage.getItem('token');

        try {
            const response = await fetch(`/api/crm/${leadId}/estado`, {
                method: 'PUT',
                headers: { 
                    'Content-Type': 'application/json',
                    'x-auth-token': token 
                },
                body: JSON.stringify({ nuevoEstado })
            });

            if (!response.ok) throw new Error('Error al mover tarjeta');
            
            list.appendChild(cardToMove);
            
            const lead = leadsData.find(l => l.id == leadId);
            if(lead) lead.estado = nuevoEstado;
            
            if(nuevoEstado === 'ganado') {
                alert("Venta cerrada.");
            }

            actualizarContadores();

        } catch (error) {
            alert("Error al mover: " + error.message);
        }
    }
}

function actualizarContadores() {
    const ESTADOS_A_CONTAR = ['nuevo', 'contactado', 'cerrado']; 
    ESTADOS_A_CONTAR.forEach(estado => {
        const lista = document.getElementById(`list-${estado}`);
        if(lista) { 
            document.getElementById(`count-${estado}`).innerText = lista.children.length;
        }
    });
}

// Lógica de Cobro de Saldo
window.cobrarSaldoCliente = async function() {
    const leadId = document.getElementById('lead-id').value;
    if(!leadId) return;

    if (!confirm("¿Confirmas que el cliente está pagando el SALDO RESTANTE (50%)?\nEsto cerrará la venta y registrará el ingreso en Caja.")) return;

    const metodo = prompt("¿Método de pago del saldo?", "transferencia");
    if(!metodo) return; 

    try {
        const token = localStorage.getItem('token');
        const res = await fetch(`/api/crm/${leadId}/cobrar`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-auth-token': token 
            },
            body: JSON.stringify({ metodoPago: metodo })
        });

        const data = await res.json();
        
        if (res.ok) {
            alert("✅ " + data.msg);
            cerrarModalLead();
            initCRM(); 
        } else {
            alert("❌ Error: " + data.msg);
        }
    } catch (e) {
        console.error(e);
        alert("Error de conexión al cobrar.");
    }
}

const btnCobrar = document.getElementById('btn-cobrar-saldo');
if(btnCobrar) {
    btnCobrar.onclick = window.cobrarSaldoCliente;
}

initCRM();

})();