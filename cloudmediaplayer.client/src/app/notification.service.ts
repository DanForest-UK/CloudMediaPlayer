import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface NotificationMessage {
  id: string;
  type: 'success' | 'error';
  message: string;
  timestamp: Date;
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private messagesSubject = new BehaviorSubject<NotificationMessage[]>([]);
  public messages$ = this.messagesSubject.asObservable();

  private messageIdCounter = 0;

  /**
   * Show a success message
   */
  showSuccess(message: string): void {
    this.addMessage('success', message);
  }

  /**
   * Show an error message
   */
  showError(message: string): void {
    this.addMessage('error', message);
  }

  /**
   * Add a message and auto-remove it after 4 seconds
   */
  private addMessage(type: 'success' | 'error', message: string): void {
    const notification: NotificationMessage = {
      id: `msg_${++this.messageIdCounter}`,
      type,
      message,
      timestamp: new Date()
    };

    const currentMessages = this.messagesSubject.value;
    this.messagesSubject.next([...currentMessages, notification]);

    // Auto-remove after 4 seconds
    setTimeout(() => {
      this.removeMessage(notification.id);
    }, 4000);
  }

  /**
   * Manually remove a message
   */
  removeMessage(id: string): void {
    const currentMessages = this.messagesSubject.value;
    const filteredMessages = currentMessages.filter(msg => msg.id !== id);
    this.messagesSubject.next(filteredMessages);
  }

  /**
   * Clear all messages
   */
  clearAll(): void {
    this.messagesSubject.next([]);
  }
}
