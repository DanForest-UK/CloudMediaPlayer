import { Injectable } from '@angular/core';
import { Observable, of, forkJoin, EMPTY, BehaviorSubject, from } from 'rxjs';
import { map, catchError, tap, switchMap, finalize } from 'rxjs/operators';
import { DropboxService, AuthState } from '@services/dropbox.service';
import { NotificationService } from '@services/notification.service';
import { PlaylistItem, SavedPlaylist, SyncStatus, SyncSettings, DropboxFile } from '@models/index';

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
      if (this.canSync()) {
        this.syncPlaylists();
      }
    });

    // Initial sync check
    this.dropboxService.getAuthState().subscribe((authState: AuthState) => {
      if (this.canSync()) {
        this.syncPlaylists();
      }
    });
  }

  /**
   * Check if sync is possible
   */
  canSync(): boolean {
    const settings = this.syncSettings$.value;
    const status = this.syncStatus$.value;
    return settings.enabled &&
      settings.autoSync &&
      this.dropboxService.isAuthenticated() &&
      status.isOnline;
  }

  /**
   * Validate sync conditions for operations
   */
  validateSyncConditions(enabled: boolean, authenticated: boolean, online: boolean): boolean {
    return enabled && authenticated && online;
  }

  /**
   * Merge local and remote playlists, resolving conflicts by preferring newer versions
   */
  mergePlaylists(localPlaylists: SavedPlaylist[], remotePlaylists: SavedPlaylist[]): SavedPlaylist[] {
    const merged = [...localPlaylists];

    remotePlaylists.forEach(remotePlaylist => {
      const existingIndex = merged.findIndex(p => p.name === remotePlaylist.name);

      if (existingIndex === -1) {
        // New remote playlist - add it
        merged.push(remotePlaylist);
      } else {
        // Conflict resolution - prefer newer lastModified date
        const existingPlaylist = merged[existingIndex];
        if (remotePlaylist.lastModified > existingPlaylist.lastModified) {
          merged[existingIndex] = remotePlaylist;
        }
      }
    });

    return merged;
  }

  /**
   * Check if a playlist name already exists (case-insensitive)
   */
  playlistNameExists(name: string, excludeId?: string): boolean {
    const playlists = this.getSavedPlaylists();
    return playlists.some(p =>
      p.name.toLowerCase() === name.toLowerCase().trim() &&
      p.id !== excludeId
    );
  }

  /**
   * Generate Dropbox-safe playlist path
   */
  generatePlaylistPath(name: string): string {
    const sanitizedName = this.sanitizePlaylistName(name);
    return `/playlists/${sanitizedName}.json`;
  }

  /**
   * Sanitize playlist name for Dropbox storage
   */
  sanitizePlaylistName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*\s]+/g, '_')  // Replace sequences of invalid chars + whitespace with single _
      .replace(/^_+|_+$/g, '')           // Remove leading/trailing underscores
      .substring(0, 255)
      || 'Untitled';                     // Fallback for empty names
  }

  /**
   * Generate unique ID for playlists
   */
  generatePlaylistId(): string {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  /**
   * Get playlist display name with song count
   */
  getPlaylistDisplayName(name: string, songCount: number): string {
    const songText = songCount === 1 ? 'song' : 'songs';
    return `${name} (${songCount} ${songText})`;
  }

  /**
   * Get sync status icon for a playlist
   */
  getSyncStatusIcon(playlist: SavedPlaylist, syncEnabled: boolean): string {
    if (!syncEnabled) return '💾'; // Always local when sync disabled

    switch (playlist.syncStatus) {
      case 'synced': return '☁️';
      case 'syncing': return '🔄';
      case 'local': return '💾';
      case 'error': return '⚠️';
      default: return '💾';
    }
  }

  /**
   * Get sync status tooltip for a playlist
   */
  getSyncStatusTooltip(playlist: SavedPlaylist, syncEnabled: boolean): string {
    if (!syncEnabled) return 'Sync disabled - saved locally only';

    switch (playlist.syncStatus) {
      case 'synced': return 'Synced to Dropbox';
      case 'syncing': return 'Syncing to Dropbox...';
      case 'local': return 'Saved locally only';
      case 'error': return 'Sync failed - right-click to retry';
      default: return 'Unknown sync status';
    }
  }

  /**
   * Get the sync status display for the header
   */
  getSyncStatusHeaderDisplay(syncSettings: SyncSettings, syncStatus: SyncStatus): string {
    if (!syncSettings.enabled) return 'Sync Disabled';
    if (!syncStatus.isOnline) return 'Offline';
    if (syncStatus.isSyncing) return 'Syncing...';
    if (syncStatus.error) return 'Sync Error';
    if (syncStatus.lastSync) {
      const timeDiff = Date.now() - syncStatus.lastSync.getTime();
      const minutes = Math.floor(timeDiff / 60000);
      if (minutes < 1) return 'Just synced';
      if (minutes < 60) return `Synced ${minutes}m ago`;
      return 'Synced recently';
    }
    return 'Not synced';
  }

  /**
   * Get the sync status icon for the header
   */
  getSyncStatusHeaderIcon(syncSettings: SyncSettings, syncStatus: SyncStatus): string {
    if (!syncSettings.enabled) return '📱';
    if (!syncStatus.isOnline) return '📱';
    if (syncStatus.isSyncing) return '🔄';
    return '☁️';
  }

  /**
   * Check if a playlist can be force synced
   */
  canForceSyncPlaylist(playlistId: string, syncEnabled: boolean): boolean {
    if (!syncEnabled) return false;

    const playlist = this.getSavedPlaylists().find(p => p.id === playlistId);
    return playlist ? playlist.syncStatus !== 'synced' : false;
  }
   

  /**
   * Transform playlist to Dropbox format
   */
  transformPlaylistToDropboxFormat(playlist: SavedPlaylist): any {
    return {
      id: playlist.id,
      name: playlist.name,
      created: playlist.created.toISOString(),
      lastModified: playlist.lastModified.toISOString(),
      items: playlist.items.map(item => ({
        path: item.file.path_display,
        displayName: item.displayName
      }))
    };
  }

  /**
   * Transform Dropbox playlist to local format
   */
  transformDropboxPlaylistToLocal(dropboxPlaylist: any, file?: DropboxFile): SavedPlaylist {
    return {
      id: dropboxPlaylist.id || this.generatePlaylistId(),
      name: dropboxPlaylist.name,
      created: new Date(dropboxPlaylist.created),
      lastModified: new Date(dropboxPlaylist.lastModified),
      syncStatus: 'synced',
      dropboxRev: file?.rev,
      items: dropboxPlaylist.items.map((item: any) => ({
        file: { path_display: item.path },
        displayName: item.displayName
      }))
    };
  }

  /**
   * Create default sync settings
   */
  getDefaultSyncSettings(): SyncSettings {
    return {
      enabled: true,
      autoSync: true
    };
  }

  /**
   * Create default sync status
   */
  getDefaultSyncStatus(): SyncStatus {
    return {
      isOnline: navigator.onLine,
      isSyncing: false,
      lastSync: null,
      pendingUploads: 0,
      error: null
    };
  }

  /**
   * Validate playlist data before saving
   */
  validatePlaylistData(name: string, items: PlaylistItem[]): { valid: boolean; error?: string } {
    if (!name || !name.trim()) {
      return { valid: false, error: 'Playlist name cannot be empty' };
    }

    if (name.trim().length > 255) {
      return { valid: false, error: 'Playlist name is too long' };
    }

    if (!Array.isArray(items)) {
      return { valid: false, error: 'Invalid playlist items' };
    }

    return { valid: true };
  }

  /**
   * Create playlist item from file
   */
  createPlaylistItem(file: DropboxFile, displayName?: string): PlaylistItem {
    return {
      file: file,
      displayName: displayName || file.name
    };
  }

  /**
   * Check if playlist is currently playing
   */
  isPlaylistCurrentlyPlaying(playlistIndex: number, currentIndex: number, isPlaying: boolean): boolean {
    return isPlaying && currentIndex === playlistIndex;
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
        console.log('savePlaylist called with:', { name, itemCount: items.length, id });

        // Validate input
        const validation = this.validatePlaylistData(name, items);
        if (!validation.valid) {
          observer.error(new Error(validation.error));
          return;
        }

        // Save locally first for immediate response
        const localPlaylist = this.savePlaylistLocally(name, items, id);
        observer.next(localPlaylist);

        // Then sync to Dropbox if enabled and possible
        const canSyncResult = this.canSync();
        console.log('Can sync check result:', canSyncResult);

        if (canSyncResult) {
          console.log('Starting sync to Dropbox...');
          this.syncPlaylistToDropbox(localPlaylist).subscribe({
            next: (syncedPlaylist) => {
              this.updateLocalPlaylist(syncedPlaylist);
              observer.next(syncedPlaylist);
              observer.complete();
            },
            error: (error) => {
              console.error('Failed to sync playlist to Dropbox:', error);
              this.notificationService.showError('Error syncing playlist to Dropbox');
              localPlaylist.syncStatus = 'error';
              this.updateLocalPlaylist(localPlaylist);
              observer.next(localPlaylist);
              observer.complete();
            }
          });
        } else {
          console.log('Sync conditions not met, completing with local save only');
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
   * Save as new playlist 
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

    const playlistId = id || this.generatePlaylistId();
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

    const playlistPath = this.generatePlaylistPath(playlist.name);
    const dropboxPlaylist = this.transformPlaylistToDropboxFormat(playlist);

    return this.dropboxService.uploadFile(playlistPath, JSON.stringify(dropboxPlaylist, null, 2)).pipe(
      map(uploadedFile => {
        return {
          ...playlist,
          syncStatus: 'synced' as const,
          dropboxRev: uploadedFile.rev
        };
      }),
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
  * Get all saved playlists from local storage
  */
  getSavedPlaylists(): SavedPlaylist[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (!stored) return [];

      const playlists = JSON.parse(stored) as SavedPlaylist[];


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
        const playlistPath = this.generatePlaylistPath(playlist.name);
        this.dropboxService.deleteFile(playlistPath).subscribe({
          next: () => {
            observer.next(true);
            observer.complete();
          },
          error: (error) => {
            console.error('Failed to delete playlist from Dropbox:', error);
            this.notificationService.showError('Error deleting playlist from Dropbox');
            observer.next(true); // Still success as saved locally, can sync later
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

      if (this.canSync()) {
        // Delete old file and upload new one
        forkJoin([
          this.dropboxService.deleteFile(this.generatePlaylistPath(oldName)),
          this.syncPlaylistToDropbox(playlist)
        ]).subscribe({
          next: ([_, syncedPlaylist]: [void, SavedPlaylist]) => {
            this.updateLocalPlaylist(syncedPlaylist); // need to update rev no and synced status
            observer.next(true);
            observer.complete();
          },
          error: (error: any) => {
            console.error('Failed to rename playlist in Dropbox:', error);
            this.notificationService.showError('Error renaming playlist in Dropbox');
            observer.next(true); // Still success as saved locally
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
   * Sync all playlists between local and Dropbox
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
        const processedLocalIds = new Set<string>();

        // Process Dropbox files
        dropboxFiles.forEach(file => {
          const operation = this.downloadPlaylistMetadata(file).pipe(
            switchMap(dropboxPlaylist => {
              const localPlaylist = this.findMatchingLocalPlaylist(dropboxPlaylist, localPlaylists);

              if (!localPlaylist) {
                return this.downloadPlaylistFromDropbox(file);
              } else {
                // Mark local playlist as processed
                processedLocalIds.add(localPlaylist.id);

                const dropboxModified = new Date(dropboxPlaylist.lastModified);
                const localModified = localPlaylist.lastModified;

                if (dropboxModified > localModified) {                 
                  return this.downloadPlaylistFromDropbox(file);
                } else if (localModified > dropboxModified) {                  
                  return this.syncPlaylistToDropbox(localPlaylist);
                } else {                  
                  return of(null); 
                }
              }
            }),
            catchError(error => {
              console.error(`Failed to process Dropbox file ${file.name}:`, error);
              return of(null); // Continue processing other files
            })
          );

          syncOperations.push(operation);
        });
               
        localPlaylists.forEach(playlist => {
          if (playlist.syncStatus !== 'synced') {
            // Check if this playlist matches any Dropbox file by name (quick check)
            const hasDropboxMatch = dropboxFiles.some(file =>
              file.name.replace('.json', '') === playlist.name
            );

            if (!hasDropboxMatch) {             
              syncOperations.push(this.syncPlaylistToDropbox(playlist));
            }
            // If there is a Dropbox match, it will be handled above
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
      map(() => void 0), // Mark completed, dont care about results
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
   * Download playlist metadata only (ID matching)
   */
  private downloadPlaylistMetadata(file: DropboxFile): Observable<any> {
    return this.dropboxService.downloadFile(file.path_display).pipe(
      map(content => JSON.parse(content)),
      catchError(error => {
        console.error(`Failed to download metadata for ${file.name}:`, error);
        throw error;
      })
    );
  }

  /**
   * Find matching local playlist
   */
  private findMatchingLocalPlaylist(dropboxPlaylist: any, localPlaylists: SavedPlaylist[]): SavedPlaylist | undefined {
    // First try to match by ID (most reliable)
    if (dropboxPlaylist.id) {
      const matchById = localPlaylists.find(p => p.id === dropboxPlaylist.id);
      if (matchById) {       
        return matchById;
      }
    }

    // Fallback to name matching (for legacy files or edge cases)
    const matchByName = localPlaylists.find(p => p.name === dropboxPlaylist.name);
    if (matchByName) {
      console.log(`Matched playlist by name (legacy): ${dropboxPlaylist.name}, assigning ID ${dropboxPlaylist.id} to local playlist ${matchByName.id}`);

      // Update local playlist with the Dropbox ID for future syncs
      matchByName.id = dropboxPlaylist.id;
      this.updateLocalPlaylist(matchByName);
    }

    return matchByName;
  }  

  /**
   * Download a playlist from Dropbox
   */
  private downloadPlaylistFromDropbox(file: DropboxFile): Observable<SavedPlaylist> {
    return this.dropboxService.downloadFile(file.path_display).pipe(
      map(content => {
        const dropboxPlaylist = JSON.parse(content);

        const playlist = this.transformDropboxPlaylistToLocal(dropboxPlaylist, file);

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
   * Save current playlist state
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
   * Load current playlist state 
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

  private storePlaylists(playlists: SavedPlaylist[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(playlists));
    } catch (error) {
      console.error('Error saving playlists to storage:', error);
      this.notificationService.showError('Error saving playlists');
    }
  }
}
