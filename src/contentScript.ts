import { DOMUtils, URLUtils, Logger } from './utils';
import { ExtensionMessage, ScanResultMessage, DiscoveredFile } from './types';
import { CONFIG } from './config';

/**
 * Content script for Moodle Downloader Chrome Extension
 * Scans the page for downloadable content when requested by popup
 */
class MoodleContentScript {
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
          const result = await this.scanPage();
          sendResponse(result);
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
   * Scan the current page for downloadable content
   */
  private async scanPage(): Promise<ScanResultMessage> {
    Logger.info('Scanning page for downloadable content');

    const files: DiscoveredFile[] = [];
    let layout: 'standard' | 'tiles' = 'standard';

    try {
      if (DOMUtils.isTilesLayout()) {
        Logger.info('Detected tiles layout');
        layout = 'tiles';

        // First try the standard approach - looking in section elements
        const sections = DOMUtils.findTileSections();
        Logger.info(`Found ${sections.length} sections with activities from section elements`); sections.forEach(section => {
          Logger.info(`Section "${section.title}" has ${section.activities.length} activities`);
          section.activities.forEach(activity => {
            if (URLUtils.isValidMoodleURL(activity.url)) {
              const file = this.createDiscoveredFile(activity, section.title);
              files.push(file);
            }
          });
        });        // If no files found in sections, try alternative approaches
        if (files.length === 0) {
          Logger.info('No files found in section elements, trying dynamic loading...');

          // Try to load tile content dynamically
          const dynamicSections = await DOMUtils.loadTileSectionsContent();
          Logger.info(`Found ${dynamicSections.length} sections with dynamic content`);

          dynamicSections.forEach(section => {
            section.activities.forEach(activity => {
              if (URLUtils.isValidMoodleURL(activity.url)) {
                const file = this.createDiscoveredFile(activity, section.title);
                files.push(file);
              }
            });
          });

          // If still no files after dynamic loading, try fallback approaches
          if (files.length === 0) {
            Logger.info('No files found after dynamic loading, trying fallback approaches...');

            // Try looking for any downloadable links throughout the page
            const allActivities = DOMUtils.findAllActivityLinks();
            Logger.info(`Found ${allActivities.length} total activity links on page`);

            allActivities.forEach(activity => {
              if (URLUtils.isValidMoodleURL(activity.url)) {
                const file = this.createDiscoveredFile(activity);
                files.push(file);
              }
            });

            // If still no files, try scanning the entire tiles container
            if (files.length === 0) {
              Logger.info('Still no files found, scanning entire tiles container...');
              const tilesFiles = DOMUtils.findFilesInTilesContainer();
              Logger.info(`Found ${tilesFiles.length} files in tiles container`);

              tilesFiles.forEach(activity => {
                if (URLUtils.isValidMoodleURL(activity.url)) {
                  const file = this.createDiscoveredFile(activity);
                  files.push(file);
                }
              });
            }

            // Try one more approach - look for loaded section content anywhere
            if (files.length === 0) {
              Logger.info('Trying to find loaded section content anywhere in DOM...');
              const loadedContent = DOMUtils.findLoadedSectionContent();
              Logger.info(`Found ${loadedContent.length} files in loaded section content`);

              loadedContent.forEach(activity => {
                const file = this.createDiscoveredFile(activity);
                files.push(file);
              });
            }
          }
        }
      } else {
        Logger.info('Detected standard layout');
        layout = 'standard';
        const activities = DOMUtils.findStandardActivityLinks();

        activities.forEach(activity => {
          if (URLUtils.isValidMoodleURL(activity.url)) {
            const file = this.createDiscoveredFile(activity);
            files.push(file);
          }
        });
      } Logger.info(`Found ${files.length} downloadable files`);

      // Check file sizes and disable large files
      await this.checkFileSizes(files);// Extract course name
      const courseName = this.extractCourseName();

      const result: ScanResultMessage = {
        type: 'SCAN_RESULT',
        files: files,
        layout: layout
      };

      if (courseName) {
        result.courseName = courseName;
      }

      return result;

    } catch (error) {
      Logger.error('Error scanning page:', error);
      return {
        type: 'SCAN_RESULT',
        files: [],
        layout: layout
      };
    }
  }  /**
   * Create a DiscoveredFile from an ActivityLink
   */
  private createDiscoveredFile(activity: any, folderName?: string): DiscoveredFile {
    return {
      id: this.generateFileId(activity.url),
      url: activity.url,
      title: this.fixTextEncoding(activity.title),
      folder: folderName ? this.fixTextEncoding(folderName) : folderName,
      originalFilename: activity.originalFilename,
      selected: true,
      size: undefined, // Will be checked later
      disabled: false // Will be set if file is too large
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
    Logger.info(`Checking sizes for ${files.length} files`);

    // Check files in parallel but limit concurrent requests
    const BATCH_SIZE = 3;
    for (let i = 0; i < files.length; i += BATCH_SIZE) {
      const batch = files.slice(i, i + BATCH_SIZE);
      await Promise.allSettled(
        batch.map(async (file) => {
          try {
            const downloadUrl = URLUtils.ensureRedirectParameter(file.url);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

            const response = await fetch(downloadUrl, {
              method: 'HEAD',
              signal: controller.signal,
              redirect: 'follow',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
              }
            });
            clearTimeout(timeoutId);

            if (response.ok) {
              const contentLength = response.headers.get('content-length');
              if (contentLength) {
                const size = parseInt(contentLength);
                file.size = size;

                if (size > CONFIG.maxFileSize) {
                  file.disabled = true;
                  file.selected = false;
                  Logger.info(`File ${file.title} is too large (${Math.round(size / 1024 / 1024)}MB) - disabled`);
                } else {
                  Logger.info(`File ${file.title} size: ${Math.round(size / 1024)}KB`);
                }
              }
            }
          } catch (error) {
            Logger.warn(`Could not check size for ${file.title}:`, error);
            // If we can't check the size, leave it enabled
          }
        })
      );

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  /**
   * Extract course name from the DOM and sanitize it for use in filename
   */
  private extractCourseName(): string | undefined {
    try {
      // Try the specific selector first (note: this has a dynamic ID that might change)
      const specificSelector = '#yui_3_17_2_1_1750056718147_146 > div.mr-auto > div > div';
      const courseNameEl = document.querySelector(specificSelector); if (courseNameEl && courseNameEl.textContent) {
        const courseName = this.fixTextEncoding(courseNameEl.textContent.trim());
        if (courseName) {
          Logger.info(`Found course name using specific selector: "${courseName}"`);
          return this.sanitizeCourseName(courseName);
        }
      }

      // Try a more general version of the specific selector (without the dynamic ID)
      const generalSelectors = [
        '[id*="yui"] > div.mr-auto > div > div', // Similar structure without exact ID
        'div.mr-auto > div > div', // Even more general
        '.mr-auto .course-title',
        '.mr-auto h1',
        '.mr-auto [data-region="course-name"]'
      ];

      for (const selector of generalSelectors) {
        const element = document.querySelector(selector); if (element && element.textContent) {
          const courseName = this.fixTextEncoding(element.textContent.trim());
          if (courseName && courseName !== 'Dashboard' && courseName !== 'Home') {
            Logger.info(`Found course name using general selector "${selector}": "${courseName}"`);
            return this.sanitizeCourseName(courseName);
          }
        }
      }

      // Fallback selectors for course name
      const fallbackSelectors = [
        'h1.h2', // Common course title selector
        '.course-title',
        '.breadcrumb-item.active',
        '[data-region="course-name"]',
        'h1'
      ];

      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector); if (element && element.textContent) {
          const courseName = this.fixTextEncoding(element.textContent.trim());
          if (courseName && courseName !== 'Dashboard' && courseName !== 'Home') {
            Logger.info(`Found course name using fallback selector "${selector}": "${courseName}"`);
            return this.sanitizeCourseName(courseName);
          }
        }
      }

      Logger.info('Could not extract course name from DOM - will use default filename');
      return undefined;
    } catch (error) {
      Logger.warn('Error extracting course name:', error);
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
      .replace(/\s+/g, '_') // Replace spaces with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

    // Truncate to safe length (50 characters)
    if (sanitized.length > 50) {
      sanitized = sanitized.substring(0, 50).replace(/_+$/, '');
    }

    return sanitized || 'moodle_course';
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
    } catch (error) {
      Logger.warn('Error fixing text encoding:', error);
      return text; // Return original text if fixing fails
    }
  }
}

// Initialize content script when page loads
new MoodleContentScript();
