// Ubicacion: SuperNova/frontend/modules/proveedores/proveedores.js

(function() {
    console.log("Modulo Proveedores Activo 🚚");

    let proveedoresData = [];

    // 1. CARGAR DATOS
    async function initProveedores() {
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/proveedores', {
                headers: { 'x-auth-token': token }
            });

            if(res.ok) {
                proveedoresData = await res.json();
                renderTabla();
            } else {
                console.error("Error al cargar proveedores");
            }
        } catch (error) { console.error(error); }
    }

    // 2. RENDERIZAR TABLA
    function renderTabla() {
        const tbody = document.getElementById('tabla-proveedores-body');
        if(!tbody) return;
        tbody.innerHTML = '';

        if(proveedoresData.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px;">No hay proveedores registrados.</td></tr>';
            return;
        }

        proveedoresData.forEach(prov => {
            const tr = document.createElement('tr');
            
            // Etiquetas de colores para categorías
            let catClass = 'bg-default';
            if(prov.categoria === 'alimentos') catClass = 'bg-green'; // Verdecito
            if(prov.categoria === 'servicios') catClass = 'bg-blue'; // Azulito
            
            const catLabel = prov.categoria ? prov.categoria.charAt(0).toUpperCase() + prov.categoria.slice(1) : '-';

            tr.innerHTML = `
                <td style="font-family:monospace; font-weight:600;">${prov.ruc}</td>
                <td style="font-weight:bold; color:#333;">${prov.razon_social}</td>
                <td><span class="badge ${catClass}">${catLabel}</span></td>
                <td>
                    <div style="font-size:13px;">${prov.nombre_contacto || '-'}</div>
                    <div style="font-size:11px; color:#888;">${prov.telefono || ''}</div>
                </td>
                <td style="text-align:center;">${prov.dias_credito} días</td>
                <td><span class="status-active">Activo</span></td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-action edit" data-id="${prov.id}"><i class='bx bx-edit-alt'></i></button>
                        <button class="btn-action delete" data-id="${prov.id}"><i class='bx bx-trash'></i></button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

        // Eventos
        tbody.onclick = (e) => {
            const btnEdit = e.target.closest('.edit');
            const btnDel = e.target.closest('.delete');
            if (btnEdit) editarProveedor(parseInt(btnEdit.dataset.id));
            if (btnDel) eliminarProveedor(parseInt(btnDel.dataset.id));
        };
    }

    // 3. FORMULARIO (CREAR / EDITAR)
    window.abrirModalProveedor = function() {
        document.getElementById('modal-proveedor').classList.add('active');
        document.getElementById('form-nuevo-proveedor').reset();
        document.getElementById('prov-id').value = "";
        document.querySelector('.modal-header h3').innerText = "Nuevo Socio Comercial";
        document.getElementById('prov-dias').value = "0"; // Default contado
    }

    window.cerrarModalProveedor = function() {
        document.getElementById('modal-proveedor').classList.remove('active');
    }

    window.guardarProveedor = async function() {
        const id = document.getElementById('prov-id').value;
        const ruc = document.getElementById('prov-ruc').value;
        const razon = document.getElementById('prov-razon').value;
        const categoria = document.getElementById('prov-categoria').value;
        const dias = document.getElementById('prov-dias').value;
        
        if(!ruc || !razon || !categoria) return alert("Faltan datos obligatorios (RUC, Razón, Categoría)");

        const data = {
            ruc, 
            razon, 
            direccion: document.getElementById('prov-direccion').value,
            categoria,
            dias: parseInt(dias) || 0,
            contacto: document.getElementById('prov-contacto').value,
            email: document.getElementById('prov-email').value,
            telefono: document.getElementById('prov-telefono').value,
            banco: document.getElementById('prov-banco').value
        };

        try {
            let url = '/api/proveedores';
            let method = 'POST';
            if(id) { url = `/api/proveedores/${id}`; method = 'PUT'; }

            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json', 'x-auth-token': localStorage.getItem('token') },
                body: JSON.stringify(data)
            });

            const resp = await res.json();
            
            if(res.ok) {
                alert("✅ " + resp.msg);
                cerrarModalProveedor();
                initProveedores();
            } else {
                alert("❌ Error: " + resp.msg);
            }
        } catch (e) { console.error(e); alert("Error conexión"); }
    }

    function editarProveedor(id) {
        const prov = proveedoresData.find(p => p.id === id);
        if(!prov) return;

        abrirModalProveedor();
        document.querySelector('.modal-header h3').innerText = "Editar Proveedor";
        
        document.getElementById('prov-id').value = prov.id;
        document.getElementById('prov-ruc').value = prov.ruc;
        document.getElementById('prov-razon').value = prov.razon_social;
        document.getElementById('prov-direccion').value = prov.direccion || '';
        document.getElementById('prov-categoria').value = prov.categoria;
        document.getElementById('prov-dias').value = prov.dias_credito;
        document.getElementById('prov-contacto').value = prov.nombre_contacto || '';
        document.getElementById('prov-email').value = prov.correo_contacto || '';
        document.getElementById('prov-telefono').value = prov.telefono || '';
        document.getElementById('prov-banco').value = prov.cuenta_bancaria || '';
    }

    async function eliminarProveedor(id) {
        if(!confirm("¿Eliminar este proveedor?")) return;
        try {
            const res = await fetch(`/api/proveedores/${id}`, {
                method: 'DELETE',
                headers: { 'x-auth-token': localStorage.getItem('token') }
            });
            if(res.ok) initProveedores();
        } catch(e) {}
    }

    // Buscador Simple
    const buscador = document.getElementById('buscador-proveedores');
    if(buscador) {
        buscador.onkeyup = (e) => {
            const term = e.target.value.toLowerCase();
            const filtrados = proveedoresData.filter(p => 
                p.razon_social.toLowerCase().includes(term) || p.ruc.includes(term)
            );
            // Reutilizamos lógica de renderizado simple pasando datos filtrados
            // (Nota: renderTabla usa la variable global por defecto, hay que adaptarla un poco si queremos filtrar)
            // Para MVP rápido:
            renderTablaFiltrada(filtrados);
        };
    }

    function renderTablaFiltrada(lista) {
        const original = proveedoresData;
        proveedoresData = lista; // Truco temporal
        renderTabla();
        proveedoresData = original; // Restaurar
    }

    // Estilos CSS extra para badges
    const style = document.createElement('style');
    style.innerHTML = `
        .bg-green { background: #e6fffa; color: #047857; }
        .bg-blue { background: #ebf8ff; color: #2b6cb0; }
        .bg-default { background: #f7fafc; color: #4a5568; }
        .badge { padding: 4px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
    `;
    document.head.appendChild(style);

    // Inicio
    initProveedores();

})();