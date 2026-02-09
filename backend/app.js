// Ubicacion: SuperNova/backend/app.js

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Configuracion
dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// --- MIDDLEWARES (Solo los necesarios para velocidad) ---
app.use(cors()); // Permite que el frontend hable con el backend

// Límite alto para fotos y datos
app.use(express.json({ limit: '50mb' })); 
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// --- IMPORTAR RUTAS ---
const authRoutes = require('./routes/authRoutes');
const usuariosRoutes = require('./routes/usuariosRoutes');
const inventarioRoutes = require('./routes/inventarioRoutes');
const crmRoutes = require('./routes/crmRoutes');
const clientesRoutes = require('./routes/clientesRoutes');
const proveedoresRoutes = require('./routes/proveedoresRoutes');
const facturasRoutes = require('./routes/facturasRoutes');
const ventasRoutes = require('./routes/ventasRoutes');
const cajaRoutes = require('./routes/cajaRoutes');
const analiticaRoutes = require('./routes/analiticaRoutes'); 
const sedesRoutes = require('./routes/sedesRoutes');
const tercerosRoutes = require('./routes/tercerosRoutes');
const cajaChicaRoutes = require('./routes/cajaChicaRoutes');
const facturacionRoutes = require('./routes/facturacionRoutes');
const consultasRoutes = require('./routes/consultasRoutes');

// --- DEFINIR ENDPOINTS API ---
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', usuariosRoutes);
app.use('/api/inventario', inventarioRoutes);
app.use('/api/crm', crmRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/proveedores', proveedoresRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/caja', cajaRoutes);
app.use('/api/analitica', analiticaRoutes);
app.use('/api/sedes', sedesRoutes);
app.use('/api/terceros', tercerosRoutes);
app.use('/api/caja-chica', cajaChicaRoutes);
app.use('/api/facturacion', facturacionRoutes);
app.use('/api/consultas', consultasRoutes);

// --- ARCHIVOS ESTÁTICOS ---
app.use('/backend/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Servir el Frontend
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.static(path.join(__dirname, '../'))); 

// --- RUTAS DE VISTAS (SPA / HTML) ---
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

// MANEJO DE RUTAS NO ENCONTRADAS (404 API)
app.use('/api', (req, res) => {
    res.status(404).json({ 
        success: false, 
        message: 'Endpoint no encontrado (404)' 
    });
});

// MANEJADOR DE ERRORES GLOBAL
app.use((err, req, res, next) => {
    console.error("❌ ERROR:", err.stack);
    res.status(500).json({ 
        success: false, 
        message: 'Error interno del servidor.',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
});

// Arrancar Servidor
app.listen(port, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 SUPERNOVA (LITE) LISTO EN: http://localhost:${port}`);
    console.log(`⚡ Modo Rápido: Sin restricciones de Helmet`);
    console.log(`==================================================\n`);
});