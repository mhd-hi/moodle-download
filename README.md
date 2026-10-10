# Moodle Downloader Extension

A Chrome Extension that selectively downloads course materials from any Moodle platform as organized ZIP files.

## Features

- 📁 **Tab folders**: files are grouped by course tab/section, collapsible, each with its own select-all checkbox
- 📝 **notes.md per folder**: tab text is exported as Markdown (headings, file links, images) with a content SHA, so edited tabs resurface as new
- ✅ **Skip already-downloaded**: remembers what you downloaded and unselects it next time (toggleable, per-URL history with `Forget` to clear)
- 📦 **ZIP downloads**: single ZIP with folder structure preserved, duplicate names auto-renamed
- ❌ **Cancellable downloads**: stop a running ZIP build at any time
- 🔄 **Resilient popup**: closing and reopening mid-scan or mid-download restores state instead of restarting
- 🌍 **Universal**: works on any Moodle installation over HTTP(S), not just one university
- 🔄 **Auto URL processing**: folder links converted to ZIP downloads, `&redirect=1` added automatically
- ⚡ **Modern architecture**: Chrome Extension Manifest V3, TypeScript, auto-publish to the Web Store via GitHub Actions

## How to Use

1. **Navigate** to any Moodle course page
2. **Click** the extension icon in your browser toolbar
3. **Review** the list of files grouped by tab (expand a group to see its files and `notes.md`)
4. **Select/Deselect** files, whole tabs, or turn off `Skip already-downloaded` for full manual control
5. **Click** "Download as ZIP" (or Cancel while it builds)
6. Files land in your Downloads folder, organized in per-tab sub-folders

## Installation & Setup

### Prerequisites

- Node.js (v16 or higher)
- npm or any other package manager
- Chrome browser

### 1. Install Dependencies and Build

```bash
npm install

npm run build
```

### 2. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `dist/` folder from this project
5. The extension should now appear in your extensions list

### 3. Test the Extension

1. Navigate to a Moodle course page
2. Click the extension icon in your browser toolbar
3. Review the list of files detected on the page
4. Select/deselect files as needed
5. Click "Download as ZIP" to download selected files
6. Check your Downloads folder for the ZIP file

## How It Works

### Architecture

The extension uses a three-part architecture:

1. **Content Script** (`contentScript.ts`):
   - Scans the DOM for downloadable links when requested
   - Handles standard, tiles, and tabbed course layouts
   - Extracts tab text as Markdown `notes.md` files with content hashes
   - Responds to scan requests from the popup

2. **Popup Interface** (`popup.ts` and `popup.html`):
   - File selection grouped by collapsible tab folders
   - Download history, skip-already-downloaded toggle, and cancel support
   - Restores scan/download state after being closed and reopened

3. **Background Service Worker** (`background.ts`):
   - Creates ZIP files from selected content (fetched files + generated notes)
   - Persists scan/download state and download history in `chrome.storage.local`
   - Manages the final ZIP download, per-download cancellation included

## License

MIT License - feel free to modify and distribute as needed.
