import { HttpClientModule } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MediaPlayerComponent } from './media-player/media-player.component';

@NgModule({
  declarations: [],  // AppComponent removed from declarations
  imports: [
    BrowserModule,
    HttpClientModule,
    AppRoutingModule,
    AppComponent,  // AppComponent added to imports
    MediaPlayerComponent
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
