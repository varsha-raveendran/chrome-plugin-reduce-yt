(() => {
  // Lightweight friction: intercept clicks to watch pages, show a 3s overlay,
  // then navigate. This is intentionally conservative to avoid breaking playback.
  const OVERLAY_ID = "pn-friction";

  function ensureOverlay() {
    let el = document.getElementById(OVERLAY_ID);
    if (el) return el;

    el = document.createElement("div");
    el.id = OVERLAY_ID;
    el.className = "pn-friction";
    el.setAttribute("data-open", "false");

    const overlay = document.createElement("div");
    overlay.className = "pn-overlay";
    overlay.setAttribute("aria-hidden", "true");

    const card = document.createElement("div");
    card.className = "pn-friction-card";
    card.setAttribute("role", "dialog");
    card.setAttribute("aria-modal", "true");
    card.setAttribute("aria-label", "Confirm video navigation");

    const title = document.createElement("div");
    title.className = "pn-friction-title";
    title.textContent = "Still want to watch?";

    const sub = document.createElement("div");
    sub.className = "pn-friction-sub";
    sub.textContent = "";
    sub.setAttribute("data-pn-sub", "1");

    const match = document.createElement("div");
    match.className = "pn-friction-match";
    match.setAttribute("data-pn-match", "1");

    const progress = document.createElement("div");
    progress.className = "pn-progress";
    const bar = document.createElement("div");
    progress.appendChild(bar);

    const reasonLabel = document.createElement("div");
    reasonLabel.className = "pn-friction-reason-label";
    reasonLabel.setAttribute("data-pn-reason-label", "1");
    reasonLabel.textContent = "Why are you watching this?";

    const reasonInput = document.createElement("input");
    reasonInput.type = "text";
    reasonInput.className = "pn-input";
    reasonInput.placeholder = "e.g. research for project, relax after work";
    reasonInput.setAttribute("data-pn-reason", "1");
    reasonInput.autocomplete = "off";

    const actions = document.createElement("div");
    actions.className = "pn-friction-actions";

    const skipBtn = document.createElement("button");
    skipBtn.className = "pn-btn primary";
    skipBtn.type = "button";
    skipBtn.textContent = "Skip wait";
    skipBtn.disabled = true;
    skipBtn.style.opacity = "0.45";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "pn-btn";
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";

    actions.appendChild(cancelBtn);
    actions.appendChild(skipBtn);

    const kbHint = document.createElement("div");
    kbHint.style.cssText = "font-size:11px;color:rgba(242,244,248,0.45);text-align:right;margin-top:6px";
    kbHint.textContent = "Esc to cancel · Enter to skip wait";

    card.appendChild(title);
    card.appendChild(sub);
    card.appendChild(match);
    card.appendChild(progress);
    card.appendChild(reasonLabel);
    card.appendChild(reasonInput);
    card.appendChild(actions);
    card.appendChild(kbHint);

    el.appendChild(overlay);
    el.appendChild(card);
    document.documentElement.appendChild(el);

    return el;
  }

  function closestAnchor(node) {
    if (!node) return null;
    if (node.closest) return node.closest("a[href]");
    return null;
  }

  function isModifiedClick(e) {
    return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
  }

  function isWatchHref(href) {
    if (!href) return false;
    if (href.startsWith("https://www.youtube.com/watch")) return true;
    if (href.startsWith("/watch")) return true;
    return false;
  }

  function resolveUrl(href) {
    try {
      return new URL(href, location.origin).toString();
    } catch {
      return href;
    }
  }

  function extractTitleFromAnchor(a) {
    // YouTube frequently provides aria-label on thumbnails; fall back to title attr.
    const aria = a.getAttribute("aria-label");
    if (aria && aria.trim()) return aria.trim();
    const t = a.getAttribute("title");
    if (t && t.trim()) return t.trim();
    const text = (a.textContent || "").trim();
    return text ? text.slice(0, 120) : "a video";
  }

  function isWatchLaterUiClick(target) {
    // Avoid intercepting clicks on "Watch later" UI overlays/buttons that sit on top of thumbnails.
    if (!target || !target.closest) return false;
    const wl = target.closest(
      '[aria-label*="watch later" i], ytd-thumbnail-overlay-toggle-button-renderer, ytd-thumbnail-overlay-now-playing-renderer'
    );
    return Boolean(wl);
  }

  const SKIP_NUDGE_COUNT = 5;
  const SKIP_NUDGE_MSG = "That's 5 skips — are you still on track with your intent?";

  const STOPWORDS = new Set([
    "the", "and", "for", "with", "this", "that", "from", "have", "just",
    "are", "was", "were", "will", "what", "how", "why", "when", "who",
    "video", "youtube", "watch", "part", "full", "new", "best", "top",
  ]);

  // Semantic synonyms: expand intent tokens before comparing to title tokens.
  const SEMANTIC_EXPANSIONS = {
    react:       ["hooks", "usestate", "useeffect", "usememo", "usecallback", "useref", "usecontext", "usereducer", "jsx", "component", "redux", "nextjs", "next", "vite", "recoil", "zustand"],
    javascript:  ["js", "es6", "es2015", "es2020", "typescript", "ts", "node", "nodejs", "npm", "webpack", "babel", "async", "promise", "closure", "prototype", "esm"],
    typescript:  ["ts", "types", "generics", "interface", "type", "enum", "decorators"],
    python:      ["django", "flask", "fastapi", "pandas", "numpy", "scipy", "matplotlib", "asyncio", "pip", "pep8", "pytest", "celery"],
    css:         ["flexbox", "grid", "tailwind", "sass", "scss", "responsive", "animation", "keyframe", "transition", "media", "bootstrap"],
    html:        ["dom", "markup", "semantic", "accessibility", "aria", "form", "canvas", "svg"],
    database:    ["sql", "mysql", "postgres", "postgresql", "mongodb", "redis", "orm", "query", "schema", "migration", "nosql", "firebase"],
    api:         ["rest", "graphql", "grpc", "endpoint", "http", "fetch", "axios", "request", "response", "webhook"],
    docker:      ["container", "kubernetes", "k8s", "compose", "dockerfile", "devops", "deployment", "cicd", "pipeline"],
    learn:       ["tutorial", "guide", "course", "walkthrough", "explained", "introduction", "intro", "beginner", "overview", "crash", "deep", "dive", "fundamentals", "basics"],
    cook:        ["recipe", "bake", "baking", "cooking", "meal", "ingredient", "kitchen", "chef", "dish", "cuisine", "saute", "roast", "grill"],
    workout:     ["gym", "exercise", "fitness", "training", "yoga", "pilates", "run", "cardio", "strength", "hiit", "stretching", "weights"],
    travel:      ["trip", "vlog", "tour", "destination", "explore", "adventure", "itinerary", "hotel", "flight", "backpack"],
    guitar:      ["chord", "riff", "strum", "fingerpicking", "tabs", "scales", "solo", "acoustic", "electric"],
    piano:       ["keys", "chord", "sheet", "music", "melody", "harmony", "notes", "practice"],
    game:        ["gaming", "gameplay", "playthrough", "walkthrough", "speedrun", "modding", "esports", "strategy", "review"],
    comedy:      ["standup", "comedian", "comic", "funny", "humor", "humour", "laugh", "jokes", "skit", "parody", "satire", "roast", "improv", "memes"],
    standup:     ["comedian", "comic", "comedy", "funny", "jokes", "laugh", "routine", "show", "special", "live"],
    comic:       ["comedian", "standup", "comedy", "funny", "humor", "humour", "jokes", "sketch", "skit"],
    entertainment: ["funny", "comedy", "fun", "laugh", "standup", "comic", "comedian", "meme", "memes", "skit", "parody", "viral", "trending", "prank", "reaction", "challenge", "highlights", "clip", "shorts"],
    relax:       ["chill", "calm", "relaxing", "meditation", "asmr", "lofi", "ambient", "sleep", "peaceful", "vibe", "vibes", "cozy"],
    fun:         ["funny", "comedy", "laugh", "hilarious", "humor", "prank", "entertaining", "enjoy"],
  };

  // Maps tokens to broad topic labels for fallback topic-overlap matching.
  const TOPIC_TAXONOMY = {
    // tech — languages & frameworks
    javascript: "tech", typescript: "tech", python: "tech", java: "tech", rust: "tech", go: "tech",
    react: "tech", angular: "tech", vue: "tech", svelte: "tech", node: "tech", nodejs: "tech",
    api: "tech", database: "tech", sql: "tech", docker: "tech", kubernetes: "tech", devops: "tech",
    tutorial: "tech", programming: "tech", developer: "tech", code: "tech", coding: "tech", software: "tech",
    algorithm: "tech", leetcode: "tech", system: "tech", backend: "tech", frontend: "tech", fullstack: "tech",
    html: "tech", css: "tech", git: "tech", linux: "tech", terminal: "tech", bash: "tech",
    // tech — networking & protocols
    protocol: "tech", protocols: "tech", wire: "tech", resp: "tech", http: "tech", https: "tech",
    tcp: "tech", udp: "tech", rpc: "tech", grpc: "tech", websocket: "tech", socket: "tech",
    network: "tech", networking: "tech", packet: "tech", latency: "tech", bandwidth: "tech",
    tls: "tech", ssl: "tech", dns: "tech", proxy: "tech", balancer: "tech", cdn: "tech",
    // tech — systems & infra
    redis: "tech", kafka: "tech", rabbitmq: "tech", queue: "tech", cache: "tech", caching: "tech",
    memory: "tech", storage: "tech", disk: "tech", cpu: "tech", thread: "tech",
    concurrency: "tech", stream: "tech", streaming: "tech", buffer: "tech",
    indexing: "tech", shard: "tech", sharding: "tech", replication: "tech",
    consensus: "tech", raft: "tech", paxos: "tech", etcd: "tech", zookeeper: "tech",
    // tech — CS / architecture
    internals: "tech", internal: "tech", architecture: "tech", pattern: "tech", patterns: "tech",
    distributed: "tech", scalable: "tech", scalability: "tech", reliability: "tech",
    performance: "tech", optimization: "tech", benchmark: "tech", profiling: "tech",
    tracing: "tech", observability: "tech", monitoring: "tech", telemetry: "tech",
    // tech — security
    security: "tech", authentication: "tech", authorization: "tech", encryption: "tech",
    hashing: "tech", token: "tech", jwt: "tech", oauth: "tech", firewall: "tech",
    // tech — data structures
    struct: "tech", structure: "tech", structures: "tech", tree: "tech", graph: "tech",
    heap: "tech", stack: "tech", linked: "tech", array: "tech", trie: "tech",
    // cooking
    recipe: "cooking", cook: "cooking", cooking: "cooking", bake: "cooking", baking: "cooking",
    chef: "cooking", kitchen: "cooking", food: "cooking", meal: "cooking", cuisine: "cooking",
    ingredient: "cooking", dish: "cooking", restaurant: "cooking",
    // fitness
    workout: "fitness", exercise: "fitness", gym: "fitness", yoga: "fitness",
    pilates: "fitness", running: "fitness", marathon: "fitness", fitness: "fitness",
    training: "fitness", cardio: "fitness", strength: "fitness",
    // travel
    travel: "travel", trip: "travel", vlog: "travel", tour: "travel",
    destination: "travel", adventure: "travel", explore: "travel", hotel: "travel",
    // music
    guitar: "music", piano: "music", drums: "music", song: "music", cover: "music",
    music: "music", chord: "music", melody: "music", instrument: "music", band: "music",
    // gaming
    game: "gaming", gaming: "gaming", gameplay: "gaming", minecraft: "gaming",
    playthrough: "gaming", esports: "gaming", strategy: "gaming",
    // finance
    investing: "finance", stocks: "finance", crypto: "finance", finance: "finance",
    budget: "finance", trading: "finance", portfolio: "finance",
    // science
    physics: "science", chemistry: "science", biology: "science", science: "science",
    experiment: "science", research: "science", math: "science", mathematics: "science",
    // entertainment / comedy
    comedy: "entertainment", standup: "entertainment", comedian: "entertainment", comic: "entertainment",
    funny: "entertainment", humor: "entertainment", humour: "entertainment", jokes: "entertainment",
    laugh: "entertainment", laughing: "entertainment", hilarious: "entertainment",
    entertainment: "entertainment", fun: "entertainment", entertaining: "entertainment",
    skit: "entertainment", parody: "entertainment", satire: "entertainment", roast: "entertainment",
    meme: "entertainment", memes: "entertainment", viral: "entertainment", prank: "entertainment",
    reaction: "entertainment", challenge: "entertainment", shorts: "entertainment", sketch: "entertainment",
    relax: "entertainment", chill: "entertainment", relaxing: "entertainment",
    // people / personality (used in titles like "Two Types of People")
    people: "entertainment", types: "entertainment",
  };

  function _tokenize(str) {
    return str.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOPWORDS.has(w));
  }

  function _expandTokens(tokens) {
    const expanded = new Set(tokens);
    for (const t of tokens) {
      const synonyms = SEMANTIC_EXPANSIONS[t];
      if (synonyms) synonyms.forEach((s) => expanded.add(s));
    }
    return expanded;
  }

  function _getTopics(tokens) {
    const topics = new Set();
    for (const t of tokens) {
      if (TOPIC_TAXONOMY[t]) topics.add(TOPIC_TAXONOMY[t]);
    }
    return topics;
  }

  // Tier 2: semantic expansion + topic taxonomy match.
  function semanticTopicMatch(intent, videoTitle) {
    const intentTokens = _tokenize(intent);
    const titleTokens  = _tokenize(videoTitle);

    if (intentTokens.length === 0) return null;

    // 2a — expanded intent vs title tokens (direct overlap with synonyms).
    const expandedIntent = _expandTokens(intentTokens);
    const directHits = titleTokens.filter((w) => expandedIntent.has(w));
    const directScore = directHits.length / intentTokens.length;
    if (directScore >= 0.35) {
      return { match: true, text: "Looks on track with your intent" };
    }

    // 2b — topic taxonomy: check if intent and title share a broad topic.
    const intentTopics = _getTopics([...expandedIntent]);
    const titleTopics  = _getTopics(titleTokens);
    const sharedTopics = [...intentTopics].filter((t) => titleTopics.has(t));
    if (sharedTopics.length > 0) {
      return { match: true, text: `On track — both relate to ${sharedTopics[0]}` };
    }

    // 2c — broad/open intent: if the intent is entertainment/fun/relax and the
    // title doesn't belong to a clearly conflicting serious category, give a pass.
    // This handles titles like "Simple Ken - Two Types of People" where the genre
    // isn't stated but the intent is wide open.
    const BROAD_INTENTS = new Set(["entertainment", "relax", "fun", "chill"]);
    const SERIOUS_TOPICS = new Set(["tech", "science", "finance"]);
    const intentIsBroad = intentTokens.some((t) => BROAD_INTENTS.has(t));
    const titleIsSerious = titleTopics.size > 0 && [...titleTopics].every((t) => SERIOUS_TOPICS.has(t));
    if (intentIsBroad && !titleIsSerious) {
      return { match: true, text: "Looks like it fits your intent" };
    }

    return { match: false, text: "Doesn't seem related to your intent" };
  }

  // Maps user-selected categories to their TOPIC_TAXONOMY label.
  const CATEGORY_TO_TOPIC = {
    technical:     "tech",
    hobby:         null,   // hobby spans multiple taxonomy topics; handled separately
    travel:        "travel",
    entertainment: "entertainment",
  };

  // Public entry point: runs Tier 0 (category) → Tier 1 (allowedTopics) → Tier 2 (semantic).
  function inferIntentMatch(intent, videoTitle, allowedTopics, category) {
    if (!videoTitle) return null;

    const normalizedTitle = videoTitle.toLowerCase().replace(/[^a-z0-9\s]/g, " ");

    // Tier 0: user-selected category overrides semantic inference.
    if (category) {
      const titleTokens = _tokenize(videoTitle);
      const titleTopics = _getTopics(titleTokens);
      const expectedTopic = CATEGORY_TO_TOPIC[category];

      if (category === "hobby") {
        const HOBBY_TOPICS = new Set(["gaming", "music", "cooking", "fitness"]);
        const titleIsHobby = [...titleTopics].some((t) => HOBBY_TOPICS.has(t));
        // Hobby is broad — only flag a mismatch if the title is clearly serious (tech/finance/science).
        const SERIOUS = new Set(["tech", "finance", "science"]);
        const titleIsSerious = titleTopics.size > 0 && [...titleTopics].every((t) => SERIOUS.has(t));
        if (titleIsSerious) return { match: false, text: `Doesn't look like a hobby video` };
        return { match: true, text: titleIsHobby ? "On track with your hobby session" : "Looks fine for a hobby session" };
      }

      if (category === "entertainment") {
        const SERIOUS = new Set(["tech", "finance", "science"]);
        const titleIsSerious = titleTopics.size > 0 && [...titleTopics].every((t) => SERIOUS.has(t));
        if (titleIsSerious) return { match: false, text: "Doesn't look like entertainment" };
        return { match: true, text: "Looks good for an entertainment session" };
      }

      if (expectedTopic) {
        if (titleTopics.has(expectedTopic)) {
          return { match: true, text: `On track — matches your ${category} category` };
        }
        // If the title has no topic signal at all, give benefit of the doubt.
        if (titleTopics.size === 0) {
          return { match: true, text: `Might be on track with your ${category} session` };
        }
        return { match: false, text: `Doesn't look like a ${category} video` };
      }
    }

    // Tier 1: explicit allowed topics.
    if (Array.isArray(allowedTopics) && allowedTopics.length > 0) {
      const matched = allowedTopics.find((topic) => normalizedTitle.includes(topic));
      if (matched) {
        return { match: true,  text: `On track — matches allowed topic "${matched}"` };
      }
      return { match: false, text: "Not in your allowed topics" };
    }

    if (!intent) return null;

    // Tier 2: semantic + topic inference.
    return semanticTopicMatch(intent, videoTitle);
  }

  // Tier 3: optional async upgrade via Chrome built-in AI (Gemini Nano).
  // Fire-and-forget — updates matchEl in-place if it resolves in time.
  async function tryAiUpgrade(intent, videoTitle, matchEl) {
    try {
      if (!window.ai?.languageModel) return;
      const session = await window.ai.languageModel.create({
        systemPrompt: "You are a relevance checker for a YouTube focus extension. Answer with exactly one word: YES or NO.",
      });
      const prompt =
        `User intent: "${intent}"\nVideo title: "${videoTitle}"\n` +
        `Is this video topically relevant to the user's intent? Answer YES or NO only.`;
      const answer = await Promise.race([
        session.prompt(prompt),
        new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000)),
      ]);
      session.destroy();
      const isMatch = answer.trim().toUpperCase().startsWith("Y");
      if (matchEl && matchEl.isConnected) {
        matchEl.textContent = isMatch ? "On track with your intent (AI)" : "Doesn't seem related to your intent (AI)";
        matchEl.setAttribute("data-match", isMatch ? "yes" : "no");
        matchEl.style.display = "";
      }
    } catch {
      // Tier 2 result remains; silently ignore any AI failure.
    }
  }

  class FrictionController {
    constructor() {
      this._open = false;
      this._timer = null;
      this._raf = null;
      this._skipCount = 0;
    }

    async init() {
      const settings = await window.PN_Storage.getSettings();
      if (!settings?.frictionEnabled) return;

      // Merge user-defined semantic rules from settings into the live maps.
      // customExpansions: { [topic]: [synonym, ...] }
      // customTaxonomy:   { [term]: "category" }
      if (settings.customExpansions) {
        for (const [topic, synonyms] of Object.entries(settings.customExpansions)) {
          const key = topic.toLowerCase().trim();
          if (!key || !Array.isArray(synonyms)) continue;
          SEMANTIC_EXPANSIONS[key] = [
            ...(SEMANTIC_EXPANSIONS[key] || []),
            ...synonyms.map((s) => s.toLowerCase().trim()).filter(Boolean),
          ];
        }
      }
      if (settings.customTaxonomy) {
        for (const [term, category] of Object.entries(settings.customTaxonomy)) {
          const key = term.toLowerCase().trim();
          if (key && category) TOPIC_TAXONOMY[key] = category.toLowerCase().trim();
        }
      }

      this._wire();
    }

    _wire() {
      document.addEventListener(
        "click",
        (e) => {
          try {
            if (this._open) return;
            if (isModifiedClick(e)) return;
            if (isWatchLaterUiClick(e.target)) return;

            const a = closestAnchor(e.target);
            if (!a) return;

            const href = a.getAttribute("href");
            if (!isWatchHref(href)) return;

            // Avoid intercepting in-player navigation controls.
            if (a.closest("#movie_player")) return;

            const url = resolveUrl(href);
            if (!window.PN_Session.isYouTubeWatchUrl(url)) return;

            e.preventDefault();
            e.stopPropagation();

            const title = extractTitleFromAnchor(a);
            this._show({ url, title });
          } catch {
            // If anything fails, do nothing; better to allow navigation.
          }
        },
        true
      );
    }

    _show({ url, title }) {
      const el = ensureOverlay();
      const sub = el.querySelector('[data-pn-sub="1"]');
      const bar = el.querySelector(".pn-progress > div");
      const skipBtn = el.querySelector("button.primary");
      const cancelBtn = el.querySelector("button:not(.primary)");

      const reasonInput = el.querySelector('[data-pn-reason="1"]');

      if (!sub || !bar || !skipBtn || !cancelBtn || !reasonInput) {
        location.assign(url);
        return;
      }

      this._open = true;
      el.setAttribute("data-open", "true");

      // Reset reason input each time the overlay opens.
      reasonInput.value = "";
      skipBtn.disabled = true;
      skipBtn.style.opacity = "0.45";
      reasonInput.oninput = () => {
        const hasText = (reasonInput.value || "").trim().length > 0;
        skipBtn.disabled = !hasText;
        skipBtn.style.opacity = hasText ? "1" : "0.45";
        if (hasText) reasonInput.style.borderColor = "";
      };

      const titleEl = el.querySelector(".pn-friction-title");
      if (titleEl) {
        titleEl.textContent = this._skipCount >= SKIP_NUDGE_COUNT
          ? SKIP_NUDGE_MSG
          : "Still want to watch?";
      }
      sub.textContent = `Up next: ${title}`;

      const _intent = window.PN_Session?.instance?.getIntent() || "";
      const _allowedTopics = window.PN_Session?.instance?.getAllowedTopics() || [];
      const _category = window.PN_Session?.instance?.getCategory() || "";

      const matchEl = el.querySelector('[data-pn-match="1"]');
      if (matchEl) {
        const result = inferIntentMatch(_intent, title, _allowedTopics, _category);
        if (result) {
          matchEl.textContent = result.text;
          matchEl.setAttribute("data-match", result.match ? "yes" : "no");
          matchEl.style.display = "";
          tryAiUpgrade(_intent, title, matchEl);
        } else {
          matchEl.textContent = "";
          matchEl.style.display = "none";
        }
      }

      const started = Date.now();
      const _isTech = _category === "technical" ||
        (!_category && _getTopics(_expandTokens(_tokenize(_intent))).has("tech"));
      const DURATION_MS = _isTech ? 3000 : 60000;

      let cleanup = () => {
        this._open = false;
        el.setAttribute("data-open", "false");
        if (this._timer) clearTimeout(this._timer);
        this._timer = null;
        if (this._raf) cancelAnimationFrame(this._raf);
        this._raf = null;
        skipBtn.onclick = null;
        cancelBtn.onclick = null;
        reasonInput.oninput = null;
      };

      const go = () => {
        if (!(reasonInput.value || "").trim()) {
          reasonInput.focus();
          reasonInput.style.borderColor = "rgba(255,107,107,0.8)";
          return;
        }
        this._skipCount++;
        // Persist skip count to session stats so analytics can read it.
        window.PN_Storage.get(["pn_session_stats"]).then((data) => {
          const s = data.pn_session_stats || {};
          s.frictionSkips = (s.frictionSkips || 0) + 1;
          const reason = (reasonInput.value || "").trim();
          if (reason) {
            s.frictionReasons = [...(s.frictionReasons || []), reason];
          }
          window.PN_Storage.set({ pn_session_stats: s });
        }).catch(() => {});
        cleanup();
        location.assign(url);
      };

      skipBtn.onclick = go;
      cancelBtn.onclick = () => cleanup();

      // Auto-advance only fires if a reason has been typed.
      this._timer = setTimeout(() => {
        if ((reasonInput.value || "").trim()) go();
      }, DURATION_MS);

      const tick = () => {
        const p = Math.min(1, (Date.now() - started) / DURATION_MS);
        bar.style.width = `${Math.round(p * 100)}%`;
        if (this._open) this._raf = requestAnimationFrame(tick);
      };
      tick();

      // Basic keyboard behavior: Escape cancels, Enter skips.
      const onKey = (e) => {
        if (!this._open) return;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          cleanup();
        }
        if (e.key === "Enter") {
          e.preventDefault();
          e.stopPropagation();
          go();
        }
      };
      document.addEventListener("keydown", onKey, true);
      const prevCleanup = cleanup;
      cleanup = () => {
        document.removeEventListener("keydown", onKey, true);
        prevCleanup();
      };

      reasonInput.focus();
    }
  }

  window.PN_Friction = { FrictionController };
})();

