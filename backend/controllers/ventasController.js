// Ubicación: SuperNova/backend/controllers/ventasController.js
const pool = require('../db');
const facturacionController = require('./facturacionController');

// 1. REGISTRAR VENTA (CORREGIDO: ACTUALIZA EL NOMBRE SI EL CLIENTE YA EXISTE)
exports.registrarVenta = async (req, res) => {
    // 1. DESESTRUCTURACIÓN
    const { 
        clienteDni, 
        metodoPago, 
        carrito, 
        vendedor_id, 
        tipo_venta, 
        observaciones, 
        descuento_factor,
        tipo_comprobante, 
        cliente_razon_social, 
        cliente_direccion, 
        tipo_tarjeta,
        formato_pdf,
        cliente_nombre_completo,
        cliente_email,
        uuid_unico 
    } = req.body;

    const usuarioId = req.usuario.id;
    const sedeId = req.usuario.sede_id;

    if (!carrito || !Array.isArray(carrito) || carrito.length === 0) {
        return res.status(400).json({ msg: "El carrito de compras está vacío." });
    }

    const client = await pool.connect();

    try {
        // --- 🛡️ 0. DEFENSA IDEMPOTENCIA (Anti-Caída de Internet) ---
        if (uuid_unico) {
            const ventaExiste = await client.query(
                'SELECT id, numero_ticket_sede, total_venta FROM ventas WHERE uuid_frontend = $1', 
                [uuid_unico]
            );
            if (ventaExiste.rows.length > 0) {
                console.log(`♻️ Venta duplicada prevenida (UUID: ${uuid_unico})`);
                return res.json({ 
                    msg: 'Venta recuperada (Ya procesada anteriormente)', 
                    ventaId: ventaExiste.rows[0].id, 
                    ticketCodigo: ventaExiste.rows[0].numero_ticket_sede, 
                    total: ventaExiste.rows[0].total_venta 
                });
            }
        }

        const factor = parseFloat(descuento_factor) || 0; 
        if (factor < 0 || factor > 1) throw new Error("El porcentaje de descuento no es válido.");

        const vendedorFinal = vendedor_id ? vendedor_id : usuarioId;

        // INICIO DE TRANSACCIÓN ATÓMICA
        await client.query('BEGIN');

        // --- 🚩 1. FASE SOBERANÍA: GESTIÓN INTELIGENTE DEL CLIENTE ---
        let clienteIdFinal = null;
        
        // Limpiamos el documento para evitar nulos o espacios
        const documentoLimpio = (clienteDni && clienteDni !== 'PUBLICO' && clienteDni.trim() !== '') 
            ? clienteDni.toString().trim() 
            : '00000000';

        // 🔥 DEFINIR EL NOMBRE CORRECTO ANTES DE BUSCAR
        // Esto asegura que tengamos el nombre listo tanto para CREAR como para ACTUALIZAR
        const nombreParaRegistro = (tipo_comprobante === 'Factura' && cliente_razon_social) 
            ? cliente_razon_social 
            : (cliente_nombre_completo || 'NUEVO CLIENTE');

        if (documentoLimpio !== '00000000') {
            // A. BUSCAR SI EL CLIENTE YA EXISTE (SIN IMPORTAR EL ESTADO)
            const buscarCliente = await client.query(
                `SELECT id FROM clientes 
                 WHERE documento_id = $1 OR ruc = $1 
                 LIMIT 1`,
                [documentoLimpio]
            );

            if (buscarCliente.rows.length > 0) {
                // ✅ CASO 1: CLIENTE ENCONTRADO -> LO REUTILIZAMOS Y ACTUALIZAMOS SU NOMBRE
                clienteIdFinal = buscarCliente.rows[0].id;
                
                // Actualizamos nombre, correo, dirección y estado
                await client.query(
                    `UPDATE clientes 
                     SET nombre_completo = $1,  -- 🔥 AQUÍ SE CORRIGE EL NOMBRE "CLIENTE DNI..."
                         correo = COALESCE($2, correo), 
                         direccion = COALESCE($3, direccion),
                         estado = 'ACTIVO' 
                     WHERE id = $4`,
                    [nombreParaRegistro, cliente_email || null, cliente_direccion || null, clienteIdFinal]
                );
            } else {
                // ✅ CASO 2: NO EXISTE EN ABSOLUTO -> LO CREAMOS
                const esRuc = documentoLimpio.length === 11;

                const nuevoClienteRes = await client.query(
                    `INSERT INTO clientes (
                        nombre_completo, documento_id, ruc, correo, direccion, telefono, estado, categoria
                    ) VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO', 'nuevo') RETURNING id`,
                    [
                        nombreParaRegistro,                  // $1
                        esRuc ? null : documentoLimpio,      // $2 (DNI)
                        esRuc ? documentoLimpio : null,      // $3 (RUC)
                        cliente_email || null,               // $4
                        cliente_direccion || null,           // $5
                        '-'                                  // $6 (Teléfono por defecto)
                    ]
                );
                clienteIdFinal = nuevoClienteRes.rows[0].id;
            }
        } else {
            // CASO 3: CLIENTE GENÉRICO (Venta rápida sin DNI)
            const clienteVarios = await client.query("SELECT id FROM clientes WHERE documento_id = '00000000' LIMIT 1");
            if (clienteVarios.rows.length > 0) {
                clienteIdFinal = clienteVarios.rows[0].id;
            }
        }

        // --- 2. FASE CÁLCULO Y BLOQUEOS ---
        const carritoOrdenado = [...carrito].sort((a, b) => a.id - b.id);

        let totalCalculado = 0;
        let detalleAInsertar = [];

        for (const item of carritoOrdenado) {
            const prodRes = await client.query(
                'SELECT id, precio_venta, costo_compra, nombre, linea_negocio FROM productos WHERE id = $1 FOR SHARE', 
                [item.id]
            );
            
            if (prodRes.rows.length === 0) throw new Error(`Producto ID ${item.id} no encontrado.`);
            const prod = prodRes.rows[0];

            const precioOriginal = parseFloat(prod.precio_venta);
            const descuentoPorUnidad = Number((precioOriginal * factor).toFixed(2));
            const precioConDescuento = Number((precioOriginal - descuentoPorUnidad).toFixed(2));
            const subtotal = Number((precioConDescuento * item.cantidad).toFixed(2));
            
            totalCalculado += subtotal;

            detalleAInsertar.push({
                id: prod.id,
                nombre: prod.nombre,
                cantidad: item.cantidad,
                precioReal: precioConDescuento,
                costoReal: prod.costo_compra,
                lineaProd: prod.linea_negocio,
                subtotal: subtotal
            });
        }

        totalCalculado = Number(totalCalculado.toFixed(2));

        // 🔥 BLOQUEO DE SEGURIDAD SUNAT (BACKEND) 🔥
        if ((!tipo_comprobante || tipo_comprobante === 'Boleta') && totalCalculado >= 700 && documentoLimpio === '00000000') {
            throw new Error(`SUNAT: Las ventas de S/ 700 o más requieren obligatoriamente el DNI del cliente. (Total: S/ ${totalCalculado})`);
        }

        const subtotalFactura = Number((totalCalculado / 1.18).toFixed(2));
        const igvFactura = Number((totalCalculado - subtotalFactura).toFixed(2));
        const lineaPrincipal = detalleAInsertar[0]?.lineaProd || 'GENERAL';

        let obsFinal = observaciones || '';
        if (factor > 0) obsFinal = `[Descuento: ${(factor * 100).toFixed(0)}%] ${obsFinal}`;
        const sedeRes = await client.query('SELECT prefijo_ticket FROM sedes WHERE id = $1 FOR UPDATE', [sedeId]);
        const prefijo = sedeRes.rows[0]?.prefijo_ticket || 'GEN';

        const maxTicketRes = await client.query(
            'SELECT COALESCE(MAX(numero_ticket_sede), 0) as max_num FROM ventas WHERE sede_id = $1',
            [sedeId]
        );
        const nuevoNumeroTicket = parseInt(maxTicketRes.rows[0].max_num) + 1;
        const codigoTicketVisual = `${prefijo}-${nuevoNumeroTicket.toString().padStart(4, '0')}`;

        // --- 3. INSERTAR VENTA ---
        const ventaRes = await client.query(
            `INSERT INTO ventas
            (sede_id, usuario_id, vendedor_id, cliente_id, doc_cliente_temporal, metodo_pago, total_venta, subtotal, igv, linea_negocio, numero_ticket_sede, tipo_venta, observaciones,
             tipo_comprobante, cliente_razon_social, cliente_direccion, tipo_tarjeta, sunat_estado, uuid_frontend, nombre_cliente_temporal) 
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, 'PENDIENTE', $18, $19) 
             RETURNING id`,
            [
                sedeId, 
                usuarioId, 
                vendedorFinal, 
                clienteIdFinal, 
                documentoLimpio, 
                metodoPago, 
                totalCalculado, 
                subtotalFactura, 
                igvFactura, 
                lineaPrincipal, 
                nuevoNumeroTicket, 
                tipo_venta || 'Unitaria', 
                obsFinal,
                tipo_comprobante || 'Boleta', 
                cliente_razon_social || null, 
                cliente_direccion || null, 
                tipo_tarjeta || null,
                uuid_unico || null,
                // 🔥 Guardamos el nombre tal cual se usó en la venta para el historial
                nombreParaRegistro 
            ]
        );
        const ventaId = ventaRes.rows[0].id;

        // --- 4. GUARDAR DETALLES Y PROCESAR STOCK ---
        for (const item of detalleAInsertar) {
            await client.query(
                `INSERT INTO detalle_ventas (venta_id, producto_id, nombre_producto_historico, cantidad, precio_unitario, subtotal, costo_historico)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [ventaId, item.id, item.nombre, item.cantidad, item.precioReal, item.subtotal, item.costoReal]
            );

            // Gestión de Combos
            const esCombo = await client.query(`
                SELECT pc.producto_hijo_id, pc.cantidad, p.nombre, p.costo_compra 
                FROM productos_combo pc 
                JOIN productos p ON pc.producto_hijo_id = p.id 
                WHERE pc.producto_padre_id = $1`, 
                [item.id]
            );
            
            // --- GESTIÓN DE STOCK (COMBOS VS VENTA DIRECTA) ---
            if (esCombo.rows.length > 0) {
                // 🍔 ES UN COMBO: Procesamos a los "hijos" (ingredientes/componentes)
                for (const hijo of esCombo.rows) {
                    // A. Registramos el hijo en el detalle para transparencia del inventario
                    await client.query(
                        `INSERT INTO detalle_ventas (venta_id, producto_id, nombre_producto_historico, cantidad, precio_unitario, subtotal, costo_historico)
                         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                        [ventaId, hijo.producto_hijo_id, `(Hijo) ${hijo.nombre}`, item.cantidad * hijo.cantidad, 0, 0, hijo.costo_compra]
                    );
                    
                    // B. Descontamos stock físico validando contra Reservas Web
                    await descontarStock(client, hijo.producto_hijo_id, sedeId, item.cantidad * hijo.cantidad, usuarioId, codigoTicketVisual, `Ingrediente de: ${item.nombre}`, 0);
                    
                    // C. 🛡️ LIMPIEZA DE RESERVA: Si el hijo estaba reservado por la web (UUID), liberamos la reserva
                    if (uuid_unico) {
                        await client.query(
                            'DELETE FROM reservas_ecommerce WHERE producto_id = $1 AND sede_id = $2 AND sesion_id = $3',
                            [hijo.producto_hijo_id, sedeId, uuid_unico]
                        );
                    }
                }

                // D. Finalmente descontamos el "Padre" (El producto Combo en sí)
                await descontarStock(client, item.id, sedeId, item.cantidad, usuarioId, codigoTicketVisual, 'Venta Combo', item.precioReal);
                
                // También limpiamos la reserva del producto Padre si existiera
                if (uuid_unico) {
                    await client.query(
                        'DELETE FROM reservas_ecommerce WHERE producto_id = $1 AND sede_id = $2 AND sesion_id = $3',
                        [item.id, sedeId, uuid_unico]
                    );
                }

            } else {
                // 📦 ES VENTA DIRECTA (Producto simple)
                await descontarStock(client, item.id, sedeId, item.cantidad, usuarioId, codigoTicketVisual, 'Venta Directa', item.precioReal);
                
                // 🛡️ LIMPIEZA DE RESERVA: Liberamos el stock reservado de este producto simple
                if (uuid_unico) {
                    await client.query(
                        'DELETE FROM reservas_ecommerce WHERE producto_id = $1 AND sede_id = $2 AND sesion_id = $3',
                        [item.id, sedeId, uuid_unico]
                    );
                }
            }
        }

        // --- 5. MOVIMIENTO DE CAJA ---
        if (totalCalculado > 0) {
            await client.query(
                `INSERT INTO movimientos_caja (sede_id, usuario_id, tipo_movimiento, categoria, descripcion, monto, metodo_pago, venta_id)
                 VALUES ($1, $2, 'INGRESO', 'VENTA_POS', 'Ticket ' || $3, $4, $5, $6)`,
                [sedeId, usuarioId, codigoTicketVisual, totalCalculado, metodoPago, ventaId]
            );
        }

        // CIERRE DE TRANSACCIÓN
        await client.query('COMMIT');

        if (uuid_unico) {
            await pool.query('DELETE FROM reservas_ecommerce WHERE sesion_id = $1', [uuid_unico]);
        }

        // --- 6. PROCESO DE FACTURACIÓN ASÍNCRONO ---
        setImmediate(() => {
            facturacionController.emitirComprobante(
                { 
                    body: { 
                        venta_id: ventaId,
                        formato_pdf: formato_pdf || '3', 
                        cliente_email: cliente_email 
                    }, 
                    usuario: req.usuario 
                }, 
                { 
                    json: (d) => console.log(`[ASYNC-FACT] Éxito Venta ${ventaId}`),
                    status: (c) => ({ json: (e) => console.error(`[ASYNC-FACT] Error Venta ${ventaId}:`, e) })
                }
            );
        });
        
        res.json({ 
            msg: 'Venta Procesada y Cliente Actualizado', 
            ventaId, 
            ticketCodigo: codigoTicketVisual, 
            total: totalCalculado 
        });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ Error en registrarVenta:", err.message);
        
        // Manejo amigable de errores SQL
        if (err.code === '23505') { 
             return res.status(409).json({ msg: "Conflicto de datos: El cliente ya existe. Intente de nuevo." });
        }
        if (err.code === '40P01') { 
            return res.status(409).json({ msg: "Sistema ocupado, por favor reintente la venta." });
        }
        res.status(400).json({ msg: err.message });
    } finally {
        if (client) client.release();
    }
};

