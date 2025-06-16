# Issues

# Enhancements
- Add folder support (when /mod/folder/). We need to use this:
https://ena.etsmtl.ca/mod/folder/download_folder.php?id=1484056 (The id here is the id of that document). The filetype will be .zip.  
- Add logs inside the extension UI (maybe use the Logger directly).
    - It should show the logs that we're doing in the UI. Limit view to 5 lines, we can make it bigger. It should be scrollable. It should append each time there's a log. It should appear after the files-container. So it will receive data and synchronize on the spot. You might make the popup.html larger if you want.
