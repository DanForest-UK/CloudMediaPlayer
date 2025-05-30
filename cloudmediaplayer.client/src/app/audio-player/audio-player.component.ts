import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * AudioPlayerComponent - Handles the actual audio playback UI
 * 
 * This component manages:
 * - Audio element and playback controls
 * - Display of currently playing track
 * - Player control buttons (previous, next)
 */
@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  styleUrls: ['./audio-player.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class AudioPlayerComponent implements AfterViewInit, OnChanges {
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

      // Listen for when user manually stops/pauses the audio
      mediaElement.onpause = () => {
        // Only emit stop if the audio has ended or been manually stopped
        if (mediaElement.ended || mediaElement.currentTime === 0) {
          this.stopRequested.emit();
        }
      };
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    // Handle changes to mediaUrl or isPlaying
    if (changes['mediaUrl'] || changes['isPlaying']) {
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        this.handlePlaybackChange();
      }, 0);
    }
  }

  private handlePlaybackChange(): void {
    if (!this.mediaPlayerRef) {
      return;
    }

    const mediaElement = this.mediaPlayerRef.nativeElement;
    if (!mediaElement) {
      return;
    }

    // If we have a new media URL, load it
    if (this.mediaUrl) {
      mediaElement.src = this.mediaUrl;
      mediaElement.load();

      // If we should be playing, start playback after a reasonable delay
      if (this.isPlaying) {
        setTimeout(() => {
          if (this.isPlaying) {
            mediaElement.play().catch((error: any) => {
              console.error('Error starting playback:', error);
            });
          }
        }, 200);
      }
    } else if (!this.isPlaying) {
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
