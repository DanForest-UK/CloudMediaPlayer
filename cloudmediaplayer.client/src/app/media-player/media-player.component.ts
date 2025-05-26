import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DropboxService, DropboxFile } from '../dropbox.service';
import { forkJoin, of } from 'rxjs';

/**
 * MediaPlayerComponent - Main component for browsing and playing audio files from Dropbox
 * 
 * This component handles:
 * - Authentication with Dropbox via an access token
 * - Browsing Dropbox folders and files
 * - Playing audio files from Dropbox
 * - Filtering folders to show only those containing media files
 */
@Component({
  selector: 'app-media-player',
  templateUrl: './media-player.component.html',
  styleUrls: ['./media-player.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule] // Importing necessary modules for this component
})
export class MediaPlayerComponent implements OnInit {
  // Reference to the audio element in the template
  @ViewChild('mediaPlayer') mediaPlayerRef!: ElementRef;

  // State variables to track current status
  isPlaying = false;     // Whether audio is currently playing
  isLoading = false;     // Whether files are being loaded
  currentPath = '';      // Current path being displayed
  files: DropboxFile[] = []; // Array of files in the current path
  filteredFiles: DropboxFile[] = []; // Filtered array of files (after applying folder filter)
  currentFile: DropboxFile | null = null; // Currently selected file
  mediaUrl: string = ''; // URL for the current media file

  // Navigation breadcrumbs to show current location in folder structure
  breadcrumbs: { name: string; path: string }[] = [];

  // For manual access token entry
  tokenInput: string = '';
  showTokenInput = false;

  // Filter settings
  onlyShowFoldersWithAudio = true; // Default to checked
  isFilteringFolders = false; // Track when we're checking folders for media

  /**
   * Constructor - Injects the DropboxService for API communication
   * @param dropboxService Service that handles communication with Dropbox API
   */
  constructor(public dropboxService: DropboxService) { }

  /**
   * Lifecycle hook that runs when component initializes
   * Checks if user is authenticated and loads files if they are
   */
  ngOnInit(): void {
    // Check if a token exists in localStorage
    if (this.dropboxService.isAuthenticated()) {
      console.log('Token found, validating...');

      // Verify the token works by getting account info
      this.dropboxService.getCurrentAccount().subscribe(
        account => {
          if (account) {
            console.log('Successfully authenticated with Dropbox. Account:', account.name);
            this.loadFiles('');  // Load files from root folder
          } else {
            console.error('Token invalid or expired');
            this.dropboxService.logout();
            this.showTokenInput = true; // Show token input if token is invalid
          }
        }
      );
    } else {
      console.log('Not authenticated with Dropbox yet');
      this.showTokenInput = true; // Show token input if not authenticated
    }
  }

  /**
   * Handles manual token submission when user enters an access token
   */
  submitToken(): void {
    if (this.tokenInput) {
      this.dropboxService.setAccessToken(this.tokenInput);
      this.showTokenInput = false;
      this.loadFiles('/'); // Load root files after token is submitted
    }
  }

  /**
   * Logs out the user by removing the token and resetting state
   */
  logout(): void {
    this.dropboxService.logout();
    this.files = [];
    this.filteredFiles = [];
    this.currentFile = null;
    this.mediaUrl = '';
    this.isPlaying = false;
    this.showTokenInput = true;
  }

  /**
   * Handles the change event for the folder filter checkbox
   */
  onFolderFilterChange(): void {
    console.log('Folder filter changed to:', this.onlyShowFoldersWithAudio);
    this.applyFolderFilter();
  }

  /**
   * Applies the folder filter to the current file list
   */
  applyFolderFilter(): void {
    if (!this.onlyShowFoldersWithAudio) {
      // If filter is off, show all files
      this.filteredFiles = [...this.files];
      return;
    }

    // If filter is on, we need to check each folder
    this.isFilteringFolders = true;

    // Separate files from folders
    const nonFolders = this.files.filter(file => !file.is_folder);
    const folders = this.files.filter(file => file.is_folder);

    if (folders.length === 0) {
      // No folders to check
      this.filteredFiles = [...nonFolders];
      this.isFilteringFolders = false;
      return;
    }

    // Check each folder for media files
    const folderChecks = folders.map(folder =>
      this.dropboxService.containsMediaFile(folder.path_display)
    );

    forkJoin(folderChecks).subscribe({
      next: (results) => {
        const foldersWithMedia = folders.filter((folder, index) => results[index]);
        this.filteredFiles = [...nonFolders, ...foldersWithMedia];
        this.isFilteringFolders = false;
        console.log(`Filtered ${folders.length} folders down to ${foldersWithMedia.length} with media`);
      },
      error: (error) => {
        console.error('Error checking folders for media:', error);
        // On error, show all folders to avoid breaking the UI
        this.filteredFiles = [...this.files];
        this.isFilteringFolders = false;
      }
    });
  }

  /**
   * Loads files from a specific Dropbox path
   * @param path The path to load files from
   */
  loadFiles(path: string): void {
    this.isLoading = true;
    this.currentPath = path;

    // Update breadcrumbs for navigation
    this.updateBreadcrumbs(path);

    console.log(`Loading files from path: ${path}`);

    // Call the Dropbox service to get files
    this.dropboxService.listFolder(path, true).subscribe(
      files => {
        console.log(`Received ${files.length} files from Dropbox for path: ${path}`);
        // Sort files: folders first, then files alphabetically
        this.files = this.sortFiles(files);
        this.isLoading = false;

        // Apply folder filter after loading files
        this.applyFolderFilter();
      },
      error => {
        console.error('Error loading files:', error);
        this.isLoading = false;
        this.isFilteringFolders = false;
      }
    );
  }

  /**
   * Sorts files with folders first, then alphabetically by name
   * @param files Array of files to sort
   * @returns Sorted array of files
   */
  sortFiles(files: DropboxFile[]): DropboxFile[] {
    return files.sort((a, b) => {
      // If both are folders or both are files, sort alphabetically
      if (a.is_folder === b.is_folder) {
        return a.name.localeCompare(b.name);
      }
      // Otherwise, folders come first
      return a.is_folder ? -1 : 1;
    });
  }

  /**
   * Updates the breadcrumb navigation based on current path
   * @param path Current path to generate breadcrumbs for
   */
  updateBreadcrumbs(path: string): void {
    if (path === '' || path === '/') {
      this.breadcrumbs = [{ name: 'Root', path: '/' }];
      return;
    }

    // Split path into segments and create breadcrumb objects
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

  /**
   * Navigate to a specific path when user clicks a breadcrumb
   * @param path Path to navigate to
   */
  navigateTo(path: string): void {
    this.loadFiles(path);
  }

  /**
   * Opens an item (folder or file) when clicked
   * @param file The file or folder to open
   */
  openItem(file: DropboxFile): void {
    if (file.is_folder) {
      // If it's a folder, navigate into it
      this.loadFiles(file.path_display);
    } else if (this.isAudioFile(file.name)) {
      // If it's an audio file, play it
      this.playMedia(file);
    }
  }

  /**
   * Plays a media file by getting a temporary link from Dropbox
   * @param file The file to play
   */
  playMedia(file: DropboxFile): void {
    this.isLoading = true;
    this.currentFile = file;

    console.log(`Getting temporary link for file: ${file.path_display}`);

    // Get a temporary link from Dropbox to stream the file
    this.dropboxService.getTemporaryLink(file.path_display).subscribe(url => {
      console.log(`Received temporary link: ${url.substring(0, 50)}...`);
      this.mediaUrl = url;
      this.isLoading = false;
      this.isPlaying = true;

      // Give time for the DOM to update before playing
      setTimeout(() => {
        const mediaElement = this.mediaPlayerRef?.nativeElement;
        if (mediaElement) {
          mediaElement.load();
          mediaElement.play();
        }
      }, 100);
    });
  }

  /**
   * Stops playing media and resets player state
   */
  stopMedia(): void {
    this.isPlaying = false;
    this.mediaUrl = '';
    this.currentFile = null;
  }

  /**
   * Checks if the user is authenticated with Dropbox
   * @returns True if authenticated, false otherwise
   */
  isAuthenticated(): boolean {
    return this.dropboxService.isAuthenticated();
  }

  /**
   * Determines the appropriate icon for a file or folder
   * @param file The file to get an icon for
   * @returns CSS class for the icon
   */
  getFileIcon(file: DropboxFile): string {
    if (file.is_folder) {
      return 'folder-icon'; // Changed class name to avoid conflict
    }

    // For files, check if it's an audio file
    const name = file.name.toLowerCase();
    if (this.isAudioFile(name)) {
      return 'music-icon'; // Changed class name to avoid conflict
    } else {
      return 'file-icon'; // Changed class name to avoid conflict
    }
  }

  /**
   * Checks if a file is an audio file based on its extension
   * @param filename The name of the file to check
   * @returns True if it's an audio file, false otherwise
   */
  isAudioFile(filename: string): boolean {
    if (!filename) return false;

    const audioExtensions = [
      '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'
    ];

    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return audioExtensions.includes(extension);
  }

  /**
   * Gets the name of the current folder for display in the header
   * @returns The name of the current folder
   */
  getCurrentFolderName(): string {
    // If we're at the root, return "Root"
    if (this.currentPath === '' || this.currentPath === '/') {
      return 'Root';
    }

    // Otherwise, extract the folder name from the path
    const parts = this.currentPath.split('/').filter(p => p);
    return parts[parts.length - 1];
  }
}
