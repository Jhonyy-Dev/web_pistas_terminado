/**
 * Script para escanear todos los archivos en Backblaze B2,
 * analizar sus nombres y ayudar a diagnosticar problemas de búsqueda
 * 
 * Uso:
 * node scan-backblaze.js [comando] [parámetros]
 * 
 * Comandos:
 * - scan: Escanea todos los archivos en el bucket
 * - search <término>: Busca archivos que contengan el término
 * - compare <término>: Compara resultados del algoritmo de búsqueda actual vs más permisivo
 * - dump: Guarda todos los nombres de archivos en un archivo JSON
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const readline = require('readline');

// Cargar variables de entorno desde el archivo apps/api/.env
dotenv.config({ path: path.join(__dirname, '../apps/api/.env') });

// Log para verificar si las variables se cargaron correctamente
console.log('Verificando variables de entorno...');
console.log('B2_APPLICATION_KEY existe:', !!process.env.B2_APPLICATION_KEY);
console.log('B2_BUCKET_ID existe:', !!process.env.B2_BUCKET_ID);
console.log('B2_BUCKET_NAME existe:', !!process.env.B2_BUCKET_NAME);

// Configuración
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY || '';
const B2_BUCKET_ID = process.env.B2_BUCKET_ID || '';
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME || '';
const OUTPUT_DIR = path.join(__dirname, '../data');

// Asegurar que el directorio de salida exista
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Variables para almacenar datos de autenticación
let authToken = null;
let apiUrl = null;
let downloadUrl = null;

/**
 * Autenticar con Backblaze B2
 */
async function authenticate() {
  try {
    console.log('Autenticando con Backblaze B2...');
    
    // Parse application key
    const firstUnderscore = B2_APPLICATION_KEY.indexOf('_');
    if (firstUnderscore === -1) {
      throw new Error('Formato de B2_APPLICATION_KEY inválido. Debería ser en formato ID_SECRET');
    }
    
    const keyId = B2_APPLICATION_KEY.substring(0, firstUnderscore);
    const keySecret = B2_APPLICATION_KEY.substring(firstUnderscore + 1);
    
    // Basic auth credentials
    const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
    
    const response = await axios({
      method: 'GET',
      url: 'https://api.backblazeb2.com/b2api/v2/b2_authorize_account',
      headers: {
        'Authorization': `Basic ${credentials}`
      }
    });
    
    const { data } = response;
    
    // Guardar datos de autenticación
    authToken = data.authorizationToken;
    apiUrl = data.apiUrl;
    downloadUrl = data.downloadUrl;
    
    console.log('Autenticación exitosa.');
    return data;
  } catch (error) {
    console.error('Error al autenticar:', error.response?.data || error.message);
    throw new Error('Error en autenticación de Backblaze B2');
  }
}

/**
 * Listar todos los archivos en el bucket
 * @param {number} maxFiles Número máximo de archivos a listar
 */
async function listAllFiles(maxFiles = 10000) {
  try {
    if (!authToken) await authenticate();
    
    console.log(`Listando hasta ${maxFiles} archivos en bucket ${B2_BUCKET_ID}...`);
    
    const files = [];
    let startFileName = null;
    
    // Paginar resultados hasta obtener todos los archivos o alcanzar maxFiles
    while (files.length < maxFiles) {
      const response = await axios({
        method: 'POST',
        url: `${apiUrl}/b2api/v2/b2_list_file_names`,
        headers: {
          'Authorization': authToken
        },
        data: {
          bucketId: B2_BUCKET_ID,
          startFileName: startFileName,
          maxFileCount: 1000
        }
      });
      
      const { data } = response;
      files.push(...data.files);
      
      console.log(`Obtenidos ${files.length} archivos hasta ahora...`);
      
      // Si ya no hay más archivos, salir del bucle
      if (!data.nextFileName || data.files.length === 0) break;
      startFileName = data.nextFileName;
    }
    
    console.log(`Total de archivos encontrados: ${files.length}`);
    return files;
  } catch (error) {
    console.error('Error al listar archivos:', error.response?.data || error.message);
    
    // Si el error es de token expirado, reautenticar y reintentar
    if (error.response?.status === 401) {
      console.log('Token expirado, reautenticando...');
      authToken = null;
      await authenticate();
      return listAllFiles(maxFiles);
    }
    
    throw new Error('Error al listar archivos de Backblaze B2');
  }
}

