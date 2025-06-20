const express = require('express');
const cors = require('cors');
const path = require('path');
const app = express();
const PORT = 3001;

// Importar el conector de Backblaze B2
const { listAllObjects, getSignedUrlForObject } = require('./backblaze-connector');

// Cache para evitar solicitudes excesivas al API
let objectsCache = null;
let cacheTimestamp = 0;
let isFetchingObjects = false; // Flag para evitar solicitudes paralelas
const CACHE_TTL = 30 * 60 * 1000; // 30 minutos en milisegundos

// Función para listar objetos con cache
async function getCachedObjects() {
  const now = Date.now();
  
  // Si ya hay una solicitud en progreso, esperar a que termine
  if (isFetchingObjects) {
    console.log('Ya hay una solicitud en progreso, esperando...');
    // Esperar hasta que termine la solicitud actual
    while (isFetchingObjects) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    // Cuando termine, usar el cache actualizado
    return objectsCache;
  }
  
  // Si el cache es válido, usarlo
  if (objectsCache && now - cacheTimestamp < CACHE_TTL) {
    console.log('Usando cache de objetos - Edad:', Math.round((now - cacheTimestamp)/1000), 'segundos');
    return objectsCache;
  }
  
  try {
    console.log('Cache expirado o inexistente, obteniendo objetos frescos del bucket');
    isFetchingObjects = true; // Marcar que estamos obteniendo objetos
    
    objectsCache = await listAllObjects();
    cacheTimestamp = now;
    
    console.log(`Cache actualizado con ${objectsCache.length} objetos`);
    return objectsCache;
  } catch (error) {
    console.error('Error al obtener objetos del bucket:', error);
    // Si hay un error y tenemos cache antiguo, usarlo de todos modos
    if (objectsCache) {
      console.log('Usando cache antiguo debido a un error');
      return objectsCache;
    }
    throw error;
  } finally {
    isFetchingObjects = false; // Marcar que terminamos la solicitud
  }
}

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Datos de ejemplo para la aplicación
const songs = [
  {
    id: 1,
    title: "Chicha Mix Vol. 1",
    artist: { id: 1, name: "Los Shapis", profileImage: "https://example.com/shapis.jpg" },
    album: { id: 1, name: "Lo Mejor de la Chicha", coverImage: "https://example.com/chicha-album.jpg" },
    duration: 180,
    audioUrl: "https://example.com/audio/chicha-mix-1.mp3",
    genre: { id: 1, name: "Chicha" }
  },
  {
    id: 2,
    title: "Cumbia Peruana Clásica",
    artist: { id: 2, name: "Grupo 5", profileImage: "https://example.com/grupo5.jpg" },
    album: { id: 2, name: "Éxitos de Oro", coverImage: "https://example.com/cumbia-album.jpg" },
    duration: 210,
    audioUrl: "https://example.com/audio/cumbia-peruana.mp3",
    genre: { id: 1, name: "Cumbia" }
  },
  {
    id: 3,
    title: "Ritmo Tropical",
    artist: { id: 3, name: "Los Mirlos", profileImage: "https://example.com/mirlos.jpg" },
    album: { id: 3, name: "Sonidos de la Selva", coverImage: "https://example.com/tropical-album.jpg" },
    duration: 195,
    audioUrl: "https://example.com/audio/ritmo-tropical.mp3",
    genre: { id: 3, name: "Tropical" }
  },
  {
    id: 4,
    title: "Pista Base Cumbia",
    artist: { id: 4, name: "DJ Chivero", profileImage: "https://example.com/djchivero.jpg" },
    album: { id: 4, name: "Pistas Profesionales", coverImage: "https://example.com/pistas-album.jpg" },
    duration: 240,
    audioUrl: "https://example.com/audio/pista-base-cumbia.mp3",
    genre: { id: 2, name: "Pista Base" }
  },
  {
    id: 5,
    title: "Huayno Instrumental",
    artist: { id: 5, name: "Maestros Andinos", profileImage: "https://example.com/maestros.jpg" },
    album: { id: 5, name: "Raíces Andinas", coverImage: "https://example.com/huayno-album.jpg" },
    duration: 165,
    audioUrl: "https://example.com/audio/huayno-instrumental.mp3",
    genre: { id: 4, name: "Huayno" }
  }
];

