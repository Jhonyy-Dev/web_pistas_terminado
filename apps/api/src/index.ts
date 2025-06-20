import express from 'express';
import cors from 'cors';
import path from 'path';
import http from 'http';
import https from 'https';
import dotenv from 'dotenv';
import { BackblazeService } from './services/backblazeService';
import { B2File, BucketInfo } from './types';

// Cargar variables de entorno
dotenv.config();

// Importar rutas cuando estén disponibles
// import audioRoutes from './routes/audioRoutes';
// import bucketRoutes from './routes/bucketRoutes';

// Configuración de la aplicación
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configuración CORS más permisiva para desarrollo
app.use(cors({
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
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.pageSize as string) || 20;
    const noToken = req.query.noToken === 'true'; // Flag para indicar que no queremos usar tokens
    
    console.log(`[API] Solicitando información de bucket: página ${page}, tamaño ${pageSize}, noToken: ${noToken}`);
    
    // Enfoque simplificado: Siempre calcular la página correcta basado en offset
    // Este enfoque es más predecible y menos propenso a errores
    
    // Para la página 1, siempre comenzar desde el principio
    if (page === 1) {
      console.log('[API] Página 1: Obteniendo archivos desde el principio');
      const results = await BackblazeService.listFiles(pageSize, undefined);
      
      // Preparar respuesta
      const response: BucketInfo = {
        bucketName: 'pistas',
        totalFiles: 4415, // Número total exacto de archivos
        filesList: results.files,
        nextToken: results.nextFileName
      };
      
      // Configurar headers CORS
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      
      console.log(`[API] Página 1: Enviando ${results.files.length} archivos al cliente.`);
      return res.json(response);
    }
    
    // Para páginas 2 o mayores, usar enfoque de paginación basado en offset
    console.log(`[API] Página ${page}: Calculando offset para paginación`);
    
    // Calcular offset en base a la página solicitada
    const filesOffset = (page - 1) * pageSize;
    console.log(`[API] Offset calculado: (${page} - 1) * ${pageSize} = ${filesOffset} archivos`);
    
    // Implementación robusta: obtener archivos hasta el punto que necesitamos
    // y luego extraer solo los que corresponden a la página actual
    try {
      // Obtener TODOS los archivos hasta el offset + pageSize
      console.log(`[API] Obteniendo ${filesOffset + pageSize} archivos para calcular la página ${page}`);
      const allFilesNeeded = await BackblazeService.listFiles(filesOffset + pageSize, undefined);
      
      if (!allFilesNeeded || allFilesNeeded.files.length < filesOffset) {
        console.warn(`[API] No hay suficientes archivos para la página ${page}. Solo hay ${allFilesNeeded?.files.length} archivos disponibles`);
        return res.status(404).json({
          error: `No hay suficientes archivos para la página ${page}`,
          availableFiles: allFilesNeeded?.files.length || 0
        });
      }
      
      // Extraer solo los archivos que corresponden a la página actual
      const pageFiles = allFilesNeeded.files.slice(filesOffset, filesOffset + pageSize);
      const nextFileName = allFilesNeeded.files.length > filesOffset + pageSize ? 
        allFilesNeeded.files[filesOffset + pageSize - 1]?.name : 
        undefined;
      
      console.log(`[API] Página ${page}: Extrayendo ${pageFiles.length} archivos desde el índice ${filesOffset}`);
      
      // Preparar respuesta
      const response: BucketInfo = {
        bucketName: 'pistas',
        totalFiles: 4415,
        filesList: pageFiles,
        nextToken: nextFileName
      };
      
      // Configurar headers CORS
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      
      console.log(`[API] Enviando ${pageFiles.length} archivos al cliente para la página ${page}.`);
      return res.json(response);
    } catch (offsetError) {
      console.error(`[API] Error obteniendo archivos por offset:`, offsetError);
      
      // Como fallback, intentar usar el enfoque de token de continuación
      // Esto es más lento pero más confiable en algunos casos
      console.log(`[API] Intentando enfoque alternativo para página ${page}...`);
      
      // Este enfoque es más lento pero garantiza que llegaremos eventualmente a la página correcta
      // Obtenemos páginas secuencialmente hasta llegar a la deseada
      let currentFiles = await BackblazeService.listFiles(pageSize, undefined);
      let currentPage = 1;
      let nextStartFileName = currentFiles.nextFileName;
      
      while (currentPage < page && nextStartFileName) {
        currentFiles = await BackblazeService.listFiles(pageSize, nextStartFileName);
        nextStartFileName = currentFiles.nextFileName;
        currentPage++;
        console.log(`[API] Navegando secuencialmente: página ${currentPage}/${page}`);
      }
      
      // Si llegamos a la página correcta, devolver los resultados
      if (currentPage === page) {
        console.log(`[API] Navegación secuencial exitosa: Llegamos a la página ${page}`);
        
        // Preparar respuesta
        const response: BucketInfo = {
          bucketName: 'pistas',
          totalFiles: 4415,
          filesList: currentFiles.files,
          nextToken: currentFiles.nextFileName
        };
        
        // Configurar headers CORS
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.header('Access-Control-Allow-Headers', 'Content-Type');
        
        console.log(`[API] Enviando ${currentFiles.files.length} archivos al cliente para la página ${page} (navegación secuencial).`);
        return res.json(response);
      } else {
        // Si no pudimos llegar a la página correcta, devolver error
        console.error(`[API] No se pudo navegar hasta la página ${page}. Llegamos solo hasta la página ${currentPage}`);
        return res.status(404).json({
          error: `No se pudo acceder a la página ${page}`,
          maxPageReached: currentPage
        });
      }
    }
    
    // Este código no se ejecutará nunca porque los bloques anteriores incluyen 'return'
    // Esto es sólo para mantener la compatibilidad con el código original
    console.error('[API] ADVERTENCIA: Llegaste a un punto del código que nunca debería ejecutarse');
    return res.status(500).json({
      error: "Error interno del servidor: flujo de código inesperado"
    });
  } catch (error: any) {
    console.error('Error obteniendo información del bucket:', error);
    res.status(500).json({ error: `Error: ${error.message}` });
  }
});

