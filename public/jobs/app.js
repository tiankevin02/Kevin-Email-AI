/* ===== Constants ===== */
const STATUSES = [
  { value: "エントリー",  chip: "chip-entry",   label: "エントリー" },
  { value: "ES提出中",    chip: "chip-es",      label: "ES提出中" },
  { value: "書類選考中",  chip: "chip-screen",  label: "書類選考中" },
  { value: "WEBテスト",   chip: "chip-webtest", label: "WEBテスト" },
  { value: "一次面接",    chip: "chip-int1",    label: "一次面接" },
  { value: "二次面接",    chip: "chip-int2",    label: "二次面接" },
  { value: "最終面接",    chip: "chip-final",   label: "最終面接" },
  { value: "内定",        chip: "chip-offer",   label: "内定" },
  { value: "お見送り",    chip: "chip-reject",  label: "お見送り" },
  { value: "辞退",        chip: "chip-decline", label: "辞退" },
];

const EVENT_TYPES = ["ES締切", "WEBテスト", "説明会", "面接", "内定式", "その他"];

const EVENT_COLORS = {
  "ES締切": "#2563eb",
  "WEBテスト": "#0891b2",
  "説明会": "#7c3aed",
  "面接": "#d97706",
  "内定式": "#059669",
  "その他": "#6b7280",
};

const INTERVIEW_TYPES = ["一次面接", "二次面接", "三次面接", "最終面接", "グループ面接", "OB/OG訪問", "カジュアル面談"];
const INTERVIEW_FORMATS = ["オンライン", "対面", "電話"];
const INTERVIEW_RESULTS = ["合格", "不合格", "結果待ち"];

/* ===== State ===== */
let state = { companies: [], schedules: [] };
let currentView = "dashboard";
let currentCompanyId = null;
let currentCompanyTab = "overview";
function jstNow() {
  // UTC+9時間を足してJSTを得る
  return new Date(Date.now() + 9 * 60 * 60 * 1000);
}

let calYear = jstNow().getUTCFullYear();
let calMonth = jstNow().getUTCMonth();
let calSelectedDate = null;
let filterStatus = "all";
let searchQuery = "";
let saveTimer = null;

/* ===== Helpers ===== */
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function now() {
  const d = jstNow();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}T${String(d.getUTCHours()).padStart(2,"0")}:${String(d.getUTCMinutes()).padStart(2,"0")}:${String(d.getUTCSeconds()).padStart(2,"0")}+09:00`;
}

function today() {
  const d = jstNow();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}-${String(d.getUTCDate()).padStart(2,"0")}`;
}

function fmtDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
}

function fmtDateFull(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

function fmtDatetime(iso) {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  const mo = d.getUTCMonth() + 1;
  const dd = d.getUTCDate();
  const h = d.getUTCHours();
  const mn = d.getUTCMinutes();
  return `${mo}/${dd} ${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`;
}

function statusChip(val) {
  const s = STATUSES.find((x) => x.value === val) || STATUSES[0];
  return `<span class="chip ${s.chip}">${s.label}</span>`;
}

function statusChipSm(val) {
  const s = STATUSES.find((x) => x.value === val) || STATUSES[0];
  return `<span class="chip chip-sm ${s.chip}">${s.label}</span>`;
}

function getCompany(id) {
  return state.companies.find((c) => c.id === id);
}

function escHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function markdownToHtml(md) {
  if (!md) return "";
  let html = escHtml(md);
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/^---+$/gm, "<hr>");
  html = html.replace(/^[-・]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, "<li>$2</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = `<p>${html}</p>`;
  html = html.replace(/<p>\s*(<h[23]>)/g, "$1");
  html = html.replace(/(<\/h[23]>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<ul>)/g, "$1");
  html = html.replace(/(<\/ul>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*(<hr>)\s*<\/p>/g, "$1");
  html = html.replace(/<p>\s*<\/p>/g, "");
  return html;
}

/* ===== Toast ===== */
function toast(msg, dur = 3200) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove("show"), dur);
}

/* ===== API ===== */
async function fetchJson(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "content-type": "application/json", ...(opts.headers || {}) },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function loadData() {
  try {
    const data = await fetchJson("/api/jobs");
    state.companies = data.companies || [];
    state.schedules = data.schedules || [];
  } catch {
    state.companies = [];
    state.schedules = [];
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveData, 800);
}

async function saveData() {
  try {
    await fetchJson("/api/jobs", {
      method: "POST",
      body: JSON.stringify({ companies: state.companies, schedules: state.schedules }),
    });
  } catch {
    toast("保存に失敗しました");
  }
}

/* ===== Modal ===== */
function openModal(title, bodyHtml, footerHtml) {
  document.getElementById("modal-title").textContent = title;
  document.getElementById("modal-body").innerHTML = bodyHtml;
  document.getElementById("modal-footer").innerHTML = footerHtml || "";
  document.getElementById("modal-overlay").classList.remove("hidden");
}

function closeModal() {
  document.getElementById("modal-overlay").classList.add("hidden");
}

document.getElementById("modal-close").addEventListener("click", closeModal);
document.getElementById("modal-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeModal();
});

/* ===== Router ===== */
function navigate(hash) {
  location.hash = hash;
}

function handleRoute() {
  const hash = location.hash || "#dashboard";
  const parts = hash.slice(1).split("/");
  const view = parts[0] || "dashboard";

  document.querySelectorAll(".nav-item, .mobile-nav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === view);
  });

  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));

  const viewEl = document.getElementById(`view-${view}`);
  if (!viewEl) return;
  viewEl.classList.add("active");

  currentView = view;

  if (view === "dashboard") renderDashboard();
  else if (view === "companies") renderCompanies();
  else if (view === "company") {
    currentCompanyId = parts[1] || null;
    currentCompanyTab = parts[2] || "overview";
    renderCompany();
  } else if (view === "calendar") renderCalendar();
  else if (view === "analysis") renderAnalysis();
  else if (view === "settings") renderSettings();
}

window.addEventListener("hashchange", handleRoute);

