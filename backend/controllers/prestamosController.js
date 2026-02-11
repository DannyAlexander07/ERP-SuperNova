//Ubicacion: backend/controllers/prestamosController.js

const pool = require('../db');
const PdfPrinter = require('pdfmake/src/printer'); 

const fonts = {
    Roboto: {
        normal: 'Helvetica',
        bold: 'Helvetica-Bold',
        italics: 'Helvetica-Oblique',
        bolditalics: 'Helvetica-BoldOblique'
    }
};

// =======================================================
// 1. CREAR PRÉSTAMO (CORREGIDO: GUARDA DATOS LEGALES)
// =======================================================
exports.crearPrestamo = async (req, res) => {
    const { 
        tercero_id, tipo_flujo, moneda, monto_capital, 
        tasa_interes, tipo_tasa, frecuencia, plazo_cuotas, 
        periodo_gracia, fecha_inicio_pago, banco, cuenta,
        rep_nombre, rep_dni, partida // <--- Estos datos llegan, pero faltaba usarlos
    } = req.body;

    const usuarioId = req.usuario.id; 

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 👇 BLOQUE NUEVO: ACTUALIZAR DATOS DEL PROVEEDOR 👇
        // Esto asegura que el nombre del gerente y partida se guarden antes de hacer el contrato
        if (tercero_id) {
            await client.query(`
                UPDATE proveedores 
                SET representante_legal = COALESCE($1, representante_legal),
                    dni_representante = COALESCE($2, dni_representante),
                    partida_registral = COALESCE($3, partida_registral)
                WHERE id = $4
            `, [rep_nombre || null, rep_dni || null, partida || null, tercero_id]);
        }
        // 👆 FIN BLOQUE NUEVO 👆

        // 1. Insertar Cabecera
        const codigo = `PRE-${Date.now().toString().slice(-6)}`; 

        const resCab = await client.query(
            `INSERT INTO prestamos (
                codigo_prestamo, usuario_creador_id, tercero_id, tipo_flujo, moneda,
                monto_capital, tasa_interes, tipo_tasa, frecuencia, plazo_cuotas,
                periodo_gracia, fecha_inicio_pago, banco_destino, numero_cuenta_destino
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            RETURNING id`,
            [
                codigo, usuarioId, tercero_id, tipo_flujo, moneda,
                monto_capital, tasa_interes, tipo_tasa || 'ANUAL', frecuencia, plazo_cuotas,
                periodo_gracia || 0, fecha_inicio_pago, banco, cuenta
            ]
        );
        const prestamoId = resCab.rows[0].id;

        // 2. GENERACIÓN DEL CRONOGRAMA
        let i = parseFloat(tasa_interes) / 100;
        if (tipo_tasa === 'ANUAL') {
            i = Math.pow(1 + i, 1/12) - 1; 
        }

        let saldo = parseFloat(monto_capital);
        let fecha = new Date(fecha_inicio_pago);
        fecha.setMinutes(fecha.getMinutes() + fecha.getTimezoneOffset());

        let cuotaNumero = 1;

        // A. PERIODO DE GRACIA
        for (let g = 0; g < periodo_gracia; g++) {
            const interesPeriodo = saldo * i;
            await client.query(
                `INSERT INTO prestamos_cronograma (
                    prestamo_id, numero_cuota, fecha_vencimiento, 
                    cuota_total, capital_amortizado, interes_periodo, saldo_restante
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [prestamoId, cuotaNumero, new Date(fecha), interesPeriodo, 0, interesPeriodo, saldo]
            );
            fecha.setMonth(fecha.getMonth() + 1);
            cuotaNumero++;
        }

        // B. CUOTAS MÉTODO FRANCÉS
        const n = plazo_cuotas; 
        const factor = Math.pow(1 + i, n);
        const cuotaFija = saldo * ( (i * factor) / (factor - 1) );

        for (let k = 0; k < n; k++) {
            const interesPeriodo = saldo * i;
            const capitalAmortizado = cuotaFija - interesPeriodo;
            saldo -= capitalAmortizado;
            
            if (k === n - 1 && Math.abs(saldo) < 1) saldo = 0;

            await client.query(
                `INSERT INTO prestamos_cronograma (
                    prestamo_id, numero_cuota, fecha_vencimiento, 
                    cuota_total, capital_amortizado, interes_periodo, saldo_restante
                ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                [prestamoId, cuotaNumero, new Date(fecha), cuotaFija, capitalAmortizado, interesPeriodo, saldo]
            );

            fecha.setMonth(fecha.getMonth() + 1);
            cuotaNumero++;
        }

        await client.query('COMMIT');
        res.json({ msg: 'Préstamo creado y datos actualizados correctamente', id: prestamoId });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ msg: 'Error al generar préstamo' });
    } finally {
        client.release();
    }
};

