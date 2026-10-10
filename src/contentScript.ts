import { DOMUtils, URLUtils, Logger } from './utils';
import { ActivityLink, ExtensionMessage, ScanMessage, ScanResultMessage, DiscoveredFile, TileSection } from './types';
import { CONFIG } from './config';

/**
 * Content script for Moodle Downloader Chrome Extension
 * Scans the page for downloadable content when requested by popup
 */
class MoodleContentScript {
  private scanNonce: string | undefined;

  constructor() {
    this.init();
  }

  /**
   * Initialize the content script
   */
  private init(): void {
    Logger.info('Content script initialized');
    // Listen for messages from popup
    (globalThis as any).chrome.runtime.onMessage.addListener(
      (message: ExtensionMessage, _sender: any, sendResponse: any) => {
        this.handleMessage(message, sendResponse);
        return true; // Indicates async response
      }
    );
  }

  /**
   * Handle messages from popup
   */
  private async handleMessage(
    message: ExtensionMessage,
    sendResponse: (response?: any) => void
  ): Promise<void> {
    try {
      switch (message.type) {
        case 'SCAN_PAGE':
          this.scanNonce = (message as ScanMessage).nonce;
          const result = await this.scanPage();
          sendResponse(result);
          // Broadcast too — background persists it so a reopened popup restores.
          chrome.runtime.sendMessage(result).catch(() => { /* popup closed */ });
          break;

        default:
          Logger.warn('Unknown message type:', message);
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      Logger.error('Error handling message:', error); sendResponse({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }  /**
   * Send progress update to popup via background script
   */
  private sendProgress(foundCount: number): void {
    chrome.runtime.sendMessage({
      type: 'SCAN_PROGRESS',
      foundCount: foundCount,
      pageUrl: location.href,
      nonce: this.scanNonce
    }).catch(() => { /* popup closed */ });
  }
  private addFile(files: DiscoveredFile[], activity: ActivityLink, folderName?: string): void {
    if (!URLUtils.isValidMoodleURL(activity.url)) return;
    files.push(this.createDiscoveredFile(activity, folderName));
    this.sendProgress(files.length);
  }

  /**
   * Scan the current page for downloadable content
   */
  private async scanPage(): Promise<ScanResultMessage> {
    const files: DiscoveredFile[] = [];
    let layout: 'standard' | 'tiles' = 'standard';

    try {
      if (!URLUtils.isMoodleCoursePage()) return this.taggedResult({ type: 'SCAN_RESULT', files, layout });

      if (DOMUtils.isTilesLayout()) {
        layout = 'tiles';
        // First strategy that yields files wins — the rest are fallbacks.
        const strategies: Array<() => TileSection[] | Promise<TileSection[]>> = [
          () => DOMUtils.findTileSections(),
          () => DOMUtils.loadTileSectionsContent(),
          () => [{ title: 'Other Files', activities: DOMUtils.findAllActivityLinks() }],
          () => [{ title: 'Other Files', activities: DOMUtils.findFilesInTilesContainer() }],
          () => [{ title: 'Other Files', activities: DOMUtils.findLoadedSectionContent() }],
        ];

        for (const run of strategies) {
          for (const section of await run()) {
            for (const activity of section.activities) {
              this.addFile(files, activity, section.title === 'Other Files' ? activity.folder : section.title);
            }
          }
          if (files.length > 0) break;
        }
      } else {
        for (const activity of DOMUtils.findStandardActivityLinks()) {
          this.addFile(files, activity, activity.folder);
        }
      }

      await this.checkFileSizes(files);
      await this.addNotesFiles(files);
      const courseName = this.extractCourseName();

      const result = this.taggedResult({ type: 'SCAN_RESULT', files, layout });
      if (courseName) result.courseName = courseName;
      return result;

    } catch (error) {
      Logger.error('Error scanning page:', error);
      return this.taggedResult({
        type: 'SCAN_RESULT',
        files: [],
        layout: layout
      });
    }
  }

  private taggedResult(result: ScanResultMessage): ScanResultMessage {
    result.pageUrl = location.href;
    if (this.scanNonce) result.nonce = this.scanNonce;
    return result;
  }

  /**
   * One generated notes.md per folder: tab text plus an index of the
   * folder's files, hashed so edits surface as new. The sha covers
   * the body only — header metadata stays out of the hash.
   */
  private async addNotesFiles(files: DiscoveredFile[]): Promise<void> {
    const notesByFolder = DOMUtils.extractNotesByFolder();
    Logger.info(`Notes: text found in ${notesByFolder.size} folder(s)`);

    const filesByFolder = new Map<string, DiscoveredFile[]>();
    files.forEach(f => {
      const key = f.folder || 'Other Files';
      if (!filesByFolder.has(key)) filesByFolder.set(key, []);
      filesByFolder.get(key)!.push(f);
    });

    for (const folder of new Set([...notesByFolder.keys(), ...filesByFolder.keys()])) {
      const links = (filesByFolder.get(folder) || [])
        .map(f => `- [${f.title}](${f.url})`).join('\n');
      const note = notesByFolder.get(folder);
      const body = [note?.markdown || '', links ? `## Files\n\n${links}` : '']
        .filter(Boolean).join('\n\n');
      if (body.replace(/\s+/g, ' ').trim().length < 20) continue;

      const sha = await this.sha256Hex(body);
      const name = folder.split('/').pop() || folder;
      const content = `# ${name}\n\n> source: ${location.href}\n\n${body}\n`;
      files.push({
        id: `notes-${sha.slice(0, 16)}`,
        url: `notes:${location.href}#${folder}`,
        title: 'notes.md',
        folder: this.fixTextEncoding(folder),
        originalFilename: 'notes.md',
        generatedContent: content,
        images: note?.images || [],
        sha,
        selected: true,
        size: new TextEncoder().encode(content).length,
        disabled: false,
      });
      this.sendProgress(files.length);
    }
  }

  private async sha256Hex(text: string): Promise<string> {
    try {
      const subtle = (globalThis as any).crypto?.subtle;
      if (subtle) {
        const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
        return Array.from(new Uint8Array(digest)).map(b => (b as number).toString(16).padStart(2, '0')).join('');
      }
    } catch { /* fall through to FNV-1a */ }
    // ponytail: non-secure contexts lack crypto.subtle; FNV-1a still detects changes
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return `fnv1a-${h.toString(16).padStart(8, '0')}`;
  }  /**
   * Create a DiscoveredFile from an ActivityLink
   */
  private createDiscoveredFile(activity: ActivityLink, folderName?: string): DiscoveredFile {
    return {
      id: this.generateFileId(activity.url),
      url: activity.url,
      title: this.fixTextEncoding(activity.title),
      folder: folderName ? this.fixTextEncoding(folderName) : folderName,
      originalFilename: activity.originalFilename,
      selected: true,
      size: undefined,
      disabled: false
    };
  }

  /**
   * Generate a unique ID for a file
   */
  private generateFileId(url: string): string {
    return btoa(url).replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }
  /**
   * Check file sizes and mark large files as disabled
   */
  private async checkFileSizes(files: DiscoveredFile[]): Promise<void> {
    const BATCH_SIZE = 3;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (file) => {
          if (file.url.startsWith('notes:')) return; // Generated locally, size already known
          try {
            const downloadUrl = URLUtils.ensureRedirectParameter(file.url);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(downloadUrl, {
              method: 'HEAD',
              signal: controller.signal,
              redirect: 'follow',
            });
            clearTimeout(timeoutId);

            if (response.ok) {
              const contentLength = response.headers.get('content-length');
              if (contentLength) {
                file.size = parseInt(contentLength);

                if (file.size > CONFIG.maxFileSize) {
                  file.disabled = true;
                  file.selected = false;
                }
              }
            }
          } catch {
            // Leave enabled when the size can't be checked
          }
        })
      );
    }
  }
  /**
   * Extract course name from the DOM and sanitize it for use in filename
   */
  private extractCourseName(): string | undefined {
    try {
      const selectors = [
        'div.mr-auto > div > div',
        '.mr-auto .course-title',
        '.mr-auto h1',
        '.mr-auto [data-region="course-name"]',
        'h1.h2',
        '.course-title',
        '.breadcrumb-item.active',
        '[data-region="course-name"]',
        'h1'
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element?.textContent) {
          const courseName = this.fixTextEncoding(element.textContent.trim());
          if (courseName && courseName !== 'Dashboard' && courseName !== 'Home') {
            return this.sanitizeCourseName(courseName);
          }
        }
      }

      return undefined;
    } catch {
      return undefined;
    }
  }
  /**
   * Sanitize course name for safe use in filenames
   */
  private sanitizeCourseName(courseName: string): string {
    // Remove or replace invalid filename characters
    let sanitized = courseName
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid chars with underscore
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .trim(); // Remove leading/trailing spaces

    // Truncate to safe length (50 characters)
    if (sanitized.length > 50) {
      sanitized = sanitized.substring(0, 50).replace(/\s+$/, '').trim();
    }

    return sanitized || 'moodle course';
  }
  /**
   * Fix double-encoded UTF-8 characters commonly found in Moodle
   * @param text Text that may contain encoding issues
   * @returns Text with corrected encoding
   */
  private fixTextEncoding(text: string): string {
    try {
      // Common double-encoded UTF-8 patterns in Moodle
      const fixes: Array<[string, string]> = [
        ['Ã©', 'é'], // é
        ['Ã¨', 'è'], // è
        ['Ã¡', 'á'], // á
        ['Ã ', 'à'], // à
        ['Ã¢', 'â'], // â
        ['Ã¤', 'ä'], // ä
        ['Ã£', 'ã'], // ã
        ['Ã¥', 'å'], // å
        ['Ã§', 'ç'], // ç
        ['Ã¯', 'ï'], // ï
        ['Ã®', 'î'], // î
        ['Ã¬', 'ì'], // ì
        ['Ã­', 'í'], // í
        ['Ã´', 'ô'], // ô
        ['Ã¶', 'ö'], // ö
        ['Ã²', 'ò'], // ò
        ['Ã³', 'ó'], // ó
        ['Ã¹', 'ù'], // ù
        ['Ã»', 'û'], // û
        ['Ã¼', 'ü'], // ü
        ['Ãº', 'ú'], // ú
        ['Ã±', 'ñ'], // ñ
        ['Â«', '«'], // «
        ['Â»', '»'], // »
        ['Â°', '°'], // °
        ['Â£', '£'], // £
        ['Â€', '€'], // €
        ['Â¡', '¡'], // ¡
        ['Â¿', '¿'], // ¿
        // Capital letters
        ['Ã‰', 'É'], // É
        ['Ã€', 'À'], // À
        ['Ã‚', 'Â'], // Â
        ['Ãƒ', 'Ã'], // Ã
        ['Ã„', 'Ä'], // Ä
        ['Ã…', 'Å'], // Å
        ['Ã‡', 'Ç'], // Ç
        ['ÃŠ', 'Ê'], // Ê
        ['Ã‹', 'Ë'], // Ë
        ['ÃŒ', 'Ì'], // Ì
        ['ÃŽ', 'Î'], // Î
        ['Ã–', 'Ö'], // Ö
        ['Ã™', 'Ù'], // Ù
        ['Ãš', 'Ú'], // Ú
        ['Ã›', 'Û'], // Û
        ['Ãœ', 'Ü']  // Ü
      ];

      let fixedText = text;
      for (const [encoded, decoded] of fixes) {
        fixedText = fixedText.replace(new RegExp(encoded, 'g'), decoded);
      }

      return fixedText;
    } catch {
      return text; // Return original text if fixing fails
    }
  }
}

// Initialize content script when page loads
new MoodleContentScript();
