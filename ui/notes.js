const NOTES_KEY = "pn_notes";

function $(id) {
  return document.getElementById(id);
}

function fmtTime(ts) {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

function fmtShortTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

async function loadNotes() {
  const res = await chrome.storage.local.get([NOTES_KEY]);
  return Array.isArray(res[NOTES_KEY]) ? res[NOTES_KEY] : [];
}

async function saveNotes(notes) {
  await chrome.storage.local.set({ [NOTES_KEY]: notes });
}

async function deleteEntry(videoId, sessionStartTs, entryId) {
  const notes = await loadNotes();
  const idx = notes.findIndex(
    (n) => n.videoId === videoId && n.sessionStartTs === sessionStartTs
  );
  if (idx < 0) return;
  notes[idx].entries = (notes[idx].entries || []).filter((e) => e.id !== entryId);
  if (notes[idx].entries.length === 0) {
    notes.splice(idx, 1);
  }
  await saveNotes(notes);
}

async function editEntry(videoId, sessionStartTs, entryId, newText) {
  const notes = await loadNotes();
  const note = notes.find(
    (n) => n.videoId === videoId && n.sessionStartTs === sessionStartTs
  );
  if (!note) return;
  const entry = (note.entries || []).find((e) => e.id === entryId);
  if (!entry) return;
  entry.text = newText;
  entry.editedTs = Date.now();
  note.ts = Date.now();
  await saveNotes(notes);
}

async function clearAllNotes() {
  await chrome.storage.local.set({ [NOTES_KEY]: [] });
}

function noteCategory(note) {
  return window.PN_Categorize.categorizeTitle(note.title || "").replace("?", "");
}

function applyFilter(notes, query, category) {
  return notes.filter((n) => {
    if (category && noteCategory(n) !== category) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    const titleMatch = (n.title || "").toLowerCase().includes(q);
    const intentMatch = (n.sessionIntent || "").toLowerCase().includes(q);
    const entryMatch = (n.entries || []).some((e) =>
      (e.text || "").toLowerCase().includes(q)
    );
    return titleMatch || intentMatch || entryMatch;
  });
}

function buildEntryRow(note, entry) {
  const row = document.createElement("div");
  row.className = "entryRow";
  row.setAttribute("data-entry-id", entry.id);

  // View state.
  const view = document.createElement("div");
  view.className = "entryView";

  const entryText = document.createElement("div");
  entryText.className = "entryText";
  entryText.textContent = entry.text;

  const entryMeta = document.createElement("div");
  entryMeta.className = "entryMeta";
  entryMeta.textContent =
    fmtShortTime(entry.ts) + (entry.editedTs ? " · edited" : "");

  const entryActions = document.createElement("div");
  entryActions.className = "entryActions";

  const editBtn = document.createElement("button");
  editBtn.className = "btn";
  editBtn.type = "button";
  editBtn.textContent = "Edit";
  editBtn.style.cssText = "padding:2px 8px;font-size:11px";

  const delBtn = document.createElement("button");
  delBtn.className = "btn danger";
  delBtn.type = "button";
  delBtn.textContent = "Delete";
  delBtn.style.cssText = "padding:2px 8px;font-size:11px";

  entryActions.appendChild(editBtn);
  entryActions.appendChild(delBtn);
  view.appendChild(entryText);
  view.appendChild(entryMeta);
  view.appendChild(entryActions);

  // Edit state.
  const editView = document.createElement("div");
  editView.className = "entryEditView";
  editView.style.display = "none";

  const editArea = document.createElement("textarea");
  editArea.className = "filterInput";
  editArea.style.cssText = "width:100%;box-sizing:border-box;min-height:60px;resize:vertical;font-size:13px;padding:8px 10px;border-radius:8px;line-height:1.5;font-family:inherit";
  editArea.rows = 3;

  const editActions = document.createElement("div");
  editActions.style.cssText = "display:flex;gap:6px;margin-top:6px;justify-content:flex-end";

  const saveBtn = document.createElement("button");
  saveBtn.className = "btn";
  saveBtn.type = "button";
  saveBtn.textContent = "Save";
  saveBtn.style.cssText = "padding:2px 10px;font-size:11px;background:rgba(110,168,254,0.15);border-color:rgba(110,168,254,0.55)";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "btn";
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";
  cancelBtn.style.cssText = "padding:2px 8px;font-size:11px";

  editActions.appendChild(cancelBtn);
  editActions.appendChild(saveBtn);
  editView.appendChild(editArea);
  editView.appendChild(editActions);

  row.appendChild(view);
  row.appendChild(editView);

  // Wire interactions.
  editBtn.addEventListener("click", () => {
    view.style.display = "none";
    editView.style.display = "block";
    editArea.value = entry.text;
    editArea.focus();
  });

  const doSave = async () => {
    const newText = editArea.value.trim();
    if (!newText) return;
    await editEntry(note.videoId, note.sessionStartTs, entry.id, newText);
    entry.text = newText;
    entry.editedTs = Date.now();
    entryText.textContent = newText;
    entryMeta.textContent = fmtShortTime(entry.ts) + " · edited";
    editView.style.display = "none";
    view.style.display = "block";
  };

  const doCancel = () => {
    editView.style.display = "none";
    view.style.display = "block";
  };

  saveBtn.addEventListener("click", doSave);
  cancelBtn.addEventListener("click", doCancel);
  editArea.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); doSave(); }
    if (e.key === "Escape") doCancel();
  });

  delBtn.addEventListener("click", async () => {
    await deleteEntry(note.videoId, note.sessionStartTs, entry.id);
    row.remove();
    // If all entries removed, remove the whole card.
    const card = document.querySelector(`[data-note-key="${note.videoId}-${note.sessionStartTs}"]`);
    if (card && card.querySelectorAll(".entryRow").length === 0) {
      card.remove();
      await updateCount();
    }
  });

  return row;
}

