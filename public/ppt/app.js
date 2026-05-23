"use strict";

// ─── Color schemes ───────────────────────────────────────────────────────────
const COLOR_SCHEMES = {
  blue:   { accent: "1E40AF", title: "1E3A8A", bg: "EFF6FF", text: "1E293B" },
  green:  { accent: "166534", title: "14532D", bg: "F0FDF4", text: "1A2E1A" },
  red:    { accent: "991B1B", title: "7F1D1D", bg: "FEF2F2", text: "1C1917" },
  purple: { accent: "6B21A8", title: "581C87", bg: "FAF5FF", text: "1E1B2E" },
  orange: { accent: "C2410C", title: "9A3412", bg: "FFF7ED", text: "1C1917" },
  gray:   { accent: "374151", title: "1F2937", bg: "F9FAFB", text: "111827" },
};

let currentScheme = "blue";
let generatedData = null;
let parsedSlides = [];

// ─── Tabs ─────────────────────────────────────────────────────────────────────
document.querySelectorAll(".pptTab").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".pptTab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".pptSection").forEach((s) => s.classList.add("hidden"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.tab + "Tab").classList.remove("hidden");
  });
});

// ─── Color palette ───────────────────────────────────────────────────────────
document.querySelectorAll(".colorSwatch").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".colorSwatch").forEach((s) => s.classList.remove("active"));
    btn.classList.add("active");
    currentScheme = btn.dataset.scheme;
  });
});

// ─── Generate Tab ─────────────────────────────────────────────────────────────
document.getElementById("generateButton").addEventListener("click", generateSlides);

async function generateSlides() {
  const topic = document.getElementById("topicInput").value.trim();
  if (!topic) {
    showToast("トピックを入力してください。");
    return;
  }
  const btn = document.getElementById("generateButton");
  const btnText = document.getElementById("generateButtonText");
  btn.disabled = true;
  btnText.textContent = "生成中...";

  try {
    const res = await fetch("/api/ppt/generate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        topic,
        slideCount: document.getElementById("slideCountInput").value,
        style: document.getElementById("styleInput").value,
        purpose: document.getElementById("purposeInput").value.trim(),
        extraInstructions: document.getElementById("extraInput").value.trim(),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "生成に失敗しました。");
    generatedData = data;
    renderPreview(data);
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
    btnText.textContent = "スライド生成";
  }
}

function renderPreview(data) {
  document.getElementById("previewEmpty").classList.add("hidden");
  document.getElementById("previewContent").classList.remove("hidden");

  document.getElementById("previewTitle").textContent =
    data.title + (data.subtitle ? ` — ${data.subtitle}` : "");

  const list = document.getElementById("slidesList");
  list.innerHTML = "";

  (data.slides || []).forEach((slide, i) => {
    const typeClass = `type-${slide.type || "content"}`;
    const card = document.createElement("div");
    card.className = "slideCard";
    const bullets = (slide.bullets || []).map((b) => `<li>${escHtml(b)}</li>`).join("");
    card.innerHTML = `
      <span class="slideNum ${typeClass}">${i + 1}</span>
      <div class="slideCardBody">
        <div class="slideCardTitle">${escHtml(slide.title || "")}</div>
        ${bullets ? `<ul class="slideCardBullets">${bullets}</ul>` : ""}
        ${slide.notes ? `<div class="slideCardNotes">📝 ${escHtml(slide.notes)}</div>` : ""}
      </div>`;
    list.appendChild(card);
  });
}

// ─── Download ─────────────────────────────────────────────────────────────────
document.getElementById("downloadButton").addEventListener("click", () => {
  if (generatedData) downloadPptx(generatedData);
});