// Ruta para búsqueda
app.get('/api/search', async (req, res) => {
  try {
    const query = req.query.q as string || '';
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
    const results = await BackblazeService.searchFiles(query, 100);
    
    console.log(`[API] Búsqueda completa. Se encontraron ${results.length} resultados para "${query}"`);
    
    // Asegurarnos de que cada resultado tenga las propiedades que el frontend espera
    const formattedResults = results.map(file => {
      return {
        ...file,
        // Asegurar que siempre existan estas propiedades
        fileName: file.name || '',  // Usar name como fileName para compatibilidad con frontend
        title: file.title || BackblazeService.extractTitleFromFileName(file.name || ''),
        artist: file.artist || BackblazeService.extractArtistFromFileName(file.name || '') || 'Desconocido'
      };
    });
    
    // Enviar respuesta con formato consistente
    res.json({ 
      success: true, 
      results: formattedResults,
      query: query,
      count: formattedResults.length
    });
  } catch (error: any) {
    console.error('[API] Error en búsqueda:', error);
    res.status(500).json({ 
      success: false, 
      error: `Error de búsqueda: ${error.message}`,
      results: []  // Siempre incluir results aunque sea vacío
    });
  }
});

// Ruta para obtener URL firmada para reproducir audio
app.get('/api/audio/url', async (req, res) => {
  try {
    const key = req.query.key as string;
    console.log(`Solicitando URL firmada para clave: "${key}"`);
    
    if (!key) {
      return res.status(400).json({ error: 'Se requiere el parámetro key' });
    }
    
    // Obtener URL firmada de Backblaze B2 (válida por 1 hora)
    const signedUrl = await BackblazeService.getSignedUrl(key, 3600);
    
    console.log(`URL firmada generada para ${key}`);
    res.json({ url: signedUrl });
  } catch (error: any) {
    console.error('Error obteniendo URL firmada:', error);
    res.status(500).json({ error: `Error: ${error.message}` });
  }
});