// 2. OBTENER HISTORIAL (CORREGIDO: OCULTA VENTAS WEB)
exports.obtenerHistorialVentas = async (req, res) => {
    try {
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        const esSuperAdmin = rol === 'superadmin' || rol === 'gerente' || rol === 'director' || rol === 'finanzas' || rol === 'contabilidad';
        const usuarioSedeId = req.usuario.sede_id;
        const filtroSedeId = req.query.sede;

        let sedeFiltro = esSuperAdmin ? (filtroSedeId || null) : usuarioSedeId;
        
        const params = [];
        let sedeCondition = "";
        
        if (sedeFiltro) {
            sedeCondition = "AND v.sede_id = $1"; 
            params.push(sedeFiltro);
        }

        const query = `
            WITH HistorialUnificado AS (
                -- A. VENTAS DEL POS Y CRM
                SELECT 
                    v.id, v.fecha_venta, v.total_venta, 
                    
                    -- 🔥 CORRECCIÓN CLAVE: Concatenamos el Tipo de Tarjeta si aplica
                    CASE 
                        WHEN v.metodo_pago = 'Tarjeta' AND v.tipo_tarjeta IS NOT NULL AND v.tipo_tarjeta != '' 
                        THEN 'TARJETA (' || UPPER(v.tipo_tarjeta) || ')'
                        ELSE UPPER(v.metodo_pago)
                    END as metodo_pago,

                    COALESCE(s.prefijo_ticket || '-' || LPAD(v.numero_ticket_sede::text, 4, '0'), 'TICKET-' || v.id) as codigo_visual,
                    v.tipo_venta, v.observaciones, v.tipo_comprobante, v.tipo_tarjeta,
                    -- CAMPOS SUNAT --
                    v.sunat_estado, v.serie, v.correlativo, v.enlace_pdf, v.enlace_xml, v.enlace_cdr,
                    ------------------
                    s.nombre AS nombre_sede, 
                    u.nombres AS nombre_usuario,
                    vend.nombres || ' ' || COALESCE(vend.apellidos, '') AS nombre_vendedor,
                    
                    COALESCE(c.nombre_completo, v.nombre_cliente_temporal, 'Consumidor Final') AS nombre_cliente_temporal,
                    v.doc_cliente_temporal, 
                    
                    COALESCE(v.origen, 'VENTA_POS') as origen,
                    v.linea_negocio
                FROM ventas v
                JOIN usuarios u ON v.usuario_id = u.id          
                LEFT JOIN usuarios vend ON v.vendedor_id = vend.id 
                JOIN sedes s ON v.sede_id = s.id
                LEFT JOIN clientes c ON v.cliente_id = c.id 
                WHERE v.origen != 'WEB' ${sedeCondition} -- 🔥 AQUÍ ESTÁ EL FILTRO PARA OCULTAR LA WEB

                UNION ALL

                -- B. COBROS B2B (Se mantiene igual ya que usan Movimientos Caja)
                SELECT 
                    mc.id + 900000, mc.fecha_registro, mc.monto, UPPER(mc.metodo_pago),
                    'B2B-' || mc.id, 'Cobro Terceros', mc.descripcion, 'Recibo Interno', NULL,
                    'NO_APLICA', NULL, NULL, NULL, NULL, NULL,
                    s.nombre, u.nombres, 'Acuerdo Comercial', 'CORPORATIVO', 'Cliente Corporativo', 
                    'COBRO_CAJA', 'OTROS' 
                FROM movimientos_caja mc
                JOIN usuarios u ON mc.usuario_id = u.id
                JOIN sedes s ON mc.sede_id = s.id
                WHERE mc.tipo_movimiento = 'INGRESO' AND mc.categoria = 'Ingresos Varios (Caja)' 
                ${sedeFiltro ? "AND mc.sede_id = $1" : ""}
            )
            SELECT * FROM HistorialUnificado ORDER BY fecha_venta DESC LIMIT 100
        `;

        const result = await pool.query(query, params);
        
        const ventasFormateadas = result.rows.map(v => ({
            ...v,
            nombre_cajero: v.nombre_usuario,
            nombre_cliente: v.nombre_cliente_temporal 
        }));

        res.json(ventasFormateadas);

    } catch (err) {
        console.error("Error historial:", err.message);
        res.status(500).send('Error al cargar historial.');
    }
};

