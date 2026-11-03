/*
 * Airest status page: shows when the last successful "Uptime CI" check finished.
 *
 * Loaded through the official `status-website.scripts` key of .upptimerc.yml and
 * served from the site root (Upptime copies assets/* there when it builds the site).
 * It reads the public GitHub Actions API for this repository; no token is used.
 * If the time cannot be read, or the last successful check is old, the page says so.
 * Tests: node --test tests/last-check.test.js
 */
(function () {
  var API_URL =
    "https://api.github.com/repos/airestinc-a11y/status/actions/workflows/uptime.yml/runs?status=success&per_page=1";
  var STALE_MINUTES = 15; // three missed 5-minute cycles
  var REFRESH_MS = 5 * 60 * 1000; // re-read the API
  var REPAINT_MS = 30 * 1000; // update "N minutes ago"

  // payload from the runs API -> ISO time of the newest successful run, or null
  function parseLastCheck(payload) {
    if (!payload || !payload.workflow_runs || !payload.workflow_runs.length) return null;
    var run = payload.workflow_runs[0];
    if (!run || !run.updated_at) return null;
    return isNaN(Date.parse(run.updated_at)) ? null : run.updated_at;
  }

  function formatUtc(iso) {
    var s = new Date(iso).toISOString();
    return s.slice(0, 10) + " " + s.slice(11, 16) + " UTC";
  }

  function ago(minutes) {
    if (minutes < 1) return "less than a minute ago";
    if (minutes === 1) return "1 minute ago";
    if (minutes < 60) return minutes + " minutes ago";
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return hours === 1 ? "1 hour ago" : hours + " hours ago";
    var days = Math.floor(hours / 24);
    return days === 1 ? "1 day ago" : days + " days ago";
  }

  // iso (or null) + current time in ms -> { state: ok | stale | unknown, text }
  function describe(iso, nowMs) {
    if (!iso) {
      return {
        state: "unknown",
        text: "The time of the last check could not be read. Reload the page to try again.",
      };
    }
    var minutes = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 60000));
    if (minutes <= STALE_MINUTES) {
      return {
        state: "ok",
        text: "Last successful check: " + ago(minutes) + " (" + formatUtc(iso) + ").",
      };
    }
    return {
      state: "stale",
      text:
        "No successful check since " +
        formatUtc(iso) +
        " (" +
        ago(minutes) +
        "). The statuses below may be out of date.",
    };
  }

  // fetchFn is window.fetch (or a stub in tests); resolves to an ISO time or null, never rejects
  function load(fetchFn) {
    if (typeof fetchFn !== "function") return Promise.resolve(null);
    return Promise.resolve()
      .then(function () {
        return fetchFn(API_URL, { headers: { Accept: "application/vnd.github+json" } });
      })
      .then(function (res) {
        if (!res || !res.ok) return null;
        return res.json().then(parseLastCheck);
      })
      .catch(function () {
        return null;
      });
  }

  var CSS =
    "#airest-last-check{box-sizing:border-box;padding:.5rem 1rem;text-align:center;font-size:.9rem;" +
    "background:var(--card-background-color,#fff);color:var(--body-text-color,#002626);" +
    "border-bottom:1px solid var(--card-border-color,#d8e8e4)}" +
    "#airest-last-check.stale{background:var(--down-background-color,#ffd0d2);" +
    "border-bottom-color:var(--down-border-left-color,#eb3b5a)}" +
    "#airest-last-check.unknown{border-bottom-color:var(--degraded-border-left-color,#f7b731)}";

  function start(doc, win) {
    var style = doc.createElement("style");
    style.textContent = CSS;
    doc.head.appendChild(style);

    // Outside #sapper on purpose: the page framework owns everything inside it and would remove foreign nodes.
    var el = doc.createElement("div");
    el.id = "airest-last-check";
    el.className = "unknown";
    el.setAttribute("role", "status");
    el.textContent = "Reading the time of the last check…";
    doc.body.insertBefore(el, doc.getElementById("sapper") || doc.body.firstChild);

    var last = null; // keep the last good value if a later read fails: it then ages into "stale"
    function paint() {
      var d = describe(last, Date.now());
      el.className = d.state;
      el.textContent = d.text;
    }
    function refresh() {
      load(win.fetch && win.fetch.bind(win)).then(function (iso) {
        if (iso) last = iso;
        paint();
      });
    }
    refresh();
    win.setInterval(refresh, REFRESH_MS);
    win.setInterval(paint, REPAINT_MS);
  }

  var api = {
    API_URL: API_URL,
    STALE_MINUTES: STALE_MINUTES,
    parseLastCheck: parseLastCheck,
    formatUtc: formatUtc,
    describe: describe,
    load: load,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;

  if (typeof window !== "undefined" && typeof document !== "undefined") {
    var go = function () {
      start(document, window);
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
    else go();
  }
})();
