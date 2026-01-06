// Ubicacion: SuperNova/backend/routes/analiticaRoutes.js
const express = require('express');
const router = express.Router();
const analiticaController = require('../controllers/analiticaController');
const { checkAuth } = require('../middleware/auth'); 

// --- RUTAS DE ANALÍTICA ---

// 1. Obtener P&L por Sede y Línea de Negocio (Módulo Analítica)
router.get('/pyl', checkAuth, analiticaController.obtenerPyL);

// 2. Obtener KPIs de Eventos (Módulo Analítica)
router.get('/kpis/eventos', checkAuth, analiticaController.obtenerKpisEventos);

// 3. Obtener Resumen Global (Módulo Analítica)
router.get('/resumen/global', checkAuth, analiticaController.obtenerResumenGlobal);

// 4. 🚨 NUEVA RUTA: Resumen del Día (Para el Dashboard de Inicio)
router.get('/resumen-dia', checkAuth, analiticaController.obtenerResumenDia);

module.exports = router;