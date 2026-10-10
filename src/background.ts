import { ExtensionMessage, DownloadZipMessage, CancelDownloadMessage, ScanProgressMessage, ScanResultMessage, DownloadableFile, PersistedScan, PersistedDownload } from './types';
import { URLUtils, Logger } from './utils';
import { zipSync, strToU8, Zippable } from 'fflate';
import { CONFIG } from './config';

/**
 * Background service worker for Moodle Downloader Chrome Extension
 * Handles ZIP creation and download operations.
 * Also persists scan/download state so a reopened popup restores instead of restarting.
 */
class MoodleBackgroundService {
    private static readonly SCAN_KEY = 'md_scan';
    private static readonly DOWNLOAD_KEY = 'md_download';
    private static readonly HISTORY_KEY = 'md_downloaded_urls';
    private lastProgressPersist = 0;
    private activeDownloadId: string | null = null;
    private cancelledDownloadIds = new Set<string>();
    private activeFetch: AbortController | null = null;

    constructor() {
        this.init();
    }

    /**
     * Initialize the background service worker
     */
    private init(): void {
        // Listen for messages from popup and content scripts
        (globalThis as any).chrome.runtime.onMessage.addListener(
            (message: ExtensionMessage, _sender: any, sendResponse: any) => {
                this.handleMessage(message, sendResponse);
                return true; // Indicates async response
            }
        );
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

                case 'SCAN_PROGRESS': {
                    const progress = message as ScanProgressMessage;
                    // Throttle persistence — progress fires per file.
                    const now = Date.now();
                    if (now - this.lastProgressPersist > 1000) {
                        this.lastProgressPersist = now;
                        const scan: PersistedScan = {
                            status: 'scanning',
                            pageUrl: progress.pageUrl || '',
                            files: [],
                            layout: 'standard',
                            foundCount: progress.foundCount,
                            at: now
                        };
                        chrome.storage.local.set({ [MoodleBackgroundService.SCAN_KEY]: scan }).catch(() => { /* ignore */ });
                    }
                    this.forwardMessageToPopup(progress);
                    sendResponse({ success: true });
                    break;
                }

                case 'SCAN_RESULT': {
                    // Content script broadcasts its result so state survives a closed popup.
                    const result = message as ScanResultMessage;
                    const scan: PersistedScan = {
                        status: 'done',
                        pageUrl: result.pageUrl || '',
                        files: result.files,
                        layout: result.layout,
                        courseName: result.courseName,
                        foundCount: result.files.length,
                        at: Date.now()
                    };
                    await chrome.storage.local.set({ [MoodleBackgroundService.SCAN_KEY]: scan }).catch(() => { /* ignore */ });
                    this.forwardMessageToPopup(result);
                    sendResponse({ success: true });
                    break;
                }

                case 'CANCEL_DOWNLOAD': {
                    const cancelId = (message as CancelDownloadMessage).downloadId;
                    if (!cancelId || cancelId === this.activeDownloadId) {
                        if (this.activeDownloadId) this.cancelledDownloadIds.add(this.activeDownloadId);
                        this.activeFetch?.abort();
                    }
                    sendResponse({ success: true });
                    break;
                }

                default:
                    Logger.warn('Unknown message type:', message);
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            Logger.error('Error handling message:', error);
            sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
        }
    }    /**
     * Forward message to popup window
     */
    private async forwardMessageToPopup(message: ScanProgressMessage | ScanResultMessage): Promise<void> {
        try {
            chrome.runtime.sendMessage(message);
        } catch (error) {
            Logger.error('Error forwarding message to popup:', error);
        }
    }

    /**
     * Handle ZIP download request from popup
     * @param message Download ZIP message with selected files
     */
    private async handleZipDownloadRequest(message: DownloadZipMessage): Promise<void> {
        const errors: string[] = [];
        let downloadedCount = 0;
        const downloadId = message.downloadId;
        this.activeDownloadId = downloadId;
        this.cancelledDownloadIds.delete(downloadId);

        const downloading: PersistedDownload = {
            status: 'downloading', success: false,
            downloadedCount: 0, totalCount: message.files.length, errors: [], at: Date.now(),
            downloadId
        };
        await chrome.storage.local.set({ [MoodleBackgroundService.DOWNLOAD_KEY]: downloading }).catch(() => { /* ignore */ });

        try {
            const zipFiles: Zippable = {};
            const usedPaths = new Set<string>();

            for (let i = 0; i < message.files.length; i++) {
                if (this.cancelledDownloadIds.has(downloadId)) break;
                const file = message.files[i];
                if (!file) continue;

                try {
                    const fileData = await this.downloadFileForZip(file);
                    if (fileData) {
                        const uniquePath = this.getUniqueZipPath(fileData.path, usedPaths);
                        zipFiles[uniquePath] = fileData.content;
                        usedPaths.add(uniquePath);
                        for (const extra of fileData.extra || []) {
                            const uniqueExtraPath = this.getUniqueZipPath(extra.path, usedPaths);
                            zipFiles[uniqueExtraPath] = extra.content;
                            usedPaths.add(uniqueExtraPath);
                        }
                        downloadedCount++;
                    }
                } catch (error) {
                    if (this.cancelledDownloadIds.has(downloadId)) break;
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    errors.push(`Failed to download ${file.title}: ${errorMessage}`);

                    const errorContent = `Error downloading file: ${file.title}\nURL: ${file.url}\nError: ${errorMessage}`;
                    let errorPath = `${file.filename}.error.txt`;
                    if (file.folder) {
                        errorPath = `${this.sanitizeFolderName(file.folder)}/${file.filename}.error.txt`;
                    }
                    const uniqueErrorPath = this.getUniqueZipPath(errorPath, usedPaths);
                    zipFiles[uniqueErrorPath] = strToU8(errorContent);
                    usedPaths.add(uniqueErrorPath);
                }
            }

            if (this.cancelledDownloadIds.has(downloadId)) {
                await this.finishDownload(downloadId, false, [], downloadedCount, message.files.length, ['Download cancelled']);
                await this.sendMessageToPopup({
                    type: 'DOWNLOAD_COMPLETE',
                    success: false,
                    downloadedCount,
                    totalCount: message.files.length,
                    errors: ['Download cancelled'],
                    cancelled: true,
                    downloadId
                });
                return;
            }

            const zipBuffer = zipSync(zipFiles, { level: 6 });

            // Convert to base64 for download
            const zipBase64 = this.uint8ArrayToBase64(zipBuffer);
            const zipUrl = `data:application/zip;base64,${zipBase64}`;

            // Generate ZIP filename
            const zipFilename = this.generateZipFilename(message.layout, message.courseName);

            // Download the ZIP file
            await (globalThis as any).chrome.downloads.download({
                url: zipUrl,
                filename: zipFilename,
                saveAs: false
            });

            // Persist completion (merges history so a closed popup doesn't lose it)
            await this.finishDownload(downloadId, true, message.files.map(f => f.historyKey || f.url), downloadedCount, message.files.length, errors);

            // Send completion message to popup
            await this.sendMessageToPopup({
                type: 'DOWNLOAD_COMPLETE',
                success: true,
                downloadedCount,
                totalCount: message.files.length,
                errors,
                downloadId
            });

        } catch (error) {
            Logger.error('ZIP download failed:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            errors.push(`ZIP creation failed: ${errorMessage}`);

            await this.finishDownload(downloadId, false, [], downloadedCount, message.files.length, errors);

            // Send failure message to popup
            await this.sendMessageToPopup({
                type: 'DOWNLOAD_COMPLETE',
                success: false,
                downloadedCount,
                totalCount: message.files.length,
                errors,
                downloadId
            });
        }
    }

    private async finishDownload(downloadId: string, success: boolean, urls: string[], downloadedCount: number, totalCount: number, errors: string[]): Promise<void> {
        try {
            if (success && urls.length > 0) {
                const got = await chrome.storage.local.get(MoodleBackgroundService.HISTORY_KEY);
                const history = new Set<string>(Array.isArray(got[MoodleBackgroundService.HISTORY_KEY]) ? got[MoodleBackgroundService.HISTORY_KEY] : []);
                urls.forEach(url => history.add(url));
                await chrome.storage.local.set({ [MoodleBackgroundService.HISTORY_KEY]: [...history] });
            }
            const done: PersistedDownload = {
                status: 'done', success, downloadedCount, totalCount, errors, at: Date.now(), downloadId
            };
            await chrome.storage.local.set({ [MoodleBackgroundService.DOWNLOAD_KEY]: done });
        } catch { /* ignore */ }
    }

    /**
     * Download a file for ZIP creation
     * @param file File to download
     * @returns File data for ZIP
     */
    private async downloadFileForZip(file: DownloadableFile): Promise<{ path: string, content: Uint8Array, extra?: Array<{ path: string, content: Uint8Array }> } | null> {
        const MAX_FILE_SIZE_LIMIT = CONFIG.maxFileSize;

        try {
            if (file.generatedContent !== undefined) {
                let notes = file.generatedContent;
                const extra: Array<{ path: string, content: Uint8Array }> = [];
                for (let i = 0; i < (file.images || []).length; i++) {
                    const imageUrl = file.images?.[i];
                    if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) continue;
                    try {
                        const imageResponse = await fetch(imageUrl, { credentials: 'include' });
                        if (!imageResponse.ok) continue;
                        const imageBytes = new Uint8Array(await imageResponse.arrayBuffer());
                        if (imageBytes.length > MAX_FILE_SIZE_LIMIT) continue;
                        const ext = this.getImageExtension(imageUrl, imageResponse.headers.get('content-type'));
                        const imageName = `notes_images/image-${i + 1}.${ext}`;
                        const imagePath = file.folder
                            ? `${this.sanitizeFolderName(file.folder)}/${imageName}`
                            : imageName;
                        extra.push({ path: imagePath, content: imageBytes });
                        notes = notes.split(imageUrl).join(`notes_images/image-${i + 1}.${ext}`);
                    } catch {
                        // Keep the original remote URL when an image cannot be fetched.
                    }
                }
                const content = new TextEncoder().encode(notes);
                if (content.length > MAX_FILE_SIZE_LIMIT) {
                    throw new Error(`Generated file too large: ${file.title}`);
                }
                let generatedPath = this.sanitizeFilename(file.filename);
                if (file.folder) {
                    generatedPath = `${this.sanitizeFolderName(file.folder)}/${generatedPath}`;
                }
                return { path: generatedPath, content, extra };
            }

            const downloadUrl = URLUtils.ensureRedirectParameter(file.url);

            const controller = new AbortController();
            this.activeFetch = controller;
            const timeoutId = setTimeout(() => controller.abort(), 60000);

            let response: Response;
            try {
                response = await fetch(downloadUrl, {
                    signal: controller.signal,
                    redirect: 'follow',
                });
            } finally {
                clearTimeout(timeoutId);
                if (this.activeFetch === controller) this.activeFetch = null;
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch ${file.title}: ${response.status} ${response.statusText}`);
            }
            let actualFilename = file.filename;
            const contentDisposition = response.headers.get('content-disposition');            // Only use server filename if our filename doesn't have a valid extension
            if (!this.hasValidExtension(actualFilename) && contentDisposition) {
                const matches = contentDisposition.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/);
                if (matches && matches[1]) {
                    const serverFilename = matches[1].replace(/['"]/g, '');
                    const decodedServerFilename = decodeURIComponent(serverFilename);

                    if (this.hasValidExtension(decodedServerFilename)) {
                        const serverExt = this.getFileExtension(decodedServerFilename);
                        actualFilename = `${actualFilename}.${serverExt}`;
                    }
                }
            }

            if (!this.hasValidExtension(actualFilename)) {
                const contentType = response.headers.get('content-type');
                const urlPath = new URL(response.url).pathname;
                const urlFilename = urlPath.split('/').pop();

                if (urlFilename && this.hasValidExtension(urlFilename) && urlFilename !== 'view.php') {
                    actualFilename = `${actualFilename}.${this.getFileExtension(urlFilename)}`;
                } else if (contentType) {
                    actualFilename = `${actualFilename}.${this.getExtensionFromContentType(contentType)}`;
                } else {
                    actualFilename = `${actualFilename}.pdf`;
                }
            }

            actualFilename = this.sanitizeFilename(actualFilename);

            const contentLength = response.headers.get('content-length'); if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE_LIMIT) {
                throw new Error(`File too large: ${file.title} (${Math.round(parseInt(contentLength) / 1024 / 1024)}MB). Files over 50MB are skipped.`);
            } const fileBlob = await response.blob();

            if (fileBlob.size > MAX_FILE_SIZE_LIMIT) {
                throw new Error(`File too large after download: ${file.title} (${Math.round(fileBlob.size / 1024 / 1024)}MB). Files over 50MB are skipped.`);
            }

            let zipPath = actualFilename;
            if (file.folder) {
                zipPath = `${this.sanitizeFolderName(file.folder)}/${actualFilename}`;
            }

            const arrayBuffer = await fileBlob.arrayBuffer();

            return { path: zipPath, content: new Uint8Array(arrayBuffer) };

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
        return courseName ? `${courseName}.zip` : `moodle_files_${layout}.zip`;
    }    /**
     * Check if a filename has a valid file extension
     * @param filename The filename to check
     * @returns True if the filename has a valid extension
     */
    private hasValidExtension(filename: string): boolean {
        if (!filename.includes('.')) return false;
        const extension = filename.split('.').pop()?.toLowerCase() || '';
        return /^[a-z0-9]{1,5}$/.test(extension);
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
            .split('/')
            .map(part => part.replace(/[<>:"\\|?*]/g, '_').trim())
            .filter(Boolean)
            .join('/');
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
        // Unknown types default to PDF — most common for course materials.
        return typeMap[mainType] || 'pdf';
    }

    private getImageExtension(url: string, contentType: string | null): string {
        const fromType = contentType?.split(';')[0]?.split('/')[1]?.toLowerCase();
        if (fromType && /^[a-z0-9]{2,5}$/.test(fromType)) return fromType === 'svg+xml' ? 'svg' : fromType;
        const path = new URL(url).pathname;
        const ext = path.split('.').pop()?.toLowerCase();
        return ext && /^[a-z0-9]{2,5}$/.test(ext) ? ext : 'bin';
    }

    /**
     * Send a message to the popup
     * @param message Message to send
     */
    private async sendMessageToPopup(message: any): Promise<void> {
        try {
            await (globalThis as any).chrome.runtime.sendMessage(message);
        } catch {
            // Popup closed — nothing to do
        }
    }

    /**
     * Generate a unique ZIP path to prevent duplicate filenames from overwriting each other
     * @param originalPath The original file path
     * @param usedPaths Set of already used paths
     * @returns A unique path that doesn't conflict with existing ones
     */
    private getUniqueZipPath(originalPath: string, usedPaths: Set<string>): string {
        if (!usedPaths.has(originalPath)) {
            return originalPath;
        }

        const lastSlashIndex = originalPath.lastIndexOf('/');
        const directory = lastSlashIndex >= 0 ? originalPath.substring(0, lastSlashIndex + 1) : '';
        const filename = lastSlashIndex >= 0 ? originalPath.substring(lastSlashIndex + 1) : originalPath;

        const lastDotIndex = filename.lastIndexOf('.');
        const nameWithoutExt = lastDotIndex >= 0 ? filename.substring(0, lastDotIndex) : filename;
        const extension = lastDotIndex >= 0 ? filename.substring(lastDotIndex) : '';

        let counter = 1;
        let uniquePath: string;
        do {
            uniquePath = `${directory}${nameWithoutExt} (${counter})${extension}`;
            counter++;
        } while (usedPaths.has(uniquePath));

        return uniquePath;
    }
}

// Initialize background service worker
new MoodleBackgroundService();
