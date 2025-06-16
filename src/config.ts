/**
 * Configuration file for Moodle Downloader Chrome Extension
 */

export interface ExtensionConfig {
    maxFileSize: number;
}

export const CONFIG: ExtensionConfig = {
    // 50MB file size limit (files larger than this will be disabled in popup) 
    maxFileSize: 50 * 1024 * 1024
};
