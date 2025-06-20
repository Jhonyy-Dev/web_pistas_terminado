"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BackblazeService = void 0;
const axios_1 = __importDefault(require("axios"));
const dotenv_1 = __importDefault(require("dotenv"));
// Cargar variables de entorno
dotenv_1.default.config();
/**
 * Servicio para interactuar con Backblaze B2
 */
class BackblazeService {
    // Parse the application key into ID and secret parts
    static parseApplicationKey() {
        if (!this.B2_APPLICATION_KEY) {
            throw new Error('B2_APPLICATION_KEY no está configurada. Por favor, configura esta variable de entorno.');
        }
        // Formato común es: KeyID_KeySecret
        // Por ejemplo: K005637a24248f210000000005_K005xCUBN5xBPRa74MmCCfsatfWx9ag
        // Obtenemos todo antes del primer guión bajo como el ID
        const firstUnderscore = this.B2_APPLICATION_KEY.indexOf('_');
        if (firstUnderscore === -1) {
            throw new Error('Formato de B2_APPLICATION_KEY inválido. Debería ser en formato ID_SECRET');
        }
        this.B2_APPLICATION_KEY_ID = this.B2_APPLICATION_KEY.substring(0, firstUnderscore);
        this.B2_APPLICATION_KEY_SECRET = this.B2_APPLICATION_KEY.substring(firstUnderscore + 1);
        console.log(`ID de clave de aplicación B2 configurada: ${this.B2_APPLICATION_KEY_ID}`);
        console.log(`Longitud del secreto: ${this.B2_APPLICATION_KEY_SECRET.length} caracteres`);
    }
    /**
     * Métodos getters para acceder a las propiedades desde fuera
     */
    static getApiUrl() {
        if (!this.apiUrl) {
            throw new Error('No se ha autenticado con Backblaze B2. Llame a authenticate() primero.');
        }
        return this.apiUrl;
    }
    static getDownloadUrl() {
        if (!this.downloadUrl) {
            throw new Error('No se ha autenticado con Backblaze B2. Llame a authenticate() primero.');
        }
        return this.downloadUrl;
    }
    static getAuthToken() {
        if (!this.authToken) {
            throw new Error('No se ha autenticado con Backblaze B2. Llame a authenticate() primero.');
        }
        return this.authToken;
    }
    /**
     * Autentica con la API de Backblaze B2
     */
    static async authenticate() {
        try {
            console.log('Autenticando con Backblaze B2...');
            // Parsear la clave de aplicación en sus componentes
            this.parseApplicationKey();
            const now = Date.now();
            // Si ya tenemos un token válido y no ha expirado (24 horas)
            if (this.authToken && this.apiUrl && now - this.tokenTimestamp < 23 * 60 * 60 * 1000) {
                return;
            }
            // Realizar la autenticación usando ID y secreto
            const authString = Buffer.from(`${this.B2_APPLICATION_KEY_ID}:${this.B2_APPLICATION_KEY_SECRET}`).toString('base64');
            console.log('Enviando solicitud de autenticación a Backblaze B2...');
            const response = await axios_1.default.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
                headers: {
                    'Authorization': `Basic ${authString}`
                }
            });
            // Guardar la información de autenticación
            this.authToken = response.data.authorizationToken;
            this.apiUrl = response.data.apiUrl;
            this.downloadUrl = response.data.downloadUrl;
            this.tokenTimestamp = now;
            console.log('Autenticación exitosa con Backblaze B2');
        }
        catch (error) {
            console.error('Error en autenticación con B2:', error.response?.data || error);
            let errorMsg = 'Error de autenticación desconocido';
            if (error.response?.status === 401) {
                errorMsg = 'Credenciales incorrectas. Verifica la clave de aplicación B2';
            }
            else if (error.response?.data?.message) {
                errorMsg = error.response.data.message;
            }
            else if (error.message) {
                errorMsg = error.message;
            }
            throw new Error(`Error de autenticación B2: ${errorMsg}`);
        }
    }
    /**
     * Obtiene una lista de archivos del bucket
     * @param maxFileCount Número máximo de archivos a obtener
     * @param startFileName Nombre de archivo para continuación (token)
     */
    static async listFiles(maxFileCount = 100, startFileName) {
        try {
            // Asegurar que estamos autenticados
            await this.authenticate();
            // Preparar la solicitud para listar archivos
            const response = await axios_1.default.post(`${this.apiUrl}/b2api/v2/b2_list_file_names`, {
                bucketId: this.B2_BUCKET_ID,
                maxFileCount,
                startFileName
            }, {
                headers: {
                    'Authorization': this.authToken
                }
            });
            const b2Response = response.data;
            // Convertir la información de los archivos a nuestro formato
            const files = b2Response.files.map(file => this.convertB2FileInfo(file));
            console.log(`Paginación: Obtenidos ${files.length} archivos. Marcador de página siguiente: "${b2Response.nextFileName || 'fin de la lista'}"`);
            return {
                files,
                nextFileName: b2Response.nextFileName
            };
        }
        catch (error) {
            console.error('Error listando archivos de B2:', error.response?.data || error);
            // Si el error es de token expirado, reautenticar y reintentar
            if (error.response?.status === 401) {
                this.authToken = null;
                await this.authenticate();
                return this.listFiles(maxFileCount, startFileName);
            }
            throw new Error(`Error listando archivos: ${error.message}`);
        }
    }
    /**
     * Obtiene una URL firmada para un archivo
     * @param fileKey Nombre del archivo
     * @param expirationSeconds Tiempo de expiración en segundos (por defecto 1 hora)
     * @returns URL firmada
     */
    static async getSignedUrl(fileKey, expirationSeconds = 3600) {
        try {
            console.log(`Solicitando URL firmada para archivo: "${fileKey}"`);
            await this.authenticate();
            const fileId = await this.getFileIdByName(fileKey);
            if (!fileId) {
                throw new Error(`Archivo no encontrado: ${fileKey}`);
            }
            // Obtener el host de la solicitud para crear una URL absoluta
            const host = process.env.API_URL || 'http://localhost:3001';
            // Construir URL absoluta para streaming a través de nuestro proxy
            const proxyUrl = `${host}/api/audio/stream?fileId=${encodeURIComponent(fileId)}&fileName=${encodeURIComponent(fileKey)}`;
            console.log(`URL de proxy absoluta generada: ${proxyUrl}`);
            return proxyUrl;
        }
        catch (error) {
            console.error('Error obteniendo URL firmada:', error.response?.data || error.message || error);
            // Si el error es de token expirado, reautenticar y reintentar
            if (error.response?.status === 401) {
                console.log('Token expirado, reautenticando...');
                this.authToken = null;
                await this.authenticate();
                return this.getSignedUrl(fileKey, expirationSeconds);
            }
            throw error;
        }
    }
    /**
     * Busca el ID de un archivo por su nombre
     */
    static async getFileIdByName(fileName) {
        try {
            console.log(`Buscando ID para archivo con nombre: "${fileName}"`);
            // Intentar primero un enfoque más específico con prefix
            const response = await axios_1.default.post(`${this.apiUrl}/b2api/v2/b2_list_file_names`, {
                bucketId: this.B2_BUCKET_ID,
                prefix: fileName,
                maxFileCount: 10 // Incrementar para encontrar posibles variaciones
            }, {
                headers: {
                    'Authorization': this.authToken
                }
            });
            const matchingFiles = response.data.files;
            console.log(`Archivos encontrados con prefix "${fileName}": ${matchingFiles.length}`);
            if (matchingFiles.length > 0) {
                // Imprimir los nombres de los archivos para depuración
                matchingFiles.forEach((file, index) => {
                    console.log(`  [${index}] ${file.fileName}`);
                });
            }
            // Buscar una coincidencia exacta
            const exactMatch = matchingFiles.find(file => file.fileName === fileName);
            if (exactMatch) {
                console.log(`Encontrada coincidencia exacta con ID: ${exactMatch.fileId}`);
                return exactMatch.fileId;
            }
            // Si no hay coincidencia exacta pero hay archivos con el prefijo, usar el primero
            if (matchingFiles.length > 0) {
                console.log(`No se encontró coincidencia exacta, usando la primera aproximada: ${matchingFiles[0].fileName}`);
                return matchingFiles[0].fileId;
            }
            console.log(`No se encontraron archivos con prefix "${fileName}"`);
            return null;
        }
        catch (error) {
            console.error('Error obteniendo ID de archivo:', error.response?.data || error);
            return null;
        }
    }
    /**
     * Busca archivos que coincidan con el término de búsqueda
     * @param query Término de búsqueda
     * @param maxResults Máximo número de resultados
     */
    static async searchFiles(query, maxResults = 50) {
        try {
            console.log(`[BackblazeService] Iniciando búsqueda para: "${query}"`);
            // Asegurar que estamos autenticados
            await this.authenticate();
            const normalizedQuery = query.toLowerCase().trim();
            // No podemos buscar directamente en B2, así que obtenemos una lista grande y filtramos
            const { files } = await this.listFiles(maxResults * 5);
            console.log(`[BackblazeService] Obtenidos ${files.length} archivos para filtrar`);
            console.log(`[BackblazeService] Buscando archivos que contengan: "${normalizedQuery}"`);
            // Función para normalizar texto (quitar acentos, convertir a minúsculas)
            const normalizeText = (text) => {
                return text.toLowerCase()
                    .normalize('NFD')
                    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
                    .replace(/[^a-z0-9\s]/g, ' ') // Reemplazar símbolos con espacios
                    .replace(/\s+/g, ' ') // Reducir múltiples espacios a uno
                    .trim();
            };
            // Normalizar la consulta de búsqueda
            const fullyNormalizedQuery = normalizeText(normalizedQuery);
            console.log(`[BackblazeService] Término de búsqueda normalizado: "${fullyNormalizedQuery}"`);
            // Dividir la consulta en palabras para búsqueda parcial
            const queryWords = fullyNormalizedQuery.split(' ').filter(word => word.length > 1);
            console.log(`[BackblazeService] Palabras clave para búsqueda:`, queryWords);
            // Filtrar archivos que coincidan con la búsqueda
            const matchingFiles = files.filter(file => {
                try {
                    // Siempre tenemos el nombre del archivo
                    const fileName = file.name || '';
                    const normalizedFileName = normalizeText(fileName);
                    // Extraemos título y artista del nombre si no existen como propiedades
                    let artist = '';
                    let title = '';
                    // Si el archivo ya tiene estas propiedades (del proceso de parsing previo)
                    if (file.artist) {
                        artist = typeof file.artist === 'string' ? normalizeText(file.artist) : '';
                    }
                    if (file.title) {
                        title = typeof file.title === 'string' ? normalizeText(file.title) : '';
                    }
                    // Si no tiene las propiedades, intentamos extraerlas del nombre
                    if (!artist || !title) {
                        // Posibles formatos: "Artista - Título" o "Título - Artista" o solo "Título"
                        // Usamos varios separadores posibles
                        const separators = [' - ', '-', '_', '–', '—'];
                        let parts = [];
                        for (const sep of separators) {
                            if (fileName.includes(sep)) {
                                parts = fileName.split(sep).map(p => p.trim());
                                if (parts.length >= 2)
                                    break;
                            }
                        }
                        if (parts.length >= 2) {
                            // Asumimos formato "Artista - Título" como más común
                            if (!artist)
                                artist = normalizeText(parts[0]);
                            if (!title)
                                title = normalizeText(parts[1]);
                        }
                        else {
                            // Si no hay separador, todo es título
                            if (!title)
                                title = normalizedFileName;
                        }
                    }
                    // Para debug, mostrar lo que estamos buscando en casos aleatorios
                    if (Math.random() < 0.01) { // Solo mostrar ~1% de los archivos para no saturar los logs
                        console.log(`[Debug] Archivo: "${fileName}" -> Título: "${title}", Artista: "${artist}"`);
                    }
                    // Comprobar si todas las palabras de la consulta están en algún campo
                    const searchableText = `${normalizedFileName} ${artist} ${title}`.toLowerCase();
                    // Si la búsqueda completa está contenida
                    if (searchableText.includes(fullyNormalizedQuery)) {
                        return true;
                    }
                    // O si todas las palabras individuales están contenidas
                    return queryWords.every(word => searchableText.includes(word));
                }
                catch (err) {
                    console.error(`[BackblazeService] Error al procesar archivo para búsqueda:`, err);
                    return false; // Si hay error al procesar el archivo, lo excluimos
                }
            });
            console.log(`[BackblazeService] Se encontraron ${matchingFiles.length} archivos que coinciden con "${query}"`);
            // Limitar la cantidad de resultados
            return matchingFiles.slice(0, maxResults);
        }
        catch (error) {
            console.error('[BackblazeService] Error en búsqueda de archivos:', error);
            // Si el error es de token expirado, reautenticar y reintentar
            if (error.response?.status === 401) {
                this.authToken = null;
                await this.authenticate();
                return this.searchFiles(query, maxResults);
            }
            throw new Error(`Error en búsqueda: ${error.message}`);
        }
    }
    /**
     * Convierte la información de un archivo B2 a nuestro formato
     * @param b2FileInfo Información del archivo desde la API de B2
     */
    static convertB2FileInfo(b2FileInfo) {
        // Extraer información de metadatos o del nombre del archivo
        const { fileName, contentLength, uploadTimestamp, fileId } = b2FileInfo;
        // Intentar extraer artista y título del nombre del archivo
        const fileNameWithoutExt = fileName.replace(/\.(mp3|wav|flac|m4a)$/i, '');
        let artist = 'Desconocido';
        let title = fileNameWithoutExt;
        // Patrones comunes: "Artista - Título" o "Artista_Título"
        const separators = [' - ', '_', ' – ', ' — '];
        for (const separator of separators) {
            if (fileNameWithoutExt.includes(separator)) {
                const parts = fileNameWithoutExt.split(separator);
                if (parts.length >= 2) {
                    artist = parts[0].trim();
                    title = parts.slice(1).join(separator).trim();
                    break;
                }
            }
        }
        // Usar info de metadatos si existe
        const metadata = b2FileInfo.fileInfo || {};
        if (metadata.artist)
            artist = metadata.artist;
        if (metadata.title)
            title = metadata.title;
        return {
            name: fileName,
            key: fileName,
            size: contentLength,
            lastModified: new Date(uploadTimestamp).toISOString(),
            title,
            artist,
            fileId
        };
    }
    /**
     * Extrae el título del nombre del archivo
     * @param fileName Nombre del archivo
     * @returns Título extraído o nombre del archivo si no se puede extraer
     */
    static extractTitleFromFileName(fileName) {
        try {
            // Eliminar extensión del archivo
            const nameWithoutExt = fileName.replace(/\.(mp3|wav|flac|m4a)$/i, '');
            // Patrones comunes: "Artista - Título" o "Artista_Título"
            const separators = [' - ', '_', ' – ', ' — ']; // incluye varios tipos de guiones
            for (const separator of separators) {
                if (nameWithoutExt.includes(separator)) {
                    const parts = nameWithoutExt.split(separator);
                    if (parts.length >= 2) {
                        // Título está después del separador
                        return parts.slice(1).join(separator).trim();
                    }
                }
            }
            // Si no se encuentra separador, todo el nombre es el título
            return nameWithoutExt;
        }
        catch (error) {
            console.error('[BackblazeService] Error al extraer título:', error);
            return fileName; // Devolver el nombre original como respaldo
        }
    }
    /**
     * Extrae el artista del nombre del archivo
     * @param fileName Nombre del archivo
     * @returns Artista extraído o 'Desconocido' si no se puede extraer
     */
    static extractArtistFromFileName(fileName) {
        try {
            // Eliminar extensión del archivo
            const nameWithoutExt = fileName.replace(/\.(mp3|wav|flac|m4a)$/i, '');
            // Patrones comunes: "Artista - Título" o "Artista_Título"
            const separators = [' - ', '_', ' – ', ' — ']; // incluye varios tipos de guiones
            for (const separator of separators) {
                if (nameWithoutExt.includes(separator)) {
                    const parts = nameWithoutExt.split(separator);
                    if (parts.length >= 2) {
                        // Artista está antes del separador
                        return parts[0].trim();
                    }
                }
            }
            // Si no se encuentra un separador, no podemos determinar el artista
            return 'Desconocido';
        }
        catch (error) {
            console.error('[BackblazeService] Error al extraer artista:', error);
            return 'Desconocido'; // Valor predeterminado en caso de error
        }
    }
}
exports.BackblazeService = BackblazeService;
// Configuración de Backblaze B2
BackblazeService.B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || '';
BackblazeService.B2_APPLICATION_KEY_ID = '';
BackblazeService.B2_APPLICATION_KEY_SECRET = '';
BackblazeService.B2_BUCKET_ID = process.env.B2_BUCKET_ID || '4a5b6c7d8e'; // ID del bucket, no el nombre
BackblazeService.B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || 'pistas'; // Nombre del bucket, usado para URLs alternativas
BackblazeService.authToken = null;
BackblazeService.apiUrl = null;
BackblazeService.downloadUrl = null;
BackblazeService.tokenTimestamp = 0;
