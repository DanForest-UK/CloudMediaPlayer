import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DropboxService, DropboxFile } from '../dropbox.service'; // Updated import
import { DropboxConnectComponent } from '../dropbox-connect/dropbox-connect.component';
import { FileBrowserComponent } from '../file-browser/file-browser.component';
import { PlaylistComponent, PlaylistItem } from '../playlist/playlist.component';
import { AudioPlayerComponent } from '../audio-player/audio-player.component';

/**
 * MediaPlayerComponent - Main orchestrator component
 * 
 * This component coordinates between all the sub-components:
 * - DropboxConnectComponent for authentication
 * - FileBrowserComponent for browsing files
 * - PlaylistComponent for playlist management
 * - AudioPlayerComponent for audio playback
 */
@Component({
  selector: 'app-media-player',
  templateUrl: './media-player.component.html',
  styleUrls: ['./media-player.component.css'],
  standalone: true,
  imports: [CommonModule, DropboxConnectComponent, FileBrowserComponent, PlaylistComponent, AudioPlayerComponent]
})
export class MediaPlayerComponent {
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

  constructor(private dropboxService: DropboxService) { }

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
    this.isAuthenticated = authenticated;

    if (!authenticated) {
      // Clear everything when logged out
      this.playlist = [];
      this.currentPlaylistIndex = -1;
      this.mediaUrl = '';
      this.isPlaying = false;
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

        if (!this.isPlaying && playlistItems.length > 0 && this.currentPlaylistIndex === -1) {
          this.playPlaylistItem(0);
        }

        // Notify file browser that enqueuing is complete
        if (this.fileBrowser) {
          this.fileBrowser.markFolderEnqueueComplete(folder.path_display);
        }
      },
      error => {
        console.error(`Error enqueuing files from ${folder.path_display}:`, error);
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

    // Play if playlist was empty
    if (!this.isPlaying && this.playlist.length === 1) {
      this.playPlaylistItem(0);
    }
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
  }

  /**
   * Clears the entire playlist
   */
  private clearPlaylist(): void {
    this.playlist = [];
    this.currentPlaylistIndex = -1;
    this.stopMedia();
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
  }

  /**
   * Plays media from a Dropbox file
   */
  private playMedia(file: DropboxFile): void {
    this.isLoading = true;

    console.log(`Getting temporary link for file: ${file.path_display}`);

    this.dropboxService.getTemporaryLink(file.path_display).subscribe(url => {
      console.log(`Received temporary link: ${url.substring(0, 50)}...`);
      this.mediaUrl = url;
      this.isLoading = false;
      this.isPlaying = true;
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
