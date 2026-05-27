# Moodle Downloader Extension
> Vibecoded app (bad quality code)
A Chrome Extension that allows you to selectively download course materials from Moodle platforms as organized ZIP files.

## Features

- � **File Selection**: View all downloadable files with checkboxes (all selected by default)
- 📦 **ZIP Downloads**: Single ZIP file containing all selected materials
- 🔄 **Auto URL Processing**: Automatically adds `&redirect=1` parameter for direct downloads
- 🎨 **User-Friendly**: Clean popup interface with file management
- ⚡ **Modern Architecture**: Uses Chrome Extension Manifest V3

## How to Use

1. **Navigate** to any Moodle course page on `https://ena.etsmtl.ca/`
2. **Click** the extension icon in your browser toolbar
3. **Review** the list of downloadable files found on the page
4. **Select/Deselect** files using checkboxes (all are selected by default)
5. **Click** "Download as ZIP" to download selected files
6. **Files are organized**:
   - **Tiles layout**: ZIP contains folders named after course sections
   - **Standard layout**: ZIP contains files directly


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


### 3. Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top right)
3. Click **Load unpacked**
4. Select the `dist/` folder from this project
5. The extension should now appear in your extensions list

### 4. Test the Extension

1. Navigate to a Moodle course page on `https://ena.etsmtl.ca/`
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
   - Handles both standard and tiles layout modes
   - Responds to scan requests from the popup

2. **Popup Interface** (`popup.ts` and `popup.html`):
   - Provides user interface for file selection
   - Displays discovered files with checkboxes
   - Handles user interactions and download requests
   - Communicates with content script and background

3. **Background Service Worker** (`background.ts`):
   - Creates ZIP files from selected content
   - Downloads files and packages them
   - Manages the final ZIP download

## License

MIT License - feel free to modify and distribute as needed.
