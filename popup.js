console.log("🔍 Popup script loaded.");

document.addEventListener('DOMContentLoaded', function() {
    // Initialize UI elements
    const compressBtn = document.getElementById('compressBtn');
    const mergeBtn = document.getElementById('mergeBtn');
    const splitBtn = document.getElementById('splitBtn');
    const fileInput = document.getElementById('fileInput');

    // Button click handlers
    compressBtn.addEventListener('click', () => handleButtonClick('compress'));
    mergeBtn.addEventListener('click', () => handleButtonClick('merge'));
    splitBtn.addEventListener('click', () => handleButtonClick('split'));

    // File input handler
    fileInput.addEventListener('change', handleFileSelection);
});

function handleButtonClick(operation) {
    const fileInput = document.getElementById('fileInput');
    fileInput.dataset.operation = operation;
    fileInput.multiple = (operation === 'merge');
    fileInput.click();
}

async function handleFileSelection() {
    const operation = this.dataset.operation;
    const files = Array.from(this.files);
    
    if (files.length === 0) return;

    try {
        if (operation === 'merge') {
            await window.handleMerge(files);
        } else {
            let actualOperation = operation;
            const file = files[0];
            if (operation === 'compress') {
                actualOperation = file.type.startsWith("image/") ? 'imgCompressor' : 'compress';
            }
            const processedFile = await window.processFileSequentially(
                files[0], 
                { operations: [actualOperation] }
            );
            window.triggerDownload(processedFile, `${actualOperation}_result.${file.name.split('.').pop()}`);
        }
    } catch (error) {
        console.error('Processing error:', error);
        alert(`Processing failed: ${error.message}`);
    }
}
