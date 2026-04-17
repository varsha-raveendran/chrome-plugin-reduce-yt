const STORAGE_KEYS = {
  session: "pn_session",
  lastActive: "pn_last_active",
  settings: "pn_settings"
};

const DEFAULT_SETTINGS = {
  frictionEnabled: true
};

const ALARM_NAME = "pn_session_tick";

async function getLocal(keys) {
  return await chrome.storage.local.get(keys);
}

async function setLocal(obj) {
  await chrome.storage.local.set(obj);
}

function now() {
  return Date.now();
}

async function ensureDefaults() {
  const { [STORAGE_KEYS.settings]: settings } = await getLocal([STORAGE_KEYS.settings]);
  if (!settings) {
    await setLocal({ [STORAGE_KEYS.settings]: DEFAULT_SETTINGS });
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: 1 });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  if (msg.type === "PN_COACH_CHAT") {
    const { messages, systemPrompt, apiKey } = msg.payload || {};
    if (!apiKey) {
      sendResponse({ ok: false, error: "no_api_key" });
      return true;
    }
    if (!Array.isArray(messages) || messages.length === 0) {
      sendResponse({ ok: false, error: "no_messages" });
      return true;
    }
    (async () => {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: messages.map((m) => ({
              role: m.role === "assistant" ? "model" : "user",
              parts: [{ text: m.content }]
            })),
            generationConfig: { maxOutputTokens: 300 }
          })
        });
        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          sendResponse({ ok: false, error: "api_error", status: res.status, detail });
          return;
        }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        sendResponse({ ok: true, text });
      } catch (err) {
        sendResponse({ ok: false, error: "fetch_error", detail: String(err) });
      }
    })();
    return true;
  }

  (async () => {

    if (msg.type === "PN_ACTIVITY_PING") {
      await setLocal({ [STORAGE_KEYS.lastActive]: now() });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "PN_SESSION_STARTED") {
      const tabId = sender?.tab?.id ?? null;
      const { intent, startTs, maxTimeMs } = msg.payload || {};

      const session = {
        active: true,
        startTs: typeof startTs === "number" ? startTs : now(),
        intent: typeof intent === "string" ? intent : "",
        maxTimeMs: typeof maxTimeMs === "number" && maxTimeMs > 0 ? maxTimeMs : 20 * 60 * 1000,
        tabId,
        lastInterventionTs: 0,
        durationIntervened: false
      };
      await setLocal({ [STORAGE_KEYS.session]: session, [STORAGE_KEYS.lastActive]: now() });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "PN_SESSION_ENDED") {
      const { [STORAGE_KEYS.session]: session } = await getLocal([STORAGE_KEYS.session]);
      const ended = session && session.active
        ? { ...session, active: false, endTs: now() }
        : { active: false, endTs: now() };
      await setLocal({ [STORAGE_KEYS.session]: ended });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "PN_END_SESSION_AND_CLOSE_TAB") {
      const tabId = typeof msg.payload?.tabId === "number" ? msg.payload.tabId : (sender?.tab?.id ?? null);

      const { [STORAGE_KEYS.session]: session } = await getLocal([STORAGE_KEYS.session]);
      const ended = session && session.active
        ? { ...session, active: false, endTs: now() }
        : { active: false, endTs: now() };
      await setLocal({ [STORAGE_KEYS.session]: ended });

      if (typeof tabId === "number") {
        try {
          await chrome.tabs.remove(tabId);
        } catch {
          // Ignore if tab already closed.
        }
      }

      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "PN_SET_LAST_INTERVENTION") {
      const { [STORAGE_KEYS.session]: session } = await getLocal([STORAGE_KEYS.session]);
      if (session && session.active) {
        await setLocal({
          [STORAGE_KEYS.session]: {
            ...session,
            lastInterventionTs: now(),
            durationIntervened: Boolean(msg.payload?.durationIntervened ?? session.durationIntervened)
          }
        });
      }
      sendResponse({ ok: true });
      return;
    }

  })().catch(() => {
    // Avoid noisy failures; content script will degrade gracefully.
  });

  // Keep the message channel open for async response.
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== ALARM_NAME) return;

  (async () => {
    const { [STORAGE_KEYS.session]: session } = await getLocal([STORAGE_KEYS.session]);
    if (!session || !session.active) return;

    const elapsedMs = now() - session.startTs;
    const maxTimeMs = session.maxTimeMs || 20 * 60 * 1000;

    if (!session.durationIntervened && elapsedMs >= maxTimeMs) {
      // Fire a browser notification so the user is alerted even if the tab is in background.
      const elapsedMin = Math.floor(elapsedMs / 60000);
      // 1x1 transparent PNG as fallback icon (Chrome requires iconUrl).
      const ICON = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
      chrome.notifications.create("pn_duration", {
        type: "basic",
        iconUrl: ICON,
        title: "Time's up — Procrastinate Not",
        message: `You've been on YouTube for ${elapsedMin} min. Your limit was ${Math.floor(maxTimeMs / 60000)} min.`,
        priority: 2
      });

      // Also tell the content script to show the in-page check-in modal.
      if (session.tabId != null) {
        try {
          await chrome.tabs.sendMessage(session.tabId, {
            type: "PN_DURATION_THRESHOLD",
            payload: { elapsedMs }
          });
        } catch {
          // Tab might be gone; ignore.
        }
      }

      // Mark as intervened so notification/modal don't repeat.
      await setLocal({
        [STORAGE_KEYS.session]: {
          ...session,
          durationIntervened: true,
          lastInterventionTs: now()
        }
      });
    }
  })().catch(() => {});
});

