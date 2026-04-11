const KEYS = {
  session: "pn_session",
  sessionStats: "pn_session_stats",
  sessionHistory: "pn_session_history",
  categoryOverrides: "pn_category_overrides"
};

function $(id) {
  return document.getElementById(id);
}

function fmtDuration(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (!ms || ms < 0) return "0s";
  if (m <= 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function fmtTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

function relativeTime(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  const hr = Math.floor(diff / 3600000);
  const day = Math.floor(diff / 86400000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  try {
    return new Date(ts).toLocaleDateString();
  } catch {
    return "—";
  }
}

const CAT_MOODS = [
  { emoji: "😸", label: "On track" },
  { emoji: "😾", label: "A bit over…" },
  { emoji: "🙀", label: "Still here?!" },
  { emoji: "😿", label: "Please stop" },
  { emoji: "😿", label: "I'm begging you" },
];

function getCatMoodStr(elapsedMs, maxTimeMs) {
  const over = elapsedMs - maxTimeMs;
  let mood;
  if (over < 0)           mood = CAT_MOODS[0];
  else if (over < 15 * 60000) mood = CAT_MOODS[1];
  else if (over < 30 * 60000) mood = CAT_MOODS[2];
  else if (over < 45 * 60000) mood = CAT_MOODS[3];
  else                    mood = CAT_MOODS[4];
  return `${mood.emoji} ${mood.label}`;
}

async function getAll() {
  return await chrome.storage.local.get([
    KEYS.session,
    KEYS.sessionStats,
    KEYS.sessionHistory,
    KEYS.categoryOverrides
  ]);
}

function getOverrideForVideoId(overrides, videoId) {
  if (!videoId) return null;
  const v = overrides && typeof overrides === "object" ? overrides[videoId] : null;
  return typeof v === "string" && v ? v : null;
}

function effectiveCategory(overrides, video) {
  const override = getOverrideForVideoId(overrides, video?.videoId);
  if (override) return override;
  return window.PN_Categorize.categorizeTitle(video?.title || "").replace("?", "");
}

async function setCategoryOverride(videoId, categoryOrNull) {
  const { [KEYS.categoryOverrides]: existing } = await chrome.storage.local.get([KEYS.categoryOverrides]);
  const map = existing && typeof existing === "object" ? { ...existing } : {};
  if (!videoId) return;
  if (!categoryOrNull) {
    delete map[videoId];
  } else {
    map[videoId] = categoryOrNull;
  }
  await chrome.storage.local.set({ [KEYS.categoryOverrides]: map });
}

function renderCategoryBoxFromVids(vids) {
  const box = $("categoryBox");
  if (!box) return;
  const arr = Array.isArray(vids) ? vids : [];
  if (arr.length === 0) {
    box.style.display = "none";
    box.innerHTML = "";
    return;
  }

  const totals = { technical: 0, hobby: 0, travel: 0, finance: 0, news: 0, entertainment: 0 };
  arr.forEach((v) => {
    const cat = effectiveCategory(window.__pn_overrides, v);
    totals[cat] = (totals[cat] || 0) + (v.watchMs || 0);
  });

  const order = ["technical", "hobby", "travel", "finance", "news", "entertainment"];
  box.innerHTML = order
    .filter((c) => (totals[c] || 0) > 0)
    .map((c) => {
      const name = c[0].toUpperCase() + c.slice(1);
      return `
        <div class="catRow">
          <div>
            <div class="catName">${name}</div>
            <div class="catMsg">${window.PN_Categorize.funMessage(c, fmtDuration, totals[c])}</div>
          </div>
          <div class="catTime">${fmtDuration(totals[c])}</div>
        </div>
      `;
    })
    .join("");

  box.style.display = box.innerHTML.trim() ? "block" : "none";
}

function renderVideosFromVideoArray(vids) {
  const list = $("videoList");
  const empty = $("emptyVideos");
  list.innerHTML = "";

  if (vids.length === 0) {
    empty.style.display = "block";
    renderCategoryBoxFromVids([]);
    return;
  }
  empty.style.display = "none";
  renderCategoryBoxFromVids(vids);

  vids.slice(0, 12).forEach((v) => {
    const li = document.createElement("li");
    li.className = "item";

    const top = document.createElement("div");
    top.className = "itemTop";

    const title = document.createElement("div");
    title.className = "itemTitle";
    title.textContent = v.title || v.videoId || "Video";
    title.title = v.title || v.videoId || "Video";

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "6px";
    right.style.alignItems = "center";

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = fmtDuration(v.watchMs || 0);

    const inferred = window.PN_Categorize.categorizeTitle(v.title || "").replace("?", "");
    const override = getOverrideForVideoId(window.__pn_overrides, v.videoId);
    const value = override || inferred;

    const sel = document.createElement("select");
    sel.className = "catSelect";
    sel.setAttribute("aria-label", "Category");
    if (override) sel.setAttribute("data-override", "true");
    [
      { id: "technical", label: "Technical" },
      { id: "hobby", label: "Hobby" },
      { id: "travel", label: "Travel" },
      { id: "finance", label: "Finance" },
      { id: "news", label: "News" },
      { id: "entertainment", label: "Entertainment" }
    ].forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    sel.value = value;

    sel.addEventListener("change", async () => {
      await setCategoryOverride(v.videoId, sel.value);
      await render();
    });

    top.appendChild(title);
    right.appendChild(sel);
    right.appendChild(pill);
    top.appendChild(right);

    const sub = document.createElement("div");
    sub.className = "itemSub";

    const left = document.createElement("div");
    left.textContent = `Visits: ${v.visits || 0}`;

    sub.appendChild(left);

    li.appendChild(top);
    li.appendChild(sub);
    list.appendChild(li);
  });
}

function renderVideosFromStats(stats) {
  const videosMap = stats?.videos || {};
  const vids = Object.values(videosMap);

  // Ensure categorization uses only titles: backfill missing titles from nav events (still title-derived).
  const events = Array.isArray(stats?.videoNavEvents) ? stats.videoNavEvents : [];
  const latestTitleById = {};
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const e = events[i];
    if (!e?.videoId) continue;
    const t = String(e.title || "").trim();
    if (t && !latestTitleById[e.videoId]) latestTitleById[e.videoId] = t;
  }
  vids.forEach((v) => {
    if (!v) return;
    if (!String(v.title || "").trim() && v.videoId && latestTitleById[v.videoId]) {
      v.title = latestTitleById[v.videoId];
    }
  });

  vids.sort((a, b) => (b.watchMs || 0) - (a.watchMs || 0));
  renderVideosFromVideoArray(vids);
}

function renderHistory(history) {
  const list = $("historyList");
  const empty = $("emptyHistory");
  list.innerHTML = "";

  const arr = Array.isArray(history) ? history.slice().reverse() : [];
  if (arr.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  arr.slice(0, 10).forEach((h, idx) => {
    const li = document.createElement("li");
    li.className = "item";
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", "View session analytics");

    const top = document.createElement("div");
    top.className = "itemTop";

    const title = document.createElement("div");
    title.className = "itemTitle";
    title.textContent = h.intent ? `“${h.intent}”` : "(no intent)";

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = fmtDuration((h.totalActiveMs || 0) || 0);

    top.appendChild(title);
    top.appendChild(pill);

    const sub = document.createElement("div");
    sub.className = "itemSub";
    sub.textContent = `${relativeTime(h.startTs)} • Videos: ${h.videosWatched || 0}`;
    sub.title = fmtTime(h.startTs);

    li.appendChild(top);
    li.appendChild(sub);
    list.appendChild(li);

    const open = () => {
      // Open in a new tab (extension page) with the selected session.
      const url = chrome.runtime.getURL(`ui/session.html?startTs=${encodeURIComponent(String(h.startTs || ""))}`);
      chrome.tabs.create({ url }).catch(() => {});
    };
    li.addEventListener("click", open);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

async function render() {
  const data = await getAll();
  const session = data[KEYS.session] || null;
  const stats = data[KEYS.sessionStats] || null;
  const history = data[KEYS.sessionHistory] || [];
  window.__pn_overrides = data[KEYS.categoryOverrides] || {};

  window.__pn_view = window.__pn_view || { mode: "current" };
  const view = window.__pn_view;

  const backBtn = $("backToCurrent");
  if (backBtn) {
    backBtn.style.display = view.mode === "history" ? "inline-block" : "none";
  }

  if (view.mode === "history") {
    const arr = Array.isArray(history) ? history.slice().reverse() : [];
    const h = arr[view.indexFromNewest] || null;
    $("intentLabel").textContent = "Past session intent";
    $("status").textContent = h ? "Viewing past session" : "No session selected";
    $("intent").textContent = h?.intent || "—";
    const elapsed = h?.startTs && h?.endTs ? h.endTs - h.startTs : 0;
    $("elapsed").textContent = h ? fmtDuration(elapsed) : "—";
    $("active").textContent = h ? fmtDuration(h.totalActiveMs || 0) : "—";
    $("videosOpened").textContent = h ? String(h.videosWatched || 0) : "—";
    $("uniqueVideos").textContent = h ? String(h.uniqueVideos || 0) : "—";
    renderVideosFromVideoArray(Array.isArray(h?.topVideos) ? h.topVideos : []);
    renderHistory(history);
    return;
  }

  const active = Boolean(session?.active);
  $("intentLabel").textContent = "Current intent";
  $("status").textContent = active ? "Session active" : "No active session";
  $("intent").textContent = active ? (session?.intent || "—") : "—";

  const elapsed = active && session?.startTs ? Date.now() - session.startTs : 0;

  // Cat mood in popup.
  const catEl = $("catMood");
  if (catEl) {
    if (active) {
      const maxTimeMs = session?.maxTimeMs || 20 * 60000;
      catEl.textContent = getCatMoodStr(elapsed, maxTimeMs);
      catEl.style.display = "";
    } else {
      catEl.style.display = "none";
    }
  }
  $("elapsed").textContent = active ? fmtDuration(elapsed) : "—";
  $("active").textContent = active ? fmtDuration(stats?.totalActiveMs || 0) : "—";
  $("videosOpened").textContent = active ? String(stats?.videosWatched || 0) : "—";
  $("uniqueVideos").textContent = active ? String(Object.keys(stats?.videos || {}).length) : "—";
  $("maxTime").textContent = active && session?.maxTimeMs
    ? `${Math.round(session.maxTimeMs / 60000)}m`
    : "—";

  const endBtn = $("endSession");
  if (endBtn) {
    endBtn.disabled = !active;
  }

  renderVideosFromStats(stats);
  renderHistory(history);
}

async function appendSessionHistorySnapshot({ session, stats }) {
  if (!session?.startTs) return;
  const endTs = Date.now();
  const videosMap = stats?.videos || {};
  const videosArr = Object.values(videosMap);
  videosArr.sort((a, b) => (b.watchMs || 0) - (a.watchMs || 0));
  const topVideos = videosArr.slice(0, 12).map((v) => ({
    videoId: v.videoId,
    title: v.title || "",
    watchMs: v.watchMs || 0,
    visits: v.visits || 0
  }));

  const { [KEYS.sessionHistory]: history } = await chrome.storage.local.get([KEYS.sessionHistory]);
  const arr = Array.isArray(history) ? history : [];
  arr.push({
    startTs: session.startTs,
    endTs,
    intent: session.intent || "",
    videosWatched: stats?.videosWatched || 0,
    totalActiveMs: stats?.totalActiveMs || 0,
    uniqueVideos: Object.keys(videosMap).length,
    topVideos,
    maxTimeMs: session.maxTimeMs || 0,
    frictionSkips: stats?.frictionSkips || 0
  });
  await chrome.storage.local.set({ [KEYS.sessionHistory]: arr.slice(-20) });
}

async function endSession() {
  // Prefer closing the active YouTube tab (if present).
  const ytTabs = await chrome.tabs.query({ url: "https://www.youtube.com/*" });
  const activeYt = ytTabs.find((t) => t.active) || ytTabs[0] || null;
  const tabId = activeYt?.id;

  // Save a snapshot to history even if the content script can't run.
  try {
    const data = await getAll();
    const session = data[KEYS.session] || null;
    const stats = data[KEYS.sessionStats] || null;
    if (session?.active) await appendSessionHistorySnapshot({ session, stats });
  } catch {}

  try {
    await chrome.runtime.sendMessage({ type: "PN_END_SESSION_AND_CLOSE_TAB", payload: { tabId } });
  } catch {}

  // Backstop: mark inactive locally, in case the SW is asleep or tabId was null.
  const { [KEYS.session]: session } = await chrome.storage.local.get([KEYS.session]);
  if (session && session.active) {
    await chrome.storage.local.set({ [KEYS.session]: { ...session, active: false, endTs: Date.now() } });
  }
}

async function clearHistory() {
  await chrome.storage.local.set({ [KEYS.sessionHistory]: [] });
}

document.addEventListener("DOMContentLoaded", async () => {
  const backBtn = $("backToCurrent");
  if (backBtn) {
    backBtn.addEventListener("click", async () => {
      window.__pn_view = { mode: "current" };
      await render();
    });
  }

  $("openYoutube").addEventListener("click", async () => {
    await chrome.tabs.create({ url: "https://www.youtube.com/" });
  });

  const viewAnalyticsBtn = $("viewAnalytics");
  if (viewAnalyticsBtn) {
    viewAnalyticsBtn.addEventListener("click", async () => {
      const url = chrome.runtime.getURL("ui/charts.html");
      await chrome.tabs.create({ url });
    });
  }

  const openFull = $("openFull");
  if (openFull) {
    openFull.addEventListener("click", async () => {
      const url = chrome.runtime.getURL("ui/app.html");
      await chrome.tabs.create({ url });
    });
  }

  $("endSession").addEventListener("click", async () => {
    await endSession();
    await render();
  });

  $("clearHistory").addEventListener("click", async () => {
    if (!confirm("Clear all session history? This cannot be undone.")) return;
    await clearHistory();
    await render();
  });

  await render();
  setInterval(() => {
    const anyOpen = document.querySelector(".catSelect:focus");
    if (!anyOpen) render();
  }, 2000);
});

