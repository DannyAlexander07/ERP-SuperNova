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

// Crear nuevo lead + evento + señal + movimiento caja
exports.crearLead = async (req, res) => {

    console.log("📥 [DEBUG] Datos recibidos:", req.body);
    const { 
        nombre_apoderado, telefono, email, canal_origen, nombre_hijo, 
        fecha_tentativa, sede_interes, notas, 
        salon_id, 
        paquete_interes, // Puede ser texto o número
        valor_estimado,  // ⚠️ IMPORTANTE: Debe venir con monto para calcular el 50%
        hora_inicio, hora_fin
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 
    const sedeUsuarioId = req.usuario ? req.usuario.sede_id : null; 
    
    const client = await pool.connect(); 

    try {
        await client.query('BEGIN');

        const sedeId = sede_interes || sedeUsuarioId;
        const valorTotal = parseFloat(valor_estimado) || 0; // Asegura que sea número
        const montoSenal = valorTotal * 0.50; // Calcula el 50%

        console.log(`🧮 [DEBUG] Valor Total: ${valorTotal} | Señal (50%): ${montoSenal}`);

        // Validaciones básicas
        if (!fecha_tentativa || !hora_inicio || !hora_fin || !salon_id) {
             throw new Error("Fechas y Salón son obligatorios para reservar.");
        }

        // Obtener nombre del salón
        const salonRes = await client.query('SELECT nombre FROM salones WHERE id = $1', [salon_id]);
        const nombreSalon = salonRes.rows.length > 0 ? salonRes.rows[0].nombre : 'Sala Desconocida';

        // 1. Lógica Híbrida para Paquetes (Texto o ID)
        let paqueteIdParaEvento = null;
        if (paquete_interes && !isNaN(parseInt(paquete_interes))) {
            paqueteIdParaEvento = parseInt(paquete_interes);
        }

        const fechaInicioStr = `${fecha_tentativa} ${hora_inicio}:00`;
        const fechaFinStr = `${fecha_tentativa} ${hora_fin}:00`;

        // 2. VALIDACIÓN DE CHOQUE DE HORARIOS
        const choque = await client.query(
            `SELECT id FROM eventos 
             WHERE sede_id = $1 
             AND salon_id = $2 
             AND estado != 'cancelado'
             AND (fecha_inicio < $3 AND fecha_fin > $4)`,
            [sedeId, salon_id, fechaFinStr, fechaInicioStr] 
        );

        if (choque.rows.length > 0) {
             throw new Error(`⚠️ El salón ${nombreSalon} ya está ocupado en ese horario.`);
        }

        // 3. BUSCAR O CREAR CLIENTE
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

        // 4. CREAR EVENTO
        const eventoRes = await client.query(
            `INSERT INTO eventos (
                cliente_id, sede_id, titulo, fecha_inicio, fecha_fin, 
                salon_id, salon, estado, costo_total, acuenta, saldo, 
                paquete_id, usuario_creacion_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'reservado', $8, $9, $10, $11, $12) RETURNING id`,
            [
                clienteId, sedeId, `Cumpleaños: ${nombre_hijo} (${nombre_apoderado})`,
                fechaInicioStr, fechaFinStr,    
                salon_id, 
                nombreSalon, 
                valorTotal, montoSenal, (valorTotal - montoSenal), 
                paqueteIdParaEvento, 
                usuarioId
            ]
        );
        const eventoId = eventoRes.rows[0].id;

        console.log(`❓ [DEBUG] ¿Entra al cobro? MontoSeñal > 0? -> ${montoSenal > 0}`);

        // 5. REGISTRO DE PAGO Y CAJA (Solo si hay monto > 0)
        if (montoSenal > 0) {

            console.log("✅ [DEBUG] Entró al bloque IF. Intentando insertar en caja...");
            // A. Registrar el pago en la tabla de pagos
            const pagoRes = await client.query(
                `INSERT INTO pagos_evento (evento_id, usuario_id, monto, metodo_pago, nro_operacion)
                 VALUES ($1, $2, $3, 'transferencia', 'SEÑAL_AUTOMATICA') RETURNING id`,
                [eventoId, usuarioId, montoSenal]
            );
            
            // B. Registrar el movimiento en CAJA (ESTO ES LO QUE NO ESTÁ FUNCIONANDO)
            await client.query(
                `INSERT INTO movimientos_caja (
                    sede_id, usuario_id, tipo_movimiento, categoria, 
                    descripcion, 
                    monto, metodo_pago, pago_evento_id
                ) VALUES (
                    $1, $2, 'INGRESO', 'EVENTO_SEÑAL', 
                    'Señal: ' || $6 || ' (Evento #' || $3 || ')', 
                    $4, 'transferencia', $5
                )`,
                [
                    sedeId, 
                    usuarioId, 
                    eventoId, 
                    montoSenal, 
                    pagoRes.rows[0].id,
                    nombre_apoderado // Variable $6
                ]
            );
            console.log("💰 [DEBUG] ¡Insert en CAJA ejecutado!");
        }
        else {
            console.log("⛔ [DEBUG] NO entró al bloque de cobro (Monto es 0)");
        }

        // 6. CREAR LEAD (Estado 'nuevo')
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
                fecha_tentativa, sede_interes, salon_id, notas,
                paquete_interes, // Guardamos el texto original aquí
                valor_estimado, hora_inicio, hora_fin,
                usuarioId, clienteId, montoSenal,
                nombreSalon 
            ]
        );

        await client.query('COMMIT');
        res.json({ msg: 'Reserva exitosa', lead: leadRes.rows[0] });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ [ERROR CRÍTICO]:", err.message); // Esto nos dirá si falló el SQL
        res.status(400).json({ msg: `Error: ${err.message}` });
    } finally {
        client.release();
    }
};

