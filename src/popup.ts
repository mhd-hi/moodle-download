import { DiscoveredFile, ScanResultMessage, ScanProgressMessage, DownloadZipMessage, DownloadCompleteMessage, PersistedScan, PersistedDownload } from './types';
import { Logger } from './utils';

/**
 * Popup script for Moodle Downloader Chrome Extension
 * Handles the user interface for file selection and download initiation
 */
class MoodlePopup {
    private files: DiscoveredFile[] = [];
    private layout: 'standard' | 'tiles' = 'standard';
    private courseName: string | undefined;
    private pendingDownloadId: string | null = null;
    private pendingKeys: string[] = [];
    private downloadedUrls = new Set<string>();
    private remember = true;
    private tabUrl = '';
    private waitingForScan = false;
    private lastResultNonce: string | null = null;
    private static readonly HISTORY_KEY = 'md_downloaded_urls';
    private static readonly SETTING_KEY = 'md_remember_downloaded';
    private static readonly SCAN_KEY = 'md_scan';
    private static readonly DOWNLOAD_KEY = 'md_download';
    private static readonly DONE_TTL = 5 * 60 * 1000;
    private static readonly SCANNING_TTL = 60 * 1000;
    private static readonly DOWNLOAD_TTL = 2 * 60 * 1000;

    /** History key: plain URL, or url#sha for generated files so edits count as new. */
    private static historyKeyOf(file: { url: string; sha?: string | undefined }): string {
        return file.sha ? `${file.url}#${file.sha}` : file.url;
    }
    // DOM elements
    private loadingEl!: HTMLElement;
    private scanStartEl!: HTMLElement;
    private errorEl!: HTMLElement;
    private errorMessageEl!: HTMLElement;
    private contentEl!: HTMLElement;
    private noFilesEl!: HTMLElement;
    private selectedCountEl!: HTMLElement;
    private totalCountEl!: HTMLElement;
    private filesContainerEl!: HTMLElement;
    private downloadBtnEl!: HTMLButtonElement;
    private cancelBtnEl!: HTMLButtonElement;
    private downloadTextEl!: HTMLElement; private selectAllBtnEl!: HTMLButtonElement;
    private selectNoneBtnEl!: HTMLButtonElement;
    private forgetBtnEl!: HTMLButtonElement;
    private rememberToggleEl!: HTMLInputElement;
    private foundCountEl!: HTMLElement;
    private scanProgressEl!: HTMLElement;
    private scanPageBtnEl!: HTMLButtonElement;

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
        this.scanStartEl = document.getElementById('scan-start')!;
        this.errorEl = document.getElementById('error')!;
        this.errorMessageEl = document.getElementById('error-message')!;
        this.contentEl = document.getElementById('content')!;
        this.noFilesEl = document.getElementById('no-files')!;
        this.selectedCountEl = document.getElementById('selected-count')!;
        this.totalCountEl = document.getElementById('total-count')!;
        this.filesContainerEl = document.getElementById('files-container')!;
        this.downloadBtnEl = document.getElementById('download-btn') as HTMLButtonElement;
        this.cancelBtnEl = document.getElementById('cancel-btn') as HTMLButtonElement;
        this.downloadTextEl = document.getElementById('download-text')!;
        this.selectAllBtnEl = document.getElementById('select-all') as HTMLButtonElement;
        this.selectNoneBtnEl = document.getElementById('select-none') as HTMLButtonElement;
        this.forgetBtnEl = document.getElementById('forget-history') as HTMLButtonElement;
        this.rememberToggleEl = document.getElementById('remember-toggle') as HTMLInputElement;
        this.foundCountEl = document.getElementById('found-count')!;
        this.scanProgressEl = document.getElementById('scan-progress')!;
        this.scanPageBtnEl = document.getElementById('scan-page-btn') as HTMLButtonElement;

        // Set up event listeners
        this.setupEventListeners();

        // Listen for messages from background script
        chrome.runtime.onMessage.addListener((message: any) => {
            this.handleBackgroundMessage(message);
        });

