import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subscription } from 'rxjs';
import { NotificationService, NotificationMessage } from '../notification.service';

@Component({
  selector: 'app-notifications',
  template: `
    <div class="notifications-container">
      <div *ngFor="let notification of notifications; trackBy: trackByMessageId"
           class="notification"
           [class.success]="notification.type === 'success'"
           [class.error]="notification.type === 'error'"
           (click)="removeNotification(notification.id)">
        <span class="notification-icon">
          {{ notification.type === 'success' ? '✓' : '⚠️' }}
        </span>
        <span class="notification-message">{{ notification.message }}</span>
        <button class="notification-close" (click)="removeNotification(notification.id)">×</button>
      </div>
    </div>
  `,
  styles: [`
    .notifications-container {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }

    .notification {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      font-size: 14px;
      font-weight: 500;
      max-width: 400px;
      min-width: 300px;
      cursor: pointer;
      pointer-events: auto;
      animation: slideUp 0.3s ease-out;
      transition: all 0.3s ease;
    }

    .notification:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    .notification.success {
      background-color: #d4edda;
      border: 1px solid #c3e6cb;
      color: #155724;
    }

    .notification.error {
      background-color: #f8d7da;
      border: 1px solid #f5c6cb;
      color: #721c24;
    }

    .notification-icon {
      font-size: 16px;
      flex-shrink: 0;
    }

    .notification-message {
      flex: 1;
      line-height: 1.4;
    }

    .notification-close {
      background: none;
      border: none;
      font-size: 18px;
      font-weight: bold;
      cursor: pointer;
      color: inherit;
      opacity: 0.7;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: all 0.2s;
    }

    .notification-close:hover {
      opacity: 1;
      background-color: rgba(0, 0, 0, 0.1);
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (max-width: 480px) {
      .notifications-container {
        left: 10px;
        right: 10px;
        transform: none;
      }

      .notification {
        min-width: 0;
        max-width: none;
      }
    }
  `],
  standalone: true,
  imports: [CommonModule]
})
export class NotificationComponent implements OnInit, OnDestroy {
  notifications: NotificationMessage[] = [];
  private subscription: Subscription | null = null;

  constructor(private notificationService: NotificationService) { }

  ngOnInit(): void {
    this.subscription = this.notificationService.messages$.subscribe(
      messages => this.notifications = messages
    );
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  removeNotification(id: string): void {
    this.notificationService.removeMessage(id);
  }

  trackByMessageId(index: number, message: NotificationMessage): string {
    return message.id;
  }
}
