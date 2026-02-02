// Ubicación: SuperNova/backend/controllers/cajaController.js
const pool = require('../db');

// 1. OBTENER MOVIMIENTOS (CORREGIDO: s.prefijo_ticket en lugar de v.prefijo_ticket)
exports.obtenerMovimientos = async (req, res) => {
    try {
        if (!req.usuario) return res.status(401).json({ msg: "No autorizado" });

        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        const esAdmin = ['superadmin', 'admin', 'administrador', 'gerente'].includes(rol);
        const usuarioSedeId = req.usuario.sede_id;
        const filtroSedeId = req.query.sede; 

        let query = `
            SELECT 
                mc.id, mc.fecha_registro, mc.tipo_movimiento, mc.categoria AS origen, 
                mc.descripcion, mc.monto, mc.metodo_pago, 
                u.nombres AS usuario, s.nombre AS nombre_sede,
                
                -- Datos extra desde la venta (LEFT JOIN)
                v.tipo_comprobante,
                v.tipo_tarjeta,
                v.numero_ticket_sede,
                
                -- CORRECCIÓN AQUÍ: El prefijo viene de la SEDE (s), no de la venta (v)
                s.prefijo_ticket

            FROM movimientos_caja mc
            JOIN usuarios u ON mc.usuario_id = u.id
            JOIN sedes s ON mc.sede_id = s.id
            LEFT JOIN ventas v ON mc.venta_id = v.id 
            WHERE 1=1
        `;

        const params = [];
        let paramIndex = 1;

        if (esAdmin) {
            if (filtroSedeId) {
                query += ` AND mc.sede_id = $${paramIndex}`;
                params.push(filtroSedeId);
                paramIndex++;
            }
        } else {
            query += ` AND mc.sede_id = $${paramIndex}`;
            params.push(usuarioSedeId);
            paramIndex++;
        }

        query += ` ORDER BY mc.fecha_registro DESC LIMIT 200`;

        const result = await pool.query(query, params);
        res.json(result.rows);

    } catch (err) {
        console.error("Error historial caja:", err.message);
        res.status(500).json({ msg: 'Error al obtener historial.' });
    }
};

// 2. REGISTRAR MOVIMIENTO (Gasto manual)
exports.registrarMovimiento = async (req, res) => {
    const { tipo, origen, monto, metodo, descripcion } = req.body;
    
    if (!req.usuario) return res.status(401).json({ msg: "No autorizado" });
    const sedeId = req.usuario.sede_id;
    const usuarioId = req.usuario.id;

    try {
        if (!monto || monto <= 0) return res.status(400).json({ msg: "Monto inválido" });

        const query = `
            INSERT INTO movimientos_caja (
                sede_id, usuario_id, tipo_movimiento, categoria, 
                descripcion, monto, metodo_pago
            ) VALUES ($1, $2, $3, $4, $5, $6, $7) 
            RETURNING *
        `;

        const nuevoMov = await pool.query(query, [
            sedeId, usuarioId, tipo, origen || 'MANUAL', descripcion, monto, metodo
        ]);

        res.json({ msg: 'Registrado', movimiento: nuevoMov.rows[0] });

    } catch (err) {
        console.error("Error registro caja:", err.message);
        res.status(500).send('Error al registrar.');
    }
};

