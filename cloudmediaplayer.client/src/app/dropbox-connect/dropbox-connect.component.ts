import { Component, EventEmitter, Output, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subscription } from 'rxjs';
import { DropboxService, AuthState } from '../dropbox.service';

/**
 * DropboxConnectComponent - Enhanced authentication UI with OAuth support
 */
@Component({
  selector: 'app-dropbox-connect',
  templateUrl: './dropbox-connect.component.html',
  styleUrls: ['./dropbox-connect.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
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
  tokenInput: string = '';

  private authSubscription?: Subscription;

  constructor(public dropboxService: DropboxService) { }

  ngOnInit(): void {
    try {
      this.authSubscription = this.dropboxService.getAuthState().subscribe(state => {
        this.authState = state || {
          isAuthenticated: false,
          userInfo: null,
          tokenExpiry: null,
          error: null
        };
        this.authenticationChanged.emit(state?.isAuthenticated === true);
        this.isLoading = false;
      });

      if (this.dropboxService && !this.dropboxService.shouldUseCallbackRoute) {
        this.handleOAuthCallback();
      }
    } catch (error) {
      console.error('Error in ngOnInit:', error);
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

  async connectWithOAuth(): Promise<void> {
    this.isLoading = true;
    this.clearError();

    try {
      if (this.dropboxService && this.dropboxService.startOAuthFlow) {
        await this.dropboxService.startOAuthFlow();
      } else {
        throw new Error('OAuth flow not available');
      }
    } catch (error) {
      console.error('Failed to start OAuth flow:', error);
      this.isLoading = false;
    }
  }

  submitToken(): void {
    try {
      if (this.tokenInput && this.tokenInput.trim()) {
        this.isLoading = true;
        this.clearError();

        if (this.dropboxService && this.dropboxService.setAccessToken) {
          this.dropboxService.setAccessToken(this.tokenInput.trim());
        }

        this.tokenInput = '';
      }
    } catch (error) {
      console.error('Error submitting token:', error);
      this.isLoading = false;
    }
  }

  logout(): void {
    try {
      if (this.dropboxService && this.dropboxService.logout) {
        this.dropboxService.logout();
      }
      this.tokenInput = '';
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }

  async refreshConnection(): Promise<void> {
    this.isLoading = true;
    this.clearError();

    try {
      if (this.dropboxService && this.dropboxService.getCurrentAccount) {
        this.dropboxService.getCurrentAccount().subscribe({
          next: () => this.isLoading = false,
          error: () => this.isLoading = false
        });
      } else {
        this.isLoading = false;
      }
    } catch (error) {
      console.error('Error refreshing connection:', error);
      this.isLoading = false;
    }
  }

  clearError(): void {
    // Error clearing handled by service
  }

  isAuthenticated(): boolean {
    try {
      return this.authState?.isAuthenticated === true;
    } catch (error) {
      console.warn('Error checking authentication status:', error);
      return false;
    }
  }

  getUserInitials(): string {
    try {
      const userInfo = this.authState?.userInfo;
      if (!userInfo || !userInfo.name) return 'U';

      const displayName = userInfo.name.display_name ||
        userInfo.name.familiar_name ||
        userInfo.name.given_name ||
        'Unknown User';

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

  getUserDisplayName(): string {
    try {
      const userInfo = this.authState?.userInfo;
      if (!userInfo) return 'Dropbox User';

      if (!userInfo.name) return 'Dropbox User';

      return userInfo.name.display_name ||
        userInfo.name.familiar_name ||
        userInfo.name.given_name ||
        'Dropbox User';
    } catch (error) {
      console.warn('Error getting user display name:', error);
      return 'Dropbox User';
    }
  }

  getUserEmail(): string {
    try {
      return this.authState?.userInfo?.email || '';
    } catch (error) {
      console.warn('Error getting user email:', error);
      return '';
    }
  }

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

  private handleOAuthCallback(): void {
    try {
      if (window.location.pathname === '/' || window.location.pathname === '/media-player') {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const error = urlParams.get('error');
        const state = urlParams.get('state');

        if (error) {
          console.error('OAuth error:', error);
          window.history.replaceState({}, document.title, window.location.pathname);
          return;
        }

        if (code) {
          this.processOAuthCode(code, state);
        }
      }
    } catch (error) {
      console.error('Error handling OAuth callback:', error);
    }
  }

  private async processOAuthCode(code: string, state?: string | null): Promise<void> {
    this.isLoading = true;

    try {
      if (this.dropboxService && this.dropboxService.handleOAuthCallback) {
        const success = await this.dropboxService.handleOAuthCallback(code, state || undefined);

        window.history.replaceState({}, document.title, window.location.pathname);

        if (!success) {
          console.error('Authentication failed');
        }
      } else {
        console.error('OAuth callback handler not available');
      }
    } catch (error) {
      console.error('OAuth callback processing failed:', error);
    } finally {
      this.isLoading = false;
    }
  }
}
