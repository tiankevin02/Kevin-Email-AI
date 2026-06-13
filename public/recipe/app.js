/* ── State ─────────────────────────────────────────────────── */
const state = {
  mood: null,
  weather: null,
  exercise: null,
  time: null,
  ingredients: [],
  wantAlcohol: false,
  alcoholStock: [],
  currentRecipe: null,
  context: null,          // original inputs kept for adjustments
  adjustHistory: [],      // list of past adjustments for context
};

/* ── DOM Refs ──────────────────────────────────────────────── */
const formSection    = document.getElementById("formSection");
const loadingSection = document.getElementById("loadingSection");
const loadingText    = document.getElementById("loadingText");
const resultSection  = document.getElementById("resultSection");
const resultInner    = document.getElementById("resultInner");
const submitBtn      = document.getElementById("submitBtn");
const alcoholToggle  = document.getElementById("alcoholToggle");
const alcoholStockGroup = document.getElementById("alcoholStockGroup");
const resetBtn       = document.getElementById("resetBtn");
const retryBtn       = document.getElementById("retryBtn");

/* ── Chip Selection ────────────────────────────────────────── */
document.querySelectorAll(".chip").forEach(chip => {
  chip.addEventListener("click", () => {
    const group = chip.dataset.group;
    document.querySelectorAll(`.chip[data-group="${group}"]`).forEach(c => {
      c.setAttribute("aria-pressed", "false");
    });
    chip.setAttribute("aria-pressed", "true");
    state[group] = chip.dataset.value;
    updateSubmitState();
  });
});

function updateSubmitState() {
  const ready = state.mood && state.weather && state.exercise && state.time;
  submitBtn.disabled = !ready;
}

/* ── Tag Input ─────────────────────────────────────────────── */
function initTagInput(inputId, containerId, stateKey) {
  const input     = document.getElementById(inputId);
  const container = document.getElementById(containerId);

  input.addEventListener("keydown", e => {
    if ((e.key === "Enter" || e.key === ",") && input.value.trim()) {
      e.preventDefault();
      addTag(input.value.trim(), container, stateKey);
      input.value = "";
    }
    if (e.key === "Backspace" && !input.value) {
      const tags = state[stateKey];
      if (tags.length) {
        tags.pop();
        container.querySelectorAll(".tag").forEach(t => t.remove());
        tags.forEach(v => renderTag(v, container, stateKey));
      }
    }
  });

  // tap comma-separated on mobile paste
  input.addEventListener("paste", e => {
    setTimeout(() => {
      const val = input.value;
      if (val.includes(",") || val.includes("、")) {
        val.split(/[,、]/).map(s => s.trim()).filter(Boolean).forEach(v => {
          addTag(v, container, stateKey);
        });
        input.value = "";
      }
    }, 10);
  });
}

function addTag(value, container, stateKey) {
  if (!value || state[stateKey].includes(value)) return;
  state[stateKey].push(value);
  renderTag(value, container, stateKey);
}

function renderTag(value, container, stateKey) {
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.innerHTML = `${escHtml(value)}<button class="tag-del" aria-label="削除" tabindex="-1">✕</button>`;
  tag.querySelector(".tag-del").addEventListener("click", () => {
    state[stateKey] = state[stateKey].filter(v => v !== value);
    tag.remove();
  });
  container.insertBefore(tag, container.querySelector(".tag-input"));
}

initTagInput("ingredientsInput", "tagContainer", "ingredients");
initTagInput("alcoholInput", "alcoholTagContainer", "alcoholStock");

/* ── Alcohol Toggle ────────────────────────────────────────── */
alcoholToggle.addEventListener("click", () => {
  state.wantAlcohol = !state.wantAlcohol;
  alcoholToggle.setAttribute("aria-pressed", String(state.wantAlcohol));
  // Animate reveal
  if (state.wantAlcohol) {
    alcoholStockGroup.classList.remove("hidden");
    requestAnimationFrame(() => {
      alcoholStockGroup.style.maxHeight = "200px";
      alcoholStockGroup.style.opacity   = "1";
    });
  } else {
    alcoholStockGroup.style.maxHeight = "0";
    alcoholStockGroup.style.opacity   = "0";
    setTimeout(() => alcoholStockGroup.classList.add("hidden"), 350);
  }
});

