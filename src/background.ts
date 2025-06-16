import { ExtensionMessage, DownloadZipMessage, DownloadableFile } from './types';
import { URLUtils, Logger } from './utils';
import { zipSync, strToU8, Zippable } from 'fflate';
import { CONFIG } from './config';

/**
 * Background service worker for Moodle Downloader Chrome Extension
 * Handles ZIP creation and download operations
 */
class MoodleBackgroundService {
    constructor() {
        this.init();
    }

    /**
     * Initialize the background service worker
     */
    private init(): void {
        Logger.info('Background service worker initialized');

        // Listen for messages from popup and content scripts
        (globalThis as any).chrome.runtime.onMessage.addListener(
            (message: ExtensionMessage, _sender: any, sendResponse: any) => {
                this.handleMessage(message, sendResponse);
                return true; // Indicates async response
            }
        );

        // Listen for extension startup
        (globalThis as any).chrome.runtime.onStartup.addListener(() => {
            Logger.info('Extension started');
        });

        // Listen for extension installation
        (globalThis as any).chrome.runtime.onInstalled.addListener((details: any) => {
            Logger.info(`Extension installed/updated: ${details.reason}`);
        });
    }

    /**
     * Handle messages from popup and content scripts
     * @param message The message received
     * @param sendResponse Function to send response back
     */
    private async handleMessage(
        message: ExtensionMessage,
        sendResponse: (response?: any) => void
    ): Promise<void> {
        try {
            switch (message.type) {
                case 'DOWNLOAD_ZIP':
                    await this.handleZipDownloadRequest(message as DownloadZipMessage);
                    sendResponse({ success: true });
                    break;

                case 'STATUS':
                    Logger.info(`Status message: ${message.message}`);
                    sendResponse({ success: true });
                    break;

                default:
                    Logger.warn('Unknown message type:', message);
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            Logger.error('Error handling message:', error);
            sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    }

    /**
     * Handle ZIP download request from popup
     * @param message Download ZIP message with selected files
     */
    private async handleZipDownloadRequest(message: DownloadZipMessage): Promise<void> {
        const errors: string[] = [];
        let downloadedCount = 0;

        try {
            Logger.info(`Creating ZIP with ${message.files.length} files`);

            // Create a map to store all file data for the ZIP
            const zipFiles: Zippable = {};

            // Process files one by one to avoid memory issues
            for (let i = 0; i < message.files.length; i++) {
                const file = message.files[i];
                if (!file) continue;

                Logger.info(`Processing file ${i + 1}/${message.files.length}: ${file.title}`);

                try {
                    const fileData = await this.downloadFileForZip(file);
                    if (fileData) {
                        zipFiles[fileData.path] = fileData.content;
                        downloadedCount++;
                    }
                } catch (error) {
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    errors.push(`Failed to download ${file.title}: ${errorMessage}`);
                    Logger.error(`Error processing file ${file.title}:`, error);

                    // Add error file to ZIP
                    const errorContent = `Error downloading file: ${file.title}\nURL: ${file.url}\nError: ${errorMessage}`;
                    let errorPath = `${file.filename}.error.txt`;
                    if (file.folder) {
                        errorPath = `${this.sanitizeFolderName(file.folder)}/${file.filename}.error.txt`;
                    }
                    zipFiles[errorPath] = strToU8(errorContent);
                }

                // Small delay to prevent overwhelming the server
                await new Promise(resolve => setTimeout(resolve, 100));
            }            // Generate ZIP using fflate (more memory efficient)
            Logger.info('Generating ZIP file...');

            const zipBuffer = zipSync(zipFiles, { level: 6 });

            // Convert to base64 for download
            const zipBase64 = this.uint8ArrayToBase64(zipBuffer);
            const zipUrl = `data:application/zip;base64,${zipBase64}`;

            // Generate ZIP filename
            const zipFilename = this.generateZipFilename(message.layout, message.courseName);

            // Download the ZIP file
            const downloadId = await (globalThis as any).chrome.downloads.download({
                url: zipUrl,
                filename: zipFilename,
                saveAs: false
            });

            Logger.info(`ZIP download started with ID ${downloadId}: ${zipFilename}`);

            // Send completion message to popup
            await this.sendMessageToPopup({
                type: 'DOWNLOAD_COMPLETE',
                success: true,
                downloadedCount,
                totalCount: message.files.length,
                errors
            });

        } catch (error) {
            Logger.error('ZIP download failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push(`ZIP creation failed: ${errorMessage}`);

            // Send failure message to popup
            await this.sendMessageToPopup({
                type: 'DOWNLOAD_COMPLETE',
                success: false,
                downloadedCount,
                totalCount: message.files.length,
                errors
            });
        }
    }

    /**
     * Download a file for ZIP creation
     * @param file File to download
     * @returns File data for ZIP
     */
    private async downloadFileForZip(file: DownloadableFile): Promise<{ path: string, content: Uint8Array } | null> {
        const MAX_FILE_SIZE_LIMIT = CONFIG.maxFileSize; // Use config limit to prevent memory issues

        try {
            // Ensure URL has redirect parameter
            const downloadUrl = URLUtils.ensureRedirectParameter(file.url);

            Logger.info(`Downloading file: ${file.title}`);

            // Fetch the file content with timeout and follow redirects
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout

            const response = await fetch(downloadUrl, {
                signal: controller.signal,
                redirect: 'follow', // Follow redirects to get actual file
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Failed to fetch ${file.title}: ${response.status} ${response.statusText}`);
            }

            // Get actual filename from response headers if available
            let actualFilename = file.filename;
            const contentDisposition = response.headers.get('content-disposition');
            if (contentDisposition) {
                const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (matches && matches[1]) {
                    actualFilename = matches[1].replace(/['"]/g, '');
                    actualFilename = decodeURIComponent(actualFilename);
                }
            }

            // If still no proper filename, try to get it from URL or content type
            if (actualFilename === 'view.php' || !actualFilename.includes('.')) {
                const contentType = response.headers.get('content-type');
                const urlPath = new URL(response.url).pathname;
                const urlFilename = urlPath.split('/').pop();

                if (urlFilename && urlFilename.includes('.') && urlFilename !== 'view.php') {
                    actualFilename = decodeURIComponent(urlFilename);
                } else if (contentType) {
                    const ext = this.getExtensionFromContentType(contentType);
                    actualFilename = `${file.title.replace(/[<>:"/\\|?*]/g, '_')}.${ext}`;
                } else {
                    actualFilename = `${file.title.replace(/[<>:"/\\|?*]/g, '_')}.pdf`; // Default to PDF for course materials
                }
            }

            // Check file size to prevent memory issues (600MB limit)
            const contentLength = response.headers.get('content-length'); if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE_LIMIT) {
                throw new Error(`File too large: ${file.title} (${Math.round(parseInt(contentLength) / 1024 / 1024)}MB). Files over 50MB are skipped.`);
            } const fileBlob = await response.blob();

            // Check actual blob size
            if (fileBlob.size > MAX_FILE_SIZE_LIMIT) {
                throw new Error(`File too large after download: ${file.title} (${Math.round(fileBlob.size / 1024 / 1024)}MB). Files over 50MB are skipped.`);
            }

            // Determine file path in ZIP using the actual filename
            let zipPath = actualFilename;
            if (file.folder) {
                zipPath = `${this.sanitizeFolderName(file.folder)}/${actualFilename}`;
            }

            // Convert blob to Uint8Array for fflate
            const arrayBuffer = await fileBlob.arrayBuffer();
            const uint8Array = new Uint8Array(arrayBuffer);

            Logger.info(`Downloaded for ZIP: ${zipPath} (${Math.round(fileBlob.size / 1024)}KB)`);

            return { path: zipPath, content: uint8Array };

        } catch (error) {
            Logger.error(`Error downloading file for ZIP: ${file.title}`, error);
            throw error;
        }
    }    /**
     * Convert Uint8Array to base64 string using chunked processing
     * @param uint8Array The array to convert
     * @returns Base64 string
     */
    private uint8ArrayToBase64(uint8Array: Uint8Array): string {
        const CHUNK_SIZE = 8192; // Process in 8KB chunks to avoid memory issues
        let binary = '';

        for (let i = 0; i < uint8Array.length; i += CHUNK_SIZE) {
            const chunk = uint8Array.subarray(i, i + CHUNK_SIZE);
            binary += String.fromCharCode.apply(null, Array.from(chunk));
        }

        return btoa(binary);
    }    /**
     * Generate filename for the ZIP download
     * @param layout The layout type
     * @param courseName Course name from DOM (optional)
     * @returns Generated ZIP filename
     */
    private generateZipFilename(layout: 'standard' | 'tiles', courseName?: string): string {
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');

        if (courseName) {
            // Use course name if available
            return `${courseName}_${timestamp}.zip`;
        } else {
            // Fallback to old naming scheme
            const layoutPrefix = layout === 'tiles' ? 'tiles' : 'standard';
            return `moodle_files_${layoutPrefix}_${timestamp}.zip`;
        }
    }

    /**
     * Sanitize folder name for ZIP structure
     * @param folderName Original folder name
     * @returns Sanitized folder name
     */
    private sanitizeFolderName(folderName: string): string {
        return folderName
            .replace(/[<>:"/\\|?*]/g, '_')
            .replace(/\s+/g, '_')
            .trim();
    }

    /**
     * Get file extension from content type
     * @param contentType The content type header
     * @returns File extension
     */
    private getExtensionFromContentType(contentType: string): string {
        const typeMap: { [key: string]: string } = {
            'application/pdf': 'pdf',
            'application/msword': 'doc',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
            'application/vnd.ms-excel': 'xls',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
            'application/vnd.ms-powerpoint': 'ppt',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
            'text/plain': 'txt',
            'text/html': 'html',
            'image/jpeg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'application/zip': 'zip',
            'application/x-zip-compressed': 'zip'
        };

        const mainType = contentType?.split(';')[0]?.trim().toLowerCase() || '';
        return typeMap[mainType] || 'bin';
    }

    /**
     * Send a message to the popup
     * @param message Message to send
     */
    private async sendMessageToPopup(message: any): Promise<void> {
        try {
            // Send message to runtime (popup will receive it if open)
            await (globalThis as any).chrome.runtime.sendMessage(message);

            Logger.info('Message sent to popup:', message);
        } catch (error) {
            Logger.warn('Could not send message to popup (popup may be closed):', error);
        }
    }
}

// Initialize background service worker
new MoodleBackgroundService();
