chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_SESSION_TIME") {
    chrome.storage.sync.get({ enabled: true }, (s) => {
      if (!s.enabled) return sendResponse({ success: false, disabled: true });
      fetch("https://alcasar.laplateforme.io:3991/json/status")
        .then((r) => r.json())
        .then((d) => sendResponse({ success: true, minutes: Math.floor((d?.accounting?.sessionTime || 0) / 60) }))
        .catch(() => sendResponse({ success: false }));
    });
    return true;
  }
});