/* ── Submit ────────────────────────────────────────────────── */
submitBtn.addEventListener("click", async () => {
  state.adjustHistory = [];
  state.context = buildContext();
  await fetchRecipe({ type: "initial", context: state.context });
});

retryBtn.addEventListener("click", async () => {
  state.adjustHistory = [];
  await fetchRecipe({ type: "retry", context: state.context, instruction: "同じ条件で全く別のレシピを提案してください。" });
});

resetBtn.addEventListener("click", () => {
  showSection("form");
});

/* ── Build Context ─────────────────────────────────────────── */
const MOOD_LABELS     = { happy:"ハッピー", tired:"疲れた", stressed:"ストレス気味", relaxed:"のんびり", excited:"テンション高め", romantic:"ロマンチック" };
const WEATHER_LABELS  = { sunny:"晴れ", cloudy:"曇り", rainy:"雨", snowy:"雪", hot:"猛暑", cold:"寒い" };
const EXERCISE_LABELS = { none:"運動なし", light:"軽め", moderate:"ほどほど", intense:"がっつり" };
const TIME_LABELS     = { "5min":"5分以内", "15min":"15分", "30min":"30分", "60min":"じっくり1時間以上" };

function buildContext() {
  return {
    mood:        state.mood,
    moodLabel:   MOOD_LABELS[state.mood],
    weather:     state.weather,
    weatherLabel:WEATHER_LABELS[state.weather],
    exercise:    state.exercise,
    exerciseLabel:EXERCISE_LABELS[state.exercise],
    time:        state.time,
    timeLabel:   TIME_LABELS[state.time],
    ingredients: [...state.ingredients],
    wantAlcohol: state.wantAlcohol,
    alcoholStock:[...state.alcoholStock],
  };
}

/* ── API ───────────────────────────────────────────────────── */
async function fetchRecipe({ type, context, instruction }) {
  showSection("loading");
  const msgs = [
    "あなたにぴったりのレシピを考えています…",
    "食材とのベストな組み合わせを探しています…",
    "一番合う一皿を選んでいます…",
    "シェフが腕をふるっています…",
  ];
  let msgIdx = 0;
  loadingText.textContent = msgs[msgIdx];
  const ticker = setInterval(() => {
    msgIdx = (msgIdx + 1) % msgs.length;
    loadingText.textContent = msgs[msgIdx];
  }, 2000);

  try {
    const res = await fetch("/api/recipe/recommend", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type, context, instruction, adjustHistory: state.adjustHistory }),
    });
    const data = await res.json();
    clearInterval(ticker);
    if (!res.ok) throw new Error(data.error || "エラーが発生しました");
    state.currentRecipe = data;
    renderResult(data, context);
    showSection("result");
  } catch (err) {
    clearInterval(ticker);
    renderError(err.message);
    showSection("result");
  }
}

async function adjustRecipe(instruction) {
  state.adjustHistory.push(instruction);
  await fetchRecipe({ type: "adjust", context: state.context, instruction });
}

