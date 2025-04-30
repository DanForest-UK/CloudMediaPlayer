import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { MediaPlayerComponent } from './media-player/media-player.component';

/**
 * AppModule - The main module for the application
 * 
 * Angular modules help organize the application into cohesive blocks of functionality.
 * This module imports all necessary Angular modules and components needed for our app.
 */
@NgModule({
  declarations: [], // We don't need declarations since we're using standalone components
  imports: [
    BrowserModule,
    FormsModule,
    AppComponent,        // Our root component (standalone)
    MediaPlayerComponent // Our media player component (standalone)
  ],
  providers: [
    provideHttpClient(withFetch()) // Provides HttpClient with fetch API
  ],
  bootstrap: [AppComponent] // This component starts when the app loads
})
export class AppModule { }
