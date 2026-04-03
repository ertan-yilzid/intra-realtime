// Inject script (MAIN world) — patches logtime API responses in-place.
(function () {
  "use strict";

  let sessionMinutes = null;
  let requiredHours = 30; // Default, will be updated from message
  let pendingResponses = []; // Queue of responses waiting for sessionMinutes

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function patch(json) {
    console.log(`[Inject] patch() called, sessionMinutes=${sessionMinutes}, json length=${json.length}`);
    try {
      const data = JSON.parse(json);
      const t = today();
      for (const e of data) {
        if (e.logtime_day === t) {
          e.logtime_algo2 = sessionMinutes;
          console.log(`[Logtime] ${t} → ${sessionMinutes} min`);
          break;
        }
      }
      updateLeaveTimeOnFriday(data);
      return JSON.stringify(data);
    } catch (err) { 
      console.log(`[Inject] patch() error:`, err);
      return json; 
    }
  }

  function isFriday() {
    return new Date().getDay() === 5;
  }

  function calculateLeaveTime(data, hours = 30) {
    const REQUIRED_MINUTES = hours * 60;
    let totalMinutes = 0;

    // Sum all logged time
    for (const entry of data) {
      const algo2 = entry.logtime_algo2 || entry.logtime_algo3 || entry.logtime_algo1 || 0;
      totalMinutes += algo2;
    }

    const remainingMinutes = REQUIRED_MINUTES - totalMinutes;
    const remainingHours = Math.floor(remainingMinutes / 60);
    const remainingMins = remainingMinutes % 60;

    let leaveTimeText = "";
    if (remainingMinutes <= 0) {
      leaveTimeText = "Tu peux partir!";
    } else {
      const now = new Date();
      const leaveTime = new Date(now.getTime() + remainingMinutes * 60000);
      const hours = String(leaveTime.getHours()).padStart(2, "0");
      const mins = String(leaveTime.getMinutes()).padStart(2, "0");
      leaveTimeText = `Tu peux partir à ${hours}h${mins} (${remainingHours}h${remainingMins} restantes)`;
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
    if (e.data?.type === "LOGTIME_SESSION_MINUTES") {
      sessionMinutes = e.data.minutes;
      requiredHours = e.data.requiredHours || 30;
      
      // Process queued responses
      for (const response of pendingResponses) {
        response.resolve(patch(response.text));
      }
      pendingResponses = [];
    }
  });

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
