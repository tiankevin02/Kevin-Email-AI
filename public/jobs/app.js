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
const SELECTION_TYPES = ["インターン", "本選考"];

/* ===== State ===== */
let state = { companies: [], schedules: [], profile: { gakuchika: "", selfPr: "", motivation: "", skills: "", other: "" } };
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
let companyBackView = "companies";
let settingsReturnView = "dashboard";
let filterStatus = "all";
let filterSelectionType = "all";
let filterIndustry = "all";
let searchQuery = "";
let saveTimer = null;
const collapseState = new Set();
function toggleSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  collapseState.has(id) ? (collapseState.delete(id), el.classList.remove("collapsed")) : (collapseState.add(id), el.classList.add("collapsed"));
}
const CHEV = `<svg class="collapse-chevron" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>`;

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

const STORAGE_KEY  = "shukatsu-ai-v1";
const BACKUP_KEY   = "shukatsu-ai-backup";
const PROFILE_KEY  = "shukatsu-ai-profile";

function getProfilePayload() {
  return state.profile || {};
}

function aiPost(endpoint, params) {
  return fetchJson(endpoint, {
    method: "POST",
    body: JSON.stringify({ ...params, userProfile: getProfilePayload() }),
  });
}

/* データを安全に読む */
function _readStorage(key) {
  try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch { return {}; }
}

/* データを複数キーに書く */
function _writeStorage(entry) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entry));
    // BACKUPは企業データまたはプロフィールが少しでもあれば更新
    const hasCompanies = (entry.companies || []).length > 0;
    const hasProfile   = entry.profile && Object.values(entry.profile).some(v => typeof v === "string" && v.trim());
    if (hasCompanies || hasProfile) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(entry));
    }
    // プロフィールは専用キーにも単独保存（企業データとは独立して守る）
    if (entry.profile) {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(entry.profile));
    }
  } catch {}
}

async function loadData() {
  // ① メインキーから即時ロード
  const main = _readStorage(STORAGE_KEY);
  if ((main.companies || []).length > 0) {
    state.companies = main.companies;
    state.schedules = main.schedules || [];
  }
  if (main.profile) state.profile = { ...state.profile, ...main.profile };

  // ① プロフィール専用キーでプロフィールを補完（設定だけが消えた場合も復元）
  try {
    const savedProf = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null");
    if (savedProf && Object.values(savedProf).some(v => typeof v === "string" && v.trim())) {
      state.profile = { ...savedProf, ...state.profile }; // 既存値を優先しつつ欠損を補完
    }
  } catch {}

  // ② メインが空ならバックアップから復元
  if (state.companies.length === 0) {
    const backup = _readStorage(BACKUP_KEY);
    if ((backup.companies || []).length > 0) {
      state.companies = backup.companies;
      state.schedules = backup.schedules || [];
      if (backup.profile) state.profile = { ...state.profile, ...backup.profile };
      _writeStorage({ ...backup, updatedAt: backup.updatedAt || Date.now() });
      toast("バックアップからデータを復元しました", 4000);
    }
  }

  // ③ サーバーと同期（サーバーがリセットされていても上書きしない）
  try {
    const data = await fetchJson("/api/jobs");
    const serverTs  = data.updatedAt || 0;
    const localTs   = _readStorage(STORAGE_KEY).updatedAt || 0;
    const serverHas = (data.companies || []).length > 0;
    const localHas  = state.companies.length > 0;

    if (serverHas && serverTs >= localTs) {
      state.companies = data.companies;
      state.schedules = data.schedules || [];
      if (data.profile) state.profile = { ...state.profile, ...data.profile };
      _writeStorage({ companies: state.companies, schedules: state.schedules, profile: state.profile, updatedAt: serverTs });
    } else if (localHas) {
      await _pushToServer();
      if (!serverHas) {
        // Server was empty (redeploy/restart) — data survived in localStorage
        toast("サーバーが再起動されました。ローカルデータを自動復元しました ✓", 5000);
      }
    }
  } catch {}

  // Weekly export reminder
  if (state.companies.length > 0) {
    const lastExport = parseInt(localStorage.getItem("lastExportDate") || "0", 10);
    const daysSince = (Date.now() - lastExport) / (1000 * 60 * 60 * 24);
    if (daysSince >= 7) {
      setTimeout(() => {
        const msg = lastExport === 0
          ? "データのバックアップをまだ取っていません。設定からエクスポートをお勧めします。"
          : `前回のエクスポートから${Math.floor(daysSince)}日経過しています。定期バックアップをお勧めします。`;
        toast(msg, 7000);
      }, 3000);
    }
  }
}

function scheduleSave() {
  // Immediately persist to localStorage — no data loss if browser closes before server sync
  _writeStorage({ companies: state.companies, schedules: state.schedules, profile: state.profile, updatedAt: Date.now() });
  // Debounce server sync (non-critical, localStorage is the source of truth)
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveData, 1500);
}

async function _pushToServer() {
  const updatedAt = Date.now();
  await fetchJson("/api/jobs", {
    method: "POST",
    body: JSON.stringify({ companies: state.companies, schedules: state.schedules, profile: state.profile, updatedAt }),
  });
  return updatedAt;
}