const artists = [
  { id: 1, name: "Los Shapis", profileImage: "https://example.com/shapis.jpg", genres: ["Chicha"] },
  { id: 2, name: "Grupo 5", profileImage: "https://example.com/grupo5.jpg", genres: ["Cumbia"] },
  { id: 3, name: "Los Mirlos", profileImage: "https://example.com/mirlos.jpg", genres: ["Tropical"] },
  { id: 4, name: "DJ Chivero", profileImage: "https://example.com/djchivero.jpg", genres: ["Pista Base"] },
  { id: 5, name: "Maestros Andinos", profileImage: "https://example.com/maestros.jpg", genres: ["Huayno"] }
];

const genres = [
  { id: 1, name: "Chicha" },
  { id: 2, name: "Cumbia" },
  { id: 3, name: "Tropical" },
  { id: 4, name: "Huayno" },
  { id: 5, name: "Pista Base" }
];

const playlists = [
  { 
    id: 1, 
    name: "Mi Colección Chicha", 
    userId: 1, 
    songs: [1, 2],
    coverImage: "https://example.com/playlist1.jpg"
  },
  { 
    id: 2, 
    name: "Para el Estudio", 
    userId: 1, 
    songs: [3, 4, 5],
    coverImage: "https://example.com/playlist2.jpg"
  }
];

const users = [
  { id: 1, name: "Usuario Demo", email: "demo@example.com", password: "password123" }
];

// Rutas para canciones usando Backblaze B2
app.get('/api/songs', async (req, res) => {
  try {
    // Obtener canciones desde caché o Backblaze
    const backblazeObjects = await getCachedObjects();
    
    // Si no hay canciones en Backblaze, usar datos de ejemplo
    if (backblazeObjects.length === 0) {
      console.log('No se encontraron archivos en Backblaze B2, usando datos de ejemplo');
      return res.json(songs);
    }
    
    // Generar URL firmadas para cada canción
    const songsWithUrls = await Promise.all(backblazeObjects.map(async (item, index) => {
      const audioUrl = await getSignedUrlForObject(item.key);
      
      return {
        id: index + 1,
        title: item.title,
        artist: item.artist,
        album: { 
          id: 1, 
          name: 'Pistas Chiveros', 
          coverImage: 'https://via.placeholder.com/300' 
        },
        duration: 240,  // Duración predeterminada en segundos
        audioUrl: audioUrl,
        filename: item.filename,
        genre: { id: 1, name: 'Chicha/Cumbia' }
      };
    }));
    
    res.json(songsWithUrls);
  } catch (error) {
    console.error('Error al obtener canciones de Backblaze:', error);
    res.status(500).json({ error: 'Error al obtener canciones' });
  }
});

