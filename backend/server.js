const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

// Middlewares - Configuración de CORS para permitir cookies con credentials
app.use(cors({
    origin: function (origin, callback) {
        if (!origin || origin.includes('localhost') || origin.includes('127.0.0.1')) {
            callback(null, true);
        } else {
            callback(new Error('No permitido por CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir la carpeta frontend (subiendo un nivel desde backend)
app.use(express.static(path.join(__dirname, '../frontend')));

// Servir imágenes públicas
app.use('/imagenes', express.static(path.join(__dirname, '../imagenes')));

// Rutas de la API
app.use('/api', require('./routes/authRoutes'));
app.use('/api', require('./routes/productRoutes'));
app.use('/api', require('./routes/seniatRoutes'));

// Iniciar Servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor ejecutándose en: http://localhost:${PORT}`);
    console.log(`📄 Formulario en: http://localhost:${PORT}/admin.html`);
});