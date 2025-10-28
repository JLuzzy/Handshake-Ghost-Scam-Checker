document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("scan");
  if (!btn) return;

  btn.addEventListener("click", () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error("Handshake Trust Checker:", chrome.runtime.lastError);
        return;
      }

      const tab = Array.isArray(tabs) ? tabs[0] : null;
      if (!tab || typeof tab.id !== "number") {
        return;
      }

      chrome.tabs.sendMessage(tab.id, { type: "HANDSHAKE_SCAN" }, () => {
        if (chrome.runtime.lastError) {
          console.error("Handshake Trust Checker:", chrome.runtime.lastError);
        }
      });
    });
  });
});
