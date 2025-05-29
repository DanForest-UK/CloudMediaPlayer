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
import { AuthCallbackComponent } from './auth-callback/auth-callback.component'; // Add this

/**
 * AppModule - The main module for the application
 * */
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
    AudioPlayerComponent,
    AuthCallbackComponent    
  ],
  providers: [
    provideHttpClient(withFetch()) // Provides HttpClient with fetch API
  ],
  bootstrap: [AppComponent] // This component starts when the app loads
})
export class AppModule { }
