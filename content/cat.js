(() => {
  const WIDGET_ID = "pn-cat-widget";
  const POLL_MS = 30_000;

  const MOODS = [
    { emoji: "😸", label: "On track" },
    { emoji: "😾", label: "A bit over…" },
    { emoji: "🙀", label: "Still here?!" },
    { emoji: "😿", label: "Please stop" },
    { emoji: "😿", label: "I'm begging you" },
  ];

  function getMood(elapsedMs, maxTimeMs) {
    const over = elapsedMs - maxTimeMs;
    if (over < 0)           return MOODS[0];
    if (over < 15 * 60000)  return MOODS[1];
    if (over < 30 * 60000)  return MOODS[2];
    if (over < 45 * 60000)  return MOODS[3];
    return MOODS[4];
  }

  class CatWidget {
    constructor() {
      this._interval = null;
      this._draggableWired = false;
    }

    async init() {
      await this._update();
      this._interval = setInterval(() => this._update(), POLL_MS);

      // React immediately when settings or session change.
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if ("pn_settings" in changes || "pn_session" in changes) {
          this._update();
        }
      });
    }

    async _update() {
      try {
        const res = await chrome.storage.local.get(["pn_session", "pn_settings"]);
        const session = res.pn_session || null;
        const settings = res.pn_settings || {};

        // Hide if disabled in settings or no active session.
        if (settings.catWidgetEnabled === false || !session?.active) {
          this._hide();
          return;
        }

        const elapsed = Date.now() - (session.startTs || Date.now());
        const maxTimeMs = session.maxTimeMs || 20 * 60000;
        const mood = getMood(elapsed, maxTimeMs);

        this._ensureUI();
        this._render(mood);
      } catch {
        this._hide();
      }
    }

    _ensureUI() {
      if (document.getElementById(WIDGET_ID)) return;

      const widget = document.createElement("div");
      widget.id = WIDGET_ID;
      widget.setAttribute("aria-label", "Cat mood indicator");

      const emoji = document.createElement("span");
      emoji.id = "pn-cat-emoji";

      const label = document.createElement("span");
      label.id = "pn-cat-label";

      widget.appendChild(emoji);
      widget.appendChild(label);
      document.documentElement.appendChild(widget);

      // Wire drag — the whole widget is the handle.
      if (!this._draggableWired && window.PN_Draggable) {
        window.PN_Draggable.makeDraggable(widget, widget, "cat");
        this._draggableWired = true;
      }
    }

    _render(mood) {
      const widget = document.getElementById(WIDGET_ID);
      if (!widget) return;
      widget.style.display = "";

      const emoji = document.getElementById("pn-cat-emoji");
      const label = document.getElementById("pn-cat-label");
      if (emoji) emoji.textContent = mood.emoji;
      if (label) label.textContent = mood.label;
    }

    _hide() {
      const widget = document.getElementById(WIDGET_ID);
      if (widget) widget.style.display = "none";
    }
  }

  // Expose getMood for use in the popup (analytics.js).
  window.PN_Cat = { CatWidget, getMood, MOODS };
})();
