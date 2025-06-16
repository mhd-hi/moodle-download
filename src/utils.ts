import { ActivityLink, TileSection } from './types';

/**
 * Utility functions for DOM manipulation and URL processing
 */
export class DOMUtils {  /**
   * Find all activity links in the standard Moodle layout
   * @returns Array of activity links found in .activityname containers
   */
  static findStandardActivityLinks(): ActivityLink[] {
    const activityContainers = document.querySelectorAll<HTMLElement>('.activityname');
    const activities: ActivityLink[] = [];

    activityContainers.forEach(container => {
      const link = container.querySelector<HTMLAnchorElement>('a[href]');
      if (link && link.href) {
        const cleanTitle = this.extractCleanTitle(link);
        const filename = this.extractPreferredFilename(link);
        activities.push({
          url: link.href,
          title: cleanTitle || 'Unknown Activity',
          originalFilename: filename
        });
      }
    });

    return activities;
  }  /**
   * Find all tile sections in the tiles layout
   * @returns Array of tile sections with their activities
   */
  static findTileSections(): TileSection[] {
    const tilesContainer = document.querySelector<HTMLElement>('ul.tiles#multi_section_tiles');
    if (!tilesContainer) {
      console.log('No tiles container found');
      return [];
    }

    console.log('Found tiles container:', tilesContainer);

    const tiles = tilesContainer.querySelectorAll<HTMLElement>('li.tile:not(.spacer)');
    console.log('Found tiles:', tiles.length);

    const sections: TileSection[] = [];

    tiles.forEach((tile, index) => {
      const titleElement = tile.querySelector<HTMLElement>('h3');
      const title = titleElement?.textContent?.trim() || 'Unknown Section';
      console.log(`Tile ${index}: "${title}"`);

      // Get the section number from the tile's data-section attribute
      const sectionNumber = tile.getAttribute('data-section');
      console.log(`Tile ${index} section number:`, sectionNumber);

      const activities: ActivityLink[] = [];

      if (sectionNumber) {
        // First, try to find activities in the corresponding section element
        const sectionElement = document.querySelector<HTMLElement>(`#section-${sectionNumber}`);
        console.log(`Looking for section element: #section-${sectionNumber}`);
        console.log('Found section element:', sectionElement);

        if (sectionElement) {
          const sectionActivities = this.findActivitiesInSection(sectionElement);
          console.log(`Section ${sectionNumber} activities:`, sectionActivities.length);
          activities.push(...sectionActivities);
        }        // If no activities found in section, try to load the section content dynamically
        if (activities.length === 0) {
          console.log(`No activities found in section ${sectionNumber}, checking if tile can be expanded...`);

          // Don't add the tile link itself as a downloadable file
          // Instead, log that this section needs dynamic loading
          console.log(`Section "${title}" appears to have no downloadable files, or content needs to be loaded dynamically`);

          // We could implement dynamic loading here in the future
          // For now, we'll skip empty sections rather than treating them as HTML downloads
        }
      }

      // Always add the section if we have a title, even if no activities
      // This ensures all tiles are visible to the user
      if (activities.length > 0) {
        sections.push({ title, activities });
      }
    });

    console.log('Total sections with activities:', sections.length);
    return sections;
  }  /**
   * Find activities within a specific section element (used for tiles layout)
   * @param section The section DOM element to search within
   * @returns Array of activity links found in the section
   */
  private static findActivitiesInSection(section: HTMLElement): ActivityLink[] {
    console.log('Searching in section:', section);
    console.log('Section innerHTML:', section.innerHTML);

    // Look for actual downloadable content using more specific selectors
    const activitySelectors = [
      '.activityname a[href]',           // Standard activity links
      '.activity-name-area a[href]',     // Alternative activity links
      '.activity a[href]',               // General activity links
      'a[href*="mod/resource"]',         // Resource module links
      'a[href*="mod/folder"]',           // Folder module links
      'a[href*="pluginfile.php"]',       // Direct file links
      'a[href*="/file.php"]',            // File.php links
      '.format-tiles-cm-list a[href]'    // Activity links in tile content lists
    ];

    const activities: ActivityLink[] = [];
    const foundUrls = new Set<string>(); // Prevent duplicates

    activitySelectors.forEach(selector => {
      const links = section.querySelectorAll<HTMLAnchorElement>(selector);
      console.log(`Found ${links.length} links for selector: ${selector}`);

      links.forEach((link) => {
        if (link.href && !foundUrls.has(link.href)) {
          // Only include if it's a valid Moodle download URL (not HTML pages)
          if (URLUtils.isValidMoodleURL(link.href)) {
            console.log(`Valid downloadable link ${activities.length}:`, link.href, link.textContent?.trim());
            foundUrls.add(link.href);

            const cleanTitle = this.extractCleanTitle(link);
            const filename = this.extractPreferredFilename(link);
            activities.push({
              url: link.href,
              title: cleanTitle || 'Unknown Activity',
              originalFilename: filename
            });
          } else {
            console.log(`Skipping non-downloadable URL:`, link.href);
          }
        }
      });
    });

    console.log(`Total valid downloadable activities found: ${activities.length}`);
    return activities;
  }/**
   * Check if the page uses the tiles layout
   * @returns True if tiles layout is detected
   */
  static isTilesLayout(): boolean {
    return document.querySelector('ul.tiles#multi_section_tiles') !== null;
  }
  /**
   * Extract clean title from activity link, removing accessibility text
   * @param link The activity link element
   * @returns Clean title without accessibility text
   */
  private static extractCleanTitle(link: HTMLAnchorElement): string | undefined {
    // Look for instancename span within the link
    const instanceNameSpan = link.querySelector<HTMLSpanElement>('.instancename');

    if (instanceNameSpan) {
      // Clone the element to avoid modifying the original DOM
      const clonedSpan = instanceNameSpan.cloneNode(true) as HTMLSpanElement;

      // Remove all accessibility text elements
      const accessHideElements = clonedSpan.querySelectorAll('.accesshide');
      accessHideElements.forEach(element => element.remove());

      // Get the remaining text content
      let cleanTitle = clonedSpan.textContent?.trim() || '';

      // If we have a meaningful title, use it
      if (cleanTitle && cleanTitle.length > 0) {
        // Check if this is a folder and add ZIP indicator
        if (URLUtils.isMoodleFolder(link.href)) {
          cleanTitle += ' (ZIP)';
        }
        return cleanTitle;
      }
    }

    // Fallback to full link text
    let fallbackTitle = link.textContent?.trim();
    if (fallbackTitle && URLUtils.isMoodleFolder(link.href)) {
      fallbackTitle += ' (ZIP)';
    }
    return fallbackTitle;
  }
  /**
   * Extract preferred filename from activity link, using instancename if available
   * @param link The activity link element
   * @returns Preferred filename or fallback to URL-based extraction
   */
  private static extractPreferredFilename(link: HTMLAnchorElement): string | undefined {
    // Look for instancename span within the link
    const instanceNameSpan = link.querySelector<HTMLSpanElement>('.instancename');

    if (instanceNameSpan) {
      // Clone the element to avoid modifying the original DOM
      const clonedSpan = instanceNameSpan.cloneNode(true) as HTMLSpanElement;

      // Remove all accessibility text elements
      const accessHideElements = clonedSpan.querySelectorAll('.accesshide');
      accessHideElements.forEach(element => element.remove());

      // Get the remaining text content
      let instanceName = clonedSpan.textContent?.trim() || '';      // If we have a meaningful instance name, use it
      if (instanceName && instanceName.length > 0) {
        // Sanitize the filename by removing invalid characters
        instanceName = instanceName.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();

        // Add .zip extension for folders
        if (URLUtils.isMoodleFolder(link.href)) {
          instanceName += '.zip';
        }

        return instanceName;
      }
    }

    // Fallback to URL-based extraction
    return this.extractFilenameFromURL(link.href);
  }
  /**
   * Extract filename from a URL, handling Moodle's specific URL patterns
   * @param url The URL to extract filename from
   * @returns Extracted filename or null if not found
   */
  private static extractFilenameFromURL(url: string): string | undefined {
    try {
      const urlObj = new URL(url);

      // Check if this is a folder URL
      if (URLUtils.isMoodleFolder(url)) {
        // For folders, return a generic folder name with .zip extension
        const id = urlObj.searchParams.get('id');
        return id ? `folder_${id}.zip` : 'folder.zip';
      }

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
  /**
   * Find all activity links throughout the page (fallback method)
   * @returns Array of all activity links found anywhere on the page
   */
  static findAllActivityLinks(): ActivityLink[] {
    const allLinks = document.querySelectorAll<HTMLAnchorElement>('a[href]');
    console.log('Total links found on page:', allLinks.length);

    const activities: ActivityLink[] = [];

    allLinks.forEach((link) => {
      if (link.href) {
        const isValid = URLUtils.isValidMoodleURL(link.href);
        if (isValid) {
          console.log(`Valid Moodle URL ${activities.length}:`, link.href, link.textContent?.trim());
          const cleanTitle = this.extractCleanTitle(link);
          const filename = this.extractPreferredFilename(link);
          activities.push({
            url: link.href,
            title: cleanTitle || link.textContent?.trim() || 'Unknown Activity',
            originalFilename: filename
          });
        }
      }
    });

    console.log('Total valid Moodle URLs found:', activities.length);
    return activities;
  }

  /**
   * Find downloadable files specifically within the tiles container
   * @returns Array of activity links found in the tiles container
   */
  static findFilesInTilesContainer(): ActivityLink[] {
    const tilesContainer = document.querySelector<HTMLElement>('ul.tiles#multi_section_tiles');
    if (!tilesContainer) {
      return [];
    }

    const allLinks = tilesContainer.querySelectorAll<HTMLAnchorElement>('a[href]');
    const activities: ActivityLink[] = [];

    allLinks.forEach(link => {
      if (link.href && URLUtils.isValidMoodleURL(link.href)) {
        const cleanTitle = this.extractCleanTitle(link);
        const filename = this.extractPreferredFilename(link);
        activities.push({
          url: link.href,
          title: cleanTitle || link.textContent?.trim() || 'Unknown Activity',
          originalFilename: filename
        });
      }
    });

    return activities;
  }

  /**
   * Find any section content that might be loaded elsewhere in the DOM
   * @returns Array of activity links found in any section content
   */
  static findLoadedSectionContent(): ActivityLink[] {
    console.log('Looking for loaded section content...');

    // Look for any elements that might contain section content
    const sectionContentSelectors = [
      '.format_tiles_section_content',
      '.course-content',
      '.section-content',
      '[data-region="course-content"]',
      '.format-tiles-cm-list'
    ];

    const activities: ActivityLink[] = [];

    sectionContentSelectors.forEach(selector => {
      const containers = document.querySelectorAll<HTMLElement>(selector);
      console.log(`Found ${containers.length} containers for selector: ${selector}`);

      containers.forEach((container, index) => {
        console.log(`Checking container ${index} for ${selector}:`, container);

        const activityLinks = container.querySelectorAll<HTMLAnchorElement>('a[href]');
        console.log(`Found ${activityLinks.length} links in this container`);

        activityLinks.forEach(link => {
          if (link.href && URLUtils.isValidMoodleURL(link.href)) {
            console.log('Valid link found:', link.href, link.textContent?.trim());
            const cleanTitle = this.extractCleanTitle(link);
            const filename = this.extractPreferredFilename(link);
            activities.push({
              url: link.href,
              title: cleanTitle || link.textContent?.trim() || 'Unknown Activity',
              originalFilename: filename
            });
          }
        });
      });
    });

    console.log(`Total activities found in loaded section content: ${activities.length}`);
    return activities;
  }
  /**
   * Attempt to load content for empty tile sections by fetching their URLs
   * @returns Array of tile sections with their dynamically loaded activities
   */
  static async loadTileSectionsContent(): Promise<TileSection[]> {
    const tilesContainer = document.querySelector<HTMLElement>('ul.tiles#multi_section_tiles');
    if (!tilesContainer) {
      return [];
    }

    const tiles = Array.from(tilesContainer.querySelectorAll<HTMLElement>('li.tile:not(.spacer)'));
    const sections: TileSection[] = [];

    for (const tile of tiles) {
      const titleElement = tile.querySelector('h3') as HTMLElement;
      const title = titleElement?.textContent?.trim() || 'Unknown Section';
      const sectionNumber = tile.getAttribute('data-section');

      if (sectionNumber) {
        // First check if section element already has content
        const sectionElement = document.querySelector<HTMLElement>(`#section-${sectionNumber}`);
        let activities: ActivityLink[] = [];

        if (sectionElement && sectionElement.innerHTML.trim()) {
          activities = this.findActivitiesInSection(sectionElement);
        }

        // If no activities found, try to load the section dynamically
        if (activities.length === 0) {
          console.log(`Attempting to load content for section ${sectionNumber}...`);

          // Try clicking the tile to load content
          const tileLink = tile.querySelector('a.tile-link') as HTMLAnchorElement;
          if (tileLink) {
            try {
              // Simulate a click to potentially load content
              tileLink.click();

              // Wait a moment for content to load
              await new Promise(resolve => setTimeout(resolve, 500));

              // Check again for loaded content
              if (sectionElement) {
                activities = this.findActivitiesInSection(sectionElement);
                console.log(`After clicking tile, found ${activities.length} activities`);
              }
            } catch (error) {
              console.log(`Error clicking tile for section ${sectionNumber}:`, error);
            }
          }
        }

        if (activities.length > 0) {
          sections.push({ title, activities });
        }
      }
    }

    return sections;
  }
}

/**
 * Utility functions for URL manipulation
 */
export class URLUtils {
  /**
   * Convert folder URLs to downloadable ZIP format
   * @param url The original folder URL
   * @returns URL for downloading the folder as a ZIP file
   */
  static convertFolderToZipURL(url: string): string {
    try {
      const urlObj = new URL(url);

      // Check if this is a folder URL
      if (urlObj.pathname.includes('/mod/folder/')) {
        // Extract the id parameter
        const id = urlObj.searchParams.get('id');
        if (id) {
          // Construct the download URL
          const baseUrl = `${urlObj.protocol}//${urlObj.host}`;
          return `${baseUrl}/mod/folder/download_folder.php?id=${id}`;
        }
      }

      return url; // Return original URL if not a folder or no ID found
    } catch (error) {
      console.error('Error converting folder URL:', error);
      return url; // Return original URL if parsing fails
    }
  }

  /**
   * Add redirect parameter to Moodle URLs if not already present
   * Also converts folder URLs to downloadable ZIP format
   * @param url The original URL
   * @returns URL with &redirect=1 parameter added if needed, or converted to ZIP download for folders
   */  static ensureRedirectParameter(url: string): string {
    try {
      // First, check if this is a folder URL and convert it to ZIP download
      const folderZipUrl = this.convertFolderToZipURL(url);

      const urlObj = new URL(folderZipUrl);

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
      .replace(/\s+/g, ' ')
      .trim();

    if (folderName) {
      const sanitizedFolder = folderName
        .replace(/[<>:"/\\|?*]/g, '_')
        .replace(/\s+/g, ' ')
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
        '/mod/choicegroup/',
        '/mod/survey/',
        '/mod/feedback/',
        '/mod/chat/',
        '/mod/wiki/',
        '/mod/glossary/',
        '/mod/lesson/',
        '/mod/scorm/',
        '/mod/scheduler/',
        '/mod/url/',
        '/mod/assign/',
      ];

      if (excludedPatterns.some(pattern => pathname.includes(pattern))) {
        return false;
      }

      // Common Moodle resource patterns
      const moodlePatterns = [
        '/mod/resource/',
        '/mod/folder/',
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

  /**
   * Check if URL is a valid Moodle section URL (used for tiles)
   * @param url The URL to validate
   * @returns True if URL appears to be a valid Moodle course section
   */
  static isValidTileSectionURL(url: string): boolean {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname.toLowerCase();

      // Check if it's a course section view URL
      if (pathname.includes('/course/view.php') && urlObj.searchParams.has('section')) {
        return true;
      }

      // Otherwise, use the standard validation
      return this.isValidMoodleURL(url);
    } catch {
      return false;
    }
  }

  /**
   * Check if a URL is a Moodle folder
   * @param url The URL to check
   * @returns True if the URL is a Moodle folder
   */
  static isMoodleFolder(url: string): boolean {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname.includes('/mod/folder/');
    } catch {
      return false;
    }
  }

  /**
   * Get the appropriate file extension for a Moodle URL
   * @param url The URL to check
   * @returns The file extension (e.g., '.zip' for folders, or extracted from URL)
   */
  static getFileExtension(url: string): string {
    try {
      // Check if it's a folder first
      if (this.isMoodleFolder(url)) {
        return '.zip';
      }

      // For other URLs, try to extract extension from the URL
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const match = pathname.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);

      if (match) {
        return '.' + match[1];
      }

      // Default extension if none found
      return '';
    } catch {
      return '';
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
