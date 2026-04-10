// Shared constants for content scripts (kept tiny and stable).
window.PN_CONST = {
  STORAGE_KEYS: {
    session: "pn_session",
    lastActive: "pn_last_active",
    settings: "pn_settings",
    sessionStats: "pn_session_stats",
    sessionHistory: "pn_session_history"
  },
  INACTIVITY_THRESHOLD_MS: 30 * 60 * 1000,
  VIDEO_BURST_WINDOW_MS: 3 * 60 * 1000,
  VIDEO_BURST_COUNT: 5
};