app.get('/api/songs/:id', async (req, res) => {
  try {
    const idParam = req.params.id;
    
    // Manejar IDs especiales como "trending" o "featured"
    if (idParam === 'trending' || idParam === 'featured') {
      // Para IDs especiales, devolver una canción aleatoria del conjunto
      const allSongs = await getCachedObjects();
      if (allSongs.length === 0) {
        // Si no hay canciones disponibles, usar datos de ejemplo
        const exampleSong = songs[0];
        return res.json(exampleSong);
      }
      
      // Seleccionar una canción aleatoria
      const randomIndex = Math.floor(Math.random() * allSongs.length);
      const selectedSong = allSongs[randomIndex];
      
      try {
        const audioUrl = await getSignedUrlForObject(selectedSong.key);
        
        const song = {
          id: randomIndex + 1,  // Usar índice+1 como ID
          title: selectedSong.title,
          artist: selectedSong.artist,
          album: { id: 1, name: 'Pistas Chiveros', coverImage: 'https://via.placeholder.com/300' },
          duration: 240,
          audioUrl: audioUrl,
          filename: selectedSong.filename,
          genre: { id: 1, name: 'Chicha/Cumbia' },
          isTrending: idParam === 'trending',
          isFeatured: idParam === 'featured'
        };
        
        return res.json(song);
      } catch (innerError) {
        console.error(`Error al procesar canción especial ${idParam}:`, innerError);
        return res.status(500).json({ error: `Error al obtener canción ${idParam}` });
      }
    }
    
    // Procesar IDs numéricos normalmente
    const id = parseInt(idParam);
    
    // Primero intentar obtener todas las canciones desde caché
    const allSongs = await getCachedObjects();
    
    if (allSongs.length === 0) {
      // Si no hay canciones en Backblaze, usar datos de ejemplo
      const song = songs.find(s => s.id === id);
      if (!song) return res.status(404).json({ error: 'Canción no encontrada' });
      return res.json(song);
    }
    
    // Verificar si el ID solicitado es válido
    if (isNaN(id) || id <= 0 || id > allSongs.length) {
      return res.status(404).json({ error: 'Canción no encontrada' });
    }
    
    const selectedSong = allSongs[id - 1];
    
    // Verificar que selectedSong exista y tenga una propiedad key
    if (!selectedSong || !selectedSong.key) {
      return res.status(404).json({ error: 'Información de canción incompleta' });
    }
    
    const audioUrl = await getSignedUrlForObject(selectedSong.key);
    
    const song = {
      id: id,
      title: selectedSong.title,
      artist: selectedSong.artist,
      album: { 
        id: 1, 
        name: 'Pistas Chiveros', 
        coverImage: 'https://via.placeholder.com/300' 
      },
      duration: 240,
      audioUrl: audioUrl,
      filename: selectedSong.filename,
      genre: { id: 1, name: 'Chicha/Cumbia' }
    };
    
    res.json(song);
  } catch (error) {
    console.error(`Error al obtener canción con ID ${req.params.id}:`, error);
    res.status(500).json({ error: 'Error al obtener la canción' });
  }
});

// Ruta para buscar canciones, artistas o géneros
app.get('/api/search', async (req, res) => {
  console.log(`Solicitud a /api/search - Query: "${req.query.q}"`);
  const query = req.query.q ? req.query.q.toLowerCase() : '';
  
  if (!query) {
    return res.json({ songs: [], artists: [], genres: [] });
  }
  
  try {
    // Obtener canciones de Backblaze
    const backblazeObjects = await getCachedObjects();
    
    let searchableSongs = songs; // Default a datos de ejemplo
    
    if (backblazeObjects.length > 0) {
      // Usar objetos de Backblaze si están disponibles
      searchableSongs = await Promise.all(backblazeObjects.map(async (item, index) => {
        const audioUrl = await getSignedUrlForObject(item.key);
        
        return {
          id: index + 1,
          title: item.title,
          artist: item.artist,
          album: { 
            id: 1, 
            name: 'Pistas Chiveros', 
            coverImage: 'https://via.placeholder.com/300' 
          },
          duration: 240,
          audioUrl: audioUrl,
          filename: item.filename,
          genre: { id: 1, name: 'Chicha/Cumbia' }
        };
      }));
    }
    
    // Filtrar canciones por búsqueda
    const filteredSongs = searchableSongs.filter(song => 
      song.title.toLowerCase().includes(query) || 
      song.artist.name.toLowerCase().includes(query) ||
      (song.filename && song.filename.toLowerCase().includes(query))
    );
    
    // Extraer artistas únicos de las canciones filtradas
    const uniqueArtists = {};
    filteredSongs.forEach(song => {
      if (song.artist && song.artist.name) {
        uniqueArtists[song.artist.name] = {
          id: Object.keys(uniqueArtists).length + 1,
          name: song.artist.name,
          profileImage: song.artist.profileImage || 'https://via.placeholder.com/300',
          genres: ['Chicha/Cumbia']
        };
      }
    });
    
    const filteredArtists = Object.values(uniqueArtists);
    
    // Usar géneros del mock por ahora
    const filteredGenres = genres.filter(genre => 
      genre.name.toLowerCase().includes(query)
    );
    
    res.json({
      songs: filteredSongs,
      artists: filteredArtists,
      genres: filteredGenres
    });
  } catch (error) {
    console.error('Error en búsqueda:', error);
    res.status(500).json({ error: 'Error al realizar la búsqueda' });
  }
});

