import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { AppComponent } from './app/app.component';

/**
 * This is the main entry point for the Angular application.
 * 
 * bootstrapApplication is used to start the application with the AppComponent
 * as the root component. We also provide HttpClient with the fetch API
 * so we can make API calls to Dropbox.
 */
bootstrapApplication(AppComponent, {
  providers: [
    provideHttpClient(withFetch())  // Provides HttpClient with fetch API for making HTTP requests
  ]
}).catch(err => console.error(err));  // Log any errors that occur during bootstrap
