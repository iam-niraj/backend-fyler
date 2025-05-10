console.log("🔍 Content script loaded.");

// ############### Encryption Utilities ###############
function getKey(password) {
    const encoder = new TextEncoder();
    const encoded = encoder.encode(password);
    const key = new Uint8Array(32);
    key.set(encoded.subarray(0, 32));
    return key;
}

function padPKCS7(data) {
    const blockSize = 16;
    const paddingLength = blockSize - (data.length % blockSize);
    const padded = new Uint8Array(data.length + paddingLength);
    padded.set(data);
    padded.fill(paddingLength, data.length);
    return padded;
}

function unpadPKCS7(data) {
    const paddingLength = data[data.length - 1];
    if (paddingLength < 1 || paddingLength > 16) {
        throw new Error('Invalid padding');
    }
    for (let i = data.length - paddingLength; i < data.length; i++) {
        if (data[i] !== paddingLength) {
            throw new Error('Invalid padding');
        }
    }
    return data.subarray(0, data.length - paddingLength);
}

async function encryptData(data, password) {
    const key = getKey(password);
    const iv = crypto.getRandomValues(new Uint8Array(16)); // Ensures 16-byte IV

    // Validate input data
    if (!(data instanceof ArrayBuffer)) {
        data = new Uint8Array(data).buffer;
    }

    // Explicit padding calculation
    const blockSize = 16;
    const paddingLength = blockSize - (data.byteLength % blockSize);
    const paddedData = new Uint8Array(data.byteLength + paddingLength);
    paddedData.set(new Uint8Array(data));
    paddedData.fill(paddingLength, data.byteLength);

    const cryptoKey = await crypto.subtle.importKey(
        'raw', key, { name: 'AES-CBC' }, false, ['encrypt']
    );

    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv }, cryptoKey, paddedData
    );


    // Build final encrypted data
    const result = new Uint8Array(16 + ciphertext.byteLength);
    result.set(iv, 0); // First 16 bytes = IV
    result.set(new Uint8Array(ciphertext), 16);

    // Verify structure before decryption
    if (result.length < 16) {
        throw new Error("Invalid encrypted data: Missing IV");
    }
    // Final validation
    console.log('Encrypted Data Check:', {
        ivLength: 16,
        ciphertextBlocks: ciphertext.byteLength / 16,
        totalLength: result.length
    });

    // Add to encryptData function
    console.log('Encryption Debug:', {
        originalSize: data.byteLength,
        paddedSize: paddedData.length,
        iv: Array.from(iv),
        key: Array.from(key)
    });

    return result;
}

async function decryptData(encryptedData, password) {
    let bytes;
    if (encryptedData instanceof Uint8Array) {
        bytes = encryptedData;
    } else if (encryptedData instanceof ArrayBuffer) {
        bytes = new Uint8Array(encryptedData);
    } else {
        bytes = new Uint8Array(await (await new Response(encryptedData)).arrayBuffer());
    }


    console.log("Inside func...");
    // Strict structure validation
    if (bytes.length < 32) throw new Error(`Invalid data (${bytes.length} < 32)`);
    if ((bytes.length - 16) % 16 !== 0) throw new Error(`Invalid ciphertext length: ${bytes.length - 16}`);
    console.log("No issues")

    // Extract components
    const iv = bytes.slice(0, 16);
    const ciphertext = bytes.slice(16);

    // Match Django's key derivation exactly
    const encoder = new TextEncoder();
    const keyBuf = new Uint8Array(32);
    const passBytes = encoder.encode(password);
    keyBuf.set(passBytes.slice(0, 32));  // Truncate or zero-pad to 32 bytes
    console.log("All good")

    try {
        // Decrypt
        const cryptoKey = await crypto.subtle.importKey(
            'raw', keyBuf, 'AES-CBC', false, ['decrypt']
        );
        console.log("Got it")
        const decrypted = await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, cryptoKey, ciphertext);
        console.log("Decrypted: ", decrypted)
        const decryptedBytes = new Uint8Array(decrypted);

        // // Enhanced padding validation
        // const padValue = decryptedBytes[decryptedBytes.length - 1];
        // if (padValue < 1 || padValue > 16) {
        //     console.error('RAW DECRYPTED DATA HEADER:', decryptedBytes.slice(0, 16));
        //     throw new Error(`Invalid padding value: ${padValue}`);
        // }

        // // Validate all padding bytes
        // const paddingSection = decryptedBytes.slice(-padValue);
        // if (!paddingSection.every(v => v === padValue)) {
        //     console.error('PADDING BYTES:', Array.from(paddingSection));
        //     throw new Error('Padding bytes mismatch');
        // }

        return decryptedBytes;
    } catch (error) {
        console.log("Decryption error:", error);
        console.error('DECRYPTION FAILURE:', {
            iv: Array.from(iv),
            ciphertextLength: ciphertext.length,
            key: Array.from(keyBuf),
        });
        throw error;
    }
}

