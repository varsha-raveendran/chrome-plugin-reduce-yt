// ── constants ──────────────────────────────────────────────────────────────────
const KEYS = {
  sessionHistory: "pn_session_history",
  categoryOverrides: "pn_category_overrides"
};

const CAT_COLORS = {
  technical:     "#6ea8fe",
  hobby:         "#a78bfa",
  travel:        "#34d399",
  finance:       "#fbbf24",
  news:          "#f472b6",
  entertainment: "#fb923c"
};

const CAT_ORDER = ["technical", "hobby", "travel", "finance", "news", "entertainment"];

const GRID_COLOR  = "rgba(242,244,248,0.08)";
const TEXT_COLOR  = "rgba(242,244,248,0.65)";
const BAR_DEFAULT = "#6ea8fe";

// ── helpers ────────────────────────────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

function fmtDuration(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (!ms || ms < 0) return "0s";
  if (m <= 0) return `${s}s`;
  if (s === 0) return `${m}m`;
  return `${m}m ${s}s`;
}

function fmtMs(ms) {
  // Compact: show hours if ≥ 60 min, else minutes.
  const h = ms / 3600000;
  const m = ms / 60000;
  if (h >= 1) return `${h.toFixed(1)}h`;
  if (m >= 1) return `${m.toFixed(0)}m`;
  return `${Math.round(ms / 1000)}s`;
}

function effectiveCategory(overrides, video) {
  const vid = video?.videoId;
  const override = vid && overrides?.[vid];
  if (typeof override === "string" && override) return override;
  return window.PN_Categorize.categorizeTitle(video?.title || "").replace("?", "");
}

// ── data loading ───────────────────────────────────────────────────────────────
async function loadData() {
  const data = await chrome.storage.local.get([KEYS.sessionHistory, KEYS.categoryOverrides]);
  const history  = Array.isArray(data[KEYS.sessionHistory]) ? data[KEYS.sessionHistory] : [];
  const overrides = data[KEYS.categoryOverrides] || {};
  return { history, overrides };
}

