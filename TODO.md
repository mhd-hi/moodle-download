# Moodle Downloader TODO

## Completed Features

- ✅ enumerate tiles folder. The pattern to get the tile number is in each tile li, we have data-section="2", then the folder will be named "2 tileName"
  - ✅ Smart numbering: Skip adding section number if tile name already starts with number annotation
  - ✅ Support for decimal numbering: Handle patterns like "12.1", "12.3", "1.5", etc.
- ✅ URL filtering: Exclude unwanted external URLs from download list
  - ✅ Exclude Safe Exam Browser downloads (safeexambrowser.org)

## Examples

### Tile Naming Patterns Supported:

**Simple numbering:**
- `data-section="1"` + tile name "Introduction" → folder: "1 Introduction"
- `data-section="1"` + tile name "1 Introduction" → folder: "1 Introduction" (no duplicate)

**Decimal numbering:**
- `data-section="12"` + tile name "12.1 Advanced Topics" → folder: "12.1 Advanced Topics" (no duplicate)
- `data-section="12"` + tile name "12.3 Complex Systems" → folder: "12.3 Complex Systems" (no duplicate)
- `data-section="5"` + tile name "Module Overview" → folder: "5 Module Overview"

### URL Filtering

**Excluded URLs:**
- `https://safeexambrowser.org/download_en.html` ❌ (filtered out)
- Forum links, quiz links, assignment submissions ❌ (filtered out)

**Included URLs:**
- `/mod/resource/` ✅ (downloadable resources)
- `/mod/folder/` ✅ (downloadable folders)
- `/pluginfile.php` ✅ (direct file downloads)
- Files with extensions (.pdf, .docx, etc.) ✅ (downloadable files)

### Regex Pattern
The extension uses the pattern `/^\d+(\.\d+)?\s/` to detect existing number annotations:
- `\d+` - matches one or more digits
- `(\.\d+)?` - optionally matches a decimal point and more digits
- `\s` - matches a space character

## Enhancement Ideas

- [ ] Support for other numbering formats (Roman numerals, letters)
- [ ] Configurable folder naming patterns
- [ ] Bulk download progress indicators
- [ ] User-configurable URL exclusion list