function downloadPptx(data) {
  const scheme = COLOR_SCHEMES[currentScheme] || COLOR_SCHEMES.blue;
  const pptx = new PptxGenJS();

  pptx.layout = "LAYOUT_16x9";
  pptx.title = data.title || "Presentation";
  pptx.author = "PPT AI";

  (data.slides || []).forEach((slide, idx) => {
    const sld = pptx.addSlide();

    // Background
    sld.background = { color: idx % 2 === 0 ? "FFFFFF" : scheme.bg };

    if (slide.type === "title") {
      // Title slide
      sld.background = { color: scheme.title };
      sld.addText(data.title || slide.title, {
        x: 0.5, y: 1.8, w: 9, h: 1.4,
        fontSize: 36, bold: true, color: "FFFFFF",
        align: "center", valign: "middle",
        fontFace: "Meiryo UI",
      });
      if (data.subtitle || slide.subtitle) {
        sld.addText(data.subtitle || slide.subtitle, {
          x: 0.5, y: 3.5, w: 9, h: 0.7,
          fontSize: 18, color: "D1D5DB",
          align: "center", valign: "middle",
          fontFace: "Meiryo UI",
        });
      }
    } else if (slide.type === "section") {
      // Section divider
      sld.background = { color: scheme.accent };
      sld.addText(slide.title || "", {
        x: 0.5, y: 2.2, w: 9, h: 1.2,
        fontSize: 30, bold: true, color: "FFFFFF",
        align: "center", valign: "middle",
        fontFace: "Meiryo UI",
      });
    } else if (slide.type === "closing") {
      // Closing slide
      sld.background = { color: scheme.title };
      sld.addText(slide.title || "ご清聴ありがとうございました", {
        x: 0.5, y: 2.0, w: 9, h: 1.4,
        fontSize: 28, bold: true, color: "FFFFFF",
        align: "center", valign: "middle",
        fontFace: "Meiryo UI",
      });
      if (slide.bullets && slide.bullets.length) {
        sld.addText(slide.bullets[0], {
          x: 0.5, y: 3.6, w: 9, h: 0.6,
          fontSize: 14, color: "D1D5DB",
          align: "center",
          fontFace: "Meiryo UI",
        });
      }
    } else {
      // Content slide
      // Title bar
      sld.addShape(pptx.ShapeType.rect, {
        x: 0, y: 0, w: 10, h: 1.1,
        fill: { color: scheme.accent },
        line: { color: scheme.accent },
      });
      sld.addText(slide.title || "", {
        x: 0.3, y: 0, w: 9.4, h: 1.1,
        fontSize: 22, bold: true, color: "FFFFFF",
        valign: "middle",
        fontFace: "Meiryo UI",
      });

      // Bullet points
      if (slide.bullets && slide.bullets.length) {
        const bulletText = slide.bullets.map((b) => ({ text: b, options: { bullet: { indent: 15 } } }));
        sld.addText(bulletText, {
          x: 0.4, y: 1.3, w: 9.2, h: 4.5,
          fontSize: 16, color: scheme.text,
          valign: "top",
          lineSpacingMultiple: 1.3,
          fontFace: "Meiryo UI",
        });
      }

      // Slide number
      sld.addText(String(idx + 1), {
        x: 9.2, y: 6.8, w: 0.6, h: 0.3,
        fontSize: 9, color: "9CA3AF",
        align: "right",
        fontFace: "Meiryo UI",
      });

      // Speaker notes
      if (slide.notes) {
        sld.addNotes(slide.notes);
      }
    }
  });

  const filename = (data.title || "presentation").replace(/[/\\:*?"<>|]/g, "_").slice(0, 60) + ".pptx";
  pptx.writeFile({ fileName: filename });
  showToast("PPTXをダウンロードしました！");
}

// ─── Edit Modal ───────────────────────────────────────────────────────────────
document.getElementById("editGeneratedButton").addEventListener("click", () => {
  if (!generatedData) return;
  renderEditModal(generatedData);
  document.getElementById("editModal").classList.remove("hidden");
});

document.getElementById("closeEditModal").addEventListener("click", () => {
  document.getElementById("editModal").classList.add("hidden");
});

document.getElementById("editModal").addEventListener("click", (e) => {
  if (e.target === document.getElementById("editModal")) {
    document.getElementById("editModal").classList.add("hidden");
  }
});

document.getElementById("applyEditButton").addEventListener("click", () => {
  if (!generatedData) return;
  const editCards = document.querySelectorAll(".editSlideCard");
  editCards.forEach((card, i) => {
    const slide = generatedData.slides[i];
    if (!slide) return;
    slide.title = card.querySelector(".editSlideTitle").value;
    const bulletsText = card.querySelector(".editSlideBullets").value;
    slide.bullets = bulletsText.split("\n").map((l) => l.trim()).filter(Boolean);
  });
  renderPreview(generatedData);
  document.getElementById("editModal").classList.add("hidden");
  downloadPptx(generatedData);
});

function renderEditModal(data) {
  const list = document.getElementById("editSlidesList");
  list.innerHTML = "";
  (data.slides || []).forEach((slide, i) => {
    const card = document.createElement("div");
    card.className = "editSlideCard";
    card.innerHTML = `
      <div class="editSlideLabel">スライド ${i + 1} (${slide.type || "content"})</div>
      <input class="editSlideTitle" value="${escHtml(slide.title || "")}" placeholder="タイトル" />
      <textarea class="editSlideBullets" rows="4" placeholder="箇条書き（1行1項目）">${(slide.bullets || []).join("\n")}</textarea>
    `;
    list.appendChild(card);
  });
}

// ─── Analyze Tab ──────────────────────────────────────────────────────────────
const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("pptxFileInput");

uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});
uploadArea.addEventListener("dragleave", () => uploadArea.classList.remove("dragover"));
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