// ── canvas chart primitives ────────────────────────────────────────────────────
function setupCanvas(canvas) {
  const rect = canvas.parentElement.getBoundingClientRect();
  const dpr  = window.devicePixelRatio || 1;
  const w    = rect.width || 600;
  const h    = parseInt(canvas.getAttribute("height"), 10) || 220;
  canvas.width  = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width  = `${w}px`;
  canvas.style.height = `${h}px`;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/**
 * Draws a bar chart.
 * datasets: array of { data: number[], color: string|string[] }
 *   - If color is a string, all bars in that dataset share the same color.
 *   - If color is an array, each bar gets its own color.
 *   - Per-bar colors: pass barColors:[...] as a top-level option alongside datasets
 */
function drawBarChart(canvas, { labels, datasets, barColors, yFmt }) {
  const { ctx, w, h } = setupCanvas(canvas);

  const padL = 54, padR = 16, padT = 14, padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;

  const allValues = datasets.flatMap((d) => d.data);
  const maxVal = Math.max(...allValues, 1);

  // Grid lines
  const gridCount = 4;
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth   = 1;
  ctx.fillStyle   = TEXT_COLOR;
  ctx.font        = "10px system-ui, sans-serif";
  ctx.textAlign   = "right";
  for (let i = 0; i <= gridCount; i++) {
    const v = (maxVal * i) / gridCount;
    const y = padT + plotH - (plotH * i) / gridCount;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillText((yFmt || fmtMs)(v), padL - 4, y + 3);
  }

  const n        = labels.length;
  const dsCount  = datasets.length;
  const groupGap = Math.max(4, Math.floor(plotW * 0.04));
  const barGap   = 2;
  const groupW   = n > 0 ? (plotW - groupGap * (n - 1)) / n : plotW;
  const barW     = dsCount > 0 ? Math.max(2, (groupW - barGap * (dsCount - 1)) / dsCount) : groupW;

  datasets.forEach((ds, di) => {
    ds.data.forEach((val, i) => {
      const barH   = (val / maxVal) * plotH;
      const groupX = padL + i * (groupW + groupGap);
      const x      = groupX + di * (barW + barGap);
      const y      = padT + plotH - barH;
      const r      = Math.min(4, barW / 2);
      // Per-bar color (top-level barColors), dataset color, or default
      const barColor = Array.isArray(barColors) ? (barColors[i] || BAR_DEFAULT)
                      : (ds.color || BAR_DEFAULT);
      ctx.fillStyle = barColor;
      roundedRect(ctx, x, y, barW, barH, r);
      ctx.fill();
    });
  });

  // X labels
  ctx.fillStyle  = TEXT_COLOR;
  ctx.textAlign  = "center";
  ctx.font       = "10px system-ui, sans-serif";
  labels.forEach((lbl, i) => {
    const groupX   = padL + i * (groupW + groupGap);
    const centerX  = groupX + groupW / 2;
    ctx.fillText(lbl, centerX, h - padB + 14);
  });
}

/**
 * Draws a line chart.
 */
function drawLineChart(canvas, { labels, values, color, yFmt }) {
  const { ctx, w, h } = setupCanvas(canvas);

  const padL = 54, padR = 16, padT = 14, padB = 36;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const maxVal = Math.max(...values, 1);

  // Grid
  const gridCount = 4;
  ctx.strokeStyle = GRID_COLOR;
  ctx.lineWidth   = 1;
  ctx.fillStyle   = TEXT_COLOR;
  ctx.font        = "10px system-ui, sans-serif";
  ctx.textAlign   = "right";
  for (let i = 0; i <= gridCount; i++) {
    const v = (maxVal * i) / gridCount;
    const y = padT + plotH - (plotH * i) / gridCount;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
    ctx.fillText((yFmt || fmtMs)(v), padL - 4, y + 3);
  }

  if (values.length < 2) {
    // fallback to bars for single-point
    drawBarChart(canvas, { labels, datasets: [{ data: values, color: color || BAR_DEFAULT }], yFmt });
    return;
  }

  const n = values.length;
  const xStep = plotW / (n - 1);

  // Gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, (color || BAR_DEFAULT) + "28");
  grad.addColorStop(1, (color || BAR_DEFAULT) + "00");

  ctx.beginPath();
  values.forEach((val, i) => {
    const x = padL + i * xStep;
    const y = padT + plotH - (val / maxVal) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  // Close area
  ctx.lineTo(padL + (n - 1) * xStep, padT + plotH);
  ctx.lineTo(padL, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.strokeStyle = color || BAR_DEFAULT;
  ctx.lineWidth   = 2;
  values.forEach((val, i) => {
    const x = padL + i * xStep;
    const y = padT + plotH - (val / maxVal) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  ctx.fillStyle = color || BAR_DEFAULT;
  values.forEach((val, i) => {
    const x = padL + i * xStep;
    const y = padT + plotH - (val / maxVal) * plotH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  });

  // X labels — thin them out if too many
  ctx.fillStyle  = TEXT_COLOR;
  ctx.textAlign  = "center";
  ctx.font       = "10px system-ui, sans-serif";
  const step = Math.max(1, Math.ceil(n / 12));
  labels.forEach((lbl, i) => {
    if (i % step !== 0 && i !== n - 1) return;
    const x = padL + i * xStep;
    ctx.fillText(lbl, x, h - padB + 14);
  });
}

function roundedRect(ctx, x, y, w, h, r) {
  if (h <= 0) return;
  r = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function showEmpty(canvas, msg) {
  const { ctx, w, h } = setupCanvas(canvas);
  ctx.fillStyle = TEXT_COLOR;
  ctx.font      = "13px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(msg || "Not enough data yet.", w / 2, h / 2);
}

// ── data aggregation ───────────────────────────────────────────────────────────

/**
 * Per-session category ms from topVideos.
 * Returns { technical, hobby, travel, entertainment } totals for one session.
 */
function sessionCategoryTotals(session, overrides) {
  const totals = { technical: 0, hobby: 0, travel: 0, finance: 0, news: 0, entertainment: 0 };
  const vids = Array.isArray(session.topVideos) ? session.topVideos : [];
  for (const v of vids) {
    const cat = effectiveCategory(overrides, v);
    const key = CAT_ORDER.includes(cat) ? cat : "entertainment";
    totals[key] += v.watchMs || 0;
  }
  return totals;
}

/** Average ms per category across all sessions. */
function computeCategoryAverages(history, overrides) {
  if (history.length === 0) return null;
  const sums = { technical: 0, hobby: 0, travel: 0, finance: 0, news: 0, entertainment: 0 };
  for (const h of history) {
    const t = sessionCategoryTotals(h, overrides);
    for (const c of CAT_ORDER) sums[c] += t[c];
  }
  const avgs = {};
  for (const c of CAT_ORDER) avgs[c] = sums[c] / history.length;
  return avgs;
}

/** Sessions bucketed by hour of day (0-23). Returns array[24] of session counts. */
function computeTimeOfDay(history) {
  const counts = new Array(24).fill(0);
  for (const h of history) {
    if (!h.startTs) continue;
    const hour = new Date(h.startTs).getHours();
    counts[hour]++;
  }
  return counts;
}

/** ISO date string "YYYY-MM-DD" */
function isoDay(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** ISO week key "YYYY-Www" */
function isoWeek(ts) {
  const d = new Date(ts);
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const dayNum = Math.round((d - jan4) / 86400000);
  const weekNum = Math.ceil((dayNum + jan4.getDay() + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, "0")}`;
}

/** "YYYY-MM" */
function isoMonth(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY" */
function isoYear(ts) {
  return String(new Date(ts).getFullYear());
}

const PERIOD_KEY_FN = {
  daily:   isoDay,
  weekly:  isoWeek,
  monthly: isoMonth,
  yearly:  isoYear
};

/**
 * Aggregate totalActiveMs per period bucket.
 * Returns { labels: string[], values: number[] } sorted chronologically.
 */
function computePeriodAggregates(history, period) {
  const keyFn = PERIOD_KEY_FN[period] || isoDay;
  const map = {};
  for (const h of history) {
    if (!h.startTs) continue;
    const k = keyFn(h.startTs);
    map[k] = (map[k] || 0) + (h.totalActiveMs || 0);
  }
  const keys = Object.keys(map).sort();
  return { labels: keys.map(shortLabel), values: keys.map((k) => map[k]) };
}

function shortLabel(key) {
  // "2024-01-15" → "Jan 15", "2024-W03" → "W03", "2024-01" → "Jan '24", "2024" → "2024"
  if (/^\d{4}-W\d{2}$/.test(key)) return key.replace(/^\d{4}-/, "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const d = new Date(key + "T00:00:00");
    return d.toLocaleDateString("en", { month: "short", day: "numeric" });
  }
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, 1);
    return d.toLocaleDateString("en", { month: "short", year: "2-digit" });
  }
  return key;
}

const WORD_STOPWORDS = new Set([
  "the","a","an","of","to","in","on","at","is","it","i","and","or","for",
  "with","how","why","what","my","you","your","me","this","that","was","are",
  "be","been","by","from","as","we","he","she","they","do","did","not","no",
  "but","so","if","its","just","get","all","new","one","two","can","will","up"
]);

/**
 * Word frequency from video titles across all sessions.
 * Returns [{ word, count }] sorted descending, top 40.
 */
function computeWordFrequency(history) {
  const freq = {};
  for (const h of history) {
    const vids = Array.isArray(h.topVideos) ? h.topVideos : [];
    for (const v of vids) {
      const words = (v.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !WORD_STOPWORDS.has(w));
      for (const w of words) freq[w] = (freq[w] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);
}

/**
 * Word frequency from friction reasons across all sessions.
 * Returns [{ word, count }] sorted descending, top 40.
 */
function computeReasonWordFrequency(history) {
  const freq = {};
  for (const h of history) {
    const reasons = Array.isArray(h.frictionReasons) ? h.frictionReasons : [];
    for (const reason of reasons) {
      const words = reason
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !WORD_STOPWORDS.has(w));
      for (const w of words) freq[w] = (freq[w] || 0) + 1;
    }
  }
  return Object.entries(freq)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 40);
}

/**
 * Session counts bucketed by day-of-week (0=Sun) × hour (0–23).
 * Returns number[7][24].
 */
function computeHeatmap(history) {
  const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const h of history) {
    if (!h.startTs) continue;
    const d = new Date(h.startTs);
    grid[d.getDay()][d.getHours()]++;
  }
  return grid;
}

/**
 * Per-session intent adherence (%).
 * For each session, fraction of topVideos whose title contains at least one
 * non-trivial word from the session intent string.
 * Returns { labels: string[], values: number[] } — values are 0–100.
 */
function computeIntentAdherence(history) {
  const labels = [];
  const values = [];
  for (const h of history) {
    if (!h.startTs) continue;
    labels.push(shortLabel(isoDay(h.startTs)));
    const vids = Array.isArray(h.topVideos) ? h.topVideos : [];
    if (vids.length === 0 || !h.intent) { values.push(0); continue; }
    const intentWords = (h.intent || "")
      .toLowerCase()
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2);
    if (intentWords.length === 0) { values.push(0); continue; }
    let matched = 0;
    for (const v of vids) {
      const t = (v.title || "").toLowerCase();
      if (intentWords.some((w) => t.includes(w))) matched++;
    }
    values.push(Math.round((matched / vids.length) * 100));
  }
  return { labels, values };
}

// ── rendering ──────────────────────────────────────────────────────────────────

function renderHeatmapChart(history) {
  const canvas = $("heatmapChart");
  if (!canvas) return;
  if (history.length === 0) { showEmpty(canvas, "No session data yet."); return; }

  const grid = computeHeatmap(history);
  const maxCount = Math.max(...grid.flat(), 1);

  const { ctx, w, h } = setupCanvas(canvas);

  const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const padL = 36, padR = 8, padT = 18, padB = 20;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const cellW = plotW / 24;
  const cellH = plotH / 7;

  // Draw cells
  for (let day = 0; day < 7; day++) {
    for (let hour = 0; hour < 24; hour++) {
      const count = grid[day][hour];
      const alpha = count === 0 ? 0.06 : 0.15 + (count / maxCount) * 0.85;
      ctx.fillStyle = `rgba(110,168,254,${alpha.toFixed(2)})`;
      const x = padL + hour * cellW;
      const y = padT + day * cellH;
      ctx.fillRect(x + 1, y + 1, cellW - 2, cellH - 2);
    }
  }

  // Row labels (day names)
  ctx.fillStyle = TEXT_COLOR;
  ctx.font = "10px system-ui, sans-serif";
  ctx.textAlign = "right";
  for (let day = 0; day < 7; day++) {
    const y = padT + day * cellH + cellH / 2 + 3;
    ctx.fillText(DAY_LABELS[day], padL - 4, y);
  }

  // Column labels — every 3 hours
  ctx.textAlign = "center";
  for (let hour = 0; hour < 24; hour += 3) {
    let lbl;
    if (hour === 0)  lbl = "12a";
    else if (hour === 12) lbl = "12p";
    else if (hour < 12)   lbl = `${hour}a`;
    else                   lbl = `${hour - 12}p`;
    const x = padL + hour * cellW + cellW / 2;
    ctx.fillText(lbl, x, padT - 4);
    ctx.fillText(lbl, x, padT + plotH + 13);
  }
}

function renderWordCloud(history) {
  const canvas = $("wordCloudChart");
  if (!canvas) return;
  if (history.length === 0) { showEmpty(canvas, "No session data yet."); return; }
  const words = computeWordFrequency(history);
  if (words.length === 0) { showEmpty(canvas, "No video titles recorded yet."); return; }

  const { ctx, w, h } = setupCanvas(canvas);

  const maxCount = words[0].count;
  const minSize = 11, maxSize = 32;
  const palette = Object.values(CAT_COLORS);

  const pad = 12;
  let x = pad, y = pad + maxSize;

  words.forEach(({ word, count }, i) => {
    const size = Math.round(minSize + ((count / maxCount) * (maxSize - minSize)));
    ctx.font = `${size}px system-ui, sans-serif`;
    const tw = ctx.measureText(word).width;

    if (x + tw + pad > w) {
      x = pad;
      y += size + 8;
    }
    if (y > h) return; // clip if canvas full

    ctx.fillStyle = palette[i % palette.length];
    ctx.fillText(word, x, y);
    x += tw + 10;
  });
}

function renderReasonWordCloud(history) {
  const canvas = $("reasonWordCloudChart");
  if (!canvas) return;
  const words = computeReasonWordFrequency(history);
  if (words.length === 0) { showEmpty(canvas, "No friction reasons recorded yet."); return; }

  const { ctx, w, h } = setupCanvas(canvas);

  const maxCount = words[0].count;
  const minSize = 11, maxSize = 32;
  const palette = Object.values(CAT_COLORS);

  const pad = 12;
  let x = pad, y = pad + maxSize;

  words.forEach(({ word, count }, i) => {
    const size = Math.round(minSize + ((count / maxCount) * (maxSize - minSize)));
    ctx.font = `${size}px system-ui, sans-serif`;
    const tw = ctx.measureText(word).width;

    if (x + tw + pad > w) {
      x = pad;
      y += size + 8;
    }
    if (y > h) return;

    ctx.fillStyle = palette[i % palette.length];
    ctx.fillText(word, x, y);
    x += tw + 10;
  });
}

function renderWatchVsIntendedChart(history) {
  const canvas = $("watchVsIntendedChart");
  if (!canvas) return;
  const sessions = history.filter((h) => h.maxTimeMs > 0).slice(-10);
  if (sessions.length === 0) { showEmpty(canvas, "No sessions with a time limit set yet."); return; }
  const labels  = sessions.map((h) => shortLabel(isoDay(h.startTs)));
  const actual   = sessions.map((h) => h.totalActiveMs || 0);
  const intended = sessions.map((h) => h.maxTimeMs || 0);
  drawBarChart(canvas, {
    labels,
    datasets: [
      { data: actual,   color: "#6ea8fe" },
      { data: intended, color: "rgba(242,244,248,0.18)" }
    ]
  });
}

function renderSkipRateTrendChart(history) {
  const canvas = $("skipRateTrendChart");
  if (!canvas) return;
  if (history.length === 0) { showEmpty(canvas, "No session data yet."); return; }
  const labels = history.map((h) => shortLabel(isoDay(h.startTs)));
  const values = history.map((h) => h.frictionSkips || 0);
  if (values.every((v) => v === 0)) {
    showEmpty(canvas, "No friction skips recorded yet.");
    return;
  }
  drawLineChart(canvas, {
    labels,
    values,
    color: "#f472b6",
    yFmt: (v) => Math.round(v).toString()
  });
}

function renderIntentAdherenceChart(history) {
  const canvas = $("intentAdherenceChart");
  if (!canvas) return;
  if (history.length === 0) { showEmpty(canvas, "No session data yet."); return; }
  const { labels, values } = computeIntentAdherence(history);
  if (labels.length === 0) { showEmpty(canvas, "No session data yet."); return; }
  drawLineChart(canvas, {
    labels,
    values,
    color: "#6ea8fe",
    yFmt: (v) => Math.round(v) + "%"
  });
}

function renderKPIs(history) {
  const sessions = history.length;
  const totalMs  = history.reduce((s, h) => s + (h.totalActiveMs || 0), 0);
  const avgMs    = sessions ? totalMs / sessions : 0;
  const videos   = history.reduce((s, h) => s + (h.videosWatched || 0), 0);

  $("kpiSessions").textContent = sessions;
  $("kpiTotal").textContent    = fmtDuration(totalMs);
  $("kpiAvg").textContent      = fmtDuration(avgMs);
  $("kpiVideos").textContent   = videos;
}

function renderCategoryChart(history, overrides) {
  const canvas = $("categoryChart");
  const avgs   = computeCategoryAverages(history, overrides);

  if (!avgs || history.length === 0) {
    showEmpty(canvas, "No session data yet.");
    $("categoryLegend").innerHTML = "";
    return;
  }

  const labels = CAT_ORDER.map((c) => c[0].toUpperCase() + c.slice(1));
  const values = CAT_ORDER.map((c) => avgs[c]);
  const colors = CAT_ORDER.map((c) => CAT_COLORS[c]);

  drawBarChart(canvas, {
    labels,
    datasets: [{ data: values }],
    barColors: colors
  });

  // Legend
  const legend = $("categoryLegend");
  legend.innerHTML = CAT_ORDER.map((c, i) => `
    <div class="legendItem">
      <div class="legendDot" style="background:${CAT_COLORS[c]}"></div>
      ${labels[i]}: ${fmtDuration(avgs[c])} avg/session
    </div>
  `).join("");
}

function renderTimeOfDayChart(history) {
  const canvas = $("timeOfDayChart");
  if (history.length === 0) { showEmpty(canvas, "No session data yet."); return; }

  const counts = computeTimeOfDay(history);
  const labels = counts.map((_, i) => {
    if (i === 0)  return "12a";
    if (i === 12) return "12p";
    return i < 12 ? `${i}a` : `${i - 12}p`;
  });

  // Color bars by time-of-day bucket (per-bar colors in one dataset)
  const colors = counts.map((_, i) => {
    if (i >= 5  && i < 9)  return "#fbbf24"; // morning
    if (i >= 9  && i < 13) return "#34d399"; // late morning
    if (i >= 13 && i < 18) return "#6ea8fe"; // afternoon
    if (i >= 18 && i < 22) return "#a78bfa"; // evening
    return "#475569";                          // night
  });

  drawBarChart(canvas, { labels, datasets: [{ data: counts }], barColors: colors });
}

function renderPeriodChart(history, period) {
  const canvas = $("periodChart");
  const titles = { daily: "Daily", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
  $("periodChartTitle").textContent = `${titles[period] || "Period"} totals`;

  if (history.length === 0) { showEmpty(canvas, "No session data yet."); return; }

  const { labels, values } = computePeriodAggregates(history, period);

  if (labels.length === 0) { showEmpty(canvas, "No data for this period."); return; }
  if (labels.length === 1) {
    drawBarChart(canvas, { labels, datasets: [{ data: values, color: BAR_DEFAULT }] });
    return;
  }
  drawLineChart(canvas, { labels, values, color: BAR_DEFAULT });
}

// ── main ───────────────────────────────────────────────────────────────────────

let currentPeriod = "daily";
let cachedData    = null;

async function renderAll(period) {
  if (!cachedData) {
    cachedData = await loadData();
    const { history } = cachedData;
    if (history.length === 0) {
      $("status").textContent = "No sessions recorded yet";
    } else {
      $("status").textContent = `${history.length} session${history.length !== 1 ? "s" : ""}`;
    }
  }

  const { history, overrides } = cachedData;
  renderKPIs(history);
  renderCategoryChart(history, overrides);
  renderTimeOfDayChart(history);
  renderPeriodChart(history, period);
  renderIntentAdherenceChart(history);
  renderHeatmapChart(history);
  renderWatchVsIntendedChart(history);
  renderWordCloud(history);
  renderReasonWordCloud(history);
  renderSkipRateTrendChart(history);
}

document.addEventListener("DOMContentLoaded", async () => {
  // Period buttons
  document.querySelectorAll(".periodBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".periodBtn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentPeriod = btn.dataset.period;
      renderPeriodChart(cachedData?.history || [], currentPeriod);
      $("periodChartTitle").textContent =
        `${currentPeriod[0].toUpperCase() + currentPeriod.slice(1)} totals`;
    });
  });

  await renderAll(currentPeriod);

  // Re-draw on resize so canvas scales correctly
  let resizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderAll(currentPeriod), 120);
  });
});
