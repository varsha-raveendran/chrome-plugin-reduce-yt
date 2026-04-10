const KEYS = {
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

function getOverrideForVideoId(overrides, videoId) {
  if (!videoId) return null;
  const v = overrides && typeof overrides === "object" ? overrides[videoId] : null;
  return typeof v === "string" && v ? v : null;
}

function effectiveCategory(overrides, video) {
  const override = getOverrideForVideoId(overrides, video?.videoId);
  if (override) return override;
  return window.PN_Categorize.categorizeTitle(video?.title || "");
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

  const totals = { technical: 0, hobby: 0, travel: 0, entertainment: 0 };
  arr.forEach((v) => {
    const cat = effectiveCategory(window.__pn_overrides, v);
    totals[cat] = (totals[cat] || 0) + (v.watchMs || 0);
  });

  const order = ["technical", "hobby", "travel", "entertainment"];
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

function getParam(name) {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

function renderVideos(topVideos) {
  const list = $("videoList");
  const empty = $("emptyVideos");
  list.innerHTML = "";

  const vids = Array.isArray(topVideos) ? topVideos : [];
  if (vids.length === 0) {
    empty.style.display = "block";
    renderCategoryBoxFromVids([]);
    return;
  }
  empty.style.display = "none";
  renderCategoryBoxFromVids(vids);

  vids.forEach((v) => {
    const li = document.createElement("li");
    li.className = "item";

    const top = document.createElement("div");
    top.className = "itemTop";

    const title = document.createElement("div");
    title.className = "itemTitle";
    title.textContent = v.title || v.videoId || "Video";

    const right = document.createElement("div");
    right.style.display = "flex";
    right.style.gap = "6px";
    right.style.alignItems = "center";

    const pill = document.createElement("div");
    pill.className = "pill";
    pill.textContent = fmtDuration(v.watchMs || 0);

    const sel = document.createElement("select");
    sel.className = "catSelect";
    sel.setAttribute("aria-label", "Category");
    const inferred = window.PN_Categorize.categorizeTitle(v.title || "");
    const override = getOverrideForVideoId(window.__pn_overrides, v.videoId);
    const value = override || inferred;
    [
      { id: "technical", label: "Technical" },
      { id: "hobby", label: "Hobby" },
      { id: "travel", label: "Travel" },
      { id: "entertainment", label: "Entertainment" }
    ].forEach((opt) => {
      const o = document.createElement("option");
      o.value = opt.id;
      o.textContent = opt.label;
      sel.appendChild(o);
    });
    sel.value = value;
    sel.title = override ? "Manually set" : "Inferred from title";

    sel.addEventListener("change", async () => {
      await setCategoryOverride(v.videoId, sel.value);
      // Recompute the category box in-place.
      window.__pn_overrides = (await chrome.storage.local.get([KEYS.categoryOverrides]))[KEYS.categoryOverrides] || {};
      renderVideos(topVideos);
    });

    top.appendChild(title);
    right.appendChild(sel);
    right.appendChild(pill);
    top.appendChild(right);

    const sub = document.createElement("div");
    sub.className = "itemSub";
    sub.textContent = `Visits: ${v.visits || 0}`;

    li.appendChild(top);
    li.appendChild(sub);
    list.appendChild(li);
  });
}

async function main() {
  const startTsStr = getParam("startTs");
  const startTs = startTsStr ? Number(startTsStr) : NaN;

  const { [KEYS.sessionHistory]: history, [KEYS.categoryOverrides]: overrides } = await chrome.storage.local.get([
    KEYS.sessionHistory,
    KEYS.categoryOverrides
  ]);
  const arr = Array.isArray(history) ? history : [];
  window.__pn_overrides = overrides || {};

  const h = Number.isFinite(startTs) ? arr.find((x) => x?.startTs === startTs) : null;
  if (!h) {
    $("status").textContent = "Session not found";
    $("intent").textContent = "—";
    $("elapsed").textContent = "—";
    $("active").textContent = "—";
    $("videosOpened").textContent = "—";
    $("uniqueVideos").textContent = "—";
    renderVideos([]);
    return;
  }

  $("status").textContent = "Viewing past session";
  $("intent").textContent = h.intent || "—";
  const elapsed = h.endTs && h.startTs ? h.endTs - h.startTs : 0;
  $("elapsed").textContent = fmtDuration(elapsed);
  $("active").textContent = fmtDuration(h.totalActiveMs || 0);
  $("videosOpened").textContent = String(h.videosWatched || 0);
  $("uniqueVideos").textContent = String(h.uniqueVideos || 0);
  renderVideos(h.topVideos || []);
}

document.addEventListener("DOMContentLoaded", () => {
  main().catch(() => {
    $("status").textContent = "Failed to load";
  });
});

