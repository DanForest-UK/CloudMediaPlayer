import { Injectable } from '@angular/core';
import { PlaylistItem } from './playlist/playlist.component';

export interface SavedPlaylist {
  id: string;
  name: string;
  items: PlaylistItem[];
  created: Date;
  lastModified: Date;
}

@Injectable({
  providedIn: 'root'
})
export class PlaylistService {
  private readonly STORAGE_KEY = 'cloudMediaPlayer_playlists';
  private readonly CURRENT_PLAYLIST_KEY = 'cloudMediaPlayer_currentPlaylist';

  constructor() { }

  /**
   * Save a playlist to local storage
   */
  savePlaylist(name: string, items: PlaylistItem[], id?: string): SavedPlaylist {
    const playlists = this.getSavedPlaylists();

    const playlistId = id || this.generateId();
    const now = new Date();

    const playlist: SavedPlaylist = {
      id: playlistId,
      name: name.trim(),
      items: [...items], // Create a copy
      created: id ? (playlists.find(p => p.id === id)?.created || now) : now,
      lastModified: now
    };

    // Remove existing playlist with same ID if updating
    const existingIndex = playlists.findIndex(p => p.id === playlistId);
    if (existingIndex >= 0) {
      playlists[existingIndex] = playlist;
    } else {
      playlists.push(playlist);
    }

    this.storePlaylists(playlists);
    return playlist;
  }

  /**
   * Get all saved playlists
   */
  getSavedPlaylists(): SavedPlaylist[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];

      const playlists = JSON.parse(stored) as SavedPlaylist[];

      // Convert date strings back to Date objects
      return playlists.map(playlist => ({
        ...playlist,
        created: new Date(playlist.created),
        lastModified: new Date(playlist.lastModified)
      }));
    } catch (error) {
      console.error('Error loading playlists from storage:', error);
      return [];
    }
  }

  /**
   * Load a specific playlist by ID
   */
  loadPlaylist(id: string): SavedPlaylist | null {
    const playlists = this.getSavedPlaylists();
    return playlists.find(p => p.id === id) || null;
  }

  /**
   * Delete a playlist
   */
  deletePlaylist(id: string): boolean {
    const playlists = this.getSavedPlaylists();
    const index = playlists.findIndex(p => p.id === id);

    if (index >= 0) {
      playlists.splice(index, 1);
      this.storePlaylists(playlists);
      return true;
    }

    return false;
  }

  /**
   * Rename a playlist
   */
  renamePlaylist(id: string, newName: string): boolean {
    const playlists = this.getSavedPlaylists();
    const playlist = playlists.find(p => p.id === id);

    if (playlist) {
      playlist.name = newName.trim();
      playlist.lastModified = new Date();
      this.storePlaylists(playlists);
      return true;
    }

    return false;
  }

  /**
   * Save current playlist state for auto-restore
   */
  saveCurrentPlaylist(items: PlaylistItem[], currentIndex: number): void {
    try {
      const currentState = {
        items,
        currentIndex,
        timestamp: new Date()
      };
      localStorage.setItem(this.CURRENT_PLAYLIST_KEY, JSON.stringify(currentState));
    } catch (error) {
      console.error('Error saving current playlist state:', error);
    }
  }

  /**
   * Load current playlist state for auto-restore
   */
  loadCurrentPlaylist(): { items: PlaylistItem[], currentIndex: number } | null {
    try {
      const stored = localStorage.getItem(this.CURRENT_PLAYLIST_KEY);
      if (!stored) return null;

      const currentState = JSON.parse(stored);
      return {
        items: currentState.items || [],
        currentIndex: currentState.currentIndex || -1
      };
    } catch (error) {
      console.error('Error loading current playlist state:', error);
      return null;
    }
  }

  /**
   * Clear current playlist state
   */
  clearCurrentPlaylist(): void {
    localStorage.removeItem(this.CURRENT_PLAYLIST_KEY);
  }

  /**
   * Check if a playlist name already exists
   */
  playlistNameExists(name: string, excludeId?: string): boolean {
    const playlists = this.getSavedPlaylists();
    return playlists.some(p =>
      p.name.toLowerCase() === name.toLowerCase().trim() &&
      p.id !== excludeId
    );
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private storePlaylists(playlists: SavedPlaylist[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(playlists));
    } catch (error) {
      console.error('Error saving playlists to storage:', error);
    }
  }
}
