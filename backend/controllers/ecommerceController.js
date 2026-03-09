// UBICACIÓN: backend/controllers/ecommerceController.js
const pool = require('../db');

// 1. OBTENER PEDIDOS WEB (Para la pantalla del Cajero en el ERP)
exports.obtenerPedidosWeb = async (req, res) => {
    try {
        const sedeId = req.usuario.sede_id;
        
        // Buscamos solo las ventas que vengan de la WEB y de esta sede específica
        const query = `
            SELECT 
                id, 
                fecha_venta, 
                total_venta, 
                codigo_recojo, 
                estado_despacho, 
                cliente_razon_social AS cliente_nombre, 
                transaccion_pasarela
            FROM ventas
            WHERE origen = 'WEB' AND sede_id = $1
            ORDER BY fecha_venta DESC
        `;
        const result = await pool.query(query, [sedeId]);
        res.json(result.rows);
    } catch (err) {
        console.error("Error obteniendo pedidos web:", err.message);
        res.status(500).send('Error del servidor al obtener pedidos web');
    }
};

// 2. MARCAR PEDIDO COMO ENTREGADO (Cuando el cliente muestra su código en tienda)
exports.entregarPedidoWeb = async (req, res) => {
    try {
        const { id } = req.params;
        const sedeId = req.usuario.sede_id;

        const query = `
            UPDATE ventas 
            SET estado_despacho = 'entregado'
            WHERE id = $1 AND sede_id = $2 AND origen = 'WEB'
            RETURNING id, codigo_recojo
        `;
        
        const result = await pool.query(query, [id, sedeId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ msg: 'Pedido no encontrado o no pertenece a esta sede.' });
        }

        res.json({ success: true, msg: '¡Pedido entregado con éxito!', pedido: result.rows[0] });
    } catch (err) {
        console.error("Error al entregar pedido:", err.message);
        res.status(500).send('Error del servidor al actualizar el pedido');
    }
};