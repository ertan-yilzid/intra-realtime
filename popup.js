document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("toggle");

  const { enabled = true } = await chrome.storage.sync.get("enabled");
  toggle.checked = enabled;

  toggle.addEventListener("change", async () => {
    await chrome.storage.sync.set({ enabled: toggle.checked });
  });
});
