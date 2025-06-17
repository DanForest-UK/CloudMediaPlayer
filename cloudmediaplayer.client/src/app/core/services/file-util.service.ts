import { Injectable } from '@angular/core';
import { DropboxFile } from '@models/index';

/**
 * FileUtilService - Reusable file manipulation utilities
 * 
 * This service provides file-related utility functions
 * for file naming, validation, and path manipulation.
 */
@Injectable({
  providedIn: 'root'
})
export class FileUtilService {

  // Supported audio extensions - single source of truth
  public readonly audioExtensions = [
    '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'
  ];

  /**
   * Sanitize filename for safe storage (Dropbox, filesystem, etc.)
   * Replaces invalid characters and ensures valid length
   */
  sanitizeFileName(name: string): string {
    if (!name || typeof name !== 'string') {
      return 'Untitled';
    }

    return name
      .replace(/[<>:"/\\|?*\s]+/g, '_')  // Replace invalid chars + whitespace with _
      .replace(/^_+|_+$/g, '')           // Remove leading/trailing underscores
      .substring(0, 255)                 
      || 'Untitled';                    
  }

  /**
   * Extract filename from a path
   */
  getFileNameFromPath(path: string): string {
    if (!path) return '';
    const pathParts = path.split('/').filter(p => p);
    return pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';
  }

  /**
   * Generate a safe filename for playlists
   */
  generatePlaylistFileName(playlistName: string): string {
    const sanitized = this.sanitizeFileName(playlistName);
    return `${sanitized}.json`;
  }

  /**
   * Generate full playlist path for Dropbox storage
   */
  generatePlaylistPath(playlistName: string): string {
    const fileName = this.generatePlaylistFileName(playlistName);
    return `/playlists/${fileName}`;
  }

  /**
  * Filter to show only audio files (no folders)
  */
  filterAudioFilesOnly(files: DropboxFile[]): DropboxFile[] {
    return files.filter(file =>
      !file.is_folder && this.isAudioFile(file.name)
    );
  }

  /**
 * Check if a file is an audio file based on its extension
 */
  isAudioFile(filename: string): boolean {
    if (!filename) return false;

    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return this.audioExtensions.includes(extension);
  }
}
