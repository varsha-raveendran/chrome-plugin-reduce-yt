(() => {
  const SYSTEM_PROMPT = `You are a compassionate life coach inside a YouTube focus extension. The user has chosen to have a longer conversation with you after a quick check-in. Continue helping them reflect on their intentions and habits around YouTube use.

Rules:
- Be warm, direct, and concise — 2–4 sentences per turn.
- Ask exactly one reflective question per turn.
- Do not moralize. Never say "you should" or "you shouldn't."
- Be genuinely curious, not performatively concerned.
- Avoid corporate wellness language.
- Adapt your questions to what the user shares. Good question angles:
  - "What else could you be doing with this time?"
  - "Is there something you're avoiding right now?"
  - "What made you set this particular goal today?"
  - "How do you usually feel after a long YouTube session?"
  - "What would feel better to have done an hour from now?"
  - "Is there something you're looking for in these videos that you're not quite finding?"
- No greetings — respond as if mid-conversation.`;

  let messages = [];
  let apiKey = "";

  const messagesEl = document.getElementById("messages");
  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const contextBar = document.getElementById("contextBar");

  function appendMessage(role, text) {
    const el = document.createElement("div");
    el.className = `coach-msg ${role}`;
    el.textContent = text;
    messagesEl.appendChild(el);
    el.scrollIntoView({ behavior: "smooth", block: "end" });
    return el;
  }

  function showThinking() {
    const el = document.createElement("div");
    el.className = "coach-thinking";
    el.textContent = "• • •";
    messagesEl.appendChild(el);
    el.scrollIntoView({ behavior: "smooth", block: "end" });
    return el;
  }

  async function sendToCoach(userText) {
    chatInput.disabled = true;
    sendBtn.disabled = true;

    messages.push({ role: "user", content: userText });

    const thinking = showThinking();

    try {
      const response = await chrome.runtime.sendMessage({
        type: "PN_COACH_CHAT",
        payload: { apiKey, systemPrompt: SYSTEM_PROMPT, messages }
      });

      thinking.remove();

      const reply = response?.ok ? (response.text || "") : "Couldn\u2019t reach the coach right now. Try again in a moment.";
      messages.push({ role: "assistant", content: reply });
      appendMessage("coach", reply);
    } catch {
      thinking.remove();
      const fallback = "Couldn\u2019t reach the coach right now. Try again in a moment.";
      messages.push({ role: "assistant", content: fallback });
      appendMessage("coach", fallback);
    }

    chatInput.disabled = false;
    chatInput.value = "";
    sendBtn.disabled = true;
    chatInput.focus();
  }

  async function init() {
    // Get API key from SW.
    const keyRes = await chrome.runtime.sendMessage({ type: "PN_GET_COACH_KEY" });
    apiKey = keyRes?.key || "";

    // Load prior conversation from the quick check-in modal.
    const stored = await chrome.storage.local.get("pn_coach_thread");
    const thread = stored.pn_coach_thread;

    if (thread?.context) {
      const { intent, elapsedMs, videosWatched, continueReason } = thread.context;
      const elapsedMin = Math.round((elapsedMs || 0) / 60000);
      contextBar.style.display = "";
      contextBar.textContent =
        `Session intent: "${intent || "not set"}" · ` +
        `${elapsedMin}min watched · ${videosWatched} video${videosWatched === 1 ? "" : "s"} · ` +
        `Reason to continue: "${continueReason}"`;
    }

    if (thread?.messages?.length) {
      // Replay prior messages into the UI.
      messages = thread.messages;
      messages.forEach((m) => appendMessage(m.role === "assistant" ? "coach" : "user", m.content));
      // Coach picks up from here with a fresh question.
      await sendToCoach("Let\u2019s keep talking. I want to reflect more.");
    } else {
      // No prior thread — start fresh.
      await sendToCoach("I\u2019d like to reflect on my YouTube habits.");
    }
  }

  chatInput.addEventListener("input", () => {
    sendBtn.disabled = (chatInput.value || "").trim().length === 0;
  });

  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !sendBtn.disabled) {
      const text = chatInput.value.trim();
      appendMessage("user", text);
      sendToCoach(text);
    }
  });

  sendBtn.addEventListener("click", () => {
    const text = chatInput.value.trim();
    if (!text) return;
    appendMessage("user", text);
    sendToCoach(text);
  });

  init();
})();
