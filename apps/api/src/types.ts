// Definición de tipos para la integración con Backblaze B2

/**
 * Información de una canción
 */
export interface Song {
  id?: string;
  title: string;
  artist: string;
  album?: string;
  year?: number;
  duration?: number;
  url?: string;
}

/**
 * Información de un artista
 */
export interface Artist {
  id?: string;
  name: string;
  songs?: Song[];
}

/**
 * Información de un álbum
 */
export interface Album {
  id?: string;
  title: string;
  artist: string;
  year?: number;
  songs?: Song[];
}

/**
 * Archivo de Backblaze B2
 */
export interface B2File {
  name: string;
  key: string;
  size: number;
  lastModified: string;
  title: string;
  artist: string;
  fileId?: string;
}

/**
 * Información de un bucket de Backblaze B2
 */
export interface BucketInfo {
  bucketName: string;
  totalFiles: number;
  filesList: B2File[];
  nextToken?: string;
}