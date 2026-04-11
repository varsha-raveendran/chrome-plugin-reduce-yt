(() => {
  const POS_KEY_PREFIX = "pn_widget_pos_";

  async function loadPos(id) {
    try {
      const res = await chrome.storage.local.get([POS_KEY_PREFIX + id]);
      return res[POS_KEY_PREFIX + id] || null;
    } catch {
      return null;
    }
  }

  async function savePos(id, pos) {
    try {
      await chrome.storage.local.set({ [POS_KEY_PREFIX + id]: pos });
    } catch {}
  }

  // Clamp so the element stays fully on-screen.
  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  // Make an element draggable via a handle.
  // Positions are stored as { right, bottom } (distance from viewport edges)
  // so they stay sensible after resize.
  // handle: the element the user drags; el: the element that moves.
  function makeDraggable(el, handle, storageId) {
    let dragging = false;
    let startX, startY, startRight, startBottom;

    handle.style.cursor = "grab";

    async function applyStoredPos() {
      const pos = await loadPos(storageId);
      if (!pos) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = el.offsetWidth || 60;
      const h = el.offsetHeight || 60;
      const right  = clamp(pos.right,  0, vw - w);
      const bottom = clamp(pos.bottom, 0, vh - h);
      el.style.right  = `${right}px`;
      el.style.bottom = `${bottom}px`;
    }

    applyStoredPos();

    handle.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      dragging = true;
      handle.style.cursor = "grabbing";

      const rect = el.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      startRight  = window.innerWidth  - rect.right;
      startBottom = window.innerHeight - rect.bottom;

      e.preventDefault();
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = el.offsetWidth;
      const h = el.offsetHeight;

      const right  = clamp(startRight  - dx, 0, vw - w);
      const bottom = clamp(startBottom + dy, 0, vh - h);

      el.style.right  = `${right}px`;
      el.style.bottom = `${bottom}px`;
    });

    document.addEventListener("mouseup", async () => {
      if (!dragging) return;
      dragging = false;
      handle.style.cursor = "grab";
      const right  = parseFloat(el.style.right)  || 0;
      const bottom = parseFloat(el.style.bottom) || 0;
      await savePos(storageId, { right, bottom });
    });
  }

  window.PN_Draggable = { makeDraggable };
})();