// 3. OBTENER RESUMEN (CORREGIDO: Incluye JOIN con ventas para distinguir tarjetas y evitar errores de alias)
exports.obtenerResumenCaja = async (req, res) => {
    try {
        if (!req.usuario) return res.status(401).json({msg: "Sin sesión"});
        
        const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
        const esAdmin = ['superadmin', 'admin', 'administrador', 'gerente'].includes(rol);
        const usuarioSedeId = req.usuario.sede_id;
        const filtroSedeId = req.query.sede;

        let sedeConsulta = null; 
        if (esAdmin && filtroSedeId) sedeConsulta = filtroSedeId; 
        else if (!esAdmin) sedeConsulta = usuarioSedeId; 

        // Consulta del tope autorizado (Marcador NEUTRO)
        const resTope = await pool.query(`
            SELECT descripcion FROM movimientos_caja 
            WHERE categoria = 'AUTORIZACION_TOPE' 
            AND ($1::int IS NULL OR sede_id = $1::int)
            AND fecha_registro::date = CURRENT_DATE
            ORDER BY id DESC LIMIT 1
        `, [sedeConsulta]);

        let topeAutorizado = 1000; 
        if (resTope.rows.length > 0) {
            const texto = resTope.rows[0].descripcion;
            const partes = texto.split(': ');
            if (partes[1]) {
                const numero = parseInt(partes[1]);
                if (!isNaN(numero)) topeAutorizado = numero;
            }
        }

        // CONSULTA MAESTRA CORREGIDA: Se añade LEFT JOIN ventas v para habilitar el alias 'v'
        const query = `
            WITH MovimientosNormalizados AS (
                SELECT 
                    mc.fecha_registro,
                    mc.tipo_movimiento,
                    mc.monto,
                    CASE 
                        WHEN mc.metodo_pago ILIKE '%efectivo%' THEN 'EFECTIVO'
                        WHEN mc.metodo_pago ILIKE '%yape%' THEN 'YAPE'
                        WHEN mc.metodo_pago ILIKE '%plin%' THEN 'PLIN'
                        WHEN mc.metodo_pago ILIKE '%transferencia%' THEN 'TRANSFERENCIA'
                        
                        -- 🔥 CORRECCIÓN CRÍTICA: Mapeo de Tarjetas usando la tabla de ventas (v)
                        WHEN (mc.metodo_pago ILIKE '%tarjeta%' OR mc.metodo_pago ILIKE '%pago%') 
                             AND (v.tipo_tarjeta ILIKE '%credito%' OR v.tipo_tarjeta ILIKE '%crédito%') THEN 'CREDITO'
                        
                        WHEN mc.metodo_pago ILIKE '%tarjeta%' 
                             OR v.tipo_tarjeta ILIKE '%debito%' 
                             OR v.tipo_tarjeta ILIKE '%débito%' THEN 'DEBITO'
                        
                        ELSE 'OTROS'
                    END AS metodo_normalizado
                FROM movimientos_caja mc
                LEFT JOIN ventas v ON mc.venta_id = v.id -- 🛡️ ESTA LÍNEA HABILITA EL USO DE 'v'
                WHERE ($1::int IS NULL OR mc.sede_id = $1::int)
            )
            SELECT 
                -- 1. TOTALES GENERALES
                SUM(CASE WHEN fecha_registro::date = CURRENT_DATE THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS neto_hoy,
                SUM(CASE WHEN EXTRACT(WEEK FROM fecha_registro) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS neto_semana,
                SUM(CASE WHEN EXTRACT(MONTH FROM fecha_registro) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS neto_mes,
                SUM(CASE WHEN EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS neto_anio,

                -- 2. DESGLOSE HOY
                SUM(CASE WHEN fecha_registro::date = CURRENT_DATE AND metodo_normalizado = 'EFECTIVO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS efec_hoy,
                SUM(CASE WHEN fecha_registro::date = CURRENT_DATE AND metodo_normalizado = 'YAPE' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS yape_hoy,
                SUM(CASE WHEN fecha_registro::date = CURRENT_DATE AND metodo_normalizado = 'PLIN' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS plin_hoy,
                SUM(CASE WHEN fecha_registro::date = CURRENT_DATE AND metodo_normalizado = 'TRANSFERENCIA' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS transf_hoy,
                SUM(CASE WHEN fecha_registro::date = CURRENT_DATE AND metodo_normalizado = 'DEBITO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS debito_hoy,
                SUM(CASE WHEN fecha_registro::date = CURRENT_DATE AND metodo_normalizado = 'CREDITO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS credito_hoy,

                -- SEMANA
                SUM(CASE WHEN EXTRACT(WEEK FROM fecha_registro) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'EFECTIVO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS efec_semana,
                SUM(CASE WHEN EXTRACT(WEEK FROM fecha_registro) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'YAPE' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS yape_semana,
                SUM(CASE WHEN EXTRACT(WEEK FROM fecha_registro) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'PLIN' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS plin_semana,
                SUM(CASE WHEN EXTRACT(WEEK FROM fecha_registro) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'TRANSFERENCIA' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS transf_semana,
                SUM(CASE WHEN EXTRACT(WEEK FROM fecha_registro) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'DEBITO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS debito_semana,
                SUM(CASE WHEN EXTRACT(WEEK FROM fecha_registro) = EXTRACT(WEEK FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'CREDITO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS credito_semana,

                -- MES
                SUM(CASE WHEN EXTRACT(MONTH FROM fecha_registro) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'EFECTIVO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS efec_mes,
                SUM(CASE WHEN EXTRACT(MONTH FROM fecha_registro) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'YAPE' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS yape_mes,
                SUM(CASE WHEN EXTRACT(MONTH FROM fecha_registro) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'PLIN' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS plin_mes,
                SUM(CASE WHEN EXTRACT(MONTH FROM fecha_registro) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'TRANSFERENCIA' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS transf_mes,
                SUM(CASE WHEN EXTRACT(MONTH FROM fecha_registro) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'DEBITO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS debito_mes,
                SUM(CASE WHEN EXTRACT(MONTH FROM fecha_registro) = EXTRACT(MONTH FROM CURRENT_DATE) AND EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'CREDITO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS credito_mes,

                -- AÑO
                SUM(CASE WHEN EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'EFECTIVO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS efec_anio,
                SUM(CASE WHEN EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'YAPE' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS yape_anio,
                SUM(CASE WHEN EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'PLIN' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS plin_anio,
                SUM(CASE WHEN EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'TRANSFERENCIA' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS transf_anio,
                SUM(CASE WHEN EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'DEBITO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS debito_anio,
                SUM(CASE WHEN EXTRACT(YEAR FROM fecha_registro) = EXTRACT(YEAR FROM CURRENT_DATE) AND metodo_normalizado = 'CREDITO' THEN (CASE WHEN tipo_movimiento = 'INGRESO' THEN monto ELSE -monto END) ELSE 0 END) AS credito_anio
            FROM MovimientosNormalizados
        `;

        const queryMerma = `SELECT 
            COALESCE(SUM(CASE WHEN fecha::date = CURRENT_DATE THEN (ABS(cantidad) * costo_unitario_movimiento) ELSE 0 END), 0) AS merma_hoy,
            COALESCE(SUM(CASE WHEN EXTRACT(WEEK FROM fecha) = EXTRACT(WEEK FROM CURRENT_DATE) THEN (ABS(cantidad) * costo_unitario_movimiento) ELSE 0 END), 0) AS merma_semana,
            COALESCE(SUM(CASE WHEN EXTRACT(MONTH FROM fecha) = EXTRACT(MONTH FROM CURRENT_DATE) THEN (ABS(cantidad) * costo_unitario_movimiento) ELSE 0 END), 0) AS merma_mes,
            COALESCE(SUM(CASE WHEN EXTRACT(YEAR FROM fecha) = EXTRACT(YEAR FROM CURRENT_DATE) THEN (ABS(cantidad) * costo_unitario_movimiento) ELSE 0 END), 0) AS merma_anio
            FROM movimientos_inventario WHERE cantidad < 0 AND tipo_movimiento NOT ILIKE '%venta%' AND ($1::int IS NULL OR sede_id = $1::int)`;

        const [resCaja, resMerma] = await Promise.all([
            pool.query(query, [sedeConsulta]),
            pool.query(queryMerma, [sedeConsulta])
        ]);

        const c = resCaja.rows[0];
        const m = resMerma.rows[0];

        res.json({ 
            topeAutorizado: topeAutorizado,
            dia: parseFloat(c.neto_hoy || 0),
            semana: parseFloat(c.neto_semana || 0),
            mes: parseFloat(c.neto_mes || 0),
            anio: parseFloat(c.neto_anio || 0),
            
            desglose: {
                hoy: {
                    efectivo: c.efec_hoy || 0, yape: c.yape_hoy || 0, plin: c.plin_hoy || 0, transferencia: c.transf_hoy || 0, debito: c.debito_hoy || 0, credito: c.credito_hoy || 0
                },
                semana: {
                    efectivo: c.efec_semana || 0, yape: c.yape_semana || 0, plin: c.plin_semana || 0, transferencia: c.transf_semana || 0, debito: c.debito_semana || 0, credito: c.credito_semana || 0
                },
                mes: {
                    efectivo: c.efec_mes || 0, yape: c.yape_mes || 0, plin: c.plin_mes || 0, transferencia: c.transf_mes || 0, debito: c.debito_mes || 0, credito: c.credito_mes || 0
                },
                anio: {
                    efectivo: c.efec_anio || 0, yape: c.yape_anio || 0, plin: c.plin_anio || 0, transferencia: c.transf_anio || 0, debito: c.debito_anio || 0, credito: c.credito_anio || 0
                }
            },

            mermas: {
                hoy: parseFloat(m.merma_hoy || 0),
                semana: parseFloat(m.merma_semana || 0),
                mes: parseFloat(m.merma_mes || 0),
                anio: parseFloat(m.merma_anio || 0)
            },
            gastos: { hoy: 0, semana: 0, mes: 0, anio: 0 } 
        });

    } catch (err) {
        console.error("❌ Error resumen caja detallado:", err.message);
        res.status(500).json({ msg: 'Error interno al calcular KPIs.' });
    }
};