// Endpoint para transmitir audio desde B2 (evitar problemas CORS)
app.get('/api/audio/stream', async (req, res) => {
  try {
    const fileId = req.query.fileId as string;
    const fileName = req.query.fileName as string;
    
    if (!fileId || !fileName) {
      return res.status(400).json({ error: 'Se requieren fileId y fileName' });
    }
    
    console.log(`Streaming de audio para fileId: ${fileId}, fileName: ${fileName}`);
    
    // Asegurar que estamos autenticados con B2
    await BackblazeService.authenticate();
    
    // Construir URL de descarga directa
    const downloadUrl = `${BackblazeService.getDownloadUrl()}/b2api/v1/b2_download_file_by_id?fileId=${encodeURIComponent(fileId)}`;
    
    try {
      // Realizar la solicitud a B2 con manejo de errores mejorado
      const axios = await import('axios');
      const response = await axios.default({
        method: 'get',
        url: downloadUrl,
        headers: { 
          'Authorization': BackblazeService.getAuthToken(),
          'Range': req.headers.range || '', // Incluir encabezado Range si está presente
          'Connection': 'keep-alive',  // Mantener conexión activa
          'Accept-Encoding': 'gzip, deflate, br'  // Soportar compresiones comunes
        },
        responseType: 'stream',
        // Configuración para responder mejor a conexiones inestables
        maxRedirects: 5,
        timeout: 60000, // 60 segundos timeout general
        timeoutErrorMessage: 'La conexión a Backblaze B2 ha tardado demasiado',
        decompress: true, // Soporte para respuestas comprimidas
        // Configuración de HTTP para mayor tolerancia a fallos
        httpAgent: new http.Agent({ 
          keepAlive: true, 
          maxSockets: 10,
          timeout: 60000
        }),
        httpsAgent: new https.Agent({ 
          keepAlive: true, 
          maxSockets: 10,
          timeout: 60000,
          rejectUnauthorized: true // Verificar certificados SSL
        }),
        // No seguir redirecciones si la URL está vacía
        validateStatus: function (status) {
          return (status >= 200 && status < 300) || status === 302 || status === 206;
        }
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
      
      stream.on('error', (err: Error) => {
        // Si el error es ECONNRESET (conexión cerrada por el cliente), lo tratamos como evento normal
        // Esto sucede cuando el usuario cambia de pestaña o minimiza el navegador
        if (err.message && (err.message.includes('ECONNRESET') || 
            err.message.includes('aborted') || 
            (err as any).code === 'ECONNRESET')) {
          console.log(`Streaming interrumpido para ${fileName}: El cliente cerró la conexión (evento normal)`);
        } else {
          // Solo registramos otros errores como problemas reales
          console.error(`Error en streaming para ${fileName}:`, err);
        }
        
        // Intentamos limpiar recursos en cualquier caso
        try {
          stream.unpipe(res);
          if (!res.headersSent) {
            res.status(499).end(); // Código 499 = Cliente cerró la conexión
          }
        } catch (cleanupErr) {
          // Ignoramos errores en la limpieza
        }
      });
      
      // Manejar eventos de cierre de la conexión
      req.on('close', () => {
        console.log(`Cliente cerró conexión para ${fileName}`);
        stream.destroy(); // Liberar recursos
      });
      
      // Manejar errores de forma más tolerante para evitar problemas al cambiar de pestaña
      res.on('error', (err: Error) => {
        // No mostrar error para ECONNRESET ya que es un comportamiento normal
        // cuando la pestaña se minimiza o el usuario cambia de página
        if (err.message.includes('ECONNRESET')) {
          console.log(`Conexión cerrada para ${fileName}: El usuario cambió de contexto (normal)`);
        } else {
          console.error(`Error en la respuesta para ${fileName}:`, err);
        }
        
        // No hay necesidad de terminar la respuesta aquí, Node lo manejará automáticamente
      });
      
      // Transmitir datos al cliente
      stream.pipe(res);
    } catch (streamError: any) {
      console.error(`Error obteniendo stream para ${fileName}:`, streamError.message);
      res.status(500).json({ error: `Error obteniendo stream: ${streamError.message}` });
    }
  } catch (error: any) {
    console.error('Error transmitiendo audio:', error.message);
    res.status(500).json({ error: `Error transmitiendo audio: ${error.message}` });
  }
});

// Ruta para verificar el estado de la conexión con Backblaze
app.get('/api/b2-status', async (req, res) => {
  try {
    await BackblazeService.authenticate();
    res.json({ status: 'ok', message: 'Conectado a Backblaze B2' });
  } catch (error: any) {
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
  } else {
    console.log('🔑 Clave de aplicación B2 detectada, intentando conectar con Backblaze...');
    BackblazeService.authenticate()
      .then(() => console.log('✅ Conexión con Backblaze B2 establecida correctamente'))
      .catch(err => console.error('❌ Error conectando con Backblaze B2:', err.message));
  }
});
