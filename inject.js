// Inject script (MAIN world) — patches logtime API responses in-place.
(function () {
  "use strict";

  let sessionMinutes = null;
  let sessionSeconds = null;
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

  function toDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "";

    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }

  function normalizeLabelToDateKey(label) {
    if (label === null || label === undefined) return "";

    if (label instanceof Date) return toDateKey(label);

    if (typeof label === "number") {
      const keyFromTimestamp = toDateKey(label);
      return keyFromTimestamp;
    }

    const text = String(label).trim();
    if (!text) return "";

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

    const slashDate = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
    if (slashDate) {
      const day = slashDate[1].padStart(2, "0");
      const month = slashDate[2].padStart(2, "0");
      const year = slashDate[3]
        ? (slashDate[3].length === 2 ? `20${slashDate[3]}` : slashDate[3])
        : String(new Date().getFullYear());
      return `${year}-${month}-${day}`;
    }

    const parsedKey = toDateKey(text);
    return parsedKey;
  }

  function findTodayIndex(labels) {
    if (!Array.isArray(labels) || labels.length === 0) return -1;

    const todayKey = today();
    for (let i = 0; i < labels.length; i += 1) {
      if (normalizeLabelToDateKey(labels[i]) === todayKey) {
        return i;
      }
    }

    return -1;
  }

  function updatePointValue(data, index, value) {
    if (!Array.isArray(data) || index < 0 || index >= data.length) return false;

    const currentPoint = data[index];
    if (typeof currentPoint === "number") {
      data[index] = value;
      return true;
    }

    if (currentPoint === null || currentPoint === undefined) {
      data[index] = value;
      return true;
    }

    if (currentPoint && typeof currentPoint === "object") {
      if ("y" in currentPoint) {
        currentPoint.y = value;
        return true;
      }

      if ("value" in currentPoint) {
        currentPoint.value = value;
        return true;
      }
    }

    return false;
  }

  function updatePointByDateField(data, value) {
    if (!Array.isArray(data) || !data.length) return false;

    const todayKey = today();
    let changed = false;

    for (const point of data) {
      if (!point || typeof point !== "object") continue;
      if (!Object.prototype.hasOwnProperty.call(point, "x")) continue;

      if (normalizeLabelToDateKey(point.x) !== todayKey) continue;

      if ("y" in point) {
        point.y = value;
      } else if ("value" in point) {
        point.value = value;
      } else {
        point.y = value;
      }

      changed = true;
    }

    return changed;
  }

  function getChartJsInstances() {
    const Chart = window.Chart;
    if (!Chart) return [];

    const instances = Chart.instances;
    if (!instances) return [];

    if (Array.isArray(instances)) {
      return instances.filter(Boolean);
    }

    if (typeof instances.values === "function") {
      return Array.from(instances.values()).filter(Boolean);
    }

    if (typeof instances === "object") {
      return Object.values(instances).filter(Boolean);
    }

    return [];
  }

  function updateChartJsLiveGraph(hoursToday) {
    let updatedAny = false;

    for (const chart of getChartJsInstances()) {
      const labels = chart?.data?.labels;
      const index = findTodayIndex(labels);

      const datasets = Array.isArray(chart?.data?.datasets) ? chart.data.datasets : [];
      let updatedThisChart = false;

      for (const dataset of datasets) {
        const updatedByIndex = index >= 0 && updatePointValue(dataset?.data, index, hoursToday);
        const updatedByDateField = !updatedByIndex && updatePointByDateField(dataset?.data, hoursToday);
        if (updatedByIndex || updatedByDateField) {
          updatedThisChart = true;
        }
      }

      if (updatedThisChart && typeof chart.update === "function") {
        try {
          chart.update("none");
        } catch (err) {
          chart.update();
        }
        updatedAny = true;
      }
    }

    return updatedAny;
  }

  function getApexChartInstances() {
    const apexGlobal = window.Apex;
    if (!apexGlobal || !Array.isArray(apexGlobal._chartInstances)) return [];

    const instances = [];
    for (const entry of apexGlobal._chartInstances) {
      const chart = entry?.chart || entry;
      if (chart) instances.push(chart);
    }

    return instances;
  }

  function updateApexLiveGraph(hoursToday) {
    let updatedAny = false;

    for (const chart of getApexChartInstances()) {
      const labels = chart?.w?.globals?.labels || chart?.w?.config?.xaxis?.categories;
      const index = findTodayIndex(labels);

      const currentSeries = Array.isArray(chart?.w?.config?.series) ? chart.w.config.series : [];
      if (!currentSeries.length || typeof chart.updateSeries !== "function") continue;

      let changed = false;
      const nextSeries = currentSeries.map((seriesItem) => {
        const data = Array.isArray(seriesItem?.data) ? seriesItem.data.slice() : null;
        if (!data) return seriesItem;

        const updatedByIndex = index >= 0 && updatePointValue(data, index, hoursToday);
        const updatedByDateField = !updatedByIndex && updatePointByDateField(data, hoursToday);
        if (!updatedByIndex && !updatedByDateField) return seriesItem;

        changed = true;
        return { ...seriesItem, data };
      });

      if (changed) {
        chart.updateSeries(nextSeries, false);
        updatedAny = true;
      }
    }

    return updatedAny;
  }

  function updateLiveGraph() {
    if (sessionSeconds === null) return;

    const hoursToday = Math.max(0, Number(sessionSeconds) || 0) / 3600;
    updateChartJsLiveGraph(hoursToday);
    updateApexLiveGraph(hoursToday);
  }

  function patch(json) {
    try {
      const data = JSON.parse(json);
      updateTodayEntry(data, sessionMinutes);
      lastPatchedLogtimeData = data;
      updateWeeklyTotalDisplay(data);
      updateLeaveTimeOnFriday(data);
      setTimeout(updateLiveLogtimeBox, 0);
      setTimeout(updateLiveGraph, 0);
      return JSON.stringify(data);
    } catch (err) { 
      return json; 
    }
  }

  function isFriday() {
    return new Date().getDay() === 5;
  }

  function getWeeklyTotalMinutes(data, usePreciseToday = false) {
    const t = today();
    let totalMinutes = 0;
    for (const entry of data) {
      if (usePreciseToday && sessionSeconds !== null && entry.logtime_day === t) {
        totalMinutes += sessionSeconds / 60;
        continue;
      }

      const algo2 = entry.logtime_algo2 || entry.logtime_algo3 || entry.logtime_algo1 || 0;
      totalMinutes += algo2;
    }
    return totalMinutes;
  }

  function formatCompactHoursMinutes(totalMinutes) {
    const safeMinutes = Math.max(0, Math.floor(Number(totalMinutes) || 0));
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
    const totalMinutes = getWeeklyTotalMinutes(data, true);

    const remainingSeconds = Math.max(0, Math.round((REQUIRED_MINUTES - totalMinutes) * 60));
    const remainingMinutesRoundedUp = Math.ceil(remainingSeconds / 60);
    const remainingHours = Math.floor(remainingMinutesRoundedUp / 60);
    const remainingMins = remainingMinutesRoundedUp % 60;
    const remainingMinsText = String(Math.max(0, remainingMins)).padStart(2, "0");

    let leaveTimeText = "";
    if (remainingSeconds <= 0) {
      leaveTimeText = "Tu peux partir!";
    } else {
      const now = new Date();
      const leaveTime = new Date(now.getTime() + remainingSeconds * 1000);
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
      sessionSeconds = null;
      return;
    }

    if (e.data?.type === "LOGTIME_SESSION_MINUTES") {
      sessionSeconds = Number.isFinite(e.data.seconds)
        ? Math.max(0, Number(e.data.seconds))
        : Math.max(0, Number(e.data.minutes) || 0) * 60;
      sessionMinutes = Math.floor(sessionSeconds / 60);
      requiredHours = e.data.requiredHours || 30;

      if (lastPatchedLogtimeData) {
        updateTodayEntry(lastPatchedLogtimeData, sessionMinutes);
        updateWeeklyTotalDisplay(lastPatchedLogtimeData);
        updateLeaveTimeOnFriday(lastPatchedLogtimeData);
      }

      updateLiveLogtimeBox();
      updateLiveGraph();
      
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
    updateLiveGraph();
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
