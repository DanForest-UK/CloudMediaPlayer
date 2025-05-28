import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * AudioPlayerComponent - Handles the actual audio playback UI
 * 
 * This component manages:
 * - Audio element and playback controls
 * - Display of currently playing track
 * - Player control buttons (previous, stop, next)
 */
@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class AudioPlayerComponent {
  // Reference to the audio element in the template
  @ViewChild('mediaPlayer') mediaPlayerRef!: ElementRef;

  @Input() isPlaying: boolean = false;
  @Input() isLoading: boolean = false;
  @Input() mediaUrl: string = '';
  @Input() currentTrackName: string = '';
  @Input() canPlayPrevious: boolean = false;
  @Input() canPlayNext: boolean = false;

  @Output() stopRequested = new EventEmitter<void>();
  @Output() previousRequested = new EventEmitter<void>();
  @Output() nextRequested = new EventEmitter<void>();
  @Output() songEnded = new EventEmitter<void>();

  ngAfterViewInit(): void {
    // Set up the audio element event listener for when song ends
    const mediaElement = this.mediaPlayerRef?.nativeElement;
    if (mediaElement) {
      mediaElement.onended = () => {
        this.songEnded.emit();
      };
    }
  }

  ngOnChanges(): void {
    // When mediaUrl changes, load and play the new audio
    if (this.mediaUrl && this.mediaPlayerRef) {
      setTimeout(() => {
        const mediaElement = this.mediaPlayerRef.nativeElement;
        if (mediaElement) {
          mediaElement.load();
          if (this.isPlaying) {
            mediaElement.play();
          }
        }
      }, 100);
    }
  }

  stop(): void {
    this.stopRequested.emit();

    const mediaElement = this.mediaPlayerRef?.nativeElement;
    if (mediaElement) {
      mediaElement.pause();
      mediaElement.currentTime = 0;
    }
  }

  playPrevious(): void {
    this.previousRequested.emit();
  }

  playNext(): void {
    this.nextRequested.emit();
  }
}
