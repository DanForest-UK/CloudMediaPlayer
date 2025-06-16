import { Component, EventEmitter, Output, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { DropboxService, AuthState } from '@services/dropbox.service';
import { NotificationService } from '@services/notification.service';

/**
 * DropboxConnectComponent - Enhanced authentication UI with OAuth support
 */
@Component({
  selector: 'app-dropbox-connect',
  templateUrl: './dropbox-connect.component.html',
  styleUrls: ['./dropbox-connect.component.css'],
  standalone: true,
  imports: [CommonModule]
})
export class DropboxConnectComponent implements OnInit, OnDestroy {
  @Output() authenticationChanged = new EventEmitter<boolean>();

  authState: AuthState = {
    isAuthenticated: false,
    userInfo: null,
    tokenExpiry: null,
    error: null
  };

  isLoading = false;

  private authSubscription?: Subscription;

  constructor(
    public dropboxService: DropboxService,
    private notificationService: NotificationService
  ) { }

  ngOnInit(): void {
    try {
      this.authSubscription = this.dropboxService.getAuthState().subscribe(state => {
        this.authState = state || this.getDefaultAuthState();
        this.authenticationChanged.emit(state?.isAuthenticated === true);
        this.isLoading = false;
      });

      if (this.dropboxService && !this.shouldUseCallbackRoute()) {
        this.handleOAuthCallback();
      }
    } catch (error) {
      console.error('Error in ngOnInit:', error);
      this.notificationService.showError('Error initializing Dropbox connection');
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    try {
      this.authSubscription?.unsubscribe();
    } catch (error) {
      console.error('Error in ngOnDestroy:', error);
    }
  }

  /**
   * Get default auth state
   */
  getDefaultAuthState(): AuthState {
    return {
      isAuthenticated: false,
      userInfo: null,
      tokenExpiry: null,
      error: null
    };
  }

  /**
   * Check if should use callback route
   */
  shouldUseCallbackRoute(): boolean {
    return this.dropboxService?.shouldUseCallbackRoute() || false;
  }

  /**
   * Check if current path matches OAuth callback paths
   */
  isOAuthCallbackPath(): boolean {
    const path = window.location.pathname;
    return path === '/' || path === '/media-player';
  }

  /**
   * Extract OAuth parameters from URL
   */
  extractOAuthParams(): { code?: string; error?: string; state?: string } {
    const urlParams = new URLSearchParams(window.location.search);
    return {
      code: urlParams.get('code') || undefined,
      error: urlParams.get('error') || undefined,
      state: urlParams.get('state') || undefined
    };
  }

  /**
   * Clean URL after OAuth callback processing
   */
  cleanOAuthUrl(): void {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  /**
   * Get user initials from user info
   */
  getUserInitials(): string {
    try {
      const userInfo = this.authState?.userInfo;
      if (!userInfo || !userInfo.name) return 'U';

      const displayName = this.getUserDisplayName();
      if (!displayName || displayName.trim() === '') return 'U';

      return displayName.trim()
        .split(' ')
        .filter(n => n && n.length > 0)
        .map((n: string) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2) || 'U';
    } catch (error) {
      console.warn('Error getting user initials:', error);
      return 'U';
    }
  }

  /**
   * Get user display name with fallbacks
   */
  getUserDisplayName(): string {
    try {
      const userInfo = this.authState?.userInfo;
      if (!userInfo || !userInfo.name) return 'Dropbox User';

      return userInfo.name.display_name ||
        userInfo.name.familiar_name ||
        userInfo.name.given_name ||
        'Dropbox User';
    } catch (error) {
      console.warn('Error getting user display name:', error);
      return 'Dropbox User';
    }
  }

  /**
   * Get user email
   */
  getUserEmail(): string {
    try {
      return this.authState?.userInfo?.email || '';
    } catch (error) {
      console.warn('Error getting user email:', error);
      return '';
    }
  }

  /**
   * Format token expiry for display
   */
  formatTokenExpiry(): string {
    try {
      const tokenExpiry = this.authState?.tokenExpiry;
      if (!tokenExpiry) return '';

      const now = new Date();
      const expiry = new Date(tokenExpiry);

      if (isNaN(expiry.getTime())) return '';

      const diffMs = expiry.getTime() - now.getTime();
      if (diffMs <= 0) return 'expired';

      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffDays > 0) {
        return `in ${diffDays} day${diffDays > 1 ? 's' : ''}`;
      } else if (diffHours > 0) {
        return `in ${diffHours} hour${diffHours > 1 ? 's' : ''}`;
      } else {
        return 'soon';
      }
    } catch (error) {
      console.warn('Error formatting token expiry:', error);
      return '';
    }
  }

  /**
   * Calculate time difference for expiry
   */
  calculateExpiryTimeDifference(tokenExpiry: Date): { days: number; hours: number; expired: boolean } {
    const now = new Date();
    const expiry = new Date(tokenExpiry);
    const diffMs = expiry.getTime() - now.getTime();

    if (diffMs <= 0) {
      return { days: 0, hours: 0, expired: true };
    }

    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    return { days: diffDays, hours: diffHours, expired: false };
  }

  /**
   * Validate OAuth state parameter
   */
  validateOAuthState(receivedState?: string): boolean {
    if (!receivedState) return true; // State is optional

    const storedState = sessionStorage.getItem('oauth_state');
    return !storedState || storedState === receivedState;
  }

  /**
   * Check if authentication is valid
   */
  isAuthenticated(): boolean {
    try {
      return this.authState?.isAuthenticated === true;
    } catch (error) {
      console.warn('Error checking authentication status:', error);
      return false;
    }
  }

  /**
   * Check if there's an authentication error
   */
  hasAuthError(): boolean {
    return !!(this.authState?.error && !this.isLoading);
  }

  /**
   * Check if should show connect interface
   */
  shouldShowConnectInterface(): boolean {
    return !this.isAuthenticated() && !this.isLoading;
  }

  /**
   * Check if should show authenticated interface
   */
  shouldShowAuthenticatedInterface(): boolean {
    return this.isAuthenticated() && !this.isLoading;
  }

  async connectWithOAuth(): Promise<void> {
    this.isLoading = true;

    try {
      if (this.dropboxService && this.dropboxService.startOAuthFlow) {
        await this.dropboxService.startOAuthFlow();
      } else {
        throw new Error('OAuth flow not available');
      }
    } catch (error) {
      console.error('Failed to start OAuth flow:', error);
      this.notificationService.showError('Error connecting to Dropbox');
      this.isLoading = false;
    }
  }

  logout(): void {
    try {
      if (this.dropboxService && this.dropboxService.logout) {
        this.dropboxService.logout();
      }
    } catch (error) {
      console.error('Error during logout:', error);
      this.notificationService.showError('Error disconnecting from Dropbox');
    }
  }

  refreshConnection(): void {
    this.isLoading = true;

    if (!this.dropboxService?.getCurrentAccount) {
      this.isLoading = false;
      return;
    }

    this.dropboxService.getCurrentAccount().subscribe({
      next: () => {
        this.isLoading = false;
        this.notificationService.showSuccess('Connection refreshed');
      },
      error: (error) => {
        console.error('Error refreshing connection:', error);
        this.notificationService.showError('Error refreshing Dropbox connection');
        this.isLoading = false;
      }
    });
  }
  
  private handleOAuthCallback(): void {
    try {
      if (this.isOAuthCallbackPath()) {
        const params = this.extractOAuthParams();

        if (params.error) {
          console.error('OAuth error:', params.error);
          this.notificationService.showError('Error connecting to Dropbox');
          this.cleanOAuthUrl();
          return;
        }

        if (params.code) {
          this.processOAuthCode(params.code, params.state);
        }
      }
    } catch (error) {
      console.error('Error handling OAuth callback:', error);
      this.notificationService.showError('Error processing Dropbox connection');
    }
  }

  private async processOAuthCode(code: string, state?: string): Promise<void> {
    this.isLoading = true;

    try {
      if (!this.validateOAuthState(state)) {
        throw new Error('Invalid OAuth state parameter');
      }

      if (this.dropboxService && this.dropboxService.handleOAuthCallback) {
        const success = await this.dropboxService.handleOAuthCallback(code, state);

        this.cleanOAuthUrl();

        if (!success) {
          console.error('Authentication failed');
          this.notificationService.showError('Unable to connect to Dropbox');
        }
      } else {
        console.error('OAuth callback handler not available');
        this.notificationService.showError('OAuth callback handler not available');
      }
    } catch (error) {
      console.error('OAuth callback processing failed:', error);
      this.notificationService.showError('Error processing Dropbox connection');
    } finally {
      this.isLoading = false;
    }
  }
}