async function updateCount() {
  const notes = await loadNotes();
  const query = ($("filterInput")?.value || "").trim();
  const visible = applyFilter(notes, query, _activeCategory);
  const total = visible.reduce((s, n) => s + (n.entries || []).length, 0);
  const countEl = $("noteCount");
  if (countEl) countEl.textContent = total > 0 ? `${total} note${total !== 1 ? "s" : ""}` : "";
}

function renderNotes(notes) {
  const list = $("notesList");
  const empty = $("emptyNotes");
  const countEl = $("noteCount");
  list.innerHTML = "";

  const totalEntries = notes.reduce((s, n) => s + (n.entries || []).length, 0);

  if (notes.length === 0 || totalEntries === 0) {
    empty.style.display = "block";
    if (countEl) countEl.textContent = "";
    return;
  }

  empty.style.display = "none";
  if (countEl) countEl.textContent = `${totalEntries} note${totalEntries !== 1 ? "s" : ""}`;

  // Most recently updated note first.
  const sorted = notes.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));

  sorted.forEach((note) => {
    const entries = note.entries || [];
    if (entries.length === 0) return;

    const card = document.createElement("div");
    card.className = "noteCard";
    card.setAttribute("data-note-key", `${note.videoId}-${note.sessionStartTs}`);

    const top = document.createElement("div");
    top.className = "noteCardTop";

    const titleEl = document.createElement("div");
    titleEl.className = "noteCardTitle";
    const link = document.createElement("a");
    link.href = note.url || `https://www.youtube.com/watch?v=${note.videoId}`;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = note.title || note.videoId || "Video";
    titleEl.appendChild(link);

    const cat = noteCategory(note);
    const catPill = document.createElement("span");
    catPill.className = "catPill";
    catPill.textContent = cat.replace("?", "");
    titleEl.appendChild(catPill);

    top.appendChild(titleEl);

    const meta = document.createElement("div");
    meta.className = "noteCardMeta";

    if (note.sessionIntent) {
      const intentSpan = document.createElement("span");
      intentSpan.textContent = `Intent: "${note.sessionIntent}"`;
      meta.appendChild(intentSpan);
    }

    const tsSpan = document.createElement("span");
    tsSpan.textContent = fmtTime(note.ts);
    meta.appendChild(tsSpan);

    const entriesWrap = document.createElement("div");
    entriesWrap.className = "entriesWrap";
    entries.forEach((entry) => {
      entriesWrap.appendChild(buildEntryRow(note, entry));
    });

    card.appendChild(top);
    card.appendChild(meta);
    card.appendChild(entriesWrap);
    list.appendChild(card);
  });
}

let _allNotes = [];
let _activeCategory = "";

function rerender() {
  const query = ($("filterInput")?.value || "").trim();
  renderNotes(applyFilter(_allNotes, query, _activeCategory));
}

async function render() {
  _allNotes = await loadNotes();
  rerender();
}

document.addEventListener("DOMContentLoaded", async () => {
  await render();

  const filterInput = $("filterInput");
  if (filterInput) {
    filterInput.addEventListener("input", rerender);
  }

  document.querySelectorAll(".catBtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".catBtn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      _activeCategory = btn.dataset.cat;
      rerender();
    });
  });

  const clearBtn = $("clearAllNotes");
  if (clearBtn) {
    clearBtn.addEventListener("click", async () => {
      if (!confirm("Delete all notes? This cannot be undone.")) return;
      await clearAllNotes();
      await render();
    });
  }
});