/**
 * Normalizar texto para búsqueda
 * @param {string} text Texto a normalizar
 */
function normalizeText(text) {
  if (!text) return '';
  return text.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar acentos
    .replace(/[^a-z0-9\s\-]/g, ' ') // Reemplazar símbolos con espacios EXCEPTO los guiones
    .replace(/\s+/g, ' ')         // Reducir múltiples espacios a uno
    .trim();
}

/**
 * Verificar si un texto contiene una consulta
 * @param {string} text Texto donde buscar
 * @param {string} query Consulta a buscar
 */
function containsText(text, query) {
  if (!text || !query) return false;
  
  // Verificar coincidencia exacta primero
  if (text.includes(query)) {
    return true;
  }
  
  // Verificar si está contenido dentro de palabras más grandes
  const words = text.split(' ');
  return words.some(word => word.includes(query));
}

/**
 * Algoritmo de búsqueda actual como está en backblazeService.ts
 * @param {Array} files Lista de archivos
 * @param {string} query Término de búsqueda
 */
function searchCurrentAlgorithm(files, query) {
  console.log(`[Algoritmo Actual] Buscando "${query}" en ${files.length} archivos...`);
  
  const normalizedQuery = query.toLowerCase().trim();
  const fullyNormalizedQuery = normalizeText(normalizedQuery);
  const queryWords = fullyNormalizedQuery.split(' ').filter(word => word.length > 1);
  
  console.log(`[Algoritmo Actual] Término normalizado: "${fullyNormalizedQuery}"`);
  console.log(`[Algoritmo Actual] Palabras clave:`, queryWords);
  
  // Filtrar archivos con el algoritmo actual
  const matchingFiles = files.filter(file => {
    const fileName = file.fileName || '';
    const normalizedFileName = normalizeText(fileName);
    
    // Crear texto para buscar (solo nombre de archivo)
    const searchableText = normalizedFileName.toLowerCase();
    
    // 1. Coincidencia exacta de frase completa (prioridad máxima)
    if (containsText(searchableText, fullyNormalizedQuery)) {
      return true;  // Coincidencia exacta = retornar inmediatamente
    }
    
    // 2. Coincidencia con la frase completa (prioridad alta)
    if (containsText(normalizedFileName, fullyNormalizedQuery)) {
      return true;  // Coincidencia en nombre de archivo = retornar inmediatamente
    }
    
    // 3. Todas las palabras individuales en orden (prioridad media)
    if (queryWords.length > 1) {
      let lastIndex = -1;
      let inOrder = true;
      
      for (const word of queryWords) {
        const currentIndex = searchableText.indexOf(word, lastIndex + 1);
        if (currentIndex <= lastIndex) {
          inOrder = false;
          break;
        }
        lastIndex = currentIndex;
      }
      
      if (inOrder) {
        return true;
      }
    }
    
    // 4. Todas las palabras individuales presentes (prioridad baja)
    const allWordsPresent = queryWords.every(word => containsText(searchableText, word));
    if (allWordsPresent) {
      return true;
    }
    
    return false;
  });
  
  return matchingFiles;
}

/**
 * Algoritmo de búsqueda más permisivo (como el bot de WhatsApp)
 * @param {Array} files Lista de archivos
 * @param {string} query Término de búsqueda
 */
function searchPermissiveAlgorithm(files, query) {
  console.log(`[Algoritmo Permisivo] Buscando "${query}" en ${files.length} archivos...`);
  
  const normalizedQuery = query.toLowerCase().trim();
  const fullyNormalizedQuery = normalizeText(normalizedQuery);
  const queryWords = fullyNormalizedQuery.split(' ').filter(word => word.length > 1);
  
  console.log(`[Algoritmo Permisivo] Término normalizado: "${fullyNormalizedQuery}"`);
  
  // Filtrar archivos con un algoritmo más permisivo
  const matchingFiles = files.filter(file => {
    const fileName = file.fileName || '';
    const normalizedFileName = normalizeText(fileName);
    
    // Buscar coincidencias parciales (cualquier palabra del query en el nombre)
    return queryWords.some(word => normalizedFileName.includes(word));
  });
  
  return matchingFiles;
}

/**
 * Comparar resultados de algoritmos de búsqueda
 * @param {Array} files Lista de archivos
 * @param {string} query Término de búsqueda
 */
