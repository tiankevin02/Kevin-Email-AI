"use strict";

const questionInput   = document.getElementById("question-input");
const questionType    = document.getElementById("question-type");
const submitBtn       = document.getElementById("submit-btn");
const clearBtn        = document.getElementById("clear-btn");
const charCount       = document.getElementById("char-count");
const answerPlaceholder = document.getElementById("answer-placeholder");
const answerLoading   = document.getElementById("answer-loading");
const answerContent   = document.getElementById("answer-content");
const copyBtn         = document.getElementById("copy-btn");
const historyList     = document.getElementById("history-list");
const clearHistoryBtn = document.getElementById("clear-history-btn");
const toast           = document.getElementById("toast");
const noExplanationCb = document.getElementById("no-explanation-cb");
const tabText         = document.getElementById("tab-text");
const tabImage        = document.getElementById("tab-image");
const inputText       = document.getElementById("input-text");
const inputImage      = document.getElementById("input-image");
const imageDropZone   = document.getElementById("image-drop-zone");
const imageDropInner  = document.getElementById("image-drop-inner");
const imagePreview    = document.getElementById("image-preview");
const imageClearBtn   = document.getElementById("image-clear-btn");
const pasteBtn        = document.getElementById("paste-btn");
const fileInput       = document.getElementById("file-input");
const imageHintInput  = document.getElementById("image-hint-input");

let history     = JSON.parse(localStorage.getItem("quiz-history") || "[]");
let lastAnswer  = "";
let currentTab  = "text";
let imageBase64 = null;
let imageMime   = null;

// ---- Char count ----
questionInput.addEventListener("input", updateCharCount);
function updateCharCount() {
  charCount.textContent = `${questionInput.value.length.toLocaleString()} 文字`;
}

// ---- Tab switch ----
tabText.addEventListener("click", () => switchTab("text"));
tabImage.addEventListener("click", () => switchTab("image"));

function switchTab(tab) {
  currentTab = tab;
  tabText.classList.toggle("active", tab === "text");
  tabImage.classList.toggle("active", tab === "image");
  inputText.classList.toggle("hidden", tab !== "text");
  inputImage.classList.toggle("hidden", tab !== "image");
  charCount.style.display = tab === "text" ? "" : "none";
}

// ---- Image paste (Ctrl+V anywhere / paste button) ----
document.addEventListener("paste", handlePasteEvent);
pasteBtn.addEventListener("click", async () => {
  try {
    const items = await navigator.clipboard.read();
    let found = false;
    for (const item of items) {
      const imageType = item.types.find(t => t.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        loadImageBlob(blob);
        found = true;
        break;
      }
    }
    if (!found) showToast("クリップボードに画像がありません。スクリーンショットを撮ってから貼り付けてください。");
  } catch {
    showToast("Ctrl+V でも貼り付けられます");
  }
});

function handlePasteEvent(e) {
  const items = e.clipboardData?.items || [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const blob = item.getAsFile();
      if (blob) {
        loadImageBlob(blob);
        switchTab("image");
        e.preventDefault();
        return;
      }
    }
  }
}

function loadImageBlob(blob) {
  imageMime = blob.type || "image/png";
  const reader = new FileReader();
  reader.onload = (e) => {
    const dataUrl = e.target.result;
    imageBase64 = dataUrl.split(",")[1];
    imagePreview.src = dataUrl;
    imagePreview.classList.remove("hidden");
    imageClearBtn.classList.remove("hidden");
    imageDropInner.classList.add("hidden");
    imageDropZone.classList.add("has-image");
    switchTab("image");
    showToast("画像を読み込みました。「解答」を押してください。");
  };
  reader.readAsDataURL(blob);
}

// ---- File input ----
fileInput.addEventListener("change", () => {
  const file = fileInput.files[0];
  if (file && file.type.startsWith("image/")) {
    loadImageBlob(file);
  }
  fileInput.value = "";
});

// ---- Drag & drop ----
imageDropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  imageDropZone.classList.add("drag-over");
});
imageDropZone.addEventListener("dragleave", () => imageDropZone.classList.remove("drag-over"));
imageDropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  imageDropZone.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith("image/")) {
    loadImageBlob(file);
  } else {
    showToast("画像ファイルをドロップしてください");
  }
});

// ---- Clear image ----
imageClearBtn.addEventListener("click", clearImage);
function clearImage() {
  imageBase64 = null;
  imageMime = null;
  imagePreview.src = "";
  imagePreview.classList.add("hidden");
  imageClearBtn.classList.add("hidden");
  imageDropInner.classList.remove("hidden");
  imageDropZone.classList.remove("has-image");
}

// ---- Submit ----
submitBtn.addEventListener("click", submitQuestion);
questionInput.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submitQuestion();
});

async function submitQuestion() {
  const type = questionType.value;
  const noExplanation = noExplanationCb.checked;

  if (currentTab === "image") {
    if (!imageBase64) {
      showToast("スクリーンショットを貼り付けてください（Ctrl+V）");
      return;
    }
    setLoading(true);
    try {
      const hint = imageHintInput.value.trim();
      const res = await fetch("/api/quiz/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: hint || null, type, imageBase64, imageMimeType: imageMime, noExplanation })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "エラーが発生しました");
      lastAnswer = data.answer || "";
      showAnswer(null, lastAnswer, type, true);
      addHistory("[画像]" + (hint ? ` ${hint}` : ""), lastAnswer, "img");
    } catch (err) {
      showToast(err.message);
      setLoading(false);
      showPlaceholder();
    }
    return;
  }

  const question = questionInput.value.trim();
  if (!question) { showToast("問題文を入力してください"); return; }
  setLoading(true);
  try {
    const res = await fetch("/api/quiz/answer", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, type, noExplanation })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "エラーが発生しました");
    lastAnswer = data.answer || "";
    showAnswer(question, lastAnswer, type, false);
    addHistory(question, lastAnswer, type);
  } catch (err) {
    showToast(err.message);
    setLoading(false);
    showPlaceholder();
  }
}

