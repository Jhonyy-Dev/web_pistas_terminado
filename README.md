# Pistas Chiveros Perú - Reproductor de Audio B2

![Banner](apps/web/public/images/default-cover.jpg)

## 🎵 Descripción

Pistas Chiveros Perú es una aplicación web full-stack de streaming de audio que permite reproducir archivos de música almacenados en Backblaze B2. Construida con una arquitectura moderna de React + TypeScript en el frontend y Node.js/Express en el backend, esta aplicación proporciona una experiencia de usuario similar a Spotify para la reproducción de audio en tiempo real.

## 🏗️ Arquitectura

El proyecto sigue una arquitectura monorepo con una clara separación entre frontend y backend:

### Frontend (apps/web)
- Aplicación React + TypeScript + Vite
- Interfaz de usuario tipo Spotify
- Gestión de estado con Zustand
- Estilos con TailwindCSS

### Backend (apps/api)
- API REST con Node.js/Express
- Comunicación con Backblaze B2
- Streaming de audio optimizado
- Firma de URLs para acceso seguro

## ✨ Características Principales

- **Reproductor de audio completo** con controles para play/pause, volumen, siguiente/anterior
- **Listado de canciones** directamente desde Backblaze B2
- **Búsqueda integrada** para filtrar canciones
- **Paginación** de resultados para optimizar el rendimiento
- **Persistencia de preferencias** usando localStorage (volumen, shuffle, repeat)
- **Modo oscuro** adaptado para la experiencia musical
- **Soporte para MediaSession API** para controles desde el sistema operativo
- **Prevención de bloqueo de pantalla** con WakeLock API
- **Sistema de caché** para mejorar rendimiento y reducir costos de API

## 🚀 Requisitos

- Node.js 16+ y npm/yarn
- Cuenta de Backblaze B2 con bucket configurado
- Variables de entorno configuradas

## 📦 Instalación

```bash
# Clonar el repositorio
git clone https://github.com/Jhonyy-Dev/web_pistas_terminado.git
cd web_pistas_terminado

# Instalar dependencias
npm install

# Instalar dependencias del frontend
cd apps/web
npm install

# Instalar dependencias del backend
cd ../api
npm install
```

## ⚙️ Configuración

1. Crea un archivo `.env` en la raíz del proyecto basado en `.env.example`:

```
# Backblaze B2 Configuration
B2_APPLICATION_KEY_ID=tu_key_id
B2_APPLICATION_KEY=tu_application_key
B2_BUCKET_NAME=tu_bucket_name
B2_BUCKET_ID=tu_bucket_id

# API Configuration
API_PORT=3001
CORS_ORIGIN=http://localhost:5173

# Frontend Configuration
VITE_API_URL=http://localhost:3001
```

2. Configura tu bucket de Backblaze B2 con los permisos adecuados (lectura pública)

## 🖥️ Ejecución

Para desarrollo local:

```bash
# Terminal 1: Ejecutar el backend
cd apps/api
npm run dev

# Terminal 2: Ejecutar el frontend
cd apps/web
npm run dev
```

Para producción:

```bash
# Construir el frontend
cd apps/web
npm run build

# Iniciar el backend en producción
cd ../api
npm run build
npm start
```

## 📁 Estructura del Proyecto

```
web_pistas_terminado/
├── apps/
│   ├── api/              # Backend API
│   │   ├── src/          # Código fuente del backend
│   │   └── dist/         # Código compilado
│   ├── web/              # Frontend React
│   │   ├── public/       # Archivos estáticos
│   │   ├── src/          # Código fuente del frontend
│   │   │   ├── components/  # Componentes reutilizables
│   │   │   ├── pages/    # Páginas/rutas 
│   │   │   ├── store/    # Estado global (Zustand)
│   │   │   ├── services/ # Servicios y API
│   │   │   └── types/    # Definiciones de TypeScript
│   │   └── dist/         # Build compilado
│   └── mock-api/         # API de simulación para desarrollo
├── packages/             # Paquetes compartidos
├── data/                 # Datos de ejemplo
└── tools/                # Herramientas y scripts
```

## 🛠️ Tecnologías Utilizadas

- **Frontend**:
  - React 18
  - TypeScript
  - Zustand (gestión de estado)
  - TailwindCSS (estilos)
  - Vite (bundler)
  - Web APIs (MediaSession, WakeLock)
  - React Router

- **Backend**:
  - Node.js
  - Express
  - TypeScript
  - Backblaze B2 SDK
  - dotenv
  - cors

## 👨‍💻 Desarrollo y Contribuciones

Las contribuciones son bienvenidas. Para contribuir:

1. Fork el repositorio
2. Crea una rama para tu característica (`git checkout -b feature/amazing-feature`)
3. Haz commit de tus cambios (`git commit -m 'Add amazing feature'`)
4. Haz push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

## 📜 Licencia

Distribuido bajo la licencia MIT. Ver `LICENSE` para más información.

## 🙏 Agradecimientos

- Backblaze B2 por proporcionar almacenamiento en la nube económico
- La comunidad de React y Zustand por las excelentes herramientas
- A todos los que han contribuido a este proyecto

---

© 2025 Pistas Chiveros Perú - Desarrollado por el equipo de Pistas Chiveros
