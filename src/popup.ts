import { DiscoveredFile, ScanResultMessage, DownloadZipMessage, DownloadCompleteMessage } from './types';
import { Logger } from './utils';

/**
 * Popup script for Moodle Downloader Chrome Extension
 * Handles the user interface for file selection and download initiation
 */
class MoodlePopup {
    private files: DiscoveredFile[] = [];
    private layout: 'standard' | 'tiles' = 'standard';
    private courseName: string | undefined;

    // DOM elements
    private loadingEl!: HTMLElement;
    private errorEl!: HTMLElement;
    private errorMessageEl!: HTMLElement;
    private contentEl!: HTMLElement;
    private noFilesEl!: HTMLElement;
    private selectedCountEl!: HTMLElement;
    private totalCountEl!: HTMLElement;
    private filesContainerEl!: HTMLElement;
    private downloadBtnEl!: HTMLButtonElement;
    private downloadTextEl!: HTMLElement;
    private selectAllBtnEl!: HTMLButtonElement;
    private selectNoneBtnEl!: HTMLButtonElement;

    constructor() {
        this.init();
    }
    /**
     * Initialize the popup
     */
    private async init(): Promise<void> {
        Logger.info('Popup initialized');

        // Get DOM elements
        this.loadingEl = document.getElementById('loading')!;
        this.errorEl = document.getElementById('error')!;
        this.errorMessageEl = document.getElementById('error-message')!;
        this.contentEl = document.getElementById('content')!;
        this.noFilesEl = document.getElementById('no-files')!;
        this.selectedCountEl = document.getElementById('selected-count')!;
        this.totalCountEl = document.getElementById('total-count')!;
        this.filesContainerEl = document.getElementById('files-container')!;
        this.downloadBtnEl = document.getElementById('download-btn') as HTMLButtonElement;
        this.downloadTextEl = document.getElementById('download-text')!;
        this.selectAllBtnEl = document.getElementById('select-all') as HTMLButtonElement;
        this.selectNoneBtnEl = document.getElementById('select-none') as HTMLButtonElement;

        // Set up event listeners
        this.setupEventListeners();

        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message: any) => {
            this.handleBackgroundMessage(message);
        });

        // Start scanning the current tab
        await this.scanCurrentTab();
    }

    /**
     * Set up event listeners for UI elements
     */
    private setupEventListeners(): void {
        this.downloadBtnEl.addEventListener('click', () => this.handleDownload());
        this.selectAllBtnEl.addEventListener('click', () => this.selectAll());
        this.selectNoneBtnEl.addEventListener('click', () => this.selectNone());
    }

    /**
     * Scan the current tab for downloadable files
     */
    private async scanCurrentTab(): Promise<void> {
        try {
            Logger.info('Scanning current tab for files');

            // Get current tab
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0]) {
                this.showError('No active tab found');
                return;
            }

            const tab = tabs[0];

            // Check if tab is a supported Moodle page
            if (!tab.url?.includes('ena.etsmtl.ca')) {
                this.showError('Please navigate to a Moodle course page (ena.etsmtl.ca) first');
                return;
            }

            // Send scan message to content script
            const response = await chrome.tabs.sendMessage(tab.id!, { type: 'SCAN_PAGE' });

            if (response && response.type === 'SCAN_RESULT') {
                this.handleScanResult(response as ScanResultMessage);
            } else {
                this.showError('Failed to scan page. Please refresh and try again.');
            }

        } catch (error) {
            Logger.error('Error scanning tab:', error);
            this.showError('Failed to scan page. Make sure you\'re on a Moodle course page. Please refresh the page.');
        }
    }

    /**
     * Handle scan result from content script
     */
    private handleScanResult(result: ScanResultMessage): void {
        this.files = result.files;
        this.layout = result.layout;
        this.courseName = result.courseName;

        Logger.info(`Found ${this.files.length} files in ${this.layout} layout`);

        if (this.files.length === 0) {
            this.showNoFiles();
        } else {
            this.showFiles();
        }
    }

    /**
     * Display files in the popup
     */
    private showFiles(): void {
        this.hideAll();
        this.contentEl.style.display = 'block';

        this.updateCounts();
        this.renderFiles();
    }

    /**
     * Render the files list
     */
    private renderFiles(): void {
        this.filesContainerEl.innerHTML = '';

        if (this.layout === 'tiles') {
            this.renderTilesLayout();
        } else {
            this.renderStandardLayout();
        }
    }

    /**
     * Render files in tiles layout (grouped by folders)
     */
    private renderTilesLayout(): void {
        const groups = new Map<string, DiscoveredFile[]>();

        // Group files by folder
        this.files.forEach(file => {
            const folder = file.folder || 'Other Files';
            if (!groups.has(folder)) {
                groups.set(folder, []);
            }
            groups.get(folder)!.push(file);
        });

        // Render each group
        groups.forEach((files, folderName) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'file-group';

            const headerEl = document.createElement('div');
            headerEl.className = 'folder-header';
            headerEl.textContent = `📁 ${folderName} (${files.length} files)`;
            groupEl.appendChild(headerEl);

            files.forEach(file => {
                groupEl.appendChild(this.createFileItem(file));
            });

            this.filesContainerEl.appendChild(groupEl);
        });
    }

    /**
     * Render files in standard layout (no grouping)
     */
    private renderStandardLayout(): void {
        this.files.forEach(file => {
            this.filesContainerEl.appendChild(this.createFileItem(file));
        });
    }    /**
     * Create a file item element
     */
    private createFileItem(file: DiscoveredFile): HTMLElement {
        const itemEl = document.createElement('div');
        itemEl.className = file.disabled ? 'file-item disabled' : 'file-item';

        const checkboxEl = document.createElement('input');
        checkboxEl.type = 'checkbox';
        checkboxEl.className = 'file-checkbox';
        checkboxEl.checked = file.selected;
        checkboxEl.disabled = file.disabled || false;
        checkboxEl.addEventListener('change', () => {
            file.selected = checkboxEl.checked;
            this.updateCounts();
        });

        const infoEl = document.createElement('div');
        infoEl.className = 'file-info'; const titleEl = document.createElement('div');
        titleEl.className = 'file-title';
        titleEl.textContent = file.title;

        const urlEl = document.createElement('div');
        urlEl.className = 'file-url';
        urlEl.textContent = file.url;

        // Add file size info if available
        if (file.size !== undefined) {
            const sizeEl = document.createElement('div');
            sizeEl.className = 'file-size';
            const sizeInMB = file.size / (1024 * 1024);
            if (sizeInMB >= 1) {
                sizeEl.textContent = `${Math.round(sizeInMB)}MB`;
            } else {
                sizeEl.textContent = `${Math.round(file.size / 1024)}KB`;
            }

            if (file.disabled) {
                sizeEl.textContent += ' (too large)';
                sizeEl.className += ' too-large';
            }

            infoEl.appendChild(sizeEl);
        }

        infoEl.appendChild(titleEl);
        infoEl.appendChild(urlEl);

        itemEl.appendChild(checkboxEl);
        itemEl.appendChild(infoEl);

        return itemEl;
    }    /**
     * Update file counts display
     */
    private updateCounts(): void {
        const selectedCount = this.files.filter(f => f.selected).length;
        const enabledCount = this.files.filter(f => !f.disabled).length;
        this.selectedCountEl.textContent = selectedCount.toString();
        this.totalCountEl.textContent = enabledCount.toString();

        // Enable/disable download button
        this.downloadBtnEl.disabled = selectedCount === 0;
    }

    /**
     * Select all enabled files
     */
    private selectAll(): void {
        this.files.forEach(file => {
            if (!file.disabled) {
                file.selected = true;
            }
        });
        this.renderFiles();
    }    /**
     * Deselect all files
     */
    private selectNone(): void {
        this.files.forEach(file => {
            if (!file.disabled) {
                file.selected = false;
            }
        });
        this.renderFiles();
    }

    /**
     * Handle download button click
     */
    private async handleDownload(): Promise<void> {
        const selectedFiles = this.files.filter(f => f.selected);

        if (selectedFiles.length === 0) {
            return;
        }

        try {
            // Update UI to show downloading state
            this.downloadBtnEl.disabled = true;
            this.downloadBtnEl.className = 'download-btn downloading';
            this.downloadTextEl.textContent = 'Creating ZIP...';

            Logger.info(`Starting download of ${selectedFiles.length} files`);

            // Convert to downloadable files format
            const downloadableFiles = selectedFiles.map(file => ({
                url: file.url,
                title: file.title,
                folder: file.folder,
                filename: this.generateFilename(file)
            }));            // Send download request to background
            const message: DownloadZipMessage = {
                type: 'DOWNLOAD_ZIP',
                files: downloadableFiles,
                layout: this.layout
            };

            if (this.courseName) {
                message.courseName = this.courseName;
            }

            await chrome.runtime.sendMessage(message);

            // Update UI to show completion
            this.downloadTextEl.textContent = 'ZIP Downloaded!';

            // Reset button after delay
            setTimeout(() => {
                this.downloadBtnEl.disabled = false;
                this.downloadBtnEl.className = 'download-btn';
                this.downloadTextEl.textContent = 'Download as ZIP';
            }, 2000);

        } catch (error) {
            Logger.error('Error during download:', error);
            this.downloadBtnEl.disabled = false;
            this.downloadBtnEl.className = 'download-btn';
            this.downloadTextEl.textContent = 'Download Failed - Try Again';

            setTimeout(() => {
                this.downloadTextEl.textContent = 'Download as ZIP';
            }, 3000);
        }
    }    /**
     * Generate filename for a file
     */
    private generateFilename(file: DiscoveredFile): string {
        // Use the original filename from instancename (already processed in utils.ts)
        let filename = file.originalFilename || file.title;

        // Don't add extension here - let the background script handle it based on actual content
        // The background script will determine the proper extension from content-type headers

        return filename;
    }

    /**
     * Show error message
     */
    private showError(message: string): void {
        this.hideAll();
        this.errorMessageEl.textContent = message;
        this.errorEl.style.display = 'block';
    }

    /**
     * Show no files message
     */
    private showNoFiles(): void {
        this.hideAll();
        this.noFilesEl.style.display = 'block';
    }

    /**
     * Hide all main content areas
     */
    private hideAll(): void {
        this.loadingEl.style.display = 'none';
        this.errorEl.style.display = 'none';
        this.contentEl.style.display = 'none';
        this.noFilesEl.style.display = 'none';
    }    /**
     * Handle messages from background script
     */
    private handleBackgroundMessage(message: DownloadCompleteMessage): void {
        if (message.type === 'DOWNLOAD_COMPLETE') {
            this.handleDownloadComplete(message);
        }
    }    /**
     * Handle download completion message from background
     */
    private handleDownloadComplete(message: DownloadCompleteMessage): void {
        Logger.info('Download complete:', message);

        // Reset download button
        this.downloadBtnEl.disabled = false;
        this.downloadBtnEl.className = 'download-btn';

        if (message.success) {
            if (message.zipTooBig) {
                this.downloadTextEl.textContent = `Files Downloaded Individually! (${message.downloadedCount}/${message.totalCount} files)`;
            } else {
                this.downloadTextEl.textContent = `ZIP Downloaded! (${message.downloadedCount}/${message.totalCount} files)`;
            }

            // Show errors if any
            if (message.errors && message.errors.length > 0) {
                this.showDownloadErrors(message.errors, message.downloadedCount, message.totalCount, message.zipTooBig);
            }
        } else {
            this.downloadTextEl.textContent = 'Download Failed - Try Again';
            this.showDownloadErrors(message.errors || ['Unknown error occurred'], 0, message.totalCount, message.zipTooBig);
        }

        // Reset button text after delay
        setTimeout(() => {
            this.downloadTextEl.textContent = 'Download as ZIP';
        }, 5000);
    }    /**
     * Show download errors in the UI
     */
    private showDownloadErrors(errors: string[], downloadedCount: number, _totalCount: number, zipTooBig?: boolean): void {
        // Create or update error display area
        let errorDisplayEl = document.getElementById('download-errors');
        if (!errorDisplayEl) {
            errorDisplayEl = document.createElement('div');
            errorDisplayEl.id = 'download-errors';
            errorDisplayEl.className = 'download-errors';

            // Insert after the download button
            const downloadContainer = this.downloadBtnEl.parentElement;
            if (downloadContainer) {
                downloadContainer.appendChild(errorDisplayEl);
            }
        }

        const successCount = downloadedCount;
        const errorCount = errors.length;

        let html = `<div class="error-summary">`;

        if (zipTooBig) {
            html += `<div class="info-message">ℹ️ ZIP was too large to create. Files were downloaded individually instead.</div>`;
        }

        if (successCount > 0) {
            html += `<div class="success-info">✅ Successfully downloaded: ${successCount} files</div>`;
        }
        if (errorCount > 0) {
            html += `<div class="error-info">❌ Errors occurred: ${errorCount} files</div>`;
            html += `<details class="error-details"><summary>View error details</summary><ul>`;
            errors.forEach(error => {
                html += `<li>${error}</li>`;
            });
            html += `</ul></details>`;
        }
        html += `</div>`;

        errorDisplayEl.innerHTML = html;
        errorDisplayEl.style.display = 'block';

        // Hide errors after 10 seconds unless user expands details
        setTimeout(() => {
            const details = errorDisplayEl!.querySelector('details') as HTMLDetailsElement;
            if (!details || !details.open) {
                errorDisplayEl!.style.display = 'none';
            }
        }, 10000);
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new MoodlePopup();
});
