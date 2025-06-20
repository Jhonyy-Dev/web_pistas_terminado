"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const backblazeService_1 = require("./services/backblazeService");
// Cargar variables de entorno
dotenv_1.default.config();
// Importar rutas cuando estén disponibles
// import audioRoutes from './routes/audioRoutes';
// import bucketRoutes from './routes/bucketRoutes';
// Configuración de la aplicación
const app = (0, express_1.default)();
const PORT = process.env.PORT || 3001;
// Middleware
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
// Configuración CORS más permisiva para desarrollo
app.use((0, cors_1.default)({
    origin: '*', // Permite todas las solicitudes en desarrollo
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Allow-Headers']
}));
// Middleware adicional para CORS
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    // Manejar solicitudes OPTIONS para preflight CORS
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    next();
});
// Middleware para logging de solicitudes
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
});
// Ruta raíz para verificar que la API está funcionando
app.get('/api', (req, res) => {
    res.json({
        message: 'API de Reproductor Musical Backblaze B2',
        version: '1.0.0',
        timestamp: new Date().toISOString()
    });
});
// Montar rutas cuando estén disponibles
// app.use('/api', bucketRoutes);
// app.use('/api/audio', audioRoutes);
// Ruta para obtener información del bucket y listar archivos
app.get('/api/bucket-info', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 20;
        const token = req.query.token;
        console.log(`Solicitando información de bucket: página ${page}, tamaño ${pageSize}, token: ${token || 'ninguno'}`);
        // Calcular qué archivo usar como punto de partida basándonos en la página
        let startFileName = token;
        // Si estamos en la página 1 y no hay token, empezamos desde el principio
        if (page === 1 && !startFileName) {
            startFileName = undefined;
        }
        // Obtener archivos de Backblaze B2
        const results = await backblazeService_1.BackblazeService.listFiles(pageSize, startFileName);
        // Preparar respuesta
        const response = {
            bucketName: 'pistas',
            totalFiles: 4415, // Número total exacto de archivos según las imágenes proporcionadas
            filesList: results.files,
            nextToken: results.nextFileName
        };
        // Configurar los headers CORS específicamente para esta respuesta
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        console.log(`API: Enviando ${results.files.length} archivos al cliente. Marcador de paginación: "${results.nextFileName || 'fin de la lista'}"`);
        res.json(response);
    }
    catch (error) {
        console.error('Error obteniendo información del bucket:', error);
        res.status(500).json({ error: `Error: ${error.message}` });
    }
});
// Ruta para búsqueda
app.get('/api/search', async (req, res) => {
    try {
        const query = req.query.q || '';
        console.log(`[API] Buscando archivos con término: "${query}"`);
        if (!query || query.length < 2) {
            console.log(`[API] Término de búsqueda demasiado corto: "${query}"`);
            return res.status(400).json({
                success: false,
                error: 'El término de búsqueda debe tener al menos 2 caracteres',
                results: []
            });
        }
        // Realizar búsqueda en Backblaze B2
        const results = await backblazeService_1.BackblazeService.searchFiles(query, 100);
        console.log(`[API] Búsqueda completa. Se encontraron ${results.length} resultados para "${query}"`);
        // Asegurarnos de que cada resultado tenga las propiedades que el frontend espera
        const formattedResults = results.map(file => {
            return {
                ...file,
                // Asegurar que siempre existan estas propiedades
                fileName: file.name || '', // Usar name como fileName para compatibilidad con frontend
                title: file.title || backblazeService_1.BackblazeService.extractTitleFromFileName(file.name || ''),
                artist: file.artist || backblazeService_1.BackblazeService.extractArtistFromFileName(file.name || '') || 'Desconocido'
            };
        });
        // Enviar respuesta con formato consistente
        res.json({
            success: true,
            results: formattedResults,
            query: query,
            count: formattedResults.length
        });
    }
    catch (error) {
        console.error('[API] Error en búsqueda:', error);
        res.status(500).json({
            success: false,
            error: `Error de búsqueda: ${error.message}`,
            results: [] // Siempre incluir results aunque sea vacío
        });
    }
});
// Ruta para obtener URL firmada para reproducir audio
app.get('/api/audio/url', async (req, res) => {
    try {
        const key = req.query.key;
        console.log(`Solicitando URL firmada para clave: "${key}"`);
        if (!key) {
            return res.status(400).json({ error: 'Se requiere el parámetro key' });
        }
        // Obtener URL firmada de Backblaze B2 (válida por 1 hora)
        const signedUrl = await backblazeService_1.BackblazeService.getSignedUrl(key, 3600);
        console.log(`URL firmada generada para ${key}`);
        res.json({ url: signedUrl });
    }
    catch (error) {
        console.error('Error obteniendo URL firmada:', error);
        res.status(500).json({ error: `Error: ${error.message}` });
    }
});
// Endpoint para transmitir audio desde B2 (evitar problemas CORS)
app.get('/api/audio/stream', async (req, res) => {
    try {
        const fileId = req.query.fileId;
        const fileName = req.query.fileName;
        if (!fileId || !fileName) {
            return res.status(400).json({ error: 'Se requieren fileId y fileName' });
        }
        console.log(`Streaming de audio para fileId: ${fileId}, fileName: ${fileName}`);
        // Asegurar que estamos autenticados con B2
        await backblazeService_1.BackblazeService.authenticate();
        // Construir URL de descarga directa
        const downloadUrl = `${backblazeService_1.BackblazeService.getDownloadUrl()}/b2api/v1/b2_download_file_by_id?fileId=${encodeURIComponent(fileId)}`;
        try {
            // Realizar la solicitud a B2 con manejo de errores mejorado
            const axios = await Promise.resolve().then(() => __importStar(require('axios')));
            const response = await axios.default({
                method: 'get',
                url: downloadUrl,
                headers: {
                    'Authorization': backblazeService_1.BackblazeService.getAuthToken(),
                    // Soportar solicitudes de rango para streaming parcial
                    'Range': req.headers.range || ''
                },
                responseType: 'stream',
                // Evitar que se aborten las solicitudes
                timeout: 30000,
                maxContentLength: Infinity,
                maxBodyLength: Infinity
            });
            // Obtener información de cabeceras para configurar respuesta
            const contentType = response.headers['content-type'] || 'audio/mpeg';
            const contentLength = response.headers['content-length'] || '';
            // Configurar headers para una transferencia de audio estable
            res.setHeader('Content-Type', contentType);
            if (contentLength) {
                res.setHeader('Content-Length', contentLength);
            }
            res.setHeader('Accept-Ranges', 'bytes');
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
            // Si hay un código de estado específico para rango parcial, mantenerlo
            if (response.status === 206) {
                res.status(206);
                if (response.headers['content-range']) {
                    res.setHeader('Content-Range', response.headers['content-range']);
                }
            }
            console.log(`Inicio de streaming para: ${fileName} (${contentType}, ${contentLength} bytes)`);
            // Transmitir el audio al cliente con manejo de eventos para detectar problemas
            const stream = response.data;
            stream.on('error', (err) => {
                console.error(`Error en streaming para ${fileName}:`, err);
                // No llamar a res.end() aquí ya que podría haber datos en tránsito
            });
            // Manejar eventos de cierre de la conexión
            req.on('close', () => {
                console.log(`Cliente cerró conexión para ${fileName}`);
                stream.destroy(); // Liberar recursos
            });
            // Transmitir datos al cliente
            stream.pipe(res);
        }
        catch (streamError) {
            console.error(`Error obteniendo stream para ${fileName}:`, streamError.message);
            res.status(500).json({ error: `Error obteniendo stream: ${streamError.message}` });
        }
    }
    catch (error) {
        console.error('Error transmitiendo audio:', error.message);
        res.status(500).json({ error: `Error transmitiendo audio: ${error.message}` });
    }
});
// Ruta para verificar el estado de la conexión con Backblaze
app.get('/api/b2-status', async (req, res) => {
    try {
        await backblazeService_1.BackblazeService.authenticate();
        res.json({ status: 'ok', message: 'Conectado a Backblaze B2' });
    }
    catch (error) {
        console.error('Error verificando estado de B2:', error);
        res.status(500).json({ error: `Error: ${error.message}` });
    }
});
// Iniciar el servidor
app.listen(PORT, () => {
    console.log(`✅ API ejecutándose en http://localhost:${PORT}`);
    console.log(`▶ Tiempo de inicio: ${new Date().toISOString()}`);
    // Verificar conexión con Backblaze al inicio
    if (!process.env.B2_APPLICATION_KEY) {
        console.warn('⚠️ ADVERTENCIA: Variable de entorno B2_APPLICATION_KEY no configurada');
        console.warn('   Para conectar con Backblaze B2, por favor configure esta variable de entorno');
    }
    else {
        console.log('🔑 Clave de aplicación B2 detectada, intentando conectar con Backblaze...');
        backblazeService_1.BackblazeService.authenticate()
            .then(() => console.log('✅ Conexión con Backblaze B2 establecida correctamente'))
            .catch(err => console.error('❌ Error conectando con Backblaze B2:', err.message));
    }
});
