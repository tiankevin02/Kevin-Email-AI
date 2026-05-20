(() => {
  const setupDraftKey = "email-ai-setup-draft";
  const get = (id) => document.getElementById(id);

  const fetchJson = async (target, options = {}) => {
    const response = await fetch(target, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {})
      }
    });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "処理に失敗しました");
    return body;
  };

  const toast = (message) => {
    const el = get("toast");
    if (!el) return;
    el.textContent = message;
    el.classList.remove("hidden");
    clearTimeout(window.__providerToastTimer);
    window.__providerToastTimer = setTimeout(() => el.classList.add("hidden"), 5200);
  };

  const readDraft = () => {
    try {
      return JSON.parse(localStorage.getItem(setupDraftKey) || "{}");
    } catch {
      return {};
    }
  };

  const writeDraft = () => {
    localStorage.setItem(
      setupDraftKey,
      JSON.stringify({
        ...readDraft(),
        geminiApiKey: get("geminiApiKey")?.value || "",
        geminiModel: get("geminiModel")?.value || "gemini-2.5-flash",
        grokApiKey: get("grokApiKey")?.value || "",
        grokModel: get("grokModel")?.value || "grok-4"
      })
    );
  };

  const addProviderSettings = async () => {
    const form = document.querySelector("#setupPanel .formGrid");
    if (!form || get("geminiApiKey")) return;
    form.insertAdjacentHTML(
      "beforeend",
      [
        '<label>Gemini API Key<input id="geminiApiKey" autocomplete="off" type="password" /></label>',
        '<label>Gemini Model<input id="geminiModel" value="gemini-2.5-flash" /></label>',
        '<label>Grok API Key<input id="grokApiKey" autocomplete="off" type="password" /></label>',
        '<label>Grok Model<input id="grokModel" value="grok-4" /></label>'
      ].join("")
    );

    const draft = readDraft();
    for (const id of ["geminiApiKey", "geminiModel", "grokApiKey", "grokModel"]) {
      if (draft[id]) get(id).value = draft[id];
      get(id).addEventListener("input", writeDraft);
    }

    try {
      const status = await fetchJson("/api/status");
      const saved = status.savedConfig || {};
      if (saved.geminiApiKey && !get("geminiApiKey").value) get("geminiApiKey").placeholder = "保存済み";
      if (saved.geminiModel && !get("geminiModel").value) get("geminiModel").value = saved.geminiModel;
      if (saved.grokApiKey && !get("grokApiKey").value) get("grokApiKey").placeholder = "保存済み";
      if (saved.grokModel && !get("grokModel").value) get("grokModel").value = saved.grokModel;
    } catch {
      // The normal setup screen remains usable.
    }
  };

  const saveProviderSettings = async (event) => {
    if (!get("geminiApiKey")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const button = get("saveConfigButton");
    const previous = button.textContent;
    button.disabled = true;
    button.textContent = "処理中";
    try {
      writeDraft();
      await fetchJson("/api/config", {
        method: "POST",
        body: JSON.stringify({
          googleClientId: get("googleClientId")?.value.trim() || "",
          googleClientSecret: get("googleClientSecret")?.value.trim() || "",
          openAIKey: get("openAIKey")?.value.trim() || "",
          openAIModel: get("openAIModel")?.value || "gpt-4o-mini",
          geminiApiKey: get("geminiApiKey")?.value.trim() || "",
          geminiModel: get("geminiModel")?.value || "gemini-2.5-flash",
          grokApiKey: get("grokApiKey")?.value.trim() || "",
          grokModel: get("grokModel")?.value || "grok-4"
        })
      });
      if (typeof window.loadStatus === "function") await window.loadStatus();
      toast("接続設定を保存しました。");
    } catch (error) {
      toast(error.message);
    } finally {
      button.disabled = false;
      button.textContent = previous || "保存";
    }
  };

  const rememberSelection = () => {
    if (typeof window.selectMessage !== "function" || window.__emailAiRememberSelection) return;
    window.__emailAiRememberSelection = true;
    const originalSelectMessage = window.selectMessage;
    window.selectMessage = async (...args) => {
      const result = await originalSelectMessage(...args);
      window.emailAiSelectedMessage = args[0];
      return result;
    };
  };

  const addSendButton = () => {
    rememberSelection();
    const group = document.querySelector(".aiPanel .buttonGroup");
    if (!group || get("sendButton")) return;
    const button = document.createElement("button");
    button.id = "sendButton";
    button.type = "button";
    button.textContent = "送信";
    group.append(button);
    button.addEventListener("click", async () => {
      const reply = get("replyOutput")?.value.trim();
      const selected = window.emailAiSelectedMessage;
      if (!selected || !reply) {
        toast("送信する返信本文を入力してください。");
        return;
      }
      if (!confirm("この内容でメールを送信します。よろしいですか？")) return;
      button.disabled = true;
      button.textContent = "処理中";
      try {
        await fetchJson("/api/send", {
          method: "POST",
          body: JSON.stringify({
            message: selected,
            reply
          })
        });
        toast("メールを送信しました。");
      } catch (error) {
        toast(error.message);
      } finally {
        button.disabled = false;
        button.textContent = "送信";
      }
    });
  };

  window.addEventListener("load", () => {
    addProviderSettings();
    addSendButton();
    get("saveConfigButton")?.addEventListener("click", saveProviderSettings, true);
  });
})();