exports.actualizarLead = async (req, res) => {
    const { id } = req.params;
    const { 
        nombre_apoderado, telefono, email, canal_origen, nombre_hijo, 
        fecha_tentativa, sede_interes, notas, salon_id,
        paquete_interes, valor_estimado, hora_inicio, hora_fin 
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Obtener nombre salón
        let nombreSalon = null;
        if (salon_id) {
            const salonRes = await client.query('SELECT nombre FROM salones WHERE id = $1', [salon_id]);
            if (salonRes.rows.length > 0) nombreSalon = salonRes.rows[0].nombre;
        }

        // 2. ACTUALIZAR LEAD
        await client.query(
            `UPDATE leads SET 
                nombre_apoderado=$1, telefono=$2, email=$3, canal_origen=$4, 
                nombre_hijo=$5, fecha_tentativa=$6, sede_interes=$7, notas=$8,
                salon_id=$9, sala_interes=$10, 
                paquete_interes=$11, valor_estimado=$12, hora_inicio=$13, hora_fin=$14,
                ultima_actualizacion=CURRENT_TIMESTAMP 
             WHERE id=$15`,
            [
                nombre_apoderado, telefono, email, canal_origen, 
                nombre_hijo || null, fecha_tentativa || null, sede_interes || null, notas || null, 
                salon_id || null, nombreSalon, paquete_interes, valor_estimado, 
                hora_inicio, hora_fin, id
            ]
        );

        // 3. SINCRONIZACIÓN Y RECALCULO FINANCIERO 🔥
        const leadCheck = await client.query('SELECT cliente_asociado_id FROM leads WHERE id = $1', [id]);
        
        if (leadCheck.rows.length > 0 && leadCheck.rows[0].cliente_asociado_id) {
            const clienteId = leadCheck.rows[0].cliente_asociado_id;
            
            // A. Calcular Historial de Pagos Real
            // Sumamos todo lo que ha entrado en CAJA para este cliente
            const pagosRes = await client.query(
                `SELECT COALESCE(SUM(monto), 0) as total_pagado 
                 FROM transacciones 
                 WHERE cliente_id = $1 AND tipo = 'INGRESO' AND estado != 'anulado'`,
                [clienteId]
            );
            
            const pagadoHastaHoy = parseFloat(pagosRes.rows[0].total_pagado);
            const nuevoCostoTotal = parseFloat(valor_estimado || 0);
            
            // B. Calcular Nuevo Saldo (Matemática Pura)
            // Si costaba 58 y pagó 29, saldo era 29.
            // Si ahora cuesta 580 y pagó 29, saldo será 551.
            let nuevoSaldo = nuevoCostoTotal - pagadoHastaHoy;
            if(nuevoSaldo < 0) nuevoSaldo = 0; // Por seguridad

            // C. Actualizar Evento (Fechas y Dinero)
            if (fecha_tentativa && hora_inicio && hora_fin) {
                const horaInicioClean = hora_inicio.substring(0, 5);
                const horaFinClean = hora_fin.substring(0, 5);
                const fechaInicioStr = `${fecha_tentativa} ${horaInicioClean}:00`;
                const fechaFinStr = `${fecha_tentativa} ${horaFinClean}:00`;
                
                await client.query(
                    `UPDATE eventos SET 
                        fecha_inicio = $1, fecha_fin = $2,
                        salon_id = $3, salon = $4, sede_id = $5,
                        titulo = $6,
                        costo_total = $7,
                        saldo = $8  -- << AQUÍ GUARDAMOS EL SALDO RECALCULADO
                     WHERE cliente_id = $9 AND estado != 'cancelado'`,
                    [
                        fechaInicioStr, fechaFinStr,
                        salon_id || null, nombreSalon, sede_interes,
                        `Cumpleaños: ${nombre_hijo} (${nombre_apoderado})`,
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
                [usuarioId, id, `Editó Lead ${nombre_apoderado} y recalculó saldo`]
            );
        }

        await client.query('COMMIT');
        res.json({ msg: 'Lead actualizado y saldo recalibrado.' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).send('Error del servidor');
    } finally {
        client.release();
    }
};


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

        // 2. Si tiene un cliente/evento asociado, procedemos a borrar el rastro financiero
        if (lead.cliente_asociado_id) {
            const clienteId = lead.cliente_asociado_id;

            // Buscar el evento asociado a este cliente (que no esté cancelado o sea el activo)
            // Nota: Buscamos por cliente y fecha aproximada o simplemente el último evento activo
            const eventoRes = await client.query(
                `SELECT id FROM eventos WHERE cliente_id = $1 ORDER BY id DESC LIMIT 1`,
                [clienteId]
            );

            if (eventoRes.rows.length > 0) {
                const eventoId = eventoRes.rows[0].id;

                // --- A. LIMPIEZA FINANCIERA (CAJA Y PAGOS) ---
                
                // Obtenemos los IDs de los pagos registrados para este evento
                const pagosRes = await client.query('SELECT id FROM pagos_evento WHERE evento_id = $1', [eventoId]);
                const pagosIds = pagosRes.rows.map(p => p.id);

                if (pagosIds.length > 0) {
                    // 1. Borrar movimientos de CAJA vinculados a estos pagos
                    // Usamos = ANY($1) para borrar varios de un golpe
                    await client.query(
                        `DELETE FROM movimientos_caja WHERE pago_evento_id = ANY($1::int[])`,
                        [pagosIds]
                    );

                    // 2. Borrar los PAGOS en sí
                    await client.query(
                        `DELETE FROM pagos_evento WHERE evento_id = $1`,
                        [eventoId]
                    );
                }

                // --- B. LIMPIEZA OPERATIVA (EVENTO) ---
                // Borramos el evento físico (ya que fue un error)
                await client.query('DELETE FROM eventos WHERE id = $1', [eventoId]);
            }
        }

        // 3. Finalmente borrar el Lead
        await client.query('DELETE FROM leads WHERE id = $1', [id]);

        // 4. Auditoría
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'ELIMINAR', 'CRM', $2, $3)`,
            [usuarioId, id, `Eliminó Lead ${lead.nombre_apoderado} y revirtió sus movimientos de caja.`]
        );

        await client.query('COMMIT');
        
        res.json({ msg: 'Lead eliminado y registros financieros revertidos.' });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error al eliminar lead:", err.message);
        res.status(500).json({ msg: "Error al eliminar: " + err.message });
    } finally {
        client.release();
    }
};


exports.cobrarSaldo = async (req, res) => {
    const { id } = req.params; // ID del Lead
    const { metodoPago } = req.body; 
    const usuarioId = req.usuario.id;
    // ❌ BORRADO: const sedeId = req.usuario.sede_id; (Esto causaba el error)

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Buscar Lead
        const leadRes = await client.query('SELECT * FROM leads WHERE id = $1', [id]);
        if (leadRes.rows.length === 0) throw new Error('Lead no encontrado');
        const lead = leadRes.rows[0];

        if (!lead.cliente_asociado_id) throw new Error('Sin evento asociado.');

        // 2. Buscar Evento y Deuda
        const eventoRes = await client.query(
            `SELECT * FROM eventos WHERE cliente_id = $1 AND estado != 'cancelado'`, 
            [lead.cliente_asociado_id]
        );

        if (eventoRes.rows.length === 0) throw new Error('No se encontró evento activo.');
        
        const evento = eventoRes.rows[0];
        
        // 🔥 CLAVE: Obtenemos la Sede REAL del evento
        const sedeReal = evento.sede_id; 

        // Validación: Si el saldo ya es 0
        if (parseFloat(evento.saldo) <= 0) {
            throw new Error('¡Este evento ya está pagado al 100%!');
        }

        const montoPagar = parseFloat(evento.saldo);

        // 3. Registrar en Tabla Auxiliar (pagos_evento)
        const pagoRes = await client.query(
            `INSERT INTO pagos_evento (evento_id, usuario_id, monto, metodo_pago, nro_operacion, tipo_pago)
             VALUES ($1, $2, $3, $4, 'PAGO_FINAL', 'SALDO') RETURNING id`,
            [evento.id, usuarioId, montoPagar, metodoPago || 'efectivo']
        );

        const pagoId = pagoRes.rows[0].id;

        // 4. Ingresar a CAJA (movimientos_caja)
        await client.query(
            `INSERT INTO movimientos_caja (
                sede_id, usuario_id, tipo_movimiento, categoria, 
                descripcion, monto, metodo_pago, pago_evento_id, fecha_registro, es_cuadre_caja
            ) VALUES (
                $1, $2, 'INGRESO', 'Cobro Evento', 
                $3, $4, $5, $6, CURRENT_TIMESTAMP, false
            )`,
            [
                sedeReal, // ✅ USAMOS LA SEDE DEL EVENTO (CORREGIDO)
                usuarioId, 
                `EVENTO_SALDO | Saldo Final: ${lead.nombre_apoderado} (Evento #${evento.id})`, 
                montoPagar, 
                metodoPago || 'efectivo', 
                pagoId
            ]
        );

        // 5. Actualizar Evento y Lead
        await client.query(
            `UPDATE eventos SET saldo = 0, acuenta = costo_total, estado = 'confirmado' WHERE id = $1`, 
            [evento.id]
        );
        
        // Pasamos el Lead a 'ganado' (o 'cerrado' según prefieras tu lógica interna)
        await client.query(
            `UPDATE leads SET estado = 'ganado' WHERE id = $1`, 
            [id]
        );

        await client.query('COMMIT');
        res.json({ msg: `¡Cobro exitoso de S/ ${montoPagar.toFixed(2)} en la sede correcta!`, nuevoEstado: 'ganado' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Error cobrar saldo:", err.message);
        res.status(400).json({ msg: err.message });
    } finally {
        client.release();
    }
};