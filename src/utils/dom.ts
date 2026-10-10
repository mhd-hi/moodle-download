import { ActivityLink, TileSection } from '../types';
import { URLUtils } from '../utils';

/**
 * Utility functions for DOM manipulation and URL processing
 */
export class DOMUtils {
    static findStandardActivityLinks(): ActivityLink[] {
        const activities: ActivityLink[] = [];

        document.querySelectorAll<HTMLElement>('.activityname').forEach(container => {
            const link = container.querySelector<HTMLAnchorElement>('a[href]');
            if (link?.href) {
                activities.push({
                    ...this.toActivity(link),
                    folder: this.findActivityFolder(container),
                });
            }
        });

        return activities;
    }

    /**
     * Find the tab/section path containing an activity.
     * Moodle uses both tab panels and regular course sections, depending on
     * the course format. The returned path becomes the ZIP folder path.
     */
    private static findActivityFolder(activity: HTMLElement): string | undefined {
        const parts: string[] = [];
        let current: HTMLElement | null = activity;

        while (current) {
            const panelName = this.findTabPanelName(current);
            if (panelName && !parts.includes(panelName)) {
                parts.unshift(panelName);
            }

            const sectionName = this.findSectionName(current);
            if (sectionName && !parts.includes(sectionName)) {
                parts.unshift(sectionName);
            }

            current = current.parentElement;
        }

        return parts.length > 0 ? parts.join('/') : undefined;
    }

