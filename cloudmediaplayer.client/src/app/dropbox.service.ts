import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, Subject, forkJoin, from, EMPTY, BehaviorSubject, throwError } from 'rxjs';
import { map, catchError, scan, mergeMap, concatMap, delay, retryWhen, take, tap, takeLast, finalize } from 'rxjs/operators';

/**
 * Interface for Dropbox user information
 */
export interface DropboxUser {
  account_id: string;
  name?: {
    given_name?: string;
    surname?: string;
    familiar_name?: string;
    display_name?: string;
    abbreviated_name?: string;
  };
  email?: string;
  email_verified?: boolean;
  disabled?: boolean;
  locale?: string;
  referral_link?: string;
  is_paired?: boolean;
  account_type?: {
    '.tag': string;
  };
  root_info?: {
    '.tag': string;
    root_namespace_id?: string;
    home_namespace_id?: string;
  };
  profile_photo_url?: string;
  country?: string;
}

/**
 * Interface for authentication state
 */
export interface AuthState {
  isAuthenticated: boolean;
  userInfo: DropboxUser | null;
  tokenExpiry: Date | null;
  error: string | null;
}

/**
 * Interface for progress updates during folder scanning
 */
export interface FolderScanProgress {
  currentPath: string;
  isScanning: boolean;
  totalAudioFiles: number;
}

/**
 * Interface that defines the structure of a Dropbox file or folder
 */
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
  server_modified?: string;
  rev?: string; // revision identifier
}

/**
 * Enhanced service that handles all communication with the Dropbox API
 * OAuth 2.0 authentication with PKCE and file operations
 */
@Injectable({
  providedIn: 'root'
})
export class DropboxService {
  // Replace with your Dropbox app key
  private readonly CLIENT_ID = 'd2s6qo646n1vfoa';

  // Dropbox API endpoints
  private readonly API_URL = 'https://api.dropboxapi.com/2';
  private readonly CONTENT_URL = 'https://content.dropboxapi.com/2';

  // App folder paths
  private readonly PLAYLISTS_FOLDER = '/playlists';

  // Authentication state
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private tokenExpiry: Date | null = null;

  // Observable auth state
  private authState$ = new BehaviorSubject<AuthState>({
    isAuthenticated: false,
    userInfo: null,
    tokenExpiry: null,
    error: null
  });

  // Rate limiting properties
  private readonly MAX_CONCURRENT_REQUESTS = 5;
  private readonly REQUEST_DELAY = 50;
  private activeRequests = 0;

  // Progress tracking
  private folderScanProgress$ = new BehaviorSubject<FolderScanProgress>({
    currentPath: '',
    isScanning: false,
    totalAudioFiles: 0
  });

  constructor(private http: HttpClient) {
    this.initializeAuth();
  }

  /**
   * Redirect URI selection based on environment
   */
  private get redirectUri(): string {
    const hostname = window.location.hostname;
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isProduction = !isLocalhost && window.location.protocol === 'https:';

    if (isProduction) {
      return `${window.location.origin}/auth/callback`;
    } else {
      return `${window.location.origin}/`;
    }
  }

  /**
   * Check if we should use callback route based on environment
   */
  get shouldUseCallbackRoute(): boolean {
    return this.redirectUri.includes('/auth/callback');
  }

  /**
   * Get current authentication state as observable
   */
  getAuthState(): Observable<AuthState> {
    return this.authState$.asObservable();
  }

  /**
   * Initialize authentication from stored tokens
   */
  private async initializeAuth(): Promise<void> {
    try {
      const storedAuth = this.getStoredAuth();
      if (storedAuth) {
        this.accessToken = storedAuth.accessToken;
        this.refreshToken = storedAuth.refreshToken;
        this.tokenExpiry = storedAuth.tokenExpiry;

        if (this.isTokenExpired()) {
          if (this.refreshToken) {
            await this.refreshAccessToken();
          } else {
            this.clearAuth();
          }
        } else {
          this.validateToken();
        }
      } else {
        // Legacy: Check for old-style token
        const legacyToken = localStorage.getItem('dropbox_access_token');
        if (legacyToken) {
          this.accessToken = legacyToken;
          await this.validateToken();
        }
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      this.clearAuth();
    }
  }

  /**
   * Start OAuth flow with PKCE
   */
  async startOAuthFlow(): Promise<void> {
    try {
      const codeVerifier = this.generateCodeVerifier();
      const codeChallenge = await this.generateCodeChallenge(codeVerifier);

      sessionStorage.setItem('pkce_code_verifier', codeVerifier);

      if (this.shouldUseCallbackRoute) {
        sessionStorage.setItem('oauth_return_url', window.location.pathname + window.location.search);
      }

      const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', this.CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', this.redirectUri);
      authUrl.searchParams.set('code_challenge', codeChallenge);
      authUrl.searchParams.set('code_challenge_method', 'S256');
      authUrl.searchParams.set('scope', 'account_info.read files.metadata.read files.content.read files.content.write');
      authUrl.searchParams.set('state', this.generateState());

      window.location.href = authUrl.toString();
    } catch (error) {
      this.updateAuthState({ error: 'Failed to start OAuth flow' });
    }
  }

