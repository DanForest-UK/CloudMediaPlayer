import { TestBed } from '@angular/core/testing';
import { take } from 'rxjs/operators';
import { NotificationService } from './notification.service';
import { NotificationMessage } from '@models/notification.model';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationService);
    service.clearAll();
    jasmine.clock().install();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    service.clearAll();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should start with empty messages', (done) => {
    service.messages$.pipe(take(1)).subscribe(messages => {
      expect(messages).toEqual([]);
      done();
    });
  });

  describe('Message types', () => {
    it('should show success message', (done) => {
      service.showSuccess('Test success message');

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(1);
        expect(messages[0].type).toBe('success');
        expect(messages[0].message).toBe('Test success message');
        expect(messages[0].id).toMatch(/^msg_\d+$/);
        expect(messages[0].timestamp).toBeInstanceOf(Date);
        done();
      });
    });
    it('should show error message', (done) => {
      service.showError('Test error message');

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(1);
        expect(messages[0].type).toBe('error');
        expect(messages[0].message).toBe('Test error message');
        expect(messages[0].id).toMatch(/^msg_\d+$/);
        expect(messages[0].timestamp).toBeInstanceOf(Date);
        done();
      });
    });
  });

  describe('Multiple Messages', () => {
    it('should handle multiple messages', (done) => {
      service.showSuccess('First message');
      service.showError('Second message');
      service.showSuccess('Third message');

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(3);
        expect(messages[0].message).toBe('First message');
        expect(messages[0].type).toBe('success');
        expect(messages[1].message).toBe('Second message');
        expect(messages[1].type).toBe('error');
        expect(messages[2].message).toBe('Third message');
        expect(messages[2].type).toBe('success');
        done();
      });
    });

    it('should auto-remove messages independently', (done) => {
      service.showSuccess('First message');
      jasmine.clock().tick(2000);
      service.showError('Second message');
      jasmine.clock().tick(2001);

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(1);
        expect(messages[0].message).toBe('Second message');

        // After 4 more seconds, second message should be gone too
        jasmine.clock().tick(2000);

        service.messages$.pipe(take(1)).subscribe(finalMessages => {
          expect(finalMessages.length).toBe(0);
          done();
        });
      });
    });
  });

  describe('Manual Message Removal', () => {
    it('should manually remove specific message by ID', (done) => {
      service.showSuccess('Message 1');
      service.showError('Message 2');

      service.messages$.pipe(take(1)).subscribe(messages => {
        const messageId = messages[0].id;

        service.removeMessage(messageId);

        service.messages$.pipe(take(1)).subscribe(updatedMessages => {
          expect(updatedMessages.length).toBe(1);
          expect(updatedMessages[0].message).toBe('Message 2');
          done();
        });
      });
    });

    it('should handle removal of non-existent message ID gracefully', (done) => {
      service.showSuccess('Test message');

      service.removeMessage('non-existent-id');

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(1);
        expect(messages[0].message).toBe('Test message');
        done();
      });
    });

    it('should clear all messages', (done) => {
      service.showSuccess('Message 1');
      service.showError('Message 2');
      service.showSuccess('Message 3');

      service.clearAll();

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(0);
        done();
      });
    });
  });

  describe('Observable Behavior', () => {
    it('should emit new state when messages change', (done) => {
      const emissions: NotificationMessage[][] = [];

      const subscription = service.messages$.subscribe(messages => {
        emissions.push([...messages]);

        if (emissions.length === 3) {
          try {
            expect(emissions[0]).toEqual([]); // Initial empty state
            expect(emissions[1].length).toBe(1); // After first message
            expect(emissions[1][0].message).toBe('Test message');
            expect(emissions[2].length).toBe(2); // After second message
            expect(emissions[2][1].message).toBe('Another message');

            subscription.unsubscribe();
            done();
          } catch (error) {
            subscription.unsubscribe();
            done.fail(error as Error);
          }
        }
      });

      // Trigger messages after subscription is set up
      service.showSuccess('Test message');
      service.showError('Another message');
    });
  });

  describe('Message Properties', () => {
    it('should set correct timestamp for messages', (done) => {
      const beforeTime = new Date();
      service.showSuccess('Test message');
      const afterTime = new Date();

      service.messages$.pipe(take(1)).subscribe(messages => {
        const messageTime = messages[0].timestamp;
        expect(messageTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
        expect(messageTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
        done();
      });
    });

    it('should increment message ID counter', (done) => {
      service.showSuccess('Message 1');
      service.showError('Message 2');
      service.showSuccess('Message 3');

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages[0].id).toBe('msg_1');
        expect(messages[1].id).toBe('msg_2');
        expect(messages[2].id).toBe('msg_3');
        done();
      });
    });
  });

  describe('Empty and Invalid Messages', () => {
    it('should not create messages for empty strings', (done) => {
      service.showSuccess('');
      service.showError('');

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(0);
        done();
      });
    });

    it('should not create messages for whitespace-only strings', (done) => {
      service.showSuccess('   ');
      service.showError('\t\n  \r');
      service.showSuccess('     ');

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(0);
        done();
      });
    });

    it('should not increment ID counter for empty messages', (done) => {
      service.showSuccess(''); // Should not create
      service.showError('Valid message'); // Should create with ID msg_1
      service.showSuccess('   '); // Should not create
      service.showError('Another valid message'); // Should create with ID msg_2

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(2);
        expect(messages[0].id).toBe('msg_1');
        expect(messages[0].message).toBe('Valid message');
        expect(messages[1].id).toBe('msg_2');
        expect(messages[1].message).toBe('Another valid message');
        done();
      });
    });   
  });

  describe('Edge Cases', () => { 
    it('should handle rapid successive message additions', (done) => {
      for (let i = 0; i < 10; i++) {
        service.showSuccess(`Message ${i}`);
      }

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(10);
        expect(messages[0].message).toBe('Message 0');
        expect(messages[9].message).toBe('Message 9');
        done();
      });
    });
  });
});
