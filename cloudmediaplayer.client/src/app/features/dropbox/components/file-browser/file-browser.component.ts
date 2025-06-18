import { Component, EventEmitter, Output, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DropboxService } from '@services/dropbox.service';
import { NotificationService } from '@services/notification.service';
import { FileUtilService } from '@services/file-util.service';
import { DropboxFile, FolderScanProgress } from '@models/index';
import { Subscription } from 'rxjs';

/**
 * FileBrowserComponent - Handles browsing Dropbox files and folders
 * 
 * - File/folder navigation with breadcrumbs
 * - File selection and folder enqueueing
 * - Progress tracking, sorting, filtering..
 */
@Component({
  selector: 'app-file-browser',
  templateUrl: './file-browser.component.html',
  styleUrls: ['./file-browser.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class FileBrowserComponent implements OnInit, OnDestroy {
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

  // Track the specific folder being scanned
  currentlyScannedFolder: string = '';

  // Progress tracking
  scanProgress: FolderScanProgress = {
    currentPath: '',
    isScanning: false,
    totalAudioFiles: 0
  };
  private progressSubscription: Subscription | null = null;

  constructor(
    private dropboxService: DropboxService,
    private notificationService: NotificationService,
    private fileUtilService: FileUtilService,
  ) { }

  ngOnInit(): void {
    this.loadFiles('');

    // Subscribe to folder scan progress
    this.progressSubscription = this.dropboxService.getFolderScanProgress().subscribe(
      progress => {
        this.scanProgress = progress;
      }
    );
  }

  ngOnDestroy(): void {
    if (this.progressSubscription) {
      this.progressSubscription.unsubscribe();
    }
  }

  /**
   * Sort files with folders first, then alphabetically
   */
  private sortFiles(files: DropboxFile[]): DropboxFile[] {
    return files.sort((a, b) => {
      if (a.is_folder === b.is_folder) {
        return a.name.localeCompare(b.name);
      }
      return a.is_folder ? -1 : 1;
    });
  }

  /**
   * Filter files to show only audio files and folders
   */
  private filterAudioFilesAndFolders(files: DropboxFile[]): DropboxFile[] {
    return files.filter(file =>
      file.is_folder || this.fileUtilService.isAudioFile(file.name)
    );
  }

  /**
   * Generate breadcrumbs from path
   */
  private generateBreadcrumbs(path: string): { name: string; path: string }[] {
    if (path === '' || path === '/') {
      return [{ name: 'Root', path: '/' }];
    }

    const parts = path.split('/').filter(p => p);
    const breadcrumbs = [{ name: 'Root', path: '/' }];

    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      currentPath += '/' + parts[i];
      breadcrumbs.push({
        name: parts[i],
        path: currentPath
      });
    }

    return breadcrumbs;
  }

  /**
   * Update breadcrumbs based on current path
   */
  private updateBreadcrumbs(path: string): void {
    this.breadcrumbs = this.generateBreadcrumbs(path);
  }

  /**
   * Extract folder name from path for display
   */
  private getDisplayNameFromPath(path: string): string {
    if (!path) return '';

    const pathParts = path.split('/').filter(p => p);
    return pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'Root';
  }

  /**
   * Get display name for scan path
   */
  getScanPathDisplayName(): string {
    return this.getDisplayNameFromPath(this.scanProgress.currentPath);
  }

  /**
   * Check if a specific folder is being scanned
   */
  isThisFolderBeingScanned(folderPath: string): boolean {
    return this.currentlyScannedFolder === folderPath && this.scanProgress.isScanning;
  }

  /**
   * Check if a folder is currently being enqueued
   */
  isFolderBeingEnqueued(folderPath: string): boolean {
    return this.enqueuingFolders.has(folderPath);
  }

  /**
   * Normalize path for consistency
   */
  private normalizePath(path: string): string {
    if (path === '/') {
      return '';
    }
    return path;
  }

  /**
   * Validate file for selection
   */
  canSelectFile(file: DropboxFile): boolean {
    return !file.is_folder && this.fileUtilService.isAudioFile(file.name);
  }

  /**
   * Validate folder for enqueueing
   */
  canEnqueueFolder(file: DropboxFile): boolean {
    return file.is_folder;
  }

  /**
   * Get file type icon
   */
  getFileIcon(file: DropboxFile): string {
    if (file.is_folder) {
      return '📁';
    } else if (this.fileUtilService.isAudioFile(file.name)) {
      return '🎵';
    } else {
      return '📄';
    }
  }

  /**
   * Get file CSS classes based on type
   */
  getFileClasses(file: DropboxFile): string[] {
    const classes: string[] = ['file-item'];

    if (file.is_folder) {
      classes.push('folder-item');
    } else if (this.fileUtilService.isAudioFile(file.name)) {
      classes.push('audio-item');
    }

    return classes;
  }

  /**
   * Check if breadcrumb is the current one
   */
  isBreadcrumbCurrent(index: number): boolean {
    return index === this.breadcrumbs.length - 1;
  }

  /**
   * Process and filter files for display
   */
  private processFilesForDisplay(files: DropboxFile[]): DropboxFile[] {
    // First filter to only show relevant files
    const filtered = this.filterAudioFilesAndFolders(files);
    // Then sort them
    return this.sortFiles(filtered);
  }

  /**
   * Loads files from a path
   */
  loadFiles(path: string): void {
    this.isLoading = true;
    this.currentPath = this.normalizePath(path);
    this.updateBreadcrumbs(path);

    this.dropboxService.listFolder(path, true).subscribe({
      next: (files) => {
        this.files = this.processFilesForDisplay(files);
        this.isLoading = false;
      },
      error: (error) => {
        this.notificationService.showError('Error loading folder contents');
        this.isLoading = false;
      }
    });
  }

  navigateTo(path: string): void {
    this.loadFiles(path);
  }

  openItem(file: DropboxFile): void {
    if (file.is_folder) {
      this.loadFiles(file.path_display);
    } else if (this.canSelectFile(file)) {
      this.fileSelected.emit(file);
    }
  }

  /**
   * Check if file is audio using service
   */
  isAudioFile(filename: string): boolean {
    return this.fileUtilService.isAudioFile(filename);
  }

  /**
   * Requests to enqueue all audio files from a folder
  */
  enqueueAllFromFolder(folder: DropboxFile, event: Event): void {
    // Prevent the folder from being opened when clicking the enqueue button
    event.stopPropagation();

    if (!this.canEnqueueFolder(folder)) {
      return;
    }

    this.enqueuingFolders.add(folder.path_display);
    this.currentlyScannedFolder = folder.path_display;
    this.folderEnqueueRequested.emit(folder);
  }

  /**
   * Marks a folder as no longer being enqueued
   * @param folderPath The path of the folder
   */
  markFolderEnqueueComplete(folderPath: string): void {
    this.enqueuingFolders.delete(folderPath);
    if (this.currentlyScannedFolder === folderPath) {
      this.currentlyScannedFolder = '';
    }
  }
}
