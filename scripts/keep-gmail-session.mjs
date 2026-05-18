import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverPath = path.join(rootDir, "server.mjs");
let source = await fs.readFile(serverPath, "utf8");

function replaceOnce(search, replacement, label) {
  if (!source.includes(search)) throw new Error(`${label} を更新できませんでした。`);
  source = source.replace(search, replacement);
}

if (!source.includes("https://www.googleapis.com/auth/gmail.send")) {
  source = source.replace(
    'const gmailScopes = ["https://www.googleapis.com/auth/gmail.modify"];',
    'const gmailScopes = ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send"];'
  );
}

if (!source.includes("/api/session/backup")) {
  const helpers = `
function sessionBackup(state) {
  return {
    version: 1,
    savedAt: new Date().toISOString(),
    google: state.google,
    profile: state.profile,
    senders: state.senders
  };
}

function validateSessionBackup(backup) {
  if (!backup || typeof backup !== "object") throw new Error("復元データが見つかりません。");
  const google = backup.google || {};
  const hasAccount = Object.values(google.accounts || {}).some(
    (account) => account?.tokens?.refresh_token || account?.tokens?.access_token
  );
  if (!google.tokens && !hasAccount) throw new Error("Gmail接続の復元データがありません。");
  return {
    google: {
      ...defaultState.google,
      ...google,
      oauthState: null
    },
    profile: backup.profile || {},
    senders: backup.senders || {}
  };
}

`;

  const routes = `
    if (req.method === "GET" && url.pathname === "/api/session/backup") {
      if (!state.google.tokens && !Object.keys(state.google.accounts || {}).length) {
        sendJson(res, 200, { backup: null });
        return;
      }
      sendJson(res, 200, { backup: sessionBackup(state) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/session/restore") {
      const body = await parseBody(req);
      const restored = validateSessionBackup(body.backup);
      state.google = restored.google;
      state.profile = { ...state.profile, ...restored.profile };
      state.senders = { ...state.senders, ...restored.senders };
      activeAccount(state);
      await writeState(state);
      sendJson(res, 200, {
        restored: true,
        gmailConnected: Boolean(state.google.tokens),
        email: state.google.email,
        accounts: accountsList(state)
      });
      return;
    }

`;

  replaceOnce("\nfunction sendJson", `\n${helpers}function sendJson`, "Gmail接続保持");
  replaceOnce(
    '    if (req.method === "POST" && url.pathname === "/api/config") {',
    `${routes}    if (req.method === "POST" && url.pathname === "/api/config") {`,
    "Gmail接続保持API"
  );
}

if (!source.includes("async function callGemini")) {
  const aiBlock = `async function generateReply(payload) {
  return chatComplete(payload.state, buildPrompt(payload), 0.65);
}

function aiText(messages) {
  return messages.map((message) => \`\${message.role.toUpperCase()}:\\n\${message.content}\`).join("\\n\\n");
}

async function callOpenAI(state, messages, temperature) {
  const config = openAIConfig(state);
  if (!config.key) return null;
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: \`Bearer \${config.key}\`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature
    })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "OpenAI request failed");
  return body.choices?.[0]?.message?.content?.trim() || "";
}

async function callGemini(state, messages, temperature) {
  const config = geminiConfig(state);
  if (!config.key) return null;
  const response = await fetch(
    \`https://generativelanguage.googleapis.com/v1beta/models/\${encodeURIComponent(config.model)}:generateContent?key=\${encodeURIComponent(config.key)}\`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: aiText(messages) }] }],
        generationConfig: { temperature }
      })
    }
  );
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || "Gemini request failed");
  return body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
}

async function callGrok(state, messages, temperature) {
  const config = grokConfig(state);
  if (!config.key) return null;
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: \`Bearer \${config.key}\`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      temperature
    })
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || body.message || "Grok request failed");
  return body.choices?.[0]?.message?.content?.trim() || "";
}

async function chatComplete(state, messages, temperature = 0.35) {
  const providers = [
    ["OpenAI", () => callOpenAI(state, messages, temperature)],
    ["Gemini", () => callGemini(state, messages, temperature)],
    ["Grok", () => callGrok(state, messages, temperature)]
  ];
  const failures = [];
  for (const [name, run] of providers) {
    try {
      const answer = await run();
      if (answer !== null) return answer;
    } catch (error) {
      failures.push(\`\${name}: \${error.message}\`);
    }
  }
  const err = new Error(
    failures.length
      ? \`AI生成に失敗しました。\${failures.join(" / ")}\`
      : "OpenAI、Gemini、GrokのいずれかのAPIキーを設定してください。"
  );
  err.status = failures.length ? 502 : 400;
  throw err;
}

`;

  const oldAi = /async function generateReply[\s\S]*?\nfunction messageTime/;
  if (!oldAi.test(source)) throw new Error("AI切り替え処理を更新できませんでした。");
  source = source.replace(oldAi, `${aiBlock}function messageTime`);
}