// --- REEMPLAZAR FUNCIÓN autorizarTope EN cajaController.js ---
exports.autorizarTope = async (req, res) => {
    // 1. Verificación de Roles: Solo niveles altos pueden autorizar
    const rol = req.usuario.rol ? req.usuario.rol.toLowerCase() : '';
    const esAdmin = ['superadmin', 'admin', 'administrador', 'gerente'].includes(rol);
    
    if (!esAdmin) {
        return res.status(403).json({ 
            msg: "⛔ No tienes permisos de nivel superior para autorizar este tope de efectivo." 
        });
    }

    const { nuevoTope, sedeId } = req.body;
    // Si no viene sedeId, usamos la del usuario que autoriza
    const sedeTarget = sedeId || req.usuario.sede_id;

    try {
        // Validación de monto
        if (!nuevoTope || nuevoTope <= 0) {
            return res.status(400).json({ msg: "El monto del nuevo tope debe ser un número mayor a cero." });
        }

        // Insertamos el "marcador" de autorización en la tabla de movimientos
        await pool.query(
            `INSERT INTO movimientos_caja 
            (sede_id, usuario_id, tipo_movimiento, categoria, descripcion, monto, metodo_pago, fecha_registro)
            VALUES ($1, $2, 'NEUTRO', 'AUTORIZACION_TOPE', 'Tope autorizado hasta: ' || $3, 0, 'SISTEMA', NOW())`,
            [sedeTarget, req.usuario.id, nuevoTope]
        );

        res.json({ 
            msg: `✅ Autorización concedida. La caja de la sede ahora puede operar hasta S/ ${nuevoTope}` 
        });

    } catch (err) {
        console.error("Error en autorizarTope:", err.message);
        res.status(500).json({ msg: "Error interno al procesar la autorización del tope." });
    }
};