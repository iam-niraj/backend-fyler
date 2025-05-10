chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    if (message.action === "process_file") {
        // Send file & constraints to the server
        let response = await fetch("http://127.0.0.1:5000/process", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                file: message.file,
                filename: message.filename,
                constraints: message.constraints
            })
        });

        let result = await response.json();
        
        // Notify content script to replace the file
        chrome.tabs.sendMessage(sender.tab.id, {
            action: "replace_file",
            processedFile: result.file,
            inputSelector: message.inputSelector
        });

        // Show notification
        chrome.notifications.create({
            type: "basic",
            iconUrl: "icon.png",
            title: "File Processed",
            message: `${message.filename} has been processed and replaced automatically.`
        });
    }
});
