import { Injectable } from '@angular/core';
import { Observable, of, forkJoin, EMPTY, BehaviorSubject, from } from 'rxjs';
import { map, catchError, tap, switchMap, finalize } from 'rxjs/operators';
import { PlaylistItem } from './playlist/playlist.component';
import { DropboxService, DropboxFile, AuthState } from './dropbox.service';
import { NotificationService } from './notification.service';

export interface SavedPlaylist {
  id: string;
  name: string;
  items: PlaylistItem[];
  created: Date;
  lastModified: Date;
  syncStatus?: 'local' | 'synced' | 'syncing' | 'error';
  dropboxRev?: string; // Dropbox revision for conflict detection
}

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSync: Date | null;
  pendingUploads: number;
  error: string | null;
}

export interface SyncSettings {
  enabled: boolean;
  autoSync: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class PlaylistService {
  private readonly STORAGE_KEY = 'cloudMediaPlayer_playlists';
  private readonly CURRENT_PLAYLIST_KEY = 'cloudMediaPlayer_currentPlaylist';
  private readonly SYNC_STATUS_KEY = 'cloudMediaPlayer_syncStatus';
  private readonly SYNC_SETTINGS_KEY = 'cloudMediaPlayer_syncSettings';

  // Sync status observable
  private syncStatus$ = new BehaviorSubject<SyncStatus>({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSync: null,
    pendingUploads: 0,
    error: null
  });

  // Sync settings observable
  private syncSettings$ = new BehaviorSubject<SyncSettings>({
    enabled: true,
    autoSync: true
  });

  constructor(
    private dropboxService: DropboxService,
    private notificationService: NotificationService
  ) {
    // Load sync settings
    this.loadSyncSettings();

    // Listen for online/offline events
    window.addEventListener('online', () => this.updateSyncStatus({ isOnline: true }));
    window.addEventListener('offline', () => this.updateSyncStatus({ isOnline: false }));

    // Auto-sync when coming online (if enabled)
    window.addEventListener('online', () => {
      if (this.syncSettings$.value.enabled && this.syncSettings$.value.autoSync) {
        this.syncPlaylists();
      }
    });

    // Initial sync check
    this.dropboxService.getAuthState().subscribe((authState: AuthState) => {
      if (authState.isAuthenticated && navigator.onLine &&
        this.syncSettings$.value.enabled && this.syncSettings$.value.autoSync) {
        this.syncPlaylists();
      }
    });
  }

  /**
   * Get sync status as observable
   */
  getSyncStatus(): Observable<SyncStatus> {
    return this.syncStatus$.asObservable();
  }

  /**
   * Get sync settings as observable
   */
  getSyncSettings(): Observable<SyncSettings> {
    return this.syncSettings$.asObservable();
  }

  /**
   * Update sync settings
   */
  updateSyncSettings(settings: Partial<SyncSettings>): void {
    const currentSettings = this.syncSettings$.value;
    const newSettings = { ...currentSettings, ...settings };
    this.syncSettings$.next(newSettings);
    this.storeSyncSettings(newSettings);
  }

  /**
   * Load sync settings from storage
   */
  private loadSyncSettings(): void {
    try {
      const stored = localStorage.getItem(this.SYNC_SETTINGS_KEY);
      if (stored) {
        const settings = JSON.parse(stored);
        this.syncSettings$.next(settings);
      }
    } catch (error) {
      console.error('Error loading sync settings:', error);
      this.notificationService.showError('Error loading sync settings');
    }
  }

  /**
   * Store sync settings to storage
   */
  private storeSyncSettings(settings: SyncSettings): void {
    try {
      localStorage.setItem(this.SYNC_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Error storing sync settings:', error);
      this.notificationService.showError('Error saving sync settings');
    }
  }

  /**
   * Update sync status
   */
  private updateSyncStatus(status: Partial<SyncStatus>): void {
    const currentStatus = this.syncStatus$.value;
    this.syncStatus$.next({ ...currentStatus, ...status });
  }

  /**
   * Save a playlist (local + cloud sync if enabled)
   */
  savePlaylist(name: string, items: PlaylistItem[], id?: string): Observable<SavedPlaylist> {
    return new Observable(observer => {
      try {
        // Save locally first for immediate response
        const localPlaylist = this.savePlaylistLocally(name, items, id);
        observer.next(localPlaylist);

        // Then sync to Dropbox if enabled and possible
        if (this.canSync()) {
          this.syncPlaylistToDropbox(localPlaylist).subscribe({
            next: (syncedPlaylist) => {
              // Update local storage with synced status
              this.updateLocalPlaylist(syncedPlaylist);
              observer.next(syncedPlaylist);
              observer.complete();
            },
            error: (error) => {
              console.error('Failed to sync playlist to Dropbox:', error);
              this.notificationService.showError('Error syncing playlist to Dropbox');
              // Mark as pending sync
              localPlaylist.syncStatus = 'error';
              this.updateLocalPlaylist(localPlaylist);
              observer.next(localPlaylist);
              observer.complete();
            }
          });
        } else {
          observer.complete();
        }
      } catch (error) {
        console.error('Error saving playlist:', error);
        this.notificationService.showError('Error saving playlist');
        observer.error(error);
      }
    });
  }

  /**
   * Save playlist as new (always creates a new playlist with new ID)
   */
  savePlaylistAs(name: string, items: PlaylistItem[]): Observable<SavedPlaylist> {
    // Always create new playlist by not passing an ID
    return this.savePlaylist(name, items);
  }

  /**
   * Save playlist locally only
   */
  private savePlaylistLocally(name: string, items: PlaylistItem[], id?: string): SavedPlaylist {
    const playlists = this.getSavedPlaylists();

    const playlistId = id || this.generateId();
    const now = new Date();

    const playlist: SavedPlaylist = {
      id: playlistId,
      name: name.trim(),
      items: [...items], // Create a copy
      created: id ? (playlists.find(p => p.id === id)?.created || now) : now,
      lastModified: now,
      syncStatus: 'local'
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
   * Sync a playlist to Dropbox
   */
  private syncPlaylistToDropbox(playlist: SavedPlaylist): Observable<SavedPlaylist> {
    const playlistPath = this.dropboxService.getPlaylistPath(playlist.name);

    const dropboxPlaylist = {
      id: playlist.id,
      name: playlist.name,
      created: playlist.created.toISOString(),
      lastModified: playlist.lastModified.toISOString(),
      items: playlist.items.map(item => ({
        path: item.file.path_display,
        displayName: item.displayName
      }))
    };

    return this.dropboxService.uploadFile(playlistPath, JSON.stringify(dropboxPlaylist, null, 2)).pipe(
      map(uploadedFile => ({
        ...playlist,
        syncStatus: 'synced' as const,
        dropboxRev: uploadedFile.rev
      })),
      catchError(error => {
        console.error('Failed to upload playlist to Dropbox:', error);
        this.notificationService.showError('Error syncing playlist to Dropbox');
        return of({
          ...playlist,
          syncStatus: 'error' as const
        });
      })
    );
  }

  /**
   * Get all saved playlists (local + synced from Dropbox)
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
        lastModified: new Date(playlist.lastModified),
        syncStatus: playlist.syncStatus || 'local'
      }));
    } catch (error) {
      console.error('Error loading playlists from storage:', error);
      this.notificationService.showError('Error loading saved playlists');
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
   * Delete a playlist (local + cloud if sync enabled)
   */
  deletePlaylist(id: string): Observable<boolean> {
    return new Observable(observer => {
      const playlists = this.getSavedPlaylists();
      const playlist = playlists.find(p => p.id === id);

      if (!playlist) {
        observer.next(false);
        observer.complete();
        return;
      }

      // Remove from local storage
      const index = playlists.findIndex(p => p.id === id);
      if (index >= 0) {
        playlists.splice(index, 1);
        this.storePlaylists(playlists);
      }

      // Delete from Dropbox if synced and sync is enabled
      if (this.canSync() && playlist.syncStatus === 'synced') {
        const playlistPath = this.dropboxService.getPlaylistPath(playlist.name);
        this.dropboxService.deleteFile(playlistPath).subscribe({
          next: () => {
            observer.next(true);
            observer.complete();
          },
          error: (error) => {
            console.error('Failed to delete playlist from Dropbox:', error);
            this.notificationService.showError('Error deleting playlist from Dropbox');
            observer.next(true); // Still success locally
            observer.complete();
          }
        });
      } else {
        observer.next(true);
        observer.complete();
      }
    });
  }

  /**
   * Rename a playlist (local + cloud if sync enabled)
   */
  renamePlaylist(id: string, newName: string): Observable<boolean> {
    return new Observable(observer => {
      const playlists = this.getSavedPlaylists();
      const playlist = playlists.find(p => p.id === id);

      if (!playlist) {
        observer.next(false);
        observer.complete();
        return;
      }

      const oldName = playlist.name;
      playlist.name = newName.trim();
      playlist.lastModified = new Date();
      playlist.syncStatus = 'local';

      this.storePlaylists(playlists);

      // Sync to Dropbox if possible and enabled
      if (this.canSync()) {
        // Delete old file and upload new one
        forkJoin([
          this.dropboxService.deleteFile(this.dropboxService.getPlaylistPath(oldName)),
          this.syncPlaylistToDropbox(playlist)
        ]).subscribe({
          next: ([_, syncedPlaylist]: [void, SavedPlaylist]) => {
            this.updateLocalPlaylist(syncedPlaylist);
            observer.next(true);
            observer.complete();
          },
          error: (error: any) => {
            console.error('Failed to rename playlist in Dropbox:', error);
            this.notificationService.showError('Error renaming playlist in Dropbox');
            observer.next(true); // Still success locally
            observer.complete();
          }
        });
      } else {
        observer.next(true);
        observer.complete();
      }
    });
  }

  /**
   * Sync all playlists between local and Dropbox (if sync enabled)
   */
  syncPlaylists(): Observable<void> {
    if (!this.canSync()) {
      return of(void 0);
    }

    this.updateSyncStatus({ isSyncing: true, error: null });

    return this.dropboxService.listPlaylistFiles().pipe(
      switchMap(dropboxFiles => {
        const localPlaylists = this.getSavedPlaylists();
        const syncOperations: Observable<any>[] = [];

        // Download playlists from Dropbox that aren't local or are newer
        dropboxFiles.forEach(file => {
          const playlistName = file.name.replace('.json', '');
          const localPlaylist = localPlaylists.find(p => p.name === playlistName);

          if (!localPlaylist || (file.server_modified && new Date(file.server_modified) > localPlaylist.lastModified)) {
            syncOperations.push(this.downloadPlaylistFromDropbox(file));
          }
        });

        // Upload local playlists that aren't synced
        localPlaylists.forEach(playlist => {
          if (playlist.syncStatus !== 'synced') {
            syncOperations.push(this.syncPlaylistToDropbox(playlist));
          }
        });

        return syncOperations.length > 0 ? forkJoin(syncOperations) : of([]);
      }),
      tap(() => {
        this.updateSyncStatus({
          isSyncing: false,
          lastSync: new Date(),
          pendingUploads: 0
        });
      }),
      map(() => void 0),
      catchError((error: any) => {
        console.error('Sync failed:', error);
        this.notificationService.showError('Error syncing playlists with Dropbox');
        this.updateSyncStatus({
          isSyncing: false,
          error: 'Sync failed: ' + error.message
        });
        return of(void 0);
      })
    );
  }

  /**
   * Download a playlist from Dropbox
   */
  private downloadPlaylistFromDropbox(file: DropboxFile): Observable<SavedPlaylist> {
    return this.dropboxService.downloadFile(file.path_display).pipe(
      map(content => {
        const dropboxPlaylist = JSON.parse(content);

        // Convert Dropbox playlist to local format
        const playlist: SavedPlaylist = {
          id: dropboxPlaylist.id || this.generateId(),
          name: dropboxPlaylist.name,
          created: new Date(dropboxPlaylist.created),
          lastModified: new Date(dropboxPlaylist.lastModified),
          syncStatus: 'synced',
          dropboxRev: file.rev,
          items: dropboxPlaylist.items.map((item: any) => ({
            file: { path_display: item.path },
            displayName: item.displayName
          }))
        };

        // Update local storage
        this.updateLocalPlaylist(playlist);
        return playlist;
      }),
      catchError((error: any) => {
        console.error('Failed to download playlist from Dropbox:', error);
        this.notificationService.showError('Error downloading playlist from Dropbox');
        throw error;
      })
    );
  }

  /**
   * Update a specific playlist in local storage
   */
  private updateLocalPlaylist(updatedPlaylist: SavedPlaylist): void {
    const playlists = this.getSavedPlaylists();
    const index = playlists.findIndex(p => p.id === updatedPlaylist.id);

    if (index >= 0) {
      playlists[index] = updatedPlaylist;
    } else {
      playlists.push(updatedPlaylist);
    }

    this.storePlaylists(playlists);
  }

  /**
   * Force sync a specific playlist
   */
  forceSyncPlaylist(id: string): Observable<SavedPlaylist> {
    const playlist = this.loadPlaylist(id);
    if (!playlist || !this.canSync()) {
      return of(playlist!);
    }

    return this.syncPlaylistToDropbox(playlist).pipe(
      tap(syncedPlaylist => this.updateLocalPlaylist(syncedPlaylist))
    );
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
      this.notificationService.showError('Error saving playlist state');
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
      this.notificationService.showError('Error loading playlist state');
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

  /**
   * Get playlists that need syncing
   */
  getUnsyncedPlaylists(): SavedPlaylist[] {
    return this.getSavedPlaylists().filter(p =>
      p.syncStatus === 'local' || p.syncStatus === 'error'
    );
  }

  /**
   * Check if sync is possible (authentication + online + sync enabled)
   */
  private canSync(): boolean {
    return this.syncSettings$.value.enabled &&
      this.dropboxService.isAuthenticated() &&
      navigator.onLine;
  }

  private generateId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  private storePlaylists(playlists: SavedPlaylist[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(playlists));
    } catch (error) {
      console.error('Error saving playlists to storage:', error);
      this.notificationService.showError('Error saving playlists');
    }
  }
}
