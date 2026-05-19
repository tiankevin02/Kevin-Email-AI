const state = {
  status: null,
  messages: [],
  selected: null,
  filter: "all",
  account: "active",
  scheduleItems: []
};

const $ = (id) => document.getElementById(id);
const setupDraftKey = "email-ai-setup-draft";

$("redirectUriText").textContent = `${location.origin}/auth/google/callback`;

function loadSetupDraft() {
  try {
    return JSON.parse(localStorage.getItem(setupDraftKey) || "{}");
  } catch {
    return {};
  }
}

function saveSetupDraft() {
  localStorage.setItem(
    setupDraftKey,
    JSON.stringify({
      googleClientId: $("googleClientId").value,
      googleClientSecret: $("googleClientSecret").value,
      openAIKey: $("openAIKey").value,
      openAIModel: $("openAIModel").value,
      geminiApiKey: $("geminiApiKey").value,
      geminiModel: $("geminiModel").value,
      grokApiKey: $("grokApiKey").value,
      grokModel: $("grokModel").value,
      anthropicApiKey: $("anthropicApiKey").value,
      anthropicModel: $("anthropicModel").value,
      preferredAiProvider: $("preferredAiProvider").value
    })
  );
}

function restoreSetupDraft() {
  const draft = loadSetupDraft();
  for (const [id, value] of Object.entries({
    googleClientId: draft.googleClientId,
    googleClientSecret: draft.googleClientSecret,
    openAIKey: draft.openAIKey,
    openAIModel: draft.openAIModel,
    geminiApiKey: draft.geminiApiKey,
    geminiModel: draft.geminiModel,
    grokApiKey: draft.grokApiKey,
    grokModel: draft.grokModel,
    anthropicApiKey: draft.anthropicApiKey,
    anthropicModel: draft.anthropicModel,
    preferredAiProvider: draft.preferredAiProvider
  })) {
    if (value !== undefined && $(id) && !$(id).value) $(id).value = value;
  }
}

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.remove("hidden");
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add("hidden"), 4200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "処理に失敗しました");
  return body;
}

function setBusy(button, busy, label) {
  button.disabled = busy;
  if (label) button.textContent = busy ? "処理中" : label;
}

