chrome.runtime.sendMessage({ type: "GET_SESSION_TIME" }, (r) => {
  if (r?.success) {
    window.postMessage({ type: "LOGTIME_SESSION_MINUTES", minutes: r.minutes }, "*");
  }
});
