import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { MediaPlayerComponent } from './media-player/media-player.component';

/**
 * Routes configuration for the application
 * 
 * This defines the URL paths and which component should be displayed
 * for each path. In our simplified app, we're just redirecting everything
 * to the media player component.
 */
const routes: Routes = [
  { path: 'media-player', component: MediaPlayerComponent },
  { path: '', redirectTo: '/media-player', pathMatch: 'full' }
];

/**
 * AppRoutingModule - Handles the application's routing
 * 
 * This module configures the routes for the application
 * and provides the RouterModule to the AppModule.
 */
@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
