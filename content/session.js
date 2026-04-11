(() => {
  const {
    STORAGE_KEYS,
    INACTIVITY_THRESHOLD_MS,
    VIDEO_BURST_WINDOW_MS,
    VIDEO_BURST_COUNT
  } = window.PN_CONST;

  function now() {
    return Date.now();
  }

  function isYouTubeWatchUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname === "www.youtube.com" && u.pathname === "/watch" && u.searchParams.has("v");
    } catch {
      return false;
    }
  }

  function getVideoIdFromUrl(url) {
    try {
      const u = new URL(url);
      return u.searchParams.get("v") || "";
    } catch {
      return "";
    }
  }

  function minutes(ms) {
    return Math.max(0, Math.round(ms / 60000));
  }

  function fmtDuration(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    if (m <= 0) return `${s}s`;
    if (s === 0) return `${m}m`;
    return `${m}m ${s}s`;
  }

  function getStableVideoTitle() {
    // Avoid brittle selectors. On watch pages, document.title is typically
    // "<Video Title> - YouTube".
    const raw = (document.title || "").trim();
    const cleaned = raw.replace(/\s+-\s+YouTube\s*$/i, "").trim();
    const t = cleaned || raw || "";
    return t.slice(0, 180);
  }

  function looksLikeBadTitle(title) {
    const t = (title || "").trim().toLowerCase();
    if (!t) return true;
    if (t === "youtube") return true;
    if (t === "watch later") return true;
    if (t === "watch later - youtube") return true;
    return false;
  }

  function isTabActiveForTiming() {
    return document.visibilityState === "visible";
  }

  async function activityPing() {
    try {
      chrome.runtime.sendMessage({ type: "PN_ACTIVITY_PING" });
    } catch {}
    await window.PN_Storage.setLastActive(now());
  }

  function throttle(fn, waitMs) {
    let last = 0;
    let timer = null;
    return function throttled() {
      const t = now();
      const remaining = waitMs - (t - last);
      if (remaining <= 0) {
        last = t;
        fn();
        return;
      }
      if (!timer) {
        timer = setTimeout(() => {
          timer = null;
          last = now();
          fn();
        }, remaining);
      }
    };
  }

  class SessionManager {
    constructor() {
      this._modalOpen = false;
      this._cleanupFocusTrap = null;
      this._lastUrl = location.href;
      this._lastVideoId = "";
      this._videoNavTs = [];
      this._session = null;
      this._currentVideo = null; // { videoId, url, title, startedTs, lastTickTs, watchMs }
      this._stats = {
        videosWatched: 0,
        videoNavEvents: [],
        lastUrl: "",
        totalActiveMs: 0,
        videos: {}
      };
      this._interventionCooldownMs = 2 * 60 * 1000;
      this._tickTimer = null;
    }

    async init() {
      await this._loadSession();
      await this._loadStats();

      this._wireActivityTracking();
      this._startTimingTicker();

      // Show intent modal on first entry if no active session.
      await this._maybeStartOrResume();
      // If we already have an active session and we're currently on a watch page,
      // seed the current video into stats even if YouTube doesn't emit a fresh SPA event.
      await this._seedCurrentVideoIfOnWatch();

      window.PN_SPA.onUrlChange(async (url) => {
        await this._onUrlChanged(url);
      });

      chrome.runtime.onMessage.addListener((msg) => {
        if (msg?.type === "PN_DURATION_THRESHOLD") {
          this._onDurationThreshold(msg.payload?.elapsedMs || 0);
        }
      });

      // Expose instance so other content scripts (e.g. friction.js) can read session state.
      window.PN_Session.instance = this;
    }

    getIntent() {
      return this._session?.intent || "";
    }

    getAllowedTopics() {
      return this._session?.allowedTopics || [];
    }

    getCategory() {
      return this._session?.category || "";
    }

    async _loadSession() {
      this._session = await window.PN_Storage.getSession();
    }

    async _loadStats() {
      const res = await window.PN_Storage.get([STORAGE_KEYS.sessionStats]);
      this._stats = res[STORAGE_KEYS.sessionStats] || this._stats;
    }

    async _saveStats() {
      await window.PN_Storage.set({ [STORAGE_KEYS.sessionStats]: this._stats });
    }

    _wireActivityTracking() {
      const ping = throttle(() => activityPing(), 10_000);
      ["mousemove", "keydown", "scroll", "click"].forEach((evt) =>
        window.addEventListener(evt, ping, { capture: true, passive: true })
      );
      document.addEventListener(
        "visibilitychange",
        () => {
          if (document.visibilityState === "visible") ping();
        },
        true
      );
      window.addEventListener("focus", ping, true);
    }

    _startTimingTicker() {
      if (this._tickTimer) return;
      this._tickTimer = setInterval(() => {
        this._tickTiming().catch(() => {});
      }, 1000);
    }

    async _tickTiming() {
      if (!this._session || !this._session.active) return;
      if (!this._currentVideo) return;

      const t = now();
      const last = this._currentVideo.lastTickTs || t;
      this._currentVideo.lastTickTs = t;

      if (!isTabActiveForTiming()) return;

      const delta = Math.max(0, t - last);
      this._stats.totalActiveMs = (this._stats.totalActiveMs || 0) + delta;
      this._currentVideo.watchMs = (this._currentVideo.watchMs || 0) + delta;
      await this._flushCurrentVideoToStats({ lightweight: true });
    }

    async _flushCurrentVideoToStats({ lightweight }) {
      const cv = this._currentVideo;
      if (!cv || !cv.videoId) return;

      this._stats.videos = this._stats.videos || {};
      const existing = this._stats.videos[cv.videoId] || {
        videoId: cv.videoId,
        url: cv.url,
        title: cv.title || "",
        watchMs: 0,
        visits: 0,
        lastSeenTs: 0
      };

      this._stats.videos[cv.videoId] = {
        ...existing,
        url: cv.url || existing.url,
        title: cv.title || existing.title,
        watchMs: Math.max(existing.watchMs || 0, cv.watchMs || 0),
        lastSeenTs: now()
      };

      // Cap stored videos by recency.
      const ids = Object.keys(this._stats.videos);
      if (ids.length > 60) {
        ids
          .sort((a, b) => (this._stats.videos[a].lastSeenTs || 0) - (this._stats.videos[b].lastSeenTs || 0))
          .slice(0, ids.length - 60)
          .forEach((id) => delete this._stats.videos[id]);
      }

      if (lightweight) {
        this._stats._lastPersistTs = this._stats._lastPersistTs || 0;
        if (now() - this._stats._lastPersistTs < 5000) return;
        this._stats._lastPersistTs = now();
      }

      await this._saveStats();
    }

    async _finalizeCurrentVideoTiming() {
      if (!this._currentVideo) return;
      await this._flushCurrentVideoToStats({ lightweight: false });
    }

    async _maybeStartOrResume() {
      const lastActive = await window.PN_Storage.getLastActive();
      const inactiveLong = lastActive && now() - lastActive >= INACTIVITY_THRESHOLD_MS;

      const sessionActive = this._session && this._session.active;
      if (!sessionActive || inactiveLong) {
        await this._showIntentModal({ reason: sessionActive ? "inactive" : "new" });
      }
    }

    async _seedCurrentVideoIfOnWatch() {
      if (!this._session || !this._session.active) return;
      const url = location.href;
      if (!isYouTubeWatchUrl(url)) return;
      const vid = getVideoIdFromUrl(url);
      if (!vid) return;

      // If we already seeded this video, do nothing.
      const existing = this._stats?.videos?.[vid];
      if (!existing) {
        this._startCurrentVideoTiming({ url, videoId: vid });
      } else if (!this._currentVideo || this._currentVideo.videoId !== vid) {
        this._startCurrentVideoTiming({ url, videoId: vid });
      }
    }

    async _startSession(intent, { maxTimeMs, allowedTopics, category } = {}) {
      const startTs = now();
      this._session = {
        active: true,
        startTs,
        intent,
        maxTimeMs: maxTimeMs || 20 * 60 * 1000,
        allowedTopics: allowedTopics || [],
        category: category || "",
        lastInterventionTs: 0
      };
      await window.PN_Storage.setSession(this._session);
      await window.PN_Storage.setLastActive(now());

      this._stats = {
        videosWatched: 0,
        videoNavEvents: [],
        lastUrl: location.href,
        totalActiveMs: 0,
        videos: {}
      };
      this._currentVideo = null;
      await this._saveStats();
      await this._seedCurrentVideoIfOnWatch();

      try {
        chrome.runtime.sendMessage({
          type: "PN_SESSION_STARTED",
          payload: { intent, startTs, maxTimeMs: this._session.maxTimeMs }
        });
      } catch {}
    }

    async _endSession() {
      await this._finalizeCurrentVideoTiming();
      if (this._session) {
        this._session = { ...this._session, active: false, endTs: now() };
        await window.PN_Storage.setSession(this._session);
      }

      // Persist a lightweight session summary for the popup analytics view.
      try {
        const { [STORAGE_KEYS.sessionHistory]: history } = await window.PN_Storage.get([
          STORAGE_KEYS.sessionHistory
        ]);
        const arr = Array.isArray(history) ? history : [];
        const startTs = this._session?.startTs || 0;
        const endTs = this._session?.endTs || now();
        const videosArr = Object.values(this._stats?.videos || {});
        videosArr.sort((a, b) => (b.watchMs || 0) - (a.watchMs || 0));
        const topVideos = videosArr.slice(0, 12).map((v) => ({
          videoId: v.videoId,
          title: v.title || "",
          watchMs: v.watchMs || 0,
          visits: v.visits || 0
        }));
        arr.push({
          startTs,
          endTs,
          intent: this._session?.intent || "",
          videosWatched: this._stats?.videosWatched || 0,
          totalActiveMs: this._stats?.totalActiveMs || 0,
          uniqueVideos: Object.keys(this._stats?.videos || {}).length,
          topVideos
        });
        // Keep last 20.
        const trimmed = arr.slice(-20);
        await window.PN_Storage.set({ [STORAGE_KEYS.sessionHistory]: trimmed });
      } catch {}

      try {
        chrome.runtime.sendMessage({ type: "PN_SESSION_ENDED" });
      } catch {}
    }

    _ensureNoDuplicateModal() {
      if (this._modalOpen) return false;
      this._modalOpen = true;
      return true;
    }

    _closeModal() {
      this._modalOpen = false;
      if (this._cleanupFocusTrap) {
        this._cleanupFocusTrap();
        this._cleanupFocusTrap = null;
      }
      window.PN_UI.closeModal();
    }

    async _showIntentModal({ reason }) {
      if (!this._ensureNoDuplicateModal()) return;

      const wrapper = document.createElement("div");
      wrapper.style.cssText = "display:flex;flex-direction:column;gap:10px";

      const input = document.createElement("input");
      input.className = "pn-input";
      input.type = "text";
      input.setAttribute("autocomplete", "off");
      input.setAttribute("spellcheck", "true");
      input.setAttribute("placeholder", "E.g. watch a specific tutorial, reply to a comment…");
      input.setAttribute("aria-label", "Session intent");
      wrapper.appendChild(input);

      // Max time field
      const timeRow = document.createElement("div");
      timeRow.style.cssText = "display:flex;flex-direction:column;gap:4px";
      const timeLabel = document.createElement("label");
      timeLabel.className = "pn-field-label";
      timeLabel.textContent = "Max time (minutes)";
      const timeInput = document.createElement("input");
      timeInput.className = "pn-input";
      timeInput.type = "number";
      timeInput.min = "1";
      timeInput.max = "480";
      timeInput.value = "20";
      timeInput.setAttribute("aria-label", "Max session time in minutes");
      timeRow.appendChild(timeLabel);
      timeRow.appendChild(timeInput);
      wrapper.appendChild(timeRow);

      // Category dropdown
      const categoryRow = document.createElement("div");
      categoryRow.style.cssText = "display:flex;flex-direction:column;gap:4px";
      const categoryLabel = document.createElement("label");
      categoryLabel.className = "pn-field-label";
      categoryLabel.textContent = "Category";
      const categorySelect = document.createElement("select");
      categorySelect.className = "pn-input";
      categorySelect.setAttribute("aria-label", "Session category");
      [
        { value: "",              label: "— Pick a category (optional) —" },
        { value: "technical",     label: "Technical" },
        { value: "hobby",         label: "Hobby" },
        { value: "travel",        label: "Travel" },
        { value: "entertainment", label: "Entertainment" },
      ].forEach(({ value, label }) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = label;
        categorySelect.appendChild(opt);
      });
      categoryRow.appendChild(categoryLabel);
      categoryRow.appendChild(categorySelect);
      wrapper.appendChild(categoryRow);

      // Allowed topics field
      const topicsRow = document.createElement("div");
      topicsRow.style.cssText = "display:flex;flex-direction:column;gap:4px";
      const topicsLabel = document.createElement("label");
      topicsLabel.className = "pn-field-label";
      topicsLabel.textContent = "Allowed topics (comma-separated keywords, optional)";
      const topicsInput = document.createElement("input");
      topicsInput.className = "pn-input";
      topicsInput.type = "text";
      topicsInput.setAttribute("autocomplete", "off");
      topicsInput.setAttribute("placeholder", "E.g. react, typescript, cooking");
      topicsInput.setAttribute("aria-label", "Allowed topics");
      topicsRow.appendChild(topicsLabel);
      topicsRow.appendChild(topicsInput);
      wrapper.appendChild(topicsRow);

      const startBtn = window.PN_UI.button("Start Session", {
        variant: "primary",
        onClick: async () => {
          const intent = (input.value || "").trim();
          const maxTimeMs = Math.max(1, parseInt(timeInput.value, 10) || 20) * 60 * 1000;
          const category = categorySelect.value;
          const allowedTopics = (topicsInput.value || "")
            .split(",")
            .map((t) => t.trim().toLowerCase())
            .filter(Boolean);
          await this._startSession(intent, { maxTimeMs, allowedTopics, category });
          this._closeModal();
        }
      });

      startBtn.disabled = true;
      input.addEventListener("input", () => {
        startBtn.disabled = (input.value || "").trim().length === 0;
      });

      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !startBtn.disabled) startBtn.click();
      });

      const body =
        reason === "inactive"
          ? "Welcome back. Before you continue, set an intention for this session."
          : "Before you start, set an intention for this session.";

      const parts = window.PN_UI.createModal({
        title: "What are you here to do?",
        body,
        contentNode: wrapper,
        actions: [startBtn],
        ariaLabel: "Set session intent"
      });

      window.PN_UI.openModal(parts);
      this._cleanupFocusTrap = window.PN_UI.trapFocus(parts.modal, null);
      setTimeout(() => input.focus(), 0);
    }

    async _showInterventionModal({ trigger }) {
      if (!this._ensureNoDuplicateModal()) return;
      if (!this._session || !this._session.active) {
        this._modalOpen = false;
        return;
      }

      const elapsedMs = now() - this._session.startTs;
      const intent = this._session.intent || "(no intent set)";
      const wrapper = document.createElement("div");

      const kpi = document.createElement("div");
      kpi.className = "pn-kpi";
      const activeMs = this._stats.totalActiveMs || 0;
      kpi.textContent = `You’ve watched ${this._stats.videosWatched} videos in ${fmtDuration(elapsedMs)} (active: ${fmtDuration(activeMs)}).`;
      wrapper.appendChild(kpi);

      const continueBtn = window.PN_UI.button("Continue", {
        variant: "primary",
        onClick: async () => {
          await this._setInterventionCooldown(trigger === "duration");
          this._closeModal();
        }
      });

      const endBtn = window.PN_UI.button("End Session", {
        variant: "danger",
        onClick: async () => {
          await this._endSession();
          this._closeModal();
          // Close the tab to make ending the session a clear action.
          try {
            chrome.runtime.sendMessage({ type: "PN_END_SESSION_AND_CLOSE_TAB" });
          } catch {}
        }
      });

      const parts = window.PN_UI.createModal({
        title: "Quick check-in",
        body: `You said your goal was: “${intent}”`,
        contentNode: wrapper,
        actions: [endBtn, continueBtn],
        ariaLabel: "Session check-in"
      });

      window.PN_UI.openModal(parts);
      this._cleanupFocusTrap = window.PN_UI.trapFocus(parts.modal, null);
      setTimeout(() => continueBtn.focus(), 0);
    }

    async _setInterventionCooldown(durationIntervened) {
      if (!this._session) return;
      this._session = { ...this._session, lastInterventionTs: now() };
      await window.PN_Storage.setSession(this._session);
      try {
        chrome.runtime.sendMessage({
          type: "PN_SET_LAST_INTERVENTION",
          payload: { durationIntervened }
        });
      } catch {}
    }

    async _onDurationThreshold(elapsedMs) {
      // Background worker sends this every minute. Check against session's own maxTimeMs.
      const maxTimeMs = this._session?.maxTimeMs || 20 * 60 * 1000;
      if ((elapsedMs || 0) < maxTimeMs) return;
      const last = this._session?.lastInterventionTs || 0;
      if (last && now() - last < this._interventionCooldownMs) return;
      await this._showInterventionModal({ trigger: "duration" });
    }

    async _onUrlChanged(url) {
      // If leaving a watch page (or switching videos), finalize timing.
      const wasWatch = isYouTubeWatchUrl(this._lastUrl);
      const wasVid = wasWatch ? getVideoIdFromUrl(this._lastUrl) : "";
      const isWatch = isYouTubeWatchUrl(url);
      const isVid = isWatch ? getVideoIdFromUrl(url) : "";
      if (wasWatch && (!isWatch || (wasVid && isVid && wasVid !== isVid))) {
        await this._finalizeCurrentVideoTiming();
        this._currentVideo = null;
      }

      this._lastUrl = url;
      if (this._stats) {
        this._stats.lastUrl = url;
        await this._saveStats();
      }

      if (!this._session || !this._session.active) {
        await this._maybeStartOrResume();
        return;
      }

      // Session active: track watch navigations.
      if (isYouTubeWatchUrl(url)) {
        const vid = getVideoIdFromUrl(url);
        if (vid && vid !== this._lastVideoId) {
          this._lastVideoId = vid;
          await this._recordVideoNavigation({ url, videoId: vid });
          this._startCurrentVideoTiming({ url, videoId: vid });
          await this._maybeTriggerBurstIntervention();
        }
      }
    }

    _startCurrentVideoTiming({ url, videoId }) {
      const title = getStableVideoTitle();
      const t = now();
      const priorWatchMs = this._stats.videos?.[videoId]?.watchMs || 0;
      this._currentVideo = {
        videoId,
        url,
        title,
        startedTs: t,
        lastTickTs: t,
        watchMs: priorWatchMs
      };

      this._stats.videos = this._stats.videos || {};
      const existing = this._stats.videos[videoId] || {
        videoId,
        url,
        title,
        watchMs: 0,
        visits: 0,
        lastSeenTs: 0
      };
      existing.visits = (existing.visits || 0) + 1;
      existing.url = url;
      existing.title = title || existing.title;
      existing.lastSeenTs = t;
      this._stats.videos[videoId] = existing;
      this._saveStats().catch(() => {});

      // YouTube updates document.title asynchronously; refresh after navigation settles.
      this._refreshVideoTitleSoon(videoId).catch(() => {});
    }

    async _refreshVideoTitleSoon(videoId) {
      const attempt = async (delayMs) => {
        await new Promise((r) => setTimeout(r, delayMs));
        if (!this._session || !this._session.active) return;
        if (!this._currentVideo || this._currentVideo.videoId !== videoId) return;

        const title = getStableVideoTitle();
        if (looksLikeBadTitle(title)) return;

        this._currentVideo.title = title;
        this._stats.videos = this._stats.videos || {};
        const existing = this._stats.videos[videoId];
        if (existing) {
          existing.title = title;
          existing.lastSeenTs = now();
          this._stats.videos[videoId] = existing;
          await this._saveStats();
        }
      };

      // Two attempts: quick and then slightly later.
      await attempt(600);
      await attempt(1800);
    }

    async _recordVideoNavigation({ url, videoId }) {
      const ts = now();
      this._videoNavTs.push(ts);
      this._videoNavTs = this._videoNavTs.filter((t) => ts - t <= VIDEO_BURST_WINDOW_MS);

      this._stats.videosWatched = (this._stats.videosWatched || 0) + 1;
      this._stats.videoNavEvents = this._stats.videoNavEvents || [];
      const t = getStableVideoTitle();
      this._stats.videoNavEvents.push({
        ts,
        url,
        videoId,
        title: looksLikeBadTitle(t) ? "" : t
      });

      // Keep storage small: retain last 40 events.
      if (this._stats.videoNavEvents.length > 40) {
        this._stats.videoNavEvents = this._stats.videoNavEvents.slice(-40);
      }
      await this._saveStats();
    }

    async _maybeTriggerBurstIntervention() {
      const last = this._session?.lastInterventionTs || 0;
      if (last && now() - last < this._interventionCooldownMs) return;

      // Trigger condition: 5+ videos within 3 minutes.
      if (this._videoNavTs.length >= VIDEO_BURST_COUNT) {
        await this._showInterventionModal({ trigger: "burst" });
      }
    }
  }

  window.PN_Session = {
    SessionManager,
    isYouTubeWatchUrl,
    getVideoIdFromUrl,
    minutes
  };
})();

