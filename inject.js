// Inject script (MAIN world) — patches logtime API responses in-place.
(function () {
  "use strict";

  let sessionMinutes = null;
  let requiredHours = 30; // Default, will be updated from message
  let pendingResponses = []; // Queue of responses waiting for sessionMinutes
  let lastPatchedLogtimeData = null;

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function updateTodayEntry(data, minutes) {
    const t = today();
    for (const e of data) {
      if (e.logtime_day === t) {
        e.logtime_algo2 = minutes;
        return true;
      }
    }
    return false;
  }

  function formatMinutesForDisplay(minutes, existingText = "") {
    const totalMinutes = Math.max(0, Number(minutes) || 0);
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    const current = existingText.trim();

    if (/^\d{1,2}:\d{2}$/.test(current)) {
      return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    }

    if (/min/i.test(current) && !/h/i.test(current)) {
      return `${totalMinutes} min`;
    }

    if (/^\d+h\d{2}$/i.test(current.replace(/\s+/g, ""))) {
      return `${hours}h${String(mins).padStart(2, "0")}`;
    }

    return `${hours} h ${mins} m`;
  }

  function findLogtimeValueElement() {
    const idCandidates = [
      "logtime_day_hours_text",
      "logtime_today_hours_text",
      "logtime_today_text"
    ];

    for (const id of idCandidates) {
      const el = document.getElementById(id);
      if (el) return el;
    }

    const selectorCandidates = [
      "[id*='logtime'][id*='day'][id*='text']",
      "[id*='logtime'][id*='today'][id*='text']"
    ];

    for (const selector of selectorCandidates) {
      const el = document.querySelector(selector);
      if (el) return el;
    }

    const labelNodes = Array.from(
      document.querySelectorAll("span,div,p,strong,label,td,th,h1,h2,h3,h4")
    );
    const label = labelNodes.find((node) =>
      (node.textContent || "").trim().toLowerCase().includes("temps de log")
    );
    if (!label) return null;

    const container = label.closest("section,article,div,td,tr") || label.parentElement;
    if (!container) return null;

    const valueNodes = Array.from(container.querySelectorAll("span,div,p,strong"));
    for (const node of valueNodes) {
      if (node === label || label.contains(node)) continue;

      const text = (node.textContent || "").trim();
      if (/^\d+\s*h(\s*\d+\s*m)?(\s*\d+\s*s)?$/i.test(text) || /^\d{1,2}:\d{2}$/.test(text)) {
        return node;
      }
    }

    return null;
  }

  function updateLiveLogtimeBox() {
    if (sessionMinutes === null) return;

    const target = findLogtimeValueElement();
    if (!target) return;

    target.textContent = formatMinutesForDisplay(sessionMinutes, target.textContent || "");
  }

  function patch(json) {
    try {
      const data = JSON.parse(json);
      updateTodayEntry(data, sessionMinutes);
      lastPatchedLogtimeData = data;
      updateWeeklyTotalDisplay(data);
      updateLeaveTimeOnFriday(data);
      setTimeout(updateLiveLogtimeBox, 0);
      return JSON.stringify(data);
    } catch (err) { 
      return json; 
    }
  }

  function isFriday() {
    return new Date().getDay() === 5;
  }

  function getWeeklyTotalMinutes(data) {
    let totalMinutes = 0;
    for (const entry of data) {
      const algo2 = entry.logtime_algo2 || entry.logtime_algo3 || entry.logtime_algo1 || 0;
      totalMinutes += algo2;
    }
    return totalMinutes;
  }

  function formatCompactHoursMinutes(totalMinutes) {
    const safeMinutes = Math.max(0, Number(totalMinutes) || 0);
    const hours = Math.floor(safeMinutes / 60);
    const mins = String(safeMinutes % 60).padStart(2, "0");
    return `${hours}h${mins}`;
  }

  function updateWeeklyTotalDisplay(data) {
    const totalSpan = document.getElementById("logtime_total_hours_text");
    if (!totalSpan) return;

    const formattedTotal = formatCompactHoursMinutes(getWeeklyTotalMinutes(data));
    const currentText = totalSpan.textContent || "";

    if (/total\s*:/i.test(currentText)) {
      const prefixMatch = currentText.match(/.*?total\s*:\s*/i);
      if (prefixMatch) {
        totalSpan.textContent = `${prefixMatch[0]}${formattedTotal}`;
        return;
      }
    }

    totalSpan.textContent = formattedTotal;
  }

  function calculateLeaveTime(data, hours = 30) {
    const REQUIRED_MINUTES = hours * 60;
    const totalMinutes = getWeeklyTotalMinutes(data);

    const remainingMinutes = REQUIRED_MINUTES - totalMinutes;
    const remainingHours = Math.floor(remainingMinutes / 60);
    const remainingMins = remainingMinutes % 60;
    const remainingMinsText = String(Math.max(0, remainingMins)).padStart(2, "0");

    let leaveTimeText = "";
    if (remainingMinutes <= 0) {
      leaveTimeText = "Tu peux partir!";
    } else {
      const now = new Date();
      const leaveTime = new Date(now.getTime() + remainingMinutes * 60000);
      const hours = String(leaveTime.getHours()).padStart(2, "0");
      const mins = String(leaveTime.getMinutes()).padStart(2, "0");
      leaveTimeText = `Tu peux partir à ${hours}h${mins} (${remainingHours}h${remainingMinsText} restantes)`;
    }

    return leaveTimeText;
  }

  function updateLeaveTimeOnFriday(data) {
    if (!isFriday()) return;
    
    setTimeout(() => {
      const totalSpan = document.getElementById("logtime_total_hours_text");
      if (!totalSpan) return;

      let leaveTimeEl = document.getElementById("logtime_leave_time");
      if (!leaveTimeEl) {
        leaveTimeEl = document.createElement("div");
        leaveTimeEl.id = "logtime_leave_time";
        leaveTimeEl.style.cssText = "margin-top: -8px; text-align: center; font-weight: 500; color: #0066FF; font-size: 13px; letter-spacing: 0.3px;";
        totalSpan.parentNode.insertAdjacentElement("afterend", leaveTimeEl);
      }

      leaveTimeEl.textContent = calculateLeaveTime(data, requiredHours);
    }, 100);
  }

  window.addEventListener("message", (e) => {
    if (e.data?.type === "LOGTIME_EXTENSION_DISABLED") {
      sessionMinutes = null;
      return;
    }

    if (e.data?.type === "LOGTIME_SESSION_MINUTES") {
      sessionMinutes = e.data.minutes;
      requiredHours = e.data.requiredHours || 30;

      if (lastPatchedLogtimeData) {
        updateTodayEntry(lastPatchedLogtimeData, sessionMinutes);
        updateWeeklyTotalDisplay(lastPatchedLogtimeData);
        updateLeaveTimeOnFriday(lastPatchedLogtimeData);
      }

      updateLiveLogtimeBox();
      
      // Process queued responses
      for (const response of pendingResponses) {
        response.resolve(patch(response.text));
      }
      pendingResponses = [];
    }
  });

  // Keep displayed widgets in sync in case the page rerenders.
  setInterval(() => {
    updateLiveLogtimeBox();
    if (lastPatchedLogtimeData) {
      updateWeeklyTotalDisplay(lastPatchedLogtimeData);
      updateLeaveTimeOnFriday(lastPatchedLogtimeData);
    }
  }, 20000);

  // --- XHR intercept ---
  const origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._ltLog = String(url).includes("api.laplateforme.io/logtime");
    return origOpen.call(this, method, url, ...rest);
  };

  const origSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function (...args) {
    if (this._ltLog) {
      this.addEventListener("readystatechange", function () {
        if (this.readyState === 4 && this.status === 200) {
          const originalText = this.responseText;
          const patchedText = sessionMinutes !== null ? patch(originalText) : originalText;
          
          Object.defineProperty(this, "responseText", { get: () => patchedText, configurable: true });
          Object.defineProperty(this, "response", { get: () => patchedText, configurable: true });
        }
      });
    }
    return origSend.apply(this, args);
  };

  // --- Fetch intercept ---
  const origFetch = window.fetch;
  window.fetch = async function (...args) {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || "";
    if (!url.includes("api.laplateforme.io/logtime")) return origFetch.apply(this, args);

    const res = await origFetch.apply(this, args);
    const text = await res.text();
    const patchedText = sessionMinutes !== null ? patch(text) : text;
    
    const headers = new Headers(res.headers);
    return new Response(patchedText, {
      status: res.status,
      statusText: res.statusText,
      headers: headers
    });
  };
})();
