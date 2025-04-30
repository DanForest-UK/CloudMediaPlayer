import { HttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MediaPlayerComponent } from './media-player/media-player.component';

/**
 * AppComponent - Root component of the application
 * 
 * This component serves as the main container for the application
 * and includes the MediaPlayerComponent
 */
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  standalone: true,
  imports: [CommonModule, MediaPlayerComponent] // Import necessary modules
})
export class AppComponent {
  title = 'cloudmediaplayer.client';

  /**
   * Constructor - Injects HttpClient for API communication
   * @param http HttpClient for making API requests
   */
  constructor(private http: HttpClient) { }
}
