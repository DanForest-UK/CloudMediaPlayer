import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { distinctUntilChanged } from 'rxjs/operators';
import { NotificationMessage } from '@models/notification.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private messagesSubject = new BehaviorSubject<NotificationMessage[]>([]);
  public messages$ = this.messagesSubject.asObservable().pipe(
    distinctUntilChanged()
  );

  private messageIdCounter = 0;
  private timeouts = new Map<string, number>();

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
   * Does nothing if message is empty or only whitespace
   */
  private addMessage(type: 'success' | 'error', message: string): void {
    // Don't create notification if message is empty or only whitespace
    if (!message || message.trim().length === 0) {
      return;
    }

    const notification: NotificationMessage = {
      id: `msg_${++this.messageIdCounter}`,
      type,
      message,
      timestamp: new Date()
    };

    // new array instance to ensure immutability
    const currentMessages = [...(this.messagesSubject.value || [])];
    const newMessages = [...currentMessages, notification];
    this.messagesSubject.next(newMessages);

    // Auto-remove after 4 seconds
    const timeoutId = window.setTimeout(() => {
      this.removeMessage(notification.id);
      this.timeouts.delete(notification.id);
    }, 4000);

    this.timeouts.set(notification.id, timeoutId);
  }

  /**
   * Manually remove a message
   */
  removeMessage(id: string): void {
    // Clear any existing timeout for this message
    const timeoutId = this.timeouts.get(id);
    if (timeoutId) {
      window.clearTimeout(timeoutId);
      this.timeouts.delete(id);
    }

    const currentMessages = [...(this.messagesSubject.value || [])];
    const filteredMessages = currentMessages.filter(msg => msg && msg.id !== id);

    // Only emit if the array actually changed
    if (filteredMessages.length !== currentMessages.length) {
      this.messagesSubject.next([...filteredMessages]);
    }
  }

  /**
   * Clear all messages
   */
  clearAll(): void {
    this.timeouts.forEach(timeoutId => window.clearTimeout(timeoutId));
    this.timeouts.clear();

    // Only emit if there are messages to clear
    if (this.messagesSubject.value.length > 0) {
      this.messagesSubject.next([]);
    }
  }
}