source = source.replaceAll("if (!configuredOpenAI(state) || !candidates.length)", "if (!configuredAI(state) || !candidates.length)");
source = source.replaceAll("if (configuredOpenAI(state) && important.length)", "if (configuredAI(state) && important.length)");

if (!source.includes("geminiApiKey: Boolean(state.config.geminiApiKey)")) {
  source = source.replace(
    '            openAIModel: state.config.openAIModel || "gpt-4o-mini"',
    '            openAIModel: state.config.openAIModel || "gpt-4o-mini",\n            geminiApiKey: Boolean(state.config.geminiApiKey),\n            geminiModel: state.config.geminiModel || "gemini-2.5-flash",\n            grokApiKey: Boolean(state.config.grokApiKey),\n            grokModel: state.config.grokModel || "grok-4"'
  );
  source = source.replace(
    '            openAI: Boolean(env.OPENAI_API_KEY)',
    '            openAI: Boolean(env.OPENAI_API_KEY),\n            gemini: Boolean(env.GEMINI_API_KEY),\n            grok: Boolean(env.GROK_API_KEY || env.XAI_API_KEY)'
  );
  source = source.replace(
    '        openAIModel: body.openAIModel || state.config.openAIModel || "gpt-4o-mini"',
    '        openAIModel: body.openAIModel || state.config.openAIModel || "gpt-4o-mini",\n        geminiApiKey: body.geminiApiKey || state.config.geminiApiKey || "",\n        geminiModel: body.geminiModel || state.config.geminiModel || "gemini-2.5-flash",\n        grokApiKey: body.grokApiKey || state.config.grokApiKey || "",\n        grokModel: body.grokModel || state.config.grokModel || "grok-4"'
  );
  source = source.replace(
    '        !body.openAIKey &&',
    '        !body.openAIKey &&\n        !body.geminiApiKey &&\n        !body.grokApiKey &&'
  );
  source = source.replace(
    '        !nextConfig.openAIKey',
    '        !nextConfig.openAIKey &&\n        !nextConfig.geminiApiKey &&\n        !nextConfig.grokApiKey'
  );
  source = source.replace(
    '        openAIConfigured: configuredOpenAI(state)\n      });\n      return;\n    }\n\n    if (req.method === "POST" && url.pathname === "/api/profile")',
    '        openAIConfigured: configuredOpenAI(state),\n        geminiConfigured: configuredGemini(state),\n        grokConfigured: configuredGrok(state)\n      });\n      return;\n    }\n\n    if (req.method === "POST" && url.pathname === "/api/profile")'
  );
}

if (!source.includes('url.pathname === "/api/send"')) {
  const sendRoute = `
    if (req.method === "POST" && url.pathname === "/api/send") {
      const body = await parseBody(req);
      const message = body.message;
      if (!message || !body.reply?.trim()) throw new Error("送信する返信本文がありません。");
      const raw = draftRaw({
        to: message.from.raw,
        cc: "",
        subject: message.subject || "",
        body: body.reply,
        inReplyTo: message.id
      });
      const sent = await gmailFetch(withActiveAccount(state, message.accountEmail || state.google.activeEmail), "/messages/send", {
        method: "POST",
        body: JSON.stringify({
          threadId: message.threadId,
          raw: encodeBase64Url(raw)
        })
      });
      sendJson(res, 200, { sent });
      return;
    }

`;
  replaceOnce('    if (req.method === "GET") {', `${sendRoute}    if (req.method === "GET") {`, "送信API");
}

await fs.writeFile(serverPath, source);

const providerPatchPath = path.join(rootDir, "public", "provider-send.js");
await fs.writeFile(
  providerPatchPath,
  `(() => {
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
`
);

const indexPath = path.join(rootDir, "public", "index.html");
let indexSource = await fs.readFile(indexPath, "utf8");
if (!indexSource.includes("/provider-send.js")) {
  indexSource = indexSource.replace('    <script src="/patch.js"></script>', '    <script src="/patch.js"></script>\n    <script src="/provider-send.js"></script>');
  await fs.writeFile(indexPath, indexSource);
}
