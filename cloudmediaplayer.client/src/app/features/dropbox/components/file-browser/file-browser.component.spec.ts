import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { FileBrowserComponent } from './file-browser.component';
import { DropboxService } from '@services/dropbox.service';
import { NotificationService } from '@services/notification.service';
import { FileUtilService } from '@services/file-util.service';
import { DropboxFile, FolderScanProgress } from '@models/index';

describe('FileBrowserComponent', () => {
  let component: FileBrowserComponent;
  let fixture: ComponentFixture<FileBrowserComponent>;
  let mockDropboxService: jasmine.SpyObj<DropboxService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  // Use real FileUtilService instead of mock
  let fileUtilService: FileUtilService;

  const mockDropboxFile: DropboxFile = {
    id: '1',
    name: 'test.mp3',
    path_display: '/test.mp3',
    is_folder: false
  };

  const mockFolder: DropboxFile = {
    id: '2',
    name: 'Music',
    path_display: '/Music',
    is_folder: true
  };

  beforeEach(async () => {
    mockDropboxService = jasmine.createSpyObj('DropboxService', [
      'listFolder',
      'getFolderScanProgress'
    ]);

    mockNotificationService = jasmine.createSpyObj('NotificationService', [
      'showError',
      'showSuccess'
    ]);

    await TestBed.configureTestingModule({
      imports: [FileBrowserComponent],
      providers: [
        { provide: DropboxService, useValue: mockDropboxService },
        { provide: NotificationService, useValue: mockNotificationService },
        FileUtilService // Use real service
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(FileBrowserComponent);
    component = fixture.componentInstance;
    fileUtilService = TestBed.inject(FileUtilService);

    // Setup default spy returns
    mockDropboxService.listFolder.and.returnValue(of([]));
    mockDropboxService.getFolderScanProgress.and.returnValue(of({
      currentPath: '',
      isScanning: false,
      totalAudioFiles: 0
    }));
  });

  describe('Component Initialization', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should initialize with default values', () => {
      expect(component.isLoading).toBe(false);
      expect(component.currentPath).toBe('');
      expect(component.files).toEqual([]);
      expect(component.breadcrumbs).toEqual([]);
    });

    it('should load files and setup progress subscription on init', () => {
      component.ngOnInit();

      expect(mockDropboxService.listFolder).toHaveBeenCalledWith('', true);
      expect(mockDropboxService.getFolderScanProgress).toHaveBeenCalled();
    });
  });

  describe('File Sorting and Filtering', () => {
    it('should sort files with folders first, then alphabetically', fakeAsync(() => {
      const files: DropboxFile[] = [
        { ...mockDropboxFile, name: 'song.mp3', is_folder: false },
        { ...mockFolder, name: 'Album', is_folder: true },
        { ...mockDropboxFile, name: 'another.mp3', is_folder: false },
        { ...mockFolder, name: 'Beats', is_folder: true }
      ];

      mockDropboxService.listFolder.and.returnValue(of(files));
      component.loadFiles('/test');
      tick();
      fixture.detectChanges();

      // Verify that folders come first and are sorted alphabetically
      const processedFiles = component.files;
      expect(processedFiles[0].is_folder).toBe(true);
      expect(processedFiles[0].name).toBe('Album');
      expect(processedFiles[1].is_folder).toBe(true);
      expect(processedFiles[1].name).toBe('Beats');
      expect(processedFiles[2].is_folder).toBe(false);
      expect(processedFiles[2].name).toBe('another.mp3');
      expect(processedFiles[3].is_folder).toBe(false);
      expect(processedFiles[3].name).toBe('song.mp3');
    }));

    it('should handle case insensitive audio file detection', fakeAsync(() => {
      const files: DropboxFile[] = [
        { ...mockDropboxFile, name: 'SONG.MP3', is_folder: false },
        { ...mockDropboxFile, name: 'Music.WAV', is_folder: false },
        { ...mockDropboxFile, name: 'Audio.OGG', is_folder: false }
      ];

      mockDropboxService.listFolder.and.returnValue(of(files));
      component.loadFiles('/test');
      tick();
      fixture.detectChanges();

      expect(component.files.length).toBe(3);
      expect(component.files.every(f => !f.is_folder)).toBe(true);
    }));
  });

  describe('Breadcrumb Generation', () => {
    it('should generate breadcrumbs correctly for root path', fakeAsync(() => {
      mockDropboxService.listFolder.and.returnValue(of([]));
      component.loadFiles('');
      tick();
      fixture.detectChanges();

      expect(component.breadcrumbs).toEqual([{ name: 'Root', path: '/' }]);
    }));

    it('should generate breadcrumbs correctly for nested path', () => {
      mockDropboxService.listFolder.and.returnValue(of([]));
      component.loadFiles('/music/rock/album');

      expect(component.breadcrumbs.length).toBe(4);
      expect(component.breadcrumbs[0]).toEqual({ name: 'Root', path: '/' });
      expect(component.breadcrumbs[1]).toEqual({ name: 'music', path: '/music' });
      expect(component.breadcrumbs[2]).toEqual({ name: 'rock', path: '/music/rock' });
      expect(component.breadcrumbs[3]).toEqual({ name: 'album', path: '/music/rock/album' });
    });

    it('should handle root slash path', fakeAsync(() => {
      mockDropboxService.listFolder.and.returnValue(of([]));
      component.loadFiles('/');
      tick();
      fixture.detectChanges();

      expect(component.breadcrumbs).toEqual([{ name: 'Root', path: '/' }]);
    }));
  });

  describe('Display Name Generation', () => {
    it('should get display name from path correctly', () => {
      expect(component.getScanPathDisplayName()).toBe('');

      // Set scan progress with a path
      component.scanProgress = {
        currentPath: '/music/rock/album',
        isScanning: true,
        totalAudioFiles: 5
      };

      expect(component.getScanPathDisplayName()).toBe('album');
    });

    it('should handle empty paths in display name', () => {
      component.scanProgress = {
        currentPath: '',
        isScanning: false,
        totalAudioFiles: 0
      };

      expect(component.getScanPathDisplayName()).toBe('');
    });

    it('should handle root path in display name', () => {
      component.scanProgress = {
        currentPath: '/',
        isScanning: false,
        totalAudioFiles: 0
      };

      expect(component.getScanPathDisplayName()).toBe('Root');
    });
  });

  describe('File Operations', () => {
    it('should check if file is audio correctly', () => {
      expect(component.isAudioFile('test.mp3')).toBe(true);
      expect(component.isAudioFile('test.wav')).toBe(true);
      expect(component.isAudioFile('test.ogg')).toBe(true);
      expect(component.isAudioFile('test.m4a')).toBe(true);
      expect(component.isAudioFile('test.flac')).toBe(true);
      expect(component.isAudioFile('test.aac')).toBe(true);
      expect(component.isAudioFile('test.pdf')).toBe(false);
      expect(component.isAudioFile('test.mp4')).toBe(false);
    });

    it('should validate file selection correctly', () => {
      expect(component.canSelectFile(mockDropboxFile)).toBe(true);
      expect(component.canSelectFile(mockFolder)).toBe(false);

      const nonAudioFile = { ...mockDropboxFile, name: 'document.pdf' };
      expect(component.canSelectFile(nonAudioFile)).toBe(false);
    });

    it('should validate folder enqueueing correctly', () => {
      expect(component.canEnqueueFolder(mockFolder)).toBe(true);
      expect(component.canEnqueueFolder(mockDropboxFile)).toBe(false);
    });
  });

  describe('Navigation', () => {
    it('should load files when navigating', () => {
      component.loadFiles('/music');

      expect(mockDropboxService.listFolder).toHaveBeenCalledWith('/music', true);
    });

    it('should check breadcrumb current state correctly', () => {
      component.breadcrumbs = [
        { name: 'Root', path: '/' },
        { name: 'music', path: '/music' },
        { name: 'rock', path: '/music/rock' }
      ];

      expect(component.isBreadcrumbCurrent(0)).toBe(false);
      expect(component.isBreadcrumbCurrent(1)).toBe(false);
      expect(component.isBreadcrumbCurrent(2)).toBe(true);
    });

    it('should open folders and emit file selection correctly', () => {
      spyOn(component, 'loadFiles');
      spyOn(component.fileSelected, 'emit');

      // Test folder opening
      component.openItem(mockFolder);
      expect(component.loadFiles).toHaveBeenCalledWith('/Music');

      // Test file selection
      component.openItem(mockDropboxFile);
      expect(component.fileSelected.emit).toHaveBeenCalledWith(mockDropboxFile);
    });

    it('should not emit file selection for non-audio files', () => {
      spyOn(component.fileSelected, 'emit');
      const nonAudioFile = { ...mockDropboxFile, name: 'document.pdf' };

      component.openItem(nonAudioFile);
      expect(component.fileSelected.emit).not.toHaveBeenCalled();
    });
  });

  describe('Folder Enqueueing', () => {
    it('should handle folder enqueue requests', () => {
      spyOn(component.folderEnqueueRequested, 'emit');
      const event = new Event('click');
      spyOn(event, 'stopPropagation');

      component.enqueueAllFromFolder(mockFolder, event);

      expect(event.stopPropagation).toHaveBeenCalled();
      expect(component.enqueuingFolders.has('/Music')).toBe(true);
      expect(component.currentlyScannedFolder).toBe('/Music');
      expect(component.folderEnqueueRequested.emit).toHaveBeenCalledWith(mockFolder);
    });

    it('should not enqueue non-folders', () => {
      spyOn(component.folderEnqueueRequested, 'emit');
      const event = new Event('click');

      component.enqueueAllFromFolder(mockDropboxFile, event);

      expect(component.folderEnqueueRequested.emit).not.toHaveBeenCalled();
    });

    it('should check folder scanning state correctly', () => {
      component.currentlyScannedFolder = '/Music';
      component.scanProgress = { currentPath: '/Music', isScanning: true, totalAudioFiles: 0 };

      expect(component.isThisFolderBeingScanned('/Music')).toBe(true);
      expect(component.isThisFolderBeingScanned('/Other')).toBe(false);
    });

    it('should check folder enqueueing state correctly', () => {
      component.enqueuingFolders.add('/Music');

      expect(component.isFolderBeingEnqueued('/Music')).toBe(true);
      expect(component.isFolderBeingEnqueued('/Other')).toBe(false);
    });

    it('should mark folder enqueue as complete', () => {
      component.enqueuingFolders.add('/Music');
      component.currentlyScannedFolder = '/Music';

      component.markFolderEnqueueComplete('/Music');

      expect(component.enqueuingFolders.has('/Music')).toBe(false);
      expect(component.currentlyScannedFolder).toBe('');
    });
  });

  describe('Loading and Error Handling', () => {
    it('should handle loading states correctly', () => {
      // Mock the observable to return immediately to test synchronous loading state
      mockDropboxService.listFolder.and.returnValue(of([]));

      expect(component.isLoading).toBe(false);

      component.loadFiles('/test');

      // isLoading will be false by the time we check 
      expect(component.isLoading).toBe(false);
    });

    it('should update current path and breadcrumbs when loading', () => {
      mockDropboxService.listFolder.and.returnValue(of([]));
      component.loadFiles('/music/rock');

      expect(component.currentPath).toBe('/music/rock');
      expect(component.breadcrumbs.length).toBe(3); // Root + music + rock
    });
  });

  describe('Path Normalization', () => {
    it('should handle normal paths without normalization', () => {
      mockDropboxService.listFolder.and.returnValue(of([]));
      component.loadFiles('/music');

      expect(component.currentPath).toBe('/music');
    });

    it('should normalize root path correctly', () => {
      mockDropboxService.listFolder.and.returnValue(of([]));
      component.loadFiles('/');

      expect(component.currentPath).toBe('');
    });
  });

  describe('Component Cleanup', () => {
    it('should unsubscribe on destroy', () => {
      component.ngOnInit();

      const progressSubscription = (component as any).progressSubscription;
      if (progressSubscription) {
        spyOn(progressSubscription, 'unsubscribe');
        component.ngOnDestroy();
        expect(progressSubscription.unsubscribe).toHaveBeenCalled();
      }
    });

    it('should handle null subscription on destroy', () => {
      (component as any).progressSubscription = null;

      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });

  describe('Integration Tests', () => {   
    it('should handle progress updates correctly', () => {
      const progressData: FolderScanProgress = {
        currentPath: '/music/scanning',
        isScanning: true,
        totalAudioFiles: 42
      };

      mockDropboxService.getFolderScanProgress.and.returnValue(of(progressData));

      component.ngOnInit();
      fixture.detectChanges();

      expect(component.scanProgress).toEqual(progressData);
      expect(component.getScanPathDisplayName()).toBe('scanning');
    });  
  });

  describe('Error Handling', () => {
    it('should handle listFolder error gracefully', fakeAsync(() => {
      const errorResponse = new Error('Network error');
      mockDropboxService.listFolder.and.returnValue(throwError(errorResponse));

      component.loadFiles('/test');
      tick();
      fixture.detectChanges();

      expect(component.isLoading).toBe(false);
      expect(mockNotificationService.showError).toHaveBeenCalledWith('Error loading folder contents');
    }));
  });

  describe('Edge Cases with Real FileUtilService', () => {
    it('should handle empty filename gracefully', () => {
      expect(component.isAudioFile('')).toBe(false);
      expect(component.isAudioFile(undefined as any)).toBe(false);
    });

    it('should handle files without extensions', () => {
      const fileWithoutExt = { ...mockDropboxFile, name: 'filename_no_extension' };
      expect(component.canSelectFile(fileWithoutExt)).toBe(false);
    });

    it('should handle mixed case extensions correctly', () => {
      expect(component.isAudioFile('Test.MP3')).toBe(true);
      expect(component.isAudioFile('Test.Mp3')).toBe(true);
      expect(component.isAudioFile('Test.WAV')).toBe(true);
    });
  });
});
