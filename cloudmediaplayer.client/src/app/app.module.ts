import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AppComponent } from '@app/app.component';
import { MediaPlayerComponent } from '@features/media-player/components/media-player/media-player.component';
import { DropboxConnectComponent } from '@features/dropbox/components/dropbox-connect/dropbox-connect.component';
import { FileBrowserComponent } from '@features/dropbox/components/file-browser/file-browser.component';
import { PlaylistComponent } from '@features/playlist/components/playlist/playlist.component';
import { AudioPlayerComponent } from '@features/media-player/components/audio-player/audio-player.component';
import { AuthCallbackComponent } from '@features/dropbox/components/auth-callback/auth-callback.component';
import { NotificationComponent } from '@components/notification/notification.component';

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
    AuthCallbackComponent,
    NotificationComponent
  ],
  providers: [
    provideHttpClient(withFetch()) // Provides HttpClient with fetch API
  ],
  bootstrap: [AppComponent] // This component starts when the app loads
})
export class AppModule { }
