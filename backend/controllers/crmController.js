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

// Crear Lead + Venta (CORREGIDO: Vendedor y Formato de Pago)
exports.crearLead = async (req, res) => {
    console.log("📥 [DEBUG] Iniciando crearLead...");
    const { 
        nombre_apoderado, telefono, email, canal_origen, nombre_hijo, 
        fecha_tentativa, sede_interes, notas, 
        salon_id, paquete_interes, cantidad_ninos, valor_estimado,
        hora_inicio, hora_fin,
        metodo_pago,    
        nro_operacion,
        vendedor_id // 🔥 NUEVO CAMPO RECIBIDO
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 
    const sedeUsuarioId = req.usuario ? req.usuario.sede_id : null; 
    
    const client = await pool.connect(); 

    try {
        await client.query('BEGIN');

        const sedeId = sede_interes || sedeUsuarioId;
        const cantidadPax = parseInt(cantidad_ninos) || 0; 
        
        // 🔧 ARREGLO DE LA SUMA EN CAJA: Formatear texto (ej: "yape" -> "Yape")
        // Esto asegura que tu dashboard reconozca el texto exacto.
        let metodoPagoReal = metodo_pago || 'Transferencia';
        // Convertir primera letra a mayúscula y el resto minúscula
        metodoPagoReal = metodoPagoReal.charAt(0).toUpperCase() + metodoPagoReal.slice(1).toLowerCase();
        
        const operacionReal = nro_operacion || 'SEÑAL_AUTOMATICA';
        
        // 🔥 LÓGICA DE VENDEDOR
        // Si eligieron alguien en el select, usamos ese ID. Si no, usamos al usuario logueado.
        const vendedorRealId = vendedor_id ? parseInt(vendedor_id) : usuarioId;

        // 1. Calcular Precios
        let precioUnitario = 0;
        let paqueteId = null;

        if (paquete_interes) {
            const idProd = parseInt(paquete_interes);
            if (!isNaN(idProd)) {
                const prodRes = await client.query('SELECT id, nombre, precio_venta FROM productos WHERE id = $1', [idProd]);
                if (prodRes.rows.length > 0) {
                    precioUnitario = parseFloat(prodRes.rows[0].precio_venta);
                    paqueteId = prodRes.rows[0].id;
                }
            }
        }

        let valorTotal = precioUnitario * cantidadPax;
        if (valorTotal === 0 && valor_estimado) {
            valorTotal = parseFloat(valor_estimado);
        }
        const montoSenal = valorTotal * 0.50; 

        // 2. Preparar Fechas
        const fechaInicioStr = `${fecha_tentativa} ${hora_inicio}:00`;
        const fechaFinStr = `${fecha_tentativa} ${hora_fin}:00`;
        const fechaInicioObj = new Date(fechaInicioStr);
        const fechaFinObj = new Date(fechaFinStr);

        // 3. Validación Choque
        const choque = await client.query(
            `SELECT id FROM eventos 
             WHERE sede_id = $1 AND salon_id = $2 AND estado != 'cancelado'
             AND (fecha_inicio < $3 AND fecha_fin > $4)`, 
            [sedeId, salon_id, fechaFinObj, fechaInicioObj] 
        );
        if (choque.rows.length > 0) throw new Error(`⚠️ El salón ya está ocupado en ese horario.`);

        // 4. CLIENTE
        let clienteId;
        const clienteCheck = await client.query('SELECT id FROM clientes WHERE telefono = $1', [telefono]);
        if (clienteCheck.rows.length > 0) {
            clienteId = clienteCheck.rows[0].id;
        } else {
            const nuevoCliente = await client.query(
                `INSERT INTO clientes (nombre_completo, telefono, correo, nombre_hijo, categoria)
                 VALUES ($1, $2, $3, $4, 'nuevo') RETURNING id`,
                [nombre_apoderado, telefono, email, nombre_hijo]
            );
            clienteId = nuevoCliente.rows[0].id;
        }

        // 5. EVENTO
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
            console.log(`💰 [DEBUG] Registrando Venta y Pago (${metodoPagoReal})...`);
            
            // A. Registrar en PAGOS_EVENTO
            const pagoRes = await client.query(
                `INSERT INTO pagos_evento (evento_id, usuario_id, monto, metodo_pago, nro_operacion)
                 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
                [eventoId, usuarioId, montoSenal, metodoPagoReal, operacionReal]
            );
            
            // B. 🔥 REGISTRAR EN TABLA VENTAS CON VENDEDOR 🔥
            // Usamos 'vendedor_id' que vimos en tu captura de base de datos
            await client.query(
                `INSERT INTO ventas (
                    sede_id, usuario_id, cliente_id, 
                    total_venta, metodo_pago, fecha_venta, 
                    tipo_comprobante, estado, 
                    tipo_venta, linea_negocio,
                    vendedor_id  -- ✅ Aquí insertamos al vendedor
                ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, 'ticket', 'completado', 'Evento', 'EVENTOS', $6)`,
                [
                    sedeId, 
                    usuarioId, // Usuario que creó el registro (sistema)
                    clienteId, 
                    montoSenal, 
                    metodoPagoReal, // Texto formateado ("Yape", "Efectivo")
                    vendedorRealId  // $6: El vendedor comisionista
                ]
            );

            // C. Registrar en MOVIMIENTOS_CAJA
            await client.query(
                `INSERT INTO movimientos_caja (
                    sede_id, usuario_id, tipo_movimiento, categoria, 
                    descripcion, monto, metodo_pago, pago_evento_id
                ) VALUES ($1, $2, 'INGRESO', 'EVENTO_SEÑAL', $3, $4, $5, $6)`,
                [
                    sedeId, 
                    usuarioId, 
                    `Señal: ${nombre_apoderado} - ${metodoPagoReal}`, 
                    montoSenal, 
                    metodoPagoReal, 
                    pagoRes.rows[0].id 
                ]
            );
        }

        // 7. LEAD
        const leadRes = await client.query(
            `INSERT INTO leads (
                nombre_apoderado, telefono, email, canal_origen, nombre_hijo, 
                fecha_tentativa, sede_interes, salon_id, notas, 
                paquete_interes, valor_estimado, hora_inicio, hora_fin, 
                estado, usuario_asignado_id, cliente_asociado_id, pago_inicial, 
                sala_interes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'nuevo', $14, $15, $16, $17) 
            RETURNING *`,
            [
                nombre_apoderado, telefono, email, canal_origen, nombre_hijo,
                fechaInicioObj, sede_interes, salon_id, 
                `Niños: ${cantidadPax}. ${notas || ''}`, 
                paqueteId, valorTotal, hora_inicio, hora_fin,
                usuarioId, clienteId, montoSenal, nombreSalon 
            ]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Reserva registrada. Venta asignada al vendedor.', lead: leadRes.rows[0] });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ ERROR:", err.message);
        res.status(400).json({ msg: `Error: ${err.message}` });
    } finally {
        client.release();
    }
};

// EDITAR LEAD (CORREGIDO COMPLETO: TABLAS Y NIÑOS)
exports.actualizarLead = async (req, res) => {
    const { id } = req.params;
    const { 
        nombre_apoderado, telefono, email, canal_origen, nombre_hijo, 
        fecha_tentativa, sede_interes, notas, salon_id,
        paquete_interes, valor_estimado, hora_inicio, hora_fin,
        cantidad_ninos // 🔥 Recibimos la cantidad
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Preparar Datos (Nota combinada y Salón)
        const cantidadPax = cantidad_ninos || 0;
        // Guardamos el número al inicio de la nota para leerlo luego
        const notaFinal = `Niños: ${cantidadPax}. ${notas || ''}`;

        let nombreSalon = null;
        if (salon_id) {
            const salonRes = await client.query('SELECT nombre FROM salones WHERE id = $1', [salon_id]);
            if (salonRes.rows.length > 0) nombreSalon = salonRes.rows[0].nombre;
        }

        // 2. ACTUALIZAR LEAD
        await client.query(
            `UPDATE leads SET 
                nombre_apoderado=$1, telefono=$2, email=$3, canal_origen=$4, 
                nombre_hijo=$5, fecha_tentativa=$6, sede_interes=$7, 
                notas=$8, -- 🔥 Aquí guardamos "Niños: X..."
                salon_id=$9, sala_interes=$10, 
                paquete_interes=$11, valor_estimado=$12, hora_inicio=$13, hora_fin=$14,
                ultima_actualizacion=CURRENT_TIMESTAMP 
             WHERE id=$15`,
            [
                nombre_apoderado, telefono, email, canal_origen, 
                nombre_hijo || null, fecha_tentativa || null, sede_interes || null, 
                notaFinal, 
                salon_id || null, nombreSalon, paquete_interes, valor_estimado, 
                hora_inicio, hora_fin, id
            ]
        );

        // 3. SINCRONIZACIÓN Y RECALCULO FINANCIERO
        const leadCheck = await client.query('SELECT cliente_asociado_id FROM leads WHERE id = $1', [id]);
        
        if (leadCheck.rows.length > 0 && leadCheck.rows[0].cliente_asociado_id) {
            const clienteId = leadCheck.rows[0].cliente_asociado_id;
            
            // A. Calcular Historial de Pagos Real (CORREGIDO: Usando pagos_evento)
            // Sumamos los pagos vinculados a eventos de este cliente
            const pagosRes = await client.query(
                `SELECT COALESCE(SUM(pe.monto), 0) as total_pagado 
                 FROM pagos_evento pe
                 JOIN eventos e ON pe.evento_id = e.id
                 WHERE e.cliente_id = $1`,
                [clienteId]
            );
            
            const pagadoHastaHoy = parseFloat(pagosRes.rows[0].total_pagado);
            const nuevoCostoTotal = parseFloat(valor_estimado || 0);
            
            // B. Calcular Nuevo Saldo
            let nuevoSaldo = nuevoCostoTotal - pagadoHastaHoy;
            if(nuevoSaldo < 0) nuevoSaldo = 0; 

            // C. Actualizar Evento (Fechas y Dinero)
            if (fecha_tentativa && hora_inicio && hora_fin) {
                // Fechas seguras para evitar error de tipos
                const fechaInicioStr = `${fecha_tentativa} ${hora_inicio}:00`;
                const fechaFinStr = `${fecha_tentativa} ${hora_fin}:00`;
                const fechaInicioObj = new Date(fechaInicioStr);
                const fechaFinObj = new Date(fechaFinStr);
                
                // Actualizamos el título también con la nueva cantidad de niños
                const nuevoTitulo = `Cumpleaños: ${nombre_hijo} (${cantidadPax} niños)`;

                await client.query(
                    `UPDATE eventos SET 
                        fecha_inicio = $1, fecha_fin = $2,
                        salon_id = $3, salon = $4, sede_id = $5,
                        titulo = $6,
                        costo_total = $7,
                        saldo = $8 
                     WHERE cliente_id = $9 AND estado != 'cancelado'`,
                    [
                        fechaInicioObj, fechaFinObj, 
                        salon_id || null, nombreSalon, sede_interes,
                        nuevoTitulo,
                        nuevoCostoTotal,
                        nuevoSaldo,
                        clienteId
                    ]
                );
            }
        }

        if (usuarioId) {
             await client.query(
                `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) VALUES ($1, 'EDITAR', 'CRM', $2, $3)`,
                [usuarioId, id, `Editó Lead ${nombre_apoderado} (Niños: ${cantidadPax})`]
            );
        }

        await client.query('COMMIT');
        res.json({ msg: 'Lead actualizado y evento sincronizado.' });

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

// NUEVA FUNCIÓN: Eliminar Lead + revertir pagos y movimientos de caja asociados
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

            // --- A. LIMPIEZA DEL HISTORIAL DE VENTAS (NUEVO) ---
            // Buscamos la venta más reciente de este cliente que coincida con el monto inicial del Lead
            // Esto elimina la fila del módulo "Historial de Ventas"
            if (lead.pago_inicial > 0) {
                await client.query(
                    `DELETE FROM ventas
                     WHERE id IN (
                         SELECT id FROM ventas
                         WHERE cliente_id = $1 
                         AND total_venta = $2 -- Coincidir monto exacto
                         ORDER BY id DESC     -- Borrar la más reciente
                         LIMIT 1
                     )`,
                    [clienteId, lead.pago_inicial]
                );
                // Si la columna se llama 'monto_total' en vez de 'total_venta', cámbialo arriba.
            }

            // --- B. BUSCAR Y ELIMINAR EVENTO ---
            // Buscar el evento asociado a este cliente
            const eventoRes = await client.query(
                `SELECT id FROM eventos WHERE cliente_id = $1 ORDER BY id DESC LIMIT 1`,
                [clienteId]
            );

            if (eventoRes.rows.length > 0) {
                const eventoId = eventoRes.rows[0].id;

                // --- C. LIMPIEZA DE CAJA Y PAGOS ---
                
                // Obtenemos los IDs de los pagos registrados para este evento
                const pagosRes = await client.query('SELECT id FROM pagos_evento WHERE evento_id = $1', [eventoId]);
                const pagosIds = pagosRes.rows.map(p => p.id);

                if (pagosIds.length > 0) {
                    // 1. Borrar movimientos de CAJA vinculados a estos pagos (Módulo Flujo de Caja)
                    await client.query(
                        `DELETE FROM movimientos_caja WHERE pago_evento_id = ANY($1::int[])`,
                        [pagosIds]
                    );

                    // 2. Borrar los PAGOS internos del evento
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
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'ELIMINAR', 'CRM', $2, $3)`,
            [usuarioId, id, `Eliminó Lead ${lead.nombre_apoderado}, venta de S/${lead.pago_inicial} y revirtió caja.`]
        );

        await client.query('COMMIT');
        
        res.json({ msg: 'Lead eliminado. Se borraron ventas, caja, pagos y evento asociado.' });
        
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
    const { metodoPago, cantidad_ninos_final } = req.body; 
    const usuarioId = req.usuario.id;

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Datos del Evento
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

        // 2. LÓGICA DE INVENTARIO
        let montoPagar = parseFloat(evento.saldo);
        let cantidadFinal = cantidad_ninos_final ? parseInt(cantidad_ninos_final) : 0;

        if (cantidadFinal > 0 && evento.paquete_id) {
            
            // A. Obtener Combo Principal
            const prodRes = await client.query(
                'SELECT precio_venta, nombre, costo_compra FROM productos WHERE id = $1', 
                [evento.paquete_id]
            );
            
            if (prodRes.rows.length > 0) {
                const productoPrincipal = prodRes.rows[0];
                const precioUnitario = parseFloat(productoPrincipal.precio_venta);
                
                // --- B. BUSCAR INGREDIENTES (TABLA REAL: productos_combo) ---
                // 🔥 AQUÍ ESTABA EL CAMBIO CLAVE
                const recetaRes = await client.query(
                    `SELECT r.producto_hijo_id AS ingrediente_id, r.cantidad, p.nombre, p.costo_compra 
                     FROM productos_combo r
                     JOIN productos p ON r.producto_hijo_id = p.id
                     WHERE r.producto_padre_id = $1`,
                    [evento.paquete_id]
                );

                const ingredientes = recetaRes.rows; // Array de ingredientes (Pan, Hotdog, etc.)

                // --- C. VALIDACIÓN PREVIA DE STOCK (TODO O NADA) ---
                
                // 1. Validar Stock Principal (Combo)
                const stockMainRes = await client.query(
                    'SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE',
                    [evento.paquete_id, sedeReal]
                );
                const stockMain = stockMainRes.rows.length > 0 ? parseInt(stockMainRes.rows[0].cantidad) : 0;

                // Validación estricta del combo principal
                if (stockMain < cantidadFinal) {
                     throw new Error(`⛔ STOCK INSUFICIENTE: Combo "${productoPrincipal.nombre}" (Tienes ${stockMain}, necesitas ${cantidadFinal})`);
                }

                // 2. Validar Stock Ingredientes (Cascada)
                if (ingredientes.length > 0) {
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
                }

                // --- D. EJECUCIÓN (DESCUENTO Y KARDEX) ---
                
                // D1. Descontar Combo Principal
                const updateMain = await client.query(
                    `UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3 RETURNING cantidad`, 
                    [cantidadFinal, evento.paquete_id, sedeReal]
                );
                
                // Kardex Principal
                await client.query(
                    `INSERT INTO movimientos_inventario 
                    (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                     VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7)`,
                    [
                        sedeReal, evento.paquete_id, usuarioId, -cantidadFinal, 
                        updateMain.rows[0].cantidad, 
                        `Venta Evento #${evento.id} (${cantidadFinal} niños)`, 
                        productoPrincipal.costo_compra || 0
                    ]
                );

                // D2. Descontar Ingredientes (Loop)
                if (ingredientes.length > 0) {
                    for (const ing of ingredientes) {
                        const cantidadADescontar = parseInt(ing.cantidad) * cantidadFinal;
                        
                        const updateIng = await client.query(
                            `UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3 RETURNING cantidad`,
                            [cantidadADescontar, ing.ingrediente_id, sedeReal]
                        );

                        // Kardex Ingrediente
                        await client.query(
                            `INSERT INTO movimientos_inventario 
                            (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                             VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7)`,
                            [
                                sedeReal, 
                                ing.ingrediente_id, 
                                usuarioId, 
                                -cantidadADescontar, 
                                updateIng.rows[0].cantidad, 
                                `Venta #${evento.id} (Ingrediente de: ${productoPrincipal.nombre})`, 
                                ing.costo_compra || 0
                            ]
                        );
                    }
                }

                // E. Recalculo Financiero
                const nuevoTotal = precioUnitario * cantidadFinal;
                const loQueYaPago = parseFloat(evento.acuenta);
                montoPagar = nuevoTotal - loQueYaPago;
                if (montoPagar < 0) montoPagar = 0; 
                await client.query('UPDATE eventos SET costo_total = $1 WHERE id = $2', [nuevoTotal, evento.id]);
            }
        }

        // 3. Registrar Pago
        const pagoRes = await client.query(
            `INSERT INTO pagos_evento (evento_id, usuario_id, monto, metodo_pago, nro_operacion, tipo_pago)
             VALUES ($1, $2, $3, $4, 'PAGO_FINAL', 'SALDO') RETURNING id`,
            [evento.id, usuarioId, montoPagar, metodoPago || 'efectivo']
        );

        // 4. Caja
        await client.query(
            `INSERT INTO movimientos_caja (
                sede_id, usuario_id, tipo_movimiento, categoria, 
                descripcion, monto, metodo_pago, pago_evento_id, fecha_registro
            ) VALUES ($1, $2, 'INGRESO', 'Cobro Evento', 
                $3, $4, $5, $6, CURRENT_TIMESTAMP
            )`,
            [
                sedeReal, usuarioId, 
                `EVENTO_SALDO | ${lead.nombre_apoderado} (${cantidadFinal} pax)`, 
                montoPagar, metodoPago || 'efectivo', pagoRes.rows[0].id
            ]
        );

        // 5. Cerrar
        await client.query(
            `UPDATE eventos SET saldo = 0, acuenta = costo_total, estado = 'confirmado' WHERE id = $1`, 
            [evento.id]
        );
        await client.query(`UPDATE leads SET estado = 'ganado' WHERE id = $1`, [id]);

        await client.query('COMMIT');
        res.json({ msg: `¡Cobro exitoso! Se descontaron ingredientes del combo.`, nuevoEstado: 'ganado' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error cobrar saldo:", err.message);
        res.status(400).json({ msg: err.message });
    } finally {
        client.release();
    }
};