async function processFileSequentially(file, constraints) {
    let processedFile = file;
    console.log(`🔄 Processing file: ${file.name}`);
    const password = 'password123';

    for (let operation of constraints.operations) {
        // const apiURL = `http://localhost:5000/split`;
        const apiURL = `http://localhost:5000/${operation}`;
        const formData = new FormData();

        try {
            // Encrypt before sending
            const fileData = await processedFile.arrayBuffer();
            console.log(`🔒 Encrypting file for ${operation}...`);
            const encryptedData = await encryptData(fileData, password);
            const encryptedBlob = new Blob([encryptedData], { type: 'application/octet-stream' });

            console.log(`📤 Sending file to ${operation} API...`);
            formData.append("file", encryptedBlob, processedFile.name);
            formData.append("constraints", JSON.stringify(constraints));

            const response = await fetch(apiURL, {
                method: "POST",
                body: formData,
                headers: {
                    'X-Password': password
                }
            });
            console.log(`📥 Received response from ${operation} API.`);
            if (!response.ok) throw new Error(`Server error: ${response.status}`);

            // Decrypt response
            console.log(`🔓 Decrypting response from ${operation} API...`);

            // Get raw binary data (NOT arrayBuffer())
            const encryptedBlob2 = await response.blob();
            const encryptedData2 = new Uint8Array(await encryptedBlob2.arrayBuffer());


            if (operation == "compress") {
                // Create and download PDF
                const PDF = new Blob([encryptedData2], {
                    type: 'application/pdf'
                });

                triggerDownload(PDF, "compressed.pdf");

                replaceFileInput(fileInput, PDF, "compress");

                return PDF;

            }

            // Validate structure
            console.log("Encrypted response structure:", {
                totalLength: encryptedData2.length,
                iv: encryptedData2.slice(0, 16),
                ciphertextLength: encryptedData2.length - 16
            });

            // Handle ZIP vs other files
            if (encryptedBlob2.type == 'application/zip') {

                // Direct download for ZIP files (no decryption)
                const blob = new Blob([await encryptedBlob2.arrayBuffer()], { type: 'application/zip' });
                const url = URL.createObjectURL(blob);

                // Auto-download the ZIP
                const a = document.createElement('a');
                a.href = url;
                a.download = `decrypted_${operation}_results.zip`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }
            else {
                console.log(`🔑 Decrypting data...`);
                const decryptedData = await decryptData(encryptedData2, password);
                console.log(`✅ ${operation} completed successfully.`);

                // Get original content type from headers
                const originalType = response.headers.get('X-Original-Content-Type') || processedFile.type;

                processedFile = new Blob([decryptedData], { type: originalType });
                console.log(`🔄 Processed file type: ${processedFile.name}`);
                console.log(`↔️ Processed file size: ${processedFile.size}`);

                // Update preview
                // if (processedFile.type.startsWith("image/")) {
                //     const imgUrl = URL.createObjectURL(processedFile);
                //     document.getElementById('outputImage').src = imgUrl;
                // }
            }
            console.log(`✅ ${operation.toUpperCase()} completed.`);
        } catch (error) {
            console.error(`❌ Error in ${operation}:`, error);
            return null;
        }
    }
    return processedFile;
}

async function handleMerge(files, fileInput) {
    const password = "password123"; // Must match Django's password
    const mergeEndpoint = "http://localhost:5000/merge"; // Flask endpoint
    console.log("🔄 Merging files...");
    try {
        // 1. Encrypt all files using existing function
        const encryptionPromises = Array.from(files).map(async file => {
            const fileData = await file.arrayBuffer();
            return {
                name: file.name,
                encryptedData: await encryptData(fileData, password)
            };
        });
        console.log("🔒 Encrypting files...");

        const encryptedFiles = await Promise.all(encryptionPromises);
        console.log("📦 All files encrypted.")
            ;
        // 2. Prepare form data matching Django's expected format
        const formData = new FormData();
        encryptedFiles.forEach(({ name, encryptedData }) => {
            const blob = new Blob([encryptedData], { type: "application/octet-stream" });
            formData.append("files", blob, name);
        });
        console.log("📤 Form data prepared for merge.");

        // 3. Send to Flask proxy
        const response = await fetch(mergeEndpoint, {
            method: "POST",
            body: formData,
            headers: {
                "X-Password": password // Match Django's expected header
            }
        });
        console.log("📥 Response received from merge endpoint.");

        // 4. Handle encrypted response
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        // 4. Handle encrypted PDF response
        const encryptedResult = await response.blob();
        const decryptedData = await decryptData(encryptedResult, password);

        // Verify PDF signature
        const header = new Uint8Array(decryptedData.slice(0, 4));
        if (String.fromCharCode(...header) !== '%PDF') {
            throw new Error('Decrypted file is not a valid PDF');
        }
        // Create and download PDF
        const mergedPDF = new Blob([decryptedData], {
            type: 'application/pdf'
        });

        triggerDownload(mergedPDF, "merged_result.pdf");

        replaceFileInput(fileInput, mergedPDF, "merge");

    } catch (error) {
        console.error("Merge operation failed:", error);
    }
}