// 3. OBTENER DETALLE (ENRIQUECIDO CON SEDE Y SALA)
exports.obtenerDetalleVenta = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();

    try {
        // A. Obtener datos cabecera para saber si es evento
        const ventaRes = await client.query('SELECT cliente_id, linea_negocio FROM ventas WHERE id = $1', [id]);
        
        if (ventaRes.rows.length === 0) {
            return res.json([]);
        }
        const venta = ventaRes.rows[0];

        // B. Obtener los productos (ítems normales)
        const itemsRes = await client.query(
            `SELECT nombre_producto_historico, cantidad, precio_unitario, subtotal 
             FROM detalle_ventas WHERE venta_id = $1 ORDER BY id ASC`, 
            [id]
        );
        let items = itemsRes.rows;

        // C. 🔥 SI ES EVENTO: BUSCAR DATOS COMPLETOS (INCLUYENDO NOMBRE DE SEDE)
        if (venta.linea_negocio === 'EVENTOS' && venta.cliente_id) {
            
            const eventoRes = await client.query(
                `SELECT 
                    e.fecha_inicio, 
                    e.fecha_fin, 
                    e.salon, 
                    c.nombre_hijo,
                    s.nombre as nombre_sede  -- <--- 🔥 TRAEMOS EL NOMBRE DE LA SEDE
                 FROM eventos e
                 JOIN clientes c ON e.cliente_id = c.id
                 LEFT JOIN sedes s ON e.sede_id = s.id  -- <--- 🔥 HACEMOS EL JOIN
                 WHERE e.cliente_id = $1 AND e.estado != 'cancelado'
                 ORDER BY e.id DESC LIMIT 1`,
                [venta.cliente_id]
            );

            if (eventoRes.rows.length > 0) {
                const evt = eventoRes.rows[0];

                // Formateamos bonito la fecha y hora
                const opcionesFecha = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' };
                const fecha = new Date(evt.fecha_inicio).toLocaleDateString('es-PE', opcionesFecha);
                
                const horaInicio = new Date(evt.fecha_inicio).toLocaleTimeString('es-PE', {hour: '2-digit', minute:'2-digit'});
                const horaFin = new Date(evt.fecha_fin).toLocaleTimeString('es-PE', {hour: '2-digit', minute:'2-digit'});

                // Agregamos la metadata del evento limpia para que el Frontend la dibuje
                if (items.length > 0) {
                    items[0].metadata_evento = {
                        cumpleanero: evt.nombre_hijo,
                        fecha: fecha,
                        horario: `${horaInicio} a ${horaFin}`,
                        ubicacion: `${evt.nombre_sede || 'Sede Central'} - ${evt.salon || 'Sala General'}`
                    };
                }
            }
        }

        res.json(items); 

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error al cargar detalle.' });
    } finally {
        client.release();
    }
};

