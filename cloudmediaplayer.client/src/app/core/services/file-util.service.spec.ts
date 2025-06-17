import { TestBed } from '@angular/core/testing';
import { FileUtilService } from './file-util.service';

describe('FileUtilsService', () => {
  let service: FileUtilService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(FileUtilService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('sanitizeFileName', () => {
    it('should replace invalid characters with underscores', () => {
      expect(service.sanitizeFileName('My<>:"/\\|?*Playlist')).toBe('My_Playlist');
      expect(service.sanitizeFileName('Normal Name')).toBe('Normal_Name');
    });

    it('should remove leading and trailing underscores', () => {
      expect(service.sanitizeFileName('  My Playlist  ')).toBe('My_Playlist');
      expect(service.sanitizeFileName('___test___')).toBe('test');
    });

    it('should return "Untitled" for empty or invalid names', () => {
      expect(service.sanitizeFileName('')).toBe('Untitled');
      expect(service.sanitizeFileName('   ')).toBe('Untitled');
      expect(service.sanitizeFileName(null as any)).toBe('Untitled');
      expect(service.sanitizeFileName(undefined as any)).toBe('Untitled');
    });

    it('should truncate long names to 255 characters', () => {
      const longName = 'a'.repeat(300);
      const sanitized = service.sanitizeFileName(longName);
      expect(sanitized.length).toBeLessThanOrEqual(255);
      expect(sanitized).toBe('a'.repeat(255));
    });

    it('should handle edge case where sanitization results in empty string', () => {
      expect(service.sanitizeFileName('<<>>')).toBe('Untitled');
      expect(service.sanitizeFileName('////')).toBe('Untitled');
    });
  });

  describe('getFileNameFromPath', () => {
    it('should extract filename from path', () => {
      expect(service.getFileNameFromPath('/music/rock/song.mp3')).toBe('song.mp3');
      expect(service.getFileNameFromPath('/single.mp3')).toBe('single.mp3');
      expect(service.getFileNameFromPath('filename.txt')).toBe('filename.txt');
    });

    it('should handle empty or root paths', () => {
      expect(service.getFileNameFromPath('')).toBe('');
      expect(service.getFileNameFromPath('/')).toBe('');
      expect(service.getFileNameFromPath('//')).toBe('');
    });

    it('should handle paths with trailing slashes', () => {
      expect(service.getFileNameFromPath('/music/song.mp3/')).toBe('song.mp3');
    });
  });

  describe('Media detection', () => {
    describe('File Type Detection', () => {
      it('should identify audio files correctly', () => {
        expect(service.isAudioFile('song.mp3')).toBe(true);
        expect(service.isAudioFile('music.wav')).toBe(true);
        expect(service.isAudioFile('audio.ogg')).toBe(true);
        expect(service.isAudioFile('track.m4a')).toBe(true);
        expect(service.isAudioFile('lossless.flac')).toBe(true);
        expect(service.isAudioFile('compressed.aac')).toBe(true);
      });

      it('should reject non-audio files', () => {
        expect(service.isAudioFile('document.pdf')).toBe(false);
        expect(service.isAudioFile('image.jpg')).toBe(false);
        expect(service.isAudioFile('video.mp4')).toBe(false);
        expect(service.isAudioFile('text.txt')).toBe(false);
      });

      it('should handle empty or undefined filenames', () => {
        expect(service.isAudioFile('')).toBe(false);
        expect(service.isAudioFile(undefined as any)).toBe(false);
      });

      it('should handle case insensitive extensions', () => {
        expect(service.isAudioFile('SONG.MP3')).toBe(true);
        expect(service.isAudioFile('Music.WAV')).toBe(true);
        expect(service.isAudioFile('Audio.OGG')).toBe(true);
      });
    });
  });

  describe('generatePlaylistFileName', () => {
    it('should generate playlist filename with .json extension', () => {
      expect(service.generatePlaylistFileName('My Playlist')).toBe('My_Playlist.json');
      expect(service.generatePlaylistFileName('Rock Songs')).toBe('Rock_Songs.json');
    });

    it('should handle special characters in playlist names', () => {
      expect(service.generatePlaylistFileName('My<>Playlist')).toBe('My_Playlist.json');
    });

    it('should handle empty playlist names', () => {
      expect(service.generatePlaylistFileName('')).toBe('Untitled.json');
    });
  });

  describe('generatePlaylistPath', () => {
    it('should generate full Dropbox path for playlists', () => {
      expect(service.generatePlaylistPath('My Playlist')).toBe('/playlists/My_Playlist.json');
      expect(service.generatePlaylistPath('Rock Songs')).toBe('/playlists/Rock_Songs.json');
    });

    it('should handle special characters in path generation', () => {
      expect(service.generatePlaylistPath('Test<>:"/\\|?*Playlist')).toBe('/playlists/Test_Playlist.json');
    });

    it('should handle empty names in path generation', () => {
      expect(service.generatePlaylistPath('')).toBe('/playlists/Untitled.json');
      expect(service.generatePlaylistPath('   ')).toBe('/playlists/Untitled.json');
    });
  });

  describe('filterAudioFilesOnly', () => {
    it('should filter only audio files from file list', () => {
      const files = [
        { id: '1', name: 'song.mp3', path_display: '/song.mp3', is_folder: false },
        { id: '2', name: 'folder', path_display: '/folder', is_folder: true },
        { id: '3', name: 'doc.pdf', path_display: '/doc.pdf', is_folder: false },
        { id: '4', name: 'music.wav', path_display: '/music.wav', is_folder: false }
      ];

      const audioFiles = service.filterAudioFilesOnly(files);

      expect(audioFiles.length).toBe(2);
      expect(audioFiles[0].name).toBe('song.mp3');
      expect(audioFiles[1].name).toBe('music.wav');
    });

    it('should return empty array when no audio files', () => {
      const files = [
        { id: '1', name: 'folder', path_display: '/folder', is_folder: true },
        { id: '2', name: 'doc.pdf', path_display: '/doc.pdf', is_folder: false }
      ];

      const audioFiles = service.filterAudioFilesOnly(files);

      expect(audioFiles.length).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle Unicode characters in filenames', () => {
      expect(service.sanitizeFileName('Música Española')).toBe('Música_Española');
      expect(service.sanitizeFileName('日本の音楽')).toBe('日本の音楽');
    });

    it('should handle very long paths', () => {
      const longPath = '/very/long/path/with/many/segments/that/goes/on/and/on/song.mp3';
      expect(service.getFileNameFromPath(longPath)).toBe('song.mp3');
    });

    it('should handle filenames with multiple dots', () => {
      expect(service.getFileNameFromPath('/music/my.song.final.mp3')).toBe('my.song.final.mp3');
    });
  });
});