/* ===== Dashboard ===== */
function renderDashboard() {
  const el = document.getElementById("view-dashboard");
  const companies = state.companies;
  const total = companies.length;
  const active = companies.filter((c) => !["内定", "辞退", "お見送り"].includes(c.status)).length;
  const offers = companies.filter((c) => c.status === "内定").length;
  const interviews = companies.filter((c) => ["一次面接", "二次面接", "三次面接", "最終面接"].includes(c.status)).length;

  const upcomingEvts = state.schedules
    .filter((s) => s.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5);

  const recentCompanies = [...companies]
    .sort((a, b) => (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || ""))
    .slice(0, 5);

  el.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">ダッシュボード</div>
        <div class="view-subtitle">就活の進捗を一目で確認</div>
      </div>
      <button class="btn btn-primary" onclick="openAddCompanyModal()">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
        企業を追加
      </button>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">登録企業</div>
        <div class="stat-value">${total}</div>
        <div class="stat-delta">社</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">選考中</div>
        <div class="stat-value" style="color:var(--accent)">${active}</div>
        <div class="stat-delta">社</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">面接中</div>
        <div class="stat-value" style="color:var(--yellow)">${interviews}</div>
        <div class="stat-delta">社</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">内定</div>
        <div class="stat-value" style="color:var(--green)">${offers}</div>
        <div class="stat-delta">社</div>
      </div>
    </div>

    <div class="dashboard-grid">
      <div class="card">
        <div class="card-header">
          <span class="card-title">今後の予定</span>
          <a href="#calendar" class="btn btn-ghost btn-sm">すべて見る</a>
        </div>
        <div class="card-body">
          ${
            upcomingEvts.length
              ? `<div>${upcomingEvts
                  .map((evt) => {
                    const [, mo, dd] = evt.date.split("-");
                    const co = evt.companyId ? getCompany(evt.companyId)?.name || "" : "";
                    const col = EVENT_COLORS[evt.type] || EVENT_COLORS["その他"];
                    return `
                    <div class="upcoming-item">
                      <div class="upcoming-date">
                        <div class="upcoming-date-day">${parseInt(dd)}</div>
                        <div class="upcoming-date-month">${parseInt(mo)}月</div>
                      </div>
                      <div style="width:3px;align-self:stretch;background:${col};border-radius:999px;flex-shrink:0"></div>
                      <div class="upcoming-info">
                        <div class="upcoming-title">${escHtml(evt.title)}</div>
                        <div class="upcoming-company">${escHtml(co)}${evt.time ? " · " + evt.time : ""}</div>
                      </div>
                    </div>`;
                  })
                  .join("")}</div>`
              : `<div class="empty-state" style="padding:24px">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd"/></svg>
                  <p>予定はありません</p>
                </div>`
          }
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">最近の企業</span>
          <a href="#companies" class="btn btn-ghost btn-sm">すべて見る</a>
        </div>
        <div class="card-body">
          ${
            recentCompanies.length
              ? recentCompanies
                  .map(
                    (c) => `
                  <div class="upcoming-item" style="cursor:pointer" onclick="navigate('#company/${c.id}')">
                    <div class="upcoming-info">
                      <div class="upcoming-title">${escHtml(c.name)}</div>
                      <div class="upcoming-company">${escHtml(c.industry || "")}</div>
                    </div>
                    ${statusChipSm(c.status)}
                  </div>`
                  )
                  .join("")
              : `<div class="empty-state" style="padding:24px">
                  <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clip-rule="evenodd"/></svg>
                  <p>企業がありません</p>
                </div>`
          }
        </div>
      </div>
    </div>
  `;
}

/* ===== Companies ===== */
function renderCompanies() {
  const el = document.getElementById("view-companies");
  el.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">企業管理</div>
        <div class="view-subtitle">${state.companies.length}社を登録中</div>
      </div>
      <button class="btn btn-primary" onclick="openAddCompanyModal()">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
        企業を追加
      </button>
    </div>

    <div class="search-bar">
      <div class="search-input-wrap">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"/></svg>
        <input class="search-input" id="company-search" placeholder="企業名・業界で検索" value="${escHtml(searchQuery)}" oninput="onSearchChange(this.value)" />
      </div>
    </div>

    <div class="filter-chips" id="status-filters">
      <button class="filter-chip ${filterStatus === "all" ? "active" : ""}" onclick="setStatusFilter('all')">すべて</button>
      ${STATUSES.map(
        (s) =>
          `<button class="filter-chip ${filterStatus === s.value ? "active" : ""}" onclick="setStatusFilter('${s.value}')">${s.label}</button>`
      ).join("")}
    </div>

    <div style="margin-top:16px" id="companies-list"></div>
  `;

  renderCompaniesList();
}

function renderCompaniesList() {
  const el = document.getElementById("companies-list");
  if (!el) return;

  let filtered = state.companies;
  if (filterStatus !== "all") filtered = filtered.filter((c) => c.status === filterStatus);
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter((c) => c.name.toLowerCase().includes(q) || (c.industry || "").toLowerCase().includes(q));
  }

  filtered = [...filtered].sort((a, b) =>
    (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "")
  );

  if (!filtered.length) {
    el.innerHTML = `
      <div class="empty-state">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clip-rule="evenodd"/></svg>
        <h3>${state.companies.length === 0 ? "企業がありません" : "該当する企業がありません"}</h3>
        <p>${state.companies.length === 0 ? "「企業を追加」から企業を登録しましょう" : "検索条件を変更してください"}</p>
      </div>
    `;
    return;
  }

  el.innerHTML = `<div class="companies-grid">${filtered.map(companyCardHtml).join("")}</div>`;
}

function companyCardHtml(c) {
  const hasEs = (c.es || []).length > 0;
  const hasWebtest = !!(c.webTest?.notes || c.webTest?.aiInfo);
  const hasInterview = (c.interviews || []).length > 0;
  const date = c.updatedAt || c.createdAt;

  return `
    <div class="company-card" onclick="navigate('#company/${c.id}')">
      <div class="company-card-header">
        <div>
          <div class="company-name">${escHtml(c.name)}</div>
          <div class="company-industry">${escHtml(c.industry || "業界未設定")}</div>
        </div>
        ${statusChip(c.status)}
      </div>
      <div class="company-card-footer">
        <div class="company-progress">
          <div class="progress-dot ${hasEs ? "done" : ""}" title="ES"></div>
          <div class="progress-dot ${hasWebtest ? "done" : ""}" title="WEBテスト"></div>
          <div class="progress-dot ${hasInterview ? "done" : ""}" title="面接"></div>
          <span class="text-sm text-muted" style="margin-left:4px">ES・WEB・面接</span>
        </div>
        <span class="company-date">${date ? fmtDatetime(date) : ""}</span>
      </div>
    </div>
  `;
}

function onSearchChange(val) {
  searchQuery = val;
  renderCompaniesList();
}

function setStatusFilter(val) {
  filterStatus = val;
  renderCompanies();
}

