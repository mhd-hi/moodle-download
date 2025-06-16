/**
 * Configuration file for Moodle Downloader Chrome Extension
 */

export interface ExtensionConfig {
    /** Maximum file size in bytes (files larger than this will be disabled) */
    maxFileSize: number;
}

/**
 * Default configuration for the extension
 */
export const CONFIG: ExtensionConfig = {
    // 50MB file size limit
    maxFileSize: 50 * 1024 * 1024
};
