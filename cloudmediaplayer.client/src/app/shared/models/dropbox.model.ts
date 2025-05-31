/**
 * Interface for Dropbox user information
 */
export interface DropboxUser {
  account_id: string;
  name?: {
    given_name?: string;
    surname?: string;
    familiar_name?: string;
    display_name?: string;
    abbreviated_name?: string;
  };
  email?: string;
  email_verified?: boolean;
  disabled?: boolean;
  locale?: string;
  referral_link?: string;
  is_paired?: boolean;
  account_type?: {
    '.tag': string;
  };
  root_info?: {
    '.tag': string;
    root_namespace_id?: string;
    home_namespace_id?: string;
  };
  profile_photo_url?: string;
  country?: string;
}

/**
 * Interface for authentication state
 */
export interface AuthState {
  isAuthenticated: boolean;
  userInfo: DropboxUser | null;
  tokenExpiry: Date | null;
  error: string | null;
}

/**
 * Interface for progress updates during folder scanning
 */
export interface FolderScanProgress {
  currentPath: string;
  isScanning: boolean;
  totalAudioFiles: number;
}

/**
 * Interface that defines the structure of a Dropbox file or folder
 */
export interface DropboxFile {
  id: string;
  name: string;
  path_display: string;
  is_folder: boolean;
  media_info?: {
    metadata: {
      dimensions?: { height: number; width: number };
    };
  };
  size?: number;
  client_modified?: string;
  server_modified?: string;
  rev?: string; // revision identifier
}
