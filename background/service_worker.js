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
  (async () => {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "PN_ACTIVITY_PING") {
      await setLocal({ [STORAGE_KEYS.lastActive]: now() });
      sendResponse({ ok: true });
      return;
    }

    if (msg.type === "PN_SESSION_STARTED") {
      const tabId = sender?.tab?.id ?? null;
      const { intent, startTs } = msg.payload || {};

      const session = {
        active: true,
        startTs: typeof startTs === "number" ? startTs : now(),
        intent: typeof intent === "string" ? intent : "",
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

    if (!session.durationIntervened && session.tabId != null) {
      // Send elapsed time every minute; content script decides when to intervene
      // based on the session's own maxTimeMs setting.
      try {
        await chrome.tabs.sendMessage(session.tabId, {
          type: "PN_DURATION_THRESHOLD",
          payload: { elapsedMs }
        });
      } catch {
        // Tab might be gone; ignore.
      }
    }
  })().catch(() => {});
});

