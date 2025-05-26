import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, Subject, forkJoin } from 'rxjs';
import { map, catchError, scan, mergeMap, concatMap } from 'rxjs/operators';

/**
 * Interface that defines the structure of a Dropbox file or folder
 */
export interface DropboxFile {
  id: string;              // Unique identifier for the file/folder
  name: string;            // Name of the file/folder
  path_display: string;    // Full path of the file/folder
  is_folder: boolean;      // Whether this is a folder (true) or file (false)
  media_info?: {           // Optional media info (only for media files)
    metadata: {
      dimensions?: { height: number; width: number };
    };
  };
  size?: number;           // Size of the file in bytes (undefined for folders)
  client_modified?: string; // Last modification date (undefined for folders)
}

/**
 * Service that handles all communication with the Dropbox API
 */
@Injectable({
  providedIn: 'root'  // This makes the service available throughout the app
})
export class DropboxService {
  // Replace with your Dropbox app key
  private readonly CLIENT_ID = 'd2s6qo646n1vfoa';

  // Dropbox API endpoints
  private readonly API_URL = 'https://api.dropboxapi.com/2';
  private readonly CONTENT_URL = 'https://content.dropboxapi.com/2';

  // Store the access token
  private accessToken: string | null = null;

  /**
   * Constructor - Checks if a token exists in localStorage
   * @param http HttpClient for making API requests
   */
  constructor(private http: HttpClient) {
    // Check if token exists in localStorage
    this.accessToken = localStorage.getItem('dropbox_access_token');
  }

  /**
   * Manually set an access token (for development/testing)
   * @param token The access token to set
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
    localStorage.setItem('dropbox_access_token', token);
  }

  /**
   * Checks if user is authenticated with Dropbox
   * @returns True if authenticated, false otherwise
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
   * @returns Observable with account info or null if error
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
   * @param path The path to list files from (empty string for root)
   * @param mediaOnly Whether to filter and return only media files (default: false)
   * @returns Observable with array of DropboxFile objects
   */
  listFolder(path: string = '', mediaOnly: boolean = false): Observable<DropboxFile[]> {
    if (!this.isAuthenticated()) {
      return of([]);
    }

    // Dropbox API expects empty string for root, not '/'
    if (path === '/') {
      path = '';
    }

    // Create a subject to emit the complete file list
    const filesSubject = new Subject<DropboxFile[]>();

    // Helper function to list folder contents with pagination
    const getFiles = (folderPath: string, cursor?: string) => {
      let endpoint: string;
      let body: any;

      if (cursor) {
        // Continue listing with cursor if we have one
        endpoint = `${this.API_URL}/files/list_folder/continue`;
        body = { cursor };
      } else {
        // Initial request
        endpoint = `${this.API_URL}/files/list_folder`;
        body = {
          path: folderPath,
          recursive: false,
          include_media_info: true,
          include_non_downloadable_files: true
        };
      }

      const headers = new HttpHeaders({
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      });

      console.log(`Sending Dropbox API request for path: ${folderPath}${cursor ? ' with cursor' : ''}`);

      this.http.post<any>(endpoint, body, { headers }).pipe(
        catchError(error => {
          console.error('Error listing Dropbox folder:', error);
          if (error.error && error.error.error_summary) {
            console.error('Dropbox API error:', error.error.error_summary);
          }
          // Return empty result on error
          return of({ entries: [], has_more: false });
        })
      ).subscribe(response => {
        console.log('Dropbox API response:', response);

        // Process entries
        const files: DropboxFile[] = [];
        if (response.entries && Array.isArray(response.entries)) {
          response.entries.forEach((entry: any) => {
            const file: DropboxFile = {
              id: entry.id,
              name: entry.name,
              path_display: entry.path_display,
              is_folder: entry['.tag'] === 'folder',
              media_info: entry.media_info,
              size: entry.size,
              client_modified: entry.client_modified
            };

            // Apply filtering logic
            if (mediaOnly) {
              // Include folders (for navigation) and media files only
              if (file.is_folder || this.isMediaFile(file.name)) {
                files.push(file);
              }
            } else {
              // Include all files
              files.push(file);
            }
          });
        }

        // If there are more files, request the next batch
        if (response.has_more && response.cursor) {
          // First emit the current batch
          filesSubject.next(files);
          // Then get more files
          getFiles(folderPath, response.cursor);
        } else {
          // No more files, complete the observable
          filesSubject.next(files);
          filesSubject.complete();
        }
      });
    };

    // Start the first request
    getFiles(path);

    return filesSubject.asObservable().pipe(
      // Collect all emitted arrays into a single array
      scan((acc: DropboxFile[], val: DropboxFile[]) => [...acc, ...val], [] as DropboxFile[])
    );
  }

  /**
   * Recursively collects all audio files from a folder and its subfolders
   * @param path The folder path to start collecting from
   * @returns Observable with array of DropboxFile objects (audio files only)
   */
  collectAllAudioFilesRecursively(path: string): Observable<DropboxFile[]> {
    if (!this.isAuthenticated()) {
      return of([]);
    }

    const allAudioFiles: DropboxFile[] = [];
    const processedFolders = new Set<string>(); // avoid infinite loops

    const collectFromFolder = (folderPath: string): Observable<DropboxFile[]> => {
      if (processedFolders.has(folderPath)) {
        return of([]);
      }
      processedFolders.add(folderPath);

      return this.listFolder(folderPath, false).pipe(
        mergeMap((files: DropboxFile[]) => {
          const audioFiles = files.filter(file => !file.is_folder && this.isMediaFile(file.name));
          const subfolders = files.filter(file => file.is_folder);

          // If no subfolders, just return the audio files
          if (subfolders.length === 0) {
            return of(audioFiles);
          }

          // Process all subfolders and combine results
          const subfolderObservables = subfolders.map(folder =>
            collectFromFolder(folder.path_display)
          );

          // Combine current folder's audio files with all subfolder results
          return forkJoin([of(audioFiles), ...subfolderObservables]).pipe(
            map(results => {
              // Flatten all results into a single array
              const combined: DropboxFile[] = [];
              results.forEach(fileArray => {
                combined.push(...fileArray);
              });
              return combined;
            })
          );
        }),
        catchError(error => {
          console.error(`Error collecting files from ${folderPath}:`, error);
          return of([]); 
        })
      );
    };

    return collectFromFolder(path);
  }

  /**
   * Lists only media files in a given Dropbox path
   * @param path The path to list files from (empty string for root)
   * @returns Observable with array of DropboxFile objects (folders + media files only)
   */
  listMediaFiles(path: string = ''): Observable<DropboxFile[]> {
    return this.listFolder(path, true);
  }

  /**
   * Gets a temporary link to download a file
   * @param path The path of the file to get a link for
   * @returns Observable with the temporary download URL
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
   * Checks if a file is an audio file based on its extension
   * @param filename The name of the file to check
   * @returns True if it's an audio file, false otherwise
   */
  isMediaFile(filename: string): boolean {
    if (!filename) return false;

    // We only support audio files now
    const audioExtensions = [
      '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'
    ];

    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return audioExtensions.includes(extension);
  }
}