// Helper function to trigger file download
function triggerDownload(blob, filename) {
    try {
        if (!(blob instanceof Blob)) {
            throw new Error(`Invalid download content: ${typeof blob}`);
        }

        if (blob.size === 0) {
            throw new Error('Empty file content');
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Download failed:', error);
        alert(`Download error: ${error.message}`);
    }

}

// Function to get the file input inside Shadow DOM or standard forms
function findFileInput(event) {
    let fileInput = event.target;
    if (fileInput.tagName !== "INPUT" || fileInput.type !== "file") return null;

    console.log("📂 File input detected.");
    return fileInput;
}

// 🔹 Extract constraints from form or page text
function extractConstraints(fileInput) {
    console.log("📜 Extracting constraints...");
    let constraints = { maxSize: null, formats: [], width: null, height: null, operations: [] };

    // Extract from input attributes
    if (fileInput?.accept) {
        constraints.formats = fileInput.accept.split(",").map(f => f.trim());
    }
    if (fileInput?.dataset?.maxSize) {
        constraints.maxSize = parseInt(fileInput.dataset.maxSize);
    }

    // Extract from form labels or page text
    let text = document.body.innerText.toLowerCase();
    console.log("🔍 Scanning page for constraints...");

    let sizeMatch = text.match(/(?:max\s*file\s*size|max\s*size|file\s*limit)[:\-\s]*([\d\.]+)\s*(kb|mb|gb)/i);
    if (sizeMatch) {
        let sizeValue = parseFloat(sizeMatch[1]);
        let sizeUnit = sizeMatch[2].toLowerCase();
        if (sizeUnit === "kb") constraints.maxSize = sizeValue * 1024;
        else if (sizeUnit === "mb") constraints.maxSize = sizeValue * 1024 * 1024;
        else if (sizeUnit === "gb") constraints.maxSize = sizeValue * 1024 * 1024 * 1024;
    }

    let formatMatch = text.match(/(?:accepted|allowed)\s*(formats|types)[:\-\s]*([a-z, ]+)/i);
    if (formatMatch) {
        constraints.formats = formatMatch[2].split(/,\s*/).map(f => `.${f}`);
    }

    let dimMatch = text.match(/(\d+)\s*x\s*(\d+)\s*(px)?/);
    if (dimMatch) {
        constraints.width = parseInt(dimMatch[1]);
        constraints.height = parseInt(dimMatch[2]);
    }

    console.log("📋 Constraints Extracted:", constraints);
    return constraints;
}

function determineOperations(file, constraints, callback) {
    let operations = [];
    let fileExt = `.${file.name.split('.').pop().toLowerCase()}`;

    // Check file format for conversion
    if (constraints.formats.length && !constraints.formats.includes(fileExt)) {
        console.log(`⚠️ File format (${fileExt}) not allowed. Conversion required.`);
        operations.push("convert");
    }

    // Check file size for compression
    if (constraints.maxSize && file.size > constraints.maxSize) {
        console.log("⚠️ File exceeds max size. Compression required.");
        if (file.type.startsWith("image/")) {
            operations.push("imgCompressor");
        }
        else {
            operations.push("compress");
        }
    }
    console.log("🔧 Operations decided:", operations.length ? operations : "No processing needed");

    // If the file is NOT an image, skip resizing/expanding and call the callback immediately
    if (!file.type.startsWith("image/")) {
        console.log("📄 Non-image file detected, skipping dimension checks.");
        constraints.operations = operations;
        console.log("🔧 Operations decided:", operations.length ? operations : "No processing needed");
        return callback(operations);
    }
    return callback(operations);
}

// 🔹 Replace the uploaded file with the processed file
function replaceFileInput(fileInput, processedFile, op = "nonMerge") {
    let dataTransfer = new DataTransfer();
    let processedFileObj = null;
    if (op == "merge") {
        processedFileObj = new File([processedFile], "merged_file.pdf", { type: processedFile.type });
    }
    else {
        processedFileObj = new File([processedFile], "processed_" + fileInput.files[0].name, { type: processedFile.type });
    }

    console.log("📂 Replacing original file with processed file:", fileInput.name);
    dataTransfer.items.add(processedFileObj);
    fileInput.files = dataTransfer.files;

    console.log("✅ Replaced original file with processed file.");
}

// Listen for file input changes
document.addEventListener("change", async (event) => {
    let fileInput = findFileInput(event);
    if (!fileInput) return;

    const files = fileInput.files;
    if (files.length > 1) {
        // Handle merge for multiple files
        await handleMerge(files, fileInput);
    }
    else {
        let file = fileInput.files[0];
        console.log("📂 File selected:", file);

        let constraints = extractConstraints(fileInput);
        console.log("🔎 Constraints detected:", constraints);

        determineOperations(file, constraints, async (operations) => {
            if (!operations.length) {
                console.log("✅ File meets constraints, no processing needed.");
                return;
            }

            console.log("⚠️ File does NOT meet constraints. Processing...");
            let processedFile = await processFileSequentially(file, constraints);
            if (processedFile) {
                replaceFileInput(fileInput, processedFile);
            }
        });
    }
});


// Export existing functions to make them available to popup.js
window.processFileSequentially = processFileSequentially;
window.handleMerge = handleMerge;
window.extractConstraints = extractConstraints;
window.triggerDownload = triggerDownload;