// =======================================================
// 2. OBTENER LISTA DE PRÉSTAMOS
// =======================================================
exports.obtenerPrestamos = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT 
                p.id, p.codigo_prestamo, p.tipo_flujo, p.monto_capital, p.moneda,
                p.estado, p.tasa_interes, prov.razon_social AS contraparte,
                (SELECT COUNT(*) FROM prestamos_cronograma WHERE prestamo_id = p.id AND estado = 'PENDIENTE') as cuotas_pendientes
            FROM prestamos p
            LEFT JOIN proveedores prov ON p.tercero_id = prov.id
            ORDER BY p.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        res.status(500).json({ msg: 'Error al listar préstamos' });
    }
};

// =======================================================
// 3. OBTENER DETALLE (PARA EL CONTRATO Y VISTA)
// =======================================================
exports.obtenerDetallePrestamo = async (req, res) => {
    const { id } = req.params;
    try {
        const cabecera = await pool.query(`
            SELECT p.*, prov.razon_social, prov.ruc, prov.direccion, 
                   prov.representante_legal, prov.dni_representante, prov.partida_registral
            FROM prestamos p
            LEFT JOIN proveedores prov ON p.tercero_id = prov.id
            WHERE p.id = $1
        `, [id]);

        const cronograma = await pool.query(`
            SELECT * FROM prestamos_cronograma WHERE prestamo_id = $1 ORDER BY numero_cuota ASC
        `, [id]);

        if(cabecera.rows.length === 0) return res.status(404).json({msg: "No encontrado"});

        res.json({
            datos: cabecera.rows[0],
            cronograma: cronograma.rows
        });
    } catch (err) {
        res.status(500).json({ msg: 'Error al obtener detalle' });
    }
};

// =======================================================
// 4. SIMULAR PRÉSTAMO (Cálculo sin guardar en BD)
// =======================================================
exports.simularPrestamo = async (req, res) => {
    try {
        const { monto_capital, tasa_interes, tipo_tasa, plazo_cuotas, periodo_gracia, fecha_inicio_pago } = req.body;

        // 1. Validaciones matemáticas básicas
        if (!monto_capital || !tasa_interes || !plazo_cuotas) {
            return res.status(400).json({ msg: 'Faltan datos para calcular.' });
        }

        // 2. Lógica Método Francés (Idéntica a crearPrestamo pero en memoria)
        let i = parseFloat(tasa_interes) / 100;
        if (tipo_tasa === 'ANUAL') {
            i = Math.pow(1 + i, 1/12) - 1; 
        }

        let saldo = parseFloat(monto_capital);
        const n = parseInt(plazo_cuotas);
        const gracia = parseInt(periodo_gracia) || 0;
        let fecha = new Date(fecha_inicio_pago);
        fecha.setMinutes(fecha.getMinutes() + fecha.getTimezoneOffset());

        const cronograma = [];
        let cuotaNumero = 1;

        // A. Periodo de Gracia
        for (let g = 0; g < gracia; g++) {
            const interes = saldo * i;
            cronograma.push({
                numero: cuotaNumero++,
                fecha: new Date(fecha).toISOString().slice(0, 10),
                cuota: interes.toFixed(2),
                capital: 0.00,
                interes: interes.toFixed(2),
                saldo: saldo.toFixed(2)
            });
            fecha.setMonth(fecha.getMonth() + 1);
        }

        // B. Amortización
        const factor = Math.pow(1 + i, n);
        const cuotaFija = saldo * ( (i * factor) / (factor - 1) );

        for (let k = 0; k < n; k++) {
            const interes = saldo * i;
            const capital = cuotaFija - interes;
            saldo -= capital;
            if (k === n - 1 && Math.abs(saldo) < 1) saldo = 0;

            cronograma.push({
                numero: cuotaNumero++,
                fecha: new Date(fecha).toISOString().slice(0, 10),
                cuota: cuotaFija.toFixed(2),
                capital: capital.toFixed(2),
                interes: interes.toFixed(2),
                saldo: Math.max(0, saldo).toFixed(2)
            });
            fecha.setMonth(fecha.getMonth() + 1);
        }

        // 3. Devolver array para pintar en el Frontend
        res.json(cronograma);

    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error en cálculo' });
    }
};

