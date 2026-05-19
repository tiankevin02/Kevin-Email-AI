(() => {
  const style = document.createElement("style");
  style.textContent = `
    #queryInput { display: none !important; }
    .queryTools { display: grid; grid-template-columns: minmax(360px, 1fr) 104px !important; align-items: center; justify-content: end; gap: 8px; }
    .queryTools #maxInput { min-width: 96px; }
    .mailSearchBox { display: grid; grid-template-columns: minmax(180px, 1fr) auto auto auto; gap: 6px; align-items: center; min-width: 0; }
    .mailSearchBox input { min-width: 0; background: rgba(255,255,255,.9); }
    .mailSearchBox button { min-height: 34px; padding: 0 10px; }
    .aiSearchButton { background: #211f1d; border-color: #211f1d; color: #fff; }
    .ghostButton { background: transparent; color: var(--muted,#706a64); border-color: var(--line,#e9e0d8); }
    @media (max-width: 760px) {
      .queryTools { grid-template-columns: 1fr 92px !important; justify-content: stretch; }
      .mailSearchBox { grid-template-columns: minmax(0, 1fr) auto auto; }
      .mailSearchBox input { grid-column: 1 / -1; }
      .mailSearchBox button, .folderTabs button, .triageBar button { min-height: 30px; padding: 0 8px; font-size: 12px; }
      .controlToggleButton { min-height: 30px; padding: 0 11px; border-radius: 999px; font-size: 12px; }
      body.controlsCollapsed .controlToggleButton { transform: scale(.94); }
      body.controlsCollapsed .controlToggleButton::after, body:not(.controlsCollapsed) .controlToggleButton::after { content: ""; }
      .toolbar, .triageBar, .aiCommandBar { padding: 7px; border-radius: 12px; }
    }
  `;
  document.head.appendChild(style);
  const queryInput = document.getElementById("queryInput");
  if (queryInput) queryInput.type = "hidden";
})();

