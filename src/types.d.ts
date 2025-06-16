/**
 * Type definitions for internal message passing and Chrome API extensions
 */

/**
 * Message types for communication between content script, popup, and background
 */
export interface ScanMessage {
  type: 'SCAN_PAGE';
}

export interface ScanResultMessage {
  type: 'SCAN_RESULT';
  files: DiscoveredFile[];
  layout: 'standard' | 'tiles';
  courseName?: string;
}

export interface ScanProgressMessage {
  type: 'SCAN_PROGRESS';
  foundCount: number;
}

export interface DownloadZipMessage {
  type: 'DOWNLOAD_ZIP';
  files: DownloadableFile[];
  layout: 'standard' | 'tiles';
  courseName?: string;
}

export interface DownloadCompleteMessage {
  type: 'DOWNLOAD_COMPLETE';
  success: boolean;
  downloadedCount: number;
  totalCount: number;
  errors: string[];
  zipTooBig?: boolean;
}

export interface StatusMessage {
  type: 'STATUS';
  message: string;
}

export type ExtensionMessage = ScanMessage | ScanResultMessage | ScanProgressMessage | DownloadZipMessage | DownloadCompleteMessage | StatusMessage;

/**
 * Discovered file from Moodle page scanning
 */
export interface DiscoveredFile {
  id: string;
  url: string;
  title: string;
  folder?: string | undefined;
  originalFilename?: string | undefined;
  selected: boolean;
  size?: number | undefined; // File size in bytes
  disabled?: boolean | undefined; // Whether file is disabled due to size
}

/**
 * File ready for download (selected files only)
 */
export interface DownloadableFile {
  url: string;
  title: string;
  folder?: string | undefined;
  filename: string;
}

/**
 * Moodle activity link information
 */
export interface ActivityLink {
  url: string;
  title: string;
  originalFilename?: string | undefined;
}

/**
 * Tile section information for tiles layout
 */
export interface TileSection {
  title: string;
  activities: ActivityLink[];
}

/**
 * Download options for chrome.downloads.download
 */
export interface DownloadOptions {
  url: string;
  filename: string;
  saveAs?: boolean;
}
