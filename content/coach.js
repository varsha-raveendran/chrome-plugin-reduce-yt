(() => {
  const MAX_USER_TURNS = 2;

  const SYSTEM_PROMPT = `Life coach for a YouTube focus app. Use the 5-whys technique: keep asking "why" to help the user uncover the real reason they're still watching. One short question per turn, 1-2 sentences max. No moralizing. After user's 2nd reply, give a one-sentence reflection then write exactly: "If you really want to continue, that's your call — but now you know why."`;

  class CoachController {
    constructor() {
      this._messages = [];
      this._userTurns = 0;
      this._apiKey = "";
      this._cleanupFocusTrap = null;
      this._messagesEl = null;
      this._inputRow = null;
      this._input = null;
      this._sendBtn = null;
      this._proceedBtn = null;
      this._onProceed = null;
    }

    async start(context, onProceed) {
      this._onProceed = onProceed;
      this._context = context;
      this._messages = [];
      this._userTurns = 0;

      const keyRes = await chrome.runtime.sendMessage({ type: "PN_GET_COACH_KEY" });
      this._apiKey = keyRes?.key || "";

      this._buildUI();
      const firstContext = this._buildContextMessage(context);
      await this._sendToCoach(firstContext);
    }

    _buildContextMessage({ intent, elapsedMs, videosWatched, continueReason }) {
      const elapsedMin = Math.round((elapsedMs || 0) / 60000);
      return `My session intent: "${intent || "not set"}"\n` +
        `I've been watching for ${elapsedMin} minute${elapsedMin === 1 ? "" : "s"} ` +
        `and have opened ${videosWatched} video${videosWatched === 1 ? "" : "s"}.\n` +
        `My reason for wanting to keep going: "${continueReason}"`;
    }

    _buildUI() {
      const messagesEl = document.createElement("div");
      messagesEl.className = "pn-coach-messages";
      this._messagesEl = messagesEl;

      const inputRow = document.createElement("div");
      inputRow.className = "pn-coach-input-row";
      this._inputRow = inputRow;

      const input = document.createElement("input");
      input.className = "pn-input";
      input.type = "text";
      input.placeholder = "Reply to the coach\u2026";
      input.setAttribute("autocomplete", "off");
      this._input = input;

      const sendBtn = window.PN_UI.button("Send", { variant: "primary" });
      sendBtn.disabled = true;
      sendBtn.style.opacity = "0.45";
      this._sendBtn = sendBtn;

      input.addEventListener("input", () => {
        const has = (input.value || "").trim().length > 0;
        sendBtn.disabled = !has;
        sendBtn.style.opacity = has ? "1" : "0.45";
      });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !sendBtn.disabled) this._onUserSend();
      });
      sendBtn.addEventListener("click", () => this._onUserSend());

      inputRow.appendChild(input);
      inputRow.appendChild(sendBtn);

      const proceedBtn = window.PN_UI.button("Continue watching", { variant: "primary" });
      proceedBtn.style.display = "none";
      proceedBtn.addEventListener("click", () => this._close());
      this._proceedBtn = proceedBtn;

      const chatMoreBtn = window.PN_UI.button("Chat more \u2192", {});
      chatMoreBtn.style.display = "none";
      chatMoreBtn.addEventListener("click", () => this._openFullChat());
      this._chatMoreBtn = chatMoreBtn;

      const wrapper = document.createElement("div");
      wrapper.appendChild(messagesEl);
      wrapper.appendChild(inputRow);

      const parts = window.PN_UI.createModal({
        title: "Quick check-in",
        contentNode: wrapper,
        actions: [chatMoreBtn, proceedBtn],
        ariaLabel: "Life coach check-in"
      });

      window.PN_UI.openModal(parts);
      this._cleanupFocusTrap = window.PN_UI.trapFocus(parts.modal, null);
    }

    _appendMessage(role, text) {
      const el = document.createElement("div");
      el.className = `pn-coach-msg ${role}`;
      el.textContent = text;
      this._messagesEl.appendChild(el);
      this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
    }

    _showThinking() {
      const el = document.createElement("div");
      el.className = "pn-coach-thinking";
      el.textContent = "\u2022 \u2022 \u2022";
      this._messagesEl.appendChild(el);
      this._messagesEl.scrollTop = this._messagesEl.scrollHeight;
      return el;
    }

    async _sendToCoach(userText) {
      if (this._input) {
        this._input.disabled = true;
        this._sendBtn.disabled = true;
        this._sendBtn.style.opacity = "0.45";
      }

      this._messages.push({ role: "user", content: userText });

      const thinking = this._showThinking();

      let reply = "";
      try {
        const response = await chrome.runtime.sendMessage({
          type: "PN_COACH_CHAT",
          payload: {
            apiKey: this._apiKey,
            systemPrompt: SYSTEM_PROMPT,
            messages: this._messages
          }
        });
        thinking.remove();
        if (!response?.ok) {
          reply = this._errorFallback(response?.error);
        } else {
          reply = response.text || "";
        }
      } catch {
        thinking.remove();
        reply = this._errorFallback("fetch_error");
      }

      this._messages.push({ role: "assistant", content: reply });
      this._appendMessage("coach", reply);

      const isDone = this._userTurns >= MAX_USER_TURNS || reply.includes("now you know why");

      if (isDone) {
        if (this._inputRow) this._inputRow.style.display = "none";
        if (this._proceedBtn) this._proceedBtn.style.display = "";
        if (this._chatMoreBtn) this._chatMoreBtn.style.display = "";
        setTimeout(() => this._proceedBtn?.focus(), 0);
      } else {
        if (this._input) {
          this._input.disabled = false;
          this._input.value = "";
          this._sendBtn.style.opacity = "0.45";
          this._sendBtn.disabled = true;
          setTimeout(() => this._input.focus(), 0);
        }
      }
    }

    async _onUserSend() {
      const text = (this._input?.value || "").trim();
      if (!text) return;
      this._appendMessage("user", text);
      this._userTurns++;
      await this._sendToCoach(text);
    }

    _errorFallback(errorCode) {
      if (errorCode === "no_api_key") {
        return "No Gemini API key set. Add it in Settings to enable the life coach. For now, carry on \u2014 you\u2019ve reflected by writing your reason.\n\nOkay \u2014 you've got this. Go watch.";
      }
      return "Couldn\u2019t reach the coach right now. That\u2019s okay \u2014 you already wrote your reason. Carry on mindfully.\n\nOkay \u2014 you've got this. Go watch.";
    }

    async _openFullChat() {
      // Save conversation state so the full-page chat can resume it.
      await chrome.storage.local.set({
        pn_coach_thread: {
          messages: this._messages,
          context: this._context,
          ts: Date.now()
        }
      });
      chrome.runtime.sendMessage({ type: "PN_OPEN_COACH_TAB" });
      this._close();
    }

    _close() {
      if (this._cleanupFocusTrap) {
        this._cleanupFocusTrap();
        this._cleanupFocusTrap = null;
      }
      window.PN_UI.closeModal();
      if (typeof this._onProceed === "function") this._onProceed();
    }
  }

  window.PN_Coach = { CoachController };
})();
