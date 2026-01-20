// Ubicacion: SuperNova/backend/app.js

const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Configuracion
dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json()); // Permite leer JSON del frontend

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
app.use('/backend/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api/caja-chica', require('./routes/cajaChicaRoutes'));

// --- SERVIR FRONTEND ---
app.use(express.static(path.join(__dirname, '../frontend')));
app.use(express.static(path.join(__dirname, '../'))); // Para index.html raiz


// --- SERVIR ARCHIVOS SUBIDOS ---
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Rutas de Vistas
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../index.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/dashboard.html'));
});

// Arrancar Servidor
app.listen(port, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 SERVIDOR LISTO EN: http://localhost:${port}`);
    console.log(`==================================================\n`);
});