// Ubicación: backend/utils/cloudinaryConfig.js
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
require('dotenv').config();

// 1. Conectar con tu cuenta de Cloudinary usando el .env
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// 2. Configurar cómo y dónde se guardarán los archivos en la nube
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: async (req, file) => {
        
        // Separamos los archivos en carpetas dentro de tu Cloudinary para mantener el orden
        let folderName = 'supernova_otros';
        let resourceType = 'auto'; // 'auto' es mágico: detecta automáticamente si es imagen o PDF

        if (file.mimetype.includes('image')) {
            folderName = 'supernova_imagenes';
        } else if (file.mimetype === 'application/pdf') {
            folderName = 'supernova_documentos';
        }

        return {
            folder: folderName,
            resource_type: resourceType,
            // Formatos permitidos. Si alguien intenta subir un .exe, lo rechazará
            allowed_formats: ['jpg', 'png', 'jpeg', 'pdf', 'webp'] 
        };
    },
});

// 3. Crear el interceptor (middleware) que usaremos en las rutas
const uploadCloud = multer({ storage: storage });

module.exports = { cloudinary, uploadCloud };