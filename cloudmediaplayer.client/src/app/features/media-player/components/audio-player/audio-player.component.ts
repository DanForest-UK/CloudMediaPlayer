import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * AudioPlayerComponent - Handles the actual audio playback UI
 * 
 * This component manages:
 * - Audio element and playback controls
 * - Display of currently playing track
 * - Player control buttons (previous, next)
 * - Auto-advance when songs finish
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
    // Use setTimeout to ensure the view is fully initialized
    setTimeout(() => {
      this.setupAudioEventListeners();
    }, 0);
  }

  private setupAudioEventListeners(): void {
    // Set up the audio element event listeners
    const mediaElement = this.mediaPlayerRef?.nativeElement;
    if (mediaElement) {
      // Auto-advance when song ends
      mediaElement.onended = () => {
        this.songEnded.emit();
      };

      // Handle audio loading errors
      mediaElement.onerror = (e: Event) => {
        console.error('Audio load error:', e);
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

    // Ensure event listeners are set up (in case they weren't ready before)
    this.setupAudioEventListeners();

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
