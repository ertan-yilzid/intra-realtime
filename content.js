chrome.runtime.sendMessage({ type: "GET_SESSION_TIME" }, (r) => {
  // Get requiredHours from storage
  chrome.storage.sync.get({ requiredHours: 30 }, (storage) => {
    if (r?.success) {
      window.postMessage({ 
        type: "LOGTIME_SESSION_MINUTES", 
        minutes: r.minutes,
        requiredHours: storage.requiredHours
      }, "*");
    }
  });
});
