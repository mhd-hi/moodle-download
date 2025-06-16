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
     */
    static ensureRedirectParameter(url: string): string {
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
    }    /**
     * Check if URL is a valid Moodle download URL
     * Excludes non-downloadable content like forums, quizzes, and external sites like Safe Exam Browser
     * @param url The URL to validate
     * @returns True if URL appears to be a downloadable Moodle resource
     */
    static isValidMoodleURL(url: string): boolean {
        try {
            const urlObj = new URL(url);

            // Check for common Moodle URL patterns
            const pathname = urlObj.pathname.toLowerCase();
            // Exclude non-downloadable Moodle activities
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

            // Exclude specific external URLs that shouldn't be downloaded
            const excludedDomains = [
                'safeexambrowser.org'
            ];

            if (excludedPatterns.some(pattern => pathname.includes(pattern))) {
                return false;
            }

            // Check if the domain is in the excluded list
            if (excludedDomains.some(domain => urlObj.hostname.includes(domain))) {
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
