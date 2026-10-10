/**
 * Type definitions for internal message passing and Chrome API extensions
 */

/**
 * Message types for communication between content script, popup, and background
 */
export interface ScanMessage {
  type: 'SCAN_PAGE';
  nonce?: string;
}

export interface ScanResultMessage {
  type: 'SCAN_RESULT';
  files: DiscoveredFile[];
  layout: 'standard' | 'tiles';
  courseName?: string | undefined;
  pageUrl?: string;
  nonce?: string;
}

export interface ScanProgressMessage {
  type: 'SCAN_PROGRESS';
  foundCount: number;
  pageUrl?: string;
  nonce?: string;
}

export interface DownloadZipMessage {
  type: 'DOWNLOAD_ZIP';
  files: DownloadableFile[];
  layout: 'standard' | 'tiles';
  courseName?: string;
  downloadId: string;
}

export interface DownloadCompleteMessage {
  type: 'DOWNLOAD_COMPLETE';
  success: boolean;
  downloadedCount: number;
  totalCount: number;
  errors: string[];
  cancelled?: boolean | undefined;
  downloadId?: string | undefined;
}

export interface CancelDownloadMessage {
  type: 'CANCEL_DOWNLOAD';
  downloadId?: string | undefined;
}

/** Persisted popup state so reopening the popup restores instead of restarting. */
export interface PersistedScan {
  status: 'scanning' | 'done';
  pageUrl: string;
  files: DiscoveredFile[];
  layout: 'standard' | 'tiles';
  courseName?: string | undefined;
  foundCount: number;
  at: number;
}

export interface PersistedDownload {
  status: 'downloading' | 'done';
  success: boolean;
  downloadedCount: number;
  totalCount: number;
  errors: string[];
  at: number;
  downloadId?: string | undefined;
}

export type ExtensionMessage = ScanMessage | ScanResultMessage | ScanProgressMessage | DownloadZipMessage | DownloadCompleteMessage | CancelDownloadMessage;

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
  alreadyDownloaded?: boolean | undefined; // True if URL is in local download history
  generatedContent?: string | undefined; // Locally generated content (e.g. notes.md), no fetch needed
  images?: string[] | undefined; // Absolute image URLs to bundle alongside generated content
  sha?: string | undefined; // Content hash for generated files, changes surface as new
}

/**
 * File ready for download (selected files only)
 */
export interface DownloadableFile {
  url: string;
  title: string;
  folder?: string | undefined;
  filename: string;
  generatedContent?: string | undefined;
  images?: string[] | undefined;
  historyKey?: string | undefined; // History key (url or url#sha), so edits count as new
}

/**
 * Moodle activity link information
 */
export interface ActivityLink {
  url: string;
  title: string;
  folder?: string | undefined;
  originalFilename?: string | undefined;
}

/**
 * Tile section information for tiles layout
 */
export interface TileSection {
  title: string;
  activities: ActivityLink[];
}
