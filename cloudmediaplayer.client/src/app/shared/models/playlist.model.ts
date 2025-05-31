import { DropboxFile } from './dropbox.model';

/**
 * Interface for playlist item
 */
export interface PlaylistItem {
  file: DropboxFile;
  displayName: string;
}

/**
 * Interface for saved playlist with sync capabilities
 */
export interface SavedPlaylist {
  id: string;
  name: string;
  items: PlaylistItem[];
  created: Date;
  lastModified: Date;
  syncStatus?: 'local' | 'synced' | 'syncing' | 'error';
  dropboxRev?: string; // Dropbox revision for conflict detection
}

/**
 * Interface for sync status information
 */
export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSync: Date | null;
  pendingUploads: number;
  error: string | null;
}

/**
 * Interface for sync settings configuration
 */
export interface SyncSettings {
  enabled: boolean;
  autoSync: boolean;
}
