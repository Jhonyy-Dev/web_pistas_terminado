// backblaze-connector.js
require('dotenv').config({ path: '../.env' });
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const fs = require('fs');
const path = require('path');

// Cargar credenciales desde el archivo .env
const B2_ACCESS_KEY = process.env.B2_ACCESS_KEY;
const B2_SECRET_KEY = process.env.B2_SECRET_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;
const B2_ENDPOINT = process.env.B2_ENDPOINT;
const B2_REGION = process.env.B2_REGION;

// Mostrar información de diagnóstico (sin revelar la clave secreta completa)
console.log('Información de configuración Backblaze B2:');
console.log(`- Bucket: ${B2_BUCKET_NAME || 'No definido'}`);
console.log(`- Endpoint: ${B2_ENDPOINT || 'No definido'}`);
console.log(`- Region: ${B2_REGION || 'No definido'}`);

// Verificar si la access key parece completa (debería tener al menos 20 caracteres)
if (B2_ACCESS_KEY && B2_ACCESS_KEY.length < 20) {
  console.warn('⚠️ ADVERTENCIA: La clave de acceso (B2_ACCESS_KEY) parece estar incompleta. Debería tener al menos 20 caracteres.');
}

// Verificar si la secret key parece completa (debería tener al menos 30 caracteres)
if (B2_SECRET_KEY && B2_SECRET_KEY.length < 30) {
  console.warn('⚠️ ADVERTENCIA: La clave secreta (B2_SECRET_KEY) parece estar incompleta. Debería tener al menos 30 caracteres.');
}

if (!B2_ACCESS_KEY || !B2_SECRET_KEY || !B2_BUCKET_NAME || !B2_ENDPOINT) {
  console.error('Error: Faltan credenciales o configuración de Backblaze B2 en el archivo .env');
  console.error('Asegúrate de que tu archivo .env tenga todas estas variables:');
  console.error('B2_ACCESS_KEY, B2_SECRET_KEY, B2_BUCKET_NAME, B2_ENDPOINT, B2_REGION');
  // No salimos del proceso para permitir que el servidor funcione con datos mock
  console.warn('Continuando con datos mock debido a la configuración incompleta de Backblaze');
}

// Crear cliente S3 para Backblaze B2 solo si las credenciales están presentes
let s3Client;

try {
  if (B2_ACCESS_KEY && B2_SECRET_KEY && B2_ENDPOINT) {
    // Configuración especial para Backblaze B2
    s3Client = new S3Client({
      endpoint: B2_ENDPOINT,
      region: B2_REGION || 'us-west-005',
      credentials: {
        accessKeyId: B2_ACCESS_KEY,
        secretAccessKey: B2_SECRET_KEY
      },
      // Importante: ForcePathStyle es necesario para Backblaze B2
      forcePathStyle: true,
      // Añadir más capacidad de diagnóstico con retries
      maxAttempts: 3
    });
    console.log('Cliente S3 para Backblaze B2 inicializado correctamente');
    console.log(`Endpoint configurado: ${B2_ENDPOINT}`);
  } else {
    console.warn('No se pudo inicializar el cliente S3 debido a credenciales faltantes');
  }
} catch (error) {
  console.error('Error al inicializar el cliente S3:', error);
}

// Función para listar todos los objetos en el bucket con paginación
async function listAllObjects() {
  // Verificar si el cliente S3 fue inicializado
  if (!s3Client) {
    console.warn('No se puede listar objetos: cliente S3 no inicializado');
    return [];
  }

  try {
    console.log(`Intentando listar objetos del bucket: ${B2_BUCKET_NAME}`);
    console.log(`Configuración de conexión: endpoint=${B2_ENDPOINT}, region=${B2_REGION}, bucket=${B2_BUCKET_NAME}`);
    
    // Arreglo para almacenar todos los objetos
    const allObjects = [];
    // Token de continuación para la paginación
    let continuationToken = undefined;
    // Contador de páginas para seguimiento
    let pageCount = 0;
    
    // Bucle para manejar la paginación
    do {
      pageCount++;
      console.log(`Obteniendo página ${pageCount} de objetos...${continuationToken ? ' (con token)' : ''}`);
      
      const command = new ListObjectsV2Command({
        Bucket: B2_BUCKET_NAME,
        MaxKeys: 1000,  // Máximo número de objetos por página
        ContinuationToken: continuationToken
      });
      
      const response = await s3Client.send(command);
      
      if (response.Contents && response.Contents.length > 0) {
        console.log(`Página ${pageCount}: Se encontraron ${response.Contents.length} objetos`);
        
        // Mapear los objetos de esta página
        const mappedPageObjects = response.Contents.map(item => {
          // Extraer el nombre del archivo sin la ruta
          const filename = item.Key.split('/').pop();
          
          // Extraer información del nombre del archivo
          // Formato esperado: "Artista - Título.mp3"
          let artist = { id: 1, name: 'Desconocido', profileImage: 'https://via.placeholder.com/300' };
          let title = filename.replace('.mp3', '');
          
          // Intentar dividir por el separador " - "
          if (filename.includes(' - ')) {
            const parts = filename.split(' - ');
            artist.name = parts[0].trim();
            title = parts[1].replace('.mp3', '').trim();
          }
          
          return {
            key: item.Key,
            filename,
            title,
            artist,
            lastModified: item.LastModified,
            size: item.Size,
            etag: item.ETag
          };
        });
        
        // Añadir los objetos de esta página al arreglo total
        allObjects.push(...mappedPageObjects);
      } else {
        console.log(`Página ${pageCount}: No se encontraron objetos`);
      }
      
      // Actualizar el token de continuación para la siguiente página
      continuationToken = response.NextContinuationToken;
      
    } while (continuationToken);
    
    console.log(`Completado: Se encontraron ${allObjects.length} objetos en total en ${pageCount} páginas`);
    
    if (allObjects.length === 0) {
      console.log('El bucket está vacío o no se encontraron objetos');
      return [];
    }
    
    return allObjects;
  } catch (error) {
    console.error('Error al listar objetos de Backblaze B2:', error);
    return [];
  }
}

// Función para generar URL firmada (con tiempo limitado)
async function getSignedUrlForObject(key) {
  // Verificar si el cliente S3 fue inicializado
  if (!s3Client) {
    console.warn('No se puede generar URL firmada: cliente S3 no inicializado');
    return null;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: B2_BUCKET_NAME,
      Key: key
    });
    
    // Generar URL firmada válida por 1 hora (3600 segundos)
    console.log(`Generando URL firmada para el archivo: ${key}`);
    const url = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return url;
  } catch (error) {
    console.error(`Error al generar URL firmada para ${key}:`, error);
    return null;
  }
}

// Exportar funciones para usar en server.js
module.exports = {
  listAllObjects,
  getSignedUrlForObject
};