    private static findTabPanelName(element: HTMLElement): string | undefined {
        const isPanel = element.getAttribute('role') === 'tabpanel' || element.classList.contains('tab-pane');
        if (!isPanel) return undefined;

        const label = element.getAttribute('aria-label');
        if (label?.trim()) return label.trim();

        const labelledBy = element.getAttribute('aria-labelledby');
        if (labelledBy) {
            const labelElement = document.getElementById(labelledBy);
            if (labelElement?.textContent?.trim()) return labelElement.textContent.trim();
        }

        if (element.id) {
            const tab = Array.from(document.querySelectorAll<HTMLElement>('[aria-controls]'))
                .find(candidate => candidate.getAttribute('aria-controls') === element.id);
            if (tab?.textContent?.trim()) return tab.textContent.trim();

            const link = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))
                .find(candidate => candidate.hash === `#${element.id}`);
            if (link?.textContent?.trim()) return link.textContent.trim();
        }

        return undefined;
    }

    private static findSectionName(element: HTMLElement): string | undefined {
        const section = element.closest<HTMLElement>(
            '.section, .course-section, li[id^="section-"], [data-for="section"], [data-region="section"]'
        );
        if (!section) return undefined;

        const heading = section.querySelector<HTMLElement>(
            '.sectionname, .section-title, .coursesectionname, h2, h3'
        );
        return heading?.textContent?.trim() || undefined;
    }

    static findTileSections(): TileSection[] {
        const tilesContainer = document.querySelector<HTMLElement>('ul.tiles#multi_section_tiles');
        if (!tilesContainer) return [];

        const sections: TileSection[] = [];

        tilesContainer.querySelectorAll<HTMLElement>('li.tile:not(.spacer)').forEach(tile => {
            const tileName = tile.querySelector<HTMLElement>('h3')?.textContent?.trim() || 'Unknown Section';
            const sectionNumber = tile.getAttribute('data-section');
            const folderName = this.createTileFolderName(sectionNumber, tileName);

            if (sectionNumber) {
                const sectionElement = document.querySelector<HTMLElement>(`#section-${sectionNumber}`);
                if (sectionElement) {
                    const activities = this.findActivitiesInSection(sectionElement);
                    if (activities.length > 0) {
                        sections.push({ title: folderName, activities });
                    }
                }
            }
        });

        return sections;
    }

    private static findActivitiesInSection(section: HTMLElement): ActivityLink[] {
        const activitySelectors = [
            '.activityname a[href]',
            '.activity-name-area a[href]',
            '.activity a[href]',
            'a[href*="mod/resource"]',
            'a[href*="mod/folder"]',
            'a[href*="pluginfile.php"]',
            'a[href*="/file.php"]',
            '.format-tiles-cm-list a[href]'
        ];

        const activities: ActivityLink[] = [];
        const foundUrls = new Set<string>();

        activitySelectors.forEach(selector => {
            section.querySelectorAll<HTMLAnchorElement>(selector).forEach(link => {
                if (link.href && !foundUrls.has(link.href) && URLUtils.isValidMoodleURL(link.href)) {
                    foundUrls.add(link.href);
                    activities.push(this.toActivity(link));
                }
            });
        });

        return activities;
    }

    static isTilesLayout(): boolean {
        return document.querySelector('ul.tiles#multi_section_tiles') !== null;
    }

    /** Shared link → ActivityLink conversion used by every finder above. */
    private static toActivity(link: HTMLAnchorElement): ActivityLink {
        return {
            url: link.href,
            title: this.extractCleanTitle(link) || link.textContent?.trim() || 'Unknown Activity',
            originalFilename: this.extractPreferredFilename(link)
        };
    }

    /** Clean title from activity link, removing accessibility text. */
    private static extractCleanTitle(link: HTMLAnchorElement): string | undefined {
        const instanceNameSpan = link.querySelector<HTMLSpanElement>('.instancename');

        if (instanceNameSpan) {
            const clonedSpan = instanceNameSpan.cloneNode(true) as HTMLSpanElement;
            clonedSpan.querySelectorAll('.accesshide').forEach(element => element.remove());

            const cleanTitle = clonedSpan.textContent?.trim() || '';
            if (cleanTitle) {
                return URLUtils.isMoodleFolder(link.href) ? `${cleanTitle} (ZIP)` : cleanTitle;
            }
        }

        const fallbackTitle = link.textContent?.trim();
        if (fallbackTitle && URLUtils.isMoodleFolder(link.href)) {
            return `${fallbackTitle} (ZIP)`;
        }
        return fallbackTitle;
    }

    /** Preferred filename from instancename span, falling back to URL extraction. */
    private static extractPreferredFilename(link: HTMLAnchorElement): string | undefined {
        const instanceNameSpan = link.querySelector<HTMLSpanElement>('.instancename');

        if (instanceNameSpan) {
            const clonedSpan = instanceNameSpan.cloneNode(true) as HTMLSpanElement;
            clonedSpan.querySelectorAll('.accesshide').forEach(element => element.remove());

            let instanceName = clonedSpan.textContent?.trim() || '';
            if (instanceName) {
                instanceName = instanceName.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, ' ').trim();
                return URLUtils.isMoodleFolder(link.href) ? `${instanceName}.zip` : instanceName;
            }
        }

        return this.extractFilenameFromURL(link.href);
    }

    private static extractFilenameFromURL(url: string): string | undefined {
        try {
            const urlObj = new URL(url);

            if (URLUtils.isMoodleFolder(url)) {
                const id = urlObj.searchParams.get('id');
                return id ? `folder_${id}.zip` : 'folder.zip';
            }

            const pathParts = urlObj.pathname.split('/');
            const lastPart = pathParts[pathParts.length - 1];

            if (lastPart?.includes('.')) {
                return decodeURIComponent(lastPart);
            }

            return undefined;
        } catch {
            return undefined;
        }
    }

    /** Fallback: all activity links anywhere on the page. */
    static findAllActivityLinks(): ActivityLink[] {
        const activities: ActivityLink[] = [];

        document.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
            if (link.href && URLUtils.isValidMoodleURL(link.href)) {
                activities.push(this.toActivity(link));
            }
        });

        return activities;
    }

    /** Fallback: downloadable files inside the tiles container. */
    static findFilesInTilesContainer(): ActivityLink[] {
        const tilesContainer = document.querySelector<HTMLElement>('ul.tiles#multi_section_tiles');
        if (!tilesContainer) return [];

        const activities: ActivityLink[] = [];

        tilesContainer.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
            if (link.href && URLUtils.isValidMoodleURL(link.href)) {
                activities.push(this.toActivity(link));
            }
        });

        return activities;
    }

    /** Fallback: any loaded section content elsewhere in the DOM. */
    static findLoadedSectionContent(): ActivityLink[] {
        const sectionContentSelectors = [
            '.format_tiles_section_content',
            '.course-content',
            '.section-content',
            '[data-region="course-content"]',
            '.format-tiles-cm-list'
        ];

        const activities: ActivityLink[] = [];

        sectionContentSelectors.forEach(selector => {
            document.querySelectorAll<HTMLElement>(selector).forEach(container => {
                container.querySelectorAll<HTMLAnchorElement>('a[href]').forEach(link => {
                    if (link.href && URLUtils.isValidMoodleURL(link.href)) {
                        activities.push(this.toActivity(link));
                    }
                });
            });
        });

        return activities;
    }

    /** Attempt to load content for empty tile sections by clicking their tiles. */
    static async loadTileSectionsContent(): Promise<TileSection[]> {
        const tilesContainer = document.querySelector<HTMLElement>('ul.tiles#multi_section_tiles');
        if (!tilesContainer) return [];

        const tiles = Array.from(tilesContainer.querySelectorAll<HTMLElement>('li.tile:not(.spacer)'));
        const sections: TileSection[] = [];

        for (const tile of tiles) {
            const tileName = tile.querySelector('h3')?.textContent?.trim() || 'Unknown Section';
            const sectionNumber = tile.getAttribute('data-section');
            const folderName = this.createTileFolderName(sectionNumber, tileName);

            if (!sectionNumber) continue;

            const sectionElement = document.querySelector<HTMLElement>(`#section-${sectionNumber}`);
            let activities: ActivityLink[] = [];

            if (sectionElement?.innerHTML.trim()) {
                activities = this.findActivitiesInSection(sectionElement);
            }

            if (activities.length === 0) {
                const tileLink = tile.querySelector('a.tile-link') as HTMLAnchorElement | null;
                if (tileLink && sectionElement) {
                    try {
                        tileLink.click();
                        await new Promise(resolve => setTimeout(resolve, 500));
                        activities = this.findActivitiesInSection(sectionElement);
                    } catch {
                        // Leave activities empty — section stays skipped
                    }
                }
            }

            if (activities.length > 0) {
                sections.push({ title: folderName, activities });
            }
        }

        return sections;
    }

    /** "1. Intro" already has a number annotation; "Intro" needs the section number prefixed. */
    private static tileNameHasNumberAnnotation(tileName: string): boolean {
        return /^\d+\.\s/.test(tileName);
    }

    private static createTileFolderName(sectionNumber: string | null, tileName: string): string {
        if (!sectionNumber || this.tileNameHasNumberAnnotation(tileName)) {
            return tileName;
        }
        return `${sectionNumber} ${tileName}`;
    }

    /**
     * Extract tab/section text as Markdown, keyed by folder name.
     * Innermost container wins when nested, so text isn't duplicated
     * across a tab and its sections.
     */
    static extractNotesByFolder(): Map<string, { markdown: string; images: string[] }> {
        const candidates: Array<{ folder: string; el: HTMLElement }> = [];
        const seen = new Set<Element>();
        const consider = (folder: string | undefined, el: HTMLElement | null) => {
            if (!folder || !el || seen.has(el)) return;
            // Messaging/contacts UI is not course content.
            if (el.closest('.message-drawer, [data-region="lazy-load-list"], [data-region="message-drawer"]')) return;
            seen.add(el);
            candidates.push({ folder, el });
        };

        if (this.isTilesLayout()) {
            document.querySelectorAll<HTMLElement>('ul.tiles#multi_section_tiles li.tile:not(.spacer)').forEach(tile => {
                const sectionNumber = tile.getAttribute('data-section');
                const tileName = tile.querySelector('h3')?.textContent?.trim() || 'Unknown Section';
                if (sectionNumber) {
                    consider(
                        this.createTileFolderName(sectionNumber, tileName),
                        document.querySelector<HTMLElement>(`#section-${sectionNumber}`)
                    );
                }
            });
        }

        document.querySelectorAll<HTMLElement>('.course-section, li[id^="section-"], [data-for="section"], [data-region="section"]').forEach(sec => {
            if (/^section-\d+$/.test(sec.id) && this.isTilesLayout()) return; // Covered by the tile pass
            consider(this.findActivityFolder(sec), sec);
        });

        document.querySelectorAll<HTMLElement>('[role="tabpanel"], .tab-pane').forEach(panel => {
            consider(this.findActivityFolder(panel), panel);
        });

        // Label activities act as sub-folder headers (e.g. an h3 "Diapositives"
        // grouping the files below it) — same folder key as the files get.
        document.querySelectorAll<HTMLElement>('li.activity.label, li.modtype_label').forEach(label => {
            consider(this.findActivityFolder(label), label);
        });

        // Generic Bootstrap-style tabs (e.g. OneTopic): nav links point at panes.
        document.querySelectorAll<HTMLElement>('[role="tablist"], .nav-tabs, .nav-pills').forEach(tablist => {
            tablist.querySelectorAll<HTMLElement>('[role="tab"], a[href^="#"]').forEach(tab => {
                const text = tab.textContent?.trim();
                if (!text) return;
                let panel: HTMLElement | null = null;
                const controls = tab.getAttribute('aria-controls');
                if (controls) panel = document.getElementById(controls);
                if (!panel && tab instanceof HTMLAnchorElement && tab.hash.length > 1) {
                    panel = document.getElementById(tab.hash.slice(1));
                }
                if (panel) consider(this.findActivityFolder(panel) || text, panel);
            });
        });

        const notes = new Map<string, { markdown: string; images: string[] }>();
        candidates.forEach(({ folder, el }) => {
            const { markdown: md, images } = this.elementToMarkdown(el);
            if (md.replace(/\s+/g, ' ').trim().length < 20 && images.length === 0) return;
            const prev = notes.get(folder);
            notes.set(folder, prev
                ? { markdown: `${prev.markdown}\n\n---\n\n${md}`, images: [...prev.images, ...images] }
                : { markdown: md, images });
        });

        return notes;
    }

    /** Nested sections are extracted as their own notes — parents keep only their own text. */
    private static readonly NESTED_SECTION_SEL =
        'li[id^="section-"], [data-for="section"], [data-region="section"], [role="tabpanel"], .tab-pane, .course-section, li.activity.label, li.modtype_label, ul.tiles#multi_section_tiles li.tile:not(.spacer)';

    private static isHiddenElement(el: HTMLElement): boolean {
        if (/^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return true;
        const classes = (el.getAttribute('class') || '').split(/\s+/);
        return classes.includes('accesshide') || classes.includes('visually-hidden') || classes.includes('sr-only');
    }

    /** Convert an element to Markdown: headings, text, file links, images. */
    private static elementToMarkdown(root: HTMLElement): { markdown: string; images: string[] } {
        const parts: string[] = [];
        const collected: string[] = [];
        const inlineChildren = (el: HTMLElement): string =>
            Array.from(el.childNodes).map(c => inline(c)).join('').replace(/\s+/g, ' ').trim();
        const pushBlock = (text: string) => {
            const t = text.trim();
            if (t) parts.push(t);
        };
        const inline = (node: Node, isRoot = false): string => {
            if (node.nodeType === 3) return (node.textContent || '').replace(/\s+/g, ' ');
            if (node.nodeType !== 1) return '';
            const el = node as HTMLElement;
            if (this.isHiddenElement(el)) return '';
            if (!isRoot && el.matches(DOMUtils.NESTED_SECTION_SEL)) return '';
            const kids = Array.from(el.childNodes).map(c => inline(c)).join('');
            switch (el.tagName) {
                case 'A': {
                    const href = this.absUrl(el.getAttribute('href'));
                    const text = kids.trim() || href;
                    return href ? `[${text}](${href})` : text;
                }
                case 'IMG': {
                    const src = this.absUrl(el.getAttribute('src'));
                    const alt = el.getAttribute('alt')?.trim() || 'image';
                    if (src && !collected.includes(src)) collected.push(src);
                    return src ? `![${alt}](${src})` : '';
                }
                case 'B': case 'STRONG': return kids.trim() ? `**${kids.trim()}**` : '';
                case 'I': case 'EM': return kids.trim() ? `*${kids.trim()}*` : '';
                case 'CODE': return kids.trim() ? `\`${kids.trim()}\`` : '';
                case 'BR': return '\n';
                default: return kids;
            }
        };
        const blocks = (node: Node): void => {
            if (node.nodeType === 3) {
                pushBlock((node.textContent || '').replace(/\s+/g, ' '));
                return;
            }
            if (node.nodeType !== 1) return;
            const el = node as HTMLElement;
            if (this.isHiddenElement(el)) return;
            if (el.matches(DOMUtils.NESTED_SECTION_SEL)) return;
            const tag = el.tagName;
            if (/^H[1-6]$/.test(tag)) {
                pushBlock(`${'#'.repeat(parseInt(tag.charAt(1), 10))} ${inlineChildren(el)}`);
                return;
            }
            switch (tag) {
                case 'LI': pushBlock(`- ${inlineChildren(el)}`); return;
                case 'TR': {
                    const cells = Array.from(el.children)
                        .map(c => inlineChildren(c as HTMLElement)).filter(Boolean);
                    pushBlock(`| ${cells.join(' | ')} |`);
                    return;
                }
                case 'HR': parts.push('---'); return;
                case 'PRE': {
                    const t = (el.textContent || '').replace(/\n+$/, '');
                    if (t.trim()) parts.push(`\`\`\`\n${t}\n\`\`\``);
                    return;
                }
                case 'BLOCKQUOTE': {
                    const t = inlineChildren(el);
                    if (t) pushBlock(t.split('\n').map(l => `> ${l}`).join('\n'));
                    return;
                }
                case 'P': case 'DIV': case 'SECTION': case 'ARTICLE': case 'HEADER': case 'FOOTER':
                case 'UL': case 'OL': case 'TABLE': case 'TBODY': case 'THEAD':
                case 'FIGURE': case 'FIGCAPTION': case 'MAIN':
                    Array.from(el.childNodes).forEach(blocks);
                    return;
                default: {
                    const hasBlocks = Array.from(el.childNodes).some(n =>
                        n.nodeType === 1 && /^(P|DIV|UL|OL|LI|H[1-6]|TABLE|PRE|BLOCKQUOTE|SECTION|ARTICLE|HEADER|FIGURE)$/.test((n as HTMLElement).tagName));
                    if (hasBlocks) Array.from(el.childNodes).forEach(blocks);
                    else pushBlock(inline(node));
                    return;
                }
            }
        };
        Array.from(root.childNodes).forEach(blocks);
        return {
            markdown: parts.join('\n\n').replace(/\n{3,}/g, '\n\n').trim(),
            images: collected,
        };
    }

    private static absUrl(raw: string | null): string {
        if (!raw || raw.startsWith('#') || raw.startsWith('javascript:')) return '';
        try { return new URL(raw, document.baseURI).href; } catch { return ''; }
    }
}
