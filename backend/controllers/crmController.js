//Ubicacion: SuperNova/backend/controllers/crmController.js
const pool = require('../db');
const facturacionController = require('./facturacionController');

exports.obtenerLeads = async (req, res) => {
    try {
        const query = `
            SELECT l.*, 
                   COALESCE(c.documento_id, c.ruc) AS documento,
                   p.nombre AS nombre_paquete
            FROM leads l
            LEFT JOIN clientes c ON l.cliente_asociado_id = c.id
            -- 🔥 CORRECCIÓN: Convertimos p.id a texto (varchar) para que no choque con paquete_interes
            LEFT JOIN productos p ON l.paquete_interes = p.id::varchar
            ORDER BY l.id DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error al obtener leads');
    } 
};

// =========================================================================
// 1. CREAR LEAD (Puro: Solo guarda el prospecto, no genera pagos ni ventas)
// =========================================================================
exports.crearLead = async (req, res) => {
    console.log("📥 [DEBUG] Iniciando crearLead Puro...");
    const { 
        nombre_apoderado, telefono, email, canal_origen, nombre_hijo, 
        fecha_tentativa, sede_interes, notas, 
        salon_id, paquete_interes, cantidad_ninos, valor_estimado,
        hora_inicio, hora_fin, vendedor_id, documento
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 
    
    const client = await pool.connect(); 

    try {
        await client.query('BEGIN');

        // 🔥 0. VALIDACIÓN ANTI-DOBLE RESERVA (CRUCE DE HORARIOS) 🔥
        if (fecha_tentativa && hora_inicio && hora_fin && sede_interes && salon_id) {
            const checkCruce = await client.query(`
                SELECT id, nombre_apoderado, hora_inicio, hora_fin 
                FROM leads 
                WHERE sede_interes = $1 
                  AND salon_id = $2 
                  AND fecha_tentativa = $3 
                  AND estado != 'perdido'
                  AND hora_inicio < $5 
                  AND hora_fin > $4
                LIMIT 1
            `, [sede_interes, salon_id, fecha_tentativa, hora_inicio, hora_fin]);

            if (checkCruce.rows.length > 0) {
                const cruce = checkCruce.rows[0];
                const hInicio = cruce.hora_inicio.substring(0, 5);
                const hFin = cruce.hora_fin.substring(0, 5);
                
                throw new Error(`⛔ Horario no disponible. Este salón ya está ocupado por el evento de ${cruce.nombre_apoderado} (de ${hInicio} a ${hFin}).`);
            }
        }

        const vendedorRealId = vendedor_id ? parseInt(vendedor_id) : usuarioId;

        // 1. Gestión de Fechas
        let fechaInicioObj = null;
        let fechaFinObj = null;
        if (fecha_tentativa && hora_inicio) {
            fechaInicioObj = new Date(`${fecha_tentativa} ${hora_inicio}:00`);
            if (hora_fin) {
                fechaFinObj = new Date(`${fecha_tentativa} ${hora_fin}:00`);
            }
        }

        // Lógica de Documento (DNI o RUC)
        let dni = null;
        let ruc = null;
        if (documento) {
            if (documento.trim().length === 11) {
                ruc = documento.trim();
            } else {
                dni = documento.trim();
            }
        }

        // 2. Gestionar Cliente (Directorio - Protege Identidad y Evita Duplicados)
        let clienteId = null;
        
        // A. Prioridad 1: Buscar por DNI o RUC (Es el identificador más fuerte)
        if (dni || ruc) {
            const docCheck = await client.query(
                `SELECT id FROM clientes WHERE (documento_id = $1 AND $1 IS NOT NULL) OR (ruc = $2 AND $2 IS NOT NULL) LIMIT 1`,
                [dni, ruc]
            );
            if (docCheck.rows.length > 0) {
                clienteId = docCheck.rows[0].id;
            }
        }

        // B. Prioridad 2: Si no lo encontró por DNI, buscar por teléfono
        if (!clienteId && telefono) {
            const telCheck = await client.query('SELECT id FROM clientes WHERE telefono = $1 LIMIT 1', [telefono]);
            if (telCheck.rows.length > 0) {
                clienteId = telCheck.rows[0].id;
            }
        }

        try {
            if (clienteId) {
                // Actualizamos datos básicos si el cliente ya existía
                await client.query(
                    `UPDATE clientes SET 
                        correo = COALESCE($1, correo),
                        nombre_completo = COALESCE($2, nombre_completo),
                        nombre_hijo = COALESCE($3, nombre_hijo),
                        documento_id = COALESCE($5, documento_id), 
                        ruc = COALESCE($6, ruc) 
                     WHERE id = $4`,
                    [email, nombre_apoderado, nombre_hijo, clienteId, dni, ruc]
                );
            } else {
                // Si es verdaderamente nuevo, lo creamos
                const nuevoCliente = await client.query(
                    `INSERT INTO clientes (nombre_completo, telefono, correo, nombre_hijo, documento_id, ruc, categoria, estado)
                     VALUES ($1, $2, $3, $4, $5, $6, 'nuevo', 'activo') RETURNING id`,
                    [nombre_apoderado, telefono, email, nombre_hijo, dni, ruc]
                );
                clienteId = nuevoCliente.rows[0].id;
            }
        } catch (dbErr) {
            // 🔥 TRADUCIMOS EL ERROR FEO DE LA BASE DE DATOS A UNO AMIGABLE 🔥
            if (dbErr.constraint === 'clientes_documento_id_key' || dbErr.constraint === 'clientes_ruc_key') {
                throw new Error("⛔ El DNI o RUC ingresado ya le pertenece a otro cliente registrado.");
            }
            throw dbErr; // Si es otro error, lo lanzamos normal
        }

        // 3. Crear Lead en CRM con todos los campos necesarios
        const paqueteIdInt = paquete_interes ? parseInt(paquete_interes) : null;
        const valorEstimadoFinal = valor_estimado ? parseFloat(valor_estimado) : 0;
        const ninosFinal = cantidad_ninos ? parseInt(cantidad_ninos) : 15;
        
        const leadRes = await client.query(
            `INSERT INTO leads (
                nombre_apoderado, 
                telefono, 
                email, 
                canal_origen, 
                nombre_hijo, 
                fecha_tentativa, 
                sede_interes, 
                salon_id, 
                notas, 
                paquete_interes, 
                cantidad_ninos, 
                valor_estimado, 
                hora_inicio, 
                hora_fin, 
                estado, 
                usuario_asignado_id, 
                cliente_asociado_id, 
                pago_inicial, 
                vendedor_id,
                ultima_actualizacion
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'nuevo', $15, $16, 0, $17, CURRENT_TIMESTAMP) 
            RETURNING *`,
            [
                nombre_apoderado, telefono, email, canal_origen, nombre_hijo, fecha_tentativa, 
                sede_interes ? parseInt(sede_interes) : null, salon_id ? parseInt(salon_id) : null, 
                notas || '', paqueteIdInt, ninosFinal, valorEstimadoFinal, 
                hora_inicio || null, hora_fin || null, usuarioId, clienteId, vendedorRealId
            ]
        );

        await client.query('COMMIT');
        res.json({ 
            msg: 'Prospecto (Lead) registrado correctamente.', 
            lead: leadRes.rows[0] 
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ ERROR crearLead:", err.message);
        res.status(400).json({ msg: err.message });
    } finally {
        client.release();
    }
};

// =========================================================================
// 🔥 ACTUALIZADO: REGISTRAR ADELANTO / RESERVA (ESTILO POS / NUBEFACT) 🔥
// Lógica corregida para evitar cambios de estado prematuros a "ganado"
// =========================================================================
exports.registrarPagoLead = async (req, res) => {
    console.log("💰 [DEBUG] Registrando Pago Adelanto Lead...");
    const { id } = req.params;
    // ✅ CORRECCIÓN: Agregamos formato_pdf y formato_impresion
    const { monto, metodoPago, nroOperacion, comprobante, formato_pdf, formato_impresion } = req.body;
    
    if (!req.usuario) return res.status(401).json({ msg: "Sesión no válida." });
    
    const usuarioId = req.usuario.id;
    const sedeUsuarioId = req.usuario.sede_id; 
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Obtener Datos del Lead con bloqueo para evitar colisiones
        const leadRes = await client.query('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [id]);
        if (leadRes.rows.length === 0) throw new Error('Lead no encontrado');
        const lead = leadRes.rows[0];

        const montoAbono = parseFloat(monto);
        if (montoAbono <= 0) throw new Error('El monto debe ser mayor a 0');

        // --- VALIDACIÓN DE SALDO REAL ---
        const costoTotalBase = parseFloat(lead.valor_estimado || 0);
        const yaPagadoBase = parseFloat(lead.pago_inicial || 0);
        const saldoRealMaximo = costoTotalBase - yaPagadoBase;

        // Validamos con un margen de error de 0.01 por temas de redondeo decimal
        if (montoAbono > (saldoRealMaximo + 0.01)) {
            throw new Error(`Operación denegada: El monto S/ ${montoAbono.toFixed(2)} supera el saldo pendiente de S/ ${saldoRealMaximo.toFixed(2)}`);
        }

        const sedeId = lead.sede_interes || sedeUsuarioId;
        const clienteId = lead.cliente_asociado_id;

        // 2. Determinar Producto y Costo
        let paqueteId = lead.paquete_interes ? parseInt(lead.paquete_interes) : null;
        let nombrePaquete = "Evento Personalizado";
        let costoTotalEstimado = costoTotalBase;
        let productoPrincipal = { controla_stock: false, tipo_item: 'servicio', costo_compra: 0 }; // 🔥 Agregado

        if (paqueteId) {
            // 🔥 Actualizado para traer controles de stock
            const prodRes = await client.query('SELECT nombre, controla_stock, tipo_item, costo_compra FROM productos WHERE id = $1', [paqueteId]);
            if (prodRes.rows.length > 0) {
                nombrePaquete = prodRes.rows[0].nombre;
                productoPrincipal = prodRes.rows[0]; // 🔥 Agregado
            }
        }

        const saldoRestante = costoTotalEstimado - (yaPagadoBase + montoAbono);
        const nuevoSaldo = saldoRestante > 0 ? saldoRestante : 0;

        // 3. Crear o Actualizar el EVENTO Oficial
        let eventoId;
        const eventoCheck = await client.query("SELECT id FROM eventos WHERE cliente_id = $1 AND estado != 'cancelado'", [clienteId]);
        
        if (eventoCheck.rows.length === 0) {
            const salonRes = await client.query('SELECT nombre FROM salones WHERE id = $1', [lead.salon_id]);
            const nombreSalon = salonRes.rows.length > 0 ? salonRes.rows[0].nombre : 'Sala General';
            const tituloEvento = `Cumpleaños: ${lead.nombre_hijo || 'Reserva'} (${lead.cantidad_ninos || 15} niños)`;

            const eventoInsert = await client.query(
                `INSERT INTO eventos (
                    cliente_id, sede_id, titulo, fecha_inicio, fecha_fin, 
                    salon_id, salon, estado, costo_total, acuenta, saldo, 
                    paquete_id, usuario_creacion_id
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'confirmado', $8, $9, $10, $11, $12) RETURNING id`,
                [
                    clienteId, sedeId, tituloEvento, lead.fecha_tentativa, lead.hora_fin ? lead.fecha_tentativa : null, 
                    lead.salon_id, nombreSalon, costoTotalEstimado, (yaPagadoBase + montoAbono), nuevoSaldo, 
                    paqueteId, usuarioId
                ]
            );
            eventoId = eventoInsert.rows[0].id;
        } else {
            eventoId = eventoCheck.rows[0].id;
            await client.query(
                `UPDATE eventos SET acuenta = acuenta + $1, saldo = $2, estado = 'confirmado' WHERE id = $3`,
                [montoAbono, nuevoSaldo, eventoId]
            );
        }

        // 4. Registrar Pago del Evento
        const pagoRes = await client.query(
            `INSERT INTO pagos_evento (evento_id, usuario_id, monto, metodo_pago, nro_operacion, tipo_pago)
             VALUES ($1, $2, $3, $4, $5, 'RESERVA') RETURNING id`,
            [eventoId, usuarioId, montoAbono, metodoPago, nroOperacion || '']
        );

        // 5. REGISTRAR VENTA (SINCRONIZADA Y CORREGIDA)
        const maxTicketRes = await client.query('SELECT COALESCE(MAX(numero_ticket_sede), 0) as max_num FROM ventas WHERE sede_id = $1', [sedeId]);
        const numeroTicketSede = parseInt(maxTicketRes.rows[0].max_num) + 1;

        const tipoDocDb = comprobante.tipo.toUpperCase(); 
        const estadoSunat = (tipoDocDb === 'FACTURA' || tipoDocDb === 'BOLETA') ? 'PENDIENTE' : 'NO_APLICA';

        const rucFactura = tipoDocDb === 'FACTURA' ? comprobante.documento : null;
        const razonSocialFactura = tipoDocDb === 'FACTURA' ? comprobante.nombre : null;

        // 🔥 CORRECCIÓN AQUÍ: Se asegura que haya 15 marcadores ($1 al $15)
        const ventaRes = await client.query(
            `INSERT INTO ventas (
                sede_id, usuario_id, cliente_id, total_venta, metodo_pago, 
                fecha_venta, tipo_comprobante, doc_cliente_temporal, nombre_cliente_temporal, ruc_cliente_factura, 
                razon_social_factura, estado, sunat_estado, tipo_venta, linea_negocio, 
                vendedor_id, numero_ticket_sede, observaciones, origen
            ) VALUES (
                $1, $2, $3, $4, $5, 
                CURRENT_TIMESTAMP, $6, $7, $8, $9, 
                $10, $11, $12, $13, $14, 
                $15, $16, $17, $18
            ) RETURNING id`, // 👈 Ahora tenemos 18 posiciones mapeadas correctamente
            [
                sedeId,              // $1
                usuarioId,           // $2
                clienteId,           // $3
                montoAbono,          // $4
                metodoPago,          // $5
                tipoDocDb,           // $6
                comprobante.documento || '', // $7
                comprobante.nombre || '',    // $8
                rucFactura,          // $9
                razonSocialFactura,  // $10
                'completado',        // $11 (estado)
                estadoSunat,         // $12 (sunat_estado)
                'Evento',            // $13 (tipo_venta)
                'EVENTOS',           // $14 (linea_negocio)
                lead.vendedor_id,    // $15 (vendedor_id)
                numeroTicketSede,    // $16 (numero_ticket_sede)
                `Adelanto Evento CRM: ${lead.nombre_hijo || ''}`, // $17 (observaciones)
                'CRM'                // $18 (origen)
            ]
        );
        const ventaId = ventaRes.rows[0].id;

        
        await client.query(
            `INSERT INTO detalle_ventas (venta_id, producto_id, nombre_producto_historico, cantidad, precio_unitario, subtotal)
             VALUES ($1, $2, $3, 1, $4, $5)`,
            // 🔥 CORRECCIÓN: Pasamos el paqueteId en lugar de 'null'
            [ventaId, paqueteId || null, `ADELANTO RESERVA: ${nombrePaquete} (${lead.cantidad_ninos || 15} pax)`, montoAbono, montoAbono]
        );

        // 6. Registrar en CAJA CHICA
        await client.query(
            `INSERT INTO movimientos_caja (
                sede_id, usuario_id, tipo_movimiento, categoria, 
                descripcion, monto, metodo_pago, pago_evento_id, venta_id
            ) VALUES ($1, $2, 'INGRESO', 'EVENTO_SEÑAL', $3, $4, $5, $6, $7)`,
            [
                sedeId, usuarioId, `Abono Reserva: ${comprobante.nombre}`, 
                montoAbono, metodoPago, pagoRes.rows[0].id, ventaId
            ]
        );

        // --- 7. ACTUALIZACIÓN INTELIGENTE DEL ESTADO DEL LEAD ---
        const nuevoAcumuladoTotal = yaPagadoBase + montoAbono;
        
        // Solo pasa a 'ganado' si el saldo es 0. 
        // De lo contrario, lo ponemos en 'seguimiento' para indicar que hay un proceso de pago activo.
        let estadoFinalCalculado = 'seguimiento';
        if (nuevoAcumuladoTotal >= (costoTotalEstimado - 0.01)) {
            estadoFinalCalculado = 'ganado';
        }

        await client.query(
            `UPDATE leads SET 
                estado = $1, 
                pago_inicial = $2, 
                metodo_pago = $3, 
                nro_operacion = $4, 
                ultima_actualizacion = CURRENT_TIMESTAMP 
             WHERE id = $5`,
            [estadoFinalCalculado, nuevoAcumuladoTotal, metodoPago, nroOperacion || '', id]
        );

        // 🔥 LÓGICA DE INVENTARIO PEPS (SOLO SI EL PAGO LLEGA AL 100%) 🔥
        if (estadoFinalCalculado === 'ganado' && paqueteId && productoPrincipal.controla_stock && productoPrincipal.tipo_item !== 'servicio') {
            
            const cantidadNinosFinal = parseInt(lead.cantidad_ninos) || 0; // Ejemplo: 48 niños
            console.log(`📦 [DEBUG] Pago total detectado. Procesando stock para ${cantidadNinosFinal} niños...`);

            // A. Buscar la receta del COMBO (Ingredientes)
            const recetaRes = await client.query(
                `SELECT r.producto_hijo_id AS ingrediente_id, r.cantidad as cantidad_receta, p.nombre, p.costo_compra 
                 FROM productos_combo r
                 JOIN productos p ON r.producto_hijo_id = p.id
                 WHERE r.producto_padre_id = $1`, 
                [paqueteId]
            );

            if (recetaRes.rows.length > 0) {
                // === CASO 1: ES UN COMBO (Se descuentan los insumos Y el padre) ===
                for (const ing of recetaRes.rows) {
                    const totalADescontar = parseFloat(ing.cantidad_receta) * cantidadNinosFinal;
                    if (totalADescontar > 0) {
                        await ejecutarDescuentoPEPS(
                            client, 
                            ing.ingrediente_id, 
                            sedeId, 
                            totalADescontar, 
                            usuarioId, 
                            eventoId, 
                            `Insumo de: ${nombrePaquete}`
                        );
                    }
                }
                // 🔥 AHORA TAMBIÉN DESCONTAMOS EL COMBO PADRE
                await ejecutarDescuentoPEPS(
                    client,
                    paqueteId,
                    sedeId,
                    cantidadNinosFinal,
                    usuarioId,
                    eventoId,
                    `Venta Paquete: ${nombrePaquete}`
                );

            } else {
                // === CASO 2: ES UN PRODUCTO SIMPLE (Se descuenta la unidad por cada niño) ===
                await ejecutarDescuentoPEPS(
                    client, 
                    paqueteId, 
                    sedeId, 
                    cantidadNinosFinal, 
                    usuarioId, 
                    eventoId, 
                    `Venta: ${nombrePaquete}`
                );
            }
        }

        await client.query('COMMIT');

        // Disparar facturación asíncrona
        if (tipoDocDb === 'FACTURA' || tipoDocDb === 'BOLETA') {
            setImmediate(() => {
                
                // 🔥 CORRECCIÓN: Leemos cualquiera de las dos variables que mande el frontend
                let codFormato = '3'; // Ticket por defecto
                const formatoRecibido = (formato_pdf || formato_impresion || "3").toString().toLowerCase();

                if (formatoRecibido === '1' || formatoRecibido === 'a4') codFormato = '1';
                else if (formatoRecibido === '2' || formatoRecibido === 'a5') codFormato = '2';

                console.log("=== RASTREO EN ADELANTO ===");
                console.log("Formato recibido:", formatoRecibido, "-> Convertido a:", codFormato);

                facturacionController.emitirComprobante({
                    body: { 
                        venta_id: ventaId, 
                        formato_pdf: codFormato,      // ✅ Envío seguro 1
                        formato_impresion: codFormato // ✅ Envío seguro 2
                    },
                    usuario: req.usuario 
                }, {
                    json: (d) => console.log(`✅ [NUBEFACT] Procesado:`, d.msg || 'Éxito'),
                    status: () => ({ json: (e) => console.error(`❌ [NUBEFACT] Error:`, e.msg || e) })
                });
            });
        }

        res.json({ 
            msg: `Pago de S/ ${montoAbono.toFixed(2)} registrado. Estado actualizado a ${estadoFinalCalculado}. Stock actualizado.`,
            nuevoEstado: estadoFinalCalculado
        });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ ERROR en registrarPagoLead:", err.message);
        res.status(400).json({ msg: err.message });
    } finally {
        if (client) client.release();
    }
};

// EDIT LEAD (CORRECTED: UPDATES SALES HISTORY DESCRIPTION & SECURE DNI/RUC)
exports.actualizarLead = async (req, res) => {
    const { id } = req.params;
    const { 
        nombre_apoderado, telefono, email, canal_origen, nombre_hijo, 
        fecha_tentativa, sede_interes, notas, salon_id,
        paquete_interes, valor_estimado, hora_inicio, hora_fin,
        cantidad_ninos, vendedor_id, metodo_pago,
        nro_operacion, documento
    } = req.body;
    
    const usuarioId = req.usuario ? req.usuario.id : null; 
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 🔥 0. VALIDACIÓN ANTI-DOBLE RESERVA (CRUCE DE HORARIOS) 🔥
        if (fecha_tentativa && hora_inicio && hora_fin && sede_interes && salon_id) {
            const checkCruce = await client.query(`
                SELECT id, nombre_apoderado, hora_inicio, hora_fin 
                FROM leads 
                WHERE sede_interes = $1 
                  AND salon_id = $2 
                  AND fecha_tentativa = $3 
                  AND id != $6 -- Excluimos el ID del propio Lead
                  AND estado != 'perdido' 
                  AND hora_inicio < $5 
                  AND hora_fin > $4
                LIMIT 1
            `, [sede_interes, salon_id, fecha_tentativa, hora_inicio, hora_fin, id]);

            if (checkCruce.rows.length > 0) {
                const cruce = checkCruce.rows[0];
                const hInicio = cruce.hora_inicio.substring(0, 5);
                const hFin = cruce.hora_fin.substring(0, 5);
                
                throw new Error(`⛔ No puedes cambiar a este horario. El salón ya está reservado por ${cruce.nombre_apoderado} (de ${hInicio} a ${hFin}).`);
            }
        }

        // 1. Prepare Data
        const cantidadPax = parseInt(cantidad_ninos) || 0;
        
        let textoNotasLimpias = (notas || '').replace(/Niños:\s*\d+\.?\s*/i, '').trim();
        const notaFinal = `Niños: ${cantidadPax}. ${textoNotasLimpias}`;

        let nombreSalon = null;

        // 2. UPDATE LEAD
        await client.query(
            `UPDATE leads SET 
                nombre_apoderado=$1, telefono=$2, email=$3, canal_origen=$4, 
                nombre_hijo=$5, fecha_tentativa=$6, sede_interes=$7, 
                notas=$8, salon_id=$9, sala_interes=$10, 
                paquete_interes=$11, valor_estimado=$12, hora_inicio=$13, hora_fin=$14,
                vendedor_id=$15, metodo_pago=$16, nro_operacion=$17,
                cantidad_ninos=$18, 
                ultima_actualizacion=CURRENT_TIMESTAMP 
             WHERE id=$19`, 
            [
                nombre_apoderado, telefono, email, canal_origen, 
                nombre_hijo || null, fecha_tentativa || null, sede_interes || null, 
                notaFinal, salon_id || null, nombreSalon, 
                paquete_interes, valor_estimado, hora_inicio, hora_fin,
                vendedor_id || null, metodo_pago || null, nro_operacion || null, 
                cantidadPax, // $18
                id           // $19
            ]
        );

        // 3. DATA SYNCHRONIZATION (Event and Sales)
        const leadCheck = await client.query('SELECT cliente_asociado_id FROM leads WHERE id = $1', [id]);
        
        if (leadCheck.rows.length > 0 && leadCheck.rows[0].cliente_asociado_id) {
            const clienteId = leadCheck.rows[0].cliente_asociado_id;
            
            // 🔥 INTELIGENCIA PARA DNI / RUC AL EDITAR
            let dni = null;
            let ruc = null;
            if (documento) {
                if (documento.trim().length === 11) {
                    ruc = documento.trim();
                } else {
                    dni = documento.trim();
                }
            }

            try {
                // Actualizamos la tabla de clientes (Y puede explotar si el DNI ya existe)
                await client.query(
                    `UPDATE clientes SET 
                        nombre_completo = $1, 
                        telefono = $2, 
                        correo = $3,
                        documento_id = COALESCE($5, documento_id),
                        ruc = COALESCE($6, ruc)
                     WHERE id = $4`,
                    [nombre_apoderado, telefono, email, clienteId, dni, ruc]
                );
            } catch (dbErr) {
                // 🔥 TRADUCTOR DE ERROR AMIGABLE 🔥
                if (dbErr.constraint === 'clientes_documento_id_key' || dbErr.constraint === 'clientes_ruc_key') {
                    throw new Error("⛔ El DNI o RUC ingresado ya le pertenece a otro cliente registrado.");
                }
                throw dbErr;
            }

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

            // D. UPDATE SALE DETAIL DESCRIPTION
            const paqueteIdInt = paquete_interes ? parseInt(paquete_interes) : null;
            let nombrePaquete = "Evento Personalizado";
            
            if (paqueteIdInt) {
                const prodRes = await client.query('SELECT nombre FROM productos WHERE id = $1', [paqueteIdInt]);
                if (prodRes.rows.length > 0) nombrePaquete = prodRes.rows[0].nombre;
            }

            const nuevaDescripcion = `ADELANTO: ${nombrePaquete} (${cantidadPax} pax)`;

            const ventaRes = await client.query(
                `SELECT id FROM ventas WHERE cliente_id = $1 AND linea_negocio = 'EVENTOS' ORDER BY id DESC LIMIT 1`,
                [clienteId]
            );

            if (ventaRes.rows.length > 0) {
                const ventaId = ventaRes.rows[0].id;
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
        
        // 🔥 SI EL ERROR VIENE DEL DNI, ENVIAMOS SOLO EL MENSAJE AMIGABLE
        if (err.message.includes("⛔ El DNI o RUC")) {
            res.status(400).json({ msg: err.message });
        } else {
            res.status(500).json({ msg: 'Error del servidor: ' + err.message });
        }
    } finally {
        client.release();
    }
};

// ACTUALIZAR ESTADO DEL LEAD (CORREGIDO: Evita duplicación de eventos y dinero en caja)
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

        // 1. Obtener datos actuales del Lead
        const leadRes = await client.query('SELECT * FROM leads WHERE id = $1', [id]);
        if (leadRes.rows.length === 0) throw new Error('Lead no encontrado');
        const lead = leadRes.rows[0];

        // 2. Actualizar el estado en el CRM
        await client.query(
            'UPDATE leads SET estado = $1, ultima_actualizacion = CURRENT_TIMESTAMP WHERE id = $2',
            [nuevoEstado, id]
        );

        // 3. 🔥 CORRECCIÓN CRÍTICA: 
        // Si el estado es "ganado", NO creamos un evento nuevo ni metemos dinero a caja, 
        // porque eso YA SE HIZO en la función crearLead. Solo confirmamos el evento existente.
        if (nuevoEstado === 'ganado' && lead.cliente_asociado_id) {
            await client.query(
                `UPDATE eventos 
                 SET estado = 'confirmado' 
                 WHERE cliente_id = $1 AND estado = 'reservado'`,
                [lead.cliente_asociado_id]
            );
        }

        // 4. Registro de Auditoría
        await client.query(
            `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
             VALUES ($1, 'MOVER_KANBAN', 'CRM', $2, $3)`,
            [usuarioId, id, `Movió a ${lead.nombre_apoderado} a ${nuevoEstado}`]
        );

        await client.query('COMMIT');
        
        // Mensaje dinámico según la acción
        let msgRespuesta = `Estado actualizado a ${nuevoEstado}.`;
        if (nuevoEstado === 'ganado') {
            msgRespuesta = `¡Lead Ganado! El evento de ${lead.nombre_hijo || 'su hijo(a)'} ha sido confirmado.`;
        }

        res.json({ msg: msgRespuesta, id, nuevoEstado });

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
                c.telefono AS telefono_cliente,
                sa.nombre AS nombre_sala_real,
                p.nombre AS nombre_paquete,
                -- 🔥 EXTRAEMOS LAS HORAS DIRECTAMENTE DEL LEAD 🔥
                (SELECT hora_inicio FROM leads l WHERE l.cliente_asociado_id = c.id ORDER BY id DESC LIMIT 1) as lead_hora_inicio,
                (SELECT hora_fin FROM leads l WHERE l.cliente_asociado_id = c.id ORDER BY id DESC LIMIT 1) as lead_hora_fin
            FROM eventos e
            JOIN sedes s ON e.sede_id = s.id
            LEFT JOIN salones sa ON e.salon_id = sa.id
            JOIN clientes c ON e.cliente_id = c.id
            LEFT JOIN productos p ON e.paquete_id = p.id
            WHERE 1=1
        `;

        const params = [];
        if (sede && sede !== "") {
            query += ` AND e.sede_id = $1`;
            params.push(sede);
        }

        query += ` ORDER BY e.fecha_inicio DESC LIMIT 200`; 
        
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

//Eliminar Lead + Anulación en SUNAT, Caja y Evento (Con Reintegro Seguro al Kardex)
exports.eliminarLead = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    const usuarioId = req.usuario ? req.usuario.id : null;
    
    // Importamos el servicio de facturación para anular boletas
    const facturadorService = require('../utils/facturadorService');
    
    try {
        await client.query('BEGIN');
        
        // 1. Obtener datos del Lead y el evento asociado antes de borrar
        const leadRes = await client.query('SELECT * FROM leads WHERE id = $1', [id]);
        if (leadRes.rows.length === 0) throw new Error('Lead no encontrado.');
        const lead = leadRes.rows[0];

        // 2. Si tiene un cliente asociado, evaluamos reposición de stock y boletas
        if (lead.cliente_asociado_id) {
            const clienteId = lead.cliente_asociado_id;

            const eventoRes = await client.query(`SELECT * FROM eventos WHERE cliente_id = $1 ORDER BY id DESC LIMIT 1`, [clienteId]);
            
            if (eventoRes.rows.length > 0) {
                const evento = eventoRes.rows[0];
                const sedeId = evento.sede_id;
                const paqueteId = lead.paquete_interes || evento.paquete_id; 
                const cantidadAReponer = parseInt(lead.cantidad_ninos) || 0;

                // 🔥 LA SOLUCIÓN ESTÁ AQUÍ 🔥
                // ¿Cómo sabemos que el stock sí salió? 
                // Porque el evento se finalizó OR porque el Lead se ganó pagando el 100%.
                const stockFueDescontado = (evento.estado === 'finalizado' || lead.estado === 'ganado');

                if (stockFueDescontado && paqueteId && cantidadAReponer > 0) {
                    const esCombo = await client.query('SELECT producto_hijo_id, cantidad FROM productos_combo WHERE producto_padre_id = $1', [paqueteId]);
                    
                    // Función interna de reintegro blindado
                    const reintegrarInventario = async (idProducto, cantidadDevolver, tipoTexto) => {
                        const pInfo = await client.query('SELECT controla_stock, costo_compra, nombre FROM productos WHERE id = $1', [idProducto]);
                        if (pInfo.rows.length === 0 || !pInfo.rows[0].controla_stock) return;

                        const costo = parseFloat(pInfo.rows[0].costo_compra) || 0;
                        const nombreProd = pInfo.rows[0].nombre;

                        // 1. Devolver el stock físico a la Sede
                        const stockCheck = await client.query('SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE', [idProducto, sedeId]);
                        let nuevoStock = cantidadDevolver;

                        if (stockCheck.rows.length === 0) {
                            await client.query('INSERT INTO inventario_sedes (sede_id, producto_id, cantidad) VALUES ($1, $2, $3)', [sedeId, idProducto, cantidadDevolver]);
                        } else {
                            nuevoStock = parseInt(stockCheck.rows[0].cantidad) + cantidadDevolver;
                            await client.query('UPDATE inventario_sedes SET cantidad = $1 WHERE producto_id = $2 AND sede_id = $3', [nuevoStock, idProducto, sedeId]);
                        }

                        // 2. Registrar la ENTRADA en el Kardex (Con precio_venta_historico en 0)
                        await client.query(
                            `INSERT INTO movimientos_inventario 
                            (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento, precio_venta_historico, fecha)
                             VALUES ($1, $2, $3, 'entrada_anulacion', $4, $5, $6, $7, 0, CURRENT_TIMESTAMP)`,
                            [
                                sedeId, 
                                idProducto, 
                                usuarioId, 
                                cantidadDevolver, 
                                nuevoStock, 
                                `Reintegro por Anulación CRM - ${tipoTexto}: ${nombreProd}`, 
                                costo
                            ]
                        );
                    };

                    if (esCombo.rows.length > 0) {
                        // Devolver insumos (Mayonesa, Pan, etc.)
                        for (const hijo of esCombo.rows) {
                            const totalInsumo = parseInt(hijo.cantidad) * cantidadAReponer;
                            if (totalInsumo > 0) {
                                await reintegrarInventario(hijo.producto_hijo_id, totalInsumo, 'Insumo');
                            }
                        }
                        // Devolver el Combo (Padre)
                        await reintegrarInventario(paqueteId, cantidadAReponer, 'Paquete');
                    } else {
                        // Devolver producto simple
                        await reintegrarInventario(paqueteId, cantidadAReponer, 'Unidad');
                    }
                } else {
                    console.log(`ℹ️ Lead ${id}: No se reintegra stock porque el estado era '${evento.estado}' y Lead '${lead.estado}' (Nunca salió mercancía).`);
                }

                // --- A. ANULAR VENTAS EN SUNAT Y CAJA ---
                const ventasRes = await client.query(
                    `SELECT * FROM ventas WHERE cliente_id = $1 AND linea_negocio = 'EVENTOS'`,
                    [clienteId]
                );

                for (const venta of ventasRes.rows) {
                    const ventaId = venta.id;

                    if (venta.serie && venta.correlativo && venta.sunat_estado !== 'ANULADA') {
                        try {
                            const configRes = await client.query('SELECT api_url, api_token FROM nufect_config WHERE sede_id = $1 AND estado = TRUE LIMIT 1', [venta.sede_id]);

                            if (configRes.rows.length > 0) {
                                const config = configRes.rows[0];
                                const nubefactRes = await facturadorService.anularComprobante({
                                    ruta: config.api_url,   
                                    token: config.api_token,
                                    tipo_de_comprobante: venta.tipo_comprobante.toLowerCase() === 'factura' ? 1 : 2,
                                    serie: venta.serie,
                                    numero: venta.correlativo,
                                    motivo: "ANULACION DE RESERVA DESDE CRM",
                                    codigo_unico: `SUPERNOVA-V${ventaId}`
                                });
                                
                                if (!nubefactRes.errors) {
                                    await client.query(
                                        `UPDATE ventas SET sunat_estado = 'ANULADA', estado = 'anulada', observaciones = COALESCE(observaciones, '') || ' [ANULADA SUNAT TICKET: ' || $1 || ']' WHERE id = $2`,
                                        [nubefactRes.sunat_ticket_numero || 'S/N', ventaId]
                                    );
                                } else {
                                    await client.query(`UPDATE ventas SET sunat_estado = 'ANULADA', estado = 'anulada', observaciones = COALESCE(observaciones, '') || ' [ERROR NUBEFACT]' WHERE id = $1`, [ventaId]);
                                }
                            } else {
                                await client.query(`UPDATE ventas SET sunat_estado = 'ANULADA', estado = 'anulada' WHERE id = $1`, [ventaId]);
                            }
                        } catch (err) {
                            await client.query(`UPDATE ventas SET sunat_estado = 'ANULADA', estado = 'anulada' WHERE id = $1`, [ventaId]);
                        }
                    } else {
                        await client.query(`UPDATE ventas SET sunat_estado = 'ANULADA', estado = 'anulada' WHERE id = $1`, [ventaId]);
                    }

                    // Anulamos el dinero en Caja Chica (monto = 0)
                    await client.query(
                        `UPDATE movimientos_caja SET descripcion = '(ANULADO CRM) ' || descripcion, monto = 0 WHERE venta_id = $1`, 
                        [ventaId]
                    );
                }

                // --- B. LIMPIEZA INTERNA DEL CRM (Eventos y Pagos) ---
                const eventoId = evento.id;
                const pagosRes = await client.query('SELECT id FROM pagos_evento WHERE evento_id = $1', [eventoId]);
                const pagosIds = pagosRes.rows.map(p => p.id);

                if (pagosIds.length > 0) {
                    await client.query(`UPDATE movimientos_caja SET descripcion = '(ANULADO CRM) ' || descripcion, monto = 0, pago_evento_id = NULL WHERE pago_evento_id = ANY($1::int[])`, [pagosIds]);
                    await client.query(`DELETE FROM pagos_evento WHERE evento_id = $1`, [eventoId]);
                }
                
                await client.query('DELETE FROM eventos WHERE id = $1', [eventoId]);
            }
        }

        // 3. Finalmente borrar el Lead (CRM)
        await client.query('DELETE FROM leads WHERE id = $1', [id]);

        // 4. Auditoría
        if (usuarioId) {
            await client.query(
                `INSERT INTO auditoria (usuario_id, accion, modulo, registro_id, detalle) 
                 VALUES ($1, 'ELIMINAR', 'CRM', $2, $3)`,
                [usuarioId, id, `Eliminó Lead y anuló boletas en SUNAT. Se reintegró stock si correspondía.`]
            );
        }

        await client.query('COMMIT');
        
        res.json({ msg: 'Lead eliminado, boletas anuladas en SUNAT y stock reintegrado correctamente.' });
        
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("❌ Error al eliminar lead:", err.message);
        res.status(500).json({ msg: "Error al eliminar: " + err.message });
    } finally {
        client.release();
    }
};

// --- OBTENER HISTORIAL DE PAGOS DE UN LEAD (CORREGIDO: USA PUENTE DE CAJA) ---
exports.obtenerPagosLead = async (req, res) => {
    const { id } = req.params; // ID del Lead que llega por la URL

    try {
        // 1. Buscamos el cliente_asociado_id vinculado al lead
        const leadRes = await pool.query(
            'SELECT cliente_asociado_id FROM leads WHERE id = $1', 
            [id]
        );
        
        // Si el lead no existe o no tiene cliente, devolvemos lista vacía
        if (leadRes.rows.length === 0 || !leadRes.rows[0].cliente_asociado_id) {
            return res.json([]); 
        }

        const clienteId = leadRes.rows[0].cliente_asociado_id;

        // 2. Consultamos el historial usando movimientos_caja como puente
        // Unimos pagos_evento con movimientos_caja para poder llegar a la tabla ventas
        const query = `
            SELECT 
                p.id,
                p.monto,
                p.fecha_pago,
                p.metodo_pago,
                p.nro_operacion,
                p.tipo_pago,
                u.nombres as usuario_recibio,
                v.doc_cliente_temporal as documento_usado, -- Captura el DNI/RUC desde ventas
                v.tipo_comprobante as comprobante_tipo      -- Captura Boleta/Factura desde ventas
            FROM pagos_evento p
            JOIN eventos e ON p.evento_id = e.id
            JOIN usuarios u ON p.usuario_id = u.id
            -- 🔥 CONEXIÓN POR PUENTE: pagos_evento -> movimientos_caja -> ventas
            LEFT JOIN movimientos_caja mc ON mc.pago_evento_id = p.id
            LEFT JOIN ventas v ON mc.venta_id = v.id 
            WHERE e.cliente_id = $1
            ORDER BY p.fecha_pago ASC
        `;

        const pagos = await pool.query(query, [clienteId]);
        
        // Enviamos los datos al frontend
        res.json(pagos.rows);

    } catch (err) {
        console.error("❌ Error en obtenerPagosLead:", err.message);
        res.status(500).json({ 
            msg: "Error interno al recuperar el historial de pagos.",
            error: err.message 
        });
    }
};

// --- COBRAR SALDO FINAL Y CERRAR EVENTO (VERSIÓN BLINDADA CON PEPS PROFESIONAL) ---
exports.cobrarSaldoLead = async (req, res) => {
    console.log("💰 [DEBUG] Iniciando cobrarSaldoLead con Algoritmo PEPS...");
    const { id } = req.params; 
    const { metodoPago, cantidad_ninos_final, paquete_final_id, formato_impresion, tipo_comprobante } = req.body;
    
    if (!req.usuario) return res.status(401).json({ msg: "Sesión no válida." });
    const usuarioId = req.usuario.id;

    const client = await pool.connect();
    
    try {
        await client.query('BEGIN');

        // 1. Datos del Lead con Bloqueo de Fila (FOR UPDATE) para evitar colisiones
        const leadRes = await client.query('SELECT * FROM leads WHERE id = $1 FOR UPDATE', [id]);
        if (leadRes.rows.length === 0) throw new Error('Lead no encontrado');
        const lead = leadRes.rows[0];

        // 🛡️ REGLA DE SEGURIDAD: Bloquear si ya está Ganado o Finalizado (Evita doble cobro)
        if (lead.estado === 'ganado' || lead.estado === 'finalizado') {
            throw new Error('Este Lead ya fue cerrado. No se admiten más cobros de saldo.');
        }

        if (!lead.cliente_asociado_id) throw new Error('Sin evento asociado.');  

        // 2. Datos del Evento
        const eventoRes = await client.query(
            `SELECT * FROM eventos WHERE cliente_id = $1 AND estado != 'cancelado' ORDER BY id DESC LIMIT 1`, 
            [lead.cliente_asociado_id]
        );
        if (eventoRes.rows.length === 0) throw new Error('No se encontró evento activo.');
        
        const evento = eventoRes.rows[0];
        const sedeReal = evento.sede_id; 

        // 3. DEFINIR DATOS REALES (Lo que realmente pasó en la fiesta)
        const idPaqueteReal = paquete_final_id ? parseInt(paquete_final_id) : evento.paquete_id;
        const cantidadFinal = cantidad_ninos_final ? parseInt(cantidad_ninos_final) : 0;

        if (cantidadFinal <= 0) throw new Error('La cantidad de niños final debe ser mayor a 0.');

        // Variables para el producto
        let productoPrincipal = { nombre: "Personalizado", precio_venta: 0, costo_compra: 0, controla_stock: false, tipo_item: 'servicio' };
        let precioUnitario = 0;

        if (idPaqueteReal) {
            const prodRes = await client.query('SELECT id, precio_venta, nombre, costo_compra, controla_stock, tipo_item FROM productos WHERE id = $1', [idPaqueteReal]);
            if (prodRes.rows.length > 0) {
                productoPrincipal = prodRes.rows[0];
                precioUnitario = parseFloat(productoPrincipal.precio_venta);
            }
        } else {
             if(cantidadFinal > 0) precioUnitario = parseFloat(lead.valor_estimado) / cantidadFinal;
        }

        // 4. CÁLCULO FINANCIERO
        let nuevoCostoTotal = precioUnitario * cantidadFinal;
        if (nuevoCostoTotal === 0) nuevoCostoTotal = parseFloat(lead.valor_estimado || 0);

        const pagadoPreviamente = parseFloat(evento.acuenta || 0);
        let saldoAPagar = nuevoCostoTotal - pagadoPreviamente;
        if (saldoAPagar < 0) saldoAPagar = 0; 

        // 5. 🔥 LÓGICA DE INVENTARIO PEPS (FIFO) 🔥
        if (idPaqueteReal && productoPrincipal.tipo_item !== 'servicio' && productoPrincipal.controla_stock) {
            
            const cantidadNinosFinal = parseInt(cantidadFinal) || 0;

            // A. Revisar si es COMBO (Receta)
            const recetaRes = await client.query(
                `SELECT r.producto_hijo_id AS ingrediente_id, r.cantidad as cantidad_receta, p.nombre, p.costo_compra 
                 FROM productos_combo r
                 JOIN productos p ON r.producto_hijo_id = p.id
                 WHERE r.producto_padre_id = $1`,
                [idPaqueteReal]
            );
            const ingredientes = recetaRes.rows;

            if (ingredientes.length > 0) {
                // === CASO 1: COMBO (Descontar cada insumo Y el padre) ===
                for (const ing of ingredientes) {
                    const totalADescontar = parseFloat(ing.cantidad_receta) * cantidadNinosFinal;
                    if (totalADescontar > 0) {
                        await ejecutarDescuentoPEPS(
                            client, 
                            ing.ingrediente_id, 
                            sedeReal, 
                            totalADescontar, 
                            usuarioId, 
                            evento.id, 
                            `Insumo de: ${productoPrincipal.nombre}`
                        );
                    }
                }
                // Descontamos el COMBO PADRE
                await ejecutarDescuentoPEPS(
                    client,
                    idPaqueteReal,
                    sedeReal,
                    cantidadNinosFinal,
                    usuarioId,
                    evento.id,
                    `Venta Paquete: ${productoPrincipal.nombre}`
                );

            } else {
                // === CASO 2: PRODUCTO SIMPLE ===
                await ejecutarDescuentoPEPS(client, idPaqueteReal, sedeReal, cantidadNinosFinal, usuarioId, evento.id, `Venta: ${productoPrincipal.nombre}`);
            }
        }

        // 6. REGISTRAR PAGO Y VENTA
        let ventaId = null;

        if (saldoAPagar > 0) {
            // A. Pago del Evento
            const pagoRes = await client.query(
                `INSERT INTO pagos_evento (evento_id, usuario_id, monto, metodo_pago, nro_operacion, tipo_pago)
                 VALUES ($1, $2, $3, $4, 'PAGO_FINAL', 'SALDO') RETURNING id`,
                [evento.id, usuarioId, saldoAPagar, metodoPago || 'efectivo']
            );

            // B. Ticket correlativo de sede
            const maxTicket = await client.query('SELECT COALESCE(MAX(numero_ticket_sede), 0) as max_num FROM ventas WHERE sede_id = $1', [sedeReal]);
            const nextTicket = parseInt(maxTicket.rows[0].max_num) + 1;
            
            // C. Venta (Historial General)
            const ventaRes = await client.query(
                `INSERT INTO ventas (
                    sede_id, usuario_id, cliente_id, 
                    total_venta, metodo_pago, fecha_venta, 
                    tipo_comprobante, estado, 
                    tipo_venta, linea_negocio, vendedor_id,
                    numero_ticket_sede, observaciones, origen
                ) VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, 'completado', 'Evento', 'EVENTOS', $7, $8, $9, 'CRM_SALDO') RETURNING id`,
                [
                    sedeReal, usuarioId, lead.cliente_asociado_id, 
                    saldoAPagar, (metodoPago || 'Efectivo').toUpperCase(),
                    tipo_comprobante || 'TICKET',
                    lead.vendedor_id, nextTicket,
                    `Liquidación Final: ${lead.nombre_hijo} (${cantidadFinal} niños)`,
                    'CRM'
                ]
            );
            ventaId = ventaRes.rows[0].id;

            // D. Detalle Histórico
            await client.query(
                `INSERT INTO detalle_ventas (venta_id, producto_id, nombre_producto_historico, cantidad, precio_unitario, subtotal)
                 VALUES ($1, $2, $3, 1, $4, $5)`,
                [ventaId, idPaqueteReal || null, `SALDO: ${productoPrincipal.nombre}`, saldoAPagar, saldoAPagar]
            );

            // E. Caja Chica / Movimientos
            await client.query(
                `INSERT INTO movimientos_caja (
                    sede_id, usuario_id, tipo_movimiento, categoria, descripcion, monto, metodo_pago, pago_evento_id, venta_id
                ) VALUES ($1, $2, 'INGRESO', 'EVENTO_SALDO', $3, $4, $5, $6, $7)`,
                [
                    sedeReal, usuarioId, 
                    `SALDO FINAL | ${lead.nombre_apoderado}`, 
                    saldoAPagar, metodoPago || 'efectivo', pagoRes.rows[0].id, ventaId
                ]
            );
        }

        // 7. ACTUALIZAR ESTADOS (CIERRE TOTAL)
        await client.query(
            `UPDATE eventos SET saldo = 0, acuenta = acuenta + $1, costo_total = $2, paquete_id = $3, estado = 'finalizado' WHERE id = $4`, 
            [saldoAPagar, nuevoCostoTotal, idPaqueteReal, evento.id]
        );
        
        await client.query(
            `UPDATE leads SET estado = 'ganado', cantidad_ninos=$1, paquete_interes=$2, valor_estimado=$3, ultima_actualizacion=CURRENT_TIMESTAMP WHERE id = $4`, 
            [cantidadFinal, idPaqueteReal, nuevoCostoTotal, id]
        );

        await client.query('COMMIT');

        // 🔥 FACTURACIÓN ELECTRÓNICA: Formato Dinámico (A4/A5/Ticket)
        let pdfUrlFinal = null;
        
        if (ventaId && (tipo_comprobante === 'BOLETA' || tipo_comprobante === 'FACTURA')) {
            try {
                // Mapeamos el formato de impresión de forma blindada
                let codFormato = '3'; // Por defecto Ticket
                
                // Aseguramos que el formato siempre sea texto en minúsculas para compararlo sin fallas
                const formatoLimpio = (formato_impresion || "3").toString().toLowerCase();

                if (formatoLimpio === 'a4' || formatoLimpio === '1') codFormato = '1';
                else if (formatoLimpio === 'a5' || formatoLimpio === '2') codFormato = '2';

                console.log("=== RASTREO DE FORMATO EN CRM ===");
                console.log("formato que vino del front:", formato_impresion);
                console.log("codigo que se enviará al facturador:", codFormato);

                // Llamada síncrona para esperar el enlace del PDF
                await facturacionController.emitirComprobante(
                    { 
                        body: { 
                            venta_id: ventaId,
                            formato_pdf: codFormato,       // ✅ ENVÍO PRINCIPAL
                            formato_impresion: codFormato  // ✅ ENVÍO DE RESPALDO (Por si el controlador busca este nombre)
                        }, 
                        usuario: req.usuario 
                    }, 
                    { 
                        json: (data) => { 
                            if (data.pdf) pdfUrlFinal = data.pdf;
                            else if (data.enlace_del_pdf) pdfUrlFinal = data.enlace_del_pdf;
                        },
                        status: () => ({ json: (e) => console.error("❌ [CRM-FACT] Error:", e.msg || e) })
                    }
                );
            } catch (errorFact) {
                console.error("❌ Error crítico al emitir desde CRM:", errorFact);
            }
        }

        // Respuesta final al Frontend
        let responseJson = { 
            success: true, 
            msg: `✅ Cobro de S/${saldoAPagar.toFixed(2)} exitoso!`, 
            nuevoEstado: 'ganado',
            venta_id: ventaId 
        };

        if (pdfUrlFinal) {
             responseJson.pdf_url = pdfUrlFinal;
        }

        res.json(responseJson);

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ Error cobrar saldo:", err.message);
        res.status(400).json({ msg: err.message });
    } finally {
        if (client) client.release();
    }
};

async function ejecutarDescuentoPEPS(client, prodId, sedeId, cantidad, usuarioId, eventoId, nombreProd) {
    
    const cantidadEntera = Math.ceil(parseFloat(cantidad));
    if (cantidadEntera <= 0) return; // Si no hay nada que descontar, salimos sin error

    // 🔥 NUEVO: Traemos el costo de compra y el precio de venta original de la BD
    const prodData = await client.query('SELECT costo_compra, precio_venta FROM productos WHERE id = $1', [prodId]);
    const costoCompraFallback = prodData.rows.length > 0 ? parseFloat(prodData.rows[0].costo_compra) || 0 : 0;
    let precioVentaKardex = prodData.rows.length > 0 ? parseFloat(prodData.rows[0].precio_venta) || 0 : 0;

    // 🔥 TRUCO MAGISTRAL: Si el movimiento es por un "Insumo", forzamos el precio de venta a 0 
    // para no duplicar ventas en el Kardex. Si es el "Paquete/Combo", usa su precio real (Ej: S/ 65.00).
    if (nombreProd.toLowerCase().includes('insumo')) {
        precioVentaKardex = 0;
    }

    // 1. Validar Stock Total en la Sede
    const stockRes = await client.query(
        'SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE', 
        [prodId, sedeId]
    );
    const stockActual = stockRes.rows.length > 0 ? parseInt(stockRes.rows[0].cantidad) : 0;

    if (stockActual < cantidadEntera) {
        throw new Error(`Stock insuficiente para "${nombreProd}". Disponible: ${stockActual}, Requerido: ${cantidadEntera}`);
    }

    // 2. BUSCAR LOTES PARA EL PEPS
    let restante = cantidadEntera;
    let stockKardex = stockActual;

    const lotes = await client.query(
        `SELECT id, cantidad_actual, costo_unitario FROM inventario_lotes 
         WHERE producto_id = $1 AND sede_id = $2 AND cantidad_actual > 0 
         ORDER BY fecha_ingreso ASC FOR UPDATE`,
        [prodId, sedeId]
    );

    // 🔥 CASO A: SIN LOTES
    if (lotes.rows.length === 0) {
        await client.query(
            'UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3',
            [cantidadEntera, prodId, sedeId]
        );
        
        // Registramos en el Kardex INCLUYENDO el precio_venta_historico
        await client.query(
            `INSERT INTO movimientos_inventario 
            (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento, precio_venta_historico, fecha)
             VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
            [
                sedeId, 
                prodId, 
                usuarioId, 
                -cantidadEntera, 
                (stockActual - cantidadEntera), 
                `Evento CRM #${eventoId} (${nombreProd}) - Sin Lote`,
                costoCompraFallback, 
                precioVentaKardex // 👈 Aquí inyectamos el precio de venta
            ]
        );
        return; 
    }

    // --- CASO B: CON LOTES (PEPS) ---
    for (const lote of lotes.rows) {
        if (restante <= 0) break;
        const aSacar = Math.min(restante, parseInt(lote.cantidad_actual));
        
        await client.query(
            `UPDATE inventario_lotes SET cantidad_actual = cantidad_actual - $1, 
             estado = CASE WHEN cantidad_actual - $1 <= 0 THEN 'AGOTADO' ELSE estado END 
             WHERE id = $2`, [aSacar, lote.id]
        );

        stockKardex -= aSacar;

        await client.query(
            `INSERT INTO movimientos_inventario 
            (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento, precio_venta_historico, fecha)
             VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
            [
                sedeId, 
                prodId, 
                usuarioId, 
                -aSacar, 
                stockKardex, 
                `Evento CRM #${eventoId} (${nombreProd}) - Lote ${lote.id}`,
                parseFloat(lote.costo_unitario), 
                precioVentaKardex // 👈 Aquí también
            ]
        );

        restante -= aSacar;
    }

    // 3. Actualizar tabla resumen de sede 
    await client.query(
        'UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3',
        [cantidadEntera, prodId, sedeId]
    );
}

async function reponerStock(client, prodId, sedeId, cantidad, usuarioId, ticketId, motivo) {
    if (!prodId || !cantidad) return;
    
    const prod = await client.query('SELECT controla_stock, costo_compra FROM productos WHERE id = $1', [prodId]);
    if (!prod.rows[0]?.controla_stock) return;

    const stockRes = await client.query('SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE', [prodId, sedeId]);
    let stockActual = stockRes.rows.length > 0 ? parseInt(stockRes.rows[0].cantidad) : 0;
    
    if (stockRes.rows.length === 0) {
        await client.query(`INSERT INTO inventario_sedes (sede_id, producto_id, cantidad) VALUES ($1, $2, 0)`, [sedeId, prodId]);
    }

    await client.query('UPDATE inventario_sedes SET cantidad = cantidad + $1 WHERE producto_id = $2 AND sede_id = $3', [cantidad, prodId, sedeId]);
    
    await client.query(
        `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
         VALUES ($1, $2, $3, 'entrada_anulacion', $4, $5, $6, $7)`,
        [sedeId, prodId, usuarioId, cantidad, (stockActual + cantidad), `Anulación #${ticketId} (${motivo})`, parseFloat(prod.rows[0].costo_compra) || 0]
    );
}