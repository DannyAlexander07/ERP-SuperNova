// Ubicacion: SuperNova/backend/app.js

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Configuracion
dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// --- MIDDLEWARES (Optimizado para velocidad y carga de archivos) ---
app.use(cors()); // Permite comunicación Frontend-Backend

// Límite alto para fotos de evidencia y datos grandes
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- IMPORTAR RUTAS ---
const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const inventarioRoutes = require('./routes/inventarioRoutes');
const crmRoutes = require('./routes/crmRoutes');
const clientesRoutes = require('./routes/clientesRoutes');
const proveedoresRoutes = require('./routes/proveedoresRoutes');
const facturasRoutes = require('./routes/facturasRoutes'); // 💰 Módulo Finanzas
const ventasRoutes = require('./routes/ventasRoutes');
const cajaRoutes = require('./routes/cajaRoutes');
const analiticaRoutes = require('./routes/analiticaRoutes'); 
const sedesRoutes = require('./routes/sedesRoutes');
const tercerosRoutes = require('./routes/tercerosRoutes');
const cajaChicaRoutes = require('./routes/cajaChicaRoutes');
const facturacionRoutes = require('./routes/facturacionRoutes'); // Facturación Electrónica (Nubefact)
const consultasRoutes = require('./routes/consultasRoutes');

// --- DEFINIR ENDPOINTS API ---

// Sistema Base
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/sedes', sedesRoutes);

// Negocio Core
app.use('/api/inventario', inventarioRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/caja-chica', cajaChicaRoutes);

// Gestión Comercial y Terceros
app.use('/api/crm', crmRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/terceros', tercerosRoutes); // Canjes y B2B

// 💰 FINANZAS (FACTURAS, GASTOS Y PRÉSTAMOS)
app.use('/api/facturas', facturasRoutes);
// 🚨 TRUCO DE ENRUTAMIENTO: 
// Montamos facturasRoutes también en la raíz '/api' para que las llamadas
// del frontend a '/api/prestamos' y '/api/pago/:id' funcionen directamente.
app.use('/api', facturasRoutes); 

// Facturación Electrónica y Consultas Externas
app.use('/api/facturacion', facturacionRoutes);
app.use('/api/consultas', consultasRoutes); // DNI/RUC

// Reportes
app.use('/api/analitica', analiticaRoutes);


// --- ARCHIVOS ESTÁTICOS (EVIDENCIAS Y FOTOS) ---
// --- ARCHIVOS ESTÁTICOS (EVIDENCIAS Y FOTOS) ---
const uploadsPath = path.join(__dirname, 'uploads');
app.use('/uploads', express.static(uploadsPath));
app.use('/backend/uploads', express.static(uploadsPath));

// Log para que sepas dónde está buscando las fotos el servidor al arrancar
console.log(`📂 Carpeta de uploads vinculada en: ${uploadsPath}`);

// --- SERVIR FRONTEND (SPA) ---
app.use(express.static(path.join(__dirname, '../frontend')));
// Servir archivos estáticos de la raíz si es necesario
app.use(express.static(path.join(__dirname, '../'))); 

app.use('/api/prestamos', require('./routes/prestamosRoutes'));
// --- RUTAS DE VISTAS HTML ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

// MANEJO DE RUTAS NO ENCONTRADAS (404 API)
// Esto evita que el frontend se quede "cargando" si la ruta no existe
app.use('/api', (req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Endpoint API no encontrado (404)' 
    });
});

// MANEJADOR DE ERRORES GLOBAL (Evita caídas del servidor)
app.use((err, req, res, next) => {
    console.error("❌ ERROR CRÍTICO SERVIDOR:", err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Error interno del servidor SuperNova.',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// --- ARRANCAR SERVIDOR ---
app.listen(port, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 SUPERNOVA (LITE) ACTIVO EN: http://localhost:${port}`);
    console.log(`📂 Módulo Finanzas: /api/facturas y /api/prestamos`);
    console.log(`==================================================\n`);
});