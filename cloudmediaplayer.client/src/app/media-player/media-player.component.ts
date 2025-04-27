import { Component, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DropboxService, DropboxFile } from '../dropbox.service';

@Component({
  selector: 'app-media-player',
  templateUrl: './media-player.component.html',
  styleUrls: ['./media-player.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class MediaPlayerComponent implements OnInit {
  @ViewChild('mediaPlayer') mediaPlayerRef!: ElementRef;

  isPlaying = false;
  isLoading = false;
  currentPath = '';
  files: DropboxFile[] = [];
  currentFile: DropboxFile | null = null;
  mediaUrl: string = '';
  breadcrumbs: { name: string; path: string }[] = [];

  // For manual token entry
  tokenInput: string = '';
  showTokenInput = false;

  constructor(public dropboxService: DropboxService) { }

  ngOnInit(): void {
    // Load files from root if authenticated
    if (this.dropboxService.isAuthenticated()) {
      console.log('Token found, validating...');

      // First verify the token works by getting account info
      this.dropboxService.getCurrentAccount().subscribe(
        account => {
          if (account) {
            console.log('Successfully authenticated with Dropbox. Account:', account.name);
            this.loadFiles('');  // Use empty string instead of '/'
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

  // Handle manual token submission
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
    this.currentFile = null;
    this.mediaUrl = '';
    this.isPlaying = false;
    this.showTokenInput = true;
  }

  loadFiles(path: string): void {
    this.isLoading = true;
    this.currentPath = path;

    // Update breadcrumbs
    this.updateBreadcrumbs(path);

    this.dropboxService.listFolder(path).subscribe(files => {
      this.files = files;
      this.isLoading = false;
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
    } else if (this.dropboxService.isMediaFile(file.name)) {
      this.playMedia(file);
    }
  }

  playMedia(file: DropboxFile): void {
    this.isLoading = true;
    this.currentFile = file;

    this.dropboxService.getTemporaryLink(file.path_display).subscribe(url => {
      this.mediaUrl = url;
      this.isLoading = false;
      this.isPlaying = true;

      // Give time for the DOM to update
      setTimeout(() => {
        const mediaElement = this.mediaPlayerRef?.nativeElement;
        if (mediaElement) {
          mediaElement.load();
          mediaElement.play();
        }
      }, 100);
    });
  }

  stopMedia(): void {
    this.isPlaying = false;
    this.mediaUrl = '';
    this.currentFile = null;
  }

  isAuthenticated(): boolean {
    return this.dropboxService.isAuthenticated();
  }

  getFileIcon(file: DropboxFile): string {
    if (file.is_folder) {
      return 'folder';
    }

    const name = file.name.toLowerCase();
    if (name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.ogg') || name.endsWith('.m4a')) {
      return 'music_note';
    } else if (name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov') || name.endsWith('.avi')) {
      return 'movie';
    } else {
      return 'insert_drive_file';
    }
  }

  getFileType(file: DropboxFile): string {
    if (file.is_folder) {
      return 'Folder';
    }

    const name = file.name.toLowerCase();
    if (name.endsWith('.mp3') || name.endsWith('.wav') || name.endsWith('.ogg') || name.endsWith('.m4a')) {
      return 'Audio';
    } else if (name.endsWith('.mp4') || name.endsWith('.webm') || name.endsWith('.mov') || name.endsWith('.avi')) {
      return 'Video';
    } else {
      return 'File';
    }
  }

  formatFileSize(bytes?: number): string {
    if (bytes === undefined) return '';

    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}
