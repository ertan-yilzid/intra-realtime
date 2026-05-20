function getToday(date = new Date()) {
  const d = date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getAccumulatorState(storage, today) {
  if (storage.lastDate !== today) {
    return { totalSeconds: 0, lastSessionTime: null };
  }

  const totalSeconds = Math.max(0, Math.floor(normalizeNumber(storage.totalSeconds, 0)));
  const lastSessionTimeRaw = normalizeNumber(storage.lastSessionTime, NaN);
  const lastSessionTime = Number.isFinite(lastSessionTimeRaw) ? lastSessionTimeRaw : null;

  return { totalSeconds, lastSessionTime };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_SESSION_TIME") {
    chrome.storage.sync.get({ enabled: true }, (syncStorage) => {
      if (!syncStorage.enabled) return sendResponse({ success: false, disabled: true });

      chrome.storage.local.get(
        {
          lastDate: null,
          totalSeconds: 0,
          lastSessionTime: null,
          lastSampleAt: null
        },
        (localStorage) => {
          const now = new Date();
          const today = getToday(now);
          const nowMs = now.getTime();
          const todayStartMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
          const secondsSinceMidnight = Math.max(0, Math.floor((nowMs - todayStartMs) / 1000));
          const isNewDay = localStorage.lastDate !== today;
          const state = getAccumulatorState(localStorage, today);

          fetch("https://alcasar.laplateforme.io:3991/json/status")
            .then((r) => r.json())
            .then((statusData) => {
              const sessionTimeSeconds = Math.max(
                0,
                Math.floor(normalizeNumber(statusData?.accounting?.sessionTime, 0))
              );

              let totalSeconds = state.totalSeconds;
              if (state.lastSessionTime === null) {
                if (totalSeconds === 0) {
                  totalSeconds = isNewDay
                    ? Math.min(sessionTimeSeconds, secondsSinceMidnight)
                    : sessionTimeSeconds;
                }
              } else {
                const delta = sessionTimeSeconds - state.lastSessionTime;
                if (delta >= 0) {
                  totalSeconds += delta;
                } else {
                  totalSeconds += sessionTimeSeconds;
                }
              }

              totalSeconds = Math.max(0, Math.floor(totalSeconds));

              chrome.storage.local.set({
                lastDate: today,
                totalSeconds,
                lastSessionTime: sessionTimeSeconds,
                lastSampleAt: nowMs
              });

              sendResponse({
                success: true,
                minutes: Math.floor(totalSeconds / 60),
                seconds: totalSeconds
              });
            })
            .catch(() => sendResponse({ success: false }));
        }
      );
    });
    return true;
  }
});
