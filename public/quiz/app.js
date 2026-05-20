"use strict";

const questionInput = document.getElementById("question-input");
const questionType = document.getElementById("question-type");
const submitBtn = document.getElementById("submit-btn");
const clearBtn = document.getElementById("clear-btn");
const charCount = document.getElementById("char-count");
const answerPlaceholder = document.getElementById("answer-placeholder");
const answerLoading = document.getElementById("answer-loading");
const answerContent = document.getElementById("answer-content");
const copyBtn = document.getElementById("copy-btn");
const historyList = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const toast = document.getElementById("toast");

let history = JSON.parse(localStorage.getItem("quiz-history") || "[]");
let lastAnswer = "";

// ---- Char count ----
questionInput.addEventListener("input", () => {
  const len = questionInput.value.length;
  charCount.textContent = `${len.toLocaleString()} 文字`;
});

// ---- Submit ----
submitBtn.addEventListener("click", submitQuestion);
questionInput.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submitQuestion();
});

async function submitQuestion() {
  const question = questionInput.value.trim();
  if (!question) {
    showToast("問題文を入力してください");
    return;
  }
  const type = questionType.value;
  setLoading(true);
  try {
    const res = await fetch("/api/quiz/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, type })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "エラーが発生しました");
    lastAnswer = data.answer || "";
    showAnswer(question, lastAnswer, type);
    addHistory(question, lastAnswer, type);
  } catch (err) {
    showToast(err.message || "エラーが発生しました");
    setLoading(false);
    showPlaceholder();
  }
}

function setLoading(loading) {
  submitBtn.disabled = loading;
  if (loading) {
    answerPlaceholder.style.display = "none";
    answerContent.style.display = "none";
    answerLoading.style.display = "flex";
    copyBtn.style.display = "none";
  }
}

function showPlaceholder() {
  answerLoading.style.display = "none";
  answerContent.style.display = "none";
  answerPlaceholder.style.display = "flex";
}

function showAnswer(question, answer, type) {
  answerLoading.style.display = "none";
  answerPlaceholder.style.display = "none";
  answerContent.style.display = "block";
  copyBtn.style.display = "flex";
  submitBtn.disabled = false;

  const preview = question.length > 120 ? question.slice(0, 120) + "…" : question;
  answerContent.innerHTML = `
    <div class="question-preview">
      <div class="question-preview-label">入力した問題</div>
      ${escHtml(preview)}
    </div>
    <div class="answer-card">
      <div class="answer-card-header">
        <span class="answer-card-badge badge-correct">解答・解説</span>
        <span style="font-size:12px;color:var(--ink-3)">${typeLabel(type)}</span>
      </div>
      <div class="answer-card-body md-content">
        ${renderMarkdown(answer)}
      </div>
    </div>
  `;
}

// ---- Copy ----
copyBtn.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(lastAnswer);
    showToast("コピーしました");
  } catch {
    showToast("コピーに失敗しました");
  }
});

// ---- Clear ----
clearBtn.addEventListener("click", () => {
  questionInput.value = "";
  charCount.textContent = "0 文字";
  showPlaceholder();
  lastAnswer = "";
  copyBtn.style.display = "none";
});

// ---- History ----
function addHistory(question, answer, type) {
  const item = {
    id: Date.now(),
    question,
    answer,
    type,
    time: new Date().toISOString()
  };
  history.unshift(item);
  if (history.length > 50) history = history.slice(0, 50);
  localStorage.setItem("quiz-history", JSON.stringify(history));
  renderHistory();
}

function renderHistory() {
  if (!history.length) {
    historyList.innerHTML = '<div class="history-empty">まだ履歴がありません</div>';
    return;
  }
  historyList.innerHTML = history.map(item => `
    <div class="history-item" data-id="${item.id}">
      <span class="history-item-badge ${item.type || 'auto'}">${typeLabel(item.type)}</span>
      <span class="history-item-text">${escHtml(item.question.slice(0, 60).replace(/\n/g, " "))}</span>
      <span class="history-item-time">${formatTime(item.time)}</span>
    </div>
  `).join("");

  historyList.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => {
      const id = Number(el.dataset.id);
      const item = history.find(h => h.id === id);
      if (!item) return;
      questionInput.value = item.question;
      charCount.textContent = `${item.question.length.toLocaleString()} 文字`;
      questionType.value = item.type || "auto";
      lastAnswer = item.answer;
      showAnswer(item.question, item.answer, item.type || "auto");
    });
  });
}

clearHistoryBtn.addEventListener("click", () => {
  history = [];
  localStorage.removeItem("quiz-history");
  renderHistory();
  showToast("履歴を削除しました");
});

renderHistory();

// ---- Divider drag resize ----
const divider = document.getElementById("divider");
const panelLeft = document.getElementById("panel-left");
let dragging = false;
let startX = 0;
let startWidth = 0;

divider.addEventListener("mousedown", (e) => {
  dragging = true;
  startX = e.clientX;
  startWidth = panelLeft.getBoundingClientRect().width;
  divider.classList.add("dragging");
  document.body.style.userSelect = "none";
  document.body.style.cursor = "col-resize";
});

document.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const delta = e.clientX - startX;
  const totalWidth = document.querySelector(".layout").getBoundingClientRect().width;
  const newWidth = Math.min(Math.max(startWidth + delta, 280), totalWidth - 280);
  panelLeft.style.width = `${newWidth}px`;
  panelLeft.style.flex = "none";
});

document.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  divider.classList.remove("dragging");
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
});

// ---- Markdown renderer (minimal, no deps) ----
function renderMarkdown(text) {
  if (!text) return "";
  let html = escHtml(text);

  // Code blocks
  html = html.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, code) =>
    `<pre><code>${code.trim()}</code></pre>`);

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Headers
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Blockquote
  html = html.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");

  // HR
  html = html.replace(/^---$/gm, "<hr>");

  // Numbered list
  html = html.replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>");
  html = html.replace(/(<li>[\s\S]+?<\/li>(\n|$))+/g, (match) => {
    if (/^\d/.test(match)) return `<ol>${match}</ol>`;
    return match;
  });

  // Bullet list
  html = html.replace(/^[-*] (.+)$/gm, "<li>$1</li>");

  // Wrap consecutive <li> in <ul>/<ol>
  html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

  // Paragraphs (double newline)
  html = html.split(/\n{2,}/).map(block => {
    block = block.trim();
    if (!block) return "";
    if (/^<(h[1-6]|ul|ol|pre|blockquote|hr)/.test(block)) return block;
    return `<p>${block.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");

  return html;
}

// ---- Helpers ----
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function typeLabel(type) {
  const map = {
    auto: "自動",
    verbal: "言語",
    nonverbal: "非言語",
    english: "英語",
    personality: "性格",
    other: "その他"
  };
  return map[type] || "自動";
}

function formatTime(iso) {
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "今";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}時間前`;
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2800);
}
