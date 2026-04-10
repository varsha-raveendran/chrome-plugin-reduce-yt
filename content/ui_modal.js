(() => {
  const ROOT_ID = "pn-root";

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("data-open", "false");
    document.documentElement.appendChild(root);
    return root;
  }

  function trapFocus(container, onRequestClose) {
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

    function getFocusable() {
      return Array.from(container.querySelectorAll(focusableSelector)).filter((el) => {
        const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
        const hidden = el.offsetParent === null && el !== document.activeElement;
        return !disabled && !hidden;
      });
    }

    function onKeyDown(e) {
      if (e.key === "Escape") {
        // Intent modal is "blocking", but we allow Escape only when a close handler is provided.
        if (typeof onRequestClose === "function") onRequestClose();
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      if (e.key !== "Tab") return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        last.focus();
        e.preventDefault();
      } else if (!e.shiftKey && document.activeElement === last) {
        first.focus();
        e.preventDefault();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }

  function createModal({ title, body, contentNode, actions, ariaLabel }) {
    const root = ensureRoot();
    root.innerHTML = "";

    const overlay = document.createElement("div");
    overlay.className = "pn-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const modal = document.createElement("div");
    modal.className = "pn-modal";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-label", ariaLabel || title || "Dialog");

    const inner = document.createElement("div");
    inner.className = "pn-modal-inner";

    const h = document.createElement("h2");
    h.className = "pn-title";
    h.textContent = title || "";

    const p = document.createElement("p");
    p.className = "pn-body";
    p.textContent = body || "";

    inner.appendChild(h);
    if (body) inner.appendChild(p);
    if (contentNode) inner.appendChild(contentNode);

    const actionsRow = document.createElement("div");
    actionsRow.className = "pn-actions";
    (actions || []).forEach((a) => actionsRow.appendChild(a));
    inner.appendChild(actionsRow);

    modal.appendChild(inner);
    root.appendChild(overlay);
    root.appendChild(modal);

    return { root, overlay, modal };
  }

  function openModal(modalParts) {
    const root = modalParts.root;
    root.setAttribute("data-open", "true");
  }

  function closeModal() {
    const root = ensureRoot();
    root.setAttribute("data-open", "false");
    root.innerHTML = "";
  }

  function button(label, opts = {}) {
    const b = document.createElement("button");
    b.className = `pn-btn${opts.variant ? " " + opts.variant : ""}`;
    b.type = "button";
    b.textContent = label;
    if (opts.onClick) b.addEventListener("click", opts.onClick);
    return b;
  }

  window.PN_UI = {
    createModal,
    openModal,
    closeModal,
    button,
    trapFocus
  };
})();

