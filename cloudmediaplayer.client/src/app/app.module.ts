import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { MediaPlayerComponent } from './media-player/media-player.component';
import { DropboxConnectComponent } from './dropbox-connect/dropbox-connect.component';
import { FileBrowserComponent } from './file-browser/file-browser.component';
import { PlaylistComponent } from './playlist/playlist.component';
import { AudioPlayerComponent } from './audio-player/audio-player.component';

/**
 * AppModule - The main module for the application
 * 
 * Angular modules help organize the application into cohesive blocks of functionality.
 * This module imports all necessary Angular modules and components needed for our app.
 */
@NgModule({
  declarations: [], 
  imports: [
    BrowserModule,
    FormsModule,
    AppComponent,            
    MediaPlayerComponent,     
    DropboxConnectComponent, 
    FileBrowserComponent,     
    PlaylistComponent,         
    AudioPlayerComponent      
  ],
  providers: [
    provideHttpClient(withFetch()) // Provides HttpClient with fetch API
  ],
  bootstrap: [AppComponent] // This component starts when the app loads
})
export class AppModule { }