function setLoading(on) {
  submitBtn.disabled = on;
  if (on) {
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

function showAnswer(question, answer, type, isImage) {
  answerLoading.style.display = "none";
  answerPlaceholder.style.display = "none";
  answerContent.style.display = "block";
  copyBtn.style.display = "flex";
  submitBtn.disabled = false;

  let previewHtml = "";
  if (isImage && imagePreview.src) {
    previewHtml = `<div class="question-preview">
      <div class="question-preview-label">入力した画像</div>
      <img src="${escAttr(imagePreview.src)}" alt="問題画像" />
    </div>`;
  } else if (question) {
    const preview = question.length > 100 ? question.slice(0, 100) + "…" : question;
    previewHtml = `<div class="question-preview">
      <div class="question-preview-label">入力した問題</div>
      ${escHtml(preview)}
    </div>`;
  }

  answerContent.innerHTML = `${previewHtml}
    <div class="answer-card">
      <div class="answer-card-header">
        <span class="answer-card-badge">解答</span>
        <span style="font-size:11px;color:var(--ink-3)">${typeLabel(type)}${noExplanationCb.checked ? " · 答えのみ" : ""}</span>
      </div>
      <div class="answer-card-body md-content">${renderMarkdown(answer)}</div>
    </div>`;
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
  updateCharCount();
  clearImage();
  showPlaceholder();
  lastAnswer = "";
  copyBtn.style.display = "none";
});

// ---- History ----
function addHistory(question, answer, type) {
  const item = { id: Date.now(), question, answer, type, time: new Date().toISOString() };
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
      <span class="history-item-badge ${item.type || "auto"}">${typeLabel(item.type)}</span>
      <span class="history-item-text">${escHtml(item.question.slice(0, 55).replace(/\n/g, " "))}</span>
      <span class="history-item-time">${formatTime(item.time)}</span>
    </div>
  `).join("");

  historyList.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => {
      const item = history.find(h => h.id === Number(el.dataset.id));
      if (!item) return;
      lastAnswer = item.answer;
      const isImg = item.type === "img";
      if (!isImg) {
        questionInput.value = item.question;
        updateCharCount();
        switchTab("text");
      } else {
        switchTab("image");
      }
      questionType.value = isImg ? "auto" : (item.type || "auto");
      showAnswer(isImg ? null : item.question, item.answer, item.type || "auto", isImg);
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
let dragging = false, startX = 0, startWidth = 0;

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
  const total = document.querySelector(".layout").getBoundingClientRect().width;
  const w = Math.min(Math.max(startWidth + (e.clientX - startX), 240), total - 240);
  panelLeft.style.width = `${w}px`;
  panelLeft.style.flex = "none";
});
document.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  divider.classList.remove("dragging");
  document.body.style.userSelect = "";
  document.body.style.cursor = "";
});

// ---- Markdown renderer ----
function renderMarkdown(text) {
  if (!text) return "";
  let h = escHtml(text);
  h = h.replace(/```[\w]*\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c.trim()}</code></pre>`);
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  h = h.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  h = h.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/\*(.+?)\*/g, "<em>$1</em>");
  h = h.replace(/^&gt; (.+)$/gm, "<blockquote>$1</blockquote>");
  h = h.replace(/^---$/gm, "<hr>");
  h = h.replace(/^(\d+)\. (.+)$/gm, "<oli>$2</oli>");
  h = h.replace(/^[-*] (.+)$/gm, "<uli>$1</uli>");
  h = h.replace(/(<oli>.*?<\/oli>\n?)+/gs, m => `<ol>${m.replace(/<\/?oli>/g, s => s === "<oli>" ? "<li>" : "</li>")}</ol>`);
  h = h.replace(/(<uli>.*?<\/uli>\n?)+/gs, m => `<ul>${m.replace(/<\/?uli>/g, s => s === "<uli>" ? "<li>" : "</li>")}</ul>`);
  h = h.split(/\n{2,}/).map(b => {
    b = b.trim();
    if (!b) return "";
    if (/^<(h[1-6]|ul|ol|pre|blockquote|hr)/.test(b)) return b;
    return `<p>${b.replace(/\n/g, "<br>")}</p>`;
  }).join("\n");
  return h;
}

// ---- Helpers ----
function escHtml(s) {
  return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function escAttr(s) {
  return String(s).replace(/"/g, "&quot;");
}
function typeLabel(t) {
  return { auto:"自動", verbal:"言語", nonverbal:"非言語", english:"英語", personality:"性格", other:"その他", img:"画像" }[t] || "自動";
}
function formatTime(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "今";
  if (diff < 3600000) return `${Math.floor(diff/60000)}分前`;
  if (diff < 86400000) return `${Math.floor(diff/3600000)}時間前`;
  const d = new Date(iso);
  return `${d.getMonth()+1}/${d.getDate()}`;
}

let toastTimer = null;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}
