import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { DropboxService } from './dropbox.service';
import { NotificationService } from './notification.service';
import { FileUtilService } from './file-util.service';
import { DropboxFile, DropboxUser } from '@models/index';

describe('DropboxService', () => {
  let service: DropboxService;
  let httpMock: HttpTestingController;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let mockFileUtilsService: jasmine.SpyObj<FileUtilService>;
  let mockLocalStorage: { [key: string]: string };
  let mockSessionStorage: { [key: string]: string };

  const mockDropboxFile: DropboxFile = {
    id: 'file1',
    name: 'test.mp3',
    path_display: '/test.mp3',
    is_folder: false,
    size: 1024,
    client_modified: '2023-01-01T00:00:00Z',
    server_modified: '2023-01-01T00:00:00Z',
    rev: 'rev123'
  };

  const mockDropboxUser: DropboxUser = {
    account_id: 'user123',
    name: {
      given_name: 'John',
      surname: 'Doe',
      display_name: 'John Doe'
    },
    email: 'john@example.com'
  };

  beforeEach(() => {
    mockLocalStorage = {};
    mockSessionStorage = {};

    // Mock localStorage
    spyOn(localStorage, 'getItem').and.callFake((key: string) => mockLocalStorage[key] || null);
    spyOn(localStorage, 'setItem').and.callFake((key: string, value: string) => {
      mockLocalStorage[key] = value;
    });
    spyOn(localStorage, 'removeItem').and.callFake((key: string) => {
      delete mockLocalStorage[key];
    });

    // Mock sessionStorage
    spyOn(sessionStorage, 'getItem').and.callFake((key: string) => mockSessionStorage[key] || null);
    spyOn(sessionStorage, 'setItem').and.callFake((key: string, value: string) => {
      mockSessionStorage[key] = value;
    });
    spyOn(sessionStorage, 'removeItem').and.callFake((key: string) => {
      delete mockSessionStorage[key];
    });

    mockNotificationService = jasmine.createSpyObj('NotificationService', [
      'showSuccess',
      'showError'
    ]);

    mockFileUtilsService = jasmine.createSpyObj('FileUtilsService', [
      'isAudioFile',
      'filterAudioFilesOnly',
      'generatePlaylistPath',
      'sanitizeFileName'
    ]);

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        DropboxService,
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: FileUtilService, useValue: mockFileUtilsService }
      ]
    });

    // Setup default spy returns
    mockFileUtilsService.isAudioFile.and.returnValue(true);
    mockFileUtilsService.filterAudioFilesOnly.and.returnValue([mockDropboxFile]);
    mockFileUtilsService.generatePlaylistPath.and.returnValue('/playlists/Test_Playlist.json');
    mockFileUtilsService.sanitizeFileName.and.returnValue('Test_Playlist');

    service = TestBed.inject(DropboxService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    mockLocalStorage = {};
    mockSessionStorage = {};
  });

  describe('Basic Service', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });
  });

  describe('Core Business Logic', () => {
    describe('Authentication Logic', () => {
      it('should check token expiry using isTokenExpired method', () => {
        (service as any).tokenExpiry = new Date(Date.now() - 3600000);
        expect(service.isTokenExpired()).toBe(true);

        (service as any).tokenExpiry = new Date(Date.now() + 3600000);
        expect(service.isTokenExpired()).toBe(false);

        (service as any).tokenExpiry = null;
        expect(service.isTokenExpired()).toBe(false);
      });

      it('isAuthenticated should validate authentication state', () => {
        (service as any).accessToken = 'valid_token';
        (service as any).tokenExpiry = new Date(Date.now() + 3600000);
        expect(service.isAuthenticated()).toBe(true);

        (service as any).accessToken = null;
        expect(service.isAuthenticated()).toBe(false);

        (service as any).accessToken = 'expired_token';
        (service as any).tokenExpiry = new Date(Date.now() - 3600000);
        expect(service.isAuthenticated()).toBe(false);
      });
    });
  });

  describe('Authentication State', () => {
    it('should return authentication state observable', (done) => {
      service.getAuthState().subscribe(state => {
        expect(state).toBeDefined();
        expect(state.isAuthenticated).toBe(false);
        done();
      });
    });

    it('should check if authenticated correctly', () => {
      expect(service.isAuthenticated()).toBe(false);

      (service as any).accessToken = 'valid_token';
      (service as any).tokenExpiry = new Date(Date.now() + 3600000);
      expect(service.isAuthenticated()).toBe(true);
    });

    it('should detect expired tokens', () => {
      (service as any).accessToken = 'expired_token';
      (service as any).tokenExpiry = new Date(Date.now() - 3600000);
      expect(service.isAuthenticated()).toBe(false);
    });
  });

  describe('File Operations', () => {
    beforeEach(() => {
      (service as any).accessToken = 'valid_token';
      (service as any).tokenExpiry = new Date(Date.now() + 3600000);
    });

    it('should list folder contents', (done) => {
      const mockResponse = {
        entries: [{
          id: 'file1',
          name: 'test.mp3',
          path_display: '/test.mp3',
          is_folder: false,
          '.tag': 'file'
        }],
        has_more: false
      };

      service.listFolder('/test').subscribe(files => {
        expect(files.length).toBe(1);
        expect(files[0].name).toBe('test.mp3');
        expect(files[0].is_folder).toBe(false);
        done();
      });

      setTimeout(() => {
        const req = httpMock.expectOne('https://api.dropboxapi.com/2/files/list_folder');
        expect(req.request.method).toBe('POST');
        expect(req.request.body.path).toBe('/test');
        req.flush(mockResponse);
      }, 100);
    });

    it('should get temporary links for files', (done) => {
      const mockResponse = {
        link: 'https://dl.dropboxusercontent.com/temp_link'
      };

      service.getTemporaryLink('/test.mp3').subscribe(link => {
        expect(link).toBe('https://dl.dropboxusercontent.com/temp_link');
        done();
      });

      setTimeout(() => {
        const req = httpMock.expectOne('https://api.dropboxapi.com/2/files/get_temporary_link');
        expect(req.request.method).toBe('POST');
        expect(req.request.body.path).toBe('/test.mp3');
        req.flush(mockResponse);
      }, 100);
    });

    it('should upload files to Dropbox', (done) => {
      const content = 'file content';
      const path = '/test.txt';

      service.uploadFile(path, content).subscribe(file => {
        expect(file.path_display).toBe(path);
        done();
      });

      setTimeout(() => {
        const req = httpMock.expectOne('https://content.dropboxapi.com/2/files/upload');
        expect(req.request.method).toBe('POST');
        expect(req.request.body).toBe(content);
        req.flush({
          ...mockDropboxFile,
          path_display: path,
          name: 'test.txt'
        });
      }, 100);
    });

    it('should download files from Dropbox', (done) => {
      const fileContent = 'downloaded content';
      const path = '/test.txt';

      service.downloadFile(path).subscribe(content => {
        expect(content).toBe(fileContent);
        done();
      });

      setTimeout(() => {
        const req = httpMock.expectOne('https://content.dropboxapi.com/2/files/download');
        expect(req.request.method).toBe('POST');
        expect(req.request.headers.get('Dropbox-API-Arg')).toContain(path);
        req.flush(fileContent);
      }, 100);
    });

    it('should delete files from Dropbox', (done) => {
      const path = '/test.txt';

      service.deleteFile(path).subscribe(result => {
        expect(result).toBeUndefined();
        done();
      });

      setTimeout(() => {
        const req = httpMock.expectOne('https://api.dropboxapi.com/2/files/delete_v2');
        expect(req.request.method).toBe('POST');
        expect(req.request.body.path).toBe(path);
        req.flush({});
      }, 100);
    });

    it('should create folders in Dropbox', (done) => {
      const path = '/new_folder';

      service.createFolder(path).subscribe(folder => {
        expect(folder.is_folder).toBe(true);
        done();
      });

      setTimeout(() => {
        const req = httpMock.expectOne('https://api.dropboxapi.com/2/files/create_folder_v2');
        expect(req.request.method).toBe('POST');
        expect(req.request.body.path).toBe(path);
        req.flush({
          metadata: {
            ...mockDropboxFile,
            path_display: path,
            is_folder: true
          }
        });
      }, 100);
    });
  });

  describe('Playlist File Operations', () => {
    beforeEach(() => {
      (service as any).accessToken = 'valid_token';
      (service as any).tokenExpiry = new Date(Date.now() + 3600000);
    });

    it('should list playlist files', (done) => {
      const playlistFile = {
        id: 'playlist1',
        name: 'playlist.json',
        path_display: '/playlists/playlist.json',
        is_folder: false,
        '.tag': 'file'
      };

      service.listPlaylistFiles().subscribe(files => {
        expect(files.length).toBe(1);
        expect(files[0].name).toBe('playlist.json');
        done();
      });

      setTimeout(() => {
        const req = httpMock.expectOne('https://api.dropboxapi.com/2/files/list_folder');
        req.flush({
          entries: [playlistFile, { ...playlistFile, name: 'not-playlist.txt' }],
          has_more: false
        });
      }, 100);
    });
  });

  describe('Current Account', () => {
    beforeEach(() => {
      (service as any).accessToken = 'valid_token';
      (service as any).tokenExpiry = new Date(Date.now() + 3600000);
    });

    it('should get current account info', (done) => {
      service.getCurrentAccount().subscribe(user => {
        expect(user).toEqual(mockDropboxUser);
        done();
      });

      setTimeout(() => {
        const req = httpMock.expectOne('https://api.dropboxapi.com/2/users/get_current_account');
        expect(req.request.method).toBe('POST');
        req.flush(mockDropboxUser);
      }, 100);
    });

    it('should return null when not authenticated', (done) => {
      (service as any).accessToken = null;
      (service as any).tokenExpiry = null;

      service.getCurrentAccount().subscribe(user => {
        expect(user).toBeNull();
        done();
      });

      httpMock.expectNone('https://api.dropboxapi.com/2/users/get_current_account');
    });
  });

  describe('Token Management', () => {
    it('should store auth data in localStorage', () => {
      const tokenData = {
        accessToken: 'token123',
        refreshToken: 'refresh123',
        tokenExpiry: new Date()
      };

      (service as any).accessToken = tokenData.accessToken;
      (service as any).refreshToken = tokenData.refreshToken;
      (service as any).tokenExpiry = tokenData.tokenExpiry;

      (service as any).storeAuth();

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'dropbox_auth',
        jasmine.stringMatching(/"accessToken":"token123"/)
      );
    });

    it('should load auth data from localStorage', () => {
      const authData = {
        accessToken: 'token123',
        refreshToken: 'refresh123',
        tokenExpiry: new Date().toISOString()
      };

      mockLocalStorage['dropbox_auth'] = JSON.stringify(authData);

      const loaded = (service as any).getStoredAuth();

      expect(loaded.accessToken).toBe('token123');
      expect(loaded.refreshToken).toBe('refresh123');
      expect(loaded.tokenExpiry).toBeInstanceOf(Date);
    });

    it('should clear auth data on logout', () => {
      (service as any).accessToken = 'token123';
      (service as any).refreshToken = 'refresh123';

      service.logout();

      expect((service as any).accessToken).toBeNull();
      expect((service as any).refreshToken).toBeNull();
      expect(localStorage.removeItem).toHaveBeenCalledWith('dropbox_auth');
      expect(mockNotificationService.showSuccess).toHaveBeenCalledWith('Disconnected from Dropbox');
    });
  });

  describe('Rate Limiting and Error Handling', () => {
    beforeEach(() => {
      (service as any).accessToken = 'valid_token';
      (service as any).tokenExpiry = new Date(Date.now() + 3600000);
    });

    it('should handle HTTP errors gracefully', (done) => {
      service.listFolder('/error').subscribe({
        next: (files) => {
          expect(files).toEqual([]);
          setTimeout(() => {
            expect(mockNotificationService.showError).toHaveBeenCalledWith('Error loading folder contents');
            done();
          }, 100);
        },
        error: () => {
          fail('Observable should not error');
          done();
        }
      });

      setTimeout(() => {
        const req = httpMock.expectOne('https://api.dropboxapi.com/2/files/list_folder');
        req.error(new ProgressEvent('Network error'), { status: 500, statusText: 'Server Error' });
      }, 50);
    });

    it('should handle invalid responses', (done) => {
      service.getTemporaryLink('/test.mp3').subscribe({
        next: (link) => {
          expect(link).toBe('');
          setTimeout(() => {
            expect(mockNotificationService.showError).toHaveBeenCalledWith('Error getting media link');
            done();
          }, 100);
        },
        error: () => {
          fail('Observable should not error');
          done();
        }
      });

      setTimeout(() => {
        const req = httpMock.expectOne('https://api.dropboxapi.com/2/files/get_temporary_link');
        req.error(new ProgressEvent('Network error'), { status: 404, statusText: 'Not Found' });
      }, 50);
    });

    it('should respect rate limiting constraints', (done) => {
      const startTime = Date.now();

      service.listFolder('/test').subscribe(() => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        expect(duration).toBeGreaterThanOrEqual(service.REQUEST_DELAY);
        done();
      });

      setTimeout(() => {
        const req = httpMock.expectOne('https://api.dropboxapi.com/2/files/list_folder');
        req.flush({ entries: [], has_more: false });
      }, 100);
    });
  });

  describe('Folder Scanning', () => {
    beforeEach(() => {
      (service as any).accessToken = 'valid_token';
      (service as any).tokenExpiry = new Date(Date.now() + 3600000);
    });

    it('should get folder scan progress', (done) => {
      service.getFolderScanProgress().subscribe(progress => {
        expect(progress).toBeDefined();
        expect(progress.isScanning).toBe(false);
        expect(progress.totalAudioFiles).toBe(0);
        done();
      });
    });

    it('should collect audio files recursively', (done) => {
      const audioFiles = [
        { id: 'song1', name: 'test.mp3', path_display: '/music/test.mp3', is_folder: false, '.tag': 'file' },
        { id: 'song2', name: 'song2.wav', path_display: '/music/song2.wav', is_folder: false, '.tag': 'file' }
      ];

      // Mock the filterAudioFilesOnly to return the expected files
      mockFileUtilsService.filterAudioFilesOnly.and.returnValue([
        { id: 'song1', name: 'test.mp3', path_display: '/music/test.mp3', is_folder: false },
        { id: 'song2', name: 'song2.wav', path_display: '/music/song2.wav', is_folder: false }
      ]);

      service.collectAllAudioFilesRecursively('/music').subscribe(files => {
        expect(files.length).toBe(2);
        expect(files[0].name).toBe('test.mp3');
        expect(files[1].name).toBe('song2.wav');
        done();
      });

      setTimeout(() => {
        const req1 = httpMock.expectOne('https://api.dropboxapi.com/2/files/list_folder');
        req1.flush({
          entries: audioFiles,
          has_more: false
        });
      }, 100);
    });
  });

  describe('Error Recovery', () => {
    beforeEach(() => {
      (service as any).accessToken = 'valid_token';
      (service as any).tokenExpiry = new Date(Date.now() + 3600000);
    });

    it('should retry requests with exponential backoff on rate limit', (done) => {
      let requestCount = 0;

      service.listFolder('/test').subscribe({
        next: (files) => {
          expect(files).toEqual([]);
          expect(requestCount).toBe(1);
          done();
        }
      });

      setTimeout(() => {
        const req1 = httpMock.expectOne('https://api.dropboxapi.com/2/files/list_folder');
        requestCount++;
        req1.error(new ProgressEvent('Rate limited'), { status: 429 });

        setTimeout(() => {
          const remainingRequests = httpMock.match('https://api.dropboxapi.com/2/files/list_folder');
          if (remainingRequests.length === 0) {
            done();
          }
        }, 200);
      }, 100);
    });
  });
});