document.getElementById("clearFileButton").addEventListener("click", () => {
  parsedSlides = [];
  fileInput.value = "";
  document.getElementById("uploadContent").classList.remove("hidden");
  document.getElementById("uploadedInfo").classList.add("hidden");
  document.getElementById("slidePreviewList").classList.add("hidden");
  document.getElementById("questionSection").style.display = "none";
  document.getElementById("analyzeButton").classList.add("hidden");
  document.getElementById("analyzeEmpty").classList.remove("hidden");
  document.getElementById("analyzeResult").classList.add("hidden");
});

async function handleFile(file) {
  if (!file.name.endsWith(".pptx")) {
    showToast(".pptxファイルを選択してください。");
    return;
  }
  try {
    parsedSlides = await parsePptx(file);
    document.getElementById("uploadContent").classList.add("hidden");
    document.getElementById("uploadedInfo").classList.remove("hidden");
    document.getElementById("uploadedFileName").textContent = file.name;
    document.getElementById("uploadedSlideCount").textContent = `${parsedSlides.length}枚のスライドを検出`;

    // Show parsed slide preview
    const previewList = document.getElementById("slidePreviewList");
    previewList.innerHTML = parsedSlides
      .map(
        (s) =>
          `<div class="slidePreviewItem"><strong>スライド${s.slideNumber}:</strong> ${escHtml(s.title || "(タイトルなし)")} — ${escHtml((s.content || "").slice(0, 80))}${(s.content || "").length > 80 ? "…" : ""}</div>`
      )
      .join("");
    previewList.classList.remove("hidden");

    document.getElementById("questionSection").style.display = "";
    document.getElementById("analyzeButton").classList.remove("hidden");
  } catch (err) {
    showToast("ファイルの読み込みに失敗しました: " + err.message);
  }
}

async function parsePptx(file) {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);
  const slides = [];

  // Find slide files
  const slideFiles = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] || 0);
      const nb = parseInt(b.match(/\d+/)?.[0] || 0);
      return na - nb;
    });

  for (let i = 0; i < slideFiles.length; i++) {
    const xmlText = await zip.files[slideFiles[i]].async("text");
    const { title, content } = extractSlideText(xmlText);
    slides.push({ slideNumber: i + 1, title, content });
  }

  return slides;
}

function extractSlideText(xml) {
  // Remove XML tags and extract text content
  const texts = [];
  const paragraphPattern = /<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g;
  let paragraphMatch;
  while ((paragraphMatch = paragraphPattern.exec(xml)) !== null) {
    const paragraphXml = paragraphMatch[1];
    const runPattern = /<a:t[^>]*>([\s\S]*?)<\/a:t>/g;
    let runMatch;
    const parts = [];
    while ((runMatch = runPattern.exec(paragraphXml)) !== null) {
      parts.push(runMatch[1]);
    }
    const text = parts.join("").trim();
    if (text) texts.push(text);
  }

  // Decode common XML entities
  const decoded = texts.map((t) =>
    t
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
  );

  const title = decoded[0] || "";
  const content = decoded.slice(1).join("\n");
  return { title, content };
}

document.getElementById("analyzeButton").addEventListener("click", analyzeFile);

async function analyzeFile() {
  if (!parsedSlides.length) {
    showToast("ファイルをアップロードしてください。");
    return;
  }
  const question = document.getElementById("questionInput").value.trim() || "このプレゼンテーションの内容を要約し、改善点を提案してください。";
  const btn = document.getElementById("analyzeButton");
  btn.disabled = true;
  btn.textContent = "解析中...";

  try {
    const res = await fetch("/api/ppt/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slides: parsedSlides, question }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "解析に失敗しました。");

    document.getElementById("analyzeEmpty").classList.add("hidden");
    document.getElementById("analyzeResult").classList.remove("hidden");
    document.getElementById("analyzeBody").innerHTML = renderMarkdown(data.answer || "");
  } catch (err) {
    showToast(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "AI に質問する";
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^\- (.+)$/gm, "<li>$1</li>")
    .replace(/^(\d+)\. (.+)$/gm, "<li>$2</li>")
    .replace(/(<li>[\s\S]+?<\/li>)/g, "<ul>$1</ul>")
    .replace(/<\/ul>\s*<ul>/g, "")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hup]|<li)(.+)$/gm, "<p>$1</p>")
    .replace(/<p><\/p>/g, "");
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  setTimeout(() => toast.classList.add("hidden"), 3500);
}