async function openMobileShare() {
  try {
    const body = await api("/api/network-url");
    const url = body.url || location.href;
    const panel = $("mobileSharePanel");
    $("mobileShareLink").textContent = url;
    $("mobileShareLink").href = url;
    $("mobileShareQr").src = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(url)}`;
    panel.classList.toggle("hidden");
    if (!panel.classList.contains("hidden")) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (error) {
    toast(error.message);
  }
}

function classifyMessage(message) {
  const text = `${message.from?.name || ""} ${message.from?.email || ""} ${message.subject || ""} ${message.snippet || ""}`.toLowerCase();
  const noReply = /no-reply|noreply|notification|newsletter|auto-confirm|shipment|tracking|order-update|配信専用|自動送信|送信専用|返信できません|返信いただいても|配信停止|メルマガ|クーポン|キャンペーン|accounts\.google|tm\.openai|netflix|amazon|temu|promo|news@|mailnews|wester|skyscanner|agoda|fantia|gap|nitori|honto|elsa|menu|epark/.test(text);
  const critical = /最重要|重要|至急|緊急|本日中|明日まで|締切|〆切|期限|提出|面接|面談|選考|内定|採用|saiyo|recruit|適性検査|webテスト|ウェブテスト|インターン/.test(text);
  const action = /お問い合わせ|ご返信|返信|希望条件|内見|予約|面談|日程|候補日|締切|受験|適性検査|採用|saiyo|fudosan|assist-jpn|onecareer|openwork|linkedin|pwc/.test(text);
  const notice = /セキュリティ|変更|口座|決済|ご利用|通知|確認|発送|注文|キャンセル|イベント|セミナー|インターン/.test(text);

  if (critical && !/メルマガ|クーポン|キャンペーン|promo|newsletter/.test(text)) {
    return { key: "critical", label: "最重要!" };
  }
  if (action && !noReply) {
    return { key: "action", label: "対応" };
  }
  if (action) return { key: "notice", label: "確認" };
  if (notice && !noReply) return { key: "notice", label: "確認" };
  return { key: "skip", label: "通知" };
}

function visibleMessages() {
  if (state.filter === "all") return state.messages;
  if (state.filter === "action") {
    return state.messages.filter((message) => {
      const key = classifyMessage(message).key;
      return key === "action" || key === "critical";
    });
  }
  return state.messages.filter((message) => classifyMessage(message).key === state.filter);
}

async function loadStatus() {
  state.status = await api("/api/status");
  const aiLabel = state.status.activeAiProvider ? ` / AI: ${state.status.activeAiProvider}` : "";
  $("connectionText").textContent = state.status.gmailConnected
    ? `${state.status.email} と接続済み${aiLabel}`
    : state.status.googleConfigured
      ? "Gmailはまだ接続されていません"
      : "Google OAuth情報を設定してください";
  if ($("preferredAiProvider") && state.status.savedConfig?.preferredAiProvider !== undefined) {
    $("preferredAiProvider").value = state.status.savedConfig.preferredAiProvider;
  }
  $("connectButton").textContent = state.status.gmailConnected ? "再接続" : "Gmail接続";
  $("setupPanel").classList.toggle("hidden", state.status.googleConfigured && !new URLSearchParams(location.search).has("setup"));
  $("setupGuide").classList.toggle("hidden", state.status.gmailConnected);
  renderAccounts();

  const p = state.status.profile || {};
  $("profileName").value = p.name || "";
  $("profileRole").value = p.role || "";
  $("profileCompany").value = p.company || "";
  $("profileFacts").value = p.facts || "";
  $("profileTone").value = p.tone || "";
  $("profileSignature").value = p.signature || "";
  restoreSetupDraft();
}

function renderAccounts() {
  const select = $("accountSelect");
  select.innerHTML = "";
  const accounts = state.status?.accounts || [];
  const all = document.createElement("option");
  all.value = "all";
  all.textContent = accounts.length > 1 ? "全アカウント" : "現在のアカウント";
  select.appendChild(all);
  for (const account of accounts) {
    const option = document.createElement("option");
    option.value = account.email;
    option.textContent = account.active ? `${account.email} / 使用中` : account.email;
    select.appendChild(option);
  }
  state.account = accounts.length > 1 ? "all" : state.status?.activeEmail || state.status?.email || "active";
  select.value = state.account === "active" ? "all" : state.account;
}

async function saveConfig() {
  const button = $("saveConfigButton");
  setBusy(button, true, "保存");
  try {
    saveSetupDraft();
    await api("/api/config", {
      method: "POST",
      body: JSON.stringify({
        googleClientId: $("googleClientId").value,
        googleClientSecret: $("googleClientSecret").value,
        openAIKey: $("openAIKey").value,
        openAIModel: $("openAIModel").value || "gpt-4o-mini",
        geminiApiKey: $("geminiApiKey").value,
        geminiModel: $("geminiModel").value || "gemini-2.5-flash",
        grokApiKey: $("grokApiKey").value,
        grokModel: $("grokModel").value || "grok-4",
        anthropicApiKey: $("anthropicApiKey") ? $("anthropicApiKey").value : "",
        anthropicModel: $("anthropicModel") ? $("anthropicModel").value || "claude-sonnet-4-6" : "claude-sonnet-4-6",
        preferredAiProvider: $("preferredAiProvider") ? $("preferredAiProvider").value : ""
      })
    });
    await loadStatus();
    saveSetupDraft();
    toast("接続設定を保存しました。Gmail接続を押してください。");
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false, "保存");
  }
}

async function saveProfile() {
  const button = $("saveProfileButton");
  setBusy(button, true, "保存");
  try {
    await api("/api/profile", {
      method: "POST",
      body: JSON.stringify({
        name: $("profileName").value,
        role: $("profileRole").value,
        company: $("profileCompany").value,
        facts: $("profileFacts").value,
        tone: $("profileTone").value,
        signature: $("profileSignature").value
      })
    });
    await loadStatus();
    toast("あなたの情報を保存しました。");
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false, "保存");
  }
}

async function loadMessages() {
  const button = $("loadButton");
  setBusy(button, true, "同期");
  renderMessageSkeleton();
  try {
    const maxValue = $("maxInput").value;
    let query = $("queryInput").value;
    let max = maxValue;
    if (maxValue === "year") {
      query = `${query} after:${new Date().getFullYear()}/1/1`;
      max = "all";
    }
    const params = new URLSearchParams({
      q: query,
      max,
      mode: max === "all" || max === "500" ? "metadata" : "full",
      account: $("accountSelect").value || "all"
    });
    const body = await api(`/api/messages?${params}`);
    state.messages = body.messages;
    renderMessages();
    const criticalCount = state.messages.filter((message) => classifyMessage(message).key === "critical").length;
    const actionCount = state.messages.filter((message) => classifyMessage(message).key === "action").length;
    $("mailboxSummary").textContent = `${state.messages.length}件中、最重要 ${criticalCount}件 / 対応候補 ${actionCount}件`;
    toast(`${state.messages.length}件読み込みました。最重要は${criticalCount}件、対応候補は${actionCount}件です。`);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false, "同期");
  }
}

function renderMessageSkeleton(count = 6) {
  $("messageList").innerHTML = Array.from(
    { length: count },
    () => `
      <div class="messageItem skeletonItem">
        <div class="skeletonLine short"></div>
        <div class="skeletonLine"></div>
        <div class="skeletonLine muted"></div>
      </div>`
  ).join("");
}

function renderMessages() {
  document.querySelector(".workspace")?.classList.remove("insightMode");
  const list = $("messageList");
  list.innerHTML = "";
  const messages = visibleMessages();
  if (!messages.length) {
    list.innerHTML = '<div class="emptyState">メールがありません。</div>';
    return;
  }

  for (const message of messages) {
    const category = classifyMessage(message);
    const item = document.createElement("div");
    item.className = `messageItem ${state.selected?.id === message.id ? "active" : ""}`;
    item.tabIndex = 0;
    item.innerHTML = `
      <div class="messageTop">
        <div class="messageFrom"></div>
        <div class="messageBadge ${category.key}"></div>
      </div>
      <div class="messageTitle"></div>
      <div class="messageSnippet"></div>
    `;
    item.querySelector(".messageTitle").textContent = message.subject || "(件名なし)";
    item.querySelector(".messageFrom").textContent = message.from.name || message.from.email || message.from.raw;
    item.querySelector(".messageBadge").textContent = category.label;
    item.querySelector(".messageSnippet").textContent = message.snippet || "";
    item.addEventListener("click", () => selectMessage(message));
    item.addEventListener("keydown", (event) => {
      if (event.key === "Enter") selectMessage(message);
    });
    list.appendChild(item);
  }
}

async function selectMessage(message) {
  if (!message.body) {
    try {
      const body = await api(`/api/messages/${encodeURIComponent(message.id)}?account=${encodeURIComponent(message.accountEmail || $("accountSelect").value || "all")}`);
      message = { ...message, ...body.message };
      state.messages = state.messages.map((item) => (item.id === message.id ? message : item));
    } catch (error) {
      toast(error.message);
    }
  }
  state.selected = message;
  const category = classifyMessage(message);
  renderMessages();
  $("emptyState").classList.add("hidden");
  $("detailContent").classList.remove("hidden");
  $("insightContent").classList.add("hidden");
  $("mailSubject").textContent = message.subject || "(件名なし)";
  $("mailMeta").textContent = `${message.from.raw} / ${message.date}`;
  $("mailBody").textContent = message.body || message.snippet || "";
  $("replyOutput").value = "";
  $("instructionInput").value = "";
  $("mailCategory").textContent = category.label;
  $("mailCategory").className = `categoryPill ${category.key}`;
  $("importanceText").textContent =
    category.key === "critical" ? "最重要" : category.key === "action" ? "対応必要" : category.key === "notice" ? "確認" : "低";
  $("nextActionText").textContent =
    category.key === "critical"
      ? "先に確認"
      : category.key === "action"
        ? "返信作成"
        : category.key === "notice"
          ? "内容確認"
          : "後でOK";
  $("replyHint").textContent =
    category.key === "critical"
      ? "重要そうです。本文を確認して、必要ならすぐ返信下書きを作れます。"
      : category.key === "action"
      ? "返信が必要そうです。方針を選ぶか一言だけ入力して作成できます。"
      : category.key === "notice"
        ? "返信より確認向きです。必要なら短い確認メールを作れます。"
        : "通知メールです。通常は返信不要です。";

  const sender = state.status?.senders?.[message.from.email] || {};
  $("senderName").value = sender.name || message.from.name || "";
  $("senderRelationship").value = sender.relationship || "";
  $("senderTone").value = sender.tone || "自然な敬語";
  $("senderFacts").value = sender.facts || "";
  $("senderAvoid").value = sender.avoid || "";
}

async function copySubject() {
  if (!state.selected) return;
  try {
    await navigator.clipboard.writeText(state.selected.subject || "");
    toast("件名をコピーしました。");
  } catch {
    toast("コピーできませんでした。");
  }
}

function showInsight(title, meta, html) {
  document.querySelector(".workspace")?.classList.add("insightMode");
  $("emptyState").classList.add("hidden");
  $("detailContent").classList.add("hidden");
  $("insightContent").classList.remove("hidden");
  $("insightTitle").textContent = title;
  $("insightMeta").textContent = meta;
  $("insightBody").innerHTML = html;
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortEventTitle(item) {
  const from = (item.from || "").replace(/[【】"「」]/g, "").replace(/運営事務局|新卒採用担当|人事部|事務局|株式会社/g, "").trim();
  const subject = item.title || "";
  const company =
    from ||
    (subject.match(/【([^】]{2,18})】/) || [])[1] ||
    (subject.match(/＜([^＞]{2,18})＞/) || [])[1] ||
    "予定";
  let kind = "イベント";
  if (/web|ウェブ|適性検査|テスト|受験/i.test(subject + item.snippet)) kind = "Webテスト";
  else if (/締切|〆切|期限|応募|エントリー/i.test(subject + item.snippet)) kind = "締切";
  else if (/面接|面談/i.test(subject + item.snippet)) kind = "面談";
  else if (/説明会|セミナー|合説|座談会/i.test(subject + item.snippet)) kind = "説明会";
  else if (/インターン/i.test(subject + item.snippet)) kind = "インターン";
  return `${company.slice(0, 12)} ${kind}`;
}

function monthLabel(year, monthIndex) {
  return `${year}年${monthIndex + 1}月`;
}

function buildCalendar(items) {
  const dated = items.filter((item) => item.date);
  const undated = items.filter((item) => !item.date);
  const grouped = new Map();
  for (const item of dated) {
    const key = item.date.slice(0, 7);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }

  const months = Array.from(grouped.keys()).sort((a, b) => b.localeCompare(a));
  const monthHtml = months
    .map((key) => {
      const [year, month] = key.split("-").map(Number);
      const first = new Date(year, month - 1, 1);
      const last = new Date(year, month, 0);
      const itemsByDate = new Map();
      for (const item of grouped.get(key)) {
        if (!itemsByDate.has(item.date)) itemsByDate.set(item.date, []);
        itemsByDate.get(item.date).push(item);
      }
      const blanks = Array.from({ length: first.getDay() }, () => '<div class="calendarCell mutedCell"></div>').join("");
      const days = Array.from({ length: last.getDate() }, (_, index) => {
        const day = index + 1;
        const date = `${key}-${String(day).padStart(2, "0")}`;
        const dayItems = itemsByDate.get(date) || [];
        return `
          <div class="calendarCell ${dayItems.length ? "hasEvents" : ""}">
            <div class="dayNumber">${day}</div>
            <div class="dayEvents">
              ${dayItems
                .slice(0, 4)
                .map((item) => {
                  const itemIndex = state.scheduleItems.indexOf(item);
                  return `<button class="calendarEvent ${item.type === "締切" ? "deadline" : ""}" data-schedule-index="${itemIndex}">${escapeHtml(shortEventTitle(item))}</button>`;
                })
                .join("")}
              ${dayItems.length > 4 ? `<span class="moreEvents">+${dayItems.length - 4}</span>` : ""}
            </div>
          </div>`;
      }).join("");
      return `
        <section class="calendarMonth">
          <h3>${monthLabel(year, month - 1)}</h3>
          <div class="weekdayRow">
            <span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span>
          </div>
          <div class="calendarGrid">${blanks}${days}</div>
        </section>`;
    })
    .join("");

  const undatedHtml = undated.length
    ? `<section class="undatedBox">
        <h3>日付要確認</h3>
        ${undated
          .map((item) => {
            const itemIndex = state.scheduleItems.indexOf(item);
            return `<button class="undatedEvent" data-schedule-index="${itemIndex}">${escapeHtml(shortEventTitle(item))}</button>`;
          })
          .join("")}
      </section>`
    : "";

  return `
    <div class="calendarLayout">
      <div class="calendarBoard">${monthHtml || '<div class="emptyState">日付つきの日程は見つかりませんでした。</div>'}${undatedHtml}</div>
      <aside class="eventDetail" id="eventDetail">
        <h3>予定を選択</h3>
        <p>カレンダー内の予定をクリックすると、URL・時間・内容をここに表示します。</p>
      </aside>
    </div>`;
}

function renderScheduleDetail(index) {
  const item = state.scheduleItems[Number(index)];
  if (!item) return;
  const detail = $("eventDetail");
  const urls = (item.urls || []).length
    ? item.urls.map((url) => `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a>`).join("")
    : "<p>URLは見つかりませんでした。</p>";
  detail.innerHTML = `
    <div class="eventType ${item.type === "締切" ? "deadline" : ""}">${escapeHtml(item.type)}</div>
    <h3>${escapeHtml(shortEventTitle(item))}</h3>
    <dl class="eventMeta">
      <dt>日付</dt><dd>${escapeHtml(item.date || "日付要確認")}</dd>
      <dt>時間</dt><dd>${escapeHtml(item.time || "時間未記載")}</dd>
      <dt>送信元</dt><dd>${escapeHtml(item.from || "")}</dd>
      <dt>アカウント</dt><dd>${escapeHtml(item.accountEmail || "")}</dd>
    </dl>
    <div class="eventBlock">
      <strong>内容</strong>
      <p>${escapeHtml(item.snippet || item.content || "")}</p>
    </div>
    <div class="eventBlock urlList">
      <strong>URL</strong>
      ${urls}
    </div>
    <button class="openOriginalButton" data-open-original="${index}">メール原文を見る</button>`;
}

async function openOriginalFromSchedule(index) {
  const item = state.scheduleItems[Number(index)];
  if (!item?.messageId) return;
  try {
    const body = await api(`/api/messages/${encodeURIComponent(item.messageId)}?account=${encodeURIComponent(item.accountEmail || $("accountSelect").value || "all")}`);
    await selectMessage(body.message);
  } catch (error) {
    toast(error.message);
  }
}

async function loadSchedule() {
  const button = $("scheduleButton");
  setBusy(button, true, "就活日程");
  try {
    const params = new URLSearchParams({ account: $("accountSelect").value || "all", max: "180" });
    const body = await api(`/api/career/schedule?${params}`);
    state.scheduleItems = body.items || [];
    const html = state.scheduleItems.length ? buildCalendar(state.scheduleItems) : '<div class="emptyState">日程や締切は見つかりませんでした。</div>';
    showInsight("就活日程", `${body.scanned}件のメールを確認しました`, html);
    $("insightBody").querySelectorAll("[data-schedule-index]").forEach((button) => {
      button.addEventListener("click", () => renderScheduleDetail(button.dataset.scheduleIndex));
    });
    $("insightBody").addEventListener("click", (event) => {
      const button = event.target.closest("[data-open-original]");
      if (button) openOriginalFromSchedule(button.dataset.openOriginal);
    });
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false, "就活日程");
  }
}

async function loadDigest(period, label) {
  const button = $(`digest${label}Button`);
  const text = button.textContent;
  setBusy(button, true, text);
  try {
    const params = new URLSearchParams({ account: $("accountSelect").value || "all", period, max: "80" });
    const body = await api(`/api/digest?${params}`);
    const html = `
      <pre class="digestText">${escapeHtml(body.digest)}</pre>
      <div class="digestList">
        ${body.messages
          .map(
            (message) => `
              <div class="digestItem">
                <strong>${escapeHtml(message.subject)}</strong>
                <p>${escapeHtml(message.from?.name || message.from?.email || "")} ${message.accountEmail ? ` / ${escapeHtml(message.accountEmail)}` : ""}</p>
                <p>${escapeHtml(message.snippet)}</p>
              </div>`
          )
          .join("")}
      </div>`;
    showInsight(text, `${body.scanned}件のメールを確認しました`, html);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false, text);
  }
}

async function saveSender() {
  if (!state.selected) return;
  const button = $("saveSenderButton");
  setBusy(button, true, "保存");
  try {
    await api("/api/senders", {
      method: "POST",
      body: JSON.stringify({
        email: state.selected.from.email,
        name: $("senderName").value,
        relationship: $("senderRelationship").value,
        tone: $("senderTone").value,
        facts: $("senderFacts").value,
        avoid: $("senderAvoid").value
      })
    });
    await loadStatus();
    toast("送信者メモを保存しました。");
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false, "保存");
  }
}

async function generateReply() {
  if (!state.selected) return;
  await saveSender();
  const button = $("generateButton");
  setBusy(button, true, "作成");
  try {
    const body = await api("/api/reply", {
      method: "POST",
      body: JSON.stringify({
        message: state.selected,
        instruction: $("instructionInput").value
      })
    });
    $("replyOutput").value = body.reply;
    toast("返信下書きを作成しました。");
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false, "作成");
  }
}

async function saveDraft() {
  if (!state.selected || !$("replyOutput").value.trim()) {
    toast("返信本文を入力してください。");
    return;
  }
  const button = $("draftButton");
  setBusy(button, true, "下書き保存");
  try {
    await api("/api/draft", {
      method: "POST",
      body: JSON.stringify({
        message: state.selected,
        reply: $("replyOutput").value
      })
    });
    toast("Gmailに下書きを保存しました。");
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false, "下書き保存");
  }
}

async function runAiCommand() {
  const input = $("aiCommandInput").value.trim();
  if (!input) return;
  const button = $("aiCommandButton");
  setBusy(button, true, "反映");
  try {
    const body = await api("/api/ai-command", {
      method: "POST",
      body: JSON.stringify({ command: input })
    });
    applyCommand(body);
  } catch (error) {
    toast(error.message);
  } finally {
    setBusy(button, false, "反映");
  }
}

function applyCommand(cmd) {
  const message = cmd.message || "コマンドを実行しました。";
  switch (cmd.action) {
    case "switch-tab": {
      const button = document.querySelector(`.folderButton[data-tab="${cmd.tab}"]`);
      if (button) { button.click(); $("aiCommandInput").value = ""; }
      else toast(`タブ「${cmd.tab}」が見つかりません。`);
      break;
    }
    case "switch-filter": {
      const button = document.querySelector(`.triageButton[data-filter="${cmd.filter}"]`);
      if (button) { button.click(); $("aiCommandInput").value = ""; }
      break;
    }
    case "switch-ai": {
      if ($("preferredAiProvider")) {
        $("preferredAiProvider").value = cmd.provider;
        saveConfig().then(() => { $("aiCommandInput").value = ""; });
      }
      break;
    }
    case "set-max": {
      $("maxInput").value = cmd.max;
      $("aiCommandInput").value = "";
      break;
    }
    case "open-setup": {
      $("setupPanel").classList.remove("hidden");
      $("setupPanel").scrollIntoView({ behavior: "smooth" });
      $("aiCommandInput").value = "";
      break;
    }
    case "sync": {
      loadMessages();
      $("aiCommandInput").value = "";
      break;
    }
    default:
      break;
  }
  toast(message);
}

$("saveProfileButton").addEventListener("click", saveProfile);
$("saveConfigButton").addEventListener("click", saveConfig);
$("mobileShareButton").addEventListener("click", openMobileShare);
$("loadButton").addEventListener("click", loadMessages);
$("saveSenderButton").addEventListener("click", saveSender);
$("generateButton").addEventListener("click", generateReply);
$("draftButton").addEventListener("click", saveDraft);
$("copySubjectButton").addEventListener("click", copySubject);
$("scheduleButton").addEventListener("click", loadSchedule);
$("digestTodayButton").addEventListener("click", () => loadDigest("today", "Today"));
$("digestWeekButton").addEventListener("click", () => loadDigest("week", "Week"));
$("digestMonthButton").addEventListener("click", () => loadDigest("month", "Month"));
["googleClientId", "googleClientSecret", "openAIKey", "openAIModel", "geminiApiKey", "geminiModel", "grokApiKey", "grokModel"].forEach((id) => {
  $(id)?.addEventListener("input", saveSetupDraft);
});
$("aiCommandButton").addEventListener("click", runAiCommand);
$("aiCommandInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") runAiCommand();
});
let controlsManualOpen = false;

$("controlToggleButton").addEventListener("click", () => {
  document.body.classList.toggle("controlsCollapsed");
  controlsManualOpen = !document.body.classList.contains("controlsCollapsed");
  $("controlToggleButton").setAttribute("aria-expanded", String(controlsManualOpen));
});

function syncControlsWithScroll() {
  const workspace = document.querySelector(".workspace");
  if (!workspace) return;
  if (window.scrollY <= 36) controlsManualOpen = false;
  const shouldCollapse = window.scrollY > 36 && workspace.getBoundingClientRect().top < window.innerHeight / 3;
  const collapsed = shouldCollapse && !controlsManualOpen;
  document.body.classList.toggle("controlsCollapsed", collapsed);
  $("controlToggleButton").setAttribute("aria-expanded", String(!collapsed));
}

window.addEventListener("scroll", syncControlsWithScroll, { passive: true });
window.addEventListener("resize", syncControlsWithScroll);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}

$("accountSelect").addEventListener("change", async () => {
  const email = $("accountSelect").value;
  if (email !== "all") {
    await api("/api/accounts/active", { method: "POST", body: JSON.stringify({ email }) });
    await loadStatus();
  }
  loadMessages();
});

document.querySelectorAll(".folderButton").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".folderButton").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    $("queryInput").value = button.dataset.query;
    $("mailboxTitle").textContent = button.dataset.title || button.textContent;
    loadMessages();
  });
});

document.querySelectorAll(".triageButton").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".triageButton").forEach((item) => item.classList.remove("active"));
    button.classList.add("active");
    state.filter = button.dataset.filter;
    renderMessages();
  });
});

document.querySelectorAll(".quickIntents button").forEach((button) => {
  button.addEventListener("click", () => {
    $("instructionInput").value = button.dataset.intent;
  });
});

loadStatus()
  .then(() => {
    if (state.status?.gmailConnected) loadMessages();
  })
  .catch((error) => toast(error.message));
