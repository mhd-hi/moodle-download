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
            let actualFilename = file.filename; // Start with our preferred filename
            const contentDisposition = response.headers.get('content-disposition');            // Only use server filename if our filename doesn't have a valid extension
            if (!this.hasValidExtension(actualFilename) && contentDisposition) {
                const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (matches && matches[1]) {
                    const serverFilename = matches[1].replace(/['"]/g, '');
                    const decodedServerFilename = decodeURIComponent(serverFilename);

                    // Extract just the extension from server filename if it has one
                    if (this.hasValidExtension(decodedServerFilename)) {
                        const serverExt = this.getFileExtension(decodedServerFilename);
                        actualFilename = `${actualFilename}.${serverExt}`;
                    }
                }
            }

            // If still no proper filename, try to get extension from content type or URL
            if (!this.hasValidExtension(actualFilename)) {
                const contentType = response.headers.get('content-type');
                const urlPath = new URL(response.url).pathname;
                const urlFilename = urlPath.split('/').pop();

                Logger.info(`Determining extension for ${file.title}: contentType=${contentType}, urlFilename=${urlFilename}`);                // Try to get extension from URL first
                if (urlFilename && this.hasValidExtension(urlFilename) && urlFilename !== 'view.php') {
                    const urlExt = this.getFileExtension(urlFilename);
                    actualFilename = `${actualFilename}.${urlExt}`;
                    Logger.info(`Using URL extension: ${urlExt}`);
                } else if (contentType) {
                    // Get extension from content type
                    const ext = this.getExtensionFromContentType(contentType);
                    actualFilename = `${actualFilename}.${ext}`;
                    Logger.info(`Using content-type extension: ${ext} (from ${contentType})`);
                } else {
                    // For Moodle course materials, PDF is the most common format
                    actualFilename = `${actualFilename}.pdf`;
                    Logger.info(`Using default PDF extension`);
                }
            }

            // Sanitize the filename to ensure it's safe for file systems and ZIP files
            actualFilename = this.sanitizeFilename(actualFilename);

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
    }    /**
     * Check if a filename has a valid file extension
     * @param filename The filename to check
     * @returns True if the filename has a valid extension
     */
    private hasValidExtension(filename: string): boolean {
        if (!filename.includes('.')) {
            return false;
        }

        const parts = filename.split('.');
        if (parts.length < 2) {
            return false;
        }

        const extension = parts[parts.length - 1];
        if (!extension) {
            return false;
        }

        const lowerExt = extension.toLowerCase();

        // Valid file extensions should be 1-5 characters and contain only letters/numbers
        const isValidFormat = /^[a-z0-9]{1,5}$/i.test(lowerExt);

        // Common file extensions that we recognize
        const commonExtensions = [
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
            'txt', 'html', 'htm', 'css', 'js', 'json', 'xml',
            'jpg', 'jpeg', 'png', 'gif', 'svg', 'bmp',
            'mp3', 'mp4', 'avi', 'wav', 'mov',
            'zip', 'rar', '7z', 'tar', 'gz',
            'exe', 'msi', 'dmg', 'deb', 'rpm'
        ];

        return isValidFormat && commonExtensions.includes(lowerExt);
    }

    /**
     * Extract the file extension from a filename
     * @param filename The filename
     * @returns The file extension (without the dot)
     */
    private getFileExtension(filename: string): string {
        if (!filename.includes('.')) {
            return '';
        }
        const parts = filename.split('.');
        const extension = parts[parts.length - 1];
        return extension || '';
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
     * Sanitize filename for safe use in file systems and ZIP files
     * @param filename Original filename
     * @returns Sanitized filename
     */
    private sanitizeFilename(filename: string): string {
        // Replace invalid characters with underscores
        // Invalid characters: < > : " / \ | ? * and control characters
        let sanitized = filename
            .replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_')
            .replace(/\s+/g, ' ') // Normalize spaces but keep them (unlike folder names)
            .trim();

        // Handle reserved filenames on Windows
        const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;
        if (reservedNames.test(sanitized)) {
            sanitized = `_${sanitized}`;
        }

        // Ensure filename is not empty and doesn't start/end with dots or spaces
        if (!sanitized || sanitized === '.' || sanitized === '..') {
            sanitized = 'file';
        }

        // Remove leading/trailing dots and spaces
        sanitized = sanitized.replace(/^[.\s]+|[.\s]+$/g, '');

        // Ensure we still have content after cleaning
        if (!sanitized) {
            sanitized = 'file';
        }

        // Limit filename length (most file systems support 255 chars, but let's be conservative)
        if (sanitized.length > 200) {
            const ext = sanitized.includes('.') ? '.' + sanitized.split('.').pop() : '';
            const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.')) || sanitized;
            sanitized = nameWithoutExt.substring(0, 200 - ext.length) + ext;
        }

        return sanitized;
    }    /**
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
            'text/css': 'css',
            'text/javascript': 'js',
            'application/javascript': 'js',
            'application/json': 'json',
            'image/jpeg': 'jpg',
            'image/jpg': 'jpg',
            'image/png': 'png',
            'image/gif': 'gif',
            'image/svg+xml': 'svg',
            'application/zip': 'zip',
            'application/x-zip-compressed': 'zip',
            'application/x-rar-compressed': 'rar',
            'application/x-7z-compressed': '7z',
            'video/mp4': 'mp4',
            'video/avi': 'avi',
            'audio/mpeg': 'mp3',
            'audio/wav': 'wav'
        };

        const mainType = contentType?.split(';')[0]?.trim().toLowerCase() || '';
        const extension = typeMap[mainType];

        if (extension) {
            Logger.info(`Mapped content-type '${mainType}' to extension '${extension}'`);
            return extension;
        } else {
            // For unknown content types in an academic context, PDF is most likely
            Logger.info(`Unknown content-type '${mainType}', defaulting to PDF`);
            return 'pdf';
        }
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
