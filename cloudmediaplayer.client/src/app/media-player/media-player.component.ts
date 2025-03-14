import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-media-player',
  templateUrl: './media-player.component.html',
  styleUrls: ['./media-player.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class MediaPlayerComponent {
  isPlaying = false;

  playMedia() {
    this.isPlaying = true;
  }
}
