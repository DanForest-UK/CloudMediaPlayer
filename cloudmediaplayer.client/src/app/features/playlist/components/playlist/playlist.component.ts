import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { PlaylistService } from '@services/playlist.service';
import { PlaylistItem, SavedPlaylist, SyncStatus, SyncSettings } from '@models/index';

/**
 * PlaylistComponent - Manages the playlist UI and interactions
 * 
 * This component handles:
 * - Displaying playlist items
 * - Playlist management (clear, shuffle, remove items)
 * - Visual indicators for currently playing track
 * - Playlist saving/loading via dropdown with Dropbox sync
 * - Configurable sync settings
 */
@Component({
  selector: 'app-playlist',
  templateUrl: './playlist.component.html',
  styleUrls: ['./playlist.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class PlaylistComponent implements OnInit, OnDestroy {
  @Input() playlist: PlaylistItem[] = [];
  @Input() currentPlaylistIndex: number = -1;
  @Input() isPlaying: boolean = false;
  @Input() savedPlaylists: SavedPlaylist[] = [];
  @Input() currentPlaylistId: string | null = null;
  @Input() currentPlaylistName: string = 'New Playlist';

  @Output() playItemRequested = new EventEmitter<number>();
  @Output() removeItemRequested = new EventEmitter<number>();
  @Output() clearPlaylistRequested = new EventEmitter<void>();
  @Output() shufflePlaylistRequested = new EventEmitter<void>();
  @Output() savePlaylistRequested = new EventEmitter<void>();
  @Output() savePlaylistAsRequested = new EventEmitter<void>();
  @Output() loadPlaylistRequested = new EventEmitter<string>();
  @Output() playlistSelectionChanged = new EventEmitter<string | null>();
  @Output() deletePlaylistRequested = new EventEmitter<string>();
  @Output() renamePlaylistRequested = new EventEmitter<{ id: string, name: string }>();
  @Output() forceSyncRequested = new EventEmitter<string>();

  showDropdown = false;
  showContextMenu = false;
  contextMenuPlaylistId: string | null = null;
  contextMenuPosition = { x: 0, y: 0 };

  // Sync status
  syncStatus: SyncStatus = {
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSync: null,
    pendingUploads: 0,
    error: null
  };

  // Sync settings
  syncSettings: SyncSettings = {
    enabled: true,
    autoSync: true
  };

  private syncStatusSubscription?: Subscription;
  private syncSettingsSubscription?: Subscription;

  constructor(private playlistService: PlaylistService) { }

  ngOnInit(): void {
    // Subscribe to sync status
    this.syncStatusSubscription = this.playlistService.getSyncStatus().subscribe({
      next: status => this.syncStatus = status,
      error: error => console.error('Error loading sync status:', error)
    });

    // Subscribe to sync settings
    this.syncSettingsSubscription = this.playlistService.getSyncSettings().subscribe({
      next: settings => this.syncSettings = settings,
      error: error => console.error('Error loading sync settings:', error)
    });
  }

  ngOnDestroy(): void {
    this.syncStatusSubscription?.unsubscribe();
    this.syncSettingsSubscription?.unsubscribe();
  }

  /**
   * Check if a playlist item is currently playing
   */
  isCurrentlyPlaying(index: number): boolean {
    return index === this.currentPlaylistIndex && this.isPlaying;
  }

  /**
   * Check if dropdown should show save options
   */
  canSavePlaylist(): boolean {
    return this.playlist.length > 0;
  }

  /**
   * Check if playlist controls should be enabled
   */
  canManagePlaylist(): boolean {
    return this.playlist.length > 0;
  }

  /**
   * Check if an element is part of playlist selector
   */
  isPlaylistSelectorElement(element: HTMLElement): boolean {
    return !!element.closest('.playlist-selector');
  }

  /**
   * Find playlist by ID
   */
  findPlaylistById(id: string): SavedPlaylist | null {
    return this.savedPlaylists.find(p => p.id === id) || null;
  }

  /**
   * Toggle sync enabled setting
   */
  toggleSyncEnabled(): void {
    this.playlistService.updateSyncSettings({
      enabled: !this.syncSettings.enabled
    });
  }

  /**
   * Toggle the playlist dropdown
   */
  toggleDropdown(event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.showDropdown = !this.showDropdown;
    if (this.showDropdown) {
      this.showContextMenu = false;
    }
  }

  /**
   * Close the dropdown
   */
  closeDropdown(): void {
    this.showDropdown = false;
  }

  /**
   * Handle playlist selection from dropdown
   */
  selectPlaylist(playlistId: string | null): void {
    this.playlistSelectionChanged.emit(playlistId);
    this.closeDropdown();
  }

  /**
   * Save the current playlist
   */
  savePlaylist(): void {
    this.savePlaylistRequested.emit();
    this.closeDropdown();
  }

  /**
   * Save the current playlist as new
   */
  savePlaylistAs(): void {
    this.savePlaylistAsRequested.emit();
    this.closeDropdown();
  }

  /**
   * Show context menu for playlist options
   */
  showPlaylistContextMenu(event: MouseEvent, playlistId: string): void {
    event.preventDefault();
    event.stopPropagation();

    this.contextMenuPlaylistId = playlistId;
    this.contextMenuPosition = { x: event.clientX, y: event.clientY };
    this.showContextMenu = true;
    this.showDropdown = false;
  }

  /**
   * Close context menu
   */
  closeContextMenu(): void {
    this.showContextMenu = false;
    this.contextMenuPlaylistId = null;
  }

  /**
   * Rename a playlist
   */
  renamePlaylist(): void {
    if (!this.contextMenuPlaylistId) return;

    const playlist = this.findPlaylistById(this.contextMenuPlaylistId);
    if (!playlist) return;

    const newName = prompt('Enter new playlist name:', playlist.name);
    if (newName && newName.trim() !== playlist.name) {
      // Simple validation inline
      if (!newName.trim()) {
        alert('Playlist name cannot be empty');
        return;
      }

      if (newName.trim().length > 255) {
        alert('Playlist name is too long');
        return;
      }

      this.renamePlaylistRequested.emit({
        id: this.contextMenuPlaylistId,
        name: newName.trim()
      });
    }

    this.closeContextMenu();
  }

  /**
   * Delete a playlist
   */
  deletePlaylist(): void {
    if (!this.contextMenuPlaylistId) return;

    this.deletePlaylistRequested.emit(this.contextMenuPlaylistId);
    this.closeContextMenu();
  }

  /**
   * Force sync a playlist
   */
  forceSyncPlaylist(): void {
    if (!this.contextMenuPlaylistId) return;

    this.forceSyncRequested.emit(this.contextMenuPlaylistId);
    this.closeContextMenu();
  }

  /**
   * Requests to play a specific playlist item
   */
  playPlaylistItem(index: number): void {
    this.playItemRequested.emit(index);
  }

  /**
   * Requests to remove an item from the playlist
   */
  removeFromPlaylist(index: number, event: Event): void {
    event.stopPropagation();
    this.removeItemRequested.emit(index);
  }

  /**
   * Requests to clear the entire playlist
   */
  clearPlaylist(): void {
    this.clearPlaylistRequested.emit();
  }

  /**
   * Requests to shuffle the playlist
   */
  shufflePlaylist(): void {
    this.shufflePlaylistRequested.emit();
  }

  /**
   * Handle clicks outside dropdown and context menu
   */
  onDocumentClick(event: Event): void {
    // Only close if we're not clicking on the dropdown button or its contents
    const target = event.target as HTMLElement;
    if (!this.isPlaylistSelectorElement(target)) {
      this.closeDropdown();
      this.closeContextMenu();
    }
  }
}
