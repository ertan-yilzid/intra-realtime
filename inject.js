// Inject script (MAIN world) — patches logtime API responses in-place.
(function () {
  "use strict";

  let sessionMinutes = null;

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function patch(json) {
    if (sessionMinutes == null) return json;
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
      return JSON.stringify(data);
    } catch { return json; }
  }

  window.addEventListener("message", (e) => {
    if (e.data?.type === "LOGTIME_SESSION_MINUTES") {
      sessionMinutes = e.data.minutes;
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
          const patched = patch(this.responseText);
          Object.defineProperty(this, "responseText", { get: () => patched, configurable: true });
          Object.defineProperty(this, "response", { get: () => patched, configurable: true });
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
    return new Response(patch(text), { status: res.status, statusText: res.statusText, headers: res.headers });
  };
})();
