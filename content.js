const POLL_INTERVAL_MS = 20000;
let pollTimer = null;

function requestSessionTime() {
  chrome.runtime.sendMessage({ type: "GET_SESSION_TIME" }, (r) => {
    if (chrome.runtime.lastError) return;

    // Keep required hours in sync with popup settings.
    chrome.storage.sync.get({ requiredHours: 30 }, (storage) => {
      if (r?.success) {
        window.postMessage(
          {
            type: "LOGTIME_SESSION_MINUTES",
            minutes: r.minutes,
            requiredHours: storage.requiredHours,
            fetchedAt: Date.now()
          },
          "*"
        );
      } else if (r?.disabled) {
        window.postMessage({ type: "LOGTIME_EXTENSION_DISABLED" }, "*");
      }
    });
  });
}

function startPolling() {
  if (pollTimer) return;
  requestSessionTime();
  pollTimer = setInterval(requestSessionTime, POLL_INTERVAL_MS);
}

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

startPolling();

window.addEventListener("focus", requestSessionTime);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") {
    startPolling();
    requestSessionTime();
  } else {
    stopPolling();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "sync") return;
  if (changes.enabled || changes.requiredHours) {
    requestSessionTime();
  }
});