(() => {
  if (window.__emailAiSearchPatch) return;
  window.__emailAiSearchPatch = true;
  const get = (id) => document.getElementById(id);
  const normalize = (value) => String(value || "").replace(/[“”]/g, '"').replace(/[　]+/g, " ").trim();
  const unique = (words) => [...new Set(words.map((word) => normalize(word)).filter(Boolean))];
  const orGroup = (words) => {
    const values = unique(words);
    if (!values.length) return "";
    return values.length === 1 ? values[0] : `(${values.join(" OR ")})`;
  };
  const activeQuery = () => document.querySelector(".folderButton.active")?.dataset.query || "in:inbox newer_than:30d";
  const keywordQuery = (text) => {
    const terms = normalize(text).split(/\s+/).filter(Boolean);
    return terms.length ? `newer_than:365d ${terms.join(" ")}` : activeQuery();
  };
  const aiQuery = (raw) => {
    const text = normalize(raw);
    if (!text) return activeQuery();
    const lower = text.toLowerCase();
    const companies = [];
    const aliases = {
      サントリー: ["サントリー", "Suntory", "suntory"],
      gmo: ["GMO", "gmo"],
      pwc: ["PwC", "PWC", "pwc", "プライスウォーターハウスクーパース"],
      baycurrent: ["ベイカレント", "Baycurrent", "baycurrent"],
      accenture: ["アクセンチュア", "Accenture", "accenture"],
      deloitte: ["デロイト", "Deloitte", "deloitte"],
      kpmg: ["KPMG", "kpmg"],
      ey: ["EY", "ey", "Ernst"],
      rakuten: ["楽天", "Rakuten", "rakuten"]
    };
    for (const [key, words] of Object.entries(aliases)) {
      if (lower.includes(key) || words.some((word) => text.includes(word))) companies.push(...words);
    }
    companies.push(...(text.match(/[A-Za-z][A-Za-z0-9&.\-]{1,}/g) || []));
    const japaneseCompany = text.match(/[\p{Script=Han}\p{Script=Katakana}ー]{2,}(?=の|で|から|について|イベント|面接|マイページ|締切|説明会|選考)/gu) || [];
    companies.push(...japaneseCompany.map((word) => word.replace(/^(最近|直近|最新)の?/, "").replace(/の$/, "")).filter((word) => word.length >= 2));
    const intents = [];
    const add = (pattern, words) => { if (pattern.test(text)) intents.push(...words); };
    add(/イベント|説明会|セミナー|座談会|交流会|event|seminar/i, ["イベント", "説明会", "セミナー", "座談会", "event", "seminar"]);
    add(/面接|面談|選考|interview/i, ["面接", "面談", "選考", "interview"]);
    add(/マイページ|mypage|my page|ログイン|portal|ポータル/i, ["マイページ", "mypage", "my page", "ログイン", "portal", "ポータル"]);
    add(/締切|期限|提出|webテスト|ウェブテスト|適性検査|test/i, ["締切", "期限", "提出", "WEBテスト", "ウェブテスト", "適性検査", "test"]);
    add(/インターン|intern/i, ["インターン", "internship", "intern"]);
    const scope = /最近|直近|この前|latest/i.test(text) ? "newer_than:180d" : "newer_than:365d";
    const parts = [scope, orGroup(companies), orGroup(intents)];
    if (!companies.length && !intents.length) parts.push(...text.split(/\s+/).filter((word) => word.length > 1));
    return parts.filter(Boolean).join(" ");
  };
  const ensureUi = () => {
    const tools = document.querySelector(".queryTools");
    const queryInput = get("queryInput");
    if (!tools || !queryInput) return;
    queryInput.type = "hidden";
    if (!get("mailSearchInput")) {
      const box = document.createElement("div");
      box.className = "mailSearchBox";
      box.innerHTML = `<input id="mailSearchInput" placeholder="メールを検索" /><button id="keywordSearchButton" class="utilityButton" type="button">検索</button><button id="aiSearchButton" class="utilityButton aiSearchButton" type="button">AI検索</button><button id="clearSearchButton" class="utilityButton ghostButton" type="button">解除</button>`;
      tools.insertBefore(box, queryInput);
    }
  };
  const runSearch = (mode) => {
    const text = normalize(get("mailSearchInput")?.value);
    const queryInput = get("queryInput");
    if (!queryInput) return;
    queryInput.value = text ? (mode === "ai" ? aiQuery(text) : keywordQuery(text)) : activeQuery();
    const title = get("mailboxTitle");
    if (title) title.textContent = text ? (mode === "ai" ? `AI検索: ${text}` : `検索: ${text}`) : (document.querySelector(".folderButton.active")?.dataset.title || "受信トレイ");
    document.querySelectorAll(".folderButton").forEach((button) => button.classList.remove("active"));
    get("loadButton")?.click();
  };
  window.addEventListener("load", () => {
    ensureUi();
    get("keywordSearchButton")?.addEventListener("click", () => runSearch("keyword"));
    get("aiSearchButton")?.addEventListener("click", () => runSearch("ai"));
    get("clearSearchButton")?.addEventListener("click", () => {
      if (get("mailSearchInput")) get("mailSearchInput").value = "";
      const inbox = document.querySelector('.folderButton[data-tab="inbox"]');
      if (inbox) {
        document.querySelectorAll(".folderButton").forEach((button) => button.classList.remove("active"));
        inbox.classList.add("active");
        get("queryInput").value = inbox.dataset.query;
        get("mailboxTitle").textContent = inbox.dataset.title || inbox.textContent;
      }
      get("loadButton")?.click();
    });
    get("mailSearchInput")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        runSearch(event.metaKey || event.ctrlKey ? "ai" : "keyword");
      }
    });
  });
})();

