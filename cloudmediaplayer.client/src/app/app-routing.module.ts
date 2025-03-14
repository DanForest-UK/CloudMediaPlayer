import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { AppComponent } from './app.component';
import { MediaPlayerComponent } from './media-player/media-player.component';

const routes: Routes = [
  { path: 'weather', component: AppComponent },
  { path: 'media-player', component: MediaPlayerComponent },
  { path: '', redirectTo: '/media-player', pathMatch: 'full' }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