  /**
   * Handle OAuth callback with authorization code
   */
  async handleOAuthCallback(code: string, state?: string): Promise<boolean> {
    try {
      const codeVerifier = sessionStorage.getItem('pkce_code_verifier');
      if (!codeVerifier) {
        throw new Error('PKCE code verifier not found');
      }

      if (state) {
        const storedState = sessionStorage.getItem('oauth_state');
        if (storedState && storedState !== state) {
          throw new Error('Invalid state parameter');
        }
      }

      const tokenResponse = await this.exchangeCodeForTokens(code, codeVerifier);

      if (tokenResponse) {
        this.accessToken = tokenResponse.access_token;
        this.refreshToken = tokenResponse.refresh_token;
        this.tokenExpiry = new Date(Date.now() + (tokenResponse.expires_in * 1000));

        this.storeAuth();

        // Use direct fetch to bypass proxy issues
        try {
          const userInfo = await this.validateTokenWithDirectFetch();
          if (userInfo) {
            this.updateAuthState({
              isAuthenticated: true,
              userInfo,
              tokenExpiry: this.tokenExpiry,
              error: null
            });

            // Initialize playlists folder
            await this.initializePlaylistsFolder();
          } else {
            this.updateAuthState({ error: 'Token validation failed' });
          }
        } catch (error) {
          this.updateAuthState({ error: 'Token validation failed: ' + (error as Error).message });
        }

        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('oauth_state');

        return true;
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
      this.updateAuthState({ error: 'Authentication failed: ' + (error as Error).message });
    }

    return false;
  }

  /**
   * Get the return URL after OAuth (for callback route)
   */
  getOAuthReturnUrl(): string {
    const returnUrl = sessionStorage.getItem('oauth_return_url');
    sessionStorage.removeItem('oauth_return_url');
    return returnUrl || '/';
  }

  /**
   * Refresh access token using refresh token
   */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) {
      return false;
    }

