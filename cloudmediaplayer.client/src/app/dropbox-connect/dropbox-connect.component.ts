import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DropboxService } from '../dropbox.service';

/**
 * DropboxConnectComponent - Handles Dropbox authentication UI
 * 
 * This component manages:
 * - Manual access token entry
 * - Authentication status display
 * - Disconnect functionality
 */
@Component({
  selector: 'app-dropbox-connect',
  templateUrl: './dropbox-connect.component.html',
  styleUrls: ['./dropbox-connect.component.css'],
  standalone: true,
  imports: [CommonModule, FormsModule]
})
export class DropboxConnectComponent {
  @Output() authenticationChanged = new EventEmitter<boolean>();

  // For manual access token entry
  tokenInput: string = '';
  showTokenInput = false;

  constructor(public dropboxService: DropboxService) {
    this.checkAuthenticationStatus();
  }

  private checkAuthenticationStatus(): void {
    if (this.dropboxService.isAuthenticated()) {
      console.log('Token found, validating...');
      this.dropboxService.getCurrentAccount().subscribe(
        account => {
          if (account) {
            console.log('Successfully authenticated with Dropbox. Account:', account.name);
            this.authenticationChanged.emit(true);
          } else {
            console.error('Token invalid or expired');
            this.dropboxService.logout();
            this.showTokenInput = true;
            this.authenticationChanged.emit(false);
          }
        }
      );
    } else {
      console.log('Not authenticated with Dropbox yet');
      this.showTokenInput = true;
      this.authenticationChanged.emit(false);
    }
  }

  submitToken(): void {
    if (this.tokenInput) {
      this.dropboxService.setAccessToken(this.tokenInput);
      this.showTokenInput = false;
      this.authenticationChanged.emit(true);
    }
  }

  logout(): void {
    this.dropboxService.logout();
    this.showTokenInput = true;
    this.authenticationChanged.emit(false);
  }

  isAuthenticated(): boolean {
    return this.dropboxService.isAuthenticated();
  }
}
