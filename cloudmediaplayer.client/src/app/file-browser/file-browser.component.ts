import { Component, EventEmitter, Output, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DropboxService, DropboxFile } from '../dropbox.service';

/**
 * FileBrowserComponent - Handles browsing Dropbox files and folders
 * 
 * This component manages:
 * - File/folder navigation with breadcrumbs
 * - Loading states
 * - File selection and folder enqueueing
 */
@Component({
  selector: 'app-file-browser',
  templateUrl: './file-browser.component.html',
  styleUrls: ['./file-browser.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class FileBrowserComponent implements OnInit {
  @Output() fileSelected = new EventEmitter<DropboxFile>();
  @Output() folderEnqueueRequested = new EventEmitter<DropboxFile>();

  // State variables
  isLoading = false;
  currentPath = '';
  files: DropboxFile[] = [];

  // Navigation breadcrumbs
  breadcrumbs: { name: string; path: string }[] = [];

  // Track which folders are currently being enqueued
  enqueuingFolders = new Set<string>();

  constructor(private dropboxService: DropboxService) { }

  ngOnInit(): void {
    this.loadFiles('');
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
      this.fileSelected.emit(file);
    }
  }

  /**
   * Requests to enqueue all audio files from a folder
   * @param folder The folder to enqueue all files from
   * @param event The click event
   */
  enqueueAllFromFolder(folder: DropboxFile, event: Event): void {
    // Prevent the folder from being opened when clicking the enqueue button
    event.stopPropagation();

    if (!folder.is_folder) {
      return;
    }

    this.enqueuingFolders.add(folder.path_display);
    this.folderEnqueueRequested.emit(folder);
  }

  /**
   * Marks a folder as no longer being enqueued
   * @param folderPath The path of the folder
   */
  markFolderEnqueueComplete(folderPath: string): void {
    this.enqueuingFolders.delete(folderPath);
  }

  /**
   * Checks if a folder is currently being enqueued
   * @param folderPath The path of the folder to check
   * @returns True if the folder is being enqueued, false otherwise
   */
  isFolderBeingEnqueued(folderPath: string): boolean {
    return this.enqueuingFolders.has(folderPath);
  }

  isAudioFile(filename: string): boolean {
    if (!filename) return false;

    const audioExtensions = [
      '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'
    ];

    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return audioExtensions.includes(extension);
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

  getCurrentFolderName(): string {
    if (this.currentPath === '' || this.currentPath === '/') {
      return 'Root';
    }

    const parts = this.currentPath.split('/').filter(p => p);
    return parts[parts.length - 1];
  }
}
