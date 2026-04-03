document.addEventListener("DOMContentLoaded", async () => {
  const toggle = document.getElementById("toggle");
  const requiredHours = document.getElementById("required-hours");

  const { enabled = true, requiredHours: savedHours = 30 } = await chrome.storage.sync.get(["enabled", "requiredHours"]);
  toggle.checked = enabled;
  requiredHours.value = savedHours;

  toggle.addEventListener("change", async () => {
    await chrome.storage.sync.set({ enabled: toggle.checked });
  });

  requiredHours.addEventListener("change", async () => {
    const value = parseInt(requiredHours.value, 10);
    if (value > 0) {
      await chrome.storage.sync.set({ requiredHours: value });
    }
  });
});
