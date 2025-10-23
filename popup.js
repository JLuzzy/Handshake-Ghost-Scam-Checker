document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("scan");
  btn.addEventListener("click", async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { type: "HANDSHAKE_SCAN" }, () => {});
  });
});
