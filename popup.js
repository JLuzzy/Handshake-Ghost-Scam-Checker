document.addEventListener("DOMContentLoaded", () => {
  const scanButton = document.getElementById("scan");

  scanButton.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: "HANDSHAKE_SCAN" }, () => {
        // Response handled silently
      });
    }
  });
});