// 4. ANULAR VENTA (Versión Final: B2B financiero + Reversión con Costos Reales)
exports.eliminarVenta = async (req, res) => {
    const { id } = req.params;
    const usuarioId = req.usuario.id;
    
    // Normalización de Roles
    const rolUsuario = (req.usuario.rol || '').toLowerCase().trim();
    const rolesPermitidos = ['superadmin', 'admin', 'administrador', 'super admin', 'gerente','director', 'finanzas', 'contabilidad'];

    const client = await pool.connect();
    try {
        // 1. Validar permisos
        if (!rolesPermitidos.includes(rolUsuario)) {
            throw new Error('⛔ ACCESO DENEGADO: Permisos insuficientes para anular.');
        }

        await client.query('BEGIN');
        
        // 2. Obtener datos de la venta y Bloquear fila
        const ventaRes = await client.query('SELECT * FROM ventas WHERE id = $1 FOR UPDATE', [id]);
        if (ventaRes.rows.length === 0) throw new Error('Venta no encontrada.');
        
        const venta = ventaRes.rows[0];

        // 🛑 3. REGLA: BLOQUEAR CRM
        if (venta.origen === 'CRM_SALDO' || venta.origen === 'EVENTOS') {
            throw new Error('⛔ Las ventas de CRM/EVENTOS no se pueden anular desde Caja.');
        }

        if (venta.sunat_estado === 'ANULADA') throw new Error('Esta venta ya se encuentra anulada.');

        // 4. PROCESO NUBEFACT (Comunicación de Baja)
        if (venta.serie && venta.correlativo) {
            try {
                const configRes = await client.query(
                    'SELECT api_url, api_token FROM nufect_config WHERE sede_id = $1 AND estado = TRUE LIMIT 1', 
                    [venta.sede_id]
                );

                if (configRes.rows.length > 0) {
                    const config = configRes.rows[0];
                    const facturadorService = require('../utils/facturadorService');

                    const nubefactRes = await facturadorService.anularComprobante({
                        ruta: config.api_url,   
                        token: config.api_token,
                        tipo_de_comprobante: venta.tipo_comprobante === 'Factura' ? 1 : 2,
                        serie: venta.serie,
                        numero: venta.correlativo,
                        motivo: "ERROR EN DIGITACION O CANCELACION",
                        codigo_unico: `SUPERNOVA-V${venta.id}`
                    });
                    
                    if (nubefactRes.errors) {
                        throw new Error(`Nubefact: ${nubefactRes.message || 'Error al comunicar baja.'}`);
                    }
                    
                    await client.query(
                        `UPDATE ventas SET sunat_estado = 'ANULADA', observaciones = COALESCE(observaciones, '') || ' [ANULADA SUNAT TICKET: ' || $1 || ']' WHERE id = $2`,
                        [nubefactRes.sunat_ticket_numero || 'S/N', id]
                    );
                } else {
                    await client.query(`UPDATE ventas SET sunat_estado = 'ANULADA' WHERE id = $1`, [id]);
                }
            } catch (dbErr) {
                console.warn("⚠️ Error Nubefact, anulando localmente:", dbErr.message);
                await client.query(`UPDATE ventas SET sunat_estado = 'ANULADA' WHERE id = $1`, [id]);
            }
        } else {
            await client.query(`UPDATE ventas SET sunat_estado = 'ANULADA' WHERE id = $1`, [id]);
        }

        // 🔥 5. REVERTIR STOCK (CORRECCIÓN: ANTI-DOBLE DEVOLUCIÓN) 🔥
        // Si la venta viene de una CUOTA (B2B), NO devolvemos stock (solo financiero).
        if (venta.origen !== 'COBRO_CUOTA') {
            
            // Leemos todo lo que se vendió (Combos e Ingredientes ya están detallados y separados aquí)
            const detallesRes = await client.query('SELECT producto_id, cantidad, costo_historico FROM detalle_ventas WHERE venta_id = $1 ORDER BY producto_id ASC', [id]);
            
            for (const item of detallesRes.rows) {
                if (!item.producto_id) continue;

                // 1. Verificamos si este ítem específico controla stock físico
                const prodInfo = await client.query('SELECT controla_stock, tipo_item, costo_compra FROM productos WHERE id = $1', [item.producto_id]);
                if (prodInfo.rows.length === 0) continue;

                const { controla_stock, tipo_item, costo_compra } = prodInfo.rows[0];

                // 2. SOLO devolvemos al inventario si es un insumo físico (Ignoramos el producto "Combo" si es solo servicio)
                if (controla_stock && tipo_item !== 'servicio') {
                    
                    // Sumamos el stock físico a la sede
                    await client.query('UPDATE inventario_sedes SET cantidad = cantidad + $1 WHERE producto_id = $2 AND sede_id = $3', [item.cantidad, item.producto_id, venta.sede_id]);
                    
                    // Aseguramos que el costo no sea 0 para el Kardex
                    const costoParaKardex = parseFloat(item.costo_historico) || parseFloat(costo_compra) || 0;

                    // Registramos en el Kardex la entrada por anulación
                    await client.query(
                        `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
                         VALUES ($1, $2, $3, 'entrada_anulacion', $4, (SELECT cantidad FROM inventario_sedes WHERE producto_id = $2 AND sede_id = $1), $5, $6)`,
                        [venta.sede_id, item.producto_id, usuarioId, item.cantidad, `Anulación Venta #${venta.numero_ticket_sede}`, costoParaKardex]
                    );
                }
            }
        } else {
            console.log("ℹ️ Anulación B2B detectada: Se omite la devolución de stock (solo movimiento financiero).");
        }

        // 6. REVERTIR DINERO DE CAJA (Esto sí aplica siempre)
        await client.query(
            `UPDATE movimientos_caja SET descripcion = '(ANULADO) ' || descripcion, monto = 0 WHERE venta_id = $1`, 
            [id]
        );
        
        // 7. LÓGICA ESPECIAL B2B: LIBERAR LA CUOTA
        if (venta.origen === 'COBRO_CUOTA') {
            const sedeInfo = await client.query('SELECT prefijo_ticket FROM sedes WHERE id = $1', [venta.sede_id]);
            const prefijo = sedeInfo.rows[0]?.prefijo_ticket || 'GEN';
            const ticketGenerado = `${prefijo}-${String(venta.numero_ticket_sede).padStart(4, '0')}`;

            const resReversion = await client.query(`
                UPDATE cuotas_acuerdos 
                SET estado = 'PENDIENTE', 
                    fecha_pago = NULL, 
                    comprobante_pago = NULL, 
                    metodo_pago = NULL
                WHERE comprobante_pago = $1 
                RETURNING id
            `, [ticketGenerado]);

            if (resReversion.rows.length > 0) {
                console.log(`♻️ Cuota B2B (ID: ${resReversion.rows[0].id}) liberada.`);
            }
        }

        await client.query('COMMIT');
        res.json({ success: true, msg: "Venta anulada correctamente. Inventario valorizado restaurado." });

    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ Error anulación:", err.message);
        res.status(400).json({ msg: err.message });
    } finally {
        if (client) client.release();
    }
};

