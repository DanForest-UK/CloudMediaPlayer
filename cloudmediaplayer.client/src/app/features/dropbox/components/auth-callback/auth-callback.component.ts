import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { DropboxService } from '@services/dropbox.service';
import { NotificationService } from '@services/notification.service';

/**
 * OAuth callback component for production environments
 */
@Component({
  selector: 'app-auth-callback',
  template: `
    <div class="callback-container">
      <div class="callback-content">
        <!-- Loading State -->
        <div *ngIf="!error && !isComplete" class="loading-state">
          <div class="loading-spinner">⏳</div>
          <h2>Connecting to Dropbox...</h2>
          <p>Please wait while we complete your connection.</p>
          <div class="progress-bar">
            <div class="progress-fill" [style.width.%]="progress"></div>
          </div>
        </div>
        
        <!-- Success State -->
        <div *ngIf="!error && isComplete" class="success-state">
          <div class="success-icon">✅</div>
          <h2>Successfully Connected!</h2>
          <p>Redirecting you back to the app...</p>
        </div>
        
        <!-- Error State -->
        <div *ngIf="error" class="error-state">
          <div class="error-icon">❌</div>
          <h2>Connection Failed</h2>
          <p>{{ error }}</p>
          <div class="error-actions">
            <button class="btn-primary" (click)="retry()">Try Again</button>
            <button class="btn-secondary" (click)="goHome()">Go to App</button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .callback-container {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: Arial, sans-serif;
    }
    
    .callback-content {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 15px;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      max-width: 400px;
      width: 90%;
      animation: slideIn 0.5s ease-out;
    }
    
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    
    .loading-spinner, .success-icon, .error-icon {
      font-size: 48px;
      margin-bottom: 20px;
      display: block;
    }
    
    .loading-spinner {
      animation: pulse 1.5s ease-in-out infinite alternate;
    }
    
    .success-icon {
      color: #4CAF50;
    }
    
    .error-icon {
      color: #f44336;
    }
    
    h2 {
      color: #333;
      margin-bottom: 10px;
      font-size: 24px;
    }
    
    p {
      color: #666;
      margin-bottom: 20px;
      line-height: 1.5;
    }
    
    .progress-bar {
      width: 100%;
      height: 6px;
      background-color: #f0f0f0;
      border-radius: 3px;
      overflow: hidden;
      margin-top: 20px;
    }
    
    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #4CAF50, #45a049);
      border-radius: 3px;
      transition: width 0.3s ease;
    }
    
    .error-actions {
      display: flex;
      gap: 10px;
      justify-content: center;
      flex-wrap: wrap;
    }
    
    .btn-primary, .btn-secondary {
      padding: 12px 24px;
      border: none;
      border-radius: 6px;
      font-size: 16px;
      cursor: pointer;
      transition: all 0.3s ease;
      text-decoration: none;
      display: inline-block;
    }
    
    .btn-primary {
      background-color: #4CAF50;
      color: white;
    }
    
    .btn-primary:hover {
      background-color: #45a049;
      transform: translateY(-2px);
    }
    
    .btn-secondary {
      background-color: #f1f1f1;
      color: #333;
      border: 1px solid #ddd;
    }
    
    .btn-secondary:hover {
      background-color: #e8e8e8;
    }
    
    @keyframes pulse {
      from { opacity: 1; }
      to { opacity: 0.5; }
    }
    
    @media (max-width: 480px) {
      .callback-content {
        padding: 30px 20px;
      }
      
      .error-actions {
        flex-direction: column;
      }
      
      .btn-primary, .btn-secondary {
        width: 100%;
      }
    }
  `],
  standalone: true,
  imports: [CommonModule]
})
export class AuthCallbackComponent implements OnInit {
  error: string | null = null;
  isComplete = false;
  progress = 0;

  constructor(
    private dropboxService: DropboxService,
    private router: Router,
    private notificationService: NotificationService
  ) { }

  ngOnInit(): void {
    this.handleCallback();
  }

  private async handleCallback(): Promise<void> {
    try {
      this.animateProgress();

      const urlParams = new URLSearchParams(window.location.search);
      const code = urlParams.get('code');
      const error = urlParams.get('error');
      const state = urlParams.get('state');

      if (error) {
        this.error = this.getErrorMessage(error);
        this.notificationService.showError('Unable to connect to Dropbox');
        return;
      }

      if (!code) {
        this.error = 'No authorization code received from Dropbox';
        this.notificationService.showError('Error connecting to Dropbox');
        return;
      }

      const success = await this.dropboxService.handleOAuthCallback(code, state || undefined);

      if (success) {
        this.isComplete = true;
        this.progress = 100;
        this.notificationService.showSuccess('Successfully connected to Dropbox');

        const returnUrl = this.dropboxService.getOAuthReturnUrl();
        setTimeout(() => {
          this.router.navigate([returnUrl]);
        }, 1500);
      } else {
        this.error = 'Failed to complete authentication';
        this.notificationService.showError('Unable to connect to Dropbox');
      }
    } catch (err) {
      console.error('Callback handling error:', err);
      this.error = 'An unexpected error occurred during authentication';
      this.notificationService.showError('Error connecting to Dropbox');
    }
  }

  private animateProgress(): void {
    const duration = 3000;
    const interval = 50;
    const steps = duration / interval;
    const increment = 100 / steps;

    const timer = setInterval(() => {
      if (this.progress < 90 && !this.error && !this.isComplete) {
        this.progress += increment;
      } else if (this.isComplete || this.error) {
        clearInterval(timer);
      }
    }, interval);
  }

  private getErrorMessage(error: string): string {
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

  async retry(): Promise<void> {
    try {
      await this.dropboxService.startOAuthFlow();
    } catch (error) {
      console.error('Failed to restart OAuth flow:', error);
      this.notificationService.showError('Error connecting to Dropbox');
      this.goHome();
    }
  }

  goHome(): void {
    this.router.navigate(['/']);
  }
}
