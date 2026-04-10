(() => {
  // Lightweight friction: intercept clicks to watch pages, show a 3s overlay,
  // then navigate. This is intentionally conservative to avoid breaking playback.
  const OVERLAY_ID = "pn-friction";

  function ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (el) return el;

    el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.className = "pn-friction";
    el.setAttribute("data-open", "false");

    const overlay = document.createElement("div");
    overlay.className = "pn-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const card = document.createElement("div");
    card.className = "pn-friction-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "Confirm video navigation");

    const title = document.createElement("div");
    title.className = "pn-friction-title";
    title.textContent = "Still want to watch?";

    const sub = document.createElement("div");
    sub.className = "pn-friction-sub";
    sub.textContent = "";
    sub.setAttribute("data-pn-sub", "1");

    const progress = document.createElement("div");
    progress.className = "pn-progress";
    const bar = document.createElement("div");
    progress.appendChild(bar);

    const actions = document.createElement("div");
    actions.className = "pn-friction-actions";

    const skipBtn = document.createElement("button");
    skipBtn.className = "pn-btn primary";
    skipBtn.type = "button";
    skipBtn.textContent = "Skip";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "pn-btn";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";

    actions.appendChild(cancelBtn);
    actions.appendChild(skipBtn);

    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(progress);
    card.appendChild(actions);

    el.appendChild(overlay);
    el.appendChild(card);
    document.documentElement.appendChild(el);

    return el;
  }

  function closestAnchor(node) {
    if (!node) return null;
    if (node.closest) return node.closest("a[href]");
    return null;
  }

  function isModifiedClick(e) {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
  }

  function isWatchHref(href) {
    if (!href) return false;
    if (href.startsWith("https://www.youtube.com/watch")) return true;
    if (href.startsWith("/watch")) return true;
    return false;
  }

  function resolveUrl(href) {
    try {
      return new URL(href, location.origin).toString();
    } catch {
      return href;
    }
  }

  function extractTitleFromAnchor(a) {
    // YouTube frequently provides aria-label on thumbnails; fall back to title attr.
    const aria = a.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const t = a.getAttribute("title");
    if (t && t.trim()) return t.trim();
    const text = (a.textContent || "").trim();
    return text ? text.slice(0, 120) : "a video";
  }

  function isWatchLaterUiClick(target) {
    // Avoid intercepting clicks on "Watch later" UI overlays/buttons that sit on top of thumbnails.
    if (!target || !target.closest) return false;
    const wl = target.closest(
      '[aria-label*="watch later" i], ytd-thumbnail-overlay-toggle-button-renderer, ytd-thumbnail-overlay-now-playing-renderer'
    );
    return Boolean(wl);
  }

  class FrictionController {
    constructor() {
      this._open = false;
      this._timer = null;
      this._raf = null;
    }

    async init() {
      const settings = await window.PN_Storage.getSettings();
      if (!settings?.frictionEnabled) return;
      this._wire();
    }

    _wire() {
      document.addEventListener(
        "click",
        (e) => {
          try {
            if (this._open) return;
            if (isModifiedClick(e)) return;
            if (isWatchLaterUiClick(e.target)) return;

            const a = closestAnchor(e.target);
            if (!a) return;

            const href = a.getAttribute("href");
            if (!isWatchHref(href)) return;

            // Avoid intercepting in-player navigation controls.
            if (a.closest("#movie_player")) return;

            const url = resolveUrl(href);
            if (!window.PN_Session.isYouTubeWatchUrl(url)) return;

            e.preventDefault();
            e.stopPropagation();

            const title = extractTitleFromAnchor(a);
            this._show({ url, title });
          } catch {
            // If anything fails, do nothing; better to allow navigation.
          }
        },
        true
      );
    }

    _show({ url, title }) {
      const el = ensureOverlay();
      const sub = el.querySelector('[data-pn-sub="1"]');
      const bar = el.querySelector(".pn-progress > div");
      const skipBtn = el.querySelector("button.primary");
      const cancelBtn = el.querySelector("button:not(.primary)");

      if (!sub || !bar || !skipBtn || !cancelBtn) {
        location.assign(url);
        return;
      }

      this._open = true;
      el.setAttribute("data-open", "true");
      sub.textContent = `Up next: ${title}`;

      const started = Date.now();
      const DURATION_MS = 3000;

      let cleanup = () => {
        this._open = false;
        el.setAttribute("data-open", "false");
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
        skipBtn.onclick = null;
        cancelBtn.onclick = null;
      };

      const go = () => {
        cleanup();
        location.assign(url);
      };

      skipBtn.onclick = go;
      cancelBtn.onclick = () => cleanup();

      this._timer = setTimeout(go, DURATION_MS);

      const tick = () => {
        const p = Math.min(1, (Date.now() - started) / DURATION_MS);
        bar.style.width = `${Math.round(p * 100)}%`;
        if (this._open) this._raf = requestAnimationFrame(tick);
      };
      tick();

      // Basic keyboard behavior: Escape cancels, Enter skips.
      const onKey = (e) => {
        if (!this._open) return;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cleanup();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          go();
        }
      };
      document.addEventListener("keydown", onKey, true);
      const prevCleanup = cleanup;
      cleanup = () => {
        document.removeEventListener("keydown", onKey, true);
        prevCleanup();
      };

      skipBtn.focus();
    }
  }

  window.PN_Friction = { FrictionController };
})();

