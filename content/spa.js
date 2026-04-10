(() => {
  // YouTube is an SPA, but injecting inline <script> into the page is blocked by
  // YouTube's CSP. Instead we use CSP-safe signals:
  // - YouTube custom events (`yt-navigate-finish`, `yt-page-data-updated`)
  // - a lightweight location.href watcher as a backstop

  function onUrlChange(handler) {
    let last = location.href;

    const emitIfChanged = () => {
      const cur = location.href;
      if (cur !== last) {
        last = cur;
        handler(cur);
      }
    };

    // YouTube navigation events (best signal when available).
    const ytEvents = ["yt-navigate-finish", "yt-page-data-updated", "yt-navigate-start"];
    ytEvents.forEach((evt) => window.addEventListener(evt, emitIfChanged, true));

    // DOM mutation backstop (cheap observer).
    const mo = new MutationObserver(() => emitIfChanged());
    mo.observe(document.documentElement, { childList: true, subtree: true });

    // Timer backstop (covers rare cases).
    const timer = setInterval(emitIfChanged, 500);

    // Initial.
    handler(location.href);

    return () => {
      ytEvents.forEach((evt) => window.removeEventListener(evt, emitIfChanged, true));
      mo.disconnect();
      clearInterval(timer);
    };
  }

  window.PN_SPA = { onUrlChange };
})();

