import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AppComponent } from './app.component';
import { DropboxService } from '@services/dropbox.service';
import { PlaylistService } from '@services/playlist.service';
import { NotificationService } from '@services/notification.service';

describe('App Integration Tests', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;
  let mockDropboxService: jasmine.SpyObj<DropboxService>;
  let mockPlaylistService: jasmine.SpyObj<PlaylistService>;
  let notificationService: NotificationService;

  beforeEach(async () => {
    mockDropboxService = jasmine.createSpyObj('DropboxService', [
      'isAuthenticated',
      'getAuthState',
      'listFolder',
      'getTemporaryLink',
      'collectAllAudioFilesRecursively',
      'getFolderScanProgress'
    ]);

    mockPlaylistService = jasmine.createSpyObj('PlaylistService', [
      'getSavedPlaylists',
      'savePlaylist',
      'savePlaylistAs',
      'loadPlaylist',
      'deletePlaylist',
      'renamePlaylist',
      'forceSyncPlaylist',
      'playlistNameExists',
      'syncPlaylists',
      'getSyncStatus',
      'getSyncSettings',
      'updateSyncSettings',
      'loadCurrentPlaylist',
      'saveCurrentPlaylist',
      'clearCurrentPlaylist'
    ]);

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DropboxService, useValue: mockDropboxService },
        { provide: PlaylistService, useValue: mockPlaylistService },
        NotificationService
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
    notificationService = TestBed.inject(NotificationService);

    // Setup default spy returns
    setupDefaultSpyReturns();
  });

  function setupDefaultSpyReturns() {
    // DropboxService defaults
    mockDropboxService.isAuthenticated.and.returnValue(false);
    mockDropboxService.getAuthState.and.returnValue(of({
      isAuthenticated: false,
      userInfo: null,
      tokenExpiry: null,
      error: null
    }));
    mockDropboxService.listFolder.and.returnValue(of([]));
    mockDropboxService.getTemporaryLink.and.returnValue(of(''));
    mockDropboxService.collectAllAudioFilesRecursively.and.returnValue(of([]));
    mockDropboxService.getFolderScanProgress.and.returnValue(of({
      currentPath: '',
      isScanning: false,
      totalAudioFiles: 0
    }));

    // PlaylistService defaults
    mockPlaylistService.getSavedPlaylists.and.returnValue([]);
    mockPlaylistService.getSyncStatus.and.returnValue(of({
      isOnline: true,
      isSyncing: false,
      lastSync: null,
      pendingUploads: 0,
      error: null
    }));
    mockPlaylistService.getSyncSettings.and.returnValue(of({
      enabled: true,
      autoSync: true
    }));
    mockPlaylistService.loadCurrentPlaylist.and.returnValue(null);
    mockPlaylistService.syncPlaylists.and.returnValue(of(void 0));
    mockPlaylistService.savePlaylist.and.returnValue(of({} as any));
    mockPlaylistService.savePlaylistAs.and.returnValue(of({} as any));
    mockPlaylistService.deletePlaylist.and.returnValue(of(true));
    mockPlaylistService.renamePlaylist.and.returnValue(of(true));
    mockPlaylistService.forceSyncPlaylist.and.returnValue(of({} as any));
    mockPlaylistService.playlistNameExists.and.returnValue(false);
  }

  it('should create the app with all components', () => {
    expect(component).toBeTruthy();
    fixture.detectChanges();

    // Check that main components are present
    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('h1')).toBeTruthy();
    expect(compiled.querySelector('app-media-player')).toBeTruthy();
    expect(compiled.querySelector('app-notifications')).toBeTruthy();
  });

  it('should display authentication prompt when not authenticated', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('app-dropbox-connect')).toBeTruthy();
  });

  it('should show notifications when service emits messages', async () => {
    // Set up authenticated state so all components are rendered
    mockDropboxService.isAuthenticated.and.returnValue(true);
    mockDropboxService.getAuthState.and.returnValue(of({
      isAuthenticated: true,
      userInfo: null,
      tokenExpiry: null,
      error: null
    }));

    fixture.detectChanges();
    await fixture.whenStable();

    // Clear any existing notifications that might have been shown during setup
    notificationService.clearAll();

    // Now emit our test notification
    notificationService.showSuccess('Test notification');
    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    const notification = compiled.querySelector('.notification');
    expect(notification).toBeTruthy();
    expect(notification.textContent).toContain('Test notification');
  });

  it('should display media player when authenticated', () => {
    // Setup authenticated state
    mockDropboxService.isAuthenticated.and.returnValue(true);
    mockDropboxService.getAuthState.and.returnValue(of({
      isAuthenticated: true,
      userInfo: null,
      tokenExpiry: null,
      error: null
    }));

    fixture.detectChanges();

    const compiled = fixture.nativeElement;
    expect(compiled.querySelector('app-media-player')).toBeTruthy();
  });

  it('should handle component communication through the app', async () => {
    // Set up authenticated state so all components are rendered
    mockDropboxService.isAuthenticated.and.returnValue(true);
    mockDropboxService.getAuthState.and.returnValue(of({
      isAuthenticated: true,
      userInfo: null,
      tokenExpiry: null,
      error: null
    }));

    // Trigger change detection to initialize all child components
    fixture.detectChanges();

    // Wait for async operations to complete
    await fixture.whenStable();

    // ensure all components are initialized
    fixture.detectChanges();

    // should coordinate between components
    expect(component).toBeTruthy();

    // Verify that child components are calling the expected service methods
    expect(mockPlaylistService.getSyncStatus).toHaveBeenCalled();
    expect(mockPlaylistService.getSyncSettings).toHaveBeenCalled();
  });

  it('should maintain consistent state across all components', async () => {
    // Set up authenticated state so all components are rendered
    mockDropboxService.isAuthenticated.and.returnValue(true);
    mockDropboxService.getAuthState.and.returnValue(of({
      isAuthenticated: true,
      userInfo: null,
      tokenExpiry: null,
      error: null
    }));

    // initialize all child components
    fixture.detectChanges();

    // Wait for async operations to complete
    await fixture.whenStable();

    // another change detection cycle
    fixture.detectChanges();

    // All components should receive the same service instances
    expect(mockDropboxService.getAuthState).toHaveBeenCalled();
    expect(mockPlaylistService.getSyncStatus).toHaveBeenCalled();
    expect(mockPlaylistService.getSyncSettings).toHaveBeenCalled();
  });
});