async function saveData() {
  const existing = _readStorage(STORAGE_KEY);
  const existingCount = (existing.companies || []).length;
  // 既存データが複数あるのに空になろうとしている場合のみブロック（誤消去防止）
  if (existingCount >= 2 && state.companies.length === 0) {
    console.warn("[saveData] 空データへの上書きをブロックしました");
    return;
  }

  try {
    const updatedAt = await _pushToServer();
    _writeStorage({ companies: state.companies, schedules: state.schedules, profile: state.profile, updatedAt });
  } catch {
    _writeStorage({ companies: state.companies, schedules: state.schedules, profile: state.profile, updatedAt: Date.now() });
    toast("オフライン保存しました（次回オンライン時に同期されます）", 3000);
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

  const viewEl = document.getElementById(`view-${view}`);
  if (!viewEl) return;

  // Settings on mobile: pure overlay — never disturb the underlying view
  if (view === "settings" && window.innerWidth <= 768) {
    currentView = view;
    document.querySelectorAll(".mobile-settings-btn").forEach(el => el.classList.add("active"));
    renderSettings();
    // rAF ensures DOM is painted at opacity:0 before transition starts — no flash
    requestAnimationFrame(() => viewEl.classList.add("active"));
    return;
  }

  // Normal view switch
  document.querySelectorAll(".nav-item, .mobile-nav-item, .mobile-settings-btn").forEach((el) => {
    el.classList.toggle("active", el.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((el) => el.classList.remove("active"));

  if (view === "company") {
    companyBackView = currentView === "calendar" ? "calendar" : "companies";
  }
  currentView = view;
  viewEl.classList.add("active");

  if (view === "dashboard") renderDashboard();
  else if (view === "companies") renderCompanies();
  else if (view === "company") {
    currentCompanyId = parts[1] || null;
    currentCompanyTab = parts[2] || "overview";
    renderCompany();
  } else if (view === "calendar") renderCalendar();
  else if (view === "analysis") renderAnalysis();
  else if (view === "aitools") renderAiTools();
  else if (view === "settings") renderSettings();
}

window.addEventListener("hashchange", handleRoute);

function toggleMobileSettings() {
  if (currentView === "settings") {
    const el = document.getElementById("view-settings");
    el.classList.remove("active"); // triggers CSS transition back to opacity:0
    setTimeout(() => {
      // Previous view is still rendered underneath — just restore state
      currentView = settingsReturnView || "dashboard";
      history.replaceState(null, "", `#${currentView}`);
      document.querySelectorAll(".nav-item, .mobile-nav-item, .mobile-settings-btn").forEach(b => {
        b.classList.toggle("active", b.dataset.view === currentView);
      });
    }, 280);
  } else {
    settingsReturnView = location.hash.slice(1) || "dashboard";
    navigate("#settings");
  }
}

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
      ${(() => {
        const mypageList = state.companies.filter(c => c.mypageUrl || c.mypageId);
        if (!mypageList.length) return "";
        return `
        <div class="card" style="margin-top:16px">
          <div class="card-header">
            <span class="card-title">📋 マイページ管理</span>
          </div>
          <div class="card-body">
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px">
              ${mypageList.map(c => `
                <div style="padding:10px;background:var(--bg-surface);border-radius:10px;display:flex;flex-direction:column;gap:6px">
                  <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(c.name)}</div>
                  ${c.mypageId
                    ? `<span onclick="copyCompanyLoginId('${c.id}')" title="タップでコピー" style="font-size:11px;color:var(--accent);cursor:pointer;font-family:monospace;background:var(--bg-hover);padding:2px 6px;border-radius:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block">${escHtml(c.mypageId)}</span>`
                    : ""}
                  ${c.mypageUrl
                    ? `<div style="display:flex;gap:5px;margin-top:auto">
                        <a href="${escHtml(c.mypageUrl)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm" style="flex:1;text-align:center;padding:4px 6px;font-size:11px">開く</a>
                        <button onclick="copyMypageUrl('${c.id}')" class="btn btn-secondary btn-sm" style="flex:1;padding:4px 6px;font-size:11px">コピー</button>
                      </div>`
                    : ""}
                </div>`).join("")}
            </div>
          </div>
        </div>`;
      })()}
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

    <div style="display:flex;flex-direction:column;gap:0;background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:10px 12px;margin-bottom:12px">
      <div class="filter-row">
        <span class="filter-row-label">種別</span>
        <div class="filter-row-chips">
          <button class="filter-chip ${filterSelectionType === "all" ? "active" : ""}" onclick="setSelectionTypeFilter('all')">全て</button>
          <button class="filter-chip ${filterSelectionType === "インターン" ? "active" : ""}" onclick="setSelectionTypeFilter('インターン')">インターン</button>
          <button class="filter-chip ${filterSelectionType === "本選考" ? "active" : ""}" onclick="setSelectionTypeFilter('本選考')">本選考</button>
        </div>
      </div>
      <div class="filter-row">
        <span class="filter-row-label">状況</span>
        <div class="filter-row-chips" id="status-filters">
          <button class="filter-chip ${filterStatus === "all" ? "active" : ""}" onclick="setStatusFilter('all')">すべて</button>
          ${STATUSES.map(s => `<button class="filter-chip ${filterStatus === s.value ? "active" : ""}" onclick="setStatusFilter('${s.value}')">${s.label}</button>`).join("")}
        </div>
      </div>
      ${(() => {
        const industries = [...new Set(state.companies.map(c => c.industry).filter(v => v && v.trim()))].sort();
        if (!industries.length) return "";
        return `<div class="filter-row">
          <span class="filter-row-label">業界</span>
          <div class="filter-row-chips" id="industry-filters">
            <button class="filter-chip ${filterIndustry === "all" ? "active" : ""}" onclick="setIndustryFilter('all')">全て</button>
            ${industries.map(ind => `<button class="filter-chip ${filterIndustry === ind ? "active" : ""}" data-ind="${escHtml(ind)}" onclick="setIndustryFilter(this.dataset.ind)">${escHtml(ind)}</button>`).join("")}
          </div>
        </div>`;
      })()}
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
  if (filterSelectionType !== "all") filtered = filtered.filter((c) => (c.selectionType || "インターン") === filterSelectionType);
  if (filterIndustry !== "all") filtered = filtered.filter((c) => (c.industry || "") === filterIndustry);
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
  const selType = c.selectionType || "インターン";

  return `
    <div class="company-card" onclick="navigate('#company/${c.id}')">
      <div class="company-name" style="margin-bottom:5px">${escHtml(c.name)}</div>
      <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:4px">
        <span class="selection-type-badge ${selType === '本選考' ? 'badge-honsen' : 'badge-intern'}">${selType}</span>
        ${statusChip(c.status)}
      </div>
      <div class="company-industry">${escHtml(c.industry || "業界未設定")}</div>
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

function setSelectionTypeFilter(val) {
  filterSelectionType = val;
  renderCompanies();
}

function setStatusFilter(val) {
  filterStatus = val;
  renderCompanies();
}

function setIndustryFilter(val) {
  filterIndustry = val;
  renderCompanies();
}

/* ===== Mypage actions ===== */
function copyMypageUrl(cid) {
  const c = getCompany(cid);
  if (c?.mypageUrl) { navigator.clipboard.writeText(c.mypageUrl); toast("URLをコピーしました"); }
}

function copyCompanyLoginId(cid) {
  const c = getCompany(cid);
  if (!c?.mypageId) return;
  navigator.clipboard.writeText(c.mypageId);
  toast(`${c.name} のIDをコピーしました`);
}

/* ===== Add Company Modal ===== */
function openAddCompanyModal(prefill = {}) {
  const isEdit = !!prefill.id;
  const selectionType = prefill.selectionType || "インターン";
  const body = `
    <div class="form-group">
      <label class="form-label">選考タイプ <span style="color:var(--red)">*</span></label>
      <div style="display:flex;gap:8px">
        <button type="button" class="type-toggle-btn intern ${selectionType === 'インターン' ? 'active' : ''}" onclick="toggleSelectionType('インターン',this)" id="type-btn-intern">インターン</button>
        <button type="button" class="type-toggle-btn honsen ${selectionType === '本選考' ? 'active' : ''}" onclick="toggleSelectionType('本選考',this)" id="type-btn-honsen">本選考</button>
      </div>
      <input type="hidden" id="m-co-selectionType" value="${selectionType}" />
    </div>
    <div class="form-group mt-3">
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

function toggleSelectionType(type, btn) {
  document.getElementById("m-co-selectionType").value = type;
  document.querySelectorAll(".type-toggle-btn").forEach(b => b.classList.remove("active"));
  btn.classList.add("active");
}

function saveCompany(editId) {
  const name = document.getElementById("m-name")?.value.trim();
  if (!name) { toast("企業名を入力してください"); return; }
  const selType = document.getElementById("m-co-selectionType")?.value || "インターン";

  if (editId) {
    const c = getCompany(editId);
    if (!c) return;
    c.name = name;
    c.industry = document.getElementById("m-industry")?.value.trim() || "";
    c.status = document.getElementById("m-status")?.value || "エントリー";
    c.url = document.getElementById("m-url")?.value.trim() || "";
    c.notes = document.getElementById("m-notes")?.value.trim() || "";
    c.selectionType = selType;
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
      selectionType: selType,
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

  const selType = c.selectionType || "インターン";
  el.innerHTML = `
    <div class="detail-header">
      <div class="detail-header-top">
        <div>
          <button class="btn btn-ghost btn-sm" onclick="navigate('#${companyBackView}')" style="margin-bottom:8px;padding-left:4px">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px"><path fill-rule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clip-rule="evenodd"/></svg>
            ${companyBackView === "calendar" ? "カレンダー" : "企業一覧"}
          </button>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <div class="detail-company-name">${escHtml(c.name)}</div>
            <span class="selection-type-badge ${selType === '本選考' ? 'badge-honsen' : 'badge-intern'}">${selType}</span>
          </div>
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
      <button class="tab-btn ${currentCompanyTab === "tools" ? "active" : ""}" onclick="switchCompanyTab('tools')">AIツール</button>
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
    <div id="tab-tools" class="tab-panel ${currentCompanyTab === "tools" ? "active" : ""}">
      ${renderToolsTab(c)}
    </div>
  `;
}

function switchCompanyTab(tab) {
  currentCompanyTab = tab;
  document.querySelectorAll(".tab-btn").forEach((b, i) => {
    const tabs = ["overview", "es", "webtest", "interview", "tools"];
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
      <div class="card${collapseState.has(`card-basic-${c.id}`) ? ' collapsed' : ''}" id="card-basic-${c.id}">
        <div class="card-header collapse-trigger" onclick="toggleSection('card-basic-${c.id}')"><div style="display:flex;align-items:center;gap:6px">${CHEV}<span class="card-title">基本情報</span></div></div>
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
            <div class="form-group">
              <label class="form-label">マイページURL</label>
              <input class="form-input" type="url" value="${escHtml(c.mypageUrl || "")}" onchange="updateCompanyField('${c.id}','mypageUrl',this.value)" placeholder="https://mypage.xxx.co.jp/..." />
            </div>
            <div class="form-group">
              <label class="form-label">マイページ ログインID</label>
              <input class="form-input" type="text" value="${escHtml(c.mypageId || "")}" onchange="updateCompanyField('${c.id}','mypageId',this.value)" placeholder="メールアドレス・学籍番号など" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">メモ・志望動機</label>
            <textarea class="form-textarea" rows="4" onchange="updateCompanyField('${c.id}','notes',this.value)" placeholder="志望理由、調査内容、気づきなど自由に記録">${escHtml(c.notes || "")}</textarea>
          </div>
        </div>
      </div>

      <div class="card${collapseState.has(`card-schedule-${c.id}`) ? ' collapsed' : ''}" id="card-schedule-${c.id}">
        <div class="card-header">
          <div onclick="toggleSection('card-schedule-${c.id}')" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">${CHEV}<span class="card-title">選考スケジュール</span></div>
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
          <button class="btn btn-ghost btn-sm" onclick="openEditEventModal('${evt.id}')" title="編集">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
          </button>
          <button class="btn btn-ghost btn-sm" onclick="deleteEvent('${evt.id}','company')" title="削除">
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
  const meta = c.esMeta || {};
  return `
    <div style="max-width:720px">
      <div class="card mb-4${collapseState.has(`card-es-info-${c.id}`) ? ' collapsed' : ''}" id="card-es-info-${c.id}">
        <div class="card-header">
          <div onclick="toggleSection('card-es-info-${c.id}')" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">${CHEV}<span class="card-title">ES対策情報</span></div>
          <button class="btn btn-ai btn-sm" onclick="runEsStrategy('${c.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            AIに調べてもらう
          </button>
        </div>
        <div class="card-body">
          <div id="es-strategy-${c.id}">
            ${meta.aiStrategy
              ? `<div class="ai-result md-content">${markdownToHtml(meta.aiStrategy)}</div>
                 <div style="font-size:11px;color:var(--text-4);margin-top:8px">取得日: ${fmtDatetime(meta.aiStrategyUpdatedAt || "")}</div>`
              : `<p class="text-muted" style="text-align:center;padding:16px 0">「AIに調べてもらう」を押すと、${escHtml(c.name)}のES対策情報を調べます</p>`}
          </div>
        </div>
      </div>

      <div class="card mb-4${collapseState.has(`card-es-notes-${c.id}`) ? ' collapsed' : ''}" id="card-es-notes-${c.id}">
        <div class="card-header collapse-trigger" onclick="toggleSection('card-es-notes-${c.id}')"><div style="display:flex;align-items:center;gap:6px">${CHEV}<span class="card-title">自分のメモ</span></div></div>
        <div class="card-body">
          <textarea class="form-textarea" rows="4" onchange="updateEsMeta('${c.id}','notes',this.value)" placeholder="ES対策のメモ、準備内容、気づきなど">${escHtml(meta.notes || "")}</textarea>
        </div>
      </div>

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

  const esId = `es-${entry.id}`;
  return `
    <div class="es-entry${collapseState.has(esId) ? " collapsed" : ""}" id="${esId}">
      <div class="es-entry-header">
        <div class="collapse-trigger" onclick="toggleSection('${esId}')" style="display:flex;align-items:flex-start;gap:6px">
          ${CHEV}
          <div class="es-question-text">${escHtml(entry.question)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-ai btn-sm" onclick="runEsReview('${c.id}','${entry.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            AI添削
          </button>
          <button class="btn btn-secondary btn-sm" onclick="runEsAdvice('${c.id}','${entry.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>
            AIアドバイス
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
                  <span style="display:flex;align-items:center;gap:4px"><svg viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>AI添削結果</span>
                </div>
                <div class="md-content">${markdownToHtml(entry.aiReview)}</div>
              </div>`
            : ""}
          ${entry.aiAdvice
            ? `<div class="es-review-panel" style="border-color:#6366f120;background:var(--surface-2)">
                <div class="es-review-label" style="color:#6366f1">
                  <span style="display:flex;align-items:center;gap:4px"><svg viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>AIアドバイス</span></div>
                <div class="md-content">${markdownToHtml(entry.aiAdvice)}</div>
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
    const res = await aiPost("/api/jobs/ai/es-review", { companyName: c.name, question: entry.question, answer: entry.answer });
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

async function runEsStrategy(companyId) {
  const c = getCompany(companyId);
  if (!c) return;
  const el = document.getElementById(`es-strategy-${companyId}`);
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>AIが調査中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/es-strategy", { companyName: c.name, esEntries: (c.es || []).map(e => ({ question: e.question })) });
    c.esMeta = c.esMeta || {};
    c.esMeta.aiStrategy = res.strategy;
    c.esMeta.aiStrategyUpdatedAt = now();
    c.updatedAt = now();
    scheduleSave();
    if (el) el.innerHTML = `<div class="ai-result md-content">${markdownToHtml(res.strategy)}</div><div style="font-size:11px;color:var(--text-4);margin-top:8px">取得日: ${fmtDatetime(c.esMeta.aiStrategyUpdatedAt)}</div>`;
    toast("ES対策情報を取得しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px 0">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

async function runEsAdvice(companyId, esId) {
  const c = getCompany(companyId);
  const entry = (c?.es || []).find(e => e.id === esId);
  if (!entry) return;
  if (!entry.question) { toast("設問を入力してください"); return; }
  const reviewEl = document.getElementById(`es-review-${esId}`);
  if (reviewEl) reviewEl.innerHTML = `<div class="ai-loading"><div class="spinner"></div>AIがアドバイス作成中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/es-advice", { companyName: c.name, question: entry.question });
    entry.aiAdvice = res.advice;
    entry.updatedAt = now();
    c.updatedAt = now();
    scheduleSave();
    if (reviewEl) {
      reviewEl.innerHTML = `
        ${entry.aiReview ? `<div class="es-review-panel"><div class="es-review-label"><svg viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>AI添削結果</div><div class="md-content">${markdownToHtml(entry.aiReview)}</div></div>` : ""}
        <div class="es-review-panel" style="border-color:#6366f120;background:var(--surface-2)">
          <div class="es-review-label" style="color:#6366f1"><svg viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>AIアドバイス</div>
          <div class="md-content">${markdownToHtml(res.advice)}</div>
        </div>`;
    }
    toast("アドバイスを取得しました");
  } catch (e) {
    if (reviewEl) reviewEl.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px 0">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

function updateEsMeta(companyId, field, value) {
  const c = getCompany(companyId);
  if (!c) return;
  c.esMeta = c.esMeta || {};
  c.esMeta[field] = value;
  c.updatedAt = now();
  scheduleSave();
}

/* ===== WebTest Tab ===== */
function renderWebtestTab(c) {
  const wt = c.webTest || {};
  return `
    <div style="max-width:680px">
      <div class="card mb-4${collapseState.has(`card-web-info-${c.id}`) ? ' collapsed' : ''}" id="card-web-info-${c.id}">
        <div class="card-header">
          <div onclick="toggleSection('card-web-info-${c.id}')" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">${CHEV}<span class="card-title">WEBテスト情報</span></div>
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

      <div class="card${collapseState.has(`card-web-notes-${c.id}`) ? ' collapsed' : ''}" id="card-web-notes-${c.id}">
        <div class="card-header collapse-trigger" onclick="toggleSection('card-web-notes-${c.id}')"><div style="display:flex;align-items:center;gap:6px">${CHEV}<span class="card-title">自分のメモ</span></div></div>
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
    const res = await aiPost("/api/jobs/ai/webtest", { companyName: c.name });
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
  const meta = c.ivMeta || {};
  return `
    <div style="max-width:720px">
      <div class="card mb-4${collapseState.has(`card-iv-info-${c.id}`) ? ' collapsed' : ''}" id="card-iv-info-${c.id}">
        <div class="card-header">
          <div onclick="toggleSection('card-iv-info-${c.id}')" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">${CHEV}<span class="card-title">面接対策情報</span></div>
          <button class="btn btn-ai btn-sm" onclick="runIvStrategy('${c.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            AIに調べてもらう
          </button>
        </div>
        <div class="card-body">
          <div id="iv-strategy-${c.id}">
            ${meta.aiStrategy
              ? `<div class="ai-result md-content">${markdownToHtml(meta.aiStrategy)}</div>
                 <div style="font-size:11px;color:var(--text-4);margin-top:8px">取得日: ${fmtDatetime(meta.aiStrategyUpdatedAt || "")}</div>`
              : `<p class="text-muted" style="text-align:center;padding:16px 0">「AIに調べてもらう」を押すと、${escHtml(c.name)}の面接対策情報を調べます</p>`}
          </div>
        </div>
      </div>

      <div class="card mb-4${collapseState.has(`card-iv-notes-${c.id}`) ? ' collapsed' : ''}" id="card-iv-notes-${c.id}">
        <div class="card-header collapse-trigger" onclick="toggleSection('card-iv-notes-${c.id}')"><div style="display:flex;align-items:center;gap:6px">${CHEV}<span class="card-title">自分のメモ</span></div></div>
        <div class="card-body">
          <textarea class="form-textarea" rows="4" onchange="updateIvMeta('${c.id}','notes',this.value)" placeholder="面接対策のメモ、準備内容、気づきなど">${escHtml(meta.notes || "")}</textarea>
        </div>
      </div>

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

  const ivId = `iv-${iv.id}`;
  return `
    <div class="interview-card${collapseState.has(ivId) ? " collapsed" : ""}" id="${ivId}">
      <div class="interview-card-header">
        <div class="collapse-trigger" onclick="toggleSection('${ivId}')" style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">
          ${CHEV}
          <span class="interview-round-label">${escHtml(iv.type)}</span>
          ${resultChip}
          ${iv.date ? `<span style="font-size:12px;color:var(--text-3)">${fmtDateFull(iv.date)}${iv.time ? " " + iv.time : ""}</span>` : ""}
        </div>
        <div style="display:flex;align-items:center;gap:6px">
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
                  <div class="panel-label" style="font-size:11.5px;font-weight:700;color:var(--purple-text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">AI収集情報</div>
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
                  <div class="panel-label" style="font-size:11.5px;font-weight:700;color:var(--green-text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">AIフィードバック</div>
                  <div class="md-content">${markdownToHtml(iv.aiExperienceFeedback)}</div>
                </div>`
              : ""}
          </div>
        </div>

        <div>
          <div class="interview-section-title" style="color:var(--accent)">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:13px;height:13px"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fill-rule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clip-rule="evenodd"/></svg>
            面接Q&A練習
          </div>
          <div style="margin-bottom:10px;display:flex;justify-content:flex-end">
            <button class="btn btn-secondary btn-sm" onclick="openAddIvQaModal('${c.id}','${iv.id}')">+ Q&Aを追加</button>
          </div>
          <div id="iv-qa-list-${iv.id}">
            ${renderIvQaList(c, iv)}
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
    const res = await aiPost("/api/jobs/ai/interview-tips", { companyName: c.name, interviewType: iv.type });
    iv.aiTips = res.tips;
    iv.updatedAt = now();
    c.updatedAt = now();
    scheduleSave();

    if (el) {
      el.innerHTML = `
        <div class="interview-tips-panel mt-3">
          <div class="panel-label" style="font-size:11.5px;font-weight:700;color:var(--purple-text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">AI収集情報</div>
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
    const res = await aiPost("/api/jobs/ai/interview-feedback", {
        companyName: c.name,
        interviewType: iv.type,
        experience: iv.experience,
        questionsAsked: iv.questionsAsked,
      });
    iv.aiExperienceFeedback = res.feedback;
    iv.updatedAt = now();
    c.updatedAt = now();
    scheduleSave();

    if (el) {
      el.innerHTML = `
        <div class="interview-feedback-panel mt-3">
          <div class="panel-label" style="font-size:11.5px;font-weight:700;color:var(--green-text);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">AIフィードバック</div>
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

/* ===== Interview Q&A ===== */
function renderIvQaList(c, iv) {
  const qaList = iv.qa || [];
  if (!qaList.length) return `<p class="text-muted" style="font-size:12.5px;text-align:center;padding:8px 0">Q&Aがありません。「Q&Aを追加」で面接練習の設問を登録しましょう</p>`;
  return qaList.map(qa => ivQaEntryHtml(c, iv, qa)).join("");
}

function ivQaEntryHtml(c, iv, qa) {
  const charCount = (qa.answer || "").length;
  return `
    <div class="es-entry${collapseState.has(`ivqa-${qa.id}`) ? " collapsed" : ""}" id="ivqa-${qa.id}" style="margin-bottom:12px">
      <div class="es-entry-header">
        <div class="collapse-trigger" onclick="toggleSection('ivqa-${qa.id}')" style="display:flex;align-items:flex-start;gap:6px">
          ${CHEV}
          <div class="es-question-text" style="font-size:13px">${escHtml(qa.question)}</div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-ai btn-sm" onclick="runIvQaReview('${c.id}','${iv.id}','${qa.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            AI添削
          </button>
          <button class="btn btn-secondary btn-sm" onclick="runIvQaAdvice('${c.id}','${iv.id}','${qa.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>
            AIアドバイス
          </button>
          <button class="btn btn-ghost btn-sm" onclick="deleteIvQa('${c.id}','${iv.id}','${qa.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
          </button>
        </div>
      </div>
      <div class="es-entry-body">
        <textarea class="form-textarea" rows="4" onchange="updateIvQaField('${c.id}','${iv.id}','${qa.id}','answer',this.value)" placeholder="回答を入力してください">${escHtml(qa.answer || "")}</textarea>
        <div style="font-size:11px;color:var(--text-4);text-align:right">${charCount}字</div>
        <div id="ivqa-review-${qa.id}">
          ${qa.aiReview ? `<div class="es-review-panel"><div class="es-review-label"><svg viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>AI添削結果</div><div class="md-content">${markdownToHtml(qa.aiReview)}</div></div>` : ""}
          ${qa.aiAdvice ? `<div class="es-review-panel" style="border-color:#6366f120;background:var(--surface-2)"><div class="es-review-label" style="color:#6366f1"><svg viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>AIアドバイス</div><div class="md-content">${markdownToHtml(qa.aiAdvice)}</div></div>` : ""}
        </div>
      </div>
    </div>
  `;
}

async function runIvStrategy(companyId) {
  const c = getCompany(companyId);
  if (!c) return;
  const el = document.getElementById(`iv-strategy-${companyId}`);
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>AIが調査中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/iv-strategy", { companyName: c.name });
    c.ivMeta = c.ivMeta || {};
    c.ivMeta.aiStrategy = res.strategy;
    c.ivMeta.aiStrategyUpdatedAt = now();
    c.updatedAt = now();
    scheduleSave();
    if (el) el.innerHTML = `<div class="ai-result md-content">${markdownToHtml(res.strategy)}</div><div style="font-size:11px;color:var(--text-4);margin-top:8px">取得日: ${fmtDatetime(c.ivMeta.aiStrategyUpdatedAt)}</div>`;
    toast("面接対策情報を取得しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px 0">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

function updateIvMeta(companyId, field, value) {
  const c = getCompany(companyId);
  if (!c) return;
  c.ivMeta = c.ivMeta || {};
  c.ivMeta[field] = value;
  c.updatedAt = now();
  scheduleSave();
}

function openAddIvQaModal(companyId, ivId) {
  const body = `
    <div class="form-group">
      <label class="form-label">設問 <span style="color:var(--red)">*</span></label>
      <textarea class="form-textarea" id="m-ivqa-q" rows="2" placeholder="例: 学生時代に最も力を入れたことは何ですか？"></textarea>
    </div>
    <div class="form-group mt-3">
      <label class="form-label">回答（任意）</label>
      <textarea class="form-textarea" id="m-ivqa-a" rows="5" placeholder="回答を入力してください（後から入力もOK）"></textarea>
    </div>
  `;
  openModal("Q&Aを追加", body, `
    <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    <button class="btn btn-primary" onclick="saveIvQa('${companyId}','${ivId}',null)">追加</button>
  `);
  document.getElementById("m-ivqa-q")?.focus();
}

function saveIvQa(companyId, ivId, qaId) {
  const c = getCompany(companyId);
  const iv = (c?.interviews || []).find(x => x.id === ivId);
  if (!c || !iv) return;
  iv.qa = iv.qa || [];
  const q = document.getElementById("m-ivqa-q")?.value.trim();
  const a = document.getElementById("m-ivqa-a")?.value.trim() || "";
  if (!q) { toast("設問を入力してください"); return; }
  if (qaId) {
    const qa = iv.qa.find(x => x.id === qaId);
    if (qa) { qa.question = q; qa.answer = a; qa.updatedAt = now(); }
  } else {
    iv.qa.push({ id: uid(), question: q, answer: a, aiReview: null, aiAdvice: null, createdAt: now(), updatedAt: now() });
  }
  iv.updatedAt = now();
  c.updatedAt = now();
  scheduleSave();
  closeModal();
  const listEl = document.getElementById(`iv-qa-list-${ivId}`);
  if (listEl) listEl.innerHTML = renderIvQaList(c, iv);
  toast(qaId ? "更新しました" : "追加しました");
}

function deleteIvQa(companyId, ivId, qaId) {
  if (!confirm("このQ&Aを削除しますか？")) return;
  const c = getCompany(companyId);
  const iv = (c?.interviews || []).find(x => x.id === ivId);
  if (!iv) return;
  iv.qa = (iv.qa || []).filter(x => x.id !== qaId);
  iv.updatedAt = now();
  c.updatedAt = now();
  scheduleSave();
  const listEl = document.getElementById(`iv-qa-list-${ivId}`);
  if (listEl) listEl.innerHTML = renderIvQaList(c, iv);
  toast("削除しました");
}

function updateIvQaField(companyId, ivId, qaId, field, value) {
  const c = getCompany(companyId);
  const iv = (c?.interviews || []).find(x => x.id === ivId);
  const qa = (iv?.qa || []).find(x => x.id === qaId);
  if (!qa) return;
  qa[field] = value;
  qa.updatedAt = now();
  iv.updatedAt = now();
  c.updatedAt = now();
  scheduleSave();
}

async function runIvQaReview(companyId, ivId, qaId) {
  const c = getCompany(companyId);
  const iv = (c?.interviews || []).find(x => x.id === ivId);
  const qa = (iv?.qa || []).find(x => x.id === qaId);
  if (!qa) return;
  if (!qa.question || !qa.answer) { toast("設問と回答を入力してください"); return; }
  const el = document.getElementById(`ivqa-review-${qaId}`);
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>AIが添削中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/iv-review", { companyName: c.name, interviewType: iv.type, question: qa.question, answer: qa.answer });
    qa.aiReview = res.review;
    qa.updatedAt = now();
    c.updatedAt = now();
    scheduleSave();
    if (el) el.innerHTML = `<div class="es-review-panel"><div class="es-review-label"><svg viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>AI添削結果</div><div class="md-content">${markdownToHtml(res.review)}</div></div>`;
    toast("添削が完了しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px 0">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

async function runIvQaAdvice(companyId, ivId, qaId) {
  const c = getCompany(companyId);
  const iv = (c?.interviews || []).find(x => x.id === ivId);
  const qa = (iv?.qa || []).find(x => x.id === qaId);
  if (!qa || !qa.question) { toast("設問を入力してください"); return; }
  const el = document.getElementById(`ivqa-review-${qaId}`);
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>AIがアドバイス作成中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/iv-advice", { companyName: c.name, interviewType: iv.type, question: qa.question });
    qa.aiAdvice = res.advice;
    qa.updatedAt = now();
    c.updatedAt = now();
    scheduleSave();
    if (el) el.innerHTML = `<div class="es-review-panel" style="border-color:#6366f120;background:var(--surface-2)"><div class="es-review-label" style="color:#6366f1"><svg viewBox="0 0 20 20" fill="currentColor" style="width:12px;height:12px"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd"/></svg>AIアドバイス</div><div class="md-content">${markdownToHtml(res.advice)}</div></div>`;
    toast("アドバイスを取得しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px 0">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

/* ===== AI Tools Tab ===== */
function renderToolsTab(c) {
  return `
    <div style="max-width:720px;display:grid;gap:20px">

      <div class="card${collapseState.has(`card-tool-email-${c.id}`) ? ' collapsed' : ''}" id="card-tool-email-${c.id}">
        <div class="card-header collapse-trigger" onclick="toggleSection('card-tool-email-${c.id}')"><div style="display:flex;align-items:center;gap:6px">${CHEV}<span class="card-title">応募メール生成</span></div></div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">企業情報とあなたのプロフィールをもとに、最適な応募メールを1クリックで生成します</p>
          <div class="form-group">
            <label class="form-label">メール種別</label>
            <select class="form-select" id="email-type-${c.id}" style="max-width:240px">
              <option value="応募">インターン/選考への応募メール</option>
              <option value="お礼">面接後のお礼メール</option>
              <option value="問い合わせ">採用情報の問い合わせメール</option>
              <option value="辞退">選考辞退メール</option>
            </select>
          </div>
          <div class="form-group mt-3">
            <label class="form-label">自己PR（任意）</label>
            <textarea class="form-textarea" id="email-selfpr-${c.id}" rows="3" placeholder="自己PRがあれば入力（省略可）">${escHtml(c.baseSelfPr || state.profile.selfPr || "")}</textarea>
          </div>
          <button class="btn btn-ai mt-3" onclick="generateApplicationEmail('${c.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            メールを生成
          </button>
          <div id="email-result-${c.id}" style="margin-top:16px"></div>
        </div>
      </div>

      <div class="card${collapseState.has(`card-tool-scan-${c.id}`) ? ' collapsed' : ''}" id="card-tool-scan-${c.id}">
        <div class="card-header collapse-trigger" onclick="toggleSection('card-tool-scan-${c.id}')"><div style="display:flex;align-items:center;gap:6px">${CHEV}<span class="card-title">求人URL・テキストスキャン</span></div></div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">求人URLまたは求人票テキストを貼り付けると、企業情報・求める人物像・必要スキルを自動抽出します</p>
          <div class="form-group">
            <label class="form-label">求人URL（任意）</label>
            <input class="form-input" id="job-url-${c.id}" type="url" placeholder="https://job.rikunabi.com/..." />
          </div>
          <div class="form-group mt-3">
            <label class="form-label">求人票テキスト（URLが使えない場合はここに貼り付け）</label>
            <textarea class="form-textarea" id="job-text-${c.id}" rows="5" placeholder="求人ページからコピーしたテキストを貼り付けてください"></textarea>
          </div>
          <button class="btn btn-ai mt-3" onclick="scanJobInfo('${c.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            情報を抽出
          </button>
          <div id="jobscan-result-${c.id}" style="margin-top:16px">
            ${c.jobScanResult ? `<div class="ai-result md-content">${markdownToHtml(c.jobScanResult)}</div>` : ""}
          </div>
        </div>
      </div>

      <div class="card${collapseState.has(`card-tool-selfpr-${c.id}`) ? ' collapsed' : ''}" id="card-tool-selfpr-${c.id}">
        <div class="card-header collapse-trigger" onclick="toggleSection('card-tool-selfpr-${c.id}')">
          <div style="display:flex;align-items:center;gap:6px">${CHEV}<span class="card-title">自己PR最適化</span></div>
        </div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">ベースとなる自己PRを${escHtml(c.name)}の企業理念・求める人物像に合わせて最適化します</p>
          <div class="form-group">
            <label class="form-label">ベース自己PR <span style="color:var(--red)">*</span></label>
            <textarea class="form-textarea" id="selfpr-base-${c.id}" rows="6" placeholder="現在の自己PRを入力してください">${escHtml(c.baseSelfPr || state.profile.selfPr || "")}</textarea>
          </div>
          <button class="btn btn-ai mt-3" onclick="optimizeSelfPr('${c.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            ${escHtml(c.name)}向けに最適化
          </button>
          <div id="selfpr-result-${c.id}" style="margin-top:16px">
            ${c.optimizedSelfPr ? `<div class="ai-result"><div style="font-size:11.5px;font-weight:700;color:var(--accent);margin-bottom:8px">最適化された自己PR</div><div class="md-content">${markdownToHtml(c.optimizedSelfPr)}</div></div>` : ""}
          </div>
        </div>
      </div>

      <div class="card${collapseState.has(`card-tool-gap-${c.id}`) ? ' collapsed' : ''}" id="card-tool-gap-${c.id}">
        <div class="card-header collapse-trigger" onclick="toggleSection('card-tool-gap-${c.id}')">
          <div style="display:flex;align-items:center;gap:6px">${CHEV}<span class="card-title">ギャップ分析</span></div>
        </div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">企業が求めるものとあなたのESや自己PRを比較し、アピールすべき点と補強が必要な点を分析します</p>
          <button class="btn btn-ai" onclick="runGapAnalysis('${c.id}')">
            <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
            ギャップ分析を実行
          </button>
          <div id="gap-result-${c.id}" style="margin-top:16px">
            ${c.gapAnalysis ? `<div class="ai-result md-content">${markdownToHtml(c.gapAnalysis)}</div>` : ""}
          </div>
        </div>
      </div>

      <div class="card${collapseState.has(`card-tool-mock-${c.id}`) ? ' collapsed' : ''}" id="card-tool-mock-${c.id}">
        <div class="card-header">
          <div onclick="toggleSection('card-tool-mock-${c.id}')" style="display:flex;align-items:center;gap:6px;cursor:pointer;user-select:none">${CHEV}<span class="card-title">面接シミュレーター</span></div>
          <span style="font-size:11px;background:var(--accent);color:#fff;padding:2px 8px;border-radius:99px">NEW</span>
        </div>
        <div class="card-body">
          <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">AIが${escHtml(c.name)}の面接官を演じ、実践的な面接練習ができます。回答するとAIが即座にフィードバックします。</p>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <button class="btn btn-primary" onclick="startMockInterview('${c.id}','一次面接')">一次面接を練習</button>
            <button class="btn btn-secondary" onclick="startMockInterview('${c.id}','最終面接')">最終面接を練習</button>
          </div>
          <div id="mock-interview-${c.id}" style="margin-top:16px"></div>
        </div>
      </div>

    </div>
  `;
}

async function generateApplicationEmail(companyId) {
  const c = getCompany(companyId);
  if (!c) return;
  const emailType = document.getElementById(`email-type-${companyId}`)?.value || "応募";
  const selfPr = document.getElementById(`email-selfpr-${companyId}`)?.value.trim() || "";
  const el = document.getElementById(`email-result-${companyId}`);
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>メール生成中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/generate-email", { companyName: c.name, industry: c.industry, selectionType: c.selectionType || "インターン", emailType, selfPr, status: c.status });
    if (el) el.innerHTML = `
      <div class="ai-result">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:11.5px;font-weight:700;color:var(--accent)">生成されたメール</div>
          <button class="btn btn-secondary btn-sm" onclick="copyText(document.getElementById('email-text-${companyId}').textContent)">コピー</button>
        </div>
        <pre id="email-text-${companyId}" style="white-space:pre-wrap;font-size:13px;line-height:1.7;background:var(--bg);padding:12px;border-radius:8px;border:1px solid var(--border)">${escHtml(res.email)}</pre>
      </div>`;
    toast("メールを生成しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

async function scanJobInfo(companyId) {
  const c = getCompany(companyId);
  if (!c) return;
  const jobUrl = document.getElementById(`job-url-${companyId}`)?.value.trim() || "";
  const jobText = document.getElementById(`job-text-${companyId}`)?.value.trim() || "";
  if (!jobUrl && !jobText) { toast("URLまたは求人テキストを入力してください"); return; }
  const el = document.getElementById(`jobscan-result-${companyId}`);
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>求人情報を解析中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/scan-job", { companyName: c.name, jobUrl, jobText });
    c.jobScanResult = res.result;
    c.updatedAt = now();
    scheduleSave();
    if (el) el.innerHTML = `<div class="ai-result md-content">${markdownToHtml(res.result)}</div>`;
    toast("求人情報を抽出しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

async function optimizeSelfPr(companyId) {
  const c = getCompany(companyId);
  if (!c) return;
  const basePr = document.getElementById(`selfpr-base-${companyId}`)?.value.trim() || "";
  if (!basePr) { toast("ベース自己PRを入力してください"); return; }
  c.baseSelfPr = basePr;
  const el = document.getElementById(`selfpr-result-${companyId}`);
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>最適化中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/optimize-selfpr", { companyName: c.name, industry: c.industry, selectionType: c.selectionType || "インターン", basePr, esEntries: (c.es || []).map(e => ({ question: e.question, answer: e.answer })) });
    c.optimizedSelfPr = res.optimized;
    c.updatedAt = now();
    scheduleSave();
  if (el) el.innerHTML = `
      <div class="ai-result">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <div style="font-size:11.5px;font-weight:700;color:var(--accent)">最適化された自己PR</div>
          <button class="btn btn-secondary btn-sm" onclick="copyText(document.getElementById('selfpr-out-${companyId}').textContent)">コピー</button>
        </div>
        <div id="selfpr-out-${companyId}" class="md-content">${markdownToHtml(res.optimized)}</div>
      </div>`;
    toast("自己PRを最適化しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

async function runGapAnalysis(companyId) {
  const c = getCompany(companyId);
  if (!c) return;
  const el = document.getElementById(`gap-result-${companyId}`);
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>ギャップ分析中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/gap-analysis", { companyName: c.name, industry: c.industry, selectionType: c.selectionType || "インターン", esEntries: (c.es || []).map(e => ({ question: e.question, answer: e.answer })), selfPr: c.baseSelfPr || "", notes: c.notes || "" });
    c.gapAnalysis = res.analysis;
    c.updatedAt = now();
    scheduleSave();
    if (el) el.innerHTML = `<div class="ai-result md-content">${markdownToHtml(res.analysis)}</div>`;
    toast("ギャップ分析が完了しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

async function startMockInterview(companyId, interviewType) {
  const c = getCompany(companyId);
  if (!c) return;
  const el = document.getElementById(`mock-interview-${companyId}`);
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>面接官を準備中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/mock-interview-start", { companyName: c.name, interviewType });
    if (el) el.innerHTML = renderMockInterviewUI(companyId, interviewType, res.question, res.context, []);
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

function renderMockInterviewUI(companyId, interviewType, question, context, history) {
  const historyHtml = history.map(h => `
    <div style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:var(--text-3);margin-bottom:4px">面接官:</div>
      <div style="font-size:13px;padding:8px 12px;background:var(--surface-2);border-radius:8px;border-left:3px solid var(--accent)">${escHtml(h.q)}</div>
      <div style="font-size:12px;font-weight:700;color:var(--text-3);margin:8px 0 4px">あなた:</div>
      <div style="font-size:13px;padding:8px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">${escHtml(h.a)}</div>
      ${h.feedback ? `<div style="font-size:12px;padding:8px 12px;background:#f0fdf420;border-radius:8px;border-left:3px solid #22c55e;margin-top:6px;color:var(--text-2)">${markdownToHtml(h.feedback)}</div>` : ""}
    </div>
  `).join("");

  const historyJson = escHtml(JSON.stringify(history));
  const contextEsc = escHtml(context || "");
  const interviewTypeEsc = escHtml(interviewType);
  const questionEsc = escHtml(question);

  return `
    <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <div style="background:var(--accent);color:#fff;padding:10px 16px;font-size:13px;font-weight:700">
        ${interviewTypeEsc} シミュレーション - ${escHtml(getCompany(companyId)?.name || "")}
      </div>
      <div style="padding:16px;max-height:400px;overflow-y:auto" id="mock-history-${companyId}">
        ${historyHtml}
        <div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:700;color:var(--text-3);margin-bottom:4px">面接官:</div>
          <div style="font-size:13px;padding:10px 14px;background:var(--surface-2);border-radius:8px;border-left:3px solid var(--accent);font-weight:500">${questionEsc}</div>
        </div>
      </div>
      <div style="padding:12px 16px;border-top:1px solid var(--border);background:var(--surface)">
        <textarea class="form-textarea" id="mock-answer-${companyId}" rows="3" placeholder="回答を入力してください..." style="margin-bottom:8px"></textarea>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="submitMockAnswer('${companyId}','${interviewTypeEsc}','${questionEsc}',${historyJson},'${contextEsc}')">回答して次の質問へ</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('mock-interview-${companyId}').innerHTML=''">終了</button>
        </div>
      </div>
    </div>
  `;
}

async function submitMockAnswer(companyId, interviewType, question, history, context) {
  const c = getCompany(companyId);
  const answer = document.getElementById(`mock-answer-${companyId}`)?.value.trim();
  if (!answer) { toast("回答を入力してください"); return; }
  const el = document.getElementById(`mock-interview-${companyId}`);
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>AIが評価中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/mock-interview-next", { companyName: c.name, interviewType, question, answer, history, context });
    const newHistory = [...history, { q: question, a: answer, feedback: res.feedback }];
    if (el) el.innerHTML = renderMockInterviewUI(companyId, interviewType, res.nextQuestion, context, newHistory);
    setTimeout(() => {
      const histEl = document.getElementById(`mock-history-${companyId}`);
      if (histEl) histEl.scrollTop = histEl.scrollHeight;
    }, 100);
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => toast("コピーしました")).catch(() => toast("コピーに失敗しました"));
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
            <button class="btn btn-secondary btn-sm" onclick="openAddEventModal(null,'${calSelectedDate}')">+ 追加</button>
          </div>
          ${renderEventList(selectedEvts, "calendar")}
          <div style="font-size:12px;color:var(--text-4);margin-top:8px;text-align:center">もう一度タップで詳細を開く</div>`
        : `<div style="font-size:13px;color:var(--text-4);text-align:center;padding:12px 0">日付をタップして予定を確認</div>`}
    </div>

    <div style="margin-top:24px">
      <div class="section-divider">今後の予定</div>
      ${renderEventList(state.schedules.filter((s) => s.date >= todayStr).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 10), "calendar")}
    </div>
  `;
}

function renderEventList(evts, source) {
  if (!evts.length) return `<p class="text-muted" style="text-align:center;padding:12px 0">予定がありません</p>`;
  return `<div class="event-list">${evts.map((evt) => {
    const col = EVENT_COLORS[evt.type] || EVENT_COLORS["その他"];
    const co = evt.companyId ? getCompany(evt.companyId) : null;
    const isIv = evt.id.startsWith("iv-");
    return `
      <div class="event-item">
        <div class="event-type-bar" style="background:${col}"></div>
        <div class="event-content" style="flex:1;min-width:0">
          <div class="event-title">${escHtml(evt.title)}</div>
          <div class="event-meta">${fmtDateFull(evt.date)}${evt.time ? " " + evt.time : ""}${co ? ` · <a href="#company/${co.id}" style="color:var(--accent);text-decoration:none" onclick="event.stopPropagation()">${escHtml(co.name)}</a>` : ""} · ${escHtml(evt.type)}</div>
          ${evt.notes ? `<div class="text-sm text-muted mt-2">${escHtml(evt.notes)}</div>` : ""}
        </div>
        <div class="event-actions">
          ${!isIv ? `
            <button class="btn btn-ghost btn-sm" onclick="openEditEventModal('${evt.id}')" title="編集">
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z"/></svg>
            </button>
            <button class="btn btn-ghost btn-sm" onclick="deleteEvent('${evt.id}','${source || 'calendar'}')" title="削除">
              <svg viewBox="0 0 20 20" fill="currentColor" style="width:14px;height:14px"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd"/></svg>
            </button>
          ` : ""}
        </div>
      </div>
    `;
  }).join("")}</div>`;
}

function selectCalDate(date) {
  if (calSelectedDate === date) {
    // 2回目クリック → 詳細モーダル
    openCalDayModal(date);
  } else {
    calSelectedDate = date;
    renderCalendar();
  }
}

function openCalDayModal(date) {
  const allEvents = [
    ...state.schedules,
    ...state.companies.flatMap(c =>
      (c.interviews || []).filter(iv => iv.date === date).map(iv => ({
        id: `iv-${iv.id}`, companyId: c.id,
        title: `${c.name} ${iv.type}`, type: "面接",
        date: iv.date, time: iv.time || "", notes: iv.location || "",
      }))
    ),
  ].filter(e => e.date === date).sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  openModal(
    fmtDateFull(date) + " の予定",
    `<div style="min-height:60px">${renderEventList(allEvents, "calendar")}</div>`,
    `<button class="btn btn-secondary" onclick="closeModal()">閉じる</button>
     <button class="btn btn-primary" onclick="closeModal();openAddEventModal(null,'${date}')">+ 予定を追加</button>`
  );
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

function eventFormHtml({ companyId = null, date = null, type = "", time = "", notes = "", title = "" } = {}) {
  return `
    <div class="form-group">
      <label class="form-label">タイトル <span style="color:var(--red)">*</span></label>
      <input class="form-input" id="m-evt-title" placeholder="例: ◯◯社 ES締切" value="${escHtml(title)}" />
    </div>
    <div class="two-col mt-3">
      <div class="form-group">
        <label class="form-label">種別</label>
        <select class="form-select" id="m-evt-type">
          ${EVENT_TYPES.map(t => `<option value="${t}" ${t === type ? "selected" : ""}>${t}</option>`).join("")}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">企業（任意）</label>
        <select class="form-select" id="m-evt-company">
          <option value="">なし</option>
          ${state.companies.map(c => `<option value="${c.id}" ${c.id === companyId ? "selected" : ""}>${escHtml(c.name)}</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="two-col mt-3">
      <div class="form-group">
        <label class="form-label">日付 <span style="color:var(--red)">*</span></label>
        <input class="form-input" id="m-evt-date" type="date" value="${date || calSelectedDate || today()}" />
      </div>
      <div class="form-group">
        <label class="form-label">時刻</label>
        <input class="form-input" id="m-evt-time" type="time" value="${time}" />
      </div>
    </div>
    <div class="form-group mt-3">
      <label class="form-label">メモ</label>
      <textarea class="form-textarea" id="m-evt-notes" rows="2" placeholder="場所・URL・注意事項など">${escHtml(notes)}</textarea>
    </div>
  `;
}

function openAddEventModal(companyId, date) {
  openModal("予定を追加", eventFormHtml({ companyId, date }), `
    <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    <button class="btn btn-primary" onclick="saveEvent()">追加</button>
  `);
  document.getElementById("m-evt-title")?.focus();
}

function openEditEventModal(eventId) {
  const evt = state.schedules.find(s => s.id === eventId);
  if (!evt) return;
  openModal("予定を編集", eventFormHtml({ companyId: evt.companyId, date: evt.date, type: evt.type, time: evt.time, notes: evt.notes, title: evt.title }), `
    <button class="btn btn-secondary" onclick="closeModal()">キャンセル</button>
    <button class="btn btn-primary" onclick="saveEditEvent('${eventId}')">保存</button>
  `);
  document.getElementById("m-evt-title")?.focus();
}

function saveEditEvent(eventId) {
  const evt = state.schedules.find(s => s.id === eventId);
  if (!evt) return;
  const title = document.getElementById("m-evt-title")?.value.trim();
  const date  = document.getElementById("m-evt-date")?.value;
  if (!title || !date) { toast("タイトルと日付を入力してください"); return; }
  evt.title     = title;
  evt.date      = date;
  evt.type      = document.getElementById("m-evt-type")?.value || "その他";
  evt.companyId = document.getElementById("m-evt-company")?.value || null;
  evt.time      = document.getElementById("m-evt-time")?.value || "";
  evt.notes     = document.getElementById("m-evt-notes")?.value.trim() || "";
  evt.updatedAt = now();
  scheduleSave();
  closeModal();
  toast("予定を更新しました");
  if (currentView === "calendar") renderCalendar();
  else if (currentView === "dashboard") renderDashboard();
  else if (currentView === "company") renderCompany();
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

/* ===== AI Tools (standalone page) ===== */
function buildArchiveEntries() {
  const entries = [];
  state.companies.forEach(c => {
    (c.es || []).forEach(e => {
      if (e.question) entries.push({ companyId: c.id, companyName: c.name, type: "es", question: e.question, answer: e.answer || "" });
    });
    (c.interviews || []).forEach(iv => {
      (iv.qa || []).forEach(qa => {
        if (qa.question) entries.push({ companyId: c.id, companyName: c.name, type: "iv", question: qa.question, answer: qa.answer || "", interviewType: iv.type });
      });
    });
  });
  return entries;
}

function archiveTextSearch() {
  const query = document.getElementById("archive-search-query")?.value.trim().toLowerCase();
  const el = document.getElementById("archive-search-results");
  if (!el) return;
  if (!query) { el.innerHTML = ""; return; }
  const entries = buildArchiveEntries();
  if (!entries.length) { el.innerHTML = `<div class="text-muted" style="font-size:13px">ES・面接データがまだありません</div>`; return; }
  const results = entries.filter(e =>
    e.question.toLowerCase().includes(query) || e.answer.toLowerCase().includes(query)
  );
  el.innerHTML = renderArchiveResults(results, query);
}

async function archiveAiSearch() {
  const query = document.getElementById("archive-search-query")?.value.trim();
  const el = document.getElementById("archive-search-results");
  if (!el) return;
  if (!query) { el.innerHTML = ""; return; }
  const entries = buildArchiveEntries();
  if (!entries.length) { el.innerHTML = `<div class="text-muted" style="font-size:13px">ES・面接データがまだありません</div>`; return; }
  el.innerHTML = `<div class="text-muted" style="font-size:13px">AI検索中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/archive-search", { query, entries });
    const ranked = (res.results || []).map(r => ({ ...entries[r.index], relevance: r.relevance, reason: r.reason })).filter(e => e.companyId);
    el.innerHTML = ranked.length ? renderArchiveResults(ranked, query, true) : `<div class="text-muted" style="font-size:13px">関連する設問・回答が見つかりませんでした</div>`;
  } catch (e) {
    el.innerHTML = `<div style="font-size:13px;color:var(--red)">AI検索に失敗しました: ${escHtml(e.message)}</div>`;
  }
}

function renderArchiveResults(results, query, showReason) {
  if (!results.length) return `<div class="text-muted" style="font-size:13px">「${escHtml(query)}」に一致する設問・回答が見つかりませんでした</div>`;
  const highlight = (text) => {
    if (!query || showReason) return escHtml(text);
    const escaped = escHtml(text);
    const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    return escaped.replace(re, "<mark>$1</mark>");
  };
  return `
    <div style="font-size:12px;color:var(--text-2);margin-bottom:8px">${results.length}件ヒット</div>
    <div style="display:flex;flex-direction:column;gap:10px">
      ${results.map(e => `
        <div style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;background:var(--surface-2)">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap">
            <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;background:${e.type === "es" ? "var(--accent)" : "var(--green,#10b981)"};color:#fff">${e.type === "es" ? "ES" : "面接"}</span>
            <a href="#company/${e.companyId}" style="font-size:13px;font-weight:600;color:var(--accent)">${escHtml(e.companyName)}</a>
            ${e.interviewType ? `<span style="font-size:12px;color:var(--text-2)">${escHtml(e.interviewType)}</span>` : ""}
            ${e.relevance === "high" ? `<span style="font-size:11px;color:var(--orange,#f59e0b);font-weight:700">関連度高</span>` : ""}
            ${e.reason ? `<span style="font-size:11px;color:var(--text-2)">${escHtml(e.reason)}</span>` : ""}
          </div>
          <div style="font-size:13px;font-weight:600;margin-bottom:4px">${highlight(e.question)}</div>
          ${e.answer ? `<div style="font-size:12px;color:var(--text-2);line-height:1.6;white-space:pre-wrap;max-height:80px;overflow:hidden;text-overflow:ellipsis">${highlight(e.answer.slice(0, 200))}${e.answer.length > 200 ? "…" : ""}</div>` : `<div style="font-size:12px;color:var(--text-3,#9ca3af)">（回答未記入）</div>`}
        </div>
      `).join("")}
    </div>
  `;
}

function renderAiTools() {
  const el = document.getElementById("view-aitools");
  const companies = state.companies;

  const companyOptions = companies.length
    ? companies.map((c) => `<option value="${c.id}">${escHtml((c.selectionType || "インターン") + " / " + c.name)}</option>`).join("")
    : `<option value="">企業を登録してください</option>`;

  const selectedId = el.dataset.selectedCompany || (companies[0]?.id || "");

  el.innerHTML = `
    <div class="view-header">
      <div>
        <div class="view-title">AIツール</div>
        <div class="view-subtitle">就活を有利にする5つのAI機能</div>
      </div>
    </div>

    <div style="max-width:760px">

      <div class="card mb-4">
        <div class="card-body" style="padding:16px 20px">
          <div style="font-size:14px;font-weight:700;margin-bottom:4px">🔍 ES・面接アーカイブ検索</div>
          <div style="font-size:13px;color:var(--text-2);margin-bottom:12px">設問・回答を横断検索。ESの使い回しや面接準備に活用できます。</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <input type="text" class="form-input" id="archive-search-query" placeholder="例：学生時代で困難だったこと、チームワーク、挫折経験..." style="flex:1;min-width:200px" onkeydown="if(event.key==='Enter')archiveTextSearch()" />
            <button class="btn btn-secondary" onclick="archiveTextSearch()">検索</button>
            <button class="btn btn-primary" onclick="archiveAiSearch()">AI検索</button>
          </div>
          <div id="archive-search-results" style="margin-top:12px"></div>
        </div>
      </div>

      <div class="card mb-4" style="background:var(--accent);color:#fff;border:none">
        <div class="card-body" style="padding:16px 20px">
          <div style="font-size:13px;font-weight:600;margin-bottom:8px">対象企業を選択</div>
          <select class="form-select" id="aitools-company-select" style="background:#fff;color:var(--text-1);font-weight:600" onchange="setAiToolsCompany(this.value)">
            ${companyOptions}
          </select>
        </div>
      </div>

      <div id="aitools-content">
        ${selectedId ? renderAiToolsContent(selectedId) : `<div class="empty-state"><p>企業を登録してから利用してください</p><button class="btn btn-primary mt-3" onclick="navigate('#companies')">企業を登録する</button></div>`}
      </div>
    </div>
  `;

  if (selectedId) {
    const sel = document.getElementById("aitools-company-select");
    if (sel) sel.value = selectedId;
    el.dataset.selectedCompany = selectedId;
  }
}

function setAiToolsCompany(companyId) {
  const el = document.getElementById("view-aitools");
  if (el) el.dataset.selectedCompany = companyId;
  const content = document.getElementById("aitools-content");
  if (content) content.innerHTML = renderAiToolsContent(companyId);
  document.getElementById("aitools-company-select").value = companyId;
}

function renderAiToolsContent(companyId) {
  const c = getCompany(companyId);
  if (!c) return "";

  const toolCards = [
    {
      id: "email",
      icon: "📧",
      title: "応募メール生成",
      desc: `${escHtml(c.name)}への応募・お礼・問い合わせメールを1クリックで生成`,
      content: `
        <div class="form-group">
          <label class="form-label">メール種別</label>
          <select class="form-select" id="aitools-email-type" style="max-width:260px">
            <option value="応募">インターン/選考への応募メール</option>
            <option value="お礼">面接後のお礼メール</option>
            <option value="問い合わせ">採用情報の問い合わせメール</option>
            <option value="辞退">選考辞退メール</option>
          </select>
        </div>
        <div class="form-group mt-3">
          <label class="form-label">自己PR（任意）</label>
          <textarea class="form-textarea" id="aitools-email-selfpr" rows="3" placeholder="自己PRがあれば入力">${escHtml(c.baseSelfPr || state.profile.selfPr || "")}</textarea>
        </div>
        <button class="btn btn-ai mt-3" onclick="aitoolsGenerateEmail('${c.id}')">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
          メールを生成
        </button>
        <div id="aitools-email-result" style="margin-top:16px"></div>`,
    },
    {
      id: "scan",
      icon: "🔍",
      title: "求人URLスキャン",
      desc: "求人URLまたはテキストから企業情報・求める人物像を自動抽出",
      content: `
        <div class="form-group">
          <label class="form-label">求人URL（任意）</label>
          <input class="form-input" id="aitools-job-url" type="url" placeholder="https://job.rikunabi.com/..." />
        </div>
        <div class="form-group mt-3">
          <label class="form-label">求人票テキスト（URLが使えない場合）</label>
          <textarea class="form-textarea" id="aitools-job-text" rows="5" placeholder="求人ページからコピーしたテキストを貼り付け"></textarea>
        </div>
        <button class="btn btn-ai mt-3" onclick="aitoolsScanJob('${c.id}')">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
          情報を抽出
        </button>
        <div id="aitools-scan-result" style="margin-top:16px">
          ${c.jobScanResult ? `<div class="ai-result md-content">${markdownToHtml(c.jobScanResult)}</div>` : ""}
        </div>`,
    },
    {
      id: "selfpr",
      icon: "✨",
      title: "自己PR最適化",
      desc: `ベースの自己PRを${escHtml(c.name)}の企業理念に合わせて自動チューニング`,
      content: `
        <div class="form-group">
          <label class="form-label">ベース自己PR <span style="color:var(--red)">*</span></label>
          <textarea class="form-textarea" id="aitools-selfpr-base" rows="6" placeholder="現在の自己PRを入力">${escHtml(c.baseSelfPr || state.profile.selfPr || "")}</textarea>
        </div>
        <button class="btn btn-ai mt-3" onclick="aitoolsOptimizeSelfPr('${c.id}')">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
          ${escHtml(c.name)}向けに最適化
        </button>
        <div id="aitools-selfpr-result" style="margin-top:16px">
          ${c.optimizedSelfPr ? `<div class="ai-result"><div style="font-size:11.5px;font-weight:700;color:var(--accent);margin-bottom:8px">最適化された自己PR</div><div class="md-content">${markdownToHtml(c.optimizedSelfPr)}</div><button class="btn btn-secondary btn-sm mt-2" onclick="copyText(document.getElementById('aitools-selfpr-out').textContent)">コピー</button><div id="aitools-selfpr-out" style="display:none">${escHtml(c.optimizedSelfPr)}</div></div>` : ""}
        </div>`,
    },
    {
      id: "gap",
      icon: "📊",
      title: "ギャップ分析",
      desc: `企業が求める人物像とあなたのES・自己PRを比較して補強点を提示`,
      content: `
        <p style="font-size:13px;color:var(--text-3);margin-bottom:12px">ESタブに設問・回答を登録しておくと、より精度の高い分析ができます</p>
        <button class="btn btn-ai" onclick="aitoolsGapAnalysis('${c.id}')">
          <svg viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd"/></svg>
          ギャップ分析を実行
        </button>
        <div id="aitools-gap-result" style="margin-top:16px">
          ${c.gapAnalysis ? `<div class="ai-result md-content">${markdownToHtml(c.gapAnalysis)}</div>` : ""}
        </div>`,
    },
    {
      id: "mock",
      icon: "🎤",
      title: "面接シミュレーター",
      desc: `AIが${escHtml(c.name)}の面接官を演じて実践練習。回答に即時フィードバック`,
      badge: "NEW",
      content: `
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <button class="btn btn-primary" onclick="aitoolsMockInterview('${c.id}','一次面接')">一次面接を練習</button>
          <button class="btn btn-secondary" onclick="aitoolsMockInterview('${c.id}','最終面接')">最終面接を練習</button>
        </div>
        <div id="aitools-mock-result"></div>`,
    },
  ];

  return toolCards.map((t) => `
    <div class="card mb-4">
      <div class="card-header" style="cursor:pointer" onclick="toggleAiToolCard('${t.id}')">
        <span class="card-title" style="font-size:15px">${t.icon} ${t.title}${t.badge ? ` <span style="font-size:10px;background:var(--accent);color:#fff;padding:1px 6px;border-radius:99px;vertical-align:middle">${t.badge}</span>` : ""}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:12px;color:var(--text-3)">${t.desc}</span>
          <svg id="aitools-chevron-${t.id}" viewBox="0 0 20 20" fill="currentColor" style="width:16px;height:16px;flex-shrink:0;transition:transform .2s"><path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd"/></svg>
        </div>
      </div>
      <div class="card-body" id="aitools-panel-${t.id}" style="display:none">
        ${t.content}
      </div>
    </div>
  `).join("");
}

function toggleAiToolCard(id) {
  const panel = document.getElementById(`aitools-panel-${id}`);
  const chevron = document.getElementById(`aitools-chevron-${id}`);
  if (!panel) return;
  const isOpen = panel.style.display !== "none";
  panel.style.display = isOpen ? "none" : "block";
  if (chevron) chevron.style.transform = isOpen ? "" : "rotate(180deg)";
}

async function aitoolsGenerateEmail(companyId) {
  const c = getCompany(companyId);
  if (!c) return;
  const emailType = document.getElementById("aitools-email-type")?.value || "応募";
  const selfPr = document.getElementById("aitools-email-selfpr")?.value.trim() || "";
  const el = document.getElementById("aitools-email-result");
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>メール生成中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/generate-email", { companyName: c.name, industry: c.industry, selectionType: c.selectionType || "インターン", emailType, selfPr, status: c.status });
    if (el) el.innerHTML = `<div class="ai-result"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:11.5px;font-weight:700;color:var(--accent)">生成されたメール</div><button class="btn btn-secondary btn-sm" onclick="copyText(document.getElementById('aitools-email-text').textContent)">コピー</button></div><pre id="aitools-email-text" style="white-space:pre-wrap;font-size:13px;line-height:1.7;background:var(--bg);padding:12px;border-radius:8px;border:1px solid var(--border)">${escHtml(res.email)}</pre></div>`;
    toast("メールを生成しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

async function aitoolsScanJob(companyId) {
  const c = getCompany(companyId);
  if (!c) return;
  const jobUrl = document.getElementById("aitools-job-url")?.value.trim() || "";
  const jobText = document.getElementById("aitools-job-text")?.value.trim() || "";
  if (!jobUrl && !jobText) { toast("URLまたは求人テキストを入力してください"); return; }
  const el = document.getElementById("aitools-scan-result");
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>求人情報を解析中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/scan-job", { companyName: c.name, jobUrl, jobText });
    c.jobScanResult = res.result;
    c.updatedAt = now();
    scheduleSave();
    if (el) el.innerHTML = `<div class="ai-result md-content">${markdownToHtml(res.result)}</div>`;
    toast("求人情報を抽出しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

async function aitoolsOptimizeSelfPr(companyId) {
  const c = getCompany(companyId);
  if (!c) return;
  const basePr = document.getElementById("aitools-selfpr-base")?.value.trim() || "";
  if (!basePr) { toast("ベース自己PRを入力してください"); return; }
  c.baseSelfPr = basePr;
  const el = document.getElementById("aitools-selfpr-result");
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>最適化中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/optimize-selfpr", { companyName: c.name, industry: c.industry, selectionType: c.selectionType || "インターン", basePr, esEntries: (c.es || []).map(e => ({ question: e.question, answer: e.answer })) });
    c.optimizedSelfPr = res.optimized;
    c.updatedAt = now();
    scheduleSave();
  if (el) el.innerHTML = `<div class="ai-result"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-size:11.5px;font-weight:700;color:var(--accent)">最適化された自己PR</div><button class="btn btn-secondary btn-sm" onclick="copyText(document.getElementById('aitools-selfpr-out').textContent)">コピー</button></div><div id="aitools-selfpr-out" class="md-content">${markdownToHtml(res.optimized)}</div></div>`;
    toast("自己PRを最適化しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

async function aitoolsGapAnalysis(companyId) {
  const c = getCompany(companyId);
  if (!c) return;
  const el = document.getElementById("aitools-gap-result");
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>ギャップ分析中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/gap-analysis", { companyName: c.name, industry: c.industry, selectionType: c.selectionType || "インターン", esEntries: (c.es || []).map(e => ({ question: e.question, answer: e.answer })), selfPr: c.baseSelfPr || "", notes: c.notes || "" });
    c.gapAnalysis = res.analysis;
    c.updatedAt = now();
    scheduleSave();
    if (el) el.innerHTML = `<div class="ai-result md-content">${markdownToHtml(res.analysis)}</div>`;
    toast("ギャップ分析が完了しました");
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

async function aitoolsMockInterview(companyId, interviewType) {
  const c = getCompany(companyId);
  if (!c) return;
  const el = document.getElementById("aitools-mock-result");
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>面接官を準備中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/mock-interview-start", { companyName: c.name, interviewType });
    if (el) el.innerHTML = renderAitoolsMockUI(companyId, interviewType, res.question, res.context, []);
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
  }
}

function renderAitoolsMockUI(companyId, interviewType, question, context, history) {
  const historyHtml = history.map(h => `
    <div style="margin-bottom:12px">
      <div style="font-size:12px;font-weight:700;color:var(--text-3);margin-bottom:4px">面接官:</div>
      <div style="font-size:13px;padding:8px 12px;background:var(--surface-2);border-radius:8px;border-left:3px solid var(--accent)">${escHtml(h.q)}</div>
      <div style="font-size:12px;font-weight:700;color:var(--text-3);margin:8px 0 4px">あなた:</div>
      <div style="font-size:13px;padding:8px 12px;background:var(--bg);border-radius:8px;border:1px solid var(--border)">${escHtml(h.a)}</div>
      ${h.feedback ? `<div style="font-size:12.5px;padding:8px 12px;background:#f0fdf420;border-radius:8px;border-left:3px solid #22c55e;margin-top:6px;color:var(--text-2)" class="md-content">${markdownToHtml(h.feedback)}</div>` : ""}
    </div>
  `).join("");

  const historyJson = JSON.stringify(history).replace(/"/g, "&quot;");
  const contextEsc = (context || "").replace(/"/g, "&quot;");

  return `
    <div style="border:1px solid var(--border);border-radius:12px;overflow:hidden">
      <div style="background:var(--accent);color:#fff;padding:10px 16px;font-size:13px;font-weight:700">
        🎤 ${escHtml(interviewType)} シミュレーション — ${escHtml(getCompany(companyId)?.name || "")}
      </div>
      <div style="padding:16px;max-height:400px;overflow-y:auto" id="aitools-mock-history">
        ${historyHtml}
        <div style="margin-bottom:12px">
          <div style="font-size:12px;font-weight:700;color:var(--text-3);margin-bottom:4px">面接官:</div>
          <div style="font-size:13px;padding:10px 14px;background:var(--surface-2);border-radius:8px;border-left:3px solid var(--accent);font-weight:500">${escHtml(question)}</div>
        </div>
      </div>
      <div style="padding:12px 16px;border-top:1px solid var(--border);background:var(--surface)">
        <textarea class="form-textarea" id="aitools-mock-answer" rows="3" placeholder="回答を入力..." style="margin-bottom:8px"></textarea>
        <div style="display:flex;gap:8px">
          <button class="btn btn-primary btn-sm" onclick="aitoolsSubmitMock('${companyId}','${escHtml(interviewType)}','${escHtml(question)}','${contextEsc}',${historyJson.replace(/'/g, "&#39;")})">回答して次へ</button>
          <button class="btn btn-ghost btn-sm" onclick="document.getElementById('aitools-mock-result').innerHTML=''">終了</button>
        </div>
      </div>
    </div>
  `;
}

async function aitoolsSubmitMock(companyId, interviewType, question, context, history) {
  const c = getCompany(companyId);
  const answer = document.getElementById("aitools-mock-answer")?.value.trim();
  if (!answer) { toast("回答を入力してください"); return; }
  const el = document.getElementById("aitools-mock-result");
  if (el) el.innerHTML = `<div class="ai-loading"><div class="spinner"></div>AIが評価中...</div>`;
  try {
    const res = await aiPost("/api/jobs/ai/mock-interview-next", { companyName: c.name, interviewType, question, answer, history, context });
    const newHistory = [...(Array.isArray(history) ? history : []), { q: question, a: answer, feedback: res.feedback }];
    if (el) el.innerHTML = renderAitoolsMockUI(companyId, interviewType, res.nextQuestion, context, newHistory);
    setTimeout(() => {
      const h = document.getElementById("aitools-mock-history");
      if (h) h.scrollTop = h.scrollHeight;
    }, 100);
  } catch (e) {
    if (el) el.innerHTML = `<div style="color:var(--red);font-size:13px">${escHtml(e.message)}</div>`;
    toast(e.message, 5000);
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
    const res = await aiPost("/api/jobs/ai/analysis", { companies: state.companies, schedules: state.schedules });
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

      <div class="settings-section${collapseState.has('ss-profile') ? ' collapsed' : ''}" id="ss-profile">
        <div class="settings-section-header" onclick="toggleSection('ss-profile')" style="cursor:pointer;user-select:none">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div>
              <div class="settings-section-title">自分のプロフィール</div>
              <div class="settings-section-desc">ES添削・面接指導・AIツール全般でこの情報を参考にします</div>
            </div>
            ${CHEV}
          </div>
        </div>
        <div class="settings-section-body">
          <div class="form-group">
            <label class="form-label">ガクチカ（学生時代に力を入れたこと）</label>
            <textarea class="form-input" id="profile-gakuchika" rows="4" placeholder="例：大学2年から始めたバドミントンサークルの運営で、部員30名のスケジュール調整とイベント企画を担当。参加率を40%改善しました。" style="resize:vertical">${escHtml(state.profile.gakuchika || "")}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">自己PR</label>
            <textarea class="form-input" id="profile-selfpr" rows="4" placeholder="例：私の強みは課題発見力です。アルバイト先でデータ分析を行い、売上を15%改善した経験があります。" style="resize:vertical">${escHtml(state.profile.selfPr || "")}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">志望動機の軸</label>
            <textarea class="form-input" id="profile-motivation" rows="3" placeholder="例：「人の課題をテクノロジーで解決する」という軸で就活中。DXや新規事業に携われる環境を重視。" style="resize:vertical">${escHtml(state.profile.motivation || "")}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">スキル・資格・経験</label>
            <textarea class="form-input" id="profile-skills" rows="3" placeholder="例：TOEIC 820点、Python（機械学習）、簿記2級、インターン経験（マーケティング6ヶ月）" style="resize:vertical">${escHtml(state.profile.skills || "")}</textarea>
          </div>
          <div class="form-group">
            <label class="form-label">その他（AIに知っておいてほしいこと）</label>
            <textarea class="form-input" id="profile-other" rows="3" placeholder="例：文系出身だがプログラミングを独学。体育会系の部活経験あり。大学院進学も検討中。" style="resize:vertical">${escHtml(state.profile.other || "")}</textarea>
          </div>
          <button class="btn btn-primary" onclick="saveProfile()">プロフィールを保存</button>
        </div>
      </div>

      <div class="settings-section${collapseState.has('ss-ai') ? ' collapsed' : ''}" id="ss-ai">
        <div class="settings-section-header" onclick="toggleSection('ss-ai')" style="cursor:pointer;user-select:none">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div>
              <div class="settings-section-title">AIサービス設定</div>
              <div class="settings-section-desc">いずれか1つを設定すれば動作します（Gemini推奨）</div>
            </div>
            ${CHEV}
          </div>
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

      <div class="settings-section${collapseState.has('ss-data') ? ' collapsed' : ''}" id="ss-data">
        <div class="settings-section-header" onclick="toggleSection('ss-data')" style="cursor:pointer;user-select:none">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div class="settings-section-title">データ管理</div>
            ${CHEV}
          </div>
        </div>
        <div class="settings-section-body">

          <div class="form-group" style="background:var(--surface-2);border-radius:10px;padding:14px 16px;border:1px solid var(--border)">
            <div style="font-size:13px;font-weight:700;margin-bottom:8px">💾 現在のデータ状況</div>
            <div id="data-status-info" style="font-size:13px;color:var(--text-2);line-height:1.8">確認中...</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">
              <button class="btn btn-secondary btn-sm" onclick="checkDataStatus()">状況を再確認</button>
              <button class="btn btn-primary btn-sm" onclick="forceBackup()">今すぐバックアップ</button>
              <button class="btn btn-secondary btn-sm" onclick="restoreFromBackup()">バックアップから復元</button>
              <button class="btn btn-secondary btn-sm" onclick="forcePushToServer()">サーバーに強制同期</button>
            </div>
          </div>

          <div class="form-group mt-3">
            <label class="form-label">データをエクスポート</label>
            <div class="form-hint">JSONファイルとしてダウンロード（定期的に保存推奨）</div>
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

      <div class="settings-section${collapseState.has('ss-about') ? ' collapsed' : ''}" id="ss-about">
        <div class="settings-section-header" onclick="toggleSection('ss-about')" style="cursor:pointer;user-select:none">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
            <div class="settings-section-title">このアプリについて</div>
            ${CHEV}
          </div>
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
  // Auto-backup: if we have data but backup is empty, silently write backup now
  if (state.companies.length > 0) {
    const backup = _readStorage(BACKUP_KEY);
    if (!(backup.companies || []).length) {
      localStorage.setItem(BACKUP_KEY, JSON.stringify({ companies: state.companies, schedules: state.schedules, updatedAt: Date.now() }));
    }
  }
  checkDataStatus();
}

function saveProfile() {
  state.profile = {
    gakuchika:  document.getElementById("profile-gakuchika")?.value.trim()  || "",
    selfPr:     document.getElementById("profile-selfpr")?.value.trim()     || "",
    motivation: document.getElementById("profile-motivation")?.value.trim() || "",
    skills:     document.getElementById("profile-skills")?.value.trim()     || "",
    other:      document.getElementById("profile-other")?.value.trim()      || "",
  };
  saveData();
  toast("プロフィールを保存しました");
}

function checkDataStatus() {
  const el = document.getElementById("data-status-info");
  if (!el) return;
  const main   = _readStorage(STORAGE_KEY);
  const backup = _readStorage(BACKUP_KEY);
  const mainCount   = (main.companies   || []).length;
  const backupCount = (backup.companies || []).length;
  const serverCount = state.companies.length;
  const mainDate   = main.updatedAt   ? new Date(main.updatedAt).toLocaleString("ja-JP")   : "なし";
  const backupDate = backup.updatedAt ? new Date(backup.updatedAt).toLocaleString("ja-JP") : "なし";
  const lastExport = parseInt(localStorage.getItem("lastExportDate") || "0", 10);
  const exportDate = lastExport ? new Date(lastExport).toLocaleString("ja-JP") : "なし";
  const daysSinceExport = lastExport ? Math.floor((Date.now() - lastExport) / (1000 * 60 * 60 * 24)) : null;
  const exportWarning = daysSinceExport === null || daysSinceExport >= 7
    ? ` <span style="color:var(--orange,#f59e0b);font-weight:700">⚠ バックアップ推奨</span>` : "";
  el.innerHTML = `
    <div>🖥️ メモリ（現在）: <strong>${serverCount}社</strong></div>
    <div>💾 メインストレージ: <strong>${mainCount}社</strong>（最終更新: ${mainDate}）</div>
    <div>🛡️ バックアップ: <strong>${backupCount}社</strong>（最終更新: ${backupDate}）</div>
    <div>📤 最終エクスポート: <strong>${exportDate}</strong>${exportWarning}</div>
    <div style="margin-top:6px;font-size:12px;color:var(--text-3,#9ca3af)">リデプロイ・サーバー再起動が起きてもローカルデータは自動復元されます</div>
  `;
}

function restoreFromBackup() {
  const backup = _readStorage(BACKUP_KEY);
  if (!(backup.companies || []).length) { toast("バックアップにデータがありません"); return; }
  if (!confirm(`バックアップから${backup.companies.length}社のデータを復元しますか？\n現在のデータは上書きされます。`)) return;
  state.companies = backup.companies;
  state.schedules = backup.schedules || [];
  _writeStorage({ companies: state.companies, schedules: state.schedules, updatedAt: Date.now() });
  saveData();
  toast(`${state.companies.length}社のデータをバックアップから復元しました`);
  checkDataStatus();
  renderDashboard();
}

async function forcePushToServer() {
  if (!state.companies.length) { toast("現在表示されているデータがありません"); return; }
  try {
    await _pushToServer();
    toast(`${state.companies.length}社のデータをサーバーに同期しました`);
    checkDataStatus();
  } catch (e) {
    toast("サーバー同期に失敗しました: " + e.message, 5000);
  }
}

function forceBackup() {
  if (!state.companies.length) { toast("バックアップするデータがありません"); return; }
  const entry = { companies: state.companies, schedules: state.schedules, updatedAt: Date.now() };
  localStorage.setItem(BACKUP_KEY, JSON.stringify(entry));
  toast(`${state.companies.length}社のデータをバックアップしました`);
  checkDataStatus();
}

async function loadAiStatus() {
  const el = document.getElementById("settings-ai-status");
  if (!el) return;
  try {
    const s = await fetchJson("/api/status");
    const geminiConfigured = s.savedConfig?.geminiApiKey || s.configFromEnv?.gemini;
    const effectiveModel   = s.configFromEnv?.geminiModelEffective || s.savedConfig?.geminiModel || "gemini-3.5-flash";
    const fallbackModel    = s.configFromEnv?.geminiModelFallback  || "";
    const providers = [
      { name: geminiConfigured ? `Gemini (${effectiveModel}${fallbackModel && fallbackModel !== effectiveModel ? ` → ${fallbackModel}` : ""})` : "Gemini", configured: geminiConfigured },
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
  const data = JSON.stringify({ companies: state.companies, schedules: state.schedules, profile: state.profile, exportedAt: Date.now() }, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `shukatsu-ai-${today()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  localStorage.setItem("lastExportDate", String(Date.now()));
  toast("エクスポートしました");
  checkDataStatus();
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
      if (data.profile) state.profile = { ...state.profile, ...data.profile };
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
  if (!confirm("最終確認です。本当に削除しますか？\n（バックアップキーは残るので設定→バックアップから復元できます）")) return;
  state.companies = [];
  state.schedules = [];
  // saveDataのガードをバイパスして直接書き込む
  try {
    const updatedAt = Date.now();
    await fetchJson("/api/jobs", { method: "POST", body: JSON.stringify({ companies: [], schedules: [], updatedAt }) });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ companies: [], schedules: [], updatedAt }));
  } catch {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ companies: [], schedules: [], updatedAt: Date.now() }));
  }
  toast("データをリセットしました（バックアップは保持されています）");
  navigate("#dashboard");
}

/* ===== Init ===== */
async function init() {
  // AI result panel collapse via event delegation
  document.addEventListener("click", e => {
    if (e.target.closest("button, a[href], input, textarea, select")) return;
    const label = e.target.closest(".es-review-label, .panel-label");
    if (label) { label.parentElement.classList.toggle("collapsed"); }
  });
  await loadData();
  handleRoute();
}

// タブを閉じる・リロード前に確実にlocalStorageへ書く（タイムスタンプは変更があった時だけ更新）
window.addEventListener("beforeunload", () => {
  const ts = _readStorage(STORAGE_KEY).updatedAt || Date.now();
  _writeStorage({ companies: state.companies, schedules: state.schedules, profile: state.profile, updatedAt: ts });
});

// モバイルでアプリを切り替えた時（beforeunloadが発火しないケース）も保存
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    const ts = _readStorage(STORAGE_KEY).updatedAt || Date.now();
    _writeStorage({ companies: state.companies, schedules: state.schedules, profile: state.profile, updatedAt: ts });
  }
});

init();