// Rutas para artistas
app.get('/api/artists', (req, res) => {
  res.json(artists);
});

app.get('/api/artists/:id', (req, res) => {
  const artist = artists.find(a => a.id === parseInt(req.params.id));
  if (!artist) return res.status(404).json({ error: 'Artista no encontrado' });
  
  const artistSongs = songs.filter(song => song.artist.id === artist.id);
  
  res.json({
    ...artist,
    songs: artistSongs
  });
});

// Rutas para géneros
app.get('/api/genres', (req, res) => {
  res.json(genres);
});

app.get('/api/genres/:id', (req, res) => {
  const genre = genres.find(g => g.id === parseInt(req.params.id));
  if (!genre) return res.status(404).json({ error: 'Género no encontrado' });
  
  const genreSongs = songs.filter(song => song.genre.id === genre.id);
  
  res.json({
    ...genre,
    songs: genreSongs
  });
});

// Rutas para playlists
app.get('/api/playlists', (req, res) => {
  // Normalmente se filtrarían por usuario autenticado
  res.json(playlists);
});

app.get('/api/playlists/:id', (req, res) => {
  const playlist = playlists.find(p => p.id === parseInt(req.params.id));
  if (!playlist) return res.status(404).json({ error: 'Playlist no encontrada' });
  
  const playlistSongs = songs.filter(song => playlist.songs.includes(song.id));
  
  res.json({
    ...playlist,
    songs: playlistSongs
  });
});

// Rutas de autenticación
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email && u.password === password);
  
  if (!user) {
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }
  
  // Aquí normalmente se generaría un JWT token
  res.json({
    accessToken: 'mock-jwt-token',
    refreshToken: 'mock-refresh-token',
    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
});

app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios' });
  }
  
  const existingUser = users.find(u => u.email === email);
  if (existingUser) {
    return res.status(400).json({ error: 'El correo ya está registrado' });
  }
  
  const newUser = {
    id: users.length + 1,
    name,
    email,
    password
  };
  
  users.push(newUser);
  
  res.status(201).json({
    message: 'Usuario registrado exitosamente',
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email
    }
  });
});

// Crear directorio para archivos públicos
const publicDir = path.join(__dirname, 'public');
if (!require('fs').existsSync(publicDir)) {
  require('fs').mkdirSync(publicDir, { recursive: true });
}

