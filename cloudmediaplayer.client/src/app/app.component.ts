import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MediaPlayerComponent } from './media-player/media-player.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [CommonModule, MediaPlayerComponent]
})
export class AppComponent {
  title = 'cloudmediaplayer.client';

  constructor(private http: HttpClient) { }
}
