import { Component, ViewChild, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DropboxService, DropboxFile } from '../dropbox.service';
import { DropboxConnectComponent } from '../dropbox-connect/dropbox-connect.component';
import { FileBrowserComponent } from '../file-browser/file-browser.component';
import { PlaylistComponent, PlaylistItem } from '../playlist/playlist.component';
import { AudioPlayerComponent } from '../audio-player/audio-player.component';
import { PlaylistService, SavedPlaylist } from '../playlist-service';
import { NotificationService } from '../notification.service';

/**
 * MediaPlayerComponent - Main orchestrator component
 * 
 * This component coordinates between all the sub-components:
 * - DropboxConnectComponent for authentication
 * - FileBrowserComponent for browsing files
 * - PlaylistComponent for playlist management with Dropbox sync
 * - AudioPlayerComponent for audio playback
 * - PlaylistService for playlist persistence and cloud sync
 */
@Component({
  selector: 'app-media-player',
  templateUrl: './media-player.component.html',
  styleUrls: ['./media-player.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule, DropboxConnectComponent, FileBrowserComponent, PlaylistComponent, AudioPlayerComponent]
})
export class MediaPlayerComponent implements OnInit, OnDestroy {
  @ViewChild(FileBrowserComponent) fileBrowser!: FileBrowserComponent;

  // Authentication state
  isAuthenticated = false;

  // Player state
  isPlaying = false;
  isLoading = false;
  mediaUrl: string = '';

  // Playlist management
  playlist: PlaylistItem[] = [];
  currentPlaylistIndex = -1;

  // Saved playlist management
  savedPlaylists: SavedPlaylist[] = [];
  currentPlaylistId: string | null = null;
  currentPlaylistName: string = 'New Playlist';

  // Subscriptions
  private authSubscription?: Subscription;

  constructor(
    private dropboxService: DropboxService,
    private playlistService: PlaylistService,
    private notificationService: NotificationService
  ) { }

  ngOnInit(): void {
    this.loadSavedPlaylists();
    this.restoreCurrentPlaylist();

    // Listen for authentication changes to trigger sync
    this.authSubscription = this.dropboxService.getAuthState().subscribe(authState => {
      const wasAuthenticated = this.isAuthenticated;
      this.isAuthenticated = authState.isAuthenticated;

      // If we just became authenticated OR we're already authenticated on startup
      if (authState.isAuthenticated && (!wasAuthenticated || !this.hasInitialSyncCompleted)) {
        this.performInitialSync();
      }
    });

    // If already authenticated on startup, trigger sync immediately
    if (this.dropboxService.isAuthenticated()) {
      this.performInitialSync();
    }
  }

  ngOnDestroy(): void {
    this.authSubscription?.unsubscribe();
  }

  private hasInitialSyncCompleted = false;

  /**
   * Perform initial sync when app starts or user authenticates
   */
  private performInitialSync(): void {
    if (this.hasInitialSyncCompleted) return;

    if (navigator.onLine) {
      console.log('Performing initial playlist sync...');
      this.playlistService.syncPlaylists().subscribe({
        next: () => {
          console.log('Initial sync completed successfully');
          this.loadSavedPlaylists(); // Refresh the UI with synced playlists
          this.notificationService.showSuccess('Playlists synced with Dropbox');
          this.hasInitialSyncCompleted = true;
        },
        error: (error: any) => {
          console.error('Initial sync failed:', error);
          this.notificationService.showError('Error syncing playlists with Dropbox');
          this.hasInitialSyncCompleted = true; // Don't retry automatically
        }
      });
    } else {
      console.log('App is offline, skipping initial sync');
      this.hasInitialSyncCompleted = true;
    }
  }

  /**
   * Load all saved playlists from storage
   */
  private loadSavedPlaylists(): void {
    this.savedPlaylists = this.playlistService.getSavedPlaylists();
  }

  /**
   * Restore the last current playlist state
   */
  private restoreCurrentPlaylist(): void {
    const restored = this.playlistService.loadCurrentPlaylist();
    if (restored && restored.items.length > 0) {
      this.playlist = restored.items;
      this.currentPlaylistIndex = restored.currentIndex;
      this.currentPlaylistName = 'Restored Session';
    }
  }

  /**
   * Save current playlist state for auto-restore
   */
  private saveCurrentPlaylistState(): void {
    this.playlistService.saveCurrentPlaylist(this.playlist, this.currentPlaylistIndex);
  }

  /**
   * Get current playlist item by index
   */
  get currentPlaylistItem(): PlaylistItem | null {
    if (this.currentPlaylistIndex >= 0 && this.currentPlaylistIndex < this.playlist.length) {
      return this.playlist[this.currentPlaylistIndex];
    }
    return null;
  }

  /**
   * Get the name of the currently playing track
   */
  get currentTrackName(): string {
    return this.currentPlaylistItem?.displayName || '';
  }

  /**
   * Check if we can play the previous track
   */
  get canPlayPrevious(): boolean {
    return this.currentPlaylistIndex > 0;
  }

  /**
   * Check if we can play the next track
   */
  get canPlayNext(): boolean {
    return this.currentPlaylistIndex < this.playlist.length - 1;
  }

  /**
   * Handle authentication status changes from DropboxConnectComponent
   */
  onAuthenticationChanged(authenticated: boolean): void {
    const wasAuthenticated = this.isAuthenticated;
    this.isAuthenticated = authenticated;

    if (!authenticated) {
      // Clear everything when logged out
      this.playlist = [];
      this.currentPlaylistIndex = -1;
      this.mediaUrl = '';
      this.isPlaying = false;
      this.playlistService.clearCurrentPlaylist();
      this.hasInitialSyncCompleted = false; // Reset sync flag for next login
    } else if (!wasAuthenticated) {
      // User just authenticated, trigger sync
      this.performInitialSync();
    }
  }

  /**
   * Handle file selection from FileBrowserComponent
   */
  onFileSelected(file: DropboxFile): void {
    this.addToPlaylist(file);
  }

  /**
   * Handle folder enqueue request from FileBrowserComponent
   */
  onFolderEnqueueRequested(folder: DropboxFile): void {
    this.enqueueAllFromFolder(folder);
  }

  /**
   * Enqueues all audio files from a folder and its subfolders recursively
   */
  private enqueueAllFromFolder(folder: DropboxFile): void {
    this.dropboxService.collectAllAudioFilesRecursively(folder.path_display).subscribe(
      audioFiles => {
        const playlistItems: PlaylistItem[] = audioFiles.map(file => ({
          file: file,
          displayName: `${file.name}`
        }));

        this.playlist.push(...playlistItems);
        this.saveCurrentPlaylistState();

        if (!this.isPlaying && playlistItems.length > 0 && this.currentPlaylistIndex === -1) {
          this.playPlaylistItem(0);
        }

        // Notify file browser that enqueuing is complete
        if (this.fileBrowser) {
          this.fileBrowser.markFolderEnqueueComplete(folder.path_display);
        }

        this.notificationService.showSuccess(`Added ${playlistItems.length} songs from ${folder.name}`);
      },
      error => {
        console.error(`Error enqueuing files from ${folder.path_display}:`, error);
        this.notificationService.showError(`Error loading songs from ${folder.name}`);
        if (this.fileBrowser) {
          this.fileBrowser.markFolderEnqueueComplete(folder.path_display);
        }
      }
    );
  }

  /**
   * Adds a song to the playlist 
   */
  private addToPlaylist(file: DropboxFile): void {
    const playlistItem: PlaylistItem = {
      file: file,
      displayName: `${file.name}`
    };

    this.playlist.push(playlistItem);
    this.saveCurrentPlaylistState();

    // Play if playlist was empty
    if (!this.isPlaying && this.playlist.length === 1) {
      this.playPlaylistItem(0);
    }

    this.notificationService.showSuccess(`Added "${file.name}" to playlist`);
  }

  /**
   * Handle play item request from PlaylistComponent
   */
  onPlayItemRequested(index: number): void {
    this.playPlaylistItem(index);
  }

  /**
   * Handle remove item request from PlaylistComponent
   */
  onRemoveItemRequested(index: number): void {
    this.removeFromPlaylist(index);
  }

  /**
   * Handle clear playlist request from PlaylistComponent
   */
  onClearPlaylistRequested(): void {
    this.clearPlaylist();
  }

  /**
   * Handle shuffle playlist request from PlaylistComponent
   */
  onShufflePlaylistRequested(): void {
    this.shufflePlaylist();
  }

  /**
   * Handle save playlist request from PlaylistComponent
   */
  onSavePlaylistRequested(): void {
    this.saveCurrentPlaylist();
  }

  /**
   * Handle save playlist as request from PlaylistComponent
   */
  onSavePlaylistAsRequested(): void {
    this.saveCurrentPlaylistAs();
  }

  /**
   * Handle load playlist request from PlaylistComponent
   */
  onLoadPlaylistRequested(playlistId: string): void {
    this.loadPlaylist(playlistId);
  }

  /**
   * Handle playlist selection change from PlaylistComponent
   */
  onPlaylistSelectionChanged(playlistId: string | null): void {
    if (playlistId === 'new') {
      this.createNewPlaylist();
    } else if (playlistId && playlistId !== this.currentPlaylistId) {
      this.loadPlaylist(playlistId);
    }
  }

  /**
   * Handle delete playlist request from PlaylistComponent
   */
  onDeletePlaylistRequested(playlistId: string): void {
    this.deletePlaylist(playlistId);
  }

  /**
   * Handle rename playlist request from PlaylistComponent
   */
  onRenamePlaylistRequested(data: { id: string, name: string }): void {
    this.renamePlaylist(data.id, data.name);
  }

  /**
   * Handle force sync request from PlaylistComponent
   */
  onForceSyncRequested(playlistId: string): void {
    this.forceSyncPlaylist(playlistId);
  }

  /**
   * Handle stop request from AudioPlayerComponent
   */
  onStopRequested(): void {
    this.stopMedia();
  }

  /**
   * Handle previous request from AudioPlayerComponent
   */
  onPreviousRequested(): void {
    this.playPrevious();
  }

  /**
   * Handle next request from AudioPlayerComponent
   */
  onNextRequested(): void {
    this.playNext();
  }

  /**
   * Handle song ended from AudioPlayerComponent
   */
  onSongEnded(): void {
    this.playNext();
  }

  /**
   * Plays a specific item from the playlist
   */
  private playPlaylistItem(index: number): void {
    if (index < 0 || index >= this.playlist.length) {
      return;
    }

    this.currentPlaylistIndex = index;
    this.saveCurrentPlaylistState();
    this.playMedia(this.currentPlaylistItem!.file);
  }

  /**
   * Plays the next song in the playlist
   */
  private playNext(): void {
    if (this.currentPlaylistIndex < this.playlist.length - 1) {
      this.playPlaylistItem(this.currentPlaylistIndex + 1);
    } else {
      this.stopMedia();
    }
  }

  /**
   * Plays the previous song in the playlist
   */
  private playPrevious(): void {
    if (this.currentPlaylistIndex > 0) {
      this.playPlaylistItem(this.currentPlaylistIndex - 1);
    }
  }

  /**
   * Removes an item from the playlist
   */
  private removeFromPlaylist(index: number): void {
    if (index < 0 || index >= this.playlist.length) {
      return;
    }
    // If we're removing the currently playing song
    if (index === this.currentPlaylistIndex) {
      this.playlist.splice(index, 1);

      // If there are more songs in the playlist
      if (this.playlist.length > 0) {
        // If we removed the last song, go to the previous one
        if (this.currentPlaylistIndex >= this.playlist.length) {
          this.currentPlaylistIndex = this.playlist.length - 1;
        }
        // Play the song at the current position (next song, or last if we were at the end)
        this.playPlaylistItem(this.currentPlaylistIndex);
      } else {
        // No more songs in playlist
        this.stopMedia();
        this.currentPlaylistIndex = -1;
      }
    } else {
      // Remove the song
      this.playlist.splice(index, 1);

      // Adjust current index if we removed a song before the currently playing one
      if (index < this.currentPlaylistIndex) {
        this.currentPlaylistIndex--;
      }
    }

    this.saveCurrentPlaylistState();
  }

  /**
   * Clears the entire playlist
   */
  private clearPlaylist(): void {

    this.playlist = [];
    this.currentPlaylistIndex = -1;
    this.currentPlaylistId = null;
    this.currentPlaylistName = 'New Playlist';
    this.stopMedia();
    this.playlistService.clearCurrentPlaylist();
  }

  /**
   * Shuffles the playlist 
   */
  private shufflePlaylist(): void {
    if (this.playlist.length <= 1) {
      return;
    }

    // Randomise
    for (let i = this.playlist.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.playlist[i], this.playlist[j]] = [this.playlist[j], this.playlist[i]];
    }

    this.playPlaylistItem(0);
    this.saveCurrentPlaylistState();
  }

  /**
   * Create a new empty playlist
   */
  private createNewPlaylist(): void {
    this.clearPlaylist();
    this.currentPlaylistName = 'New Playlist';
    this.currentPlaylistId = null;
  }

  /**
   * Save the current playlist (with Dropbox sync if enabled)
   */
  private saveCurrentPlaylist(): void {
    if (this.playlist.length === 0) {
      this.notificationService.showError('Cannot save an empty playlist');
      return;
    }

    let name = this.currentPlaylistName;

    // If it's a new playlist or default name, prompt for name
    if (!this.currentPlaylistId || name === 'New Playlist' || name === 'Restored Session') {
      name = prompt('Enter playlist name:', name) || name;
      if (!name.trim()) return;
    }

    // Check for name conflicts (excluding current playlist)
    if (this.playlistService.playlistNameExists(name, this.currentPlaylistId || undefined)) {
      if (!confirm(`A playlist named "${name}" already exists. Overwrite it?`)) {
        return;
      }
    }

    // Save with Dropbox sync (if enabled)
    this.playlistService.savePlaylist(name, this.playlist, this.currentPlaylistId || undefined).subscribe({
      next: (savedPlaylist: SavedPlaylist) => {
        this.currentPlaylistId = savedPlaylist.id;
        this.currentPlaylistName = savedPlaylist.name;
        this.loadSavedPlaylists();

        if (savedPlaylist.syncStatus === 'synced') {
          this.notificationService.showSuccess(`Playlist "${name}" saved and synced to Dropbox`);
        } else {
          this.notificationService.showSuccess(`Playlist "${name}" saved locally`);
        }
      },
      error: (error: any) => {
        console.error('Error saving playlist:', error);
        this.notificationService.showError('Error saving playlist');
      }
    });
  }

  /**
   * Save the current playlist as a new playlist
   */
  private saveCurrentPlaylistAs(): void {
    if (this.playlist.length === 0) {
      this.notificationService.showError('Cannot save an empty playlist');
      return;
    }

    const name = prompt('Enter name for new playlist:', this.currentPlaylistName) || '';
    if (!name.trim()) return;

    // Check for name conflicts
    if (this.playlistService.playlistNameExists(name)) {
      if (!confirm(`A playlist named "${name}" already exists. Overwrite it?`)) {
        return;
      }
    }

    // Save as new playlist (always creates new ID)
    this.playlistService.savePlaylistAs(name, this.playlist).subscribe({
      next: (savedPlaylist: SavedPlaylist) => {
        this.currentPlaylistId = savedPlaylist.id;
        this.currentPlaylistName = savedPlaylist.name;
        this.loadSavedPlaylists();

      },
      error: (error: any) => {
        console.error('Error saving playlist:', error);
        this.notificationService.showError('Error saving playlist');
      }
    });
  }

  /**
   * Load a saved playlist
   */
  private loadPlaylist(playlistId: string): void {
    const savedPlaylist = this.playlistService.loadPlaylist(playlistId);
    if (!savedPlaylist) {
      this.notificationService.showError('Playlist not found');
      return;
    }

    // Stop current playback
    this.stopMedia();

    // Load the playlist - note that items from Dropbox might only have paths
    this.playlist = savedPlaylist.items.map(item => {
      // If the item only has a path (from Dropbox), reconstruct the file object
      if (!item.file.name && item.file.path_display) {
        const pathParts = item.file.path_display.split('/');
        const fileName = pathParts[pathParts.length - 1];
        return {
          ...item,
          file: {
            ...item.file,
            name: fileName,
            id: item.file.path_display, // Use path as ID
            is_folder: false
          }
        };
      }
      return item;
    });

    this.currentPlaylistId = savedPlaylist.id;
    this.currentPlaylistName = savedPlaylist.name;
    this.currentPlaylistIndex = -1;

    this.saveCurrentPlaylistState();

    // Auto-start playback if the playlist has songs
    if (this.playlist.length > 0) {
      this.playPlaylistItem(0);
      this.notificationService.showSuccess(`Loaded playlist "${savedPlaylist.name}" with ${this.playlist.length} songs`);
    } else {
      this.notificationService.showSuccess(`Loaded empty playlist "${savedPlaylist.name}"`);
    }
  }

  /**
   * Delete a saved playlist (with Dropbox sync if enabled)
   */
  private deletePlaylist(playlistId: string): void {
    const playlist = this.savedPlaylists.find(p => p.id === playlistId);
    if (!playlist) return;

    if (confirm(`Delete playlist "${playlist.name}"?`)) {
      this.playlistService.deletePlaylist(playlistId).subscribe({
        next: (success: boolean) => {
          if (success) {
            this.loadSavedPlaylists();

            // If we deleted the currently loaded playlist, reset to new
            if (this.currentPlaylistId === playlistId) {
              this.createNewPlaylist();
            }
          }
        },
        error: (error: any) => {
          console.error('Error deleting playlist:', error);
          this.notificationService.showError('Error deleting playlist');
        }
      });
    }
  }

  /**
   * Rename a saved playlist (with Dropbox sync if enabled)
   */
  private renamePlaylist(playlistId: string, newName: string): void {
    if (this.playlistService.playlistNameExists(newName, playlistId)) {
      this.notificationService.showError(`A playlist named "${newName}" already exists`);
      return;
    }

    this.playlistService.renamePlaylist(playlistId, newName).subscribe({
      next: (success: boolean) => {
        if (success) {
          this.loadSavedPlaylists();

          // Update current playlist name if it's the one being renamed
          if (this.currentPlaylistId === playlistId) {
            this.currentPlaylistName = newName;
          }
        }
      },
      error: (error: any) => {
        console.error('Error renaming playlist:', error);
        this.notificationService.showError('Error renaming playlist');
      }
    });
  }

  /**
   * Force sync a specific playlist
   */
  private forceSyncPlaylist(playlistId: string): void {
    this.playlistService.forceSyncPlaylist(playlistId).subscribe({
      next: (syncedPlaylist: SavedPlaylist) => {
        this.loadSavedPlaylists();

        if (syncedPlaylist.syncStatus === 'synced') {
          this.notificationService.showSuccess(`Playlist "${syncedPlaylist.name}" synced to Dropbox`);
        } else {
          this.notificationService.showError(`Error syncing playlist "${syncedPlaylist.name}"`);
        }
      },
      error: (error: any) => {
        console.error('Error syncing playlist:', error);
        this.notificationService.showError('Error syncing playlist');
      }
    });
  }

  /**
   * Plays media from a Dropbox file
   */
  private playMedia(file: DropboxFile): void {
    this.isLoading = true;

    console.log(`Getting temporary link for file: ${file.path_display}`);

    this.dropboxService.getTemporaryLink(file.path_display).subscribe({
      next: (url) => {
        console.log(`Received temporary link: ${url.substring(0, 50)}...`);
        this.mediaUrl = url;
        this.isLoading = false;
        this.isPlaying = true;
      },
      error: (error) => {
        console.error('Error getting media link:', error);
        this.notificationService.showError('Error loading media file');
        this.isLoading = false;
      }
    });
  }

  /**
   * Stops media playback
   */
  private stopMedia(): void {
    this.isPlaying = false;
    this.mediaUrl = '';
  }
}
