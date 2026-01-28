//Ubicacion: SuperNova/backend/controllers/crmController.js
const pool = require('../db');

exports.obtenerLeads = async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM leads ORDER BY id DESC');
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al obtener leads');
    } 
};

// Crear Lead + Venta (CORREGIDO: Inserta Detalle para que no salga vacío)
exports.crearLead = async (req, res) => {
    console.log("📥 [DEBUG] Iniciando crearLead...");
    const { 
        nombre_apoderado, telefono, email, canal_origen, nombre_hijo, 
        fecha_tentativa, sede_interes, notas, 
        salon_id, paquete_interes, cantidad_ninos, valor_estimado,
        hora_inicio, hora_fin,
        metodo_pago,    
        nro_operacion,
        vendedor_id 
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 
    const sedeUsuarioId = req.usuario ? req.usuario.sede_id : null; 
    
    const client = await pool.connect(); 

    try {
        await client.query('BEGIN');

        const sedeId = sede_interes || sedeUsuarioId;
        const cantidadPax = parseInt(cantidad_ninos) || 0; 
        
        let metodoPagoReal = metodo_pago || 'Transferencia';
        metodoPagoReal = metodoPagoReal.charAt(0).toUpperCase() + metodoPagoReal.slice(1).toLowerCase();
        
        const operacionReal = nro_operacion || 'SEÑAL_AUTOMATICA';
        const vendedorRealId = vendedor_id ? parseInt(vendedor_id) : usuarioId;

        // 1. Calcular Precios y Obtener Nombre del Paquete
        let precioUnitario = 0;
        let paqueteId = null;
        let nombrePaquete = "Evento Personalizado"; // Valor por defecto si no elige combo

        if (paquete_interes) {
            const idProd = parseInt(paquete_interes);
            if (!isNaN(idProd)) {
                const prodRes = await client.query('SELECT id, nombre, precio_venta FROM productos WHERE id = $1', [idProd]);
                if (prodRes.rows.length > 0) {
                    precioUnitario = parseFloat(prodRes.rows[0].precio_venta);
                    paqueteId = prodRes.rows[0].id;
                    nombrePaquete = prodRes.rows[0].nombre; // 🔥 Guardamos el nombre para el detalle
                }
            }
        }

        let valorTotal = precioUnitario * cantidadPax;
        if (valorTotal === 0 && valor_estimado) {
            valorTotal = parseFloat(valor_estimado);
        }
        const montoSenal = valorTotal * 0.50; 

        // 2. Fechas
        const fechaInicioStr = `${fecha_tentativa} ${hora_inicio}:00`;
        const fechaFinStr = `${fecha_tentativa} ${hora_fin}:00`;
        const fechaInicioObj = new Date(fechaInicioStr);
        const fechaFinObj = new Date(fechaFinStr);

        // 3. Validación
        const choque = await client.query(
            `SELECT id FROM eventos 
             WHERE sede_id = $1 AND salon_id = $2 AND estado != 'cancelado'
             AND (fecha_inicio < $3 AND fecha_fin > $4)`, 
            [sedeId, salon_id, fechaFinObj, fechaInicioObj] 
        );
        if (choque.rows.length > 0) throw new Error(`⚠️ El salón ya está ocupado en ese horario.`);

        // 4. Cliente (Actualizar nombre si existe teléfono)
        let clienteId;
        const clienteCheck = await client.query('SELECT id FROM clientes WHERE telefono = $1', [telefono]);
        
        if (clienteCheck.rows.length > 0) {
            clienteId = clienteCheck.rows[0].id;
            await client.query(
                'UPDATE clientes SET nombre_completo = $1, correo = $2, nombre_hijo = $3 WHERE id = $4',
                [nombre_apoderado, email, nombre_hijo, clienteId]
            );
        } else {
            const nuevoCliente = await client.query(
                `INSERT INTO clientes (nombre_completo, telefono, correo, nombre_hijo, categoria)
                 VALUES ($1, $2, $3, $4, 'nuevo') RETURNING id`,
                [nombre_apoderado, telefono, email, nombre_hijo]
            );
            clienteId = nuevoCliente.rows[0].id;
        }

        // 5. Evento
        const salonRes = await client.query('SELECT nombre FROM salones WHERE id = $1', [salon_id]);
        const nombreSalon = salonRes.rows.length > 0 ? salonRes.rows[0].nombre : 'Sala Desconocida';
        const tituloEvento = `Cumpleaños: ${nombre_hijo} (${cantidadPax} niños)`;

        const eventoRes = await client.query(
            `INSERT INTO eventos (
                cliente_id, sede_id, titulo, fecha_inicio, fecha_fin, 
                salon_id, salon, estado, costo_total, acuenta, saldo, 
                paquete_id, usuario_creacion_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'reservado', $8, $9, $10, $11, $12) RETURNING id`,
            [
                clienteId, sedeId, tituloEvento, fechaInicioObj, fechaFinObj, 
                salon_id, nombreSalon, valorTotal, montoSenal, (valorTotal - montoSenal), 
                paqueteId, usuarioId
            ]
        );
        const eventoId = eventoRes.rows[0].id;

        // 6. FLUJO FINANCIERO
        if (montoSenal > 0) {
            // Calcular Ticket Correlativo
            const maxTicketRes = await client.query(
                'SELECT COALESCE(MAX(numero_ticket_sede), 0) as max_num FROM ventas WHERE sede_id = $1',
                [sedeId]
            );
            const nuevoNumeroTicket = parseInt(maxTicketRes.rows[0].max_num) + 1;

            // A. Registrar Pago Evento
            const pagoRes = await client.query(
                `INSERT INTO pagos_evento (evento_id, usuario_id, monto, metodo_pago, nro_operacion)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [eventoId, usuarioId, montoSenal, metodoPagoReal, operacionReal]
            );
            
            // B. Registrar Venta (Cabecera)
            const ventaRes = await client.query(
                `INSERT INTO ventas (
                    sede_id, usuario_id, cliente_id, 
                    total_venta, metodo_pago, fecha_venta, 
                    tipo_comprobante, estado, 
                    tipo_venta, linea_negocio,
                    vendedor_id,
                    numero_ticket_sede, 
                    observaciones
                ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, 'ticket', 'completado', 'Evento', 'EVENTOS', $6, $7, $8) RETURNING id`,
                [
                    sedeId, usuarioId, clienteId, 
                    montoSenal, metodoPagoReal, 
                    vendedorRealId, nuevoNumeroTicket, 
                    `Adelanto CRM: ${nombre_hijo}`
                ]
            );
            const ventaId = ventaRes.rows[0].id;

            // C. 🔥 INSERTAR DETALLE DE VENTA (ESTO ES LO QUE FALTABA) 🔥
            // Sin esto, el modal del ojo sale vacío.
            await client.query(
                `INSERT INTO detalle_ventas (
                    venta_id, producto_id, nombre_producto_historico, 
                    cantidad, precio_unitario, subtotal
                ) VALUES ($1, $2, $3, $4, $5, $6)`,
                [
                    ventaId, 
                    paqueteId, // Puede ser null si es personalizado
                    `ADELANTO: ${nombrePaquete} (${cantidadPax} pax)`, // Descripción clara para el modal
                    1, // Cantidad
                    montoSenal, // Precio Unitario
                    montoSenal  // Subtotal
                ]
            );

            // D. Registrar Caja
            const sedeInfo = await client.query('SELECT prefijo_ticket FROM sedes WHERE id = $1', [sedeId]);
            const prefijo = sedeInfo.rows[0]?.prefijo_ticket || 'TICKET';
            const codigoVisual = `${prefijo}-${nuevoNumeroTicket.toString().padStart(4, '0')}`;

            await client.query(
                `INSERT INTO movimientos_caja (
                    sede_id, usuario_id, tipo_movimiento, categoria, 
                    descripcion, monto, metodo_pago, pago_evento_id, venta_id
                ) VALUES ($1, $2, 'INGRESO', 'EVENTO_SEÑAL', $3, $4, $5, $6, $7)`,
                [
                    sedeId, usuarioId, 
                    `Señal: ${nombre_apoderado} (${codigoVisual})`, 
                    montoSenal, metodoPagoReal, 
                    pagoRes.rows[0].id,
                    ventaId // Vinculamos caja con venta también
                ]
            );
        }

        // 7. Lead
        const leadRes = await client.query(
            `INSERT INTO leads (
                nombre_apoderado, telefono, email, canal_origen, nombre_hijo, 
                fecha_tentativa, sede_interes, salon_id, notas, 
                paquete_interes, valor_estimado, hora_inicio, hora_fin, 
                estado, usuario_asignado_id, cliente_asociado_id, pago_inicial, 
                sala_interes, vendedor_id, metodo_pago, nro_operacion
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'nuevo', $14, $15, $16, $17, $18, $19, $20) 
            RETURNING *`,
            [
                nombre_apoderado, telefono, email, canal_origen, nombre_hijo,
                fechaInicioObj, sede_interes, salon_id, 
                `Niños: ${cantidadPax}. ${notas || ''}`, 
                paqueteId, valorTotal, hora_inicio, hora_fin,
                usuarioId, clienteId, montoSenal, nombreSalon,
                vendedorRealId, metodoPagoReal, operacionReal
            ]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Reserva registrada correctamente.', lead: leadRes.rows[0] });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ ERROR:", err.message);
        res.status(400).json({ msg: `Error: ${err.message}` });
    } finally {
        client.release();
    }
};

// EDIT LEAD (CORRECTED: UPDATES SALES HISTORY DESCRIPTION)
exports.actualizarLead = async (req, res) => {
    const { id } = req.params;
    const { 
        nombre_apoderado, telefono, email, canal_origen, nombre_hijo, 
        fecha_tentativa, sede_interes, notas, salon_id,
        paquete_interes, valor_estimado, hora_inicio, hora_fin,
        cantidad_ninos,
        vendedor_id, 
        metodo_pago,
        nro_operacion
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Prepare Data
        const cantidadPax = cantidad_ninos || 0;
        const notaFinal = `Niños: ${cantidadPax}. ${notas || ''}`;

        let nombreSalon = null;
        if (salon_id) {
            const salonRes = await client.query('SELECT nombre FROM salones WHERE id = $1', [salon_id]);
            if (salonRes.rows.length > 0) nombreSalon = salonRes.rows[0].nombre;
        }

        // 2. UPDATE LEAD
        await client.query(
            `UPDATE leads SET 
                nombre_apoderado=$1, telefono=$2, email=$3, canal_origen=$4, 
                nombre_hijo=$5, fecha_tentativa=$6, sede_interes=$7, 
                notas=$8, salon_id=$9, sala_interes=$10, 
                paquete_interes=$11, valor_estimado=$12, hora_inicio=$13, hora_fin=$14,
                vendedor_id=$15, metodo_pago=$16, nro_operacion=$17,
                ultima_actualizacion=CURRENT_TIMESTAMP 
             WHERE id=$18`,
            [
                nombre_apoderado, telefono, email, canal_origen, 
                nombre_hijo || null, fecha_tentativa || null, sede_interes || null, 
                notaFinal, salon_id || null, nombreSalon, 
                paquete_interes, valor_estimado, hora_inicio, hora_fin,
                vendedor_id || null, metodo_pago || null, nro_operacion || null, 
                id
            ]
        );

        // 3. DATA SYNCHRONIZATION (Event and Sales)
        const leadCheck = await client.query('SELECT cliente_asociado_id FROM leads WHERE id = $1', [id]);
        
        if (leadCheck.rows.length > 0 && leadCheck.rows[0].cliente_asociado_id) {
            const clienteId = leadCheck.rows[0].cliente_asociado_id;

            // A. Recalculate payments
            const pagosRes = await client.query(
                `SELECT COALESCE(SUM(pe.monto), 0) as total_pagado 
                 FROM pagos_evento pe
                 JOIN eventos e ON pe.evento_id = e.id
                 WHERE e.cliente_id = $1`,
                [clienteId]
            );
            
            const pagadoHastaHoy = parseFloat(pagosRes.rows[0].total_pagado);
            const nuevoCostoTotal = parseFloat(valor_estimado || 0);
            let nuevoSaldo = nuevoCostoTotal - pagadoHastaHoy;
            if(nuevoSaldo < 0) nuevoSaldo = 0; 

            // B. Update EVENT
            if (fecha_tentativa && hora_inicio && hora_fin) {
                const fechaInicioStr = `${fecha_tentativa} ${hora_inicio}:00`;
                const fechaFinStr = `${fecha_tentativa} ${hora_fin}:00`;
                const fechaInicioObj = new Date(fechaInicioStr);
                const fechaFinObj = new Date(fechaFinStr);
                const nuevoTitulo = `Cumpleaños: ${nombre_hijo} (${cantidadPax} niños)`;
                
                const paqueteIdInt = paquete_interes ? parseInt(paquete_interes) : null;

                await client.query(
                    `UPDATE eventos SET 
                        fecha_inicio = $1, fecha_fin = $2,
                        salon_id = $3, salon = $4, sede_id = $5,
                        titulo = $6, costo_total = $7, saldo = $8,
                        paquete_id = $9
                     WHERE cliente_id = $10 AND estado != 'cancelado'`,
                    [
                        fechaInicioObj, fechaFinObj, 
                        salon_id || null, nombreSalon, sede_interes,
                        nuevoTitulo, nuevoCostoTotal, nuevoSaldo, 
                        paqueteIdInt, 
                        clienteId
                    ]
                );
            }

            // C. Synchronize Sale Header (Seller/Payment)
            if (vendedor_id || metodo_pago) {
                let metodoBonito = null;
                if(metodo_pago) {
                    metodoBonito = metodo_pago.charAt(0).toUpperCase() + metodo_pago.slice(1).toLowerCase();
                }
                await client.query(
                    `UPDATE ventas SET 
                        vendedor_id = COALESCE($1, vendedor_id),
                        metodo_pago = COALESCE($2, metodo_pago)
                     WHERE cliente_id = $3 AND linea_negocio = 'EVENTOS'`,
                    [vendedor_id || null, metodoBonito, clienteId]
                );
            }

            // 🔥 D. UPDATE SALE DETAIL DESCRIPTION (WHAT APPEARS IN THE "EYE" MODAL) 🔥
            // Get package name to build description
            const paqueteIdInt = paquete_interes ? parseInt(paquete_interes) : null;
            let nombrePaquete = "Evento Personalizado";
            
            if (paqueteIdInt) {
                const prodRes = await client.query('SELECT nombre FROM productos WHERE id = $1', [paqueteIdInt]);
                if (prodRes.rows.length > 0) nombrePaquete = prodRes.rows[0].nombre;
            }

            const nuevaDescripcion = `ADELANTO: ${nombrePaquete} (${cantidadPax} pax)`;

            // Find the last event sale for this client
            const ventaRes = await client.query(
                `SELECT id FROM ventas WHERE cliente_id = $1 AND linea_negocio = 'EVENTOS' ORDER BY id DESC LIMIT 1`,
                [clienteId]
            );

            if (ventaRes.rows.length > 0) {
                const ventaId = ventaRes.rows[0].id;
                // Update description in detalle_ventas
                await client.query(
                    `UPDATE detalle_ventas SET nombre_producto_historico = $1 WHERE venta_id = $2`,
                    [nuevaDescripcion, ventaId]
                );
            }
        }

        // Audit
        if (usuarioId) {
            await client.query(
                `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) VALUES ($1, 'EDITAR', 'CRM', $2, $3)`,
                [usuarioId, id, `Editó Lead ${nombre_apoderado}`]
            );
        }

        await client.query('COMMIT');
        res.json({ msg: 'Lead actualizado correctamente.' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error en actualizarLead:", err.message);
        res.status(500).json({ msg: 'Error del servidor: ' + err.message });
    } finally {
        client.release();
    }
};

// ACTUALIZAR ESTADO DEL LEAD + CREAR EVENTO SI ES "GANADO" (VERSIÓN DEBUG)
exports.actualizarEstado = async (req, res) => {
    const { id } = req.params;
    const { nuevoEstado } = req.body; 
    
    if (!req.usuario) {
        return res.status(401).json({ msg: "Error de sesión. Vuelva a ingresar." });
    }
    const { id: usuarioId, sede_id: sedeUsuarioId } = req.usuario;

    const client = await pool.connect(); 

    try {
        await client.query('BEGIN'); 

        const leadRes = await client.query('SELECT * FROM leads WHERE id = $1', [id]);
        if (leadRes.rows.length === 0) throw new Error('Lead no encontrado');
        const lead = leadRes.rows[0];

        await client.query(
            'UPDATE leads SET estado = $1, ultima_actualizacion = CURRENT_TIMESTAMP WHERE id = $2',
            [nuevoEstado, id]
        );

        if (nuevoEstado === 'ganado') {
            
            let clienteId;
            const clienteCheck = await client.query('SELECT id FROM clientes WHERE telefono = $1', [lead.telefono]);
            
            if (clienteCheck.rows.length > 0) {
                clienteId = clienteCheck.rows[0].id;
            } else {
                const nuevoCliente = await client.query(
                    `INSERT INTO clientes (nombre_completo, telefono, correo, nombre_hijo, categoria)
                     VALUES ($1, $2, $3, $4, 'nuevo') RETURNING id`,
                    [lead.nombre_apoderado, lead.telefono, lead.email, lead.nombre_hijo]
                );
                clienteId = nuevoCliente.rows[0].id;
            }

            let fechaInicioStr, fechaFinStr;
            const sedeId = lead.sede_interes || sedeUsuarioId;
            const salaReal = lead.sala_interes || 'Sala Por Definir';
            const valorTotal = parseFloat(lead.valor_estimado) || 0;
            const montoSenal = valorTotal * 0.50;

            if (lead.fecha_tentativa && lead.hora_inicio && lead.hora_fin) {
                const fechaBase = lead.fecha_tentativa.toISOString().split('T')[0];
                
                const inicioTime = lead.hora_inicio.match(/\d{2}:\d{2}:\d{2}/) ? lead.hora_inicio.match(/\d{2}:\d{2}:\d{2}/)[0] : '16:00:00';
                const finTime = lead.hora_fin.match(/\d{2}:\d{2}:\d{2}/) ? lead.hora_fin.match(/\d{2}:\d{2}:\d{2}/)[0] : '19:00:00';

                fechaInicioStr = `${fechaBase} ${inicioTime}`;
                fechaFinStr = `${fechaBase} ${finTime}`;
                
            } else {
                const hoy = new Date().toISOString().split('T')[0];
                fechaInicioStr = `${hoy} 16:00:00`;
                fechaFinStr = `${hoy} 19:00:00`;
            }
            
            const choque = await client.query(
                `SELECT id FROM eventos 
                 WHERE sede_id = $1 
                 AND salon = $2 
                 AND estado != 'cancelado'
                 AND (fecha_inicio < $3 AND fecha_fin > $4)`,
                [sedeId, salaReal, fechaFinStr, fechaInicioStr] 
            );

            if (choque.rows.length > 0) {
                throw new Error(`⚠️ ¡CUIDADO! La ${salaReal} ya está ocupada en ese horario.`);
            }
            
            const eventoRes = await client.query(
                `INSERT INTO eventos (
                    cliente_id, sede_id, titulo, fecha_inicio, fecha_fin, salon, estado, costo_total, acuenta, saldo, paquete_id
                ) VALUES ($1, $2, $3, $4, $5, $6, 'reservado', $7, $8, $9, $10) RETURNING id`,
                [
                    clienteId,
                    sedeId,
                    `Cumpleaños: ${lead.nombre_hijo || 'Niño'} (${lead.nombre_apoderado})`,
                    fechaInicioStr, 
                    fechaFinStr,    
                    salaReal, 
                    valorTotal,
                    montoSenal.toFixed(2),
                    (valorTotal - montoSenal).toFixed(2),
                    lead.paquete_interes
                ]
            );
            const eventoId = eventoRes.rows[0].id;

            if (montoSenal > 0) {
                const pagoRes = await client.query(
                    `INSERT INTO pagos_evento (evento_id, usuario_id, monto, metodo_pago, nro_operacion)
                     VALUES ($1, $2, $3, 'transferencia', 'SEÑAL_AUTOMATICA') RETURNING id`,
                    [eventoId, usuarioId, montoSenal]
                );
                const pagoId = pagoRes.rows[0].id;
                
                await client.query(
                    `INSERT INTO movimientos_caja (sede_id, usuario_id, tipo_movimiento, categoria, descripcion, monto, metodo_pago, pago_evento_id)
                     VALUES ($1, $2, 'INGRESO', 'EVENTO_SEÑAL', 'Señal 50% para evento N°' || $3, $4, 'transferencia', $5)`,
                    [sedeId, usuarioId, eventoId, montoSenal.toFixed(2), pagoId]
                );
            }
        }

        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'MOVER_KANBAN', 'CRM', $2, $3)`,
            [usuarioId, id, `Movió a ${lead.nombre_apoderado} a ${nuevoEstado}`]
        );

        await client.query('COMMIT');
        res.json({ msg: `Estado actualizado a ${nuevoEstado} y evento generado.`, id, nuevoEstado });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error CRM:", err.message);
        res.status(400).json({ msg: err.message });
    } finally {
        client.release();
    }
};

exports.obtenerEventos = async (req, res) => {
    try {
        const { sede } = req.query; // Capturamos ?sede=X

        let query = `
            SELECT 
                e.*, 
                s.nombre AS nombre_sede,
                c.nombre_completo AS nombre_cliente,
                sa.nombre AS nombre_sala_real -- Traemos el nombre directo de la tabla salones
            FROM eventos e
            JOIN sedes s ON e.sede_id = s.id
            LEFT JOIN salones sa ON e.salon_id = sa.id -- Join con salones
            JOIN clientes c ON e.cliente_id = c.id
            WHERE 1=1
        `;

        const params = [];
        if (sede && sede !== "") {
            query += ` AND e.sede_id = $1`;
            params.push(sede);
        }

        query += ` ORDER BY e.fecha_inicio DESC LIMIT 200`; // Aumenté el límite un poco
        
        const result = await pool.query(query, params);
        res.json(result.rows);

    } catch (err) {
        console.error("Error al obtener eventos:", err.message);
        res.status(500).send('Error calendario');
    }
};

// --- NUEVO: Obtener Salones por Sede (Para los checkboxes) ---
exports.obtenerSalonesPorSede = async (req, res) => {
    try {
        const { sede } = req.query;
        let query = 'SELECT id, nombre, color FROM salones';
        const params = [];

        // Asumiendo que tu tabla 'salones' tiene 'sede_id'. 
        // Si no lo tiene, tendrás que asignarlas manualmente o agregar esa columna.
        if (sede) {
            query += ' WHERE sede_id = $1';
            params.push(sede);
        }
        
        query += ' ORDER BY nombre ASC';

        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener salones:", err.message);
        res.status(500).json([]);
    }
};

//Eliminar Lead + limpieza profunda de ventas, caja, pagos y evento asociado
exports.eliminarLead = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    const usuarioId = req.usuario ? req.usuario.id : null;
    
    try {
        await client.query('BEGIN');
        
        // 1. Obtener datos del Lead antes de borrar
        const leadRes = await client.query('SELECT * FROM leads WHERE id = $1', [id]);
        if (leadRes.rows.length === 0) throw new Error('Lead no encontrado.');
        const lead = leadRes.rows[0];

        // 2. Si tiene un cliente asociado, procedemos a borrar todo el rastro financiero y operativo
        if (lead.cliente_asociado_id) {
            const clienteId = lead.cliente_asociado_id;

            // --- A. LIMPIEZA PROFUNDA DE VENTAS (SOLUCIÓN AL ERROR FK) ---
            // Buscamos las ventas asociadas a este cliente que coincidan con el monto inicial
            // (Asumimos que son las ventas generadas por este Lead)
            const ventasRes = await client.query(
                `SELECT id FROM ventas 
                 WHERE cliente_id = $1 AND total_venta = $2`,
                [clienteId, lead.pago_inicial]
            );

            // Iteramos sobre las ventas encontradas para borrar sus dependencias primero
            for (const venta of ventasRes.rows) {
                const ventaId = venta.id;

                // A1. Borrar Movimientos de Caja vinculados a esta Venta (🔥 AQUÍ ESTABA EL ERROR)
                // Primero eliminamos el registro en caja que apunta a esta venta
                await client.query('DELETE FROM movimientos_caja WHERE venta_id = $1', [ventaId]);

                // A2. Borrar Detalle de Venta (Productos)
                await client.query('DELETE FROM detalle_ventas WHERE venta_id = $1', [ventaId]);

                // A3. Finalmente borrar la Venta (Ahora sí se puede porque no tiene hijos)
                await client.query('DELETE FROM ventas WHERE id = $1', [ventaId]);
            }

            // --- B. BUSCAR Y ELIMINAR EVENTO ---
            // Buscar el evento asociado a este cliente
            const eventoRes = await client.query(
                `SELECT id FROM eventos WHERE cliente_id = $1 ORDER BY id DESC LIMIT 1`,
                [clienteId]
            );

            if (eventoRes.rows.length > 0) {
                const eventoId = eventoRes.rows[0].id;

                // --- C. LIMPIEZA DE PAGOS DE EVENTO ---
                
                // Obtenemos los IDs de los pagos registrados para este evento
                const pagosRes = await client.query('SELECT id FROM pagos_evento WHERE evento_id = $1', [eventoId]);
                const pagosIds = pagosRes.rows.map(p => p.id);

                if (pagosIds.length > 0) {
                    // C1. Borrar movimientos de CAJA vinculados a estos pagos (Si existen por separado)
                    await client.query(
                        `DELETE FROM movimientos_caja WHERE pago_evento_id = ANY($1::int[])`,
                        [pagosIds]
                    );

                    // C2. Borrar los PAGOS internos del evento
                    await client.query(
                        `DELETE FROM pagos_evento WHERE evento_id = $1`,
                        [eventoId]
                    );
                }

                // --- D. BORRAR EL EVENTO (Calendario) ---
                await client.query('DELETE FROM eventos WHERE id = $1', [eventoId]);
            }
        }

        // 3. Finalmente borrar el Lead (CRM)
        await client.query('DELETE FROM leads WHERE id = $1', [id]);

        // 4. Auditoría (Registro de seguridad)
        if (usuarioId) {
            await client.query(
                `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
                 VALUES ($1, 'ELIMINAR', 'CRM', $2, $3)`,
                [usuarioId, id, `Eliminó Lead ${lead.nombre_apoderado}, venta de S/${lead.pago_inicial} y revirtió caja.`]
            );
        }

        await client.query('COMMIT');
        
        res.json({ msg: 'Lead eliminado correctamente. Se borraron ventas, caja, pagos y evento asociado.' });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error al eliminar lead:", err.message);
        res.status(500).json({ msg: "Error al eliminar: " + err.message });
    } finally {
        client.release();
    }
};