        await this.restoreInitialState();
    }

    private async restoreInitialState(): Promise<void> {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab?.url || !/^https?:\/\//i.test(tab.url)) {
            this.showError('Please navigate to a Moodle course page first');
            return;
        }

        this.tabUrl = tab.url;
        await this.loadState();
        const got = await chrome.storage.local.get([MoodlePopup.SCAN_KEY, MoodlePopup.DOWNLOAD_KEY]);
        const storedScan = got[MoodlePopup.SCAN_KEY] as PersistedScan | undefined;

        if (storedScan?.pageUrl === tab.url && Date.now() - storedScan.at < MoodlePopup.DONE_TTL) {
            if (storedScan.status === 'scanning' && Date.now() - storedScan.at < MoodlePopup.SCANNING_TTL) {
                this.showWaiting(storedScan.foundCount);
                return;
            }
            if (storedScan.status === 'done') {
                await this.handleScanResult({
                    type: 'SCAN_RESULT', files: storedScan.files,
                    layout: storedScan.layout, courseName: storedScan.courseName,
                    pageUrl: storedScan.pageUrl
                });
                this.restoreDownloadUI(got[MoodlePopup.DOWNLOAD_KEY] as PersistedDownload | undefined);
                return;
            }
        }

        this.showScanStart();
    }

    private showScanStart(): void {
        this.hideAll();
        this.scanStartEl.style.display = 'flex';
    }

    /**
     * Set up event listeners for UI elements
     */
    private setupEventListeners(): void {
        this.downloadBtnEl.addEventListener('click', () => this.handleDownload());
        this.cancelBtnEl.addEventListener('click', () => this.handleCancel());
        this.scanPageBtnEl.addEventListener('click', () => this.scanCurrentTab());
        this.selectAllBtnEl.addEventListener('click', () => this.selectAll());
        this.selectNoneBtnEl.addEventListener('click', () => this.selectNone());
        this.forgetBtnEl.addEventListener('click', () => this.forgetHistory());
        this.rememberToggleEl.addEventListener('change', () => this.handleRememberToggle());
    }

    private async loadState(): Promise<void> {
        try {
            const got = await chrome.storage.local.get([MoodlePopup.HISTORY_KEY, MoodlePopup.SETTING_KEY]);
            const urls = got[MoodlePopup.HISTORY_KEY];
            this.downloadedUrls = new Set(Array.isArray(urls) ? urls : []);
            this.remember = got[MoodlePopup.SETTING_KEY] !== false;
        } catch {
            // ponytail: in-memory fallback, history just won't persist
        }
        if (this.rememberToggleEl) this.rememberToggleEl.checked = this.remember;
        this.updateForgetVisibility();
    }

    private async saveHistory(): Promise<void> {
        try {
            await chrome.storage.local.set({ [MoodlePopup.HISTORY_KEY]: [...this.downloadedUrls] });
        } catch { /* ignore */ }
        this.updateForgetVisibility();
    }

    private updateForgetVisibility(): void {
        if (this.forgetBtnEl) this.forgetBtnEl.style.display = this.downloadedUrls.size > 0 ? '' : 'none';
    }    /**
     * Scan the current tab for downloadable files
     */
    private async scanCurrentTab(): Promise<void> {
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs[0]) {
                this.showError('No active tab found');
                return;
            }

            const tab = tabs[0];

            // The content script is available on Moodle installations worldwide.
            if (!tab.url || !/^https?:\/\//i.test(tab.url)) {
                this.showError('Please navigate to a Moodle course page first');
                return;
            }
            this.tabUrl = tab.url;

            await this.loadState();
            const got = await chrome.storage.local.get([MoodlePopup.SCAN_KEY, MoodlePopup.DOWNLOAD_KEY]);
            const storedScan = got[MoodlePopup.SCAN_KEY] as PersistedScan | undefined;

            // A scan for this page already finished — show it instantly, then
            // refresh silently so the list stays current.
            if (storedScan?.pageUrl === tab.url && Date.now() - storedScan.at < MoodlePopup.DONE_TTL) {
                if (storedScan.status === 'scanning' && Date.now() - storedScan.at < MoodlePopup.SCANNING_TTL) {
                    this.showWaiting(storedScan.foundCount);
                    return; // Scan still running in the page — don't restart it.
                }
                if (storedScan.status === 'done') {
                    await this.handleScanResult({
                        type: 'SCAN_RESULT',
                        files: storedScan.files,
                        layout: storedScan.layout,
                        courseName: storedScan.courseName,
                        pageUrl: storedScan.pageUrl
                    });
                    this.restoreDownloadUI(got[MoodlePopup.DOWNLOAD_KEY] as PersistedDownload | undefined);
                    await this.requestFreshScan(tab.id!, true); // Silent refresh, keeps selection.
                    return;
                }
            }

            this.restoreDownloadUI(got[MoodlePopup.DOWNLOAD_KEY] as PersistedDownload | undefined);
            await this.requestFreshScan(tab.id!);
        } catch (error) {
            Logger.error('Error scanning tab:', error);
            this.showError('Failed to scan page. Make sure you\'re on a Moodle course page and try again.');
        }
    }

    private async requestFreshScan(tabId: number, preserveSelection = false): Promise<void> {
        const nonce = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this.waitingForScan = true;
        if (this.files.length === 0) {
            this.hideAll();
            this.loadingEl.style.display = 'flex';
            this.scanProgressEl.style.display = 'none';
        }

        try {
            const response = await this.sendScanRequest(tabId, nonce);

            if (response && response.type === 'SCAN_RESULT') {
                await this.handleScanResult(response as ScanResultMessage, { preserveSelection });
            } else if (this.files.length === 0) {
                this.waitingForScan = false;
                this.showError('Failed to scan page. Please refresh and try again.');
            } else {
                this.waitingForScan = false;
            }
        } catch (error) {
            Logger.error('Error scanning tab:', error);
            this.waitingForScan = false;
            if (this.files.length === 0) {
                this.showError('Failed to scan page. Please refresh the Moodle page and try again.');
            }
        }
    }

    /** Send SCAN_PAGE, injecting the content script first if the tab predates it. */
    private async sendScanRequest(tabId: number, nonce: string): Promise<any> {
        try {
            return await chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE', nonce });
        } catch {
            await chrome.scripting.executeScript({ target: { tabId }, files: ['contentScript.js'] });
            return await chrome.tabs.sendMessage(tabId, { type: 'SCAN_PAGE', nonce });
        }
    }

    /**
     * Handle scan result from content script
     */
    private async handleScanResult(result: ScanResultMessage, opts?: { preserveSelection?: boolean }): Promise<void> {
        if (result.nonce && result.nonce === this.lastResultNonce) return; // Duplicate delivery
        if (result.nonce) this.lastResultNonce = result.nonce;
        this.waitingForScan = false;

        const prevSelected = new Map(this.files.map(f => [MoodlePopup.historyKeyOf(f), f.selected]));
        this.files = result.files;
        this.layout = result.layout;
        this.courseName = result.courseName;

        await this.loadState();
        if (this.remember) {
            this.files.forEach(file => {
                if (this.downloadedUrls.has(MoodlePopup.historyKeyOf(file))) {
                    file.alreadyDownloaded = true;
                    if (!file.disabled) file.selected = false;
                }
            });
        }
        if (opts?.preserveSelection) {
            this.files.forEach(file => {
                const key = MoodlePopup.historyKeyOf(file);
                if (!file.disabled && prevSelected.has(key)) {
                    file.selected = prevSelected.get(key)!;
                }
            });
        }

        if (this.files.length === 0) {
            this.showNoFiles();
        } else {
            this.showFiles();
        }
    }

    /** Scan still running from before the popup closed — wait for it, don't restart. */
    private showWaiting(foundCount: number): void {
        this.waitingForScan = true;
        this.hideAll();
        this.loadingEl.style.display = 'flex';
        this.scanProgressEl.style.display = 'block';
        this.foundCountEl.textContent = foundCount.toString();
    }

    private restoreDownloadUI(dl: PersistedDownload | undefined): void {
        if (!dl || Date.now() - dl.at > MoodlePopup.DOWNLOAD_TTL) return;

        if (dl.status === 'downloading') {
            this.downloadBtnEl.disabled = true;
            this.downloadBtnEl.className = 'download-btn downloading';
            this.downloadTextEl.textContent = 'Creating ZIP...';
            this.cancelBtnEl.style.display = '';
        } else if (this.files.length > 0) {
            this.downloadTextEl.textContent = dl.success
                ? `ZIP Downloaded! (${dl.downloadedCount}/${dl.totalCount} files)`
                : 'Download Failed - Try Again';
            if (dl.errors.length > 0) {
                this.showDownloadErrors(dl.errors, dl.downloadedCount, dl.totalCount);
            }
        }
    }

    /**
     * Display files in the popup
     */
    private showFiles(): void {
        this.hideAll();
        this.contentEl.style.display = 'block';

        this.renderFiles();
    }
    /**
     * Render the files list
     */
    private renderFiles(): void {
        this.filesContainerEl.innerHTML = '';

        this.renderGroupedLayout();

        this.updateCounts();
    }

    private renderGroupedLayout(): void {
        const groups = new Map<string, DiscoveredFile[]>();

        // Group files by folder (tab) — flat grouping, nested paths stay as "Tab/Sub-tab"
        this.files.forEach(file => {
            const folder = file.folder || 'Other Files';
            if (!groups.has(folder)) {
                groups.set(folder, []);
            }
            groups.get(folder)!.push(file);
        });

        // Single ungrouped list: keep old flat rendering (no extra header)
        if (groups.size === 1 && groups.has('Other Files') && this.layout === 'standard') {
            this.renderStandardLayout();
            return;
        }

        // Render each tab group with its own select checkbox (collapsed by default)
        groups.forEach((files, folderName) => {
            const groupEl = document.createElement('div');
            groupEl.className = 'file-group collapsed';

            groupEl.appendChild(this.createFolderHeader(files, folderName, groupEl));

            const filesEl = document.createElement('div');
            filesEl.className = 'folder-files';
            files.forEach(file => {
                filesEl.appendChild(this.createFileItem(file, () => this.refreshFolderHeaders()));
            });
            groupEl.appendChild(filesEl);

            this.filesContainerEl.appendChild(groupEl);
        });

        this.refreshFolderHeaders();
    }

    private createFolderHeader(files: DiscoveredFile[], folderName: string, groupEl: HTMLElement): HTMLElement {
        const headerEl = document.createElement('div');
        headerEl.className = 'folder-header';
        headerEl.dataset['folder'] = folderName;

        const toggleEl = document.createElement('span');
        toggleEl.className = 'folder-toggle';
        toggleEl.textContent = '▸';

        const checkboxEl = document.createElement('input');
        checkboxEl.type = 'checkbox';
        checkboxEl.className = 'folder-checkbox';

        const enabled = files.filter(f => !f.disabled);
        checkboxEl.disabled = enabled.length === 0;
        checkboxEl.addEventListener('change', () => {
            enabled.forEach(f => { f.selected = checkboxEl.checked; });
            // Sync file checkboxes in this group without full re-render
            groupEl.querySelectorAll<HTMLInputElement>('.file-checkbox').forEach(cb => {
                if (!cb.disabled) cb.checked = checkboxEl.checked;
            });
            this.refreshFolderHeaders();
            this.updateCounts();
        });

        const labelEl = document.createElement('span');
        labelEl.className = 'folder-title';
        labelEl.textContent = `📁 ${folderName}`;

        const countEl = document.createElement('span');
        countEl.className = 'folder-count';

        headerEl.append(toggleEl, checkboxEl, labelEl, countEl);
        headerEl.addEventListener('click', (e) => {
            if ((e.target as HTMLElement) === checkboxEl) return;
            const collapsed = groupEl.classList.toggle('collapsed');
            toggleEl.textContent = collapsed ? '▸' : '▾';
        });

        return headerEl;
    }

    private refreshFolderHeaders(): void {
        const groups = new Map<string, DiscoveredFile[]>();
        this.files.forEach(file => {
            const folder = file.folder || 'Other Files';
            if (!groups.has(folder)) groups.set(folder, []);
            groups.get(folder)!.push(file);
        });

        this.filesContainerEl.querySelectorAll<HTMLElement>('.folder-header').forEach(header => {
            const folder = header.dataset['folder']!;
            const files = groups.get(folder) || [];
            const enabled = files.filter(f => !f.disabled);
            const selected = enabled.filter(f => f.selected).length;
            const checkbox = header.querySelector<HTMLInputElement>('.folder-checkbox')!;
            const count = header.querySelector<HTMLElement>('.folder-count')!;

            checkbox.checked = enabled.length > 0 && selected === enabled.length;
            checkbox.indeterminate = selected > 0 && selected < enabled.length;
            count.textContent = `${selected}/${enabled.length} selected`;
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
    private createFileItem(file: DiscoveredFile, onChange?: () => void): HTMLElement {
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
            onChange?.();
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
        if (file.alreadyDownloaded) {
            const doneEl = document.createElement('div');
            doneEl.className = 'file-downloaded';
            doneEl.textContent = '✓ already downloaded';
            infoEl.appendChild(doneEl);
        }
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
        this.setAllSelected(true);
    }

    private selectNone(): void {
        this.setAllSelected(false);
    }

    /** Bulk actions override the skip — turn it off so selection is explicit. */
    private async setRemember(on: boolean): Promise<void> {
        this.remember = on;
        if (this.rememberToggleEl) this.rememberToggleEl.checked = on;
        try {
            await chrome.storage.local.set({ [MoodlePopup.SETTING_KEY]: on });
        } catch { /* ignore */ }
    }

    private setAllSelected(selected: boolean): void {
        if (this.remember) this.setRemember(false);
        this.files.forEach(file => {
            if (!file.disabled) {
                file.selected = selected;
            }
        });
        this.renderFiles();
    }

    private async forgetHistory(): Promise<void> {
        if (this.downloadedUrls.size === 0) return;
        if (!confirm(`Forget ${this.downloadedUrls.size} remembered download(s)? All files will show as new again.`)) return;
        this.downloadedUrls.clear();
        await this.saveHistory();
        await this.setRemember(false);
        this.files.forEach(file => { file.alreadyDownloaded = false; });
        this.renderFiles();
    }

    private async handleRememberToggle(): Promise<void> {
        await this.setRemember(this.rememberToggleEl.checked);
        if (!this.remember) {
            this.files.forEach(file => {
                file.alreadyDownloaded = false;
                if (!file.disabled) file.selected = true;
            });
        } else {
            this.files.forEach(file => {
                if (this.downloadedUrls.has(MoodlePopup.historyKeyOf(file))) {
                    file.alreadyDownloaded = true;
                    if (!file.disabled) file.selected = false;
                }
            });
        }
        this.renderFiles();
    }

    /**
     * Handle download button click
     */
    private async handleDownload(): Promise<void> {
        const selectedFiles = this.files.filter(f => f.selected);

        if (selectedFiles.length === 0) {
            Logger.warn('No files selected for download');
            this.showError('Please select at least one file to download');
            return;
        }

        try {
            // Update UI to show downloading state
            this.downloadBtnEl.disabled = true;
            this.downloadBtnEl.className = 'download-btn downloading';
            this.downloadTextEl.textContent = 'Creating ZIP...';
            this.cancelBtnEl.style.display = '';

            Logger.info(`Starting download of ${selectedFiles.length} files`);

            this.pendingKeys = selectedFiles.map(MoodlePopup.historyKeyOf);
            this.pendingDownloadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

            // Convert to downloadable files format
            const downloadableFiles = selectedFiles.map(file => ({
                url: file.url,
                title: file.title,
                folder: file.folder,
                filename: file.originalFilename || file.title,
                generatedContent: file.generatedContent,
                images: file.images,
                historyKey: MoodlePopup.historyKeyOf(file)
            }));            // Send download request to background
            const message: DownloadZipMessage = {
                type: 'DOWNLOAD_ZIP',
                files: downloadableFiles,
                layout: this.layout,
                downloadId: this.pendingDownloadId
            };

            if (this.courseName) {
                message.courseName = this.courseName;
            }

            await chrome.runtime.sendMessage(message);

        } catch (error) {
            Logger.error('Error during download:', error);
            this.downloadBtnEl.disabled = false;
            this.downloadBtnEl.className = 'download-btn';
            this.cancelBtnEl.style.display = 'none';
            this.downloadTextEl.textContent = 'Download Failed - Try Again';

            setTimeout(() => {
                this.downloadTextEl.textContent = 'Download as ZIP';
            }, 3000);
        }
    }    /**
     * Handle scan progress message from content script
     */
    private handleScanProgress(message: ScanProgressMessage): void {
        // Show progress div when we get the first file
        if (message.foundCount > 0) {
            this.scanProgressEl.style.display = 'block';
            this.foundCountEl.textContent = message.foundCount.toString();
        }
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
        this.scanStartEl.style.display = 'none';
        this.errorEl.style.display = 'none';
        this.contentEl.style.display = 'none';
        this.noFilesEl.style.display = 'none';
    }    /**
     * Handle messages from background script
     */
    private handleBackgroundMessage(message: any): void {
        if (message.type === 'DOWNLOAD_COMPLETE') {
            this.handleDownloadComplete(message as DownloadCompleteMessage);
        } else if (message.type === 'SCAN_PROGRESS') {
            this.handleScanProgress(message as ScanProgressMessage);
        } else if (message.type === 'SCAN_RESULT' && this.waitingForScan && message.pageUrl === this.tabUrl) {
            // Scan that outlived the previous popup instance just finished.
            this.handleScanResult(message as ScanResultMessage, { preserveSelection: this.files.length > 0 });
        }
    }
    private async handleCancel(): Promise<void> {
        this.cancelBtnEl.style.display = 'none';
        this.downloadTextEl.textContent = 'Cancelling...';
        try {
            await chrome.runtime.sendMessage({ type: 'CANCEL_DOWNLOAD', downloadId: this.pendingDownloadId });
        } catch { /* background confirms via DOWNLOAD_COMPLETE */ }
    }
    /**
     * Handle download completion message from background
     */
    private async handleDownloadComplete(message: DownloadCompleteMessage): Promise<void> {
        // Ignore completions from an older run (e.g. a slow cancel confirmation).
        if (this.pendingDownloadId && message.downloadId && message.downloadId !== this.pendingDownloadId) return;
        this.pendingDownloadId = null;

        // Reset download button
        this.downloadBtnEl.disabled = false;
        this.downloadBtnEl.className = 'download-btn';
        this.cancelBtnEl.style.display = 'none';

        if (message.cancelled) {
            this.downloadTextEl.textContent = 'Download Cancelled';
        } else if (message.success && this.remember && this.pendingKeys.length > 0) {
            this.pendingKeys.forEach(key => this.downloadedUrls.add(key));
            await this.saveHistory();
            this.files.forEach(file => {
                if (this.downloadedUrls.has(MoodlePopup.historyKeyOf(file))) {
                    file.alreadyDownloaded = true;
                    if (!file.disabled) file.selected = false;
                }
            });
            this.renderFiles();
        }
        this.pendingKeys = [];

        if (!message.cancelled && message.success) {
            this.downloadTextEl.textContent = `ZIP Downloaded! (${message.downloadedCount}/${message.totalCount} files)`;

            // Show errors if any
            if (message.errors && message.errors.length > 0) {
                this.showDownloadErrors(message.errors, message.downloadedCount, message.totalCount);
            }
        } else if (!message.cancelled) {
            this.downloadTextEl.textContent = 'Download Failed - Try Again';
            this.showDownloadErrors(message.errors || ['Unknown error occurred'], 0, message.totalCount);
        }

        // Reset button text after delay
        setTimeout(() => {
            this.downloadTextEl.textContent = 'Download as ZIP';
        }, 5000);
    }    /**
     * Show download errors in the UI
     */
    private showDownloadErrors(errors: string[], downloadedCount: number, _totalCount: number): void {
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