// =======================================================
// 5. REGISTRAR PAGO DE CUOTA (Cobranza / Amortización)
// =======================================================
exports.pagarCuota = async (req, res) => {
    const { id } = req.params; // ID de la cuota (prestamos_cronograma)
    const { fecha_pago, metodo_pago, numero_operacion } = req.body;
    const usuarioId = req.usuario.id;
    const sedeId = req.usuario.sede_id;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Obtener datos de la cuota y del préstamo padre
        const qCuota = await client.query(`
            SELECT c.*, p.tipo_flujo, p.codigo_prestamo, p.moneda 
            FROM prestamos_cronograma c
            JOIN prestamos p ON c.prestamo_id = p.id
            WHERE c.id = $1
        `, [id]);

        if (qCuota.rows.length === 0) throw new Error('Cuota no encontrada');
        const cuota = qCuota.rows[0];

        if (cuota.estado === 'PAGADO') throw new Error('Esta cuota ya está pagada.');

        // 2. Actualizar estado de la cuota
        await client.query(`
            UPDATE prestamos_cronograma 
            SET estado = 'PAGADO', fecha_pago = $1 
            WHERE id = $2
        `, [fecha_pago, id]);

        // 3. IMPACTO EN CAJA (Movimiento de Dinero)
        // Si el préstamo fue 'OTORGADO' (prestamos dinero), el cobro de la cuota es un 'INGRESO'.
        // Si el préstamo fue 'RECIBIDO' (nos prestaron), el pago de la cuota es un 'EGRESO'.
        
        const tipoMovimientoCaja = cuota.tipo_flujo === 'OTORGADO' ? 'INGRESO' : 'EGRESO';
        const descripcion = `Cuota #${cuota.numero_cuota} del Préstamo ${cuota.codigo_prestamo}`;

        await client.query(`
            INSERT INTO movimientos_caja (
                sede_id, usuario_id, tipo_movimiento, categoria, descripcion, 
                monto, metodo_pago, numero_operacion, fecha_creacion
            ) VALUES ($1, $2, $3, 'prestamos', $4, $5, $6, $7, $8)
        `, [
            sedeId, usuarioId, tipoMovimientoCaja, descripcion, 
            cuota.cuota_total, metodo_pago, numero_operacion, fecha_pago
        ]);

        // 4. Verificar si el préstamo se terminó de pagar
        const pendientes = await client.query(
            "SELECT COUNT(*) FROM prestamos_cronograma WHERE prestamo_id = $1 AND estado != 'PAGADO'", 
            [cuota.prestamo_id]
        );

        if (parseInt(pendientes.rows[0].count) === 0) {
            await client.query("UPDATE prestamos SET estado = 'PAGADO' WHERE id = $1", [cuota.prestamo_id]);
        }

        await client.query('COMMIT');
        res.json({ msg: 'Cuota procesada correctamente.' });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ msg: err.message });
    } finally {
        client.release();
    }
};