/* ===== Add Company Modal ===== */
function openAddCompanyModal(prefill = {}) {
  const isEdit = !!prefill.id;
  const body = `
    <div class="form-group">
      <label class="form-label">企業名 <span style="color:var(--red)">*</span></label>
      <input class="form-input" id="m-name" placeholder="例: 株式会社〇〇" value="${escHtml(prefill.name || "")}" />
    </div>
    <div class="two-col mt-3">
      <div class="form-group">
        <label class="form-label">業界</label>
        <input class="form-input" id="m-industry" placeholder="例: IT・コンサル" value="${escHtml(prefill.industry || "")}" />
      </div>
      <div class="form-group">
        <label class="form-label">ステータス</label>
        <select class="form-select" id="m-status">
          ${STATUSES.map((s) => `<option value="${s.value}" ${prefill.status === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="form-group mt-3">
      <label class="form-label">企業URL</label>
      <input class="form-input" id="m-url" type="url" placeholder="https://..." value="${escHtml(prefill.url || "")}" />
    </div>
    <div class="form-group mt-3">
      <label class="form-label">志望動機・メモ</label>
      <textarea class="form-textarea" id="m-notes" rows="3" placeholder="志望理由や調べたことを記録">${escHtml(prefill.notes || "")}</textarea>
    </div>
  `;

  const footer = `
    ${isEdit ? `<button class="btn btn-danger btn-sm" onclick="deleteCompany('${prefill.id}')">削除</button>` : ""}
    <div style="flex:1"></div>
    <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    <button class="btn btn-primary" onclick="saveCompany(${isEdit ? `'${prefill.id}'` : "null"})">${isEdit ? "更新" : "追加"}</button>
  `;

  openModal(isEdit ? "企業を編集" : "企業を追加", body, footer);
  document.getElementById("m-name")?.focus();
}

function saveCompany(editId) {
  const name = document.getElementById("m-name")?.value.trim();
  if (!name) { toast("企業名を入力してください"); return; }

  if (editId) {
    const c = getCompany(editId);
    if (!c) return;
    c.name = name;
    c.industry = document.getElementById("m-industry")?.value.trim() || "";
    c.status = document.getElementById("m-status")?.value || "エントリー";
    c.url = document.getElementById("m-url")?.value.trim() || "";
    c.notes = document.getElementById("m-notes")?.value.trim() || "";
    c.updatedAt = now();
    toast("更新しました");
  } else {
    state.companies.push({
      id: uid(),
      name,
      industry: document.getElementById("m-industry")?.value.trim() || "",
      status: document.getElementById("m-status")?.value || "エントリー",
      url: document.getElementById("m-url")?.value.trim() || "",
      notes: document.getElementById("m-notes")?.value.trim() || "",
      es: [],
      webTest: { notes: "", aiInfo: null },
      interviews: [],
      createdAt: now(),
      updatedAt: now(),
    });
    toast("企業を追加しました");
  }

  scheduleSave();
  closeModal();
  if (currentView === "companies") renderCompaniesList();
  else if (currentView === "dashboard") renderDashboard();
  else if (currentView === "company" && currentCompanyId === editId) renderCompany();
}

function deleteCompany(id) {
  if (!confirm("この企業を削除しますか？")) return;
  state.companies = state.companies.filter((c) => c.id !== id);
  scheduleSave();
  closeModal();
  toast("削除しました");
  navigate("#companies");
}

/* ===== Company Detail ===== */
function renderCompany() {
  const el = document.getElementById("view-company");
  const c = getCompany(currentCompanyId);

  if (!c) {
    el.innerHTML = `<div class="empty-state"><p>企業が見つかりません</p><a href="#companies" class="btn btn-secondary mt-3">企業一覧へ</a></div>`;
    return;
  }

  el.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-top">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="navigate('#companies')" style="margin-bottom:8px;padding-left:4px">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
            企業一覧
          </button>
          <div class="detail-company-name">${escHtml(c.name)}</div>
          <div class="detail-company-sub">${escHtml(c.industry || "")}${c.url ? ` · <a href="${escHtml(c.url)}" target="_blank" rel="noreferrer" style="color:var(--accent)">${escHtml(c.url)}</a>` : ""}</div>
        </div>
        <div class="detail-actions">
          ${statusChip(c.status)}
          <button class="btn btn-secondary btn-sm" onclick="openAddCompanyModal(${JSON.stringify(c).replace(/"/g, "&quot;")})">編集</button>
        </div>
      </div>
      <div>
        <span style="font-size:12px;color:var(--text-3)">ステータスを変更: </span>
        <select class="form-select" style="width:auto;display:inline-block;padding:4px 28px 4px 8px;font-size:12.5px;min-height:28px" onchange="changeCompanyStatus('${c.id}', this.value)">
          ${STATUSES.map((s) => `<option value="${s.value}" ${c.status === s.value ? "selected" : ""}>${s.label}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="tabs">
      <button class="tab-btn ${currentCompanyTab === "overview" ? "active" : ""}" onclick="switchCompanyTab('overview')">概要</button>
      <button class="tab-btn ${currentCompanyTab === "es" ? "active" : ""}" onclick="switchCompanyTab('es')">ES <span style="font-size:11px;opacity:.6">(${(c.es || []).length})</span></button>
      <button class="tab-btn ${currentCompanyTab === "webtest" ? "active" : ""}" onclick="switchCompanyTab('webtest')">WEBテスト</button>
      <button class="tab-btn ${currentCompanyTab === "interview" ? "active" : ""}" onclick="switchCompanyTab('interview')">面接 <span style="font-size:11px;opacity:.6">(${(c.interviews || []).length})</span></button>
    </div>

    <div id="tab-overview" class="tab-panel ${currentCompanyTab === "overview" ? "active" : ""}">
      ${renderOverviewTab(c)}
    </div>
    <div id="tab-es" class="tab-panel ${currentCompanyTab === "es" ? "active" : ""}">
      ${renderEsTab(c)}
    </div>
    <div id="tab-webtest" class="tab-panel ${currentCompanyTab === "webtest" ? "active" : ""}">
      ${renderWebtestTab(c)}
    </div>
    <div id="tab-interview" class="tab-panel ${currentCompanyTab === "interview" ? "active" : ""}">
      ${renderInterviewTab(c)}
    </div>
  `;
}

function switchCompanyTab(tab) {
  currentCompanyTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b, i) => {
    const tabs = ["overview", "es", "webtest", "interview"];
    b.classList.toggle("active", tabs[i] === tab);
  });
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
  document.getElementById(`tab-${tab}`)?.classList.add("active");
  history.replaceState(null, "", `#company/${currentCompanyId}/${tab}`);
}

function changeCompanyStatus(id, status) {
  const c = getCompany(id);
  if (!c) return;
  c.status = status;
  c.updatedAt = now();
  scheduleSave();

  const headerChip = document.querySelector(".detail-header-top .detail-actions .chip");
  if (headerChip) {
    const s = STATUSES.find((x) => x.value === status) || STATUSES[0];
    headerChip.className = `chip ${s.chip}`;
    headerChip.textContent = s.label;
  }
  toast(`ステータスを「${status}」に変更しました`);
}

/* ===== Overview Tab ===== */
function renderOverviewTab(c) {
  return `
    <div style="display:grid;gap:16px;max-width:680px">
      <div class="card">
        <div class="card-header"><span class="card-title">基本情報</span></div>
        <div class="card-body" style="display:grid;gap:12px">
          <div class="form-group">
            <label class="form-label">企業名</label>
            <input class="form-input" value="${escHtml(c.name)}" onchange="updateCompanyField('${c.id}','name',this.value)" />
          </div>
          <div class="two-col">
            <div class="form-group">
              <label class="form-label">業界</label>
              <input class="form-input" value="${escHtml(c.industry || "")}" onchange="updateCompanyField('${c.id}','industry',this.value)" placeholder="例: コンサルティング" />
            </div>
            <div class="form-group">
              <label class="form-label">企業URL</label>
              <input class="form-input" type="url" value="${escHtml(c.url || "")}" onchange="updateCompanyField('${c.id}','url',this.value)" placeholder="https://..." />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">メモ・志望動機</label>
            <textarea class="form-textarea" rows="4" onchange="updateCompanyField('${c.id}','notes',this.value)" placeholder="志望理由、調査内容、気づきなど自由に記録">${escHtml(c.notes || "")}</textarea>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">選考スケジュール</span>
          <button class="btn btn-secondary btn-sm" onclick="openAddEventModal('${c.id}')">+ 予定を追加</button>
        </div>
        <div class="card-body">
          ${renderCompanyEvents(c)}
        </div>
      </div>
    </div>
  `;
}

function renderCompanyEvents(c) {
  const evts = state.schedules.filter((s) => s.companyId === c.id).sort((a, b) => a.date.localeCompare(b.date));
  if (!evts.length) return `<p class="text-muted" style="text-align:center;padding:12px 0">予定がありません</p>`;
  return evts
    .map((evt) => {
      const col = EVENT_COLORS[evt.type] || EVENT_COLORS["その他"];
      return `
      <div class="event-item">
        <div class="event-type-bar" style="background:${col}"></div>
        <div class="event-content">
          <div class="event-title">${escHtml(evt.title)}</div>
          <div class="event-meta">${fmtDateFull(evt.date)}${evt.time ? " " + evt.time : ""} · ${escHtml(evt.type)}</div>
        </div>
        <div class="event-actions">
          <button class="btn btn-ghost btn-sm" onclick="deleteEvent('${evt.id}','company')">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          </button>
        </div>
      </div>
    `;
    })
    .join("");
}

function updateCompanyField(id, field, value) {
  const c = getCompany(id);
  if (!c) return;
  c[field] = value;
  c.updatedAt = now();
  scheduleSave();
}

/* ===== ES Tab ===== */
function renderEsTab(c) {
  return `
    <div style="max-width:720px">
      <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
        <button class="btn btn-primary" onclick="openAddEsModal('${c.id}')">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          設問を追加
        </button>
      </div>
      ${(c.es || []).length === 0
        ? `<div class="empty-state"><svg viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg><h3>ESがありません</h3><p>「設問を追加」からエントリーシートの設問と回答を記録しましょう</p></div>`
        : (c.es || []).map((entry) => esEntryHtml(c, entry)).join("")
      }
    </div>
  `;
}

function esEntryHtml(c, entry) {
  const charCount = (entry.answer || "").length;
  const maxHint = entry.maxChars ? `/${entry.maxChars}` : "";
  const countClass = entry.maxChars && charCount > entry.maxChars ? "over" : entry.maxChars && charCount > entry.maxChars * 0.9 ? "warn" : "";

  return `
    <div class="es-entry" id="es-${entry.id}">
      <div class="es-entry-header">
        <div class="es-question-text">${escHtml(entry.question)}</div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-ai btn-sm" onclick="runEsReview('${c.id}','${entry.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            AI添削
          </button>
          <button class="btn btn-ghost btn-sm" onclick="openEditEsModal('${c.id}','${entry.id}')">編集</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteEs('${c.id}','${entry.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          </button>
        </div>
      </div>
      <div class="es-entry-body">
        <textarea class="form-textarea" rows="5" onchange="updateEsField('${c.id}','${entry.id}','answer',this.value)" oninput="updateCharCount('es-count-${entry.id}',this.value.length,${entry.maxChars || 0})">${escHtml(entry.answer || "")}</textarea>
        <div class="char-count ${countClass}" id="es-count-${entry.id}">${charCount}${maxHint}字</div>

        <div id="es-review-${entry.id}">
          ${entry.aiReview
            ? `<div class="es-review-panel">
                <div class="es-review-label">
                  <svg viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
                  AI添削結果
                </div>
                <div class="md-content">${markdownToHtml(entry.aiReview)}</div>
              </div>`
            : ""}
        </div>
      </div>
    </div>
  `;
}

function updateCharCount(id, count, max) {
  const el = document.getElementById(id);
  if (!el) return;
  const maxStr = max ? `/${max}` : "";
  el.textContent = `${count}${maxStr}字`;
  el.className = `char-count${max && count > max ? " over" : max && count > max * 0.9 ? " warn" : ""}`;
}

function openAddEsModal(companyId) {
  const body = `
    <div class="form-group">
      <label class="form-label">設問 <span style="color:var(--red)">*</span></label>
      <textarea class="form-textarea" id="m-es-q" rows="2" placeholder="例: 学生時代に力を入れたことを教えてください（400字以内）"></textarea>
    </div>
    <div class="form-group mt-3">
      <label class="form-label">文字数制限（任意）</label>
      <input class="form-input" id="m-es-max" type="number" placeholder="例: 400" style="width:160px" />
    </div>
    <div class="form-group mt-3">
      <label class="form-label">回答</label>
      <textarea class="form-textarea" id="m-es-a" rows="6" placeholder="回答を入力してください"></textarea>
    </div>
  `;
  openModal("設問を追加", body, `
    <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    <button class="btn btn-primary" onclick="saveEs('${companyId}', null)">追加</button>
  `);
  document.getElementById("m-es-q")?.focus();
}

function openEditEsModal(companyId, esId) {
  const c = getCompany(companyId);
  const entry = (c?.es || []).find((e) => e.id === esId);
  if (!entry) return;
  const body = `
    <div class="form-group">
      <label class="form-label">設問 <span style="color:var(--red)">*</span></label>
      <textarea class="form-textarea" id="m-es-q" rows="2">${escHtml(entry.question)}</textarea>
    </div>
    <div class="form-group mt-3">
      <label class="form-label">文字数制限（任意）</label>
      <input class="form-input" id="m-es-max" type="number" value="${entry.maxChars || ""}" style="width:160px" />
    </div>
    <div class="form-group mt-3">
      <label class="form-label">回答</label>
      <textarea class="form-textarea" id="m-es-a" rows="6">${escHtml(entry.answer || "")}</textarea>
    </div>
  `;
  openModal("設問を編集", body, `
    <button class="btn btn-danger btn-sm" onclick="deleteEs('${companyId}','${esId}')">削除</button>
    <div style="flex:1"></div>
    <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    <button class="btn btn-primary" onclick="saveEs('${companyId}', '${esId}')">更新</button>
  `);
}

function saveEs(companyId, esId) {
  const q = document.getElementById("m-es-q")?.value.trim();
  const a = document.getElementById("m-es-a")?.value.trim() || "";
  const max = parseInt(document.getElementById("m-es-max")?.value) || 0;
  if (!q) { toast("設問を入力してください"); return; }

  const c = getCompany(companyId);
  if (!c) return;
  c.es = c.es || [];

  if (esId) {
    const entry = c.es.find((e) => e.id === esId);
    if (entry) {
      entry.question = q;
      entry.answer = a;
      entry.maxChars = max || null;
      entry.updatedAt = now();
    }
    toast("更新しました");
  } else {
    c.es.push({ id: uid(), question: q, answer: a, maxChars: max || null, aiReview: null, createdAt: now(), updatedAt: now() });
    toast("追加しました");
  }

  c.updatedAt = now();
  scheduleSave();
  closeModal();
  switchCompanyTab("es");
  renderCompany();
}

function updateEsField(companyId, esId, field, value) {
  const c = getCompany(companyId);
  const entry = (c?.es || []).find((e) => e.id === esId);
  if (!entry) return;
  entry[field] = value;
  entry.updatedAt = now();
  c.updatedAt = now();
  scheduleSave();
}

function deleteEs(companyId, esId) {
  if (!confirm("この設問を削除しますか？")) return;
  const c = getCompany(companyId);
  if (!c) return;
  c.es = (c.es || []).filter((e) => e.id !== esId);
  c.updatedAt = now();
  scheduleSave();
  closeModal();
  switchCompanyTab("es");
  renderCompany();
  toast("削除しました");
}

async function runEsReview(companyId, esId) {
  const c = getCompany(companyId);
  const entry = (c?.es || []).find((e) => e.id === esId);
  if (!entry) return;
  if (!entry.question || !entry.answer) { toast("設問と回答を入力してください"); return; }

  const reviewEl = document.getElementById(`es-review-${esId}`);
  if (reviewEl) reviewEl.innerHTML = `<div class="ai-loading"><div class="spinner"></div>AIが添削中...</div>`;

  try {
    const res = await fetchJson("/api/jobs/ai/es-review", {
      method: "POST",
      body: JSON.stringify({ companyName: c.name, question: entry.question, answer: entry.answer }),
    });
    entry.aiReview = res.review;
    entry.updatedAt = now();
    c.updatedAt = now();
    scheduleSave();

    if (reviewEl) {
      reviewEl.innerHTML = `
        <div class="es-review-panel">
          <div class="es-review-label">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            AI添削結果
          </div>
          <div class="md-content">${markdownToHtml(res.review)}</div>
        </div>
      `;
    }
    toast("添削が完了しました");
  } catch (e) {
    if (reviewEl) reviewEl.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px 0">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

/* ===== WebTest Tab ===== */
function renderWebtestTab(c) {
  const wt = c.webTest || {};
  return `
    <div style="max-width:680px">
      <div class="card mb-4">
        <div class="card-header">
          <span class="card-title">WEBテスト情報</span>
          <button class="btn btn-ai btn-sm" onclick="runWebtestInfo('${c.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            AIに調べてもらう
          </button>
        </div>
        <div class="card-body">
          <div id="webtest-ai-${c.id}">
            ${wt.aiInfo
              ? `<div class="ai-result md-content">${markdownToHtml(wt.aiInfo)}</div>
                 <div style="font-size:11px;color:var(--text-4);margin-top:8px">取得日: ${fmtDatetime(wt.aiInfoUpdatedAt || "")}</div>`
              : `<p class="text-muted" style="text-align:center;padding:16px 0">「AIに調べてもらう」を押すと、${escHtml(c.name)}のWEBテスト情報を調べます</p>`}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">自分のメモ</span></div>
        <div class="card-body">
          <div class="form-group">
            <label class="form-label">メモ・対策記録</label>
            <textarea class="form-textarea" rows="5" onchange="updateWebtestNotes('${c.id}',this.value)" placeholder="受験した感想、難易度、対策で役に立ったことなど">${escHtml(wt.notes || "")}</textarea>
          </div>
        </div>
      </div>
    </div>
  `;
}

function updateWebtestNotes(companyId, value) {
  const c = getCompany(companyId);
  if (!c) return;
  c.webTest = c.webTest || {};
  c.webTest.notes = value;
  c.updatedAt = now();
  scheduleSave();
}

async function runWebtestInfo(companyId) {
  const c = getCompany(companyId);
  if (!c) return;

  const infoEl = document.getElementById(`webtest-ai-${companyId}`);
  if (infoEl) infoEl.innerHTML = `<div class="ai-loading"><div class="spinner"></div>AIが調査中...</div>`;

  try {
    const res = await fetchJson("/api/jobs/ai/webtest", {
      method: "POST",
      body: JSON.stringify({ companyName: c.name }),
    });
    c.webTest = c.webTest || {};
    c.webTest.aiInfo = res.info;
    c.webTest.aiInfoUpdatedAt = now();
    c.updatedAt = now();
    scheduleSave();

    if (infoEl) {
      infoEl.innerHTML = `
        <div class="ai-result md-content">${markdownToHtml(res.info)}</div>
        <div style="font-size:11px;color:var(--text-4);margin-top:8px">取得日: ${fmtDatetime(c.webTest.aiInfoUpdatedAt)}</div>
      `;
    }
    toast("WEBテスト情報を取得しました");
  } catch (e) {
    if (infoEl) infoEl.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px 0">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

/* ===== Interview Tab ===== */
function renderInterviewTab(c) {
  const interviews = c.interviews || [];
  return `
    <div style="max-width:720px">
      <div style="display:flex;justify-content:flex-end;margin-bottom:14px">
        <button class="btn btn-primary" onclick="openAddInterviewModal('${c.id}')">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
          面接を追加
        </button>
      </div>
      ${interviews.length === 0
        ? `<div class="empty-state"><svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd"/></svg><h3>面接がありません</h3><p>「面接を追加」から面接の記録を追加しましょう</p></div>`
        : interviews.map((iv) => interviewCardHtml(c, iv)).join("")
      }
    </div>
  `;
}

function interviewCardHtml(c, iv) {
  const resultChip = iv.result
    ? `<span class="chip chip-sm ${iv.result === "合格" ? "chip-offer" : iv.result === "不合格" ? "chip-reject" : "chip-neutral"}">${iv.result}</span>`
    : "";

  return `
    <div class="interview-card" id="iv-${iv.id}">
      <div class="interview-card-header">
        <div style="display:flex;align-items:center;gap:8px">
          <span class="interview-round-label">${escHtml(iv.type)}</span>
          ${resultChip}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
          ${iv.date ? `<span style="font-size:12px;color:var(--text-3)">${fmtDateFull(iv.date)}${iv.time ? " " + iv.time : ""}</span>` : ""}
          <button class="btn btn-ghost btn-sm" onclick="openEditInterviewModal('${c.id}','${iv.id}')">編集</button>
          <button class="btn btn-ghost btn-sm" onclick="deleteInterview('${c.id}','${iv.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          </button>
        </div>
      </div>
      <div class="interview-card-body">

        <div>
          <div class="interview-section-title">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:13px;height:13px"><path fill-rule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h6a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"/></svg>
            面接準備
          </div>
          <div class="form-group">
            <label class="form-label-sm">準備メモ・意気込み</label>
            <textarea class="form-textarea" rows="3" onchange="updateInterviewField('${c.id}','${iv.id}','preparation',this.value)" placeholder="アピールしたいこと、準備した内容など">${escHtml(iv.preparation || "")}</textarea>
          </div>
          <div class="form-group mt-2">
            <label class="form-label-sm">想定される質問</label>
            <textarea class="form-textarea" rows="3" onchange="updateInterviewField('${c.id}','${iv.id}','expectedQuestions',this.value)" placeholder="事前に想定した質問を書いておく">${escHtml(iv.expectedQuestions || "")}</textarea>
          </div>
          <div style="margin-top:10px">
            <button class="btn btn-ai btn-sm" onclick="runInterviewTips('${c.id}','${iv.id}')">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
              AI面接情報を収集
            </button>
          </div>
          <div id="iv-tips-${iv.id}">
            ${iv.aiTips
              ? `<div class="interview-tips-panel mt-3">
                  <div style="font-size:11.5px;font-weight:700;color:var(--purple-text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">AI収集情報</div>
                  <div class="md-content">${markdownToHtml(iv.aiTips)}</div>
                </div>`
              : ""}
          </div>
        </div>

        <div>
          <div class="interview-section-title" style="color:var(--green)">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:13px;height:13px"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/></svg>
            面接後の記録
          </div>
          <div class="form-group">
            <label class="form-label-sm">聞かれた質問</label>
            <textarea class="form-textarea" rows="3" onchange="updateInterviewField('${c.id}','${iv.id}','questionsAsked',this.value)" placeholder="実際に聞かれた質問を記録">${escHtml(iv.questionsAsked || "")}</textarea>
          </div>
          <div class="form-group mt-2">
            <label class="form-label-sm">面接の感想・振り返り</label>
            <textarea class="form-textarea" rows="4" onchange="updateInterviewField('${c.id}','${iv.id}','experience',this.value)" placeholder="どんな雰囲気だったか、うまくいった点・うまくいかなかった点など">${escHtml(iv.experience || "")}</textarea>
          </div>
          <div style="display:flex;align-items:center;gap:8px;margin-top:10px;flex-wrap:wrap">
            <select class="form-select" style="width:auto;min-height:30px;padding:4px 28px 4px 8px;font-size:12.5px" onchange="updateInterviewField('${c.id}','${iv.id}','result',this.value)">
              <option value="">結果を選択</option>
              ${INTERVIEW_RESULTS.map((r) => `<option value="${r}" ${iv.result === r ? "selected" : ""}>${r}</option>`).join("")}
            </select>
            <button class="btn btn-ai btn-sm" onclick="runInterviewFeedback('${c.id}','${iv.id}')">
              <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
              AIフィードバック
            </button>
          </div>
          <div id="iv-fb-${iv.id}">
            ${iv.aiExperienceFeedback
              ? `<div class="interview-feedback-panel mt-3">
                  <div style="font-size:11.5px;font-weight:700;color:var(--green-text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">AIフィードバック</div>
                  <div class="md-content">${markdownToHtml(iv.aiExperienceFeedback)}</div>
                </div>`
              : ""}
          </div>
        </div>

      </div>
    </div>
  `;
}

function updateInterviewField(companyId, ivId, field, value) {
  const c = getCompany(companyId);
  const iv = (c?.interviews || []).find((x) => x.id === ivId);
  if (!iv) return;
  iv[field] = value;
  iv.updatedAt = now();
  c.updatedAt = now();
  scheduleSave();
}

function openAddInterviewModal(companyId) {
  const c = getCompany(companyId);
  const roundNum = (c?.interviews || []).length + 1;
  const body = `
    <div class="two-col">
      <div class="form-group">
        <label class="form-label">面接種別</label>
        <select class="form-select" id="m-iv-type">
          ${INTERVIEW_TYPES.map((t, i) => `<option value="${t}" ${i === Math.min(roundNum - 1, INTERVIEW_TYPES.length - 1) ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">形式</label>
        <select class="form-select" id="m-iv-format">
          ${INTERVIEW_FORMATS.map((f) => `<option value="${f}">${f}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="two-col mt-3">
      <div class="form-group">
        <label class="form-label">日付</label>
        <input class="form-input" id="m-iv-date" type="date" />
      </div>
      <div class="form-group">
        <label class="form-label">時刻</label>
        <input class="form-input" id="m-iv-time" type="time" />
      </div>
    </div>
    <div class="form-group mt-3">
      <label class="form-label">場所・URL</label>
      <input class="form-input" id="m-iv-location" placeholder="例: Zoom / 〇〇ビル5F" />
    </div>
  `;
  openModal("面接を追加", body, `
    <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    <button class="btn btn-primary" onclick="saveInterview('${companyId}', null)">追加</button>
  `);
}

function openEditInterviewModal(companyId, ivId) {
  const c = getCompany(companyId);
  const iv = (c?.interviews || []).find((x) => x.id === ivId);
  if (!iv) return;
  const body = `
    <div class="two-col">
      <div class="form-group">
        <label class="form-label">面接種別</label>
        <select class="form-select" id="m-iv-type">
          ${INTERVIEW_TYPES.map((t) => `<option value="${t}" ${iv.type === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">形式</label>
        <select class="form-select" id="m-iv-format">
          ${INTERVIEW_FORMATS.map((f) => `<option value="${f}" ${iv.format === f ? "selected" : ""}>${f}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="two-col mt-3">
      <div class="form-group">
        <label class="form-label">日付</label>
        <input class="form-input" id="m-iv-date" type="date" value="${iv.date || ""}" />
      </div>
      <div class="form-group">
        <label class="form-label">時刻</label>
        <input class="form-input" id="m-iv-time" type="time" value="${iv.time || ""}" />
      </div>
    </div>
    <div class="form-group mt-3">
      <label class="form-label">場所・URL</label>
      <input class="form-input" id="m-iv-location" value="${escHtml(iv.location || "")}" placeholder="例: Zoom / 〇〇ビル5F" />
    </div>
  `;
  openModal("面接を編集", body, `
    <button class="btn btn-danger btn-sm" onclick="deleteInterview('${companyId}','${ivId}')">削除</button>
    <div style="flex:1"></div>
    <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    <button class="btn btn-primary" onclick="saveInterview('${companyId}', '${ivId}')">更新</button>
  `);
}

function saveInterview(companyId, ivId) {
  const c = getCompany(companyId);
  if (!c) return;
  c.interviews = c.interviews || [];

  const data = {
    type: document.getElementById("m-iv-type")?.value || "一次面接",
    format: document.getElementById("m-iv-format")?.value || "オンライン",
    date: document.getElementById("m-iv-date")?.value || "",
    time: document.getElementById("m-iv-time")?.value || "",
    location: document.getElementById("m-iv-location")?.value.trim() || "",
  };

  if (ivId) {
    const iv = c.interviews.find((x) => x.id === ivId);
    if (iv) { Object.assign(iv, data); iv.updatedAt = now(); }
    toast("更新しました");
  } else {
    c.interviews.push({ id: uid(), ...data, preparation: "", expectedQuestions: "", aiTips: null, experience: "", questionsAsked: "", result: null, aiExperienceFeedback: null, createdAt: now(), updatedAt: now() });
    toast("追加しました");

    if (data.date) {
      state.schedules.push({
        id: uid(),
        companyId,
        title: `${c.name} ${data.type}`,
        type: "面接",
        date: data.date,
        time: data.time,
        notes: data.location,
        createdAt: now(),
      });
    }
  }

  c.updatedAt = now();
  scheduleSave();
  closeModal();
  switchCompanyTab("interview");
  renderCompany();
}

function deleteInterview(companyId, ivId) {
  if (!confirm("この面接記録を削除しますか？")) return;
  const c = getCompany(companyId);
  if (!c) return;
  c.interviews = (c.interviews || []).filter((x) => x.id !== ivId);
  c.updatedAt = now();
  scheduleSave();
  closeModal();
  toast("削除しました");
  renderCompany();
}

async function runInterviewTips(companyId, ivId) {
  const c = getCompany(companyId);
  const iv = (c?.interviews || []).find((x) => x.id === ivId);
  if (!c || !iv) return;

  const el = document.getElementById(`iv-tips-${ivId}`);
  if (el) el.innerHTML = `<div class="ai-loading mt-3"><div class="spinner"></div>AIが情報収集中...</div>`;

  try {
    const res = await fetchJson("/api/jobs/ai/interview-tips", {
      method: "POST",
      body: JSON.stringify({ companyName: c.name, interviewType: iv.type }),
    });
    iv.aiTips = res.tips;
    iv.updatedAt = now();
    c.updatedAt = now();
    scheduleSave();

    if (el) {
      el.innerHTML = `
        <div class="interview-tips-panel mt-3">
          <div style="font-size:11.5px;font-weight:700;color:var(--purple-text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">AI収集情報</div>
          <div class="md-content">${markdownToHtml(res.tips)}</div>
        </div>
      `;
    }
    toast("面接情報を取得しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px 0;margin-top:8px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

async function runInterviewFeedback(companyId, ivId) {
  const c = getCompany(companyId);
  const iv = (c?.interviews || []).find((x) => x.id === ivId);
  if (!c || !iv) return;
  if (!iv.experience) { toast("面接の感想・振り返りを入力してください"); return; }

  const el = document.getElementById(`iv-fb-${ivId}`);
  if (el) el.innerHTML = `<div class="ai-loading mt-3"><div class="spinner"></div>AIがフィードバック作成中...</div>`;

  try {
    const res = await fetchJson("/api/jobs/ai/interview-feedback", {
      method: "POST",
      body: JSON.stringify({
        companyName: c.name,
        interviewType: iv.type,
        experience: iv.experience,
        questionsAsked: iv.questionsAsked,
      }),
    });
    iv.aiExperienceFeedback = res.feedback;
    iv.updatedAt = now();
    c.updatedAt = now();
    scheduleSave();

    if (el) {
      el.innerHTML = `
        <div class="interview-feedback-panel mt-3">
          <div style="font-size:11.5px;font-weight:700;color:var(--green-text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">AIフィードバック</div>
          <div class="md-content">${markdownToHtml(res.feedback)}</div>
        </div>
      `;
    }
    toast("フィードバックを取得しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px 0;margin-top:8px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

/* ===== Calendar ===== */
function renderCalendar() {
  const el = document.getElementById("view-calendar");
  const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];
  const dayNames = ["日", "月", "火", "水", "木", "金", "土"];

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const todayStr = today();
  const monthStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}`;

  const allEvents = [
    ...state.schedules,
    ...state.companies.flatMap((c) =>
      (c.interviews || [])
        .filter((iv) => iv.date)
        .map((iv) => ({
          id: `iv-${iv.id}`,
          companyId: c.id,
          title: `${c.name} ${iv.type}`,
          type: "面接",
          date: iv.date,
          time: iv.time || "",
          notes: iv.location || "",
        }))
    ),
  ].filter((e) => e.date && e.date.startsWith(monthStr));

  const eventsByDate = {};
  for (const evt of allEvents) {
    if (!eventsByDate[evt.date]) eventsByDate[evt.date] = [];
    eventsByDate[evt.date].push(evt);
  }

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, date: dateStr, events: eventsByDate[dateStr] || [] });
  }

  const selectedEvts = calSelectedDate ? (eventsByDate[calSelectedDate] || []) : [];

  el.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">カレンダー</div>
        <div class="view-subtitle">就活スケジュールを管理</div>
      </div>
      <button class="btn btn-primary" onclick="openAddEventModal(null)">
        <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clip-rule="evenodd"/></svg>
        予定を追加
      </button>
    </div>

    <div class="calendar-wrap">
      <div class="calendar-header">
        <div class="calendar-nav">
          <button class="btn btn-secondary btn-sm" onclick="calPrev()">‹</button>
          <button class="btn btn-ghost btn-sm" onclick="calToday()">今月</button>
          <button class="btn btn-secondary btn-sm" onclick="calNext()">›</button>
        </div>
        <div class="calendar-month-label">${calYear}年 ${monthNames[calMonth]}</div>
        <div style="width:120px"></div>
      </div>

      <div class="calendar-grid">
        ${dayNames.map((d) => `<div class="calendar-day-header">${d}</div>`).join("")}
        ${cells
          .map((cell) => {
            if (!cell) return `<div class="calendar-cell empty"></div>`;
            const isToday = cell.date === todayStr;
            const isSelected = cell.date === calSelectedDate;
            const dow = new Date(cell.date).getDay();
            const dayColor = dow === 0 ? "color:#ef4444" : dow === 6 ? "color:#6366f1" : "";
            return `
              <div class="calendar-cell${isToday ? " today" : ""}${isSelected ? " selected" : ""}" onclick="selectCalDate('${cell.date}')">
                <div class="calendar-day-num" style="${dayColor}">${cell.day}</div>
                ${cell.events.length
                  ? `<div class="calendar-event-dots">${cell.events.slice(0, 4).map((e) => `<div class="event-dot" style="background:${EVENT_COLORS[e.type] || "#6b7280"}"></div>`).join("")}</div>
                     <div class="calendar-event-preview">${cell.events[0] ? escHtml(cell.events[0].title) : ""}</div>`
                  : ""}
              </div>
            `;
          })
          .join("")}
      </div>
    </div>

    <div id="cal-events" style="margin-top:20px">
      ${calSelectedDate
        ? `<div class="flex items-center justify-between mb-3">
            <div style="font-size:15px;font-weight:700">${fmtDateFull(calSelectedDate)} の予定</div>
          </div>
          ${renderEventList(selectedEvts)}`
        : ""}
    </div>

    <div style="margin-top:24px">
      <div class="section-divider">今後の予定</div>
      ${renderEventList(state.schedules.filter((s) => s.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10))}
    </div>
  `;
}

function renderEventList(evts) {
  if (!evts.length) return `<p class="text-muted" style="text-align:center;padding:12px 0">予定がありません</p>`;
  return `<div class="event-list">${evts.map((evt) => {
    const col = EVENT_COLORS[evt.type] || EVENT_COLORS["その他"];
    const co = evt.companyId ? getCompany(evt.companyId)?.name || "" : "";
    return `
      <div class="event-item">
        <div class="event-type-bar" style="background:${col}"></div>
        <div class="event-content">
          <div class="event-title">${escHtml(evt.title)}</div>
          <div class="event-meta">${fmtDateFull(evt.date)}${evt.time ? " " + evt.time : ""}${co ? " · " + escHtml(co) : ""} · ${escHtml(evt.type)}</div>
          ${evt.notes ? `<div class="text-sm text-muted mt-2">${escHtml(evt.notes)}</div>` : ""}
        </div>
        <div class="event-actions">
          ${!evt.id.startsWith("iv-") ? `<button class="btn btn-ghost btn-sm" onclick="deleteEvent('${evt.id}','calendar')">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          </button>` : ""}
        </div>
      </div>
    `;
  }).join("")}</div>`;
}

function selectCalDate(date) {
  calSelectedDate = calSelectedDate === date ? null : date;
  renderCalendar();
}

function calPrev() {
  calMonth--;
  if (calMonth < 0) { calMonth = 11; calYear--; }
  calSelectedDate = null;
  renderCalendar();
}

function calNext() {
  calMonth++;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  calSelectedDate = null;
  renderCalendar();
}

function calToday() {
  const d = jstNow();
  calYear = d.getUTCFullYear();
  calMonth = d.getUTCMonth();
  calSelectedDate = null;
  renderCalendar();
}

function openAddEventModal(companyId) {
  const body = `
    <div class="form-group">
      <label class="form-label">タイトル <span style="color:var(--red)">*</span></label>
      <input class="form-input" id="m-evt-title" placeholder="例: ◯◯社 ES締切" />
    </div>
    <div class="two-col mt-3">
      <div class="form-group">
        <label class="form-label">種別</label>
        <select class="form-select" id="m-evt-type">
          ${EVENT_TYPES.map((t) => `<option value="${t}">${t}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">企業（任意）</label>
        <select class="form-select" id="m-evt-company">
          <option value="">なし</option>
          ${state.companies.map((c) => `<option value="${c.id}" ${c.id === companyId ? "selected" : ""}>${escHtml(c.name)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="two-col mt-3">
      <div class="form-group">
        <label class="form-label">日付 <span style="color:var(--red)">*</span></label>
        <input class="form-input" id="m-evt-date" type="date" value="${calSelectedDate || today()}" />
      </div>
      <div class="form-group">
        <label class="form-label">時刻</label>
        <input class="form-input" id="m-evt-time" type="time" />
      </div>
    </div>
    <div class="form-group mt-3">
      <label class="form-label">メモ</label>
      <textarea class="form-textarea" id="m-evt-notes" rows="2" placeholder="場所・URL・注意事項など"></textarea>
    </div>
  `;
  openModal("予定を追加", body, `
    <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    <button class="btn btn-primary" onclick="saveEvent()">追加</button>
  `);
  document.getElementById("m-evt-title")?.focus();
}

function saveEvent() {
  const title = document.getElementById("m-evt-title")?.value.trim();
  const date = document.getElementById("m-evt-date")?.value;
  if (!title || !date) { toast("タイトルと日付を入力してください"); return; }

  state.schedules.push({
    id: uid(),
    companyId: document.getElementById("m-evt-company")?.value || null,
    title,
    type: document.getElementById("m-evt-type")?.value || "その他",
    date,
    time: document.getElementById("m-evt-time")?.value || "",
    notes: document.getElementById("m-evt-notes")?.value.trim() || "",
    createdAt: now(),
  });

  scheduleSave();
  closeModal();
  toast("予定を追加しました");
  if (currentView === "calendar") renderCalendar();
  else if (currentView === "dashboard") renderDashboard();
}

function deleteEvent(id, source) {
  if (!confirm("この予定を削除しますか？")) return;
  state.schedules = state.schedules.filter((s) => s.id !== id);
  scheduleSave();
  toast("削除しました");
  if (source === "calendar") renderCalendar();
  else if (source === "company") {
    const c = getCompany(currentCompanyId);
    if (c) document.querySelector(".card-body")?.replaceChildren();
    renderCompany();
  }
}

/* ===== Analysis ===== */
function renderAnalysis() {
  const el = document.getElementById("view-analysis");
  el.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">就活分析</div>
        <div class="view-subtitle">AIが就活の進捗を分析してアドバイス</div>
      </div>
    </div>

    <div style="max-width:720px">
      <div class="card mb-4">
        <div class="card-body" style="text-align:center;padding:32px 24px">
          <svg viewBox="0 0 20 20" fill="currentColor" style="width:40px;height:40px;margin:0 auto 12px;color:var(--accent);opacity:.7"><path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zm6-4a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zm6-3a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z"/></svg>
          <div style="font-size:16px;font-weight:600;margin-bottom:6px">就活の進捗を分析します</div>
          <div style="font-size:13px;color:var(--text-3);margin-bottom:20px">登録している企業データをもとに、強みや課題、今後のアドバイスをAIが提供します</div>
          <button class="btn btn-ai btn-lg" onclick="runAnalysis()" id="analysis-btn">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            分析を実行
          </button>
        </div>
      </div>

      <div id="analysis-result"></div>

      <div class="card">
        <div class="card-header"><span class="card-title">ステータス別企業数</span></div>
        <div class="card-body">
          <div class="status-bar" id="status-summary">
            ${renderStatusSummary()}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderStatusSummary() {
  const counts = {};
  state.companies.forEach((c) => { counts[c.status] = (counts[c.status] || 0) + 1; });
  return STATUSES.filter((s) => counts[s.value])
    .map(
      (s) => `
    <div class="status-bar-item">
      <div class="status-bar-label">${s.label}</div>
      <div class="status-bar-value">${counts[s.value]}</div>
    </div>
  `
    )
    .join("") || `<p class="text-muted" style="text-align:center;width:100%;padding:12px 0">企業が登録されていません</p>`;
}

async function runAnalysis() {
  const btn = document.getElementById("analysis-btn");
  const resultEl = document.getElementById("analysis-result");
  if (btn) { btn.disabled = true; btn.innerHTML = `<div class="spinner" style="width:16px;height:16px;border-color:rgba(255,255,255,.3);border-top-color:#fff"></div> 分析中...`; }
  if (resultEl) resultEl.innerHTML = "";

  if (!state.companies.length) {
    if (btn) { btn.disabled = false; btn.innerHTML = `分析を実行`; }
    toast("企業を登録してから分析してください");
    return;
  }

  try {
    const res = await fetchJson("/api/jobs/ai/analysis", {
      method: "POST",
      body: JSON.stringify({ companies: state.companies, schedules: state.schedules }),
    });
    if (resultEl) {
      resultEl.innerHTML = `
        <div class="card mb-4">
          <div class="card-header">
            <span class="card-title">AI分析結果</span>
            <span style="font-size:11px;color:var(--text-3)">${jstNow().toLocaleString("ja-JP")}</span>
          </div>
          <div class="card-body">
            <div class="ai-result md-content">${markdownToHtml(res.analysis)}</div>
          </div>
        </div>
      `;
    }
    toast("分析が完了しました");
  } catch (e) {
    if (resultEl) resultEl.innerHTML = `<div style="color:var(--red);font-size:13px;padding:12px 0">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg> 再分析`;
    }
  }
}

/* ===== Settings ===== */
function renderSettings() {
  const el = document.getElementById("view-settings");
  el.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">設定</div>
        <div class="view-subtitle">AIキーとデータを管理</div>
      </div>
    </div>
    <div style="max-width:600px">

      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">AIサービス設定</div>
          <div class="settings-section-desc">いずれか1つを設定すれば動作します（Gemini推奨）</div>
        </div>
        <div class="settings-section-body">
          <div id="settings-ai-status" style="margin-bottom:12px">読み込み中...</div>
          <div class="form-group">
            <label class="form-label">Gemini APIキー</label>
            <div class="form-hint">Google AI Studio から取得（無料）</div>
            <input type="password" class="form-input mt-1" id="ai-gemini-key" placeholder="AIzaSy..." autocomplete="off" />
          </div>
          <div class="form-group">
            <label class="form-label">Anthropic APIキー</label>
            <input type="password" class="form-input mt-1" id="ai-anthropic-key" placeholder="sk-ant-..." autocomplete="off" />
          </div>
          <div class="form-group">
            <label class="form-label">OpenAI APIキー</label>
            <input type="password" class="form-input mt-1" id="ai-openai-key" placeholder="sk-..." autocomplete="off" />
          </div>
          <button class="btn btn-primary" onclick="saveAiKeys()">保存</button>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">データ管理</div>
        </div>
        <div class="settings-section-body">
          <div class="form-group">
            <label class="form-label">データをエクスポート</label>
            <div class="form-hint">JSONファイルとしてダウンロードします</div>
            <button class="btn btn-secondary mt-2" onclick="exportData()">データをエクスポート</button>
          </div>
          <div class="form-group">
            <label class="form-label">データをインポート</label>
            <div class="form-hint">以前エクスポートしたJSONファイルを読み込みます</div>
            <label class="btn btn-secondary mt-2" style="cursor:pointer">
              ファイルを選択
              <input type="file" accept=".json" style="display:none" onchange="importData(this)" />
            </label>
          </div>
          <div class="form-group">
            <label class="form-label" style="color:var(--red)">データをリセット</label>
            <div class="form-hint">すべての就活データを削除します。この操作は取り消せません。</div>
            <button class="btn btn-danger mt-2" onclick="resetData()">データをリセット</button>
          </div>
        </div>
      </div>

      <div class="settings-section">
        <div class="settings-section-header">
          <div class="settings-section-title">このアプリについて</div>
        </div>
        <div class="settings-section-body">
          <div style="font-size:13px;color:var(--text-2);line-height:1.8">
            <p><strong>就活AI</strong> — 就職活動を効率化するAIアシスタント</p>
            <p>ES添削・WEBテスト情報収集・面接対策・スケジュール管理を一括で管理</p>
          </div>
        </div>
      </div>

    </div>
  `;
  loadAiStatus();
}

async function loadAiStatus() {
  const el = document.getElementById("settings-ai-status");
  if (!el) return;
  try {
    const s = await fetchJson("/api/status");
    const providers = [
      { name: "Gemini", configured: s.savedConfig?.geminiApiKey || s.configFromEnv?.gemini },
      { name: "OpenAI", configured: s.savedConfig?.openAIKey || s.configFromEnv?.openAI },
      { name: "Grok", configured: s.savedConfig?.grokApiKey || s.configFromEnv?.grok },
      { name: "Anthropic", configured: s.savedConfig?.anthropicApiKey || s.configFromEnv?.anthropic },
    ].filter((p) => p.configured);
    el.innerHTML = providers.length
      ? `<div style="display:flex;gap:8px;flex-wrap:wrap">${providers.map((p) => `<span class="chip chip-offer">${p.name} ✓</span>`).join("")}</div>`
      : `<span class="chip chip-reject">AIキー未設定 — 下のフォームにキーを入力してください</span>`;
  } catch {
    el.innerHTML = `<span style="font-size:12.5px;color:var(--text-3)">状態取得に失敗しました</span>`;
  }
}

async function saveAiKeys() {
  const geminiApiKey = document.getElementById("ai-gemini-key")?.value?.trim() || "";
  const anthropicApiKey = document.getElementById("ai-anthropic-key")?.value?.trim() || "";
  const openAIKey = document.getElementById("ai-openai-key")?.value?.trim() || "";
  if (!geminiApiKey && !anthropicApiKey && !openAIKey) {
    toast("少なくとも1つのAPIキーを入力してください", 3000);
    return;
  }
  try {
    const body = {};
    if (geminiApiKey) body.geminiApiKey = geminiApiKey;
    if (anthropicApiKey) body.anthropicApiKey = anthropicApiKey;
    if (openAIKey) body.openAIKey = openAIKey;
    await fetchJson("/api/config", { method: "POST", body: JSON.stringify(body) });
    toast("APIキーを保存しました");
    document.getElementById("ai-gemini-key").value = "";
    document.getElementById("ai-anthropic-key").value = "";
    document.getElementById("ai-openai-key").value = "";
    loadAiStatus();
  } catch (e) {
    toast(e.message || "保存に失敗しました", 5000);
  }
}

function exportData() {
  const data = JSON.stringify({ companies: state.companies, schedules: state.schedules }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shukatsu-ai-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast("エクスポートしました");
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.companies && !data.schedules) throw new Error("無効なデータ形式です");
      if (!confirm(`${(data.companies || []).length}社のデータをインポートします。現在のデータと統合しますか？`)) return;
      state.companies = [...state.companies, ...(data.companies || [])];
      state.schedules = [...state.schedules, ...(data.schedules || [])];
      await saveData();
      toast("インポートしました");
      renderSettings();
    } catch (err) {
      toast(err.message || "インポートに失敗しました", 5000);
    }
  };
  reader.readAsText(file);
  input.value = "";
}

async function resetData() {
  if (!confirm("すべての就活データを削除します。本当によろしいですか？\nこの操作は取り消せません。")) return;
  state.companies = [];
  state.schedules = [];
  await saveData();
  toast("データをリセットしました");
  navigate("#dashboard");
}

/* ===== Init ===== */
async function init() {
  await loadData();
  handleRoute();
}

init();
