(() => {
  const STORAGE_KEY = "pn_settings";

  const CATEGORY_LABELS = {
    tech: "Technical",
    entertainment: "Entertainment",
    cooking: "Cooking",
    fitness: "Fitness",
    travel: "Travel",
    music: "Music",
    gaming: "Gaming",
    finance: "Finance",
    science: "Science",
  };

  async function load() {
    const res = await chrome.storage.local.get([STORAGE_KEY]);
    return res[STORAGE_KEY] || {};
  }

  async function save(updates) {
    const current = await load();
    await chrome.storage.local.set({ [STORAGE_KEY]: { ...current, ...updates } });
  }

  function flashSaved(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.add("visible");
    setTimeout(() => el.classList.remove("visible"), 1800);
  }

  // ── General ────────────────────────────────────────────────────────────────

  async function initGeneral(settings) {
    const frictionToggle = document.getElementById("frictionToggle");
    frictionToggle.checked = settings.frictionEnabled !== false;
    frictionToggle.addEventListener("change", async () => {
      await save({ frictionEnabled: frictionToggle.checked });
    });

    const catToggle = document.getElementById("catWidgetToggle");
    catToggle.checked = settings.catWidgetEnabled !== false;
    catToggle.addEventListener("change", async () => {
      await save({ catWidgetEnabled: catToggle.checked });
    });
  }

  // ── Life Coach ─────────────────────────────────────────────────────────────

  async function initCoach(settings) {
    const coachToggle = document.getElementById("coachToggle");
    const apiKeyInput = document.getElementById("geminiApiKey");
    const apiKeySaveBtn = document.getElementById("apiKeySaveBtn");

    coachToggle.checked = settings.coachEnabled === true;
    if (settings.geminiApiKey) apiKeyInput.placeholder = "AIza\u2026(saved)";

    coachToggle.addEventListener("change", async () => {
      await save({ coachEnabled: coachToggle.checked });
    });

    apiKeySaveBtn.addEventListener("click", async () => {
      const key = (apiKeyInput.value || "").trim();
      if (!key) return;
      await save({ geminiApiKey: key });
      apiKeyInput.value = "";
      apiKeyInput.placeholder = "AIza\u2026(saved)";
      flashSaved("apiKeySaved");
    });
  }

  // ── Semantic Expansions ────────────────────────────────────────────────────

  function renderExpansions(customExpansions) {
    const list = document.getElementById("expList");
    const empty = document.getElementById("expEmpty");
    list.innerHTML = "";
    const entries = Object.entries(customExpansions || {});
    empty.style.display = entries.length === 0 ? "" : "none";

    entries.forEach(([topic, synonyms]) => {
      const row = document.createElement("div");
      row.style.cssText = "border:1px solid var(--border);border-radius:10px;padding:10px 12px;background:rgba(255,255,255,0.03)";

      const header = document.createElement("div");
      header.style.cssText = "display:flex;justify-content:space-between;align-items:center;margin-bottom:6px";

      const topicLabel = document.createElement("span");
      topicLabel.style.cssText = "font-size:13px;font-weight:700";
      topicLabel.textContent = topic;

      const removeBtn = document.createElement("button");
      removeBtn.className = "btn danger";
      removeBtn.style.cssText = "font-size:11px;padding:4px 10px";
      removeBtn.textContent = "Remove";
      removeBtn.onclick = async () => {
        const settings = await load();
        const exp = { ...(settings.customExpansions || {}) };
        delete exp[topic];
        await save({ customExpansions: exp });
        renderExpansions(exp);
        flashSaved("expSaved");
      };

      header.appendChild(topicLabel);
      header.appendChild(removeBtn);

      const tags = document.createElement("div");
      tags.className = "tagList";

      synonyms.forEach((syn) => {
        const tag = document.createElement("span");
        tag.className = "tag";

        const text = document.createElement("span");
        text.textContent = syn;

        const del = document.createElement("button");
        del.setAttribute("aria-label", `Remove ${syn}`);
        del.textContent = "×";
        del.onclick = async () => {
          const settings = await load();
          const exp = { ...(settings.customExpansions || {}) };
          exp[topic] = (exp[topic] || []).filter((s) => s !== syn);
          if (exp[topic].length === 0) delete exp[topic];
          await save({ customExpansions: exp });
          renderExpansions(exp);
          flashSaved("expSaved");
        };

        tag.appendChild(text);
        tag.appendChild(del);
        tags.appendChild(tag);
      });

      row.appendChild(header);
      row.appendChild(tags);
      list.appendChild(row);
    });
  }

  async function initExpansions(settings) {
    renderExpansions(settings.customExpansions);

    const topicInput = document.getElementById("expTopic");
    const synInput = document.getElementById("expSynonyms");
    const addBtn = document.getElementById("expAddBtn");

    async function addExpansion() {
      const topic = topicInput.value.trim().toLowerCase();
      const synonyms = synInput.value
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
      if (!topic || synonyms.length === 0) return;

      const settings = await load();
      const exp = { ...(settings.customExpansions || {}) };
      exp[topic] = [...new Set([...(exp[topic] || []), ...synonyms])];
      await save({ customExpansions: exp });
      topicInput.value = "";
      synInput.value = "";
      renderExpansions(exp);
      flashSaved("expSaved");
      topicInput.focus();
    }

    addBtn.addEventListener("click", addExpansion);
    synInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addExpansion(); });
  }

  // ── Topic Taxonomy ─────────────────────────────────────────────────────────

  function renderTaxonomy(customTaxonomy) {
    const list = document.getElementById("taxList");
    const empty = document.getElementById("taxEmpty");
    list.innerHTML = "";
    const entries = Object.entries(customTaxonomy || {});
    empty.style.display = entries.length === 0 ? "" : "none";

    entries.forEach(([term, category]) => {
      const row = document.createElement("div");
      row.style.cssText = "display:flex;align-items:center;gap:8px";

      const tag = document.createElement("span");
      tag.className = "tag";

      const termText = document.createElement("span");
      termText.textContent = term;

      const arrow = document.createElement("span");
      arrow.style.cssText = "color:var(--muted);font-size:11px;margin:0 2px";
      arrow.textContent = "→";

      const catText = document.createElement("span");
      catText.style.cssText = "color:var(--accent)";
      catText.textContent = CATEGORY_LABELS[category] || category;

      const del = document.createElement("button");
      del.setAttribute("aria-label", `Remove ${term}`);
      del.textContent = "×";
      del.onclick = async () => {
        const settings = await load();
        const tax = { ...(settings.customTaxonomy || {}) };
        delete tax[term];
        await save({ customTaxonomy: tax });
        renderTaxonomy(tax);
        flashSaved("taxSaved");
      };

      tag.appendChild(termText);
      tag.appendChild(arrow);
      tag.appendChild(catText);
      tag.appendChild(del);
      row.appendChild(tag);
      list.appendChild(row);
    });
  }

  async function initTaxonomy(settings) {
    renderTaxonomy(settings.customTaxonomy);

    const termInput = document.getElementById("taxTerm");
    const catSelect = document.getElementById("taxCategory");
    const addBtn = document.getElementById("taxAddBtn");

    async function addEntry() {
      const term = termInput.value.trim().toLowerCase();
      const category = catSelect.value;
      if (!term || !category) return;

      const settings = await load();
      const tax = { ...(settings.customTaxonomy || {}), [term]: category };
      await save({ customTaxonomy: tax });
      termInput.value = "";
      renderTaxonomy(tax);
      flashSaved("taxSaved");
      termInput.focus();
    }

    addBtn.addEventListener("click", addEntry);
    termInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addEntry(); });
  }

  // ── Init ───────────────────────────────────────────────────────────────────

  async function init() {
    const settings = await load();
    await Promise.all([
      initGeneral(settings),
      initCoach(settings),
      initExpansions(settings),
      initTaxonomy(settings),
    ]);
  }

  init();
})();
