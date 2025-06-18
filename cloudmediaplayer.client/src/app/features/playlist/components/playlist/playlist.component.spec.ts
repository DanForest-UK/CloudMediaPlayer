import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { PlaylistComponent } from './playlist.component';
import { PlaylistService } from '@services/playlist.service';
import { PlaylistItem, SavedPlaylist, SyncStatus, SyncSettings } from '@models/index';

describe('PlaylistComponent', () => {
  let component: PlaylistComponent;
  let fixture: ComponentFixture<PlaylistComponent>;
  let mockPlaylistService: jasmine.SpyObj<PlaylistService>;

  const mockPlaylistItem: PlaylistItem = {
    file: {
      id: '1',
      name: 'test.mp3',
      path_display: '/test.mp3',
      is_folder: false
    },
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

  const mockSyncStatus: SyncStatus = {
    isOnline: true,
    isSyncing: false,
    lastSync: new Date(),
    pendingUploads: 0,
    error: null
  };

  const mockSyncSettings: SyncSettings = {
    enabled: true,
    autoSync: true
  };

  beforeEach(async () => {
    mockPlaylistService = jasmine.createSpyObj('PlaylistService', [
      'getSyncStatus',
      'getSyncSettings',
      'updateSyncSettings'
    ]);

    await TestBed.configureTestingModule({
      imports: [PlaylistComponent],
      providers: [
        { provide: PlaylistService, useValue: mockPlaylistService }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(PlaylistComponent);
    component = fixture.componentInstance;

    // Setup default spy returns
    mockPlaylistService.getSyncStatus.and.returnValue(of(mockSyncStatus));
    mockPlaylistService.getSyncSettings.and.returnValue(of(mockSyncSettings));

    // Set default inputs
    component.playlist = [];
    component.savedPlaylists = [];
    component.currentPlaylistIndex = -1;
    component.isPlaying = false;
    component.currentPlaylistId = null;
    component.currentPlaylistName = 'New Playlist';
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should subscribe to sync status on init', () => {
      component.ngOnInit();

      expect(mockPlaylistService.getSyncStatus).toHaveBeenCalled();
      expect(component.syncStatus).toEqual(mockSyncStatus);
    });

    it('should subscribe to sync settings on init', () => {
      component.ngOnInit();

      expect(mockPlaylistService.getSyncSettings).toHaveBeenCalled();
      expect(component.syncSettings).toEqual(mockSyncSettings);
    });

    it('should handle sync status errors gracefully', () => {
      spyOn(console, 'error');
      mockPlaylistService.getSyncStatus.and.returnValue(throwError(() => new Error('Sync error')));

      component.ngOnInit();

      expect(console.error).toHaveBeenCalledWith('Error loading sync status:', jasmine.any(Error));
    });

    it('should unsubscribe on destroy', () => {
      component.ngOnInit();
      const syncStatusSub = component['syncStatusSubscription'];
      const syncSettingsSub = component['syncSettingsSubscription'];

      if (syncStatusSub) spyOn(syncStatusSub, 'unsubscribe');
      if (syncSettingsSub) spyOn(syncSettingsSub, 'unsubscribe');

      component.ngOnDestroy();

      if (syncStatusSub) expect(syncStatusSub.unsubscribe).toHaveBeenCalled();
      if (syncSettingsSub) expect(syncSettingsSub.unsubscribe).toHaveBeenCalled();
    });
  });

  describe('Playing State Logic', () => {
    it('should correctly identify currently playing item', () => {
      component.currentPlaylistIndex = 1;
      component.isPlaying = true;

      expect(component.isCurrentlyPlaying(1)).toBe(true);
      expect(component.isCurrentlyPlaying(0)).toBe(false);
      expect(component.isCurrentlyPlaying(2)).toBe(false);
    });

    it('should not identify playing item when paused', () => {
      component.currentPlaylistIndex = 1;
      component.isPlaying = false;

      expect(component.isCurrentlyPlaying(1)).toBe(false);
    });
  });

  describe('Playlist State Management', () => {
    it('should check if can save playlist', () => {
      component.playlist = [];
      expect(component.canSavePlaylist()).toBe(false);

      component.playlist = [mockPlaylistItem];
      expect(component.canSavePlaylist()).toBe(true);
    });

    it('should check if can manage playlist', () => {
      component.playlist = [];
      expect(component.canManagePlaylist()).toBe(false);

      component.playlist = [mockPlaylistItem];
      expect(component.canManagePlaylist()).toBe(true);
    });
  });

  describe('Sync Settings', () => {
    beforeEach(() => {
      component.ngOnInit();
    });

    it('should toggle sync enabled setting', () => {
      component.syncSettings = { enabled: true, autoSync: true };

      component.toggleSyncEnabled();

      expect(mockPlaylistService.updateSyncSettings).toHaveBeenCalledWith({ enabled: false });
    });
  });

  describe('Dropdown Management', () => {
    it('should toggle dropdown visibility', () => {
      expect(component.showDropdown).toBe(false);

      component.toggleDropdown();
      expect(component.showDropdown).toBe(true);

      component.toggleDropdown();
      expect(component.showDropdown).toBe(false);
    });

    it('should close context menu when opening dropdown', () => {
      component.showContextMenu = true;

      component.toggleDropdown();

      expect(component.showContextMenu).toBe(false);
    });

    it('should prevent event propagation when provided', () => {
      const event = new Event('click');
      spyOn(event, 'stopPropagation');

      component.toggleDropdown(event);

      expect(event.stopPropagation).toHaveBeenCalled();
    });

    it('should close dropdown', () => {
      component.showDropdown = true;

      component.closeDropdown();

      expect(component.showDropdown).toBe(false);
    });

    it('should emit playlist selection change', () => {
      spyOn(component.playlistSelectionChanged, 'emit');

      component.selectPlaylist('playlist1');

      expect(component.playlistSelectionChanged.emit).toHaveBeenCalledWith('playlist1');
      expect(component.showDropdown).toBe(false);
    });
  });

  describe('Context Menu', () => {
    it('should show context menu at correct position', () => {
      const event = new MouseEvent('contextmenu', { clientX: 100, clientY: 200 });
      spyOn(event, 'preventDefault');
      spyOn(event, 'stopPropagation');

      component.showPlaylistContextMenu(event, 'playlist1');

      expect(event.preventDefault).toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.showContextMenu).toBe(true);
      expect(component.contextMenuPlaylistId).toBe('playlist1');
      expect(component.contextMenuPosition).toEqual({ x: 100, y: 200 });
      expect(component.showDropdown).toBe(false);
    });

    it('should close context menu', () => {
      component.showContextMenu = true;
      component.contextMenuPlaylistId = 'playlist1';

      component.closeContextMenu();

      expect(component.showContextMenu).toBe(false);
      expect(component.contextMenuPlaylistId).toBeNull();
    });

    it('should rename playlist with valid name', () => {
      spyOn(window, 'prompt').and.returnValue('New Name');
      spyOn(component.renamePlaylistRequested, 'emit');
      component.contextMenuPlaylistId = 'playlist1';
      component.savedPlaylists = [mockSavedPlaylist];

      component.renamePlaylist();

      expect(component.renamePlaylistRequested.emit).toHaveBeenCalledWith({
        id: 'playlist1',
        name: 'New Name'
      });
      expect(component.showContextMenu).toBe(false);
    });

    it('should not rename playlist with empty name', () => {
      spyOn(window, 'prompt').and.returnValue('   '); // Empty/whitespace name
      spyOn(window, 'alert');
      spyOn(component.renamePlaylistRequested, 'emit');
      component.contextMenuPlaylistId = 'playlist1';
      component.savedPlaylists = [mockSavedPlaylist];

      component.renamePlaylist();

      expect(window.alert).toHaveBeenCalledWith('Playlist name cannot be empty');
      expect(component.renamePlaylistRequested.emit).not.toHaveBeenCalled();
    });

    it('should not rename playlist with long name', () => {
      const longName = 'a'.repeat(256);
      spyOn(window, 'prompt').and.returnValue(longName);
      spyOn(window, 'alert');
      spyOn(component.renamePlaylistRequested, 'emit');
      component.contextMenuPlaylistId = 'playlist1';
      component.savedPlaylists = [mockSavedPlaylist];

      component.renamePlaylist();

      expect(window.alert).toHaveBeenCalledWith('Playlist name is too long');
      expect(component.renamePlaylistRequested.emit).not.toHaveBeenCalled();
    });

    it('should not rename playlist if no new name provided', () => {
      spyOn(window, 'prompt').and.returnValue(null);
      spyOn(component.renamePlaylistRequested, 'emit');
      component.contextMenuPlaylistId = 'playlist1';
      component.savedPlaylists = [mockSavedPlaylist];

      component.renamePlaylist();

      expect(component.renamePlaylistRequested.emit).not.toHaveBeenCalled();
    });

    it('should handle missing context menu playlist ID', () => {
      component.contextMenuPlaylistId = null;
      spyOn(component.renamePlaylistRequested, 'emit');

      component.renamePlaylist();

      expect(component.renamePlaylistRequested.emit).not.toHaveBeenCalled();
    });

    it('should handle missing playlist in saved playlists', () => {
      component.contextMenuPlaylistId = 'nonexistent';
      component.savedPlaylists = [mockSavedPlaylist];
      spyOn(component.renamePlaylistRequested, 'emit');

      component.renamePlaylist();

      expect(component.renamePlaylistRequested.emit).not.toHaveBeenCalled();
    });

    it('should delete playlist', () => {
      spyOn(component.deletePlaylistRequested, 'emit');
      component.contextMenuPlaylistId = 'playlist1';

      component.deletePlaylist();

      expect(component.deletePlaylistRequested.emit).toHaveBeenCalledWith('playlist1');
      expect(component.showContextMenu).toBe(false);
    });

    it('should force sync playlist', () => {
      spyOn(component.forceSyncRequested, 'emit');
      component.contextMenuPlaylistId = 'playlist1';

      component.forceSyncPlaylist();

      expect(component.forceSyncRequested.emit).toHaveBeenCalledWith('playlist1');
      expect(component.showContextMenu).toBe(false);
    });
  });

  describe('Playlist Actions', () => {
    beforeEach(() => {
      component.playlist = [mockPlaylistItem];
    });

    it('should emit save playlist request', () => {
      spyOn(component.savePlaylistRequested, 'emit');

      component.savePlaylist();

      expect(component.savePlaylistRequested.emit).toHaveBeenCalled();
      expect(component.showDropdown).toBe(false);
    });

    it('should emit save playlist as request', () => {
      spyOn(component.savePlaylistAsRequested, 'emit');

      component.savePlaylistAs();

      expect(component.savePlaylistAsRequested.emit).toHaveBeenCalled();
      expect(component.showDropdown).toBe(false);
    });

    it('should emit play item request', () => {
      spyOn(component.playItemRequested, 'emit');

      component.playPlaylistItem(0);

      expect(component.playItemRequested.emit).toHaveBeenCalledWith(0);
    });

    it('should emit remove item request', () => {
      spyOn(component.removeItemRequested, 'emit');
      const event = new Event('click');
      spyOn(event, 'stopPropagation');

      component.removeFromPlaylist(0, event);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.removeItemRequested.emit).toHaveBeenCalledWith(0);
    });

    it('should emit clear playlist request', () => {
      spyOn(component.clearPlaylistRequested, 'emit');

      component.clearPlaylist();

      expect(component.clearPlaylistRequested.emit).toHaveBeenCalled();
    });

    it('should emit shuffle playlist request', () => {
      spyOn(component.shufflePlaylistRequested, 'emit');

      component.shufflePlaylist();

      expect(component.shufflePlaylistRequested.emit).toHaveBeenCalled();
    });
  });

  describe('Event Handling', () => {
    it('should handle document clicks to close dropdowns', () => {
      component.showDropdown = true;
      component.showContextMenu = true;

      const event = new Event('click');
      Object.defineProperty(event, 'target', {
        value: document.createElement('div'),
        writable: false
      });

      component.onDocumentClick(event);

      expect(component.showDropdown).toBe(false);
      expect(component.showContextMenu).toBe(false);
    });

    it('should not close dropdown when clicking inside playlist selector', () => {
      component.showDropdown = true;

      const event = new Event('click');
      const targetElement = document.createElement('div');
      targetElement.className = 'playlist-selector';
      Object.defineProperty(event, 'target', {
        value: targetElement,
        writable: false
      });

      // Mock closest method
      spyOn(targetElement, 'closest').and.returnValue(targetElement);

      component.onDocumentClick(event);

      expect(component.showDropdown).toBe(true);
    });
  });

  describe('Utility Methods', () => {
    it('should find playlist by ID correctly', () => {
      component.savedPlaylists = [mockSavedPlaylist];

      const found = component.findPlaylistById('playlist1');
      expect(found).toEqual(mockSavedPlaylist);

      const notFound = component.findPlaylistById('nonexistent');
      expect(notFound).toBeNull();
    });

    it('should check playlist selector element correctly', () => {
      const element = document.createElement('div');
      element.className = 'playlist-selector';
      spyOn(element, 'closest').and.returnValue(element);

      expect(component.isPlaylistSelectorElement(element)).toBe(true);

      const otherElement = document.createElement('div');
      spyOn(otherElement, 'closest').and.returnValue(null);

      expect(component.isPlaylistSelectorElement(otherElement)).toBe(false);
    });
  });

  describe('Error Handling', () => {
    it('should handle subscription errors gracefully', () => {
      spyOn(console, 'error');
      mockPlaylistService.getSyncSettings.and.returnValue(throwError(() => new Error('Settings error')));

      component.ngOnInit();

      expect(console.error).toHaveBeenCalledWith('Error loading sync settings:', jasmine.any(Error));
    });
  });
});
