(() => {
  const { STORAGE_KEYS } = window.PN_CONST;
  const MAX_NOTES = 500;

  function isWatchPage() {
    try {
      const u = new URL(location.href);
      return u.hostname === "www.youtube.com" && u.pathname === "/watch" && u.searchParams.has("v");
    } catch {
      return false;
    }
  }

  function getCurrentVideoId() {
    try {
      return new URL(location.href).searchParams.get("v") || "";
    } catch {
      return "";
    }
  }

  function genId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  }

  function fmtTime(ts) {
    try {
      return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    } catch {
      return "";
    }
  }

  async function loadNotes() {
    try {
      const res = await chrome.storage.local.get([STORAGE_KEYS.notes]);
      return Array.isArray(res[STORAGE_KEYS.notes]) ? res[STORAGE_KEYS.notes] : [];
    } catch {
      return [];
    }
  }

  async function loadNoteForVideo(videoId, sessionStartTs) {
    const notes = await loadNotes();
    return notes.find((n) => n.videoId === videoId && n.sessionStartTs === sessionStartTs) || null;
  }

  // Append a new entry to the note record for this video+session.
  async function appendEntry({ videoId, title, url, sessionIntent, sessionStartTs, text }) {
    const notes = await loadNotes();
    const idx = notes.findIndex(
      (n) => n.videoId === videoId && n.sessionStartTs === sessionStartTs
    );

    const entry = { id: genId(), ts: Date.now(), text };

    if (idx >= 0) {
      notes[idx].entries = [...(notes[idx].entries || []), entry];
      notes[idx].ts = Date.now();
      // Keep title/url fresh.
      if (title) notes[idx].title = title;
      if (url) notes[idx].url = url;
    } else {
      notes.push({
        videoId,
        title: title || videoId,
        url: url || "",
        sessionIntent: sessionIntent || "",
        sessionStartTs: sessionStartTs || 0,
        ts: Date.now(),
        entries: [entry]
      });
    }

    const trimmed = notes.slice(-MAX_NOTES);
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.notes]: trimmed });
    } catch {}

    return entry;
  }

  // Edit an existing entry in place.
  async function editEntry({ videoId, sessionStartTs, entryId, newText }) {
    const notes = await loadNotes();
    const note = notes.find((n) => n.videoId === videoId && n.sessionStartTs === sessionStartTs);
    if (!note) return;
    const entry = (note.entries || []).find((e) => e.id === entryId);
    if (!entry) return;
    entry.text = newText;
    entry.editedTs = Date.now();
    note.ts = Date.now();
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.notes]: notes });
    } catch {}
  }

  // Delete one entry; if it was the last one, remove the whole note record.
  async function deleteEntry({ videoId, sessionStartTs, entryId }) {
    const notes = await loadNotes();
    const idx = notes.findIndex((n) => n.videoId === videoId && n.sessionStartTs === sessionStartTs);
    if (idx < 0) return;
    notes[idx].entries = (notes[idx].entries || []).filter((e) => e.id !== entryId);
    if (notes[idx].entries.length === 0) {
      notes.splice(idx, 1);
    }
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.notes]: notes });
    } catch {}
  }

  class NotesController {
    constructor() {
      this._btn = null;
      this._panel = null;
      this._entriesList = null;
      this._textarea = null;
      this._savedLabel = null;
      this._currentVideoId = "";
      this._open = false;
      this._session = null;
    }

    async init() {
      window.PN_SPA.onUrlChange(async (url) => {
        await this._onUrlChange(url);
      });
    }

    async _onUrlChange(url) {
      if (!isWatchPage()) {
        this._hide();
        return;
      }
      const vid = getCurrentVideoId();
      if (!vid) {
        this._hide();
        return;
      }
      if (vid !== this._currentVideoId && this._open) {
        this._closePanel(false);
      }
      this._currentVideoId = vid;
      this._ensureUI();
      this._show();
    }

    _ensureUI() {
      if (this._btn) return;

      // Floating trigger button.
      const btn = document.createElement("button");
      btn.id = "pn-notes-btn";
      btn.type = "button";
      btn.textContent = "📝 Notes";
      btn.setAttribute("aria-label", "Open notes for this video");
      document.documentElement.appendChild(btn);
      this._btn = btn;

      // Panel.
      const panel = document.createElement("div");
      panel.id = "pn-notes-panel";
      panel.setAttribute("data-open", "false");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", "Video notes");

      // Header.
      const header = document.createElement("div");
      header.className = "pn-notes-header";

      const headerTitle = document.createElement("div");
      headerTitle.className = "pn-notes-header-title";
      headerTitle.textContent = "Notes";

      const closeBtn = document.createElement("button");
      closeBtn.className = "pn-btn";
      closeBtn.type = "button";
      closeBtn.textContent = "✕";
      closeBtn.setAttribute("aria-label", "Close notes");
      closeBtn.style.cssText = "padding:2px 8px;font-size:12px";
      closeBtn.addEventListener("click", () => this._closePanel(true));

      header.appendChild(headerTitle);
      header.appendChild(closeBtn);

      // Video title label.
      const videoLabel = document.createElement("div");
      videoLabel.className = "pn-notes-video";
      videoLabel.id = "pn-notes-video-label";

      // Existing entries list.
      const entriesList = document.createElement("div");
      entriesList.className = "pn-notes-entries";
      entriesList.id = "pn-notes-entries";
      this._entriesList = entriesList;

      // New-note textarea.
      const textarea = document.createElement("textarea");
      textarea.className = "pn-notes-textarea";
      textarea.setAttribute("placeholder", "Add a note…");
      textarea.setAttribute("aria-label", "New note text");
      textarea.rows = 3;
      this._textarea = textarea;

      // Ctrl/Cmd+Enter submits.
      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this._appendNote();
        }
      });

      // Footer.
      const footer = document.createElement("div");
      footer.className = "pn-notes-footer";

      const savedLabel = document.createElement("div");
      savedLabel.className = "pn-notes-saved";
      savedLabel.setAttribute("data-visible", "false");
      savedLabel.textContent = "Saved";
      this._savedLabel = savedLabel;

      const saveBtn = document.createElement("button");
      saveBtn.className = "pn-btn primary";
      saveBtn.type = "button";
      saveBtn.textContent = "Add note";
      saveBtn.addEventListener("click", () => this._appendNote());

      footer.appendChild(savedLabel);
      footer.appendChild(saveBtn);

      panel.appendChild(header);
      panel.appendChild(videoLabel);
      panel.appendChild(entriesList);
      panel.appendChild(textarea);
      panel.appendChild(footer);

      document.documentElement.appendChild(panel);
      this._panel = panel;

      // Wire drag on the button. Track whether a drag occurred so we can
      // suppress the click handler if the user was dragging, not tapping.
      let _wasDragged = false;
      if (window.PN_Draggable) {
        const origMousedown = btn.onmousedown;
        let _dragStartX, _dragStartY;
        btn.addEventListener("mousedown", (e) => {
          _dragStartX = e.clientX;
          _dragStartY = e.clientY;
          _wasDragged = false;
        });
        btn.addEventListener("mousemove", (e) => {
          if (Math.abs(e.clientX - _dragStartX) > 4 || Math.abs(e.clientY - _dragStartY) > 4) {
            _wasDragged = true;
          }
        });
        window.PN_Draggable.makeDraggable(btn, btn, "notes-btn");
      }

      btn.addEventListener("click", () => {
        if (_wasDragged) { _wasDragged = false; return; }
        if (this._open) {
          this._closePanel(true);
        } else {
          this._openPanel();
        }
      });

      document.addEventListener("keydown", (e) => {
        if (this._open && e.key === "Escape") {
          e.stopPropagation();
          this._closePanel(true);
        }
      }, true);
    }

    async _openPanel() {
      this._open = true;
      this._panel.setAttribute("data-open", "true");
      this._btn.textContent = "📝 Notes ✕";

      const label = document.getElementById("pn-notes-video-label");
      if (label) {
        const raw = (document.title || "").replace(/\s+-\s+YouTube\s*$/i, "").trim();
        label.textContent = raw || "Current video";
      }

      this._session = await this._getSession();
      await this._renderEntries();
      this._textarea.value = "";
      this._hideSaved();
      setTimeout(() => this._textarea.focus(), 0);
    }

    async _renderEntries() {
      const list = this._entriesList;
      if (!list) return;
      list.innerHTML = "";

      const note = await loadNoteForVideo(
        this._currentVideoId,
        this._session?.startTs || 0
      );
      const entries = note?.entries || [];

      if (entries.length === 0) return;

      entries.forEach((entry) => {
        list.appendChild(this._buildEntryEl(entry));
      });
    }

    _buildEntryEl(entry) {
      const wrap = document.createElement("div");
      wrap.className = "pn-entry";
      wrap.setAttribute("data-entry-id", entry.id);

      // Display view.
      const view = document.createElement("div");
      view.className = "pn-entry-view";

      const text = document.createElement("div");
      text.className = "pn-entry-text";
      text.textContent = entry.text;

      const meta = document.createElement("div");
      meta.className = "pn-entry-meta";
      meta.textContent = fmtTime(entry.ts) + (entry.editedTs ? " (edited)" : "");

      const actions = document.createElement("div");
      actions.className = "pn-entry-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "pn-btn";
      editBtn.type = "button";
      editBtn.textContent = "Edit";
      editBtn.style.cssText = "padding:2px 8px;font-size:11px";
      editBtn.addEventListener("click", () => {
        view.style.display = "none";
        editView.style.display = "block";
        editArea.value = entry.text;
        editArea.focus();
      });

      const delBtn = document.createElement("button");
      delBtn.className = "pn-btn";
      delBtn.type = "button";
      delBtn.textContent = "Delete";
      delBtn.style.cssText = "padding:2px 8px;font-size:11px;color:var(--pn-danger)";
      delBtn.addEventListener("click", async () => {
        if (!confirm("Delete this note?")) return;
        await deleteEntry({
          videoId: this._currentVideoId,
          sessionStartTs: this._session?.startTs || 0,
          entryId: entry.id
        });
        wrap.remove();
      });

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      view.appendChild(text);
      view.appendChild(meta);
      view.appendChild(actions);

      // Edit view (hidden by default).
      const editView = document.createElement("div");
      editView.className = "pn-entry-edit";
      editView.style.display = "none";

      const editArea = document.createElement("textarea");
      editArea.className = "pn-notes-textarea";
      editArea.style.cssText = "margin-top:0;min-height:60px;font-size:12px";
      editArea.rows = 3;

      editArea.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          saveEdit();
        }
        if (e.key === "Escape") {
          e.stopPropagation();
          cancelEdit();
        }
      });

      const editActions = document.createElement("div");
      editActions.className = "pn-entry-actions";

      const saveEditBtn = document.createElement("button");
      saveEditBtn.className = "pn-btn primary";
      saveEditBtn.type = "button";
      saveEditBtn.textContent = "Save";
      saveEditBtn.style.cssText = "padding:2px 8px;font-size:11px";

      const cancelEditBtn = document.createElement("button");
      cancelEditBtn.className = "pn-btn";
      cancelEditBtn.type = "button";
      cancelEditBtn.textContent = "Cancel";
      cancelEditBtn.style.cssText = "padding:2px 8px;font-size:11px";

      const saveEdit = async () => {
        const newText = editArea.value.trim();
        if (!newText) return;
        entry.text = newText;
        entry.editedTs = Date.now();
        await editEntry({
          videoId: this._currentVideoId,
          sessionStartTs: this._session?.startTs || 0,
          entryId: entry.id,
          newText
        });
        text.textContent = newText;
        meta.textContent = fmtTime(entry.ts) + " (edited)";
        view.style.display = "block";
        editView.style.display = "none";
        this._flashSaved();
      };

      const cancelEdit = () => {
        view.style.display = "block";
        editView.style.display = "none";
      };

      saveEditBtn.addEventListener("click", saveEdit);
      cancelEditBtn.addEventListener("click", cancelEdit);

      editActions.appendChild(cancelEditBtn);
      editActions.appendChild(saveEditBtn);
      editView.appendChild(editArea);
      editView.appendChild(editActions);

      wrap.appendChild(view);
      wrap.appendChild(editView);
      return wrap;
    }

    async _appendNote() {
      const text = (this._textarea?.value || "").trim();
      if (!text) return;

      const session = this._session || (await this._getSession());
      this._session = session;
      const rawTitle = (document.title || "").replace(/\s+-\s+YouTube\s*$/i, "").trim();

      const entry = await appendEntry({
        videoId: this._currentVideoId,
        title: rawTitle || this._currentVideoId,
        url: location.href,
        sessionIntent: session?.intent || "",
        sessionStartTs: session?.startTs || 0,
        text
      });

      // Append new entry to the list without a full re-render.
      const el = this._buildEntryEl(entry);
      this._entriesList.appendChild(el);
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });

      this._textarea.value = "";
      this._textarea.focus();
      this._flashSaved();
    }

    _closePanel(focusBtn) {
      this._open = false;
      if (this._panel) this._panel.setAttribute("data-open", "false");
      if (this._btn) this._btn.textContent = "📝 Notes";
      if (focusBtn && this._btn) this._btn.focus();
    }

    _show() {
      if (this._btn) this._btn.style.display = "";
    }

    _hide() {
      this._closePanel(false);
      if (this._btn) this._btn.style.display = "none";
    }

    async _getSession() {
      try {
        const res = await chrome.storage.local.get([STORAGE_KEYS.session]);
        return res[STORAGE_KEYS.session] || null;
      } catch {
        return null;
      }
    }

    _flashSaved() {
      if (!this._savedLabel) return;
      this._savedLabel.setAttribute("data-visible", "true");
      setTimeout(() => {
        if (this._savedLabel) this._savedLabel.setAttribute("data-visible", "false");
      }, 1800);
    }

    _hideSaved() {
      if (this._savedLabel) this._savedLabel.setAttribute("data-visible", "false");
    }
  }

  window.PN_Notes = { NotesController };
})();
