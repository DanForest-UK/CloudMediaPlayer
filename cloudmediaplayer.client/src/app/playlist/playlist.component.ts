import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

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
 */
@Component({
  selector: 'app-playlist',
  templateUrl: './playlist.component.html',
  styleUrls: ['./playlist.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class PlaylistComponent {
  @Input() playlist: PlaylistItem[] = [];
  @Input() currentPlaylistIndex: number = -1;
  @Input() isPlaying: boolean = false;

  @Output() playItemRequested = new EventEmitter<number>();
  @Output() removeItemRequested = new EventEmitter<number>();
  @Output() clearPlaylistRequested = new EventEmitter<void>();
  @Output() shufflePlaylistRequested = new EventEmitter<void>();

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
}