(() => {
  const isLocalHost = (host) => host === "localhost" || host === "127.0.0.1" || /^192\.168\./.test(host);
  const button = document.getElementById("mobileShareButton");
  if (!button || isLocalHost(location.hostname)) return;
  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const panel = document.getElementById("mobileSharePanel");
    const link = document.getElementById("mobileShareLink");
    const qr = document.getElementById("mobileShareQr");
    const url = location.origin + "/";
    if (!panel || !link || !qr) return;
    link.textContent = url;
    link.href = url;
    qr.src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, true);
})();

(() => {
  const narrowQuery = "(max-width: 760px)";
  const workspace = () => document.querySelector(".workspace");
  const readPane = () => document.querySelector(".readPane");
  const style = document.createElement("style");
  style.textContent = `.mobileBackButton{display:none;width:fit-content;margin-bottom:10px;background:#211f1d;color:#fff}@media (max-width:760px){.workspace.mobileReading .messagePane{display:none}.workspace.mobileReading .readPane{min-height:calc(100dvh - 16px)}.mobileBackButton{display:inline-flex;position:sticky;top:8px;z-index:5}}`;
  document.head.appendChild(style);
  const back = document.createElement("button");
  back.type = "button";
  back.className = "mobileBackButton";
  back.textContent = "メール一覧へ";
  readPane()?.prepend(back);
  const closeReader = () => {
    workspace()?.classList.remove("mobileReading");
    requestAnimationFrame(() => document.getElementById("messageList")?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  };
  back.addEventListener("click", closeReader);
  const openReader = () => {
    if (!matchMedia(narrowQuery).matches) return;
    const area = workspace();
    area?.classList.add("mobileReading");
    requestAnimationFrame(() => area?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };
  if (typeof window.selectMessage === "function") {
    const originalSelectMessage = window.selectMessage;
    window.selectMessage = async (...args) => {
      const result = await originalSelectMessage(...args);
      openReader();
      return result;
    };
  }
  if (typeof window.showInsight === "function") {
    const originalShowInsight = window.showInsight;
    window.showInsight = (...args) => {
      closeReader();
      return originalShowInsight(...args);
    };
  }
  matchMedia(narrowQuery).addEventListener("change", (event) => {
    if (!event.matches) workspace()?.classList.remove("mobileReading");
  });
})();

(() => {
  const applyMobileControlScroll = () => {
    if (!matchMedia("(max-width: 760px)").matches) return;
    const collapsed = window.scrollY > 2;
    document.body.classList.toggle("controlsCollapsed", collapsed);
    document.getElementById("controlToggleButton")?.setAttribute("aria-expanded", String(!collapsed));
  };
  window.addEventListener("scroll", applyMobileControlScroll, { passive: true });
  window.addEventListener("resize", applyMobileControlScroll);
  applyMobileControlScroll();
})();

(() => {
  const enabledKey = "email-ai-auto-sync-enabled";
  const seenKey = "email-ai-auto-sync-seen";
  const intervalMs = 60 * 1000;
  let timer = null;
  let running = false;
  const style = document.createElement("style");
  style.textContent = `.autoSyncButton.isOn{background:#211f1d;color:#fff;border-color:#211f1d}.autoSyncButton.isChecking{opacity:.72}`;
  document.head.appendChild(style);
  const notifyInApp = (message) => {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(window.__autoSyncToastTimer);
    window.__autoSyncToastTimer = setTimeout(() => toast.classList.add("hidden"), 5200);
  };
  const readSeen = () => {
    try { return new Set(JSON.parse(localStorage.getItem(seenKey) || "[]")); } catch { return new Set(); }
  };
  const writeSeen = (messages) => {
    const ids = messages.map((message) => `${message.accountEmail || ""}:${message.id}`).filter(Boolean).slice(0, 200);
    localStorage.setItem(seenKey, JSON.stringify(ids));
  };
  const fetchJson = async (path) => {
    const response = await fetch(path, { headers: { "content-type": "application/json" } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "同期に失敗しました");
    return body;
  };
  const showSystemNotification = (messages) => {
    if (!("Notification" in window) || Notification.permission !== "granted" || !messages.length) return;
    const first = messages[0];
    const title = messages.length === 1 ? "新しいメールが届きました" : `新しいメールが${messages.length}件届きました`;
    const body = messages.length === 1 ? `${first.from?.name || first.from?.email || "送信者不明"}: ${first.subject || "(件名なし)"}` : `${first.subject || "(件名なし)"} ほか`;
    const notification = new Notification(title, { body, icon: "/icons/icon.svg", tag: "email-ai-new-mail" });
    notification.onclick = () => { window.focus(); notification.close(); };
  };
  const checkMail = async ({ baseline = false } = {}) => {
    if (running) return;
    running = true;
    button.classList.add("isChecking");
    try {
      const status = await fetchJson("/api/status");
      if (!status.gmailConnected) return;
      const params = new URLSearchParams({ q: "in:inbox newer_than:7d", max: "20", mode: "metadata", account: "all" });
      const body = await fetchJson(`/api/messages?${params}`);
      const messages = body.messages || [];
      const seen = readSeen();
      const fresh = messages.filter((message) => !seen.has(`${message.accountEmail || ""}:${message.id}`));
      writeSeen(messages);
      if (!baseline && fresh.length) {
        notifyInApp(`新しいメールが${fresh.length}件届きました。同期します。`);
        showSystemNotification(fresh);
        if (typeof window.loadMessages === "function") window.loadMessages();
      }
    } catch (error) { notifyInApp(error.message); }
    finally { running = false; button.classList.remove("isChecking"); }
  };
  const start = () => {
    localStorage.setItem(enabledKey, "1");
    button.classList.add("isOn");
    button.textContent = "自動同期 ON";
    clearInterval(timer);
    checkMail({ baseline: true });
    timer = setInterval(() => checkMail(), intervalMs);
  };
  const stop = () => {
    localStorage.setItem(enabledKey, "0");
    button.classList.remove("isOn");
    button.textContent = "自動同期";
    clearInterval(timer);
    timer = null;
  };
  const headerActions = document.querySelector(".headerActions");
  if (!headerActions) return;
  const button = document.createElement("button");
  button.type = "button";
  button.className = "utilityButton autoSyncButton";
  button.textContent = "自動同期";
  headerActions.insertBefore(button, document.getElementById("loadButton"));
  button.addEventListener("click", async () => {
    if (localStorage.getItem(enabledKey) === "1") { stop(); notifyInApp("自動同期をオフにしました。"); return; }
    if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission();
    start();
    const notificationsOn = "Notification" in window && Notification.permission === "granted";
    notifyInApp(notificationsOn ? "自動同期と通知をオンにしました。" : "自動同期をオンにしました。通知はブラウザで許可すると届きます。");
  });
  document.addEventListener("visibilitychange", () => { if (!document.hidden && localStorage.getItem(enabledKey) === "1") checkMail(); });
  if (localStorage.getItem(enabledKey) === "1") start();
})();

(() => {
  const backupKey = "email-ai-gmail-session-backup";
  const fetchJson = async (path, options = {}) => {
    const response = await fetch(path, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || "Gmail接続の保持に失敗しました");
    return body;
  };
  const notifyInApp = (message) => {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove("hidden");
    clearTimeout(window.__gmailKeepToastTimer);
    window.__gmailKeepToastTimer = setTimeout(() => toast.classList.add("hidden"), 5200);
  };
  const saveBackup = async () => {
    const body = await fetchJson("/api/session/backup");
    if (body.backup?.google?.tokens) localStorage.setItem(backupKey, JSON.stringify(body.backup));
  };
  const restoreBackup = async () => {
    const raw = localStorage.getItem(backupKey);
    if (!raw) return false;
    const status = await fetchJson("/api/status");
    if (status.gmailConnected) { await saveBackup(); return false; }
    await fetchJson("/api/session/restore", { method: "POST", body: JSON.stringify({ backup: JSON.parse(raw) }) });
    notifyInApp("保存済みのGmail接続を復元しました。");
    if (typeof window.loadStatus === "function") await window.loadStatus();
    if (typeof window.loadMessages === "function") await window.loadMessages();
    return true;
  };
  const run = async () => { try { const restored = await restoreBackup(); if (!restored) await saveBackup(); } catch {} };
  window.addEventListener("load", run);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) run(); });
  setInterval(run, 5 * 60 * 1000);
})();

