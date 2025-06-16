import { ActivityLink, TileSection } from './types';

/**
 * Utility functions for DOM manipulation and URL processing
 */
export class DOMUtils {
  /**
   * Find all activity links in the standard Moodle layout
   * @returns Array of activity links found in .activityname containers
   */
  static findStandardActivityLinks(): ActivityLink[] {
    const activityContainers = document.querySelectorAll<HTMLElement>('.activityname');
    const activities: ActivityLink[] = [];

    activityContainers.forEach(container => {
      const link = container.querySelector<HTMLAnchorElement>('a[href]');
      if (link && link.href) {
        activities.push({
          url: link.href,
          title: link.textContent?.trim() || 'Unknown Activity',
          originalFilename: this.extractFilenameFromURL(link.href)
        });
      }
    });

    return activities;
  }

  /**
   * Find all tile sections in the tiles layout
   * @returns Array of tile sections with their activities
   */
  static findTileSections(): TileSection[] {
    const tilesContainer = document.querySelector<HTMLElement>('ul.tiles#multi_section_tiles');
    if (!tilesContainer) {
      return [];
    }

    const tiles = tilesContainer.querySelectorAll<HTMLElement>('li.tile');
    const sections: TileSection[] = [];

    tiles.forEach(tile => {
      const titleElement = tile.querySelector<HTMLElement>('h3');
      const title = titleElement?.textContent?.trim() || 'Unknown Section';

      // Find activities within this tile
      const activities = this.findActivitiesInTile(tile);

      if (activities.length > 0) {
        sections.push({ title, activities });
      }
    });

    return sections;
  }

  /**
   * Find activities within a specific tile element
   * @param tile The tile DOM element to search within
   * @returns Array of activity links found in the tile
   */
  private static findActivitiesInTile(tile: HTMLElement): ActivityLink[] {
    const activityLinks = tile.querySelectorAll<HTMLAnchorElement>('.activityname a[href]');
    const activities: ActivityLink[] = [];

    activityLinks.forEach(link => {
      if (link.href) {
        activities.push({
          url: link.href,
          title: link.textContent?.trim() || 'Unknown Activity',
          originalFilename: this.extractFilenameFromURL(link.href)
        });
      }
    });

    return activities;
  }

  /**
   * Check if the page uses the tiles layout
   * @returns True if tiles layout is detected
   */
  static isTilesLayout(): boolean {
    return document.querySelector('ul.tiles#multi_section_tiles') !== null;
  }

  /**
   * Extract filename from a URL, handling Moodle's specific URL patterns
   * @param url The URL to extract filename from
   * @returns Extracted filename or null if not found
   */
  private static extractFilenameFromURL(url: string): string | undefined {
    try {
      const urlObj = new URL(url);

      // Handle Moodle file URLs that might have filename in path
      const pathParts = urlObj.pathname.split('/');
      const lastPart = pathParts[pathParts.length - 1];

      // If last part has an extension, use it as filename
      if (lastPart && lastPart.includes('.')) {
        return decodeURIComponent(lastPart);
      }

      // Otherwise, try to generate a meaningful filename
      return undefined;
    } catch (error) {
      console.error('Error extracting filename from URL:', error);
      return undefined;
    }
  }
}

/**
 * Utility functions for URL manipulation
 */
export class URLUtils {
  /**
   * Add redirect parameter to Moodle URLs if not already present
   * @param url The original URL
   * @returns URL with &redirect=1 parameter added if needed
   */
  static ensureRedirectParameter(url: string): string {
    try {
      const urlObj = new URL(url);

      // Check if redirect parameter already exists
      if (!urlObj.searchParams.has('redirect')) {
        urlObj.searchParams.set('redirect', '1');
      }

      return urlObj.toString();
    } catch (error) {
      console.error('Error processing URL:', error);
      return url; // Return original URL if parsing fails
    }
  }

  /**
   * Generate a safe filename for downloads
   * @param originalName The original filename
   * @param folderName Optional folder name for organizing downloads
   * @returns Sanitized filename with optional folder prefix
   */
  static generateSafeFilename(originalName: string, folderName?: string): string {
    // Sanitize filename by removing/replacing invalid characters
    const sanitized = originalName
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .trim();

    if (folderName) {
      const sanitizedFolder = folderName
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, '_')
        .trim();

      return `${sanitizedFolder}/${sanitized}`;
    }

    return sanitized;
  }
  /**
   * Check if URL is a valid Moodle download URL
   * @param url The URL to validate
   * @returns True if URL appears to be a downloadable Moodle resource
   */  static isValidMoodleURL(url: string): boolean {
    try {
      const urlObj = new URL(url);

      // Check for common Moodle URL patterns
      const pathname = urlObj.pathname.toLowerCase();      // Exclude non-downloadable Moodle activities
      const excludedPatterns = [
        '/mod/forum/',
        '/forum/',
        '/mod/quiz/',
        '/mod/choice/',
        '/mod/survey/',
        '/mod/feedback/',
        '/mod/chat/',
        '/mod/wiki/',
        '/mod/glossary/',
        '/mod/lesson/',
        '/mod/scorm/',
        '/mod/scheduler/',
        '/mod/url/',

      ];

      if (excludedPatterns.some(pattern => pathname.includes(pattern))) {
        return false;
      }

      // Common Moodle resource patterns
      const moodlePatterns = [
        '/mod/resource/',
        '/mod/folder/',
        '/mod/assign/',
        '/pluginfile.php',
        '/webservice/pluginfile.php',
        '/file.php'
      ];

      // Check if URL contains any Moodle patterns
      const isMoodlePattern = moodlePatterns.some(pattern => pathname.includes(pattern));

      // Also check for direct file downloads (with file extensions)
      const hasFileExtension = /\.[a-zA-Z0-9]{2,5}(\?|$)/.test(pathname);

      return isMoodlePattern || hasFileExtension;
    } catch {
      return false;
    }
  }
}

/**
 * Utility functions for console logging with consistent formatting
 */
export class Logger {
  private static readonly PREFIX = '[Moodle Downloader]';

  static info(message: string, ...args: any[]): void {
    console.log(`${this.PREFIX} ${message}`, ...args);
  }

  static warn(message: string, ...args: any[]): void {
    console.warn(`${this.PREFIX} ${message}`, ...args);
  }

  static error(message: string, ...args: any[]): void {
    console.error(`${this.PREFIX} ${message}`, ...args);
  }
}
