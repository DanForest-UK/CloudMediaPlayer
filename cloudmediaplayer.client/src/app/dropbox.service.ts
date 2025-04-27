import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

export interface DropboxFile {
  id: string;
  name: string;
  path_display: string;
  is_folder: boolean;
  media_info?: {
    metadata: {
      dimensions?: { height: number; width: number };
    };
  };
  size?: number;
  client_modified?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DropboxService {
  // Replace with your Dropbox app key
  private readonly CLIENT_ID = 'd2s6qo646n1vfoa';

  // Dropbox API endpoints
  private readonly API_URL = 'https://api.dropboxapi.com/2';
  private readonly CONTENT_URL = 'https://content.dropboxapi.com/2';

  private accessToken: string | null = null;

  constructor(private http: HttpClient) {
    // Check if token exists in localStorage
    this.accessToken = localStorage.getItem('dropbox_access_token');
  }

  /**
   * Manually set an access token (for development/testing)
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
    localStorage.setItem('dropbox_access_token', token);
  }

  /**
   * Checks if user is authenticated with Dropbox
   */
  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  /**
   * Logs out the user by removing the token
   */
  logout(): void {
    this.accessToken = null;
    localStorage.removeItem('dropbox_access_token');
  }

  /**
   * Gets the current user's account information
   * This is useful for testing if the token is valid
   */
  getCurrentAccount(): Observable<any> {
    if (!this.isAuthenticated()) {
      return of(null);
    }

    const endpoint = `${this.API_URL}/users/get_current_account`;
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    });

    return this.http.post<any>(endpoint, null, { headers }).pipe(
      catchError(error => {
        console.error('Error getting current account:', error);
        if (error.error && error.error.error_summary) {
          console.error('Dropbox API error:', error.error.error_summary);
        }
        return of(null);
      })
    );
  }

  /**
   * Lists files and folders in a given Dropbox path
   */
  listFolder(path: string = ''): Observable<DropboxFile[]> {
    if (!this.isAuthenticated()) {
      return of([]);
    }

    const endpoint = `${this.API_URL}/files/list_folder`;
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    });

    // Dropbox API expects empty string for root, not '/'
    if (path === '/') {
      path = '';
    }

    const body = {
      path: path,
      recursive: false,
      include_media_info: true,
      include_non_downloadable_files: true
    };

    console.log('Sending Dropbox API request with path:', path);

    return this.http.post<any>(endpoint, body, { headers }).pipe(
      map(response => {
        console.log('Dropbox API response:', response);
        if (response.entries && Array.isArray(response.entries)) {
          return response.entries.map((entry: any) => ({
            id: entry.id,
            name: entry.name,
            path_display: entry.path_display,
            is_folder: entry['.tag'] === 'folder',
            media_info: entry.media_info,
            size: entry.size,
            client_modified: entry.client_modified
          }));
        }
        return [];
      }),
      catchError(error => {
        console.error('Error listing Dropbox folder:', error);
        if (error.error && error.error.error_summary) {
          console.error('Dropbox API error:', error.error.error_summary);
        }
        return of([]);
      })
    );
  }

  /**
   * Gets a temporary link to download a file
   */
  getTemporaryLink(path: string): Observable<string> {
    if (!this.isAuthenticated()) {
      return of('');
    }

    const endpoint = `${this.API_URL}/files/get_temporary_link`;
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    });
    const body = { path };

    return this.http.post<any>(endpoint, body, { headers }).pipe(
      map(response => response.link),
      catchError(error => {
        console.error('Error getting temporary link:', error);
        if (error.error && error.error.error_summary) {
          console.error('Dropbox API error:', error.error.error_summary);
        }
        return of('');
      })
    );
  }

  /**
   * Checks if a file is a media file based on its extension
   */
  isMediaFile(filename: string): boolean {
    if (!filename) return false;

    const mediaExtensions = [
      // Audio
      '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac',
      // Video
      '.mp4', '.webm', '.ogv', '.mov', '.mkv', '.avi'
    ];

    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return mediaExtensions.includes(extension);
  }
}
