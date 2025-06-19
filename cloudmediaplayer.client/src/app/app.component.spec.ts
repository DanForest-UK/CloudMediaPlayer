import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app.component';
import { DropboxService } from '@services/dropbox.service';
import { PlaylistService } from '@services/playlist.service';
import { NotificationService } from '@services/notification.service';
import { of } from 'rxjs';

describe('AppComponent', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;
  let mockDropboxService: jasmine.SpyObj<DropboxService>;
  let mockPlaylistService: jasmine.SpyObj<PlaylistService>;

  beforeEach(async () => {
    // Create service mocks
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

    // Setup default spy returns
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
  });

  beforeEach(() => {
    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
  });

  it('should create the app', () => {
    expect(component).toBeTruthy();
  });

  it('should have the correct title', () => {
    expect(component.title).toBe('cloudmediaplayer.client');
  });

  it('should render the app template', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Cloud Media Player');
  });
});
