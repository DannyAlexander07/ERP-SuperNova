// Ubicacion: SuperNova/backend/routes/analiticaRoutes.js
const express = require('express');
const router = express.Router();
const analiticaController = require('../controllers/analiticaController');
const { checkAuth } = require('../middleware/auth'); // 👈 Aquí se llama checkAuth

// --- RUTAS DE ANALÍTICA ---

// 1. Obtener P&L por Sede y Línea de Negocio
router.get('/pyl', checkAuth, analiticaController.obtenerPyL);

// 2. Obtener KPIs de Eventos
router.get('/kpis/eventos', checkAuth, analiticaController.obtenerKpisEventos);

// 3. Obtener Resumen Global
router.get('/resumen/global', checkAuth, analiticaController.obtenerResumenGlobal);

// 4. Resumen del Día
router.get('/resumen-dia', checkAuth, analiticaController.obtenerResumenDia);

// 5. 🚨 NUEVA RUTA CORREGIDA (Usando checkAuth en vez de auth)
router.get('/graficos', checkAuth, analiticaController.obtenerGraficosAvanzados);

module.exports = router;