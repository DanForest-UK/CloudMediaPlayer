import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DropboxService, DropboxFile } from '../dropbox.service';

/**
 * Interface for playlist items with extracted metadata
 */
export interface PlaylistItem {
  file: DropboxFile;
  displayName: string;
}

/**
 * MediaPlayerComponent - Main component for browsing and playing audio files from Dropbox
 * 
 * This component handles:
 * - Authentication with Dropbox via an access token
 * - Browsing Dropbox folders and files in a left panel
 * - Managing a playlist in a right panel
 * - Playing audio files with automatic progression through playlist
 * - Enqueuing all audio files from a folder recursively
 */
@Component({
  selector: 'app-media-player',
  templateUrl: './media-player.component.html',
  styleUrls: ['./media-player.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class MediaPlayerComponent implements OnInit {
  // Reference to the audio element in the template
  @ViewChild('mediaPlayer') mediaPlayerRef!: ElementRef;

  // State variables to track current status
  isPlaying = false;
  isLoading = false;
  currentPath = '';
  files: DropboxFile[] = [];

  // Playlist management
  playlist: PlaylistItem[] = [];
  currentPlaylistIndex = -1;

  mediaUrl: string = '';

  // Navigation breadcrumbs
  breadcrumbs: { name: string; path: string }[] = [];

  // For manual access token entry
  tokenInput: string = '';
  showTokenInput = false;

  // Track which folders are currently being enqueued
  enqueuingFolders = new Set<string>();

  constructor(public dropboxService: DropboxService) { }

  /**
   * Get current playlist item by index
   */
  get currentPlaylistItem(): PlaylistItem | null {
    if (this.currentPlaylistIndex >= 0 && this.currentPlaylistIndex < this.playlist.length) {
      return this.playlist[this.currentPlaylistIndex];
    }
    return null;
  }

  ngOnInit(): void {
    if (this.dropboxService.isAuthenticated()) {
      console.log('Token found, validating...');
      this.dropboxService.getCurrentAccount().subscribe(
        account => {
          if (account) {
            console.log('Successfully authenticated with Dropbox. Account:', account.name);
            this.loadFiles('');
          } else {
            console.error('Token invalid or expired');
            this.dropboxService.logout();
            this.showTokenInput = true;
          }
        }
      );
    } else {
      console.log('Not authenticated with Dropbox yet');
      this.showTokenInput = true;
    }
  }

  submitToken(): void {
    if (this.tokenInput) {
      this.dropboxService.setAccessToken(this.tokenInput);
      this.showTokenInput = false;
      this.loadFiles('/');
    }
  }

  logout(): void {
    this.dropboxService.logout();
    this.files = [];
    this.playlist = [];
    this.currentPlaylistIndex = -1;
    this.mediaUrl = '';
    this.isPlaying = false;
    this.showTokenInput = true;
    this.enqueuingFolders.clear();
  }

  loadFiles(path: string): void {
    this.isLoading = true;
    this.currentPath = path;
    this.updateBreadcrumbs(path);

    console.log(`Loading files from path: ${path}`);

    this.dropboxService.listFolder(path, true).subscribe(
      files => {
        console.log(`Received ${files.length} files from Dropbox for path: ${path}`);
        this.files = this.sortFiles(files);
        this.isLoading = false;
      },
      error => {
        console.error('Error loading files:', error);
        this.isLoading = false;
      }
    );
  }

  sortFiles(files: DropboxFile[]): DropboxFile[] {
    return files.sort((a, b) => {
      if (a.is_folder === b.is_folder) {
        return a.name.localeCompare(b.name);
      }
      return a.is_folder ? -1 : 1;
    });
  }

  updateBreadcrumbs(path: string): void {
    if (path === '' || path === '/') {
      this.breadcrumbs = [{ name: 'Root', path: '/' }];
      return;
    }

    const parts = path.split('/').filter(p => p);
    this.breadcrumbs = [{ name: 'Root', path: '/' }];

    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      currentPath += '/' + parts[i];
      this.breadcrumbs.push({
        name: parts[i],
        path: currentPath
      });
    }
  }

  navigateTo(path: string): void {
    this.loadFiles(path);
  }

  openItem(file: DropboxFile): void {
    if (file.is_folder) {
      this.loadFiles(file.path_display);
    } else if (this.isAudioFile(file.name)) {
      this.addToPlaylist(file);
    }
  }

  /**
   * Enqueues all audio files from a folder and its subfolders recursively
   * @param folder The folder to enqueue all files from
   */
  enqueueAllFromFolder(folder: DropboxFile, event: Event): void {
    // Prevent the folder from being opened when clicking the enqueue button
    event.stopPropagation();

    if (!folder.is_folder) {
      return;
    }

    this.enqueuingFolders.add(folder.path_display);

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

        this.enqueuingFolders.delete(folder.path_display);
      },
      error => {
        console.error(`Error enqueuing files from ${folder.path_display}:`, error);
        this.enqueuingFolders.delete(folder.path_display);
      }
    );
  }

  /**
   * Checks if a folder is currently being enqueued
   * @param folderPath The path of the folder to check
   * @returns True if the folder is being enqueued, false otherwise
   */
  isFolderBeingEnqueued(folderPath: string): boolean {
    return this.enqueuingFolders.has(folderPath);
  }

  /**
   * Adds a song to the playlist 
   */
  addToPlaylist(file: DropboxFile): void {
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
   * Plays a specific item from the playlist
   */
  playPlaylistItem(index: number): void {
    if (index < 0 || index >= this.playlist.length) {
      return;
    }

    this.currentPlaylistIndex = index;
    this.playMedia(this.currentPlaylistItem!.file);
  }

  /**
   * Plays the next song in the playlist
   */
  playNext(): void {
    if (this.currentPlaylistIndex < this.playlist.length - 1) {
      this.playPlaylistItem(this.currentPlaylistIndex + 1);
    } else {
      this.stopMedia();
    }
  }

  /**
   * Plays the previous song in the playlist
   */
  playPrevious(): void {
    if (this.currentPlaylistIndex > 0) {
      this.playPlaylistItem(this.currentPlaylistIndex - 1);
    }
  }

  /**
   * Removes an item from the playlist
   */
  removeFromPlaylist(index: number): void {
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
  clearPlaylist(): void {
    this.playlist = [];
    this.currentPlaylistIndex = -1;
    this.stopMedia();
  }

  /**
   * Shuffles the playlist 
   */
  shufflePlaylist(): void {
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

  playMedia(file: DropboxFile): void {
    this.isLoading = true;

    console.log(`Getting temporary link for file: ${file.path_display}`);

    this.dropboxService.getTemporaryLink(file.path_display).subscribe(url => {
      console.log(`Received temporary link: ${url.substring(0, 50)}...`);
      this.mediaUrl = url;
      this.isLoading = false;
      this.isPlaying = true;

      setTimeout(() => {
        const mediaElement = this.mediaPlayerRef?.nativeElement;
        if (mediaElement) {
          mediaElement.load();
          mediaElement.play();

          // Add event listener for when song ends
          mediaElement.onended = () => {
            this.onSongEnded();
          };
        }
      }, 100);
    });
  }

  /**
   * Called when the current song ends
   */
  onSongEnded(): void {
    this.playNext();
  }

  stopMedia(): void {
    this.isPlaying = false;
    this.mediaUrl = '';

    const mediaElement = this.mediaPlayerRef?.nativeElement;
    if (mediaElement) {
      mediaElement.pause();
      mediaElement.currentTime = 0;
    }
  }

  isAuthenticated(): boolean {
    return this.dropboxService.isAuthenticated();
  }

  getFileIcon(file: DropboxFile): string {
    if (file.is_folder) {
      return 'folder-icon';
    }

    const name = file.name.toLowerCase();
    if (this.isAudioFile(name)) {
      return 'music-icon';
    } else {
      return 'file-icon';
    }
  }

  isAudioFile(filename: string): boolean {
    if (!filename) return false;

    const audioExtensions = [
      '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'
    ];

    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return audioExtensions.includes(extension);
  }

  getCurrentFolderName(): string {
    if (this.currentPath === '' || this.currentPath === '/') {
      return 'Root';
    }

    const parts = this.currentPath.split('/').filter(p => p);
    return parts[parts.length - 1];
  }

  /**
   * Checks if a playlist item is currently playing
   */
  isCurrentlyPlaying(index: number): boolean {
    return this.isPlaying && this.currentPlaylistIndex === index;
  }
}