/* ── Sections ──────────────────────────────────────────────── */
function showSection(name) {
  formSection.classList.toggle("hidden", name !== "form");
  loadingSection.classList.toggle("hidden", name !== "loading");
  resultSection.classList.toggle("hidden", name !== "result");
  if (name !== "form") window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ── Render ────────────────────────────────────────────────── */
function renderResult(data, ctx) {
  const recipe = data.recipe;
  const drink  = data.drink;
  const pairings = data.pairings || [];

  let html = "";

  // ── Context pill row ──
  html += `
    <div class="context-card">
      <div class="context-row"><span class="context-label">気分</span><span class="context-text">${escHtml(MOOD_LABELS[ctx.mood] || ctx.mood)}</span></div>
      <div class="context-row"><span class="context-label">天気</span><span class="context-text">${escHtml(WEATHER_LABELS[ctx.weather] || ctx.weather)}</span></div>
      <div class="context-row"><span class="context-label">運動</span><span class="context-text">${escHtml(EXERCISE_LABELS[ctx.exercise] || ctx.exercise)}</span></div>
      <div class="context-row"><span class="context-label">時間</span><span class="context-text">${escHtml(TIME_LABELS[ctx.time] || ctx.time)}</span></div>
    </div>`;

  // ── Recipe card ──
  if (recipe) {
    const diff = recipe.difficulty === "easy" ? "かんたん" : recipe.difficulty === "hard" ? "本格派" : "ふつう";
    const diffIcon = recipe.difficulty === "easy" ? "🌿" : recipe.difficulty === "hard" ? "🔥" : "⚖️";

    html += `
      <div class="recipe-card">
        <div class="recipe-header">
          <span class="recipe-badge badge-main">✦ おすすめレシピ</span>
          <h2 class="recipe-name">${escHtml(recipe.name)}</h2>
          <p class="recipe-tagline">${escHtml(recipe.tagline)}</p>
          <div class="recipe-meta">
            <span class="meta-item"><span class="meta-icon">⏱</span>${escHtml(recipe.time)}</span>
            <span class="meta-item"><span class="meta-icon">${diffIcon}</span>${diff}</span>
            <span class="meta-item"><span class="meta-icon">👥</span>${escHtml(recipe.servings)}</span>
            ${recipe.calories ? `<span class="meta-item"><span class="meta-icon">🔢</span>${escHtml(recipe.calories)}</span>` : ""}
          </div>
        </div>
        <div class="recipe-body">
          ${recipe.mood_message ? `<p class="mood-message">${escHtml(recipe.mood_message)}</p>` : ""}

          <p class="recipe-section-title">食材</p>
          <div class="recipe-ingredients">
            ${(recipe.ingredients || []).map(i =>
              `<span class="ingredient-chip${i.buy ? " buy" : ""}">
                ${i.buy ? "🛒 " : ""}${escHtml(i.name)} <span class="ingredient-amount">${escHtml(i.amount)}</span>
              </span>`
            ).join("")}
          </div>

          <p class="recipe-section-title">作り方</p>
          <ol class="recipe-steps">
            ${(recipe.steps || []).map((s, i) =>
              `<li><span class="step-num">${i + 1}</span><span>${escHtml(s)}</span></li>`
            ).join("")}
          </ol>

          ${recipe.tip ? `
          <p class="recipe-section-title">ポイント</p>
          <p class="recipe-tip">${escHtml(recipe.tip)}</p>` : ""}

          <!-- Adjustment Buttons -->
          <div class="adjust-section">
            <p class="adjust-title">
              <span class="adjust-title-icon">✦</span> レシピをカスタマイズ
            </p>
            <div class="adjust-groups">
              <div class="adjust-group">
                <span class="adjust-group-label">手軽さ</span>
                <div class="adjust-chips">
                  <button class="adjust-chip" data-instruction="もっと簡単なレシピにしてください。工程や食材をシンプルに。">⚡ もっと簡単に</button>
                  <button class="adjust-chip" data-instruction="もっと時短できるレシピに変えてください。調理時間をさらに短く。">🕐 時短で</button>
                  <button class="adjust-chip" data-instruction="食材の数を減らして、手に入りやすい少ない材料で作れるレシピにしてください。">🧺 材料を減らして</button>
                  <button class="adjust-chip" data-instruction="もっと本格的で手の込んだ、料理を楽しめるレシピにしてください。">👨‍🍳 本格的に</button>
                </div>
              </div>
              <div class="adjust-group">
                <span class="adjust-group-label">ボリューム・栄養</span>
                <div class="adjust-chips">
                  <button class="adjust-chip" data-instruction="肉の量をもっと増やして、食べ応えのあるレシピにしてください。">🥩 肉を増やして</button>
                  <button class="adjust-chip" data-instruction="野菜をたっぷり使った、野菜多めのレシピにしてください。">🥦 野菜多めで</button>
                  <button class="adjust-chip" data-instruction="もっとボリュームアップして、たくさん食べたい気分に合うレシピにしてください。">💪 ボリュームアップ</button>
                  <button class="adjust-chip" data-instruction="低カロリーでヘルシー、罪悪感なく食べられるレシピにしてください。">🌿 ヘルシーに</button>
                </div>
              </div>
              <div class="adjust-group">
                <span class="adjust-group-label">味付け</span>
                <div class="adjust-chips">
                  <button class="adjust-chip" data-instruction="もっとスパイシーで辛みのある、刺激的なレシピにしてください。">🌶 辛くして</button>
                  <button class="adjust-chip" data-instruction="さっぱりとした、あっさり系の軽めな味付けのレシピにしてください。">🍃 さっぱり系に</button>
                  <button class="adjust-chip" data-instruction="こってりとしたリッチな味わい、濃厚でくせになるレシピにしてください。">🧈 こってり系に</button>
                  <button class="adjust-chip" data-instruction="甘めでまろやかな、優しい甘さのある味付けのレシピにしてください。">🍯 甘めに</button>
                </div>
              </div>
              <div class="adjust-group">
                <span class="adjust-group-label">ジャンル変更</span>
                <div class="adjust-chips">
                  <button class="adjust-chip" data-instruction="同じ気分・状況に合った和食のレシピに変えてください。">🍱 和食に</button>
                  <button class="adjust-chip" data-instruction="洋食・ヨーロッパ料理のレシピに変えてください。">🍝 洋食に</button>
                  <button class="adjust-chip" data-instruction="中華料理のレシピに変えてください。">🥟 中華に</button>
                  <button class="adjust-chip" data-instruction="アジア料理（タイ・韓国・ベトナムなど）のレシピに変えてください。">🍜 アジア料理に</button>
                </div>
              </div>
              <div class="adjust-group">
                <span class="adjust-group-label">その他</span>
                <div class="adjust-chips">
                  <button class="adjust-chip adjust-chip--diff" data-instruction="現在のレシピとは全く異なる、ジャンルもスタイルも違うレシピを提案してください。">🔀 ちょっと違う…</button>
                  <button class="adjust-chip" data-instruction="おつまみやおかず系の一品料理、スナック感覚で食べられるレシピにしてください。">🥢 おつまみに</button>
                  <button class="adjust-chip" data-instruction="スープ・鍋料理・シチューなどの温かい汁物系レシピにしてください。">🍲 スープ系に</button>
                  <button class="adjust-chip" data-instruction="電子レンジやトースターだけで作れる、火を使わない簡単レシピにしてください。">🔌 レンジだけで</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ── Drink card ──
  if (drink) {
    html += `
      <div class="drink-card">
        <span class="recipe-badge badge-drink">🍷 合わせるお酒</span>
        <div class="drink-header">
          <div class="drink-title-wrap">
            <div class="drink-name">${escHtml(drink.name)}</div>
            <p class="drink-desc">${escHtml(drink.description)}</p>
            ${drink.serving ? `<p class="drink-serving">${escHtml(drink.serving)}</p>` : ""}
          </div>
          <div class="drink-glass">${escHtml(drink.glass || "🍷")}</div>
        </div>

        ${pairings.length ? `
        <div class="pairing-section">
          <p class="pairing-title">手持ちのお酒との相性</p>
          <div class="pairing-grid">
            ${pairings.map(p => `
              <div class="pairing-item">
                <span class="pairing-drink-name">${escHtml(p.drink)}</span>
                <span class="pairing-score">
                  <span class="score-dots">${[1,2,3,4,5].map(n => `<span class="score-dot${n <= p.score ? " filled" : ""}"></span>`).join("")}</span>
                </span>
                <span class="pairing-note">${escHtml(p.note)}</span>
              </div>`).join("")}
          </div>
        </div>` : ""}
      </div>`;
  }

  resultInner.innerHTML = html;

  // Bind adjustment buttons
  resultInner.querySelectorAll(".adjust-chip").forEach(btn => {
    btn.addEventListener("click", () => {
      adjustRecipe(btn.dataset.instruction);
    });
  });
}

function renderError(msg) {
  resultInner.innerHTML = `
    <div class="error-card">
      <p>😵 エラーが発生しました</p>
      <p style="margin-top:8px;font-size:.8rem;opacity:.7">${escHtml(msg)}</p>
    </div>`;
}

function escHtml(str) {
  return String(str || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