(() => {
  const setupDraftKey = "email-ai-setup-draft";
  const get = (id) => document.getElementById(id);
  const fetchJson = async (path, options = {}) => {
    const response = await fetch(path, { ...options, headers: { "content-type": "application/json", ...(options.headers || {}) } });
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
  const readDraft = () => { try { return JSON.parse(localStorage.getItem(setupDraftKey) || "{}"); } catch { return {}; } };
  const writeDraft = () => localStorage.setItem(setupDraftKey, JSON.stringify({ ...readDraft(), geminiApiKey: get("geminiApiKey")?.value || "", geminiModel: get("geminiModel")?.value || "gemini-2.5-flash", grokApiKey: get("grokApiKey")?.value || "", grokModel: get("grokModel")?.value || "grok-4" }));
  const addProviderSettings = async () => {
    const form = document.querySelector("#setupPanel .formGrid");
    if (!form || get("geminiApiKey")) return;
    const fields = document.createElement("template");
    fields.innerHTML = `<label>Gemini API Key<input id="geminiApiKey" autocomplete="off" type="password" /></label><label>Gemini Model<input id="geminiModel" value="gemini-2.5-flash" /></label><label>Grok API Key<input id="grokApiKey" autocomplete="off" type="password" /></label><label>Grok Model<input id="grokModel" value="grok-4" /></label>`;
    form.append(fields.content);
    const draft = readDraft();
    for (const id of ["geminiApiKey", "geminiModel", "grokApiKey", "grokModel"]) {
      if (draft[id]) get(id).value = draft[id];
      get(id).addEventListener("input", writeDraft);
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
      await fetchJson("/api/config", { method: "POST", body: JSON.stringify({ googleClientId: get("googleClientId")?.value.trim() || "", googleClientSecret: get("googleClientSecret")?.value.trim() || "", openAIKey: get("openAIKey")?.value.trim() || "", openAIModel: get("openAIModel")?.value || "gpt-4o-mini", geminiApiKey: get("geminiApiKey")?.value.trim() || "", geminiModel: get("geminiModel")?.value || "gemini-2.5-flash", grokApiKey: get("grokApiKey")?.value.trim() || "", grokModel: get("grokModel")?.value || "grok-4" }) });
      if (typeof window.loadStatus === "function") await window.loadStatus();
      toast("接続設定を保存しました。");
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; button.textContent = previous || "保存"; }
  };
  const addSendButton = () => {
    const group = document.querySelector(".aiPanel .buttonGroup");
    if (!group || get("sendButton")) return;
    if (typeof window.selectMessage === "function") {
      const originalSelectMessage = window.selectMessage;
      window.selectMessage = async (...args) => { const result = await originalSelectMessage(...args); window.emailAiSelectedMessage = args[0]; return result; };
    }
    const button = document.createElement("button");
    button.id = "sendButton";
    button.type = "button";
    button.textContent = "送信";
    group.append(button);
    button.addEventListener("click", async () => {
      const reply = get("replyOutput")?.value.trim();
      const selected = window.emailAiSelectedMessage;
      if (!selected || !reply) { toast("送信する返信本文を入力してください。"); return; }
      if (!confirm("この内容でメールを送信します。よろしいですか？")) return;
      button.disabled = true;
      button.textContent = "処理中";
      try { await fetchJson("/api/send", { method: "POST", body: JSON.stringify({ message: selected, reply }) }); toast("メールを送信しました。"); }
      catch (error) { toast(error.message); }
      finally { button.disabled = false; button.textContent = "送信"; }
    });
  };
  window.addEventListener("load", () => { addProviderSettings(); addSendButton(); get("saveConfigButton")?.addEventListener("click", saveProviderSettings, true); });
})();
