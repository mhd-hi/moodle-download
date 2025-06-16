import { ActivityLink, TileSection } from '../types';
import { URLUtils } from '../utils';

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
    }

    /**
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
            const tileName = titleElement?.textContent?.trim() || 'Unknown Section';
            console.log(`Tile ${index}: "${tileName}"`);            // Get the section number from the tile's data-section attribute
            const sectionNumber = tile.getAttribute('data-section');
            console.log(`Tile ${index} section number:`, sectionNumber);

            // Create folder name, avoiding duplicate numbering if tile name already has it
            const folderName = this.createTileFolderName(sectionNumber, tileName);
            console.log(`Tile ${index} folder name: "${folderName}"`);

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
                }

                // If no activities found in section, try to load the section content dynamically
                if (activities.length === 0) {
                    console.log(`No activities found in section ${sectionNumber}, checking if tile can be expanded...`);

                    // Don't add the tile link itself as a downloadable file
                    // Instead, log that this section needs dynamic loading
                    console.log(`Section "${folderName}" appears to have no downloadable files, or content needs to be loaded dynamically`);

                    // We could implement dynamic loading here in the future
                    // For now, we'll skip empty sections rather than treating them as HTML downloads
                }
            }

            // Always add the section if we have a title, even if no activities
            // This ensures all tiles are visible to the user
            if (activities.length > 0) {
                sections.push({ title: folderName, activities });
            }
        });

        console.log('Total sections with activities:', sections.length);
        return sections;
    }

    /**
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
    }

    /**
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
            let instanceName = clonedSpan.textContent?.trim() || '';

            // If we have a meaningful instance name, use it
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
    }    /**
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
            const tileName = titleElement?.textContent?.trim() || 'Unknown Section';
            const sectionNumber = tile.getAttribute('data-section');

            // Create folder name, avoiding duplicate numbering if tile name already has it
            const folderName = this.createTileFolderName(sectionNumber, tileName);

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
                    sections.push({ title: folderName, activities });
                }
            }
        }

        return sections;
    }    /**
     * Check if a tile name already starts with a number annotation like "1. " or "12.3 "
     * @param tileName The tile name to check
     * @returns True if the tile name already starts with a number annotation
     * 
     * Examples:
     * - "1. Introduction" -> true (already has number annotation)
     * - "2. Getting Started" -> true (already has number annotation) 
     * - "12.1 Advanced Topics" -> true (already has decimal number annotation)
     * - "12.3 Complex Systems" -> true (already has decimal number annotation)
     * - "Algorithmes récursifs (1%)" -> false (no number annotation)
     * - "Module 3" -> false (doesn't start with "number. " pattern)
     */
    private static tileNameHasNumberAnnotation(tileName: string): boolean {
        // Check if the title starts with a number (possibly decimal) followed by a dot and space
        // Patterns: "1. ", "2. ", "12.1 ", "12.3 ", "1.5 ", etc.
        return /^\d+\.\s/.test(tileName);
    }    /**
     * Create a folder name for a tile, avoiding duplicate numbering if the tile name already has it
     * @param sectionNumber The section number from data-section attribute
     * @param tileName The original tile name
     * @returns Properly formatted folder name
     * 
     * Examples:
     * - sectionNumber="2", tileName="Algorithmes récursifs (1%)" -> "2 Algorithmes récursifs (1%)"
     * - sectionNumber="1", tileName="1. Introduction" -> "1. Introduction" (no duplicate numbering)
     * - sectionNumber="3", tileName="3. Advanced Topics" -> "3. Advanced Topics" (no duplicate numbering)
     * - sectionNumber="12", tileName="12.1 Complex Systems" -> "12.1 Complex Systems" (no duplicate numbering)
     * - sectionNumber="12", tileName="12.3 Advanced Methods" -> "12.3 Advanced Methods" (no duplicate numbering)
     */
    private static createTileFolderName(sectionNumber: string | null, tileName: string): string {
        if (!sectionNumber) {
            return tileName;
        }

        // If the tile name already starts with a number annotation, don't add another one
        if (this.tileNameHasNumberAnnotation(tileName)) {
            return tileName;
        }

        // Otherwise, add the section number prefix
        return `${sectionNumber} ${tileName}`;
    }
}
