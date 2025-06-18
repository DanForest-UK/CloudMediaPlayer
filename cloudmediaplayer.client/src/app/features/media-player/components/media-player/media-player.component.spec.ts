import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { MediaPlayerComponent } from './media-player.component';
import { DropboxService } from '@services/dropbox.service';
import { PlaylistService } from '@services/playlist.service';
import { NotificationService } from '@services/notification.service';
import { DropboxFile, PlaylistItem, SavedPlaylist, AuthState } from '@models/index';

describe('MediaPlayerComponent', () => {
  let component: MediaPlayerComponent;
  let fixture: ComponentFixture<MediaPlayerComponent>;
  let mockDropboxService: jasmine.SpyObj<DropboxService>;
  let mockPlaylistService: jasmine.SpyObj<PlaylistService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;

  const mockDropboxFile: DropboxFile = {
    id: '1',
    name: 'test.mp3',
    path_display: '/test.mp3',
    is_folder: false
  };

  const mockPlaylistItem: PlaylistItem = {
    file: mockDropboxFile,
    displayName: 'Test Song'
  };

  const mockSavedPlaylist: SavedPlaylist = {
    id: 'playlist1',
    name: 'Test Playlist',
    items: [mockPlaylistItem],
    created: new Date(),
    lastModified: new Date(),
    syncStatus: 'local'
  };

  const mockAuthState: AuthState = {
    isAuthenticated: true,
    userInfo: null,
    tokenExpiry: null,
    error: null
  };

  beforeEach(async () => {
    mockDropboxService = jasmine.createSpyObj('DropboxService', [
      'isAuthenticated',
      'getAuthState',
      'getTemporaryLink',
      'collectAllAudioFilesRecursively'
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
      'loadCurrentPlaylist',
      'saveCurrentPlaylist',
      'clearCurrentPlaylist',
      'createPlaylistItem'
    ]);

    mockNotificationService = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    await TestBed.configureTestingModule({
      imports: [MediaPlayerComponent],
      providers: [
        { provide: DropboxService, useValue: mockDropboxService },
        { provide: PlaylistService, useValue: mockPlaylistService },
        { provide: NotificationService, useValue: mockNotificationService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(MediaPlayerComponent);
    component = fixture.componentInstance;

    // Setup default spy returns
    mockDropboxService.isAuthenticated.and.returnValue(true);
    mockDropboxService.getAuthState.and.returnValue(of(mockAuthState));
    mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com')); // Add default return
    mockDropboxService.collectAllAudioFilesRecursively.and.returnValue(of([])); // Add default return
    mockPlaylistService.getSavedPlaylists.and.returnValue([]);
    mockPlaylistService.loadCurrentPlaylist.and.returnValue(null);
    mockPlaylistService.syncPlaylists.and.returnValue(of(void 0));
    mockPlaylistService.savePlaylist.and.returnValue(of(mockSavedPlaylist)); // Add default return
    mockPlaylistService.savePlaylistAs.and.returnValue(of(mockSavedPlaylist)); // Add default return
    mockPlaylistService.deletePlaylist.and.returnValue(of(true)); // Add default return
    mockPlaylistService.renamePlaylist.and.returnValue(of(true)); // Add default return
    mockPlaylistService.forceSyncPlaylist.and.returnValue(of(mockSavedPlaylist)); // Add default return
    mockPlaylistService.playlistNameExists.and.returnValue(false); // Add default return
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
    mockPlaylistService.createPlaylistItem.and.returnValue(mockPlaylistItem);
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with default values', () => {
      expect(component.isAuthenticated).toBe(false);
      expect(component.isPlaying).toBe(false);
      expect(component.playlist).toEqual([]);
      expect(component.currentPlaylistIndex).toBe(-1);
      expect(component.savedPlaylists).toEqual([]);
    });

    it('should load saved playlists on init', () => {
      mockPlaylistService.getSavedPlaylists.and.returnValue([mockSavedPlaylist]);

      component.ngOnInit();

      expect(mockPlaylistService.getSavedPlaylists).toHaveBeenCalled();
      expect(component.savedPlaylists).toEqual([mockSavedPlaylist]);
    });

    it('should restore current playlist state on init', () => {
      const restoredState = {
        items: [mockPlaylistItem],
        currentIndex: 0
      };
      mockPlaylistService.loadCurrentPlaylist.and.returnValue(restoredState);

      component.ngOnInit();

      expect(component.playlist).toEqual([mockPlaylistItem]);
      expect(component.currentPlaylistIndex).toBe(0);
      expect(component.currentPlaylistName).toBe('Restored Session');
    });

    it('should perform initial sync when authenticated on startup', () => {
      mockDropboxService.isAuthenticated.and.returnValue(true);
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });

      component.ngOnInit();

      expect(mockPlaylistService.syncPlaylists).toHaveBeenCalled();
    });

    it('should not sync when offline', () => {
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: false
      });

      component.ngOnInit();

      expect(mockPlaylistService.syncPlaylists).not.toHaveBeenCalled();
    });
  });

  describe('Authentication Handling', () => {
    it('should handle authentication changes', () => {
      component.onAuthenticationChanged(true);

      expect(component.isAuthenticated).toBe(true);
    });

    it('should clear data when logged out', () => {
      component.playlist = [mockPlaylistItem];
      component.currentPlaylistIndex = 0;
      component.isPlaying = true;

      component.onAuthenticationChanged(false);

      expect(component.playlist).toEqual([]);
      expect(component.currentPlaylistIndex).toBe(-1);
      expect(component.isPlaying).toBe(false);
      expect(mockPlaylistService.clearCurrentPlaylist).toHaveBeenCalled();
    });

    it('should trigger sync on authentication when previously unauthenticated', () => {
      component.isAuthenticated = false;
      // Mock navigator.onLine to be true
      Object.defineProperty(navigator, 'onLine', {
        writable: true,
        value: true
      });

      component.onAuthenticationChanged(true);

      expect(mockPlaylistService.syncPlaylists).toHaveBeenCalled();
    });

    it('should not sync if already authenticated', () => {
      component.isAuthenticated = true;
      mockPlaylistService.syncPlaylists.calls.reset();

      component.onAuthenticationChanged(true);

      expect(mockPlaylistService.syncPlaylists).not.toHaveBeenCalled();
    });
  });

  describe('File Selection and Playlist Management', () => {
    beforeEach(() => {
      component.isAuthenticated = true;
    });

    it('should add file to playlist when selected', () => {
      component.onFileSelected(mockDropboxFile);

      expect(mockPlaylistService.createPlaylistItem).toHaveBeenCalledWith(mockDropboxFile, mockDropboxFile.name);
      expect(component.playlist.length).toBe(1);
      expect(mockNotificationService.showSuccess).toHaveBeenCalledWith('Added "test.mp3" to playlist');
    });

    it('should start playing when first file is added to empty playlist', () => {
      mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com'));

      component.onFileSelected(mockDropboxFile);

      expect(component.currentPlaylistIndex).toBe(0);
      expect(mockDropboxService.getTemporaryLink).toHaveBeenCalledWith('/test.mp3');
    });

    it('should not auto-play when adding to existing playlist', () => {
      component.playlist = [mockPlaylistItem];
      component.isPlaying = true;
      component.currentPlaylistIndex = 0;

      component.onFileSelected(mockDropboxFile);

      expect(component.playlist.length).toBe(2);
      expect(component.currentPlaylistIndex).toBe(0); // Should remain unchanged
    });

    it('should enqueue folder contents', () => {
      const folder: DropboxFile = {
        id: '2',
        name: 'Music Folder',
        path_display: '/music',
        is_folder: true
      };

      mockDropboxService.collectAllAudioFilesRecursively.and.returnValue(of([mockDropboxFile]));
      mockPlaylistService.createPlaylistItem.and.returnValue(mockPlaylistItem);

      component.onFolderEnqueueRequested(folder);

      expect(mockDropboxService.collectAllAudioFilesRecursively).toHaveBeenCalledWith('/music');
      expect(mockPlaylistService.createPlaylistItem).toHaveBeenCalled();
    });

    it('should handle empty folder enqueue gracefully', () => {
      const folder: DropboxFile = {
        id: 'empty-folder',
        name: 'Empty Folder',
        path_display: '/empty',
        is_folder: true
      };

      mockDropboxService.collectAllAudioFilesRecursively.and.returnValue(of([]));

      component.onFolderEnqueueRequested(folder);

      expect(component.playlist.length).toBe(0);
      expect(component.isPlaying).toBe(false);
      expect(mockNotificationService.showSuccess).toHaveBeenCalledWith('Added 0 songs from Empty Folder');
    });

    it('should handle folder enqueue errors', () => {
      const folder: DropboxFile = {
        id: 'error-folder',
        name: 'Error Folder',
        path_display: '/error',
        is_folder: true
      };

      mockDropboxService.collectAllAudioFilesRecursively.and.returnValue(throwError(() => new Error('Network error')));

      component.onFolderEnqueueRequested(folder);

      expect(mockNotificationService.showError).toHaveBeenCalledWith('Error loading songs from Error Folder');
    });
  });

  describe('Playlist Operations', () => {
    beforeEach(() => {
      component.playlist = [mockPlaylistItem];
      component.isAuthenticated = true;
    });

    it('should play specific playlist item', () => {
      mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com'));

      component.onPlayItemRequested(0);

      expect(component.currentPlaylistIndex).toBe(0);
      expect(mockDropboxService.getTemporaryLink).toHaveBeenCalled();
      expect(component.isPlaying).toBe(true);
    });

    it('should remove item from playlist', () => {
      component.currentPlaylistIndex = 0;
      component.isPlaying = true;

      component.onRemoveItemRequested(0);

      expect(component.playlist.length).toBe(0);
      expect(component.currentPlaylistIndex).toBe(-1);
      expect(component.isPlaying).toBe(false);
    });

    it('should handle removing item before current playing item', () => {
      const secondItem: PlaylistItem = {
        file: { ...mockDropboxFile, id: '2', name: 'second.mp3' },
        displayName: 'Second Song'
      };
      component.playlist = [mockPlaylistItem, secondItem];
      component.currentPlaylistIndex = 1; // Playing second item

      component.onRemoveItemRequested(0); // Remove first item

      expect(component.playlist.length).toBe(1);
      expect(component.currentPlaylistIndex).toBe(0); // Adjusted index
      expect(component.playlist[0]).toEqual(secondItem);
    });

    it('should handle removing last item when playing it', () => {
      const secondItem: PlaylistItem = {
        file: { ...mockDropboxFile, id: '2', name: 'second.mp3' },
        displayName: 'Second Song'
      };
      component.playlist = [mockPlaylistItem, secondItem];
      component.currentPlaylistIndex = 1; // Playing last item
      component.isPlaying = true;
      mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com'));

      component.onRemoveItemRequested(1); // Remove last item

      expect(component.playlist.length).toBe(1);
      expect(component.currentPlaylistIndex).toBe(0); // Should play previous item
      expect(mockDropboxService.getTemporaryLink).toHaveBeenCalled();
    });

    it('should clear entire playlist', () => {
      component.currentPlaylistIndex = 0;
      component.isPlaying = true;

      component.onClearPlaylistRequested();

      expect(component.playlist).toEqual([]);
      expect(component.currentPlaylistIndex).toBe(-1);
      expect(component.currentPlaylistId).toBeNull();
      expect(component.isPlaying).toBe(false);
    });

    it('should shuffle playlist', () => {
      const secondItem: PlaylistItem = {
        file: { ...mockDropboxFile, id: '2', name: 'second.mp3' },
        displayName: 'Second Song'
      };
      component.playlist = [mockPlaylistItem, secondItem];
      mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com'));

      component.onShufflePlaylistRequested();

      expect(component.currentPlaylistIndex).toBe(0);
      expect(mockDropboxService.getTemporaryLink).toHaveBeenCalled();
    });

    it('should not shuffle single-item playlist', () => {
      const originalItem = component.playlist[0];
      mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com'));

      component.onShufflePlaylistRequested();

      expect(component.playlist[0]).toEqual(originalItem);
      expect(component.currentPlaylistIndex).toBe(0);
    });
  });

  describe('Saved Playlist Management', () => {
    beforeEach(() => {
      component.playlist = [mockPlaylistItem];
      component.isAuthenticated = true;
    });

    it('should save current playlist', () => {
      spyOn(window, 'prompt').and.returnValue('New Playlist');
      mockPlaylistService.playlistNameExists.and.returnValue(false);
      mockPlaylistService.savePlaylist.and.returnValue(of(mockSavedPlaylist));

      component.onSavePlaylistRequested();

      expect(mockPlaylistService.savePlaylist).toHaveBeenCalledWith('New Playlist', [mockPlaylistItem], undefined);
    });

    it('should not save empty playlist', () => {
      component.playlist = [];

      component.onSavePlaylistRequested();

      expect(mockNotificationService.showError).toHaveBeenCalledWith('Cannot save an empty playlist');
      expect(mockPlaylistService.savePlaylist).not.toHaveBeenCalled();
    });

    it('should handle playlist name conflicts with confirmation', () => {
      spyOn(window, 'prompt').and.returnValue('Existing Name');
      spyOn(window, 'confirm').and.returnValue(true);
      mockPlaylistService.playlistNameExists.and.returnValue(true);
      mockPlaylistService.savePlaylist.and.returnValue(of(mockSavedPlaylist));

      component.onSavePlaylistRequested();

      expect(window.confirm).toHaveBeenCalledWith('A playlist named "Existing Name" already exists. Overwrite it?');
      expect(mockPlaylistService.savePlaylist).toHaveBeenCalled();
    });

    it('should cancel save on name conflict rejection', () => {
      spyOn(window, 'prompt').and.returnValue('Existing Name');
      spyOn(window, 'confirm').and.returnValue(false);
      mockPlaylistService.playlistNameExists.and.returnValue(true);

      component.onSavePlaylistRequested();

      expect(mockPlaylistService.savePlaylist).not.toHaveBeenCalled();
    });

    it('should save playlist as new', () => {
      spyOn(window, 'prompt').and.returnValue('New Copy');
      mockPlaylistService.playlistNameExists.and.returnValue(false);
      mockPlaylistService.savePlaylistAs.and.returnValue(of(mockSavedPlaylist));

      component.onSavePlaylistAsRequested();

      expect(mockPlaylistService.savePlaylistAs).toHaveBeenCalledWith('New Copy', [mockPlaylistItem]);
    });

    it('should handle save playlist errors', () => {
      spyOn(window, 'prompt').and.returnValue('Test Playlist');
      mockPlaylistService.playlistNameExists.and.returnValue(false);
      mockPlaylistService.savePlaylist.and.returnValue(throwError(() => new Error('Save failed')));

      component.onSavePlaylistRequested();

      expect(mockNotificationService.showError).toHaveBeenCalledWith('Error saving playlist');
    });

    it('should load saved playlist', () => {
      mockPlaylistService.loadPlaylist.and.returnValue(mockSavedPlaylist);
      mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com'));

      component.onLoadPlaylistRequested('playlist1');

      expect(component.playlist.length).toBe(1);
      expect(component.currentPlaylistId).toBe('playlist1');
      expect(component.currentPlaylistName).toBe('Test Playlist');
    });

    it('should handle loading non-existent playlist', () => {
      mockPlaylistService.loadPlaylist.and.returnValue(null);

      component.onLoadPlaylistRequested('nonexistent');

      expect(mockNotificationService.showError).toHaveBeenCalledWith('Playlist not found');
    });

    it('should delete playlist', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      mockPlaylistService.deletePlaylist.and.returnValue(of(true));
      component.savedPlaylists = [mockSavedPlaylist];
      component.currentPlaylistId = 'playlist1';

      component.onDeletePlaylistRequested('playlist1');

      expect(mockPlaylistService.deletePlaylist).toHaveBeenCalledWith('playlist1');
      expect(component.currentPlaylistId).toBeNull();
    });

    it('should not delete playlist when cancelled', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      component.savedPlaylists = [mockSavedPlaylist];

      component.onDeletePlaylistRequested('playlist1');

      expect(mockPlaylistService.deletePlaylist).not.toHaveBeenCalled();
    });

    it('should rename playlist', () => {
      mockPlaylistService.playlistNameExists.and.returnValue(false);
      mockPlaylistService.renamePlaylist.and.returnValue(of(true));

      component.onRenamePlaylistRequested({ id: 'playlist1', name: 'New Name' });

      expect(mockPlaylistService.renamePlaylist).toHaveBeenCalledWith('playlist1', 'New Name');
    });

    it('should handle rename with duplicate name', () => {
      mockPlaylistService.playlistNameExists.and.returnValue(true);

      component.onRenamePlaylistRequested({ id: 'playlist1', name: 'Existing Name' });

      expect(mockNotificationService.showError).toHaveBeenCalledWith('A playlist named "Existing Name" already exists');
      expect(mockPlaylistService.renamePlaylist).not.toHaveBeenCalled();
    });
  });

  describe('Playlist Selection and Navigation', () => {
    it('should create new playlist when "new" is selected', () => {
      component.playlist = [mockPlaylistItem];
      component.currentPlaylistId = 'existing';

      component.onPlaylistSelectionChanged('new');

      expect(component.playlist).toEqual([]);
      expect(component.currentPlaylistId).toBeNull();
      expect(component.currentPlaylistName).toBe('New Playlist');
    });

    it('should load different playlist when selected', () => {
      mockPlaylistService.loadPlaylist.and.returnValue(mockSavedPlaylist);
      mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com'));

      component.onPlaylistSelectionChanged('playlist1');

      expect(mockPlaylistService.loadPlaylist).toHaveBeenCalledWith('playlist1');
    });

    it('should not reload same playlist', () => {
      component.currentPlaylistId = 'playlist1';

      component.onPlaylistSelectionChanged('playlist1');

      expect(mockPlaylistService.loadPlaylist).not.toHaveBeenCalled();
    });

    it('should ignore null playlist selection', () => {
      mockPlaylistService.loadPlaylist.calls.reset();

      component.onPlaylistSelectionChanged(null);

      expect(mockPlaylistService.loadPlaylist).not.toHaveBeenCalled();
    });
  });

  describe('Audio Player Controls', () => {
    beforeEach(() => {
      component.playlist = [
        mockPlaylistItem,
        { file: { ...mockDropboxFile, id: '2', name: 'second.mp3' }, displayName: 'Second Song' }
      ];
      component.currentPlaylistIndex = 0;
      component.isPlaying = true;
    });

    it('should stop media playback', () => {
      component.onStopRequested();

      expect(component.isPlaying).toBe(false);
      expect(component.mediaUrl).toBe('');
    });

    it('should play next song', () => {
      mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com'));

      component.onNextRequested();

      expect(component.currentPlaylistIndex).toBe(1);
      expect(mockDropboxService.getTemporaryLink).toHaveBeenCalled();
    });

    it('should stop when reaching end of playlist', () => {
      component.currentPlaylistIndex = 1; // Last song

      component.onNextRequested();

      expect(component.isPlaying).toBe(false);
    });

    it('should play previous song', () => {
      component.currentPlaylistIndex = 1;
      mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com'));

      component.onPreviousRequested();

      expect(component.currentPlaylistIndex).toBe(0);
      expect(mockDropboxService.getTemporaryLink).toHaveBeenCalled();
    });

    it('should not go before first song', () => {
      component.currentPlaylistIndex = 0;

      component.onPreviousRequested();

      expect(component.currentPlaylistIndex).toBe(0);
    });

    it('should auto-advance when song ends', () => {
      mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com'));

      component.onSongEnded();

      expect(component.currentPlaylistIndex).toBe(1);
    });

    it('should handle media loading errors', () => {
      mockDropboxService.getTemporaryLink.and.returnValue(throwError(() => new Error('Network error')));

      component.onPlayItemRequested(0);

      expect(mockNotificationService.showError).toHaveBeenCalledWith('Error loading media file');
      expect(component.isLoading).toBe(false);
    });
  });

  describe('Getters and State', () => {
    it('should get current playlist item', () => {
      component.playlist = [mockPlaylistItem];
      component.currentPlaylistIndex = 0;

      expect(component.currentPlaylistItem).toEqual(mockPlaylistItem);
    });

    it('should return null for invalid current index', () => {
      component.playlist = [mockPlaylistItem];
      component.currentPlaylistIndex = -1;

      expect(component.currentPlaylistItem).toBeNull();
    });

    it('should get current track name', () => {
      component.playlist = [mockPlaylistItem];
      component.currentPlaylistIndex = 0;

      expect(component.currentTrackName).toBe('Test Song');
    });

    it('should return empty string for no current track', () => {
      component.currentPlaylistIndex = -1;

      expect(component.currentTrackName).toBe('');
    });

    it('should check if can play previous', () => {
      component.currentPlaylistIndex = 1;
      expect(component.canPlayPrevious).toBe(true);

      component.currentPlaylistIndex = 0;
      expect(component.canPlayPrevious).toBe(false);
    });

    it('should check if can play next', () => {
      component.playlist = [mockPlaylistItem, mockPlaylistItem];
      component.currentPlaylistIndex = 0;
      expect(component.canPlayNext).toBe(true);

      component.currentPlaylistIndex = 1;
      expect(component.canPlayNext).toBe(false);
    });
  });

  describe('Helper Methods and Validation', () => {
    it('should validate playlist save conditions', () => {
      component.playlist = [];
      const result = component.validatePlaylistSave();
      expect(result.canSave).toBe(false);
      expect(result.error).toBe('Cannot save an empty playlist');

      component.playlist = [mockPlaylistItem];
      const validResult = component.validatePlaylistSave();
      expect(validResult.canSave).toBe(true);
      expect(validResult.error).toBeUndefined();
    });

    it('should determine auto-play conditions', () => {
      // Should auto-play when not playing and no track selected
      component.isPlaying = false;
      component.currentPlaylistIndex = -1;
      expect(component.shouldAutoPlay()).toBe(true);

      // Should not auto-play when already playing
      component.isPlaying = true;
      component.currentPlaylistIndex = -1;
      expect(component.shouldAutoPlay()).toBe(false);

      // Should not auto-play when a track is already selected
      component.isPlaying = false;
      component.currentPlaylistIndex = 0;
      expect(component.shouldAutoPlay()).toBe(false);
    });

    it('should reconstruct file from playlist item', () => {
      const itemWithPath = {
        file: { id: '', name: '', path_display: '/music/song.mp3', is_folder: false },
        displayName: 'Song'
      };

      const reconstructed = component.reconstructFileFromPlaylistItem(itemWithPath);

      expect(reconstructed.file.name).toBe('song.mp3');
      expect(reconstructed.file.id).toBe('/music/song.mp3');
      expect(reconstructed.file.is_folder).toBe(false);
    });

    it('should not modify item with complete file info', () => {
      const completeItem = mockPlaylistItem;
      const result = component.reconstructFileFromPlaylistItem(completeItem);
      expect(result).toEqual(completeItem);
    });
  });

  describe('Component Cleanup', () => {
    it('should unsubscribe on destroy', () => {
      component.ngOnInit();
      const authSubscription = (component as any).authSubscription;
      if (authSubscription) {
        spyOn(authSubscription, 'unsubscribe');
        component.ngOnDestroy();
        expect(authSubscription.unsubscribe).toHaveBeenCalled();
      }
    });

    it('should handle destroy with no subscription', () => {
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('Force Sync Operations', () => {
    beforeEach(() => {
      component.isAuthenticated = true;
    });

    it('should force sync playlist successfully', () => {
      const syncedPlaylist = { ...mockSavedPlaylist, syncStatus: 'synced' as const };
      mockPlaylistService.forceSyncPlaylist.and.returnValue(of(syncedPlaylist));

      component.onForceSyncRequested('playlist1');

      expect(mockPlaylistService.forceSyncPlaylist).toHaveBeenCalledWith('playlist1');
      expect(mockNotificationService.showSuccess).toHaveBeenCalledWith('Playlist "Test Playlist" synced to Dropbox');
    });

    it('should handle force sync failures', () => {
      const failedPlaylist = { ...mockSavedPlaylist, syncStatus: 'error' as const };
      mockPlaylistService.forceSyncPlaylist.and.returnValue(of(failedPlaylist));

      component.onForceSyncRequested('playlist1');

      expect(mockNotificationService.showError).toHaveBeenCalledWith('Error syncing playlist "Test Playlist"');
    });

    it('should handle force sync errors', () => {
      mockPlaylistService.forceSyncPlaylist.and.returnValue(throwError(() => new Error('Sync error')));

      component.onForceSyncRequested('playlist1');

      expect(mockNotificationService.showError).toHaveBeenCalledWith('Error syncing playlist');
    });
  });

  describe('State Persistence', () => {
    it('should save current playlist state when items are added', () => {
      component.onFileSelected(mockDropboxFile);

      expect(mockPlaylistService.saveCurrentPlaylist).toHaveBeenCalled();
    });

    it('should save state when playlist item is played', () => {
      component.playlist = [mockPlaylistItem];
      mockDropboxService.getTemporaryLink.and.returnValue(of('http://temp-link.com'));

      component.onPlayItemRequested(0);

      expect(mockPlaylistService.saveCurrentPlaylist).toHaveBeenCalled();
    });
  });
});
