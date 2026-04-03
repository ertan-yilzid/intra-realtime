function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseDuration(durationStr) {
  // Parse "1 h 50 m 1 s" format
  const hours = (durationStr.match(/(\d+)\s*h/) || [0, 0])[1] || 0;
  const mins = (durationStr.match(/(\d+)\s*m/) || [0, 0])[1] || 0;
  return parseInt(hours) * 60 + parseInt(mins);
}

function getTodaysSessions(html) {
  const today = getToday();
  const sessions = [];
  
  // Match all <li> tags with title attributes containing today's date
  const regex = /<li[^>]*title="([^"]*)"/g;
  let match;
  
  while ((match = regex.exec(html))) {
    const title = match[1];
    if (title.includes(today)) {
      const durationMatch = title.match(/\(([^)]+)\)/);
      if (durationMatch) {
        sessions.push({
          title: title,
          minutes: parseDuration(durationMatch[1])
        });
      }
    }
  }
  
  return sessions;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "GET_SESSION_TIME") {
    chrome.storage.sync.get({ enabled: true, todaysSessions: [], lastDate: null }, (storage) => {
      if (!storage.enabled) return sendResponse({ success: false, disabled: true });
      
      const today = getToday();
      
      // Reset sessions if day changed
      let storedSessions = storage.lastDate === today ? storage.todaysSessions : [];
      
      Promise.all([
        fetch("https://alcasar.laplateforme.io:3991/json/status").then(r => r.json()),
        fetch("https://alcasar.laplateforme.io/").then(r => r.text())
      ])
        .then(([statusData, html]) => {
          const currentSessionMinutes = Math.floor((statusData?.accounting?.sessionTime || 0) / 60);
          const alcasarSessions = getTodaysSessions(html);
          
          // Find new sessions from ALCASAR and add them to our permanent list
          for (const alcasarSession of alcasarSessions.slice(1)) { // Skip [0] (current session)
            const exists = storedSessions.some(s => s.title === alcasarSession.title);
            if (!exists) {
              storedSessions.push(alcasarSession);
            }
          }
          
          // Calculate total: all stored sessions + current session
          let totalMinutes = currentSessionMinutes;
          for (const session of storedSessions) {
            totalMinutes += session.minutes;
          }
          
          // Store updated list and date
          chrome.storage.sync.set({
            todaysSessions: storedSessions,
            lastDate: today
          });
          
          sendResponse({ success: true, minutes: totalMinutes });
        })
        .catch(() => sendResponse({ success: false }));
    });
    return true;
  }
});
