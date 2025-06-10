import { TestBed } from '@angular/core/testing';
import { take } from 'rxjs/operators';
import { NotificationService } from './notification.service';
import { NotificationMessage } from '@models/notification.model';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(NotificationService);
    service.clearAll(); // Make sure we start with clean state
    jasmine.clock().install();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    service.clearAll(); // Clean up after each test
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

  describe('Success Messages', () => {
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

    it('should auto-remove success message after 4 seconds', (done) => {
      service.showSuccess('Test message');

      // Initially should have the message
      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(1);

        // After 4 seconds, message should be removed
        jasmine.clock().tick(4001);

        // Use a timeout to allow for the async operation to complete
        setTimeout(() => {
          service.messages$.pipe(take(1)).subscribe(messagesAfter => {
            expect(messagesAfter.length).toBe(0);
            done();
          });
        }, 10);
      });
    });
  });

  describe('Error Messages', () => {
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

    it('should auto-remove error message after 4 seconds', (done) => {
      service.showError('Test error');

      // Initially should have the message
      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(1);

        // After 4 seconds, message should be removed
        jasmine.clock().tick(4001);

        // Use a timeout to allow for the async operation to complete
        setTimeout(() => {
          service.messages$.pipe(take(1)).subscribe(messagesAfter => {
            expect(messagesAfter.length).toBe(0);
            done();
          });
        }, 10);
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

    it('should generate unique IDs for each message', (done) => {
      service.showSuccess('Message 1');
      service.showError('Message 2');

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages[0].id).not.toBe(messages[1].id);
        expect(messages[0].id).toMatch(/^msg_1$/);
        expect(messages[1].id).toMatch(/^msg_2$/);
        done();
      });
    });

    it('should auto-remove messages independently', (done) => {
      service.showSuccess('First message');

      jasmine.clock().tick(2000); // Wait 2 seconds

      service.showError('Second message');

      // After 4 seconds total, first message should be gone, second should remain
      jasmine.clock().tick(2001);

      setTimeout(() => {
        service.messages$.pipe(take(1)).subscribe(messages => {
          expect(messages.length).toBe(1);
          expect(messages[0].message).toBe('Second message');

          // After 4 more seconds, second message should be gone too
          jasmine.clock().tick(2000);

          setTimeout(() => {
            service.messages$.pipe(take(1)).subscribe(finalMessages => {
              expect(finalMessages.length).toBe(0);
              done();
            });
          }, 10);
        });
      }, 10);
    });
  });

  describe('Manual Message Removal', () => {
    it('should manually remove specific message by ID', (done) => {
      service.showSuccess('Message 1');
      service.showError('Message 2');

      service.messages$.pipe(take(1)).subscribe(messages => {
        const messageId = messages[0].id;

        service.removeMessage(messageId);

        setTimeout(() => {
          service.messages$.pipe(take(1)).subscribe(updatedMessages => {
            expect(updatedMessages.length).toBe(1);
            expect(updatedMessages[0].message).toBe('Message 2');
            done();
          });
        }, 10);
      });
    });

    it('should handle removal of non-existent message ID gracefully', (done) => {
      service.showSuccess('Test message');

      service.removeMessage('non-existent-id');

      setTimeout(() => {
        service.messages$.pipe(take(1)).subscribe(messages => {
          expect(messages.length).toBe(1);
          expect(messages[0].message).toBe('Test message');
          done();
        });
      }, 10);
    });

    it('should clear all messages', (done) => {
      service.showSuccess('Message 1');
      service.showError('Message 2');
      service.showSuccess('Message 3');

      service.clearAll();

      setTimeout(() => {
        service.messages$.pipe(take(1)).subscribe(messages => {
          expect(messages.length).toBe(0);
          done();
        });
      }, 10);
    });
  });

  describe('Observable Behavior', () => {
    it('should emit new state when messages change', (done) => {
      let emissionCount = 0;
      const expectedEmissions = 3;

      const subscription = service.messages$.subscribe(messages => {
        emissionCount++;

        if (emissionCount === 1) {
          // Initial empty state
          expect(messages).toEqual([]);
          service.showSuccess('Test message');
        } else if (emissionCount === 2) {
          // After first message
          expect(messages.length).toBe(1);
          service.showError('Another message');
        } else if (emissionCount === 3) {
          // After second message
          expect(messages.length).toBe(2);
          subscription.unsubscribe();
          done();
        }
      });
    });

    it('should maintain message immutability', (done) => {
      let firstSnapshot: NotificationMessage[] = [];
      let secondSnapshot: NotificationMessage[] = [];
      let emissionCount = 0;

      const subscription = service.messages$.subscribe(messages => {
        emissionCount++;

        if (emissionCount === 1) {
          // Initial empty state
          expect(messages).toEqual([]);
          service.showSuccess('First message');
        } else if (emissionCount === 2) {
          // After first message
          firstSnapshot = [...messages]; // Create a copy
          expect(firstSnapshot.length).toBe(1);
          service.showSuccess('Second message');
        } else if (emissionCount === 3) {
          // After second message
          secondSnapshot = [...messages]; // Create a copy
          expect(secondSnapshot.length).toBe(2);

          // First snapshot should not be modified
          expect(firstSnapshot.length).toBe(1);

          // Arrays should be different instances
          expect(firstSnapshot).not.toBe(secondSnapshot);

          subscription.unsubscribe();
          done();
        }
      });
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

  describe('Edge Cases', () => {
    it('should handle empty message strings', (done) => {
      service.showSuccess('');
      service.showError('');

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages.length).toBe(2);
        expect(messages[0].message).toBe('');
        expect(messages[1].message).toBe('');
        done();
      });
    });

    it('should handle very long messages', (done) => {
      const longMessage = 'A'.repeat(1000);

      service.showSuccess(longMessage);

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages[0].message).toBe(longMessage);
        expect(messages[0].message.length).toBe(1000);
        done();
      });
    });

    it('should handle special characters in messages', (done) => {
      const specialMessage = '!@#$%^&*()_+-=[]{}|;:,.<>?';

      service.showError(specialMessage);

      service.messages$.pipe(take(1)).subscribe(messages => {
        expect(messages[0].message).toBe(specialMessage);
        done();
      });
    });

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

  describe('Memory Management', () => {
    it('should prevent memory leaks by auto-removing messages', (done) => {
      // Add many messages
      for (let i = 0; i < 100; i++) {
        service.showSuccess(`Message ${i}`);
      }

      // Fast-forward to auto-removal time
      jasmine.clock().tick(4001);

      setTimeout(() => {
        service.messages$.pipe(take(1)).subscribe(messages => {
          expect(messages.length).toBe(0);
          done();
        });
      }, 10);
    });

    it('should handle manual removal during auto-removal timer', (done) => {
      service.showSuccess('Test message');

      service.messages$.pipe(take(1)).subscribe(messages => {
        const messageId = messages[0].id;

        // Manually remove before auto-removal
        jasmine.clock().tick(2000);
        service.removeMessage(messageId);

        // Should be removed immediately
        setTimeout(() => {
          service.messages$.pipe(take(1)).subscribe(immediateMessages => {
            expect(immediateMessages.length).toBe(0);

            // Auto-removal timer should not cause issues
            jasmine.clock().tick(3000);

            setTimeout(() => {
              service.messages$.pipe(take(1)).subscribe(finalMessages => {
                expect(finalMessages.length).toBe(0);
                done();
              });
            }, 10);
          });
        }, 10);
      });
    });
  });
});