    try {
      const response = await fetch('https://api.dropbox.com/oauth2/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken,
          client_id: this.CLIENT_ID
        })
      });

      if (response.ok) {
        const tokenData = await response.json();
        this.accessToken = tokenData.access_token;
        this.tokenExpiry = new Date(Date.now() + (tokenData.expires_in * 1000));

        this.storeAuth();
        await this.validateToken();
        return true;
      }
    } catch (error) {
      console.error('Token refresh failed:', error);
    }

    this.clearAuth();
    return false;
  }

  /**
   * Validate token using direct fetch (bypasses Angular HttpClient proxy issues)
   */
  private async validateTokenWithDirectFetch(): Promise<any> {
    if (!this.accessToken) {
      throw new Error('No access token available');
    }

    const response = await fetch('https://api.dropboxapi.com/2/users/get_current_account', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: 'null'
    });

    if (response.ok) {
      const data = await response.json();
      return data;
    } else {
      const errorText = await response.text();
      throw new Error(`API validation failed: ${response.status}`);
    }
  }

  /**
   * Validate current token and get user info
   */
  private async validateToken(): Promise<void> {
    if (!this.accessToken) {
      this.clearAuth();
      return;
    }

    try {
      const userInfo = await this.validateTokenWithDirectFetch();
      if (userInfo) {
        this.updateAuthState({
          isAuthenticated: true,
          userInfo,
          tokenExpiry: this.tokenExpiry,
          error: null
        });

        // Initialize playlists folder
        await this.initializePlaylistsFolder();
      } else {
        this.clearAuth();
      }
    } catch (error) {
      console.error('Token validation failed:', error);
      this.clearAuth();
    }
  }

  /**
   * Initialize the playlists folder in Dropbox App folder
   */
  private async initializePlaylistsFolder(): Promise<void> {
    try {
      // Create playlists folder if it doesn't exist
      await this.createFolder(this.PLAYLISTS_FOLDER);
    } catch (error) {
      // Folder might already exist, that's fine
      console.log('Playlists folder initialization:', error);
    }
  }

  /**
   * Checks if user is authenticated with Dropbox
   */
  isAuthenticated(): boolean {
    return !!this.accessToken && !this.isTokenExpired();
  }

  /**
   * Logs out the user by removing all auth data
   */
  logout(): void {
    this.clearAuth();
  }

  /**
  * PKCE and security helper methods
  */
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  private generateState(): string {
    const state = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('oauth_state', state);
    return state;
  }

  private async exchangeCodeForTokens(code: string, codeVerifier: string): Promise<any> {
    const response = await fetch('https://api.dropbox.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: this.CLIENT_ID,
        redirect_uri: this.redirectUri,
        code_verifier: codeVerifier
      })
    });

    return response.ok ? response.json() : null;
  }

  /**
   * Token management
   */
  private isTokenExpired(): boolean {
    if (!this.tokenExpiry) return false;
    return new Date() >= this.tokenExpiry;
  }

  private storeAuth(): void {
    const authData = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiry: this.tokenExpiry?.toISOString()
    };

    localStorage.setItem('dropbox_auth', JSON.stringify(authData));
  }

  private getStoredAuth(): any {
    try {
      const stored = localStorage.getItem('dropbox_auth');
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          tokenExpiry: parsed.tokenExpiry ? new Date(parsed.tokenExpiry) : null
        };
      }
    } catch (error) {
      console.error('Error reading stored auth:', error);
    }
    return null;
  }

  private clearAuth(): void {
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;

    localStorage.removeItem('dropbox_auth');
    localStorage.removeItem('dropbox_access_token');

    this.updateAuthState({
      isAuthenticated: false,
      userInfo: null,
      tokenExpiry: null,
      error: null
    });
  }

  private updateAuthState(state: Partial<AuthState>): void {
    const currentState = this.authState$.value;
    this.authState$.next({ ...currentState, ...state });
  }

  /**
   * Get the current folder scan progress as an observable
   */
  getFolderScanProgress(): Observable<FolderScanProgress> {
    return this.folderScanProgress$.asObservable();
  }

  /**
   * Update the folder scan progress
   */
  private updateScanProgress(currentPath: string, isScanning: boolean, totalAudioFiles: number = 0): void {
    this.folderScanProgress$.next({
      currentPath,
      isScanning,
      totalAudioFiles
    });
  }

  /**
   * Rate-limited request wrapper with automatic token refresh
   */
  private makeRateLimitedRequest<T>(requestFn: () => Observable<T>): Observable<T> {
    return new Observable<T>(observer => {
      const executeWhenSlotAvailable = () => {
        if (this.activeRequests < this.MAX_CONCURRENT_REQUESTS) {
          this.activeRequests++;

          const delayedRequest = this.REQUEST_DELAY > 0
            ? of(null).pipe(delay(this.REQUEST_DELAY), mergeMap(() => requestFn()))
            : requestFn();

          delayedRequest.pipe(
            finalize(() => this.activeRequests--),
            catchError(error => {
              if (error.status === 401 && this.refreshToken) {
                return from(this.refreshAccessToken()).pipe(
                  mergeMap(success => success ? requestFn() : throwError(() => error))
                );
              }
              return throwError(() => error);
            })
          ).subscribe({
            next: (value) => observer.next(value),
            error: (error) => observer.error(error),
            complete: () => observer.complete()
          });
        } else {
          setTimeout(executeWhenSlotAvailable, 10);
        }
      };
      executeWhenSlotAvailable();
    });
  }

  /**
   * Retry with exponential backoff
   */
  private retryWithBackoff<T>(maxRetries: number = 3): (source: Observable<T>) => Observable<T> {
    return (source: Observable<T>) => source.pipe(
      retryWhen(errors =>
        errors.pipe(
          scan((retryCount, error) => {
            const isRateLimitError = error.status === 429 || error.status === 0;
            if (retryCount >= maxRetries || !isRateLimitError) {
              throw error;
            }
            return retryCount + 1;
          }, 0),
          mergeMap((retryCount) => {
            const backoffDelay = Math.pow(2, retryCount) * 1000;
            return of(null).pipe(delay(backoffDelay));
          })
        )
      )
    );
  }

  /**
   * Gets the current user's account information
   */
  getCurrentAccount(): Observable<DropboxUser | null> {
    if (!this.isAuthenticated()) {
      return of(null);
    }

    const endpoint = `${this.API_URL}/users/get_current_account`;
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    });

    const requestFn = () => this.http.post<DropboxUser>(endpoint, null, { headers }).pipe(
      this.retryWithBackoff(2),
      catchError(error => {
        console.error('Error getting current account:', error);
        return of(null);
      })
    );

    return this.makeRateLimitedRequest(requestFn);
  }

  /**
   * Lists files and folders in a given Dropbox path
   */
  listFolder(path: string = '', mediaOnly: boolean = false): Observable<DropboxFile[]> {
    if (!this.isAuthenticated()) {
      return of([]);
    }

    if (path === '/') {
      path = '';
    }

    const filesSubject = new Subject<DropboxFile[]>();

    const getFiles = (folderPath: string, cursor?: string) => {
      let endpoint: string;
      let body: any;

      if (cursor) {
        endpoint = `${this.API_URL}/files/list_folder/continue`;
        body = { cursor };
      } else {
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

      const requestFn = () => this.http.post<any>(endpoint, body, { headers }).pipe(
        this.retryWithBackoff(3),
        catchError(error => {
          console.error('Error listing Dropbox folder:', error);
          return of({ entries: [], has_more: false });
        })
      );

      this.makeRateLimitedRequest(requestFn).subscribe(response => {
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
              client_modified: entry.client_modified,
              server_modified: entry.server_modified,
              rev: entry.rev
            };

            if (mediaOnly) {
              if (file.is_folder || this.isMediaFile(file.name)) {
                files.push(file);
              }
            } else {
              files.push(file);
            }
          });
        }

        if (response.has_more && response.cursor) {
          filesSubject.next(files);
          getFiles(folderPath, response.cursor);
        } else {
          filesSubject.next(files);
          filesSubject.complete();
        }
      });
    };

    getFiles(path);

    return filesSubject.asObservable().pipe(
      scan((acc: DropboxFile[], val: DropboxFile[]) => [...acc, ...val], [] as DropboxFile[])
    );
  }

  /**
   * Recursively collects all audio files from a folder and its subfolders
   */
  collectAllAudioFilesRecursively(path: string): Observable<DropboxFile[]> {
    if (!this.isAuthenticated()) {
      return of([]);
    }

    this.updateScanProgress(path, true, 0);

    const processedFolders = new Set<string>();
    let totalAudioFiles = 0;

    const collectFromFolder = (folderPath: string): Observable<DropboxFile[]> => {
      if (processedFolders.has(folderPath)) {
        return of([]);
      }
      processedFolders.add(folderPath);

      this.updateScanProgress(folderPath, true, totalAudioFiles);

      return this.listFolder(folderPath, false).pipe(
        mergeMap((files: DropboxFile[]) => {
          const audioFiles = files.filter(file => !file.is_folder && this.isMediaFile(file.name));
          const subfolders = files.filter(file => file.is_folder);

          totalAudioFiles += audioFiles.length;
          this.updateScanProgress(folderPath, true, totalAudioFiles);

          if (subfolders.length === 0) {
            return of(audioFiles);
          }

          return from(subfolders).pipe(
            mergeMap(folder =>
              collectFromFolder(folder.path_display),
              Math.min(this.MAX_CONCURRENT_REQUESTS, 20)
            ),
            scan((acc: DropboxFile[], files: DropboxFile[]) => [...acc, ...files], audioFiles),
            takeLast(1)
          );
        }),
        catchError(error => {
          console.error(`Error collecting files from ${folderPath}:`, error);
          return of([]);
        })
      );
    };

    return collectFromFolder(path).pipe(
      tap(files => {
        this.updateScanProgress('', false, files.length);
      }),
      catchError(error => {
        this.updateScanProgress('', false, 0);
        throw error;
      })
    );
  }

  /**
   * Lists only media files in a given Dropbox path
   */
  listMediaFiles(path: string = ''): Observable<DropboxFile[]> {
    return this.listFolder(path, true);
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

    const requestFn = () => this.http.post<any>(endpoint, body, { headers }).pipe(
      this.retryWithBackoff(2),
      map(response => response.link),
      catchError(error => {
        console.error('Error getting temporary link:', error);
        return of('');
      })
    );

    return this.makeRateLimitedRequest(requestFn);
  }

  // NEW FILE OPERATIONS FOR PLAYLIST STORAGE

  /**
   * Create a folder in Dropbox
   */
  createFolder(path: string): Observable<DropboxFile> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Not authenticated'));
    }

    const endpoint = `${this.API_URL}/files/create_folder_v2`;
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    });
    const body = { path };

    const requestFn = () => this.http.post<any>(endpoint, body, { headers }).pipe(
      this.retryWithBackoff(2),
      map(response => ({
        id: response.metadata.id,
        name: response.metadata.name,
        path_display: response.metadata.path_display,
        is_folder: true,
        server_modified: response.metadata.server_modified
      } as DropboxFile)),
      catchError(error => {
        // Folder might already exist
        if (error.status === 409) {
          return of({
            id: '',
            name: path.split('/').pop() || '',
            path_display: path,
            is_folder: true
          } as DropboxFile);
        }
        console.error('Error creating folder:', error);
        return throwError(() => error);
      })
    );

    return this.makeRateLimitedRequest(requestFn);
  }

  /**
   * Upload a file to Dropbox
   */
  uploadFile(path: string, content: string, mode: 'add' | 'overwrite' = 'overwrite'): Observable<DropboxFile> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Not authenticated'));
    }

    const endpoint = `${this.CONTENT_URL}/files/upload`;
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/octet-stream',
      'Dropbox-API-Arg': JSON.stringify({
        path,
        mode,
        autorename: false
      })
    });

    const requestFn = () => this.http.post<any>(endpoint, content, { headers }).pipe(
      this.retryWithBackoff(2),
      map(response => ({
        id: response.id,
        name: response.name,
        path_display: response.path_display,
        is_folder: false,
        size: response.size,
        client_modified: response.client_modified,
        server_modified: response.server_modified,
        rev: response.rev
      } as DropboxFile)),
      catchError(error => {
        console.error('Error uploading file:', error);
        return throwError(() => error);
      })
    );

    return this.makeRateLimitedRequest(requestFn);
  }

  /**
   * Download a file from Dropbox
   */
  downloadFile(path: string): Observable<string> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Not authenticated'));
    }

    const endpoint = `${this.CONTENT_URL}/files/download`;
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Dropbox-API-Arg': JSON.stringify({ path })
    });

    const requestFn = () => this.http.post(endpoint, null, {
      headers,
      responseType: 'text'
    }).pipe(
      this.retryWithBackoff(2),
      catchError(error => {
        console.error('Error downloading file:', error);
        return throwError(() => error);
      })
    );

    return this.makeRateLimitedRequest(requestFn);
  }

  /**
   * Delete a file from Dropbox
   */
  deleteFile(path: string): Observable<void> {
    if (!this.isAuthenticated()) {
      return throwError(() => new Error('Not authenticated'));
    }

    const endpoint = `${this.API_URL}/files/delete_v2`;
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json'
    });
    const body = { path };

    const requestFn = () => this.http.post<any>(endpoint, body, { headers }).pipe(
      this.retryWithBackoff(2),
      map(() => void 0),
      catchError(error => {
        console.error('Error deleting file:', error);
        return throwError(() => error);
      })
    );

    return this.makeRateLimitedRequest(requestFn);
  }

  /**
   * List all playlist files in the playlists folder
   */
  listPlaylistFiles(): Observable<DropboxFile[]> {
    return this.listFolder(this.PLAYLISTS_FOLDER).pipe(
      map(files => files.filter(file =>
        !file.is_folder &&
        file.name.toLowerCase().endsWith('.json')
      ))
    );
  }

  /**
   * Get the full path for a playlist file
   */
  getPlaylistPath(playlistName: string): string {
    const sanitizedName = this.sanitizeFileName(playlistName);
    return `${this.PLAYLISTS_FOLDER}/${sanitizedName}.json`;
  }

  /**
   * Sanitize filename for Dropbox
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
      .replace(/\s+/g, '_') // Replace spaces with underscores
      .substring(0, 255); // Limit length
  }

  /**
   * Checks if a file is an audio file based on its extension
   */
  isMediaFile(filename: string): boolean {
    if (!filename) return false;

    const audioExtensions = [
      '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'
    ];

    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return audioExtensions.includes(extension);
  }
}