// =======================================================
// 6. GENERAR CONTRATO PDF (TEXTO LEGAL + CRONOGRAMA ESTILIZADO)
// =======================================================
exports.generarContrato = async (req, res) => {
    const { id } = req.params;
    
    // IMPORTANTE: Asegúrate de tener pool importado arriba
    // const pool = require('../db'); 
    
    const client = await pool.connect();

    try {
        // 1. OBTENER DATOS
        const resPrestamo = await client.query(`
            SELECT p.*, 
                   prov.razon_social AS tercero_nombre, 
                   prov.ruc AS tercero_ruc, 
                   prov.direccion AS tercero_direccion,
                   prov.representante_legal AS tercero_rep,
                   prov.dni_representante AS tercero_dni,
                   prov.partida_registral AS tercero_partida
            FROM prestamos p
            JOIN proveedores prov ON p.tercero_id = prov.id
            WHERE p.id = $1
        `, [id]);

        if (resPrestamo.rows.length === 0) return res.status(404).send("Préstamo no encontrado");
        const datos = resPrestamo.rows[0];

        const resCronograma = await client.query(
            "SELECT * FROM prestamos_cronograma WHERE prestamo_id = $1 ORDER BY numero_cuota ASC", 
            [id]
        );
        const cronograma = resCronograma.rows;

        // 2. DEFINIR ROLES
        const supernova = {
            nombre: "SUPERNOVA SAN MIGUEL SAC",
            ruc: "20610551590",
            direccion: "Av. José Pardo N° 434, Int. 501, Miraflores, Lima",
            rep_nombre: "Alexander Arellano Sanchez",
            rep_dni: "74901194",
            partida: "15207572"
        };

        const tercero = {
            nombre: datos.tercero_nombre || "____________________",
            ruc: datos.tercero_ruc || "____________________",
            direccion: datos.tercero_direccion || "____________________",
            rep_nombre: datos.tercero_rep || "____________________",
            rep_dni: datos.tercero_dni || "____________________",
            partida: datos.tercero_partida || "____________________"
        };

        let mutuante = {};
        let mutuatario = {};

        if (datos.tipo_flujo === 'OTORGADO') {
            mutuante = supernova;
            mutuatario = tercero;
        } else {
            mutuante = tercero;
            mutuatario = supernova;
        }

        // 3. CONFIGURACIÓN PDFMAKE
        const printer = new PdfPrinter(fonts);
        
        // Formateadores
        const fmtMoneda = (m) => parseFloat(m).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const simbolo = datos.moneda === 'USD' ? 'US$' : 'S/';
        
        // Fechas
        const fechaObj = new Date(datos.fecha_desembolso || Date.now()); // Fallback si no hay fecha desembolso
        fechaObj.setMinutes(fechaObj.getMinutes() + fechaObj.getTimezoneOffset());
        
        const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const diaFirma = fechaObj.getDate();
        const mesFirma = meses[fechaObj.getMonth()];
        const anioFirma = fechaObj.getFullYear();

        // Calcular total intereses para el texto
        const totalIntereses = cronograma.reduce((acc, c) => acc + parseFloat(c.interes_periodo), 0);

        // 4. ESTRUCTURA DEL DOCUMENTO
        const docDefinition = {
            pageSize: 'A4',
            pageMargins: [60, 60, 60, 60], // Márgenes más amplios para legal
            content: [
                { text: 'CONTRATO DE MUTUO', style: 'header', alignment: 'center', margin: [0, 0, 0, 20] },
                
                // INTRODUCCIÓN
                { text: [
                    'Conste por el presente documento el Contrato de Mutuo que celebran de una parte:\n\n',
                    
                    { text: mutuante.nombre, bold: true }, 
                    `, con RUC Nº ${mutuante.ruc} con domicilio en ${mutuante.direccion}, representada por su Gerente General, `, 
                    { text: mutuante.rep_nombre, bold: true }, 
                    `, identificado con DNI Nº ${mutuante.rep_dni}, según poder inscrito en la partida electrónica Nº ${mutuante.partida} del Registro de Personas Jurídicas de Lima, a quien se denominará `, 
                    { text: 'EL MUTUANTE', bold: true }, 
                    '; y de la otra parte;\n\n',
                    
                    { text: mutuatario.nombre, bold: true }, 
                    `, con RUC Nº ${mutuatario.ruc} con domicilio en ${mutuatario.direccion}, representada por su Gerente General, `, 
                    { text: mutuatario.rep_nombre, bold: true }, 
                    `, identificado con DNI Nº ${mutuatario.rep_dni}, según poder inscrito en la partida electrónica Nº ${mutuatario.partida} del Registro de Personas Jurídicas de Lima, a quien se le denominará `, 
                    { text: 'LA MUTUATARIA', bold: true }, 
                    ', en los términos y condiciones siguientes:\n\n'
                ], style: 'justifyText' },

                // ANTECEDENTES
                { text: 'ANTECEDENTES', style: 'subheader' },
                { text: 'PRIMERA.- EL MUTUANTE es una persona jurídica que se dedica a las actividades de servicios generales e inversión. EL MUTUATARIO es una persona jurídica vinculada a EL MUTUANTE, que requiere satisfacer sus necesidades de liquidez, por lo que requiere un préstamo dinerario.', style: 'justifyText' },
                
                { text: [
                    'SEGUNDA.- En virtud de lo expuesto, EL MUTUATARIO se ha contactado con EL MUTUANTE con la finalidad que éste le preste dinero por la suma de ',
                    { text: `${simbolo} ${fmtMoneda(datos.monto_capital)}`, bold: true },
                    ' a fin de que pueda satisfacer sus necesidades de liquidez.\n',
                    'EL MUTUANTE, luego de analizar el requerimiento de EL MUTUATARIO ha aceptado su solicitud, disponiéndose que ese hecho debe constar por escrito.'
                ], style: 'justifyText' },

                // OBJETO
                { text: 'OBJETO DEL CONTRATO:', style: 'subheader' },
                { text: [
                    'TERCERA.- Por el presente contrato, EL MUTUANTE se obliga a entregar en mutuo, en favor de EL MUTUATARIO, la suma de dinero ascendente a ',
                    { text: `${simbolo} ${fmtMoneda(datos.monto_capital)}`, bold: true },
                    '.\nEL MUTUATARIO, a su turno, se obliga a devolver a EL MUTUANTE la referida suma de dinero en la forma y oportunidad pactadas en las cláusulas siguientes.'
                ], style: 'justifyText' },

                // OBLIGACIONES
                { text: 'OBLIGACIONES DE LAS PARTES:', style: 'subheader' },
                { text: 'CUARTA.- EL MUTUANTE se obliga a entregar la suma de dinero objeto de la prestación a su cargo en el momento de la firma de este documento, sin más constancia que las firmas de las partes puestas en él.', style: 'justifyText' },
                { text: `QUINTA.- EL MUTUATARIO declara haber recibido conforme la referida suma mutuada, en dinero en efectivo o transferencia, en ${datos.moneda === 'USD' ? 'dólares americanos' : 'soles'} y en la cantidad a que se refiere la cláusula tercera.`, style: 'justifyText' },

                // CRONOGRAMA (CLÁUSULA SEXTA)
                { text: [
                    'SEXTA.- EL MUTUATARIO se obliga a devolver el íntegro del dinero objeto del mutuo, en un plazo de ',
                    { text: `${datos.plazo_cuotas} meses`, bold: true },
                    ', y mediante pagos de cuotas con frecuencia ',
                    { text: datos.frecuencia.toLowerCase(), bold: true },
                    ` con un periodo de gracia de ${datos.periodo_gracia} meses, con la tasa de interés anual precisada en la Cláusula Undécima, por las sumas y en las oportunidades que se indican a continuación:`
                ], style: 'justifyText', margin: [0, 0, 0, 10] },

                // --- TABLA CRONOGRAMA ESTILIZADA ---
                {
                    table: {
                        headerRows: 1,
                        widths: ['auto', '*', 'auto', 'auto', 'auto'], // Anchos
                        body: [
                            // Encabezados con fondo oscuro
                            [
                                { text: 'N°', style: 'tableHeader' }, 
                                { text: 'Vencimiento', style: 'tableHeader' }, 
                                { text: 'Capital', style: 'tableHeader' }, 
                                { text: 'Interés', style: 'tableHeader' }, 
                                { text: 'Cuota Total', style: 'tableHeader' }
                            ],
                            // Filas de datos
                            ...cronograma.map((c, index) => [
                                { text: c.numero_cuota, alignment: 'center', fillColor: index % 2 === 0 ? '#ffffff' : '#f9f9f9' },
                                { text: new Date(c.fecha_vencimiento).toLocaleDateString('es-PE'), alignment: 'center', fillColor: index % 2 === 0 ? '#ffffff' : '#f9f9f9' },
                                { text: fmtMoneda(c.capital_amortizado), alignment: 'right', fillColor: index % 2 === 0 ? '#ffffff' : '#f9f9f9' },
                                { text: fmtMoneda(c.interes_periodo), alignment: 'right', fillColor: index % 2 === 0 ? '#ffffff' : '#f9f9f9' },
                                { text: `${simbolo} ${fmtMoneda(c.cuota_total)}`, bold: true, alignment: 'right', fillColor: index % 2 === 0 ? '#ffffff' : '#f9f9f9' }
                            ])
                        ]
                    },
                    layout: {
                        hLineWidth: function (i, node) { return (i === 0 || i === node.table.body.length) ? 1 : 0.5; },
                        vLineWidth: function (i, node) { return 0; }, // Sin líneas verticales para look moderno
                        hLineColor: function (i, node) { return '#aaa'; },
                        paddingLeft: function(i, node) { return 10; },
                        paddingRight: function(i, node) { return 10; },
                        paddingTop: function(i, node) { return 5; },
                        paddingBottom: function(i, node) { return 5; }
                    },
                    margin: [0, 0, 0, 15]
                },
                // ----------------------------------------

                { text: 'SÉTIMA.- EL MUTUATARIO se obliga a cumplir fielmente con el cronograma de pagos descrito en la cláusula anterior. En caso de incumplimiento en el pago de una de las armadas, cualquiera que sea, quedarán vencidas todas las demás, y en consecuencia EL MUTUANTE estará facultado para exigir el pago íntegro de la suma de dinero mutuada.', style: 'justifyText' },

                { text: 'OCTAVA.- Las partes acuerdan que EL MUTUATARIO devolverá la suma de dinero objeto del mutuo, en la misma moneda y cantidad recibida.', style: 'justifyText' },

                { text: `NOVENA.- Las partes dejan constancia de que los depósitos detallados en la cláusula sexta se realizarán en la cuenta número ${datos.numero_cuenta_destino || '_______________'} del Banco ${datos.banco_destino || '_______________'} de la que es titular EL MUTUANTE.`, style: 'justifyText' },

                // INTERESES
                { text: 'PAGO DE INTERESES:', style: 'subheader' },
                { text: 'DÉCIMA.- Ambas partes convienen en que el presente contrato de mutuo se celebra a título oneroso, en consecuencia EL MUTUATARIO está obligado al pago de intereses compensatorios en favor de EL MUTUANTE, de acuerdo a la tasa y forma de pago a que se refiere la cláusula siguiente.', style: 'justifyText' },

                { text: [
                    'UNDÉCIMA.- Queda convenido que la tasa de interés compensatorio asciende al ',
                    { text: `${datos.tasa_interes}% ${datos.tipo_tasa.toLowerCase()}`, bold: true },
                    ` del total de la suma mutuada, el mismo que equivale a un interés total aproximado de ${simbolo} ${fmtMoneda(totalIntereses)}.\nPara efectos del pago de intereses, el monto total convenido se dividirá entre la cantidad de armadas pactada en la cláusula sexta.`
                ], style: 'justifyText' },

                // GASTOS
                { text: 'GASTOS Y TRIBUTOS DEL CONTRATO:', style: 'subheader' },
                { text: 'DUODÉCIMA.- Las partes acuerdan que todos los gastos y tributos que origine la celebración y ejecución de este contrato serán asumidos por EL MUTUATARIO.', style: 'justifyText' },

                // COMPETENCIA
                { text: 'COMPETENCIA TERRITORIAL:', style: 'subheader' },
                { text: 'DÉCIMO TERCERA.- Para efectos de cualquier controversia que se genere con motivo de la celebración y ejecución de este contrato, las partes se someten a la competencia territorial de los jueces y tribunales de Lima.', style: 'justifyText' },

                // DOMICILIO
                { text: 'DOMICILIO:', style: 'subheader' },
                { text: 'DÉCIMO CUARTA.- Para la validez de todas las comunicaciones y notificaciones a las partes, con motivo de la ejecución de este contrato, ambas señalan como sus respectivos domicilios los indicados en la introducción de este documento. El cambio de domicilio de cualquiera de las partes surtirá efecto desde la fecha de comunicación de dicho cambio a la otra parte, por cualquier medio escrito.', style: 'justifyText' },

                // LEY
                { text: 'APLICACIÓN SUPLETORIA DE LA LEY:', style: 'subheader' },
                { text: 'DÉCIMO QUINTA.- En lo no previsto por las partes en el presente contrato, ambas se someten a lo establecido por las normas del Código Civil y demás del sistema jurídico que resulten aplicables.', style: 'justifyText' },

                { text: `\nEn señal de conformidad las partes suscriben este documento en la ciudad de Lima, a los ${diaFirma} días del mes de ${mesFirma} del ${anioFirma}.`, alignment: 'right', margin: [0, 20, 0, 40] },

                // FIRMAS
                {
                    columns: [
                        { stack: ['__________________________', { text: 'EL MUTUANTE', bold: true }, mutuante.nombre], alignment: 'center' },
                        { stack: ['__________________________', { text: 'LA MUTUATARIA', bold: true }, mutuatario.nombre], alignment: 'center' }
                    ]
                }
            ],
            
            // ESTILOS DE FUENTE
            styles: {
                header: { fontSize: 16, bold: true, decoration: 'underline' },
                subheader: { fontSize: 11, bold: true, margin: [0, 10, 0, 5], decoration: 'underline' },
                justifyText: { fontSize: 10, alignment: 'justify', lineHeight: 1.4, margin: [0, 0, 0, 8] },
                tableHeader: { bold: true, fontSize: 10, color: 'white', fillColor: '#2c3e50', alignment: 'center' } // Encabezado oscuro y letra blanca
            }
        };

        // Generar y enviar
        const pdfDoc = printer.createPdfKitDocument(docDefinition);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Contrato_${datos.codigo_prestamo}.pdf`);
        
        pdfDoc.pipe(res);
        pdfDoc.end();

    } catch (err) {
        console.error(err);
        res.status(500).send("Error generando contrato: " + err.message);
    } finally {
        client.release();
    }
};

// EDITAR PRÉSTAMO
exports.actualizarPrestamo = async (req, res) => {
    const { id } = req.params;
    const { banco, cuenta, rep_nombre, rep_dni, partida, tercero_id } = req.body;
    
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // 1. Actualizar datos bancarios del préstamo
        await client.query(`
            UPDATE prestamos 
            SET banco_destino = $1, numero_cuenta_destino = $2
            WHERE id = $3
        `, [banco, cuenta, id]);

        // 2. ACTUALIZAR PROVEEDOR (Para corregir el PDF)
        if (tercero_id) {
            await client.query(`
                UPDATE proveedores 
                SET representante_legal = $1, 
                    dni_representante = $2, 
                    partida_registral = $3
                WHERE id = $4
            `, [rep_nombre, rep_dni, partida, tercero_id]);
        }

        await client.query('COMMIT');
        res.json({ msg: "Datos actualizados correctamente" });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ msg: e.message });
    } finally {
        client.release();
    }
};

// ELIMINAR PRÉSTAMO
exports.eliminarPrestamo = async (req, res) => {
    const { id } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        // Borrar cronograma primero (FK)
        await client.query("DELETE FROM prestamos_cronograma WHERE prestamo_id = $1", [id]);
        // Borrar cabecera
        await client.query("DELETE FROM prestamos WHERE id = $1", [id]);
        
        await client.query('COMMIT');
        res.json({ msg: "Eliminado" });
    } catch (e) {
        await client.query('ROLLBACK');
        res.status(500).json({ msg: "Error al eliminar" });
    } finally {
        client.release();
    }
};