import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, Subject, forkJoin, from, EMPTY, BehaviorSubject, throwError } from 'rxjs';
import { map, catchError, scan, mergeMap, concatMap, delay, retryWhen, take, tap, takeLast, finalize } from 'rxjs/operators';
import { NotificationService } from '@services/notification.service';
import { DropboxUser, AuthState, FolderScanProgress, DropboxFile } from '@models/index';

// Export the interfaces that are used by other modules
export { AuthState, FolderScanProgress } from '../../shared/models';

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

  // Supported audio extensions - single source of truth
  public readonly audioExtensions = [
    '.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'
  ];

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
  public readonly REQUEST_DELAY = 50;
  private activeRequests = 0;

  // Progress tracking
  private folderScanProgress$ = new BehaviorSubject<FolderScanProgress>({
    currentPath: '',
    isScanning: false,
    totalAudioFiles: 0
  });

  /**
   * Initialize the service with HTTP client and notification service dependencies
   */
  constructor(
    private http: HttpClient,
    private notificationService: NotificationService
  ) {
    this.initializeAuth();
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
  sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*\s]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .substring(0, 255)
      || 'Untitled';
  }

  /**
   * Check if a file is an audio file based on its extension
   */
  isMediaFile(filename: string): boolean {
    if (!filename) return false;

    const extension = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    return this.audioExtensions.includes(extension);
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(): boolean {
    if (!this.tokenExpiry) return false;
    return new Date() >= this.tokenExpiry;
  }

  /**
   * Check if authentication is valid and not expired
   */
  isAuthenticated(): boolean {
    return !!this.accessToken && !this.isTokenExpired();
  }

  /**
   * Get OAuth error message for user display
   */
  getOAuthErrorMessage(error: string): string {
    switch (error) {
      case 'access_denied':
        return 'You cancelled the authorization process. Please try again if you want to connect to Dropbox.';
      case 'invalid_request':
        return 'There was a problem with the authorization request. Please try again.';
      case 'unsupported_response_type':
        return 'This authorization method is not supported. Please contact support.';
      default:
        return `Authorization failed: ${error}. Please try again.`;
    }
  }

  /**
   * Check if should use callback route 
   */
  shouldUseCallbackRoute(): boolean {
    return this.redirectUri.includes('/auth/callback');
  }

  /**
   * Filter files audio files and folders
   */
  filterAudioFilesAndFolders(files: DropboxFile[]): DropboxFile[] {
    return files.filter(file =>
      file.is_folder || this.isMediaFile(file.name)
    );
  }

  /**
   * Filter only audio files
   */
  filterAudioFilesOnly(files: DropboxFile[]): DropboxFile[] {
    return files.filter(file =>
      !file.is_folder && this.isMediaFile(file.name)
    );
  }

  /**
   * Sort files with folders first, then alphabetically
   */
  sortFiles(files: DropboxFile[]): DropboxFile[] {
    return files.sort((a, b) => {
      if (a.is_folder === b.is_folder) {
        return a.name.localeCompare(b.name);
      }
      return a.is_folder ? -1 : 1;
    });
  }

  /**
   * Generate breadcrumbs from path
   */
  generateBreadcrumbs(path: string): { name: string; path: string }[] {
    if (path === '' || path === '/') {
      return [{ name: 'Root', path: '/' }];
    }

    const parts = path.split('/').filter(p => p);
    const breadcrumbs = [{ name: 'Root', path: '/' }];

    let currentPath = '';
    for (let i = 0; i < parts.length; i++) {
      currentPath += '/' + parts[i];
      breadcrumbs.push({
        name: parts[i],
        path: currentPath
      });
    }

    return breadcrumbs;
  }

  /**
   * Extract folder name from path for display
   */
  getDisplayNameFromPath(path: string): string {
    if (!path) return '';

    const pathParts = path.split('/').filter(p => p);
    return pathParts.length > 0 ? pathParts[pathParts.length - 1] : 'Root';
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
   * Get current authentication state
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
      }
    } catch (error) {
      console.error('Error initializing auth:', error);
      this.notificationService.showError('Error initializing Dropbox connection');
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

      if (this.shouldUseCallbackRoute()) {
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
      console.error('Error starting OAuth flow:', error);
      this.notificationService.showError('Error connecting to Dropbox');
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
            this.notificationService.showSuccess('Successfully connected to Dropbox');
          } else {
            this.updateAuthState({ error: 'Token validation failed' });
            this.notificationService.showError('Unable to verify Dropbox connection');
          }
        } catch (error) {
          this.notificationService.showError('Error validating Dropbox token');
          console.error('Token validation error:', error);
          this.notificationService.showError('Unable to verify Dropbox connection');
          this.updateAuthState({ error: 'Token validation failed: ' + (error as Error).message });
        }

        sessionStorage.removeItem('pkce_code_verifier');
        sessionStorage.removeItem('oauth_state');

        return true;
      }
    } catch (error) {
      console.error('OAuth callback error:', error);
      this.notificationService.showError('Unable to connect to Dropbox');
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
      this.notificationService.showError('Error refreshing Dropbox connection');
    }

    this.clearAuth();
    return false;
  }

  /**
   * Validate token using direct fetch
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
      this.notificationService.showError('Unable to verify Dropbox connection');
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
      // Folder might already exist
      console.log('Playlists folder initialization:', error);
    }
  }

  /**
   * Logs out the user by removing all auth data
   */
  logout(): void {
    this.clearAuth();
    this.notificationService.showSuccess('Disconnected from Dropbox');
  }

  /**
   * Generate a cryptographically secure code verifier for PKCE flow
   */
  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Generate code challenge from verifier using SHA-256
   */
  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return btoa(String.fromCharCode(...new Uint8Array(digest)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Generates state parameter for OAuth flow
   */
  private generateState(): string {
    const state = Math.random().toString(36).substring(2, 15);
    sessionStorage.setItem('oauth_state', state);
    return state;
  }

  /**
   * Exchange authorization code for access and refresh tokens
   */
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
   * Store authentication data in localStorage
   */
  private storeAuth(): void {
    const authData = {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      tokenExpiry: this.tokenExpiry?.toISOString()
    };

    localStorage.setItem('dropbox_auth', JSON.stringify(authData));
  }

  /**
   * Retrieve stored authentication data from localStorage
   */
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
      this.notificationService.showError('Error reading stored authentication');
    }
    return null;
  }

  /**
   * Clear all authentication data and reset state
   */
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

  /**
   * Update the authentication state with new values
   */
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
        this.notificationService.showError('Error getting Dropbox account information');
        return of(null);
      })
    );

    return this.makeRateLimitedRequest(requestFn).pipe(
      catchError(error => {
        console.error('Error in makeRateLimitedRequest for getCurrentAccount:', error);
        this.notificationService.showError('Error getting Dropbox account information');
        return of(null);
      })
    );
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
          this.notificationService.showError('Error loading folder contents');
          return of({ entries: [], has_more: false });
        })
      );

      this.makeRateLimitedRequest(requestFn).subscribe({
        next: (response) => {
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
        },
        error: (error) => {
          console.error('Error in makeRateLimitedRequest:', error);
          this.notificationService.showError('Error loading folder contents');
          filesSubject.next([]);
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
          const audioFiles = this.filterAudioFilesOnly(files);
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
          this.notificationService.showError(`Error scanning folder for audio files`);
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
        this.notificationService.showError('Error scanning folder for audio files');
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
        this.notificationService.showError('Error getting media link');
        return of('');
      })
    );

    return this.makeRateLimitedRequest(requestFn).pipe(
      catchError(error => {
        console.error('Error in makeRateLimitedRequest for getTemporaryLink:', error);
        this.notificationService.showError('Error getting media link');
        return of('');
      })
    );
  }

  // File operations for playlist storage

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
        this.notificationService.showError('Error creating folder in Dropbox');
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
        this.notificationService.showError('Error uploading file to Dropbox');
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
        this.notificationService.showError('Error downloading file from Dropbox');
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
        this.notificationService.showError('Error deleting file from Dropbox');
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
      )),
      catchError(error => {
        console.error('Error listing playlist files:', error);
        this.notificationService.showError('Error loading playlists from Dropbox');
        return of([]);
      })
    );
  }
}
