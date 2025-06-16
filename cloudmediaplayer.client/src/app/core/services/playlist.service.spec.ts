import { TestBed } from '@angular/core/testing';
import { of, throwError, BehaviorSubject } from 'rxjs';
import { take, skip } from 'rxjs/operators';
import { PlaylistService } from './playlist.service';
import { DropboxService, AuthState } from '@services/dropbox.service';
import { NotificationService } from '@services/notification.service';
import { PlaylistItem, SavedPlaylist, SyncStatus, SyncSettings, DropboxFile } from '@models/index';

describe('PlaylistService', () => {
  let service: PlaylistService;
  let dropboxServiceSpy: jasmine.SpyObj<DropboxService>;
  let notificationServiceSpy: jasmine.SpyObj<NotificationService>;
  let mockAuthState: BehaviorSubject<AuthState>;

  const createMockDropboxFile = (): DropboxFile => ({
    id: 'id_test123',
    name: 'test-playlist.json',
    path_display: '/playlists/test-playlist.json',
    server_modified: '2023-01-01T12:00:00Z',
    rev: 'test-rev-123',
    is_folder: false
  });

  const createMockPlaylistItem = (): PlaylistItem => ({
    file: {
      id: 'id_song123',
      name: 'test-song.mp3',
      path_display: '/music/test-song.mp3',
      is_folder: false
    },
    displayName: 'Test Song'
  });

  const createMockSavedPlaylist = (): SavedPlaylist => ({
    id: 'test-id-123',
    name: 'Test Playlist',
    created: new Date('2023-01-01T10:00:00Z'),
    lastModified: new Date('2023-01-01T11:00:00Z'),
    syncStatus: 'local',
    items: [createMockPlaylistItem()]
  });

  // Mock navigator.onLine 
  beforeAll(() => {
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      configurable: true,
      value: true
    });
  });

  beforeEach(() => {
    const dropboxSpy = jasmine.createSpyObj('DropboxService', [
      'isAuthenticated',
      'getAuthState',
      'uploadFile',
      'downloadFile',
      'deleteFile',
      'listPlaylistFiles'
    ]);

    const notificationSpy = jasmine.createSpyObj('NotificationService', [
      'showError',
      'showSuccess'
    ]);

    mockAuthState = new BehaviorSubject<AuthState>({
      isAuthenticated: true
    } as AuthState);

    // Ensure navigator.onLine before service creation
    (navigator as any).onLine = true;

    TestBed.configureTestingModule({
      providers: [
        PlaylistService,
        { provide: DropboxService, useValue: dropboxSpy },
        { provide: NotificationService, useValue: notificationSpy }
      ]
    });

    dropboxServiceSpy = TestBed.inject(DropboxService) as jasmine.SpyObj<DropboxService>;
    notificationServiceSpy = TestBed.inject(NotificationService) as jasmine.SpyObj<NotificationService>;

    // setup mock returns
    dropboxServiceSpy.getAuthState.and.returnValue(mockAuthState);
    dropboxServiceSpy.isAuthenticated.and.returnValue(true);
    dropboxServiceSpy.uploadFile.and.returnValue(of(createMockDropboxFile()));
    dropboxServiceSpy.downloadFile.and.returnValue(of('{}'));
    dropboxServiceSpy.deleteFile.and.returnValue(of(void 0));
    dropboxServiceSpy.listPlaylistFiles.and.returnValue(of([]));

    // Mock localStorage
    let localStorageData: { [key: string]: string } = {};
    spyOn(localStorage, 'getItem').and.callFake((key: string) => localStorageData[key] || null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => {
      localStorageData[key] = value;
    });
    spyOn(localStorage, 'removeItem').and.callFake((key: string) => {
      delete localStorageData[key];
    });

    // Clear localStorage before each test
    localStorageData = {};

    // Create playlist service after all mocks set up
    service = TestBed.inject(PlaylistService);
  });

  describe('Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });
  });

  describe('Business Logic Methods', () => {
    describe('canSync', () => {
      it('should return true when all conditions are met', () => {
        service.updateSyncSettings({ enabled: true, autoSync: true });
        dropboxServiceSpy.isAuthenticated.and.returnValue(true);

        expect(service.canSync()).toBe(true);
      });

      it('should return false when sync is disabled', () => {
        service.updateSyncSettings({ enabled: false, autoSync: true });
        dropboxServiceSpy.isAuthenticated.and.returnValue(true);

        expect(service.canSync()).toBe(false);
      });

      it('should return false when auto sync is disabled', () => {
        service.updateSyncSettings({ enabled: true, autoSync: false });
        dropboxServiceSpy.isAuthenticated.and.returnValue(true);

        expect(service.canSync()).toBe(false);
      });

      it('should return false when not authenticated', () => {
        service.updateSyncSettings({ enabled: true, autoSync: true });
        dropboxServiceSpy.isAuthenticated.and.returnValue(false);

        expect(service.canSync()).toBe(false);
      });

      it('should return false when offline', (done) => {
        service.updateSyncSettings({ enabled: true, autoSync: true });
        dropboxServiceSpy.isAuthenticated.and.returnValue(true);

        Object.defineProperty(navigator, 'onLine', {
          writable: true,
          value: false
        });

        // Subscribe to status changes and wait for offline status
        service.getSyncStatus().pipe(
          skip(1), // Skip initial value
          take(1)  // Take only the first change
        ).subscribe(status => {
          if (!status.isOnline) {
            expect(service.canSync()).toBe(false);
            done();
          }
        });

        // Dispatch offline event to trigger status change above
        const offlineEvent = new Event('offline');
        window.dispatchEvent(offlineEvent);
      });
    });

    describe('validateSyncConditions', () => {
      it('should return true when all conditions are true', () => {
        expect(service.validateSyncConditions(true, true, true)).toBe(true);
      });

      it('should return false when any condition is false', () => {
        expect(service.validateSyncConditions(false, true, true)).toBe(false);
        expect(service.validateSyncConditions(true, false, true)).toBe(false);
        expect(service.validateSyncConditions(true, true, false)).toBe(false);
      });
    });

    describe('mergePlaylists', () => {
      it('should add new remote playlists', () => {
        const local = [createMockSavedPlaylist()];
        const remote = [{
          ...createMockSavedPlaylist(),
          id: 'remote-id',
          name: 'Remote Playlist'
        }];

        const merged = service.mergePlaylists(local, remote);

        expect(merged.length).toBe(2);
        expect(merged.find(p => p.name === 'Remote Playlist')).toBeTruthy();
      });

      it('should prefer newer versions when merging conflicts', () => {
        const older = new Date('2023-01-01T10:00:00Z');
        const newer = new Date('2023-01-01T12:00:00Z');

        const local = [{
          ...createMockSavedPlaylist(),
          name: 'Same Playlist',
          lastModified: older
        }];

        const remote = [{
          ...createMockSavedPlaylist(),
          name: 'Same Playlist',
          lastModified: newer,
          items: []
        }];

        const merged = service.mergePlaylists(local, remote);

        expect(merged.length).toBe(1);
        expect(merged[0].lastModified).toEqual(newer);
        expect(merged[0].items.length).toBe(0);
      });
    });

    describe('playlistNameExists', () => {
      let getSavedPlaylistsSpy: jasmine.Spy;

      beforeEach(() => {
        getSavedPlaylistsSpy = spyOn(service, 'getSavedPlaylists');
      });

      it('should return true for existing playlist name (case insensitive)', () => {
        const mockPlaylist = createMockSavedPlaylist();
        getSavedPlaylistsSpy.and.returnValue([mockPlaylist]);

        // Test exact match first
        expect(service.playlistNameExists('Test Playlist')).toBe(true);
        // Test case-insensitive matches - these should return true because the service is case-insensitive
        expect(service.playlistNameExists('test playlist')).toBe(true);
        expect(service.playlistNameExists('TEST PLAYLIST')).toBe(true);
        expect(service.playlistNameExists('Test PLAYLIST')).toBe(true);
        expect(service.playlistNameExists('  Test Playlist  ')).toBe(true); // trimming
      });

      it('should return false for non-existing playlist name', () => {
        const mockPlaylist = createMockSavedPlaylist();
        getSavedPlaylistsSpy.and.returnValue([mockPlaylist]);

        expect(service.playlistNameExists('Non-existing Playlist')).toBe(false);
      });

      it('should exclude specified ID when checking', () => {
        const mockPlaylist = createMockSavedPlaylist();
        getSavedPlaylistsSpy.and.returnValue([mockPlaylist]);

        expect(service.playlistNameExists('Test Playlist', 'test-id-123')).toBe(false);
      });
    });

    describe('generatePlaylistPath', () => {
      it('should generate correct Dropbox path', () => {
        const path = service.generatePlaylistPath('My Playlist');
        expect(path).toBe('/playlists/My_Playlist.json');
      });
    });

    describe('sanitizePlaylistName', () => {
      it('should replace invalid characters with underscores', () => {
        const sanitized = service.sanitizePlaylistName('My<>Playlist:Test');
        expect(sanitized).toBe('My_Playlist_Test');
      });

      it('should remove leading and trailing underscores', () => {
        const sanitized = service.sanitizePlaylistName('  My Playlist  ');
        expect(sanitized).toBe('My_Playlist');
      });

      it('should return "Untitled" for empty names', () => {
        expect(service.sanitizePlaylistName('')).toBe('Untitled');
        expect(service.sanitizePlaylistName('   ')).toBe('Untitled');
      });

      it('should truncate long names', () => {
        const longName = 'a'.repeat(300);
        const sanitized = service.sanitizePlaylistName(longName);
        expect(sanitized.length).toBeLessThanOrEqual(255);
      });
    });

    describe('generatePlaylistId', () => {
      it('should generate unique IDs', () => {
        const id1 = service.generatePlaylistId();
        const id2 = service.generatePlaylistId();

        expect(id1).toBeTruthy();
        expect(id2).toBeTruthy();
        expect(id1).not.toBe(id2);
      });
    });

    describe('getPlaylistDisplayName', () => {
      it('should format singular song count', () => {
        const displayName = service.getPlaylistDisplayName('My Playlist', 1);
        expect(displayName).toBe('My Playlist (1 song)');
      });

      it('should format plural song count', () => {
        const displayName = service.getPlaylistDisplayName('My Playlist', 5);
        expect(displayName).toBe('My Playlist (5 songs)');
      });
    });

    describe('getSyncStatusIcon and getSyncStatusTooltip', () => {
      it('should return local icon when sync disabled', () => {
        const mockPlaylist = createMockSavedPlaylist();
        const icon = service.getSyncStatusIcon(mockPlaylist, false);
        const tooltip = service.getSyncStatusTooltip(mockPlaylist, false);

        expect(icon).toBe('💾');
        expect(tooltip).toBe('Sync disabled - saved locally only');
      });

      it('should return correct icons for different sync statuses', () => {
        const testCases = [
          { status: 'synced' as const, icon: '☁️', tooltip: 'Synced to Dropbox' },
          { status: 'syncing' as const, icon: '🔄', tooltip: 'Syncing to Dropbox...' },
          { status: 'local' as const, icon: '💾', tooltip: 'Saved locally only' },
          { status: 'error' as const, icon: '⚠️', tooltip: 'Sync failed - right-click to retry' }
        ];

        testCases.forEach(testCase => {
          const playlist = { ...createMockSavedPlaylist(), syncStatus: testCase.status };
          expect(service.getSyncStatusIcon(playlist, true)).toBe(testCase.icon);
          expect(service.getSyncStatusTooltip(playlist, true)).toBe(testCase.tooltip);
        });
      });
    });

    describe('validatePlaylistData', () => {
      it('should return valid for good data', () => {
        const mockItem = createMockPlaylistItem();
        const result = service.validatePlaylistData('Valid Name', [mockItem]);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });

      it('should return invalid for empty name', () => {
        const mockItem = createMockPlaylistItem();
        const result = service.validatePlaylistData('', [mockItem]);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Playlist name cannot be empty');
      });

      it('should return invalid for whitespace-only playlist names', () => {
        const validation = service.validatePlaylistData('   ', []);
        expect(validation.valid).toBe(false);
        expect(validation.error).toBe('Playlist name cannot be empty');
      });

      it('should return invalid for long name', () => {
        const longName = 'a'.repeat(300);
        const mockItem = createMockPlaylistItem();
        const result = service.validatePlaylistData(longName, [mockItem]);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Playlist name is too long');
      });

      it('should return invalid for non-array items', () => {
        const result = service.validatePlaylistData('Valid Name', null as any);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid playlist items');
      });
    });

    describe('createPlaylistItem', () => {
      it('should create playlist item with file', () => {
        const file: DropboxFile = {
          id: 'id_123',
          name: 'song.mp3',
          path_display: '/music/song.mp3',
          is_folder: false
        };
        const item = service.createPlaylistItem(file);

        expect(item.file).toBe(file);
        expect(item.displayName).toBe('song.mp3');
      });

      it('should use custom display name when provided', () => {
        const file: DropboxFile = {
          id: 'id_123',
          name: 'song.mp3',
          path_display: '/music/song.mp3',
          is_folder: false
        };
        const item = service.createPlaylistItem(file, 'Custom Name');

        expect(item.displayName).toBe('Custom Name');
      });
    });
  });

  describe('Local Storage Operations', () => {
    describe('getSavedPlaylists', () => {
      it('should return empty array when no playlists stored', () => {
        const playlists = service.getSavedPlaylists();
        expect(playlists).toEqual([]);
      });

      it('should return stored playlists with converted dates', () => {
        const mockPlaylist = createMockSavedPlaylist();
        const storedData = JSON.stringify([{
          ...mockPlaylist,
          created: mockPlaylist.created.toISOString(),
          lastModified: mockPlaylist.lastModified.toISOString()
        }]);

        (localStorage.getItem as jasmine.Spy).and.returnValue(storedData);

        const playlists = service.getSavedPlaylists();
        expect(playlists.length).toBe(1);
        expect(playlists[0].created instanceof Date).toBe(true);
        expect(playlists[0].lastModified instanceof Date).toBe(true);
      });

      it('should handle corrupted storage gracefully', () => {
        (localStorage.getItem as jasmine.Spy).and.returnValue('invalid json');

        const playlists = service.getSavedPlaylists();

        expect(playlists).toEqual([]);
        expect(notificationServiceSpy.showError).toHaveBeenCalledWith('Error loading saved playlists');
      });
    });

    describe('loadPlaylist', () => {
      let getSavedPlaylistsSpy: jasmine.Spy;

      beforeEach(() => {
        getSavedPlaylistsSpy = spyOn(service, 'getSavedPlaylists');
      });

      it('should return playlist by ID', () => {
        const mockPlaylist = createMockSavedPlaylist();
        getSavedPlaylistsSpy.and.returnValue([mockPlaylist]);

        const playlist = service.loadPlaylist('test-id-123');
        expect(playlist).toEqual(mockPlaylist);
      });

      it('should return null for non-existing ID', () => {
        const mockPlaylist = createMockSavedPlaylist();
        getSavedPlaylistsSpy.and.returnValue([mockPlaylist]);

        const playlist = service.loadPlaylist('non-existing-id');
        expect(playlist).toBeNull();
      });
    });
  });

  describe('Playlist Management', () => {
    describe('savePlaylist', () => {
      let getSavedPlaylistsSpy: jasmine.Spy;

      beforeEach(() => {
        getSavedPlaylistsSpy = spyOn(service, 'getSavedPlaylists').and.returnValue([]);
        dropboxServiceSpy.uploadFile.and.returnValue(of(createMockDropboxFile()));
      });

      it('should save playlist locally when sync is disabled', (done) => {
        service.updateSyncSettings({ enabled: false });

        const mockItem = createMockPlaylistItem();
        service.savePlaylist('Test Playlist', [mockItem]).pipe(take(1)).subscribe(playlist => {
          expect(playlist.name).toBe('Test Playlist');
          expect(playlist.syncStatus).toBe('local');
          expect(localStorage.setItem).toHaveBeenCalled();
          done();
        });
      });

      it('should sync to Dropbox when conditions are met', (done) => {
        service.updateSyncSettings({ enabled: true, autoSync: true });

        // Reset spy calls to ensure clean state
        dropboxServiceSpy.uploadFile.calls.reset();

        const mockItem = createMockPlaylistItem();
        let emissionCount = 0;
        service.savePlaylist('Test Playlist', [mockItem]).subscribe(playlist => {
          emissionCount++;
          if (emissionCount === 2) { // Wait for the synced result
            expect(dropboxServiceSpy.uploadFile).toHaveBeenCalled();
            expect(playlist.syncStatus).toBe('synced');
            done();
          }
        });
      });

      it('should handle sync errors gracefully', (done) => {
        service.updateSyncSettings({ enabled: true, autoSync: true });
        dropboxServiceSpy.uploadFile.and.returnValue(throwError('Sync error'));

        const mockItem = createMockPlaylistItem();
        let emissionCount = 0;
        service.savePlaylist('Test Playlist', [mockItem]).subscribe(playlist => {
          emissionCount++;
          if (emissionCount === 2) { // Wait for the error result
            expect(playlist.syncStatus).toBe('error');
            expect(notificationServiceSpy.showError).toHaveBeenCalledWith('Error syncing playlist to Dropbox');
            done();
          }
        });
      });

      it('should validate playlist name not empty', (done) => {
        const mockItem = createMockPlaylistItem();
        service.savePlaylist('', [mockItem]).subscribe({
          error: (error) => {
            expect(error.message).toBe('Playlist name cannot be empty');
            done();
          }
        });
      });

      it('should update existing playlist when ID provided', (done) => {
        const existingPlaylist = createMockSavedPlaylist();
        getSavedPlaylistsSpy.and.returnValue([existingPlaylist]);
        service.updateSyncSettings({ enabled: false });

        const mockItem = createMockPlaylistItem();
        service.savePlaylist('Updated Name', [mockItem], 'test-id-123').pipe(take(1)).subscribe(playlist => {
          expect(playlist.id).toBe('test-id-123');
          expect(playlist.name).toBe('Updated Name');
          expect(playlist.created).toEqual(existingPlaylist.created);
          done();
        });
      });
    });

    describe('deletePlaylist', () => {
      let getSavedPlaylistsSpy: jasmine.Spy;

      beforeEach(() => {
        getSavedPlaylistsSpy = spyOn(service, 'getSavedPlaylists');
        dropboxServiceSpy.deleteFile.and.returnValue(of(void 0));
      });

      it('should delete playlist locally', (done) => {
        const mockPlaylist = createMockSavedPlaylist();
        getSavedPlaylistsSpy.and.returnValue([mockPlaylist]);

        service.deletePlaylist('test-id-123').subscribe(result => {
          expect(result).toBe(true);
          expect(localStorage.setItem).toHaveBeenCalled();
          done();
        });
      });

      it('should delete from Dropbox when synced', (done) => {
        const syncedPlaylist = { ...createMockSavedPlaylist(), syncStatus: 'synced' as const };
        getSavedPlaylistsSpy.and.returnValue([syncedPlaylist]);
        service.updateSyncSettings({ enabled: true, autoSync: true });

        service.deletePlaylist('test-id-123').subscribe(result => {
          expect(result).toBe(true);
          expect(dropboxServiceSpy.deleteFile).toHaveBeenCalled();
          done();
        });
      });

      it('should return false for non-existing playlist', (done) => {
        getSavedPlaylistsSpy.and.returnValue([]);

        service.deletePlaylist('non-existing-id').subscribe(result => {
          expect(result).toBe(false);
          done();
        });
      });
    });

    describe('renamePlaylist', () => {
      let getSavedPlaylistsSpy: jasmine.Spy;

      beforeEach(() => {
        getSavedPlaylistsSpy = spyOn(service, 'getSavedPlaylists');
        dropboxServiceSpy.deleteFile.and.returnValue(of(void 0));
        dropboxServiceSpy.uploadFile.and.returnValue(of(createMockDropboxFile()));
      });

      it('should rename playlist locally', (done) => {
        const mockPlaylist = createMockSavedPlaylist();
        getSavedPlaylistsSpy.and.returnValue([mockPlaylist]);
        service.updateSyncSettings({ enabled: false });

        service.renamePlaylist('test-id-123', 'New Name').subscribe(result => {
          expect(result).toBe(true);
          expect(localStorage.setItem).toHaveBeenCalled();
          done();
        });
      });

      it('should sync renamed playlist to Dropbox', (done) => {
        const mockPlaylist = createMockSavedPlaylist();
        getSavedPlaylistsSpy.and.returnValue([mockPlaylist]);
        service.updateSyncSettings({ enabled: true, autoSync: true });

        service.renamePlaylist('test-id-123', 'New Name').subscribe(result => {
          expect(result).toBe(true);
          expect(dropboxServiceSpy.deleteFile).toHaveBeenCalled();
          expect(dropboxServiceSpy.uploadFile).toHaveBeenCalled();
          done();
        });
      });

      it('should return false for non-existing playlist', (done) => {
        getSavedPlaylistsSpy.and.returnValue([]);

        service.renamePlaylist('non-existing-id', 'New Name').subscribe(result => {
          expect(result).toBe(false);
          done();
        });
      });
    });
  });

  describe('Sync Operations', () => {
    describe('syncPlaylists', () => {
      let getSavedPlaylistsSpy: jasmine.Spy;

      beforeEach(() => {
        getSavedPlaylistsSpy = spyOn(service, 'getSavedPlaylists');
        dropboxServiceSpy.listPlaylistFiles.and.returnValue(of([createMockDropboxFile()]));
        dropboxServiceSpy.downloadFile.and.returnValue(of(JSON.stringify({
          id: 'remote-id',
          name: 'test-playlist',
          created: '2023-01-01T10:00:00Z',
          lastModified: '2023-01-01T11:00:00Z',
          items: []
        })));
        service.updateSyncSettings({ enabled: true, autoSync: true });
      });

      it('should not sync when conditions not met', (done) => {
        service.updateSyncSettings({ enabled: false });

        // Reset the spy call count since it may have been called during setup
        dropboxServiceSpy.listPlaylistFiles.calls.reset();

        service.syncPlaylists().subscribe(() => {
          expect(dropboxServiceSpy.listPlaylistFiles).not.toHaveBeenCalled();
          done();
        });
      });

      it('should download new playlists from Dropbox', (done) => {
        getSavedPlaylistsSpy.and.returnValue([]);

        service.syncPlaylists().subscribe(() => {
          expect(dropboxServiceSpy.downloadFile).toHaveBeenCalled();
          expect(localStorage.setItem).toHaveBeenCalled();
          done();
        });
      });

      it('should upload local playlists to Dropbox', (done) => {
        const localPlaylist = { ...createMockSavedPlaylist(), syncStatus: 'local' as const };
        getSavedPlaylistsSpy.and.returnValue([localPlaylist]);
        dropboxServiceSpy.listPlaylistFiles.and.returnValue(of([]));
        dropboxServiceSpy.uploadFile.and.returnValue(of(createMockDropboxFile()));

        service.syncPlaylists().subscribe(() => {
          expect(dropboxServiceSpy.uploadFile).toHaveBeenCalled();
          done();
        });
      });

      it('should handle sync errors gracefully', (done) => {
        dropboxServiceSpy.listPlaylistFiles.and.returnValue(throwError('Network error'));

        service.syncPlaylists().subscribe(() => {
          expect(notificationServiceSpy.showError).toHaveBeenCalledWith('Error syncing playlists with Dropbox');
          done();
        });
      });
    });

    describe('forceSyncPlaylist', () => {
      it('should sync specific playlist', (done) => {
        const mockPlaylist = createMockSavedPlaylist();
        spyOn(service, 'loadPlaylist').and.returnValue(mockPlaylist);
        spyOn(service, 'canSync').and.returnValue(true);
        dropboxServiceSpy.uploadFile.and.returnValue(of(createMockDropboxFile()));

        service.forceSyncPlaylist('test-id-123').subscribe(playlist => {
          expect(dropboxServiceSpy.uploadFile).toHaveBeenCalled();
          expect(playlist.syncStatus).toBe('synced');
          done();
        });
      });

      it('should return original playlist when sync not possible', (done) => {
        const mockPlaylist = createMockSavedPlaylist();
        spyOn(service, 'loadPlaylist').and.returnValue(mockPlaylist);
        spyOn(service, 'canSync').and.returnValue(false);

        service.forceSyncPlaylist('test-id-123').subscribe(playlist => {
          expect(playlist).toEqual(mockPlaylist);
          expect(dropboxServiceSpy.uploadFile).not.toHaveBeenCalled();
          done();
        });
      });
    });
  });

  describe('Current Playlist State', () => {
    describe('saveCurrentPlaylist', () => {
      it('should save current playlist state', () => {
        const mockItem = createMockPlaylistItem();
        service.saveCurrentPlaylist([mockItem], 0);

        expect(localStorage.setItem).toHaveBeenCalledWith(
          jasmine.stringMatching(/currentPlaylist/),
          jasmine.any(String)
        );
      });

      it('should handle save errors gracefully', () => {
        (localStorage.setItem as jasmine.Spy).and.throwError('Storage error');

        const mockItem = createMockPlaylistItem();
        service.saveCurrentPlaylist([mockItem], 0);

        expect(notificationServiceSpy.showError).toHaveBeenCalledWith('Error saving playlist state');
      });
    });

    describe('loadCurrentPlaylist', () => {
      it('should load current playlist state', () => {
        const mockItem = createMockPlaylistItem();
        const state = {
          items: [mockItem],
          currentIndex: -1,
          timestamp: new Date()
        };
        (localStorage.getItem as jasmine.Spy).and.returnValue(JSON.stringify(state));

        const loaded = service.loadCurrentPlaylist();

        expect(loaded).toBeTruthy();
        expect(loaded!.items.length).toBe(1);
        expect(loaded!.currentIndex).toBe(-1);
      });

      it('should return null when no state stored', () => {
        (localStorage.getItem as jasmine.Spy).and.returnValue(null);

        const loaded = service.loadCurrentPlaylist();

        expect(loaded).toBeNull();
      });

      it('should handle load errors gracefully', () => {
        (localStorage.getItem as jasmine.Spy).and.returnValue('invalid json');

        const loaded = service.loadCurrentPlaylist();

        expect(loaded).toBeNull();
        expect(notificationServiceSpy.showError).toHaveBeenCalledWith('Error loading playlist state');
      });
    });

    describe('clearCurrentPlaylist', () => {
      it('should clear current playlist state', () => {
        service.clearCurrentPlaylist();

        expect(localStorage.removeItem).toHaveBeenCalledWith(
          jasmine.stringMatching(/currentPlaylist/)
        );
      });
    });
  });

  describe('Sync Settings Management', () => {
    describe('updateSyncSettings', () => {
      it('should update sync settings', (done) => {
        const newSettings = { enabled: false, autoSync: false };

        // subscribe to capture the change
        service.getSyncSettings().pipe(
          skip(1), // Skip the current value
          take(1)  // Take first update
        ).subscribe(settings => {
          expect(settings.enabled).toBe(false);
          expect(settings.autoSync).toBe(false);
          done();
        });

        // Then trigger update
        service.updateSyncSettings(newSettings);

        expect(localStorage.setItem).toHaveBeenCalledWith(
          jasmine.stringMatching(/syncSettings/),
          jasmine.any(String)
        );
      });
    });
  });

  describe('Utility Methods', () => {
    describe('transformPlaylistToDropboxFormat', () => {
      it('should transform playlist to Dropbox format', () => {
        const mockPlaylist = createMockSavedPlaylist();
        const transformed = service.transformPlaylistToDropboxFormat(mockPlaylist);

        expect(transformed.id).toBe(mockPlaylist.id);
        expect(transformed.name).toBe(mockPlaylist.name);
        expect(transformed.created).toBe(mockPlaylist.created.toISOString());
        expect(transformed.lastModified).toBe(mockPlaylist.lastModified.toISOString());
        expect(transformed.items[0].path).toBe(mockPlaylist.items[0].file.path_display);
        expect(transformed.items[0].displayName).toBe(mockPlaylist.items[0].displayName);
      });
    });

    describe('transformDropboxPlaylistToLocal', () => {
      it('should transform Dropbox playlist to local format', () => {
        const dropboxData = {
          id: 'dropbox-id',
          name: 'Dropbox Playlist',
          created: '2023-01-01T10:00:00Z',
          lastModified: '2023-01-01T11:00:00Z',
          items: [{ path: '/music/song.mp3', displayName: 'Song' }]
        };

        const mockDropboxFile = createMockDropboxFile();
        const transformed = service.transformDropboxPlaylistToLocal(dropboxData, mockDropboxFile);

        expect(transformed.id).toBe('dropbox-id');
        expect(transformed.name).toBe('Dropbox Playlist');
        expect(transformed.created instanceof Date).toBe(true);
        expect(transformed.lastModified instanceof Date).toBe(true);
        expect(transformed.syncStatus).toBe('synced');
        expect(transformed.dropboxRev).toBe(mockDropboxFile.rev);
        expect(transformed.items[0].file.path_display).toBe('/music/song.mp3');
        expect(transformed.items[0].displayName).toBe('Song');
      });

      it('should generate ID when not provided', () => {
        const dropboxData = {
          name: 'Dropbox Playlist',
          created: '2023-01-01T10:00:00Z',
          lastModified: '2023-01-01T11:00:00Z',
          items: []
        };

        const transformed = service.transformDropboxPlaylistToLocal(dropboxData);

        expect(transformed.id).toBeTruthy();
        expect(typeof transformed.id).toBe('string');
      });
    });
  });

  describe('Event Listeners', () => {
    it('should update sync status when going online', (done) => {
      // Subscribe to status changes and wait for online status
      service.getSyncStatus().pipe(
        skip(1), // Skip initial value
        take(1)  // Take only the first change
      ).subscribe(status => {
        if (status.isOnline === true) {
          done();
        }
      });

      // Trigger the online event
      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);
    });

    it('should update sync status when going offline', (done) => {
      // Subscribe to status changes and wait for offline status
      service.getSyncStatus().pipe(
        skip(1), // Skip initial value
        take(1)  // Take only the first change
      ).subscribe(status => {
        if (status.isOnline === false) {
          done();
        }
      });

      // Trigger the offline event
      const offlineEvent = new Event('offline');
      window.dispatchEvent(offlineEvent);
    });

    it('should trigger sync when coming online if conditions are met', () => {
      spyOn(service, 'canSync').and.returnValue(true);
      spyOn(service, 'syncPlaylists').and.returnValue(of(void 0));

      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);

      expect(service.syncPlaylists).toHaveBeenCalled();
    });

    it('should not trigger sync when coming online if conditions not met', () => {
      spyOn(service, 'canSync').and.returnValue(false);
      spyOn(service, 'syncPlaylists').and.returnValue(of(void 0));

      const onlineEvent = new Event('online');
      window.dispatchEvent(onlineEvent);

      expect(service.syncPlaylists).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle localStorage errors gracefully in getSavedPlaylists', () => {
      (localStorage.getItem as jasmine.Spy).and.throwError('Storage error');

      const playlists = service.getSavedPlaylists();

      expect(playlists).toEqual([]);
      expect(notificationServiceSpy.showError).toHaveBeenCalledWith('Error loading saved playlists');
    });

    it('should handle localStorage errors gracefully in storePlaylists', (done) => {
      (localStorage.setItem as jasmine.Spy).and.throwError('Storage error');
      spyOn(service, 'getSavedPlaylists').and.returnValue([]);

      const mockItem = createMockPlaylistItem();
      service.savePlaylist('Test', [mockItem]).pipe(take(1)).subscribe({
        next: () => {
          // The save should still complete despite storage error
          expect(notificationServiceSpy.showError).toHaveBeenCalledWith('Error saving playlists');
          done();
        },
        error: (error) => {
          // Alternative path - if it throws an error instead
          expect(notificationServiceSpy.showError).toHaveBeenCalledWith('Error saving playlist');
          done();
        }
      });
    });

    it('should handle sync settings load errors gracefully', () => {
      (localStorage.getItem as jasmine.Spy).and.throwError('Storage error');

      // Create new service instance to trigger loadSyncSettings
      const newService = new PlaylistService(dropboxServiceSpy, notificationServiceSpy);

      expect(notificationServiceSpy.showError).toHaveBeenCalledWith('Error loading sync settings');
    });

    it('should handle sync settings store errors gracefully', () => {
      (localStorage.setItem as jasmine.Spy).and.throwError('Storage error');

      service.updateSyncSettings({ enabled: false });

      expect(notificationServiceSpy.showError).toHaveBeenCalledWith('Error saving sync settings');
    });
  });

  describe('Integration Tests', () => {
    describe('Sync conflict resolution', () => {
      it('should resolve conflicts by preferring newer version', () => {
        const olderDate = new Date('2023-01-01T10:00:00Z');
        const newerDate = new Date('2023-01-01T12:00:00Z');

        const localPlaylist = {
          ...createMockSavedPlaylist(),
          name: 'Conflict Test',
          lastModified: olderDate,
          items: [createMockPlaylistItem()]
        };

        const remotePlaylist = {
          ...createMockSavedPlaylist(),
          name: 'Conflict Test',
          lastModified: newerDate,
          items: [] // Different content
        };

        const merged = service.mergePlaylists([localPlaylist], [remotePlaylist]);

        expect(merged.length).toBe(1);
        expect(merged[0].lastModified).toEqual(newerDate);
        expect(merged[0].items.length).toBe(0); // Should use remote version
      });
    });

    describe('Offline/Online behavior', () => {
      beforeEach(() => {
        service.updateSyncSettings({ enabled: true, autoSync: true });
        spyOn(service, 'syncPlaylists').and.returnValue(of(void 0));
      });

      it('should save locally when offline and sync when coming online', (done) => {
        // Set offline
        Object.defineProperty(navigator, 'onLine', { value: false });

        const mockItem = createMockPlaylistItem();
        // Save playlist while offline
        service.savePlaylist('Offline Test', [mockItem]).pipe(take(1)).subscribe(offlinePlaylist => {
          expect(offlinePlaylist.syncStatus).toBe('local');

          // Go online
          Object.defineProperty(navigator, 'onLine', { value: true });
          const onlineEvent = new Event('online');
          window.dispatchEvent(onlineEvent);

          // Should trigger sync
          expect(service.syncPlaylists).toHaveBeenCalled();
          done();
        });
      });
    });
  });

  describe('Boundary Conditions', () => {
    it('should handle maximum length playlist names (255 characters)', () => {
      const maxLengthName = 'a'.repeat(255);
      const validation = service.validatePlaylistData(maxLengthName, []);
      expect(validation.valid).toBe(true);
      expect(validation.error).toBeUndefined();
    });

    it('should reject names exceeding 255 characters', () => {
      const overBoundaryName = 'a'.repeat(256);
      const validation = service.validatePlaylistData(overBoundaryName, []);
      expect(validation.valid).toBe(false);
      expect(validation.error).toBe('Playlist name is too long');
    });
  });

  describe('Performance and Memory', () => {
    beforeEach(() => {
      // Set up spies for performance tests
      dropboxServiceSpy.uploadFile.and.returnValue(of(createMockDropboxFile()));
      dropboxServiceSpy.listPlaylistFiles.and.returnValue(of([]));
      dropboxServiceSpy.downloadFile.and.returnValue(of('{}'));
      dropboxServiceSpy.deleteFile.and.returnValue(of(void 0));
    });

    it('should handle subscription cleanup properly', () => {
      // Test that subscriptions can be created and destroyed without errors
      const subscription1 = service.getSyncStatus().subscribe();
      const subscription2 = service.getSyncSettings().subscribe();

      subscription1.unsubscribe();
      subscription2.unsubscribe();

      // Verify no errors occur during cleanup
      expect(subscription1.closed).toBe(true);
      expect(subscription2.closed).toBe(true);
    });

    it('should handle large playlists efficiently', (done) => {
      const largePlaylist = Array(1000).fill(0).map((_, i) => ({
        ...createMockPlaylistItem(),
        displayName: `Song ${i}`
      }));

      service.updateSyncSettings({ enabled: false });

      const startTime = performance.now();
      service.savePlaylist('Large Playlist', largePlaylist).pipe(take(1)).subscribe(playlist => {
        const endTime = performance.now();
        const duration = endTime - startTime;

        expect(playlist.items.length).toBe(1000);
        expect(duration).toBeLessThan(1000); // Should complete within 1 second
        done();
      });
    });   
  });
});