function compareSearchAlgorithms(files, query) {
  console.log(`\n===== COMPARANDO ALGORITMOS DE BÚSQUEDA PARA "${query}" =====\n`);
  
  // Buscar con algoritmo actual
  const currentResults = searchCurrentAlgorithm(files, query);
  console.log(`\n[Algoritmo Actual] Encontrados ${currentResults.length} archivos.`);
  
  // Buscar con algoritmo permisivo
  const permissiveResults = searchPermissiveAlgorithm(files, query);
  console.log(`[Algoritmo Permisivo] Encontrados ${permissiveResults.length} archivos.`);
  
  // Encontrar archivos que solo aparecen en los resultados permisivos
  const onlyInPermissive = permissiveResults.filter(
    file => !currentResults.some(f => f.fileName === file.fileName)
  );
  
  console.log(`\n===== ARCHIVOS ENCONTRADOS SOLO POR ALGORITMO PERMISIVO (${onlyInPermissive.length}) =====`);
  onlyInPermissive.forEach((file, index) => {
    console.log(`${index + 1}. ${file.fileName}`);
  });
  
  return {
    query,
    currentResults,
    permissiveResults,
    onlyInPermissive
  };
}

/**
 * Guardar resultados en un archivo
 * @param {Object} data Datos a guardar
 * @param {string} filename Nombre del archivo
 */
function saveResults(data, filename) {
  const filePath = path.join(OUTPUT_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`\nResultados guardados en: ${filePath}`);
}

/**
 * Mostrar interfaz para buscar un término
 */
async function interactiveSearch() {
  const files = await listAllFiles();
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  console.log('\n===== BÚSQUEDA INTERACTIVA =====');
  console.log('Ingrese términos de búsqueda o "salir" para terminar.\n');
  
  const promptUser = () => {
    rl.question('Término de búsqueda > ', async (query) => {
      if (query.toLowerCase() === 'salir') {
        rl.close();
        return;
      }
      
      const results = compareSearchAlgorithms(files, query);
      saveResults(results, `search-${query.replace(/\s+/g, '-')}-${Date.now()}.json`);
      
      promptUser();
    });
  };
  
  promptUser();
}

/**
 * Función principal
 */
async function main() {
  const [,, command, ...args] = process.argv;
  
  try {
    // Autenticar primero
    await authenticate();
    
    switch (command) {
      case 'scan':
        const files = await listAllFiles();
        saveResults(files, `all-files-${Date.now()}.json`);
        console.log(`Total archivos escaneados: ${files.length}`);
        break;
        
      case 'search':
        if (args.length === 0) {
          console.error('Error: Debe proporcionar un término de búsqueda');
          process.exit(1);
        }
        const searchQuery = args.join(' ');
        const allFiles = await listAllFiles();
        
        // Usar algoritmo permisivo para buscar
        const searchResults = searchPermissiveAlgorithm(allFiles, searchQuery);
        console.log(`\n===== RESULTADOS DE BÚSQUEDA PARA "${searchQuery}" =====`);
        console.log(`Encontrados ${searchResults.length} archivos.`);
        
        // Mostrar primeros 20 resultados
        searchResults.slice(0, 20).forEach((file, index) => {
          console.log(`${index + 1}. ${file.fileName}`);
        });
        
        if (searchResults.length > 20) {
          console.log(`... y ${searchResults.length - 20} archivos más.`);
        }
        
        // Guardar todos los resultados
        saveResults(searchResults, `search-results-${searchQuery.replace(/\s+/g, '-')}-${Date.now()}.json`);
        break;
        
      case 'compare':
        if (args.length === 0) {
          console.error('Error: Debe proporcionar un término de búsqueda para comparar');
          process.exit(1);
        }
        const compareQuery = args.join(' ');
        const filesForCompare = await listAllFiles();
        compareSearchAlgorithms(filesForCompare, compareQuery);
        break;
        
      case 'dump':
        const allFilesForDump = await listAllFiles();
        
        // Extraer solo los nombres de archivo
        const fileNames = allFilesForDump.map(file => file.fileName);
        saveResults(fileNames, `file-names-dump-${Date.now()}.json`);
        console.log(`Guardados ${fileNames.length} nombres de archivo.`);
        break;
        
      case 'interactive':
      default:
        await interactiveSearch();
        break;
    }
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
