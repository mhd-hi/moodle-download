/**
 * Utility functions for URL manipulation
 */
export class URLUtils {
    static convertFolderToZipURL(url: string): string {
        try {
            const urlObj = new URL(url);

            if (urlObj.pathname.includes('/mod/folder/')) {
                const id = urlObj.searchParams.get('id');
                if (id) {
                    return `${urlObj.protocol}//${urlObj.host}/mod/folder/download_folder.php?id=${id}`;
                }
            }

            return url;
        } catch {
            return url;
        }
    }

    static ensureRedirectParameter(url: string): string {
        try {
            const urlObj = new URL(this.convertFolderToZipURL(url));

            if (!urlObj.searchParams.has('redirect')) {
                urlObj.searchParams.set('redirect', '1');
            }

            return urlObj.toString();
        } catch {
            return url;
        }
    }

    /**
     * True when the current page looks like a Moodle course page.
     * Check once per scan — isValidMoodleURL stays a pure URL check.
     */
    static isMoodleCoursePage(): boolean {
        return document.querySelector(
            'body.path-course, body.pagelayout-course, .course-content, [data-region="course-content"], #page-course-view'
        ) !== null || /\/course\/view\.php(?:$|\?)/i.test(location.pathname + location.search);
    }

    static isValidMoodleURL(url: string): boolean {
        try {
            const urlObj = new URL(url);
            const pathname = urlObj.pathname.toLowerCase();

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

            if (urlObj.hostname.includes('safeexambrowser.org')) {
                return false;
            }

            const moodlePatterns = [
                '/mod/resource/',
                '/mod/folder/',
                '/pluginfile.php',
                '/webservice/pluginfile.php',
                '/file.php'
            ];

            return moodlePatterns.some(pattern => pathname.includes(pattern))
                || /\.[a-zA-Z0-9]{2,5}(\?|$)/.test(pathname);
        } catch {
            return false;
        }
    }

    static isMoodleFolder(url: string): boolean {
        try {
            return new URL(url).pathname.includes('/mod/folder/');
        } catch {
            return false;
        }
    }
}