// Ruta para obtener información del bucket con paginación
app.get('/api/bucket-info', async (req, res) => {
  // Asegurar que solo se envie respuesta JSON en este endpoint
  res.setHeader('Content-Type', 'application/json');
  
  try {
    // Registrar la solicitud para depuración
    console.log(`Solicitud a /api/bucket-info - Query params:`, req.query);
    
    // Parámetros de paginación
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 20;
    const token = req.query.token;

    // Obtener todos los archivos desde el cache
    const allFiles = await getCachedObjects();
    
    // Calcular índices para la paginación
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, allFiles.length);
    
    // Obtener los archivos de la página actual
    const paginatedFiles = allFiles.slice(startIndex, endIndex);
    console.log(`Paginación: página ${page}, mostrando ${paginatedFiles.length} de ${allFiles.length} archivos`);
    
    // Generar token de continuación si hay más páginas
    const nextToken = endIndex < allFiles.length ? `page_${page + 1}` : undefined;
    
    // Mapear archivos al formato que espera el cliente
    const mappedFiles = paginatedFiles.map(file => {
      // Asegurar que todos los campos sean válidos
      const filename = file.filename || file.key.split('/').pop() || 'archivo_sin_nombre';
      const title = file.title || filename.replace(/\.(mp3|wav|ogg|m4a|mp4|flac)$/i, '') || 'Sin título';
      
      return {
        name: filename,
        key: file.key || '',
        size: file.size || 0,
        lastModified: file.lastModified || new Date().toISOString(),
        title: title,
        artist: file.artist || 'Desconocido'
      };
    });
    
    // Crear objeto de respuesta
    const responseObject = {
      bucketName: process.env.B2_BUCKET_NAME || 'pistas',
      totalFiles: allFiles.length,
      filesList: mappedFiles,
      nextToken: nextToken
    };
    
    try {
      // Verificar que la respuesta sea JSON válido
      const responseStr = JSON.stringify(responseObject);
      return res.status(200).send(responseStr);
    } catch (jsonError) {
      console.error('Error al convertir respuesta a JSON:', jsonError);
      // Si hay un error de serialización, enviar una respuesta de seguridad
      return res.status(200).json({ 
        bucketName: 'pistas', 
        totalFiles: allFiles.length,
        filesList: [],
        nextToken: null,
        error: 'Error de serialización JSON'
      });
    }
  } catch (error) {
    console.error('Error al obtener información del bucket:', error);
    res.status(500).json({ error: 'Error al obtener información del bucket' });
  }
});

// Ruta para obtener URL firmada de un archivo específico (para reproducción)
// IMPORTANTE: Esta ruta debe estar ANTES de la ruta '/api/songs/:id' para evitar conflictos
app.get('/api/audio/url', async (req, res) => {
  try {
    const key = req.query.key;
    
    if (!key) {
      return res.status(400).json({ error: 'Se requiere el parámetro "key" para identificar el archivo' });
    }
    
    // Buscar todos los objetos para encontrar la key completa
    const allFiles = await listAllObjects();
    
    // Buscar coincidencias (nombre exacto o que termine con el nombre del archivo)
    const file = allFiles.find(f => 
      f.key === key || 
      f.key.endsWith(`/${key}`) ||
      f.filename === key
    );
    
    if (!file) {
      return res.status(404).json({ error: 'Archivo no encontrado en el bucket' });
    }
    
    // Generar URL firmada para el archivo
    const signedUrl = await getSignedUrlForObject(file.key);
    
    if (!signedUrl) {
      return res.status(500).json({ error: 'No se pudo generar la URL firmada para el archivo' });
    }
    
    res.json({ 
      url: signedUrl,
      filename: file.filename,
      expiresIn: 3600 // 1 hora en segundos
    });
    
  } catch (error) {
    console.error('Error al generar URL firmada:', error);
    res.status(500).json({ error: 'Error al generar URL para el archivo' });
  }
});

app.listen(PORT, async () => {
  console.log(`API Server running on http://localhost:${PORT}`);
  console.log(`API routes available at http://localhost:${PORT}/api/songs`);
  console.log(`Search endpoint at http://localhost:${PORT}/api/search?q=your_query`);
  console.log(`Bucket info at http://localhost:${PORT}/api/bucket-info`);
  
  try {
    // Verificar conexión con Backblaze al iniciar
    const files = await listAllObjects();
    console.log(`Conexión a Backblaze B2 exitosa - ${files.length} archivos encontrados`);
  } catch (error) {
    console.error('Error al conectar con Backblaze B2:', error);
  }
});
