import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MediaPlayerComponent } from './features/media-player/components/media-player/media-player.component';
import { AuthCallbackComponent } from './auth-callback/auth-callback.component';

/**
 * Routes configuration for the application with OAuth callback support
 * 
 * The callback route is used in production for better UX
 * In development, OAuth callbacks are handled on the main page
 */
const routes: Routes = [
  {
    path: 'media-player',
    component: MediaPlayerComponent
  },
  {
    path: 'auth/callback',
    component: AuthCallbackComponent
  },
  {
    path: '',
    redirectTo: '/media-player',
    pathMatch: 'full'
  },
  {
    path: '**',
    redirectTo: '/media-player'
  }
];

/**
 * AppRoutingModule - Handles the application's routing
 */
@NgModule({
  imports: [RouterModule.forRoot(routes, {
    // Enable tracing for debugging (remove in production)
    enableTracing: false
  })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