// Cobrar Saldo (MASTER: CONECTADO A TABLA REAL 'productos_combo')
exports.cobrarSaldo = async (req, res) => {
    const { id } = req.params; 
    const { metodoPago, cantidad_ninos_final, paquete_final_id } = req.body; // 🔥 Recibimos paquete_final_id
    const usuarioId = req.usuario.id;

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Datos del Lead y Evento
        const leadRes = await client.query('SELECT * FROM leads WHERE id = $1', [id]);
        if (leadRes.rows.length === 0) throw new Error('Lead no encontrado');
        const lead = leadRes.rows[0];

        if (!lead.cliente_asociado_id) throw new Error('Sin evento asociado.');  

        const eventoRes = await client.query(
            `SELECT * FROM eventos WHERE cliente_id = $1 AND estado != 'cancelado'`, 
            [lead.cliente_asociado_id]
        );
        if (eventoRes.rows.length === 0) throw new Error('No se encontró evento activo.');
        
        const evento = eventoRes.rows[0];
        const sedeReal = evento.sede_id; 

        // 2. DEFINIR QUÉ PAQUETE Y CANTIDAD USAR
        // Si el usuario cambió el paquete en el modal, usamos ese. Si no, el del evento.
        const idPaqueteReal = paquete_final_id ? parseInt(paquete_final_id) : evento.paquete_id;
        const cantidadFinal = cantidad_ninos_final ? parseInt(cantidad_ninos_final) : 0;

        // 3. OBTENER PRECIO Y DATOS DEL PRODUCTO SELECCIONADO
        const prodRes = await client.query(
            'SELECT id, precio_venta, nombre, costo_compra FROM productos WHERE id = $1', 
            [idPaqueteReal]
        );
        if (prodRes.rows.length === 0) throw new Error('El paquete seleccionado no existe.');
        
        const productoPrincipal = prodRes.rows[0];
        const precioUnitario = parseFloat(productoPrincipal.precio_venta);

        // 4. RECALCULO FINANCIERO REAL
        const nuevoCostoTotal = precioUnitario * cantidadFinal;
        const pagadoPreviamente = parseFloat(evento.acuenta || 0);
        let saldoAPagar = nuevoCostoTotal - pagadoPreviamente;
        
        if (saldoAPagar < 0) saldoAPagar = 0; // Por ahora no manejamos devoluciones automáticas

        // 5. LÓGICA DE INVENTARIO (DESCONTAR DEL PAQUETE REAL)
        
        // A. Buscar Ingredientes (Receta)
        const recetaRes = await client.query(
            `SELECT r.producto_hijo_id AS ingrediente_id, r.cantidad, p.nombre, p.costo_compra 
             FROM productos_combo r
             JOIN productos p ON r.producto_hijo_id = p.id
             WHERE r.producto_padre_id = $1`,
            [idPaqueteReal]
        );
        const ingredientes = recetaRes.rows;

        // B. Validar Stock Principal (Combo)
        const stockMainRes = await client.query(
            'SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE',
            [idPaqueteReal, sedeReal]
        );
        const stockMain = stockMainRes.rows.length > 0 ? parseInt(stockMainRes.rows[0].cantidad) : 0;

        if (stockMain < cantidadFinal) {
              throw new Error(`⛔ STOCK INSUFICIENTE: Combo "${productoPrincipal.nombre}" (Tienes ${stockMain}, necesitas ${cantidadFinal})`);
        }

        // C. Validar Stock Ingredientes
        for (const ing of ingredientes) {
            const cantidadNecesariaTotal = parseInt(ing.cantidad) * cantidadFinal;
            const stockIngRes = await client.query(
                'SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE',
                [ing.ingrediente_id, sedeReal]
            );
            const stockIng = stockIngRes.rows.length > 0 ? parseInt(stockIngRes.rows[0].cantidad) : 0;

            if (stockIng < cantidadNecesariaTotal) {
                throw new Error(`⛔ FALTA INGREDIENTE: "${ing.nombre}". Tienes ${stockIng}, necesitas ${cantidadNecesariaTotal}.`);
            }
        }

        // D. EJECUCIÓN DESCUENTO
        // D1. Descontar Combo
        const updateMain = await client.query(
            `UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3 RETURNING cantidad`, 
            [cantidadFinal, idPaqueteReal, sedeReal]
        );
        
        await client.query(
            `INSERT INTO movimientos_inventario 
            (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
             VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7)`,
            [
                sedeReal, idPaqueteReal, usuarioId, -cantidadFinal, 
                updateMain.rows[0].cantidad, 
                `Venta Final Evento #${evento.id}`, 
                productoPrincipal.costo_compra || 0
            ]
        );

        // D2. Descontar Ingredientes
        for (const ing of ingredientes) {
            const cantidadADescontar = parseInt(ing.cantidad) * cantidadFinal;
            const updateIng = await client.query(
                `UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3 RETURNING cantidad`,
                [cantidadADescontar, ing.ingrediente_id, sedeReal]
            );

            await client.query(
                `INSERT INTO movimientos_inventario 
                (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                 VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7)`,
                [
                    sedeReal, ing.ingrediente_id, usuarioId, -cantidadADescontar, 
                    updateIng.rows[0].cantidad, 
                    `Ingrediente Evento #${evento.id}`, 
                    ing.costo_compra || 0
                ]
            );
        }

        // 6. REGISTRAR PAGO
        const pagoRes = await client.query(
            `INSERT INTO pagos_evento (evento_id, usuario_id, monto, metodo_pago, nro_operacion, tipo_pago)
             VALUES ($1, $2, $3, $4, 'PAGO_FINAL', 'SALDO') RETURNING id`,
            [evento.id, usuarioId, saldoAPagar, metodoPago || 'efectivo']
        );

        // 7. REGISTRAR EN CAJA
        await client.query(
            `INSERT INTO movimientos_caja (
                sede_id, usuario_id, tipo_movimiento, categoria, 
                descripcion, monto, metodo_pago, pago_evento_id, fecha_registro
            ) VALUES ($1, $2, 'INGRESO', 'Cobro Evento', 
                $3, $4, $5, $6, CURRENT_TIMESTAMP
            )`,
            [
                sedeReal, usuarioId, 
                `SALDO FINAL | ${lead.nombre_apoderado} (${productoPrincipal.nombre})`, 
                saldoAPagar, metodoPago || 'efectivo', pagoRes.rows[0].id
            ]
        );

        // 🔥 8. NUEVO: REGISTRAR EN HISTORIAL DE VENTAS (Para que salga en el reporte)
        // Insertamos una nueva venta por el monto del saldo
        await client.query(
            `INSERT INTO ventas (
                sede_id, usuario_id, cliente_id, 
                total_venta, metodo_pago, fecha_venta, 
                tipo_comprobante, estado, 
                tipo_venta, linea_negocio, vendedor_id
            ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, 'ticket', 'completado', 'Evento Saldo', 'EVENTOS', $6)`,
            [
                sedeReal, 
                usuarioId, 
                lead.cliente_asociado_id, 
                saldoAPagar, 
                metodoPago || 'Efectivo',
                lead.vendedor_id // Asignamos al mismo vendedor del lead
            ]
        );

        // 9. ACTUALIZAR EVENTO Y LEAD
        await client.query(
            `UPDATE eventos SET saldo = 0, acuenta = $1, costo_total = $2, paquete_id = $3, estado = 'confirmado' WHERE id = $4`, 
            [(pagadoPreviamente + saldoAPagar), nuevoCostoTotal, idPaqueteReal, evento.id]
        );
        await client.query(`UPDATE leads SET estado = 'ganado' WHERE id = $1`, [id]);

        await client.query('COMMIT');
        res.json({ msg: `¡Cobro de S/${saldoAPagar.toFixed(2)} exitoso! Stock actualizado.`, nuevoEstado: 'ganado' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error cobrar saldo:", err.message);
        res.status(400).json({ msg: err.message });
    } finally {
        client.release();
    }
};