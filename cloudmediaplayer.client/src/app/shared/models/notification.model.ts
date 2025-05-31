/**
 * Interface for notification message
 */
export interface NotificationMessage {
  id: string;
  type: 'success' | 'error';
  message: string;
  timestamp: Date;
}
