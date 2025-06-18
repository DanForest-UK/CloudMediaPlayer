import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NotificationComponent } from './notification.component';
import { NotificationService } from '@services/notification.service';
import { NotificationMessage } from '@models/notification.model';

describe('NotificationComponent', () => {
  let component: NotificationComponent;
  let fixture: ComponentFixture<NotificationComponent>;
  let notificationService: NotificationService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotificationComponent],
      providers: [NotificationService]
    }).compileComponents();

    fixture = TestBed.createComponent(NotificationComponent);
    component = fixture.componentInstance;
    notificationService = TestBed.inject(NotificationService);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display notifications from service', () => {
    const testMessage: NotificationMessage = {
      id: 'test-1',
      type: 'success',
      message: 'Test success message',
      timestamp: new Date()
    };

    notificationService.showSuccess('Test success message');
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const notification = compiled.querySelector('.notification');
    expect(notification).toBeTruthy();
    expect(notification.textContent).toContain('Test success message');
  });

  it('should remove notification when clicked', () => {
    notificationService.showSuccess('Test message');
    fixture.detectChanges();

    const notification = fixture.nativeElement.querySelector('.notification');
    notification.click();
    fixture.detectChanges();

    const notifications = fixture.nativeElement.querySelectorAll('.notification');
    expect(notifications.length).toBe(0);
  });

  it('should track notifications by ID', () => {
    const testMessage: NotificationMessage = {
      id: 'test-1',
      type: 'success',
      message: 'Test message',
      timestamp: new Date()
    };

    const trackId = component.trackByMessageId(0, testMessage);
    expect(trackId).toBe('test-1');
  });

  it('should handle different notification types', () => {
    notificationService.showSuccess('Success message');
    notificationService.showError('Error message');
    fixture.detectChanges();

    const notifications = fixture.nativeElement.querySelectorAll('.notification');
    expect(notifications.length).toBe(2);
    expect(notifications[0].classList).toContain('success');
    expect(notifications[1].classList).toContain('error');
  });

  it('should unsubscribe on destroy', () => {
    component.ngOnInit();
    spyOn(component['subscription']!, 'unsubscribe');

    component.ngOnDestroy();

    expect(component['subscription']!.unsubscribe).toHaveBeenCalled();
  });
});
