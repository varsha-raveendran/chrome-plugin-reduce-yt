(() => {
  const { STORAGE_KEYS } = window.PN_CONST;

  function isContextInvalidatedError(err) {
    const msg = String(err?.message || err || "");
    return msg.includes("Extension context invalidated");
  }

  async function get(keys) {
    try {
      return await chrome.storage.local.get(keys);
    } catch (err) {
      // Common during extension reload: content scripts still running in old context.
      if (isContextInvalidatedError(err)) return {};
      return {};
    }
  }

  async function set(obj) {
    try {
      await chrome.storage.local.set(obj);
    } catch (err) {
      if (isContextInvalidatedError(err)) return;
      // Swallow to avoid noisy failures in the page context.
    }
  }

  async function remove(keys) {
    try {
      await chrome.storage.local.remove(keys);
    } catch (err) {
      if (isContextInvalidatedError(err)) return;
    }
  }

  async function getSession() {
    const res = await get([STORAGE_KEYS.session]);
    return res[STORAGE_KEYS.session] || null;
  }

  async function setSession(session) {
    await set({ [STORAGE_KEYS.session]: session });
  }

  async function getLastActive() {
    const res = await get([STORAGE_KEYS.lastActive]);
    return res[STORAGE_KEYS.lastActive] || 0;
  }

  async function setLastActive(ts) {
    await set({ [STORAGE_KEYS.lastActive]: ts });
  }

  async function getSettings() {
    const res = await get([STORAGE_KEYS.settings]);
    const stored = res[STORAGE_KEYS.settings];
    return { frictionEnabled: true, ...(stored || {}) };
  }

  async function setSettings(updates) {
    const current = await getSettings();
    await set({ [STORAGE_KEYS.settings]: { ...current, ...updates } });
  }

  window.PN_Storage = {
    get,
    set,
    remove,
    getSession,
    setSession,
    getLastActive,
    setLastActive,
    getSettings,
    setSettings
  };
})();