// 5. OBTENER LISTA DE VENDEDORES (Para el Select) - CORREGIDO (Filtro Proveedores)
exports.obtenerVendedores = async (req, res) => {
    try {
        // 🔥 AQUÍ ESTÁ EL CANDADO: "AND rol != 'PROVEEDOR'"
        const result = await pool.query(`
            SELECT id, nombres, apellidos, rol 
            FROM usuarios 
            WHERE UPPER(estado) = 'ACTIVO' 
              AND rol != 'PROVEEDOR' 
            ORDER BY nombres ASC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error("Error al obtener vendedores:", err.message);
        res.status(500).send('Error del servidor');
    }
};

async function descontarStock(client, prodId, sedeId, cantidad, usuarioId, ticketCodigo, motivo, precioVenta = 0) {
    
    // 1. Validar producto y traer costo_compra real
    const prod = await client.query('SELECT controla_stock, tipo_item, nombre, costo_compra FROM productos WHERE id = $1', [prodId]);
    if (prod.rows.length === 0) return;
    const { controla_stock, tipo_item, nombre, costo_compra } = prod.rows[0];

    // Si es servicio o no controla stock, terminamos temprano
    if (tipo_item === 'servicio' || !controla_stock) return;

    // --- 🛡️ 2. VALIDACIÓN DE RESERVAS WEB (NUEVO) ---
    // Consultamos la vista inteligente para ver cuánto hay disponible REALMENTE para vender
    const stockNetoRes = await client.query(
        'SELECT stock_neto_vender, stock_fisico FROM vista_stock_disponible WHERE producto_id = $1 AND sede_id = $2',
        [prodId, sedeId]
    );

    if (stockNetoRes.rows.length === 0) {
        throw new Error(`El producto ${nombre} no está registrado en el inventario de esta sede.`);
    }

    const { stock_neto_vender, stock_fisico } = stockNetoRes.rows[0];

    // Bloqueo si lo que se quiere vender supera lo disponible (Stock Físico - Reservas)
    if (stock_neto_vender < cantidad) {
        throw new Error(
            `Stock insuficiente para: ${nombre}. \n` +
            `Físico: ${stock_fisico} | Reservado Web: ${stock_fisico - stock_neto_vender} \n` +
            `Disponible real para venta: ${stock_neto_vender}`
        );
    }

    // Obtenemos el stock actual para el cálculo del Kardex (usamos FOR UPDATE para bloquear la fila)
    const stockFisicoRes = await client.query(
        'SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE', 
        [prodId, sedeId]
    );
    const stockActual = stockFisicoRes.rows.length > 0 ? parseInt(stockFisicoRes.rows[0].cantidad) : 0;

    // --- 3. ALGORITMO PEPS (LOTES) ---
    let cantidadRestante = cantidad;
    let stockParaKardex = stockActual; 

    const lotesRes = await client.query(
        `SELECT id, cantidad_actual, costo_unitario FROM inventario_lotes 
         WHERE producto_id = $1 AND sede_id = $2 AND cantidad_actual > 0 
         ORDER BY fecha_ingreso ASC FOR UPDATE`,
        [prodId, sedeId]
    );

    // 🔥 CASO ESPECIAL: Sin Lote (Mantenemos tu lógica de costo inyectado)
    if (lotesRes.rows.length === 0 && stockActual > 0) {
        await client.query('UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3', [cantidad, prodId, sedeId]);
        
        const costoReal = parseFloat(costo_compra) || 0;
        console.log(`✅ [KARDEX] Producto: ${nombre} | Descontando SIN LOTE | Costo: S/ ${costoReal}`);

        await client.query(
            `INSERT INTO movimientos_inventario 
            (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento, precio_venta_historico, fecha)
             VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`, 
            [
                sedeId, 
                prodId, 
                usuarioId, 
                -cantidad, 
                (stockActual - cantidad), 
                `Venta ${ticketCodigo} (${motivo})`, 
                costoReal, 
                precioVenta 
            ]
        );
        return;
    }

    // ITERAMOS LOS LOTES (Si existen lotes disponibles)
    for (const lote of lotesRes.rows) {
        if (cantidadRestante <= 0) break;

        const aSacar = Math.min(cantidadRestante, lote.cantidad_actual);
        const costoDeEsteLote = parseFloat(lote.costo_unitario);

        await client.query(
            `UPDATE inventario_lotes 
             SET cantidad_actual = cantidad_actual - $1,
                 estado = CASE WHEN cantidad_actual - $1 = 0 THEN 'AGOTADO' ELSE estado END
             WHERE id = $2`,
            [aSacar, lote.id]
        );

        stockParaKardex -= aSacar;

        await client.query(
            `INSERT INTO movimientos_inventario 
            (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento, precio_venta_historico, fecha)
             VALUES ($1, $2, $3, 'salida_venta', $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`, 
            [
                sedeId, 
                prodId, 
                usuarioId, 
                -aSacar, 
                stockParaKardex, 
                `Venta ${ticketCodigo} (${motivo}) - Lote ${lote.id}`, 
                costoDeEsteLote, 
                precioVenta 
            ]
        );

        cantidadRestante -= aSacar;
    }

    // Actualización final del stock físico en la sede
    await client.query('UPDATE inventario_sedes SET cantidad = cantidad - $1 WHERE producto_id = $2 AND sede_id = $3', [cantidad, prodId, sedeId]);
}

async function reponerStock(client, prodId, sedeId, cantidad, usuarioId, ticketId, motivo) {
    const prod = await client.query('SELECT controla_stock, costo_compra FROM productos WHERE id = $1', [prodId]);
    if (!prod.rows[0]?.controla_stock) return;

    const stockRes = await client.query('SELECT cantidad FROM inventario_sedes WHERE producto_id = $1 AND sede_id = $2 FOR UPDATE', [prodId, sedeId]);
    let stockActual = stockRes.rows.length > 0 ? stockRes.rows[0].cantidad : 0;
    if (stockRes.rows.length === 0) await client.query(`INSERT INTO inventario_sedes (sede_id, producto_id, cantidad) VALUES ($1, $2, 0)`, [sedeId, prodId]);

    await client.query('UPDATE inventario_sedes SET cantidad = cantidad + $1 WHERE producto_id = $2 AND sede_id = $3', [cantidad, prodId, sedeId]);
    
    await client.query(
        `INSERT INTO movimientos_inventario (sede_id, producto_id, usuario_id, tipo_movimiento, cantidad, stock_resultante, motivo, costo_unitario_movimiento)
         VALUES ($1, $2, $3, 'entrada_anulacion', $4, $5, $6, $7)`,
        [sedeId, prodId, usuarioId, cantidad, (stockActual + cantidad), `Anulación #${ticketId}`, parseFloat(prod.rows[0].costo_compra) || 0]
    );
}
