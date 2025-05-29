import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SavedPlaylist } from '../playlist-service';

/**
 * Interface for playlist items with extracted metadata
 */
export interface PlaylistItem {
  file: any; // DropboxFile
  displayName: string;
}

/**
 * PlaylistComponent - Manages the playlist UI and interactions
 * 
 * This component handles:
 * - Displaying playlist items
 * - Playlist management (clear, shuffle, remove items)
 * - Visual indicators for currently playing track
 * - Playlist saving/loading via dropdown
 */
@Component({
  selector: 'app-playlist',
  templateUrl: './playlist.component.html',
  styleUrls: ['./playlist.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class PlaylistComponent {
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
  @Output() loadPlaylistRequested = new EventEmitter<string>();
  @Output() playlistSelectionChanged = new EventEmitter<string | null>();
  @Output() deletePlaylistRequested = new EventEmitter<string>();
  @Output() renamePlaylistRequested = new EventEmitter<{ id: string, name: string }>();

  showDropdown = false;
  showContextMenu = false;
  contextMenuPlaylistId: string | null = null;
  contextMenuPosition = { x: 0, y: 0 };

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

    const playlist = this.savedPlaylists.find(p => p.id === this.contextMenuPlaylistId);
    if (!playlist) return;

    const newName = prompt('Enter new playlist name:', playlist.name);
    if (newName && newName.trim() !== playlist.name) {
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
   * Get the display text for the current playlist
   */
  getCurrentPlaylistDisplay(): string {
    const songCount = this.playlist.length;
    const songText = songCount === 1 ? 'song' : 'songs';
    return `${this.currentPlaylistName} (${songCount} ${songText})`;
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
   * Checks if a playlist item is currently playing
   */
  isCurrentlyPlaying(index: number): boolean {
    return this.isPlaying && this.currentPlaylistIndex === index;
  }

  /**
   * Handle clicks outside dropdown and context menu
   */
  onDocumentClick(event: Event): void {
    // Only close if we're not clicking on the dropdown button or its contents
    const target = event.target as HTMLElement;
    if (!target.closest('.playlist-selector')) {
      this.closeDropdown();
      this.closeContextMenu();
    }
  }
}
