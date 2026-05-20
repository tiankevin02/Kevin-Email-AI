import http from "node:http";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = loadEnv(path.join(__dirname, ".env"));
const publicDir = path.join(__dirname, "public");
const dataDir = env.DATA_DIR || path.join(__dirname, "data");
const dataFile = path.join(dataDir, "app.json");
const jobsDataFile = path.join(dataDir, "jobs.json");
const sessionsDir = path.join(dataDir, "sessions");
const port = Number(env.PORT || process.env.PORT || 8787);
const host = env.HOST || process.env.HOST || "127.0.0.1";

const gmailScopes = ["https://www.googleapis.com/auth/gmail.modify", "https://www.googleapis.com/auth/gmail.send"];

const defaultState = {
  profile: {
    name: "",
    role: "",
    company: "",
    signature: "",
    facts: "",
    tone: "丁寧、自然、短すぎず長すぎず。相手の文脈に具体的に触れる。"
  },
  senders: {},
  google: {
    tokens: null,
    email: null,
    accounts: {},
    activeEmail: null,
    oauthState: null
  },
  config: {
    googleClientId: "",
    googleClientSecret: "",
    openAIKey: "",
    openAIModel: "gpt-4o-mini",
    geminiApiKey: "",
    geminiModel: "gemini-2.5-flash",
    grokApiKey: "",
    grokModel: "grok-4",
    anthropicApiKey: "",
    anthropicModel: "claude-sonnet-4-6",
    preferredAiProvider: ""
  }
};

function loadEnv(file) {
  const values = {};
  try {
    const text = requireFs(file);
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index === -1) continue;
      const key = trimmed.slice(0, index).trim();
      const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
      values[key] = value;
      if (!process.env[key]) process.env[key] = value;
    }
  } catch {
    // .env is optional; environment variables also work.
  }
  return { ...process.env, ...values };
}

function requireFs(file) {
  return readFileSync(file, "utf8");
}

function parseCookies(req) {
  return Object.fromEntries(
    String(req.headers.cookie || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

function getSessionId(req, res) {
  const cookies = parseCookies(req);
  const existing = /^[a-f0-9]{32}$/.test(cookies.email_ai_session || "") ? cookies.email_ai_session : "";
  const sessionId = existing || crypto.randomBytes(16).toString("hex");
  if (!existing) {
    const secure = publicOrigin(req).startsWith("https://") ? "; Secure" : "";
    res.setHeader("set-cookie", `email_ai_session=${sessionId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
  }
  return sessionId;
}

function sessionFile(sessionId) {
  return path.join(sessionsDir, `${sessionId}.json`);
}

async function readGlobalState() {
  try {
    const parsed = JSON.parse(await fs.readFile(dataFile, "utf8"));
    if (!hasConnectionData(parsed)) {
      const recovered = await recoverStateFromBackup();
      if (recovered) {
        return mergeState(defaultState, {
          config: recovered.config || {},
          profile: recovered.profile || {}
        });
      }
    }
    return mergeState(defaultState, {
      config: parsed.config || {},
      profile: parsed.profile || {}
    });
  } catch {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const recovered = await recoverStateFromBackup();
    if (recovered) {
      return mergeState(defaultState, {
        config: recovered.config || {},
        profile: recovered.profile || {}
      });
    }
    await fs.writeFile(dataFile, `${JSON.stringify(defaultState, null, 2)}\n`);
    return structuredClone(defaultState);
  }
}

async function readState(req, res) {
  const sessionId = getSessionId(req, res);
  const globalState = await readGlobalState();
  let parsed = {};
  try {
    parsed = JSON.parse(await fs.readFile(sessionFile(sessionId), "utf8"));
  } catch {
    parsed = {};
  }
  const state = mergeState({ ...defaultState, config: globalState.config }, parsed);
  Object.defineProperty(state, "__sessionId", { value: sessionId, enumerable: false });
  return state;
}

function hasConnectionData(state) {
  return Boolean(
    state?.google?.tokens ||
      Object.keys(state?.google?.accounts || {}).length ||
      state?.config?.googleClientId ||
      state?.config?.googleClientSecret ||
      state?.config?.openAIKey ||
      state?.config?.geminiApiKey ||
      state?.config?.grokApiKey ||
      state?.config?.anthropicApiKey
  );
}

async function recoverStateFromBackup() {
  try {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    const files = (await fs.readdir(path.dirname(dataFile)))
      .filter((file) => /^app\..+\.bak\.json$/.test(file))
      .sort()
      .reverse();
    for (const file of files) {
      try {
        const candidate = JSON.parse(await fs.readFile(path.join(path.dirname(dataFile), file), "utf8"));
        if (hasConnectionData(candidate)) return candidate;
      } catch {
        // Try the next backup.
      }
    }
  } catch {
    // No backups available.
  }
  return null;
}

async function writeState(state) {
  const targetFile = state.__sessionId ? sessionFile(state.__sessionId) : dataFile;
  await fs.mkdir(path.dirname(targetFile), { recursive: true });
  let current = null;
  try {
    current = JSON.parse(await fs.readFile(targetFile, "utf8"));
    const hasSavedSecrets =
      current?.google?.tokens ||
      Object.keys(current?.google?.accounts || {}).length ||
      current?.config?.googleClientId ||
      current?.config?.googleClientSecret ||
      current?.config?.openAIKey ||
      current?.config?.geminiApiKey ||
      current?.config?.grokApiKey ||
      current?.config?.anthropicApiKey;
    if (hasSavedSecrets) {
      const backupDir = path.dirname(targetFile);
      const backupFile = path.join(backupDir, `app.${new Date().toISOString().replace(/[:.]/g, "-")}.bak.json`);
      await fs.writeFile(backupFile, `${JSON.stringify(current, null, 2)}\n`);
      const allBackups = (await fs.readdir(backupDir))
        .filter((f) => /^app\..+\.bak\.json$/.test(f))
        .sort()
        .reverse();
      for (const old of allBackups.slice(5)) {
        await fs.unlink(path.join(backupDir, old)).catch(() => {});
      }
    }
  } catch {
    // No previous state to back up yet.
  }

  const currentHasConnection =
    current?.google?.tokens ||
    Object.keys(current?.google?.accounts || {}).length ||
    current?.config?.googleClientId ||
    current?.config?.googleClientSecret ||
    current?.config?.openAIKey;
  const nextHasConnection =
    state?.google?.tokens ||
    Object.keys(state?.google?.accounts || {}).length ||
    state?.config?.googleClientId ||
    state?.config?.googleClientSecret ||
    state?.config?.openAIKey;
  const preservingOauthProgress =
    current?.config?.googleClientId &&
    state?.config?.googleClientId === current.config.googleClientId &&
    state?.config?.googleClientSecret === current.config.googleClientSecret &&
    state?.google?.oauthState;
  if (currentHasConnection && !nextHasConnection && !preservingOauthProgress) {
    const err = new Error("保存済みの接続情報を空データで上書きしそうになったため、保存を止めました。");
    err.status = 409;
    throw err;
  }

  await fs.writeFile(targetFile, `${JSON.stringify(state, null, 2)}\n`);
}

function mergeState(base, next) {
  const google = { ...base.google, ...(next.google || {}) };
  if (google.email && google.tokens && !google.accounts?.[google.email]) {
    google.accounts = {
      ...(google.accounts || {}),
      [google.email]: {
        email: google.email,
        tokens: google.tokens,
        connectedAt: new Date().toISOString()
      }
    };
    google.activeEmail = google.activeEmail || google.email;
  }
  return {
    ...base,
    ...next,
    profile: { ...base.profile, ...(next.profile || {}) },
    senders: { ...(next.senders || {}) },
    google,
    config: { ...base.config, ...(next.config || {}) }
  };
}


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

function sendJson(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(text);
}

function sendText(res, status, text, type = "text/plain; charset=utf-8") {
  res.writeHead(status, { "content-type": type, "cache-control": "no-store" });
  res.end(text);
}

async function parseBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function googleConfig(state) {
  return {
    clientId: env.GOOGLE_CLIENT_ID || state.config.googleClientId,
    clientSecret: env.GOOGLE_CLIENT_SECRET || state.config.googleClientSecret
  };
}

function openAIConfig(state) {
  return {
    key: env.OPENAI_API_KEY || state.config.openAIKey,
    model: env.OPENAI_MODEL || state.config.openAIModel || "gpt-4o-mini"
  };
}

function geminiConfig(state) {
  return {
    key: env.GEMINI_API_KEY || state.config.geminiApiKey,
    model: env.GEMINI_MODEL || state.config.geminiModel || "gemini-2.5-flash",
    fallbackModel: env.GEMINI_FALLBACK_MODEL || "gemini-2.5-flash"
  };
}

function isGeminiQuotaError(status, body) {
  if (status === 429) return true;
  const msg = (body?.error?.message || body?.error?.status || "").toLowerCase();
  return msg.includes("resource_exhausted") || msg.includes("quota") || msg.includes("rate limit");
}

async function callGeminiApi(key, model, requestBody) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) }
  );
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

function grokConfig(state) {
  return {
    key: env.GROK_API_KEY || env.XAI_API_KEY || state.config.grokApiKey,
    model: env.GROK_MODEL || env.XAI_MODEL || state.config.grokModel || "grok-4"
  };
}

function configuredGoogle(state) {
  const config = googleConfig(state);
  return Boolean(config.clientId && config.clientSecret);
}

function configuredOpenAI(state) {
  return Boolean(openAIConfig(state).key);
}

function configuredGemini(state) {
  return Boolean(geminiConfig(state).key);
}

function configuredGrok(state) {
  return Boolean(grokConfig(state).key);
}

function anthropicConfig(state) {
  return {
    key: env.ANTHROPIC_API_KEY || state.config.anthropicApiKey,
    model: env.ANTHROPIC_MODEL || state.config.anthropicModel || "claude-opus-4-5"
  };
}

function configuredAnthropic(state) {
  return Boolean(anthropicConfig(state).key);
}

function configuredAI(state) {
  return configuredOpenAI(state) || configuredGemini(state) || configuredGrok(state) || configuredAnthropic(state);
}

async function readJobsData() {
  try {
    return JSON.parse(await fs.readFile(jobsDataFile, "utf8"));
  } catch {
    return { companies: [], schedules: [] };
  }
}

async function writeJobsData(data) {
  await fs.mkdir(path.dirname(jobsDataFile), { recursive: true });
  await fs.writeFile(jobsDataFile, `${JSON.stringify(data, null, 2)}\n`);
}

function aiProviderOrder(state) {
  const preferred = state.config?.preferredAiProvider;
  const defaults = ["gemini", "anthropic", "openai", "grok"];
  if (!preferred) return defaults;
  return [preferred, ...defaults.filter((p) => p !== preferred)];
}

async function tryProviderChat(provider, state, messages, temperature) {
  switch (provider) {
    case "gemini": {
      if (!configuredGemini(state)) return null;
      const config = geminiConfig(state);
      const system = messages.find((m) => m.role === "system")?.content || "";
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const reqBody = {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: { temperature, maxOutputTokens: 4096 }
      };
      let { ok, status, body } = await callGeminiApi(config.key, config.model, reqBody);
      if (!ok && isGeminiQuotaError(status, body) && config.fallbackModel !== config.model) {
        console.log(`Gemini quota exceeded on ${config.model}, falling back to ${config.fallbackModel}`);
        ({ ok, body } = await callGeminiApi(config.key, config.fallbackModel, reqBody));
      }
      return ok ? (body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "") : null;
    }
    case "anthropic": {
      if (!configuredAnthropic(state)) return null;
      const config = anthropicConfig(state);
      const system = messages.find((m) => m.role === "system")?.content || "";
      const filtered = messages.filter((m) => m.role !== "system");
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "content-type": "application/json", "x-api-key": config.key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: config.model, max_tokens: 4096, ...(system ? { system } : {}), messages: filtered })
      });
      const body = await response.json();
      return response.ok ? (body.content?.[0]?.text?.trim() || "") : null;
    }
    case "openai": {
      if (!configuredOpenAI(state)) return null;
      const config = openAIConfig(state);
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${config.key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: config.model, messages, temperature })
      });
      const body = await response.json();
      return response.ok ? (body.choices?.[0]?.message?.content?.trim() || "") : null;
    }
    case "grok": {
      if (!configuredGrok(state)) return null;
      const config = grokConfig(state);
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${config.key}`, "content-type": "application/json" },
        body: JSON.stringify({ model: config.model, messages, temperature })
      });
      const body = await response.json();
      return response.ok ? (body.choices?.[0]?.message?.content?.trim() || "") : null;
    }
    default:
      return null;
  }
}

async function callGemini(state, messages, temperature) {
  return tryProviderChat("gemini", state, messages, temperature);
}

function buildProfileContext(userProfile) {
  if (!userProfile) return "";
  const parts = [];
  if (userProfile.gakuchika)  parts.push(`【ガクチカ】\n${userProfile.gakuchika}`);
  if (userProfile.selfPr)     parts.push(`【自己PR】\n${userProfile.selfPr}`);
  if (userProfile.motivation) parts.push(`【志望動機の軸】\n${userProfile.motivation}`);
  if (userProfile.skills)     parts.push(`【スキル・資格】\n${userProfile.skills}`);
  if (userProfile.other)      parts.push(`【その他】\n${userProfile.other}`);
  if (!parts.length) return "";
  return "\n\n---\n【応募者のプロフィール情報】\n" + parts.join("\n\n");
}

async function jobsAiChat(state, systemPrompt, userContent) {
  const messages = [{ role: "system", content: systemPrompt }, { role: "user", content: userContent }];
  for (const provider of aiProviderOrder(state)) {
    try {
      const result = await tryProviderChat(provider, state, messages, 0.7);
      if (result !== null) return result;
    } catch {}
  }
  const err = new Error("AIサービスが設定されていません。設定からAPIキーを入力してください。");
  err.status = 400;
  throw err;
}

async function quizAiWithImages(state, systemPrompt, userText, imgList) {
  // imgList: [{base64, mime}]
  for (const provider of aiProviderOrder(state)) {
    try {
      let result = null;
      if (provider === "anthropic" && configuredAnthropic(state)) {
        const config = anthropicConfig(state);
        const contentParts = imgList.map(img => ({
          type: "image", source: { type: "base64", media_type: img.mime, data: img.base64 }
        }));
        contentParts.push({ type: "text", text: userText });
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": config.key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: config.model, max_tokens: 4096, system: systemPrompt, messages: [{ role: "user", content: contentParts }] })
        });
        const body = await response.json();
        result = response.ok ? (body.content?.[0]?.text?.trim() || "") : null;
      } else if (provider === "gemini" && configuredGemini(state)) {
        const config = geminiConfig(state);
        const parts = imgList.map(img => ({ inline_data: { mime_type: img.mime, data: img.base64 } }));
        parts.push({ text: userText });
        const reqBody = { systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: "user", parts }], generationConfig: { temperature: 0.3, maxOutputTokens: 4096 } };
        let { ok, status, body } = await callGeminiApi(config.key, config.model, reqBody);
        if (!ok && isGeminiQuotaError(status, body) && config.fallbackModel !== config.model) {
          console.log(`Gemini quota exceeded on ${config.model}, falling back to ${config.fallbackModel}`);
          ({ ok, body } = await callGeminiApi(config.key, config.fallbackModel, reqBody));
        }
        result = ok ? (body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "") : null;
      } else if (provider === "openai" && configuredOpenAI(state)) {
        const config = openAIConfig(state);
        const contentParts = imgList.map(img => ({
          type: "image_url", image_url: { url: `data:${img.mime};base64,${img.base64}` }
        }));
        contentParts.push({ type: "text", text: userText });
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${config.key}`, "content-type": "application/json" },
          body: JSON.stringify({ model: "gpt-4o", temperature: 0.3, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: contentParts }] })
        });
        const body = await response.json();
        result = response.ok ? (body.choices?.[0]?.message?.content?.trim() || "") : null;
      }
      if (result !== null) return result;
    } catch {}
  }
  const err = new Error("画像対応AIが設定されていません。Anthropic / Gemini / OpenAI のAPIキーを設定してください。");
  err.status = 400;
  throw err;
}

async function quizAiWithImage(state, systemPrompt, userText, imageBase64, mimeType) {
  for (const provider of aiProviderOrder(state)) {
    try {
      let result = null;
      if (provider === "anthropic" && configuredAnthropic(state)) {
        const config = anthropicConfig(state);
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": config.key, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: config.model, max_tokens: 4096, system: systemPrompt,
            messages: [{ role: "user", content: [
              { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } },
              { type: "text", text: userText }
            ]}]
          })
        });
        const body = await response.json();
        result = response.ok ? (body.content?.[0]?.text?.trim() || "") : null;
      } else if (provider === "gemini" && configuredGemini(state)) {
        const config = geminiConfig(state);
        const reqBody = {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [
            { inline_data: { mime_type: mimeType, data: imageBase64 } },
            { text: userText }
          ]}],
          generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
        };
        let { ok, status, body } = await callGeminiApi(config.key, config.model, reqBody);
        if (!ok && isGeminiQuotaError(status, body) && config.fallbackModel !== config.model) {
          console.log(`Gemini quota exceeded on ${config.model}, falling back to ${config.fallbackModel}`);
          ({ ok, body } = await callGeminiApi(config.key, config.fallbackModel, reqBody));
        }
        result = ok ? (body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "") : null;
      } else if (provider === "openai" && configuredOpenAI(state)) {
        const config = openAIConfig(state);
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { authorization: `Bearer ${config.key}`, "content-type": "application/json" },
          body: JSON.stringify({
            model: "gpt-4o", temperature: 0.3,
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: [
                { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
                { type: "text", text: userText }
              ]}
            ]
          })
        });
        const body = await response.json();
        result = response.ok ? (body.choices?.[0]?.message?.content?.trim() || "") : null;
      }
      if (result !== null) return result;
    } catch {}
  }
  const err = new Error("画像対応AIが設定されていません。Anthropic / Gemini / OpenAI のAPIキーを設定してください。");
  err.status = 400;
  throw err;
}

function redirect(res, location) {
  res.writeHead(302, { location });
  res.end();
}

function publicOrigin(req) {
  const hostHeader = req.headers.host || `localhost:${port}`;
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const proto = forwardedProto || (hostHeader.startsWith("localhost") || hostHeader.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${hostHeader}`;
}

async function getFreshGoogleToken(state) {
  const account = activeAccount(state);
  const tokens = account?.tokens;
  if (!tokens?.access_token) {
    const err = new Error("Gmailに接続してください。");
    err.status = 401;
    throw err;
  }

  if (tokens.expires_at && Date.now() < tokens.expires_at - 60_000) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) return tokens.access_token;

  const params = new URLSearchParams({
    client_id: googleConfig(state).clientId,
    client_secret: googleConfig(state).clientSecret,
    refresh_token: tokens.refresh_token,
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: params
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error_description || body.error || "Google token refresh failed");

  account.tokens = {
    ...tokens,
    ...body,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + (body.expires_in || 3600) * 1000
  };
  state.google.tokens = account.tokens;
  await writeState(state);
  return account.tokens.access_token;
}

function accountsList(state) {
  const accounts = state.google.accounts || {};
  return Object.values(accounts).map((account) => ({
    email: account.email,
    connectedAt: account.connectedAt || null,
    active: account.email === state.google.activeEmail
  }));
}

function activeAccount(state) {
  const accounts = state.google.accounts || {};
  const email = state.google.activeEmail || state.google.email || Object.keys(accounts)[0];
  if (email && accounts[email]) {
    state.google.activeEmail = email;
    state.google.email = email;
    state.google.tokens = accounts[email].tokens;
    return accounts[email];
  }
  if (state.google.tokens && state.google.email) {
    accounts[state.google.email] = {
      email: state.google.email,
      tokens: state.google.tokens,
      connectedAt: new Date().toISOString()
    };
    state.google.accounts = accounts;
    state.google.activeEmail = state.google.email;
    return accounts[state.google.email];
  }
  return null;
}

function withActiveAccount(state, email) {
  if (!email || email === "active") return state;
  const account = state.google.accounts?.[email];
  if (!account) {
    const err = new Error(`${email} は接続されていません。`);
    err.status = 404;
    throw err;
  }
  return {
    ...state,
    google: {
      ...state.google,
      email,
      activeEmail: email,
      tokens: account.tokens,
      accounts: state.google.accounts
    }
  };
}

async function gmailFetch(state, url, options = {}) {
  const accessToken = await getFreshGoogleToken(state);
  return gmailFetchWithToken(accessToken, url, options);
}

async function gmailFetchWithToken(accessToken, url, options = {}) {
  const response = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me${url}`, {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const err = new Error(body.error?.message || "Gmail API request failed");
    err.status = response.status;
    throw err;
  }
  return body;
}

function header(message, name) {
  const found = message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase());
  return found?.value || "";
}

function decodeBase64Url(data = "") {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(normalized, "base64").toString("utf8");
}

function textFromPayload(payload) {
  if (!payload) return "";
  if (payload.mimeType === "text/plain" && payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.mimeType === "text/html" && payload.body?.data) return htmlToText(decodeBase64Url(payload.body.data));
  const parts = payload.parts || [];
  const plain = parts.map(textFromPayload).filter(Boolean);
  return plain.join("\n\n");
}

function htmlToText(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function parseAddress(value) {
  const match = value.match(/^(.*?)<([^>]+)>$/);
  if (match) {
    return {
      name: match[1].replace(/"/g, "").trim(),
      email: match[2].trim().toLowerCase(),
      raw: value
    };
  }
  return { name: "", email: value.trim().toLowerCase(), raw: value };
}

function summarizeMessage(message) {
  const from = parseAddress(header(message, "From"));
  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet || "",
    from,
    to: header(message, "To"),
    cc: header(message, "Cc"),
    subject: header(message, "Subject"),
    date: header(message, "Date"),
    body: textFromPayload(message.payload).slice(0, 24_000),
    labelIds: message.labelIds || []
  };
}

function summarizeMessageMetadata(message) {
  const from = parseAddress(header(message, "From"));
  return {
    id: message.id,
    threadId: message.threadId,
    snippet: message.snippet || "",
    from,
    to: header(message, "To"),
    cc: header(message, "Cc"),
    subject: header(message, "Subject"),
    date: header(message, "Date"),
    body: "",
    labelIds: message.labelIds || []
  };
}

async function listMessages(state, query = "in:inbox newer_than:30d", maxResults = 20, mode = "full") {
  const target = maxResults === "all" ? Infinity : Number(maxResults || 20);
  const pageSize = Math.min(Number.isFinite(target) ? target : 500, 500);
  const collected = [];
  let pageToken = "";

  while (collected.length < target) {
    const tokenParam = pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : "";
    const remaining = Number.isFinite(target) ? target - collected.length : pageSize;
    const list = await gmailFetch(
      state,
      `/messages?q=${encodeURIComponent(query)}&maxResults=${Math.min(pageSize, remaining)}${tokenParam}`
    );
    collected.push(...(list.messages || []));
    pageToken = list.nextPageToken || "";
    if (!pageToken || !(list.messages || []).length) break;
  }

  const accountEmail = activeAccount(state)?.email || state.google.email;
  const messages = [];
  for (let index = 0; index < collected.length; index += 10) {
    const chunk = collected.slice(index, index + 10);
    const fullMessages = await Promise.all(
      chunk.map(async (item) => {
        const full =
          mode === "metadata"
            ? await gmailFetch(
                state,
                `/messages/${item.id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`
              )
            : await gmailFetch(state, `/messages/${item.id}?format=full`);
        const summary = mode === "metadata" ? summarizeMessageMetadata(full) : summarizeMessage(full);
        return { ...summary, accountEmail };
      })
    );
    messages.push(...fullMessages);
  }
  return messages;
}

async function listMessagesAcrossAccounts(state, query, maxResults, mode = "full") {
  const accounts = accountsList(state);
  if (!accounts.length) return [];
  const perAccount = maxResults === "all" ? "all" : Math.max(5, Math.ceil(Number(maxResults || 20) / accounts.length));
  const groups = await Promise.all(
    accounts.map(async (account) => {
      try {
        return await listMessages(withActiveAccount(state, account.email), query, perAccount, mode);
      } catch {
        return [];
      }
    })
  );
  return maxResults === "all" ? groups.flat() : groups.flat().slice(0, Number(maxResults || 20));
}

function buildPrompt({ profile, sender, message, instruction }) {
  return [
    {
      role: "system",
      content:
        "あなたは本人の代わりにメール返信の下書きを作る専門家です。作るのは送信前の下書きだけです。過度にAIっぽい定型句、曖昧な美辞麗句、不要に長い前置きは禁止です。相手のメール本文を読み、相手との関係性と本人情報を反映して、自然で具体的な日本語メールを書いてください。必要な不明点がある場合は本文内で勝手に断定せず、確認事項として短く含めてください。"
    },
    {
      role: "user",
      content: JSON.stringify(
        {
          userProfile: profile,
          senderProfile: sender,
          incomingEmail: {
            from: message.from,
            to: message.to,
            cc: message.cc,
            subject: message.subject,
            date: message.date,
            body: message.body
          },
          requestedDirection: instruction || "自然で人間らしい返信。必要ならお礼、回答、次の行動を入れる。"
        },
        null,
        2
      )
    }
  ];
}

async function chatComplete(state, messages, temperature = 0.35) {
  for (const provider of aiProviderOrder(state)) {
    try {
      const result = await tryProviderChat(provider, state, messages, temperature);
      if (result !== null) return result;
    } catch {}
  }
  return "";
}

async function generateReply(payload) {
  const messages = buildPrompt(payload);
  if (!configuredAI(payload.state)) {
    const err = new Error("AIサービスが設定されていません。設定からAPIキーを入力してください。");
    err.status = 400;
    throw err;
  }
  return chatComplete(payload.state, messages, 0.65);
}

function messageTime(message) {
  const time = Date.parse(message.date || "");
  return Number.isFinite(time) ? time : 0;
}

function importantScore(message) {
  const text = `${message.from?.name || ""} ${message.from?.email || ""} ${message.subject || ""} ${message.snippet || ""} ${message.body || ""}`;
  let score = 0;
  if (/締切|〆切|期限|web|ウェブ|適性検査|受験|面接|面談|説明会|セミナー|インターン|選考|内定|応募|エントリー|日程|候補日|予約|内見|お問い合わせ|返信|ご返信/i.test(text)) score += 5;
  if (/saiyo|onecareer|openwork|linkedin|pwc|recruit|career|fudosan|assist|不動産/i.test(text)) score += 3;
  if (/no-reply|noreply|配信専用|自動送信|メルマガ|クーポン|キャンペーン|発送|注文|認証コード|ログインコード/i.test(text)) score -= 4;
  if ((message.labelIds || []).includes("UNREAD")) score += 1;
  return score;
}

function careerSignalScore(message) {
  const text = `${message.from?.name || ""} ${message.from?.email || ""} ${message.subject || ""} ${message.snippet || ""} ${message.body || ""}`.toLowerCase();
  let score = 0;
  if (/採用|新卒|就活|就職|選考|面接|面談|説明会|会社説明|インターン|インターンシップ|webテスト|ウェブテスト|適性検査|es\b|エントリー|マイページ|内定|オファー|リクルート|キャリア|セミナー|座談会/i.test(text)) score += 6;
  if (/saiyo|recruit|career|hr@|human.?resources|onecareer|openwork|offerbox|wantedly|linkedin|rikunabi|mynavi|job|intern/i.test(text)) score += 5;
  if (/締切|〆切|期限|開催|予約|日程|候補日|受験|提出|応募/i.test(text)) score += 2;
  if (/不動産|住まい|内見|賃貸|物件|家賃|保証会社|引越|配送|注文|発送|旅行|ホテル|航空券|レストラン|美容|病院|歯科|チケット|ライブ|決済|認証コード|ログイン|クーポン|キャンペーン|メルマガ|newsletter/i.test(text)) score -= 7;
  if (/no-reply|noreply|notification|配信専用|自動送信/i.test(text)) score -= 1;
  return score;
}

function isCareerScheduleCandidate(message) {
  return careerSignalScore(message) >= 6;
}

function extractScheduleItems(messages) {
  const items = [];
  const datePattern = /(?:(202[0-9])年)?\s*(1[0-2]|0?[1-9])月\s*([12][0-9]|3[01]|0?[1-9])日(?:[（(][月火水木金土日][）)])?(?:\s*([0-2]?[0-9])[:：時]\s*([0-5][0-9])?分?)?/g;
  const relativePattern = /(今日|明日|明後日|本日|今週|来週).{0,24}(締切|〆切|開催|説明会|面接|面談|セミナー|適性検査|webテスト|ウェブテスト|受験|応募)/gi;
  const keywordPattern = /(採用|新卒|就活|就職|選考|説明会|会社説明|面接|面談|セミナー|座談会|適性検査|webテスト|ウェブテスト|受験|応募|エントリー|インターン|インターンシップ|締切|〆切|期限)/i;
  const dateContextPattern = /(採用|新卒|就活|選考|説明会|会社説明|面接|面談|セミナー|座談会|適性検査|webテスト|ウェブテスト|受験|応募|エントリー|インターン|締切|〆切|期限|開催|提出)/i;

  for (const message of messages) {
    if (!isCareerScheduleCandidate(message)) continue;
    const text = `${message.subject || ""}\n${message.snippet || ""}\n${(message.body || "").slice(0, 5000)}`;
    if (!keywordPattern.test(text)) continue;
    const urls = Array.from(
      new Set((text.match(/https?:\/\/[^\s<>"'）)]+/g) || []).map((url) => url.replace(/[、。,.]+$/g, "")))
    ).slice(0, 5);
    const baseYear = new Date(messageTime(message) || Date.now()).getFullYear();
    const seen = new Set();

    for (const match of text.matchAll(datePattern)) {
      const context = text.slice(Math.max(0, match.index - 140), Math.min(text.length, match.index + match[0].length + 180));
      if (!dateContextPattern.test(context)) continue;
      const year = Number(match[1] || baseYear);
      const month = Number(match[2]);
      const day = Number(match[3]);
      const hour = match[4] ? Number(match[4]) : null;
      const minute = match[5] ? Number(match[5]) : 0;
      const key = `${year}-${month}-${day}-${hour ?? ""}-${message.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      items.push({
        date: iso,
        time: hour === null ? "" : `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
        type: /締切|〆切|期限|受験|webテスト|ウェブテスト|適性検査/i.test(text) ? "締切" : "予定",
        title: message.subject || "(件名なし)",
        from: message.from?.name || message.from?.email || "",
        accountEmail: message.accountEmail || "",
        urls,
        content: text.slice(0, 1200),
        snippet: (message.snippet || text).slice(0, 220),
        messageId: message.id
      });
    }

    if (!seen.size && relativePattern.test(text)) {
      items.push({
        date: "",
        time: "",
        type: /締切|〆切|期限|受験|webテスト|ウェブテスト|適性検査/i.test(text) ? "締切" : "予定",
        title: message.subject || "(件名なし)",
        from: message.from?.name || message.from?.email || "",
        accountEmail: message.accountEmail || "",
        urls,
        content: text.slice(0, 1200),
        snippet: (message.snippet || text).slice(0, 220),
        messageId: message.id
      });
    }
  }

  return items.sort((a, b) => (b.date || "0000-00-00").localeCompare(a.date || "0000-00-00"));
}

function parseJsonArray(text) {
  const trimmed = (text || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    const match = trimmed.match(/\[[\s\S]*\]/);
    if (!match) return [];
    try {
      const parsed = JSON.parse(match[0]);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
}

async function extractCareerScheduleItems(state, messages) {
  const candidates = messages
    .filter(isCareerScheduleCandidate)
    .map((message) => ({ message, score: careerSignalScore(message) }))
    .sort((a, b) => b.score - a.score || messageTime(b.message) - messageTime(a.message))
    .slice(0, 40)
    .map(({ message }, index) => ({ ...message, sourceIndex: index }));

  if (!configuredAI(state) || !candidates.length) return extractScheduleItems(candidates);

  const source = candidates.map((message) => ({
    sourceIndex: message.sourceIndex,
    from: message.from,
    subject: message.subject,
    dateReceived: message.date,
    snippet: message.snippet,
    body: (message.body || "").slice(0, 1800),
    accountEmail: message.accountEmail,
    messageId: message.id
  }));

  let answer = "";
  try {
    answer = await chatComplete(
      state,
      [
        {
          role: "system",
          content:
            "あなたは就活メールだけを整理する秘書です。採用、選考、インターン、会社説明会、面接、面談、Webテスト、ES、応募締切に関係する予定だけを抽出します。不動産、配送、注文、旅行、認証、広告、一般イベントなど就活以外は必ず除外します。返答はJSON配列のみ。"
        },
        {
          role: "user",
          content: JSON.stringify({
            rule: "各予定は sourceIndex, date(YYYY-MM-DDまたは空), time(HH:mmまたは空), type(説明会/面談/Webテスト/締切/インターン/選考イベント), title(会社名 + 短い内容), content(重要事項を短く), urls, isCareer を返す。日付が本文から確定できない場合はdateを空にする。",
            emails: source
          })
        }
      ],
      0.1
    );
  } catch {
    return extractScheduleItems(candidates);
  }

  const aiItems = parseJsonArray(answer)
    .filter((item) => item && item.isCareer !== false)
    .map((item) => {
      const sourceMessage = candidates.find((message) => Number(message.sourceIndex) === Number(item.sourceIndex));
      if (!sourceMessage) return null;
      const sourceText = `${sourceMessage.subject || ""}\n${sourceMessage.snippet || ""}\n${sourceMessage.body || ""}`;
      const urls = Array.from(
        new Set([...(Array.isArray(item.urls) ? item.urls : []), ...(sourceText.match(/https?:\/\/[^\s<>"'）)]+/g) || [])])
      )
        .map((url) => String(url).replace(/[、。,.]+$/g, ""))
        .slice(0, 5);
      return {
        date: /^\d{4}-\d{2}-\d{2}$/.test(item.date || "") ? item.date : "",
        time: /^\d{1,2}:\d{2}$/.test(item.time || "") ? item.time.padStart(5, "0") : "",
        type: item.type || "選考イベント",
        title: item.title || sourceMessage.subject || "(件名なし)",
        from: sourceMessage.from?.name || sourceMessage.from?.email || "",
        accountEmail: sourceMessage.accountEmail || "",
        urls,
        content: item.content || sourceMessage.snippet || "",
        snippet: item.content || sourceMessage.snippet || "",
        messageId: sourceMessage.id
      };
    })
    .filter(Boolean);

  return (aiItems.length ? aiItems : extractScheduleItems(candidates)).sort((a, b) =>
    (b.date || "0000-00-00").localeCompare(a.date || "0000-00-00")
  );
}

function fallbackDigest(messages, period) {
  const important = messages
    .map((message) => ({ message, score: importantScore(message) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || messageTime(b.message) - messageTime(a.message))
    .slice(0, 8);
  if (!important.length) return `${period}の重要そうなメールは見つかりませんでした。`;
  return important
    .map(({ message }) => `・${message.subject || "(件名なし)"} / ${message.from?.name || message.from?.email || ""}\n  ${message.snippet || ""}`)
    .join("\n");
}

function encodeBase64Url(text) {
  return Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function draftRaw({ to, cc, subject, body, inReplyTo }) {
  const headers = [
    `To: ${to}`,
    cc ? `Cc: ${cc}` : "",
    `Subject: ${subject.startsWith("Re:") ? subject : `Re: ${subject}`}`,
    inReplyTo ? `In-Reply-To: ${inReplyTo}` : "",
    "Content-Type: text/plain; charset=UTF-8"
  ].filter(Boolean);
  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

function fallbackCommandParse(command) {
  const cmd = command.toLowerCase();
  if (/受信|inbox/.test(cmd)) return { action: "switch-tab", tab: "inbox", message: "受信トレイに切り替えます。" };
  if (/スター|star/.test(cmd)) return { action: "switch-tab", tab: "starred", message: "スター付きに切り替えます。" };
  if (/送信済み|sent/.test(cmd)) return { action: "switch-tab", tab: "sent", message: "送信済みに切り替えます。" };
  if (/下書き|draft/.test(cmd)) return { action: "switch-tab", tab: "drafts", message: "下書きに切り替えます。" };
  if (/最重要|重要|urgent/.test(cmd)) return { action: "switch-tab", tab: "important", message: "最重要に切り替えます。" };
  if (/未読|unread/.test(cmd)) return { action: "switch-tab", tab: "unread", message: "未読に切り替えます。" };
  if (/要対応|対応/.test(cmd)) return { action: "switch-tab", tab: "action", message: "要対応に切り替えます。" };
  if (/住まい|不動産|fudosan/.test(cmd)) return { action: "switch-tab", tab: "housing", message: "住まいタブに切り替えます。" };
  if (/就活|career/.test(cmd)) return { action: "switch-tab", tab: "career", message: "就活タブに切り替えます。" };
  if (/すべて|全部|all/.test(cmd) && /フィルター|filter|表示/.test(cmd)) return { action: "switch-filter", filter: "all", message: "フィルターをすべてに切り替えます。" };
  if (/返信|対応/.test(cmd) && /フィルター|filter|絞り/.test(cmd)) return { action: "switch-filter", filter: "action", message: "返信/対応フィルターに切り替えます。" };
  if (/確認/.test(cmd) && /フィルター|filter|絞り/.test(cmd)) return { action: "switch-filter", filter: "notice", message: "確認フィルターに切り替えます。" };
  if (/通知/.test(cmd) && /フィルター|filter|絞り/.test(cmd)) return { action: "switch-filter", filter: "skip", message: "通知フィルターに切り替えます。" };
  if (/gemini/.test(cmd)) return { action: "switch-ai", provider: "gemini", message: "AIをGeminiに切り替えます。" };
  if (/anthropic|claude/.test(cmd)) return { action: "switch-ai", provider: "anthropic", message: "AIをAnthropicに切り替えます。" };
  if (/openai|gpt/.test(cmd)) return { action: "switch-ai", provider: "openai", message: "AIをOpenAIに切り替えます。" };
  if (/grok|xai/.test(cmd)) return { action: "switch-ai", provider: "grok", message: "AIをGrokに切り替えます。" };
  if (/設定|setup|config/.test(cmd)) return { action: "open-setup", message: "設定を開きます。" };
  if (/同期|sync|更新|refresh/.test(cmd)) return { action: "sync", message: "メールを同期します。" };
  if (/10件/.test(cmd)) return { action: "set-max", max: "10", message: "10件表示に変更します。" };
  if (/20件/.test(cmd)) return { action: "set-max", max: "20", message: "20件表示に変更します。" };
  if (/50件/.test(cmd)) return { action: "set-max", max: "50", message: "50件表示に変更します。" };
  if (/500件/.test(cmd)) return { action: "set-max", max: "500", message: "500件表示に変更します。" };
  if (/今年|year/.test(cmd)) return { action: "set-max", max: "year", message: "今年のメールを表示します。" };
  return { action: "reply", message: "コマンドを理解できませんでした。例: 「就活タブを開く」「Geminiに切り替え」「メールを同期」" };
}

async function route(req, res) {
  const url = new URL(req.url, `http://localhost:${port}`);
  const state = await readState(req, res);

  try {
    if (req.method === "GET" && url.pathname === "/healthz") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/status") {
      activeAccount(state);
      await writeState(state);
      const activeAiProvider = configuredGemini(state)
        ? "Gemini"
        : configuredAnthropic(state)
          ? "Anthropic"
          : configuredOpenAI(state)
            ? "OpenAI"
            : configuredGrok(state)
              ? "Grok"
              : null;
      sendJson(res, 200, {
        googleConfigured: configuredGoogle(state),
        openAIConfigured: configuredOpenAI(state),
        aiConfigured: configuredAI(state),
        activeAiProvider,
        savedConfig: {
          googleClientId: Boolean(state.config.googleClientId),
          googleClientSecret: Boolean(state.config.googleClientSecret),
          openAIKey: Boolean(state.config.openAIKey),
          openAIModel: state.config.openAIModel || "gpt-4o-mini",
          geminiApiKey: Boolean(state.config.geminiApiKey),
          anthropicApiKey: Boolean(state.config.anthropicApiKey),
          grokApiKey: Boolean(state.config.grokApiKey),
          preferredAiProvider: state.config.preferredAiProvider || ""
        },
        configFromEnv: {
          google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
          openAI: Boolean(env.OPENAI_API_KEY),
          gemini: Boolean(env.GEMINI_API_KEY),
          anthropic: Boolean(env.ANTHROPIC_API_KEY),
          grok: Boolean(env.GROK_API_KEY || env.XAI_API_KEY)
        },
        gmailConnected: Boolean(state.google.tokens),
        email: state.google.email,
        activeEmail: state.google.activeEmail || state.google.email,
        accounts: accountsList(state),
        profile: state.profile,
        senders: state.senders
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/network-url") {
      const forwardedHost = req.headers.host || `localhost:${port}`;
      const fallback = `http://${forwardedHost.replace(/^127\.0\.0\.1/, "localhost")}`;
      const candidates = [];
      try {
        const os = await import("node:os");
        for (const entries of Object.values(os.networkInterfaces())) {
          for (const entry of entries || []) {
            if (entry.family === "IPv4" && !entry.internal) {
              candidates.push(`http://${entry.address}:${port}`);
            }
          }
        }
      } catch {
        // Fallback below is enough.
      }
      sendJson(res, 200, { url: candidates[0] || fallback, candidates });
      return;
    }


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

    if (req.method === "POST" && url.pathname === "/api/config") {
      const body = await parseBody(req);
      const nextConfig = {
        ...state.config,
        googleClientId: body.googleClientId || state.config.googleClientId || "",
        googleClientSecret: body.googleClientSecret || state.config.googleClientSecret || "",
        openAIKey: body.openAIKey || state.config.openAIKey || "",
        openAIModel: body.openAIModel || state.config.openAIModel || "gpt-4o-mini",
        geminiApiKey: body.geminiApiKey || state.config.geminiApiKey || "",
        geminiModel: body.geminiModel || state.config.geminiModel || "gemini-2.5-flash",
        grokApiKey: body.grokApiKey || state.config.grokApiKey || "",
        grokModel: body.grokModel || state.config.grokModel || "grok-4",
        anthropicApiKey: body.anthropicApiKey || state.config.anthropicApiKey || "",
        anthropicModel: body.anthropicModel || state.config.anthropicModel || "claude-sonnet-4-6",
        preferredAiProvider: body.preferredAiProvider !== undefined ? body.preferredAiProvider : (state.config.preferredAiProvider || "")
      };
      if (
        hasConnectionData(state) &&
        !body.googleClientId &&
        !body.googleClientSecret &&
        !body.openAIKey &&
        !body.geminiApiKey &&
        !body.grokApiKey &&
        !body.anthropicApiKey &&
        !nextConfig.googleClientId &&
        !nextConfig.googleClientSecret &&
        !nextConfig.openAIKey &&
        !nextConfig.geminiApiKey &&
        !nextConfig.grokApiKey &&
        !nextConfig.anthropicApiKey
      ) {
        const err = new Error("保存済みの接続設定を空欄で上書きしそうになったため、保存を止めました。");
        err.status = 409;
        throw err;
      }
      state.config = { ...nextConfig };
      await writeState(state);
      const activeAiProvider = configuredGemini(state)
        ? "Gemini"
        : configuredAnthropic(state)
          ? "Anthropic"
          : configuredOpenAI(state)
            ? "OpenAI"
            : configuredGrok(state)
              ? "Grok"
              : null;
      sendJson(res, 200, {
        googleConfigured: configuredGoogle(state),
        openAIConfigured: configuredOpenAI(state),
        activeAiProvider
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/profile") {
      const body = await parseBody(req);
      state.profile = { ...state.profile, ...body };
      await writeState(state);
      sendJson(res, 200, { profile: state.profile });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/senders") {
      const body = await parseBody(req);
      if (!body.email) throw new Error("email is required");
      state.senders[body.email.toLowerCase()] = {
        name: body.name || "",
        relationship: body.relationship || "",
        tone: body.tone || "自然な敬語",
        facts: body.facts || "",
        avoid: body.avoid || ""
      };
      await writeState(state);
      sendJson(res, 200, { sender: state.senders[body.email.toLowerCase()] });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/accounts/active") {
      const body = await parseBody(req);
      if (!body.email) throw new Error("email is required");
      if (!state.google.accounts?.[body.email]) {
        const err = new Error("このアカウントはまだ接続されていません。");
        err.status = 404;
        throw err;
      }
      state.google.activeEmail = body.email;
      state.google.email = body.email;
      state.google.tokens = state.google.accounts[body.email].tokens;
      await writeState(state);
      sendJson(res, 200, { activeEmail: body.email, accounts: accountsList(state) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/google") {
      if (!configuredGoogle(state)) {
        redirect(res, "/?setup=google");
        return;
      }
      const oauthState = crypto.randomBytes(16).toString("hex");
      state.google.oauthState = oauthState;
      await writeState(state);
      const redirectUri = `${publicOrigin(req)}/auth/google/callback`;
      const params = new URLSearchParams({
        client_id: googleConfig(state).clientId,
        redirect_uri: redirectUri,
        response_type: "code",
        scope: gmailScopes.join(" "),
        access_type: "offline",
        prompt: "consent",
        state: oauthState
      });
      redirect(res, `https://accounts.google.com/o/oauth2/v2/auth?${params}`);
      return;
    }

    if (req.method === "GET" && url.pathname === "/auth/google/callback") {
      if (url.searchParams.get("state") !== state.google.oauthState) {
        sendText(res, 400, "OAuth stateが一致しません。もう一度接続してください。");
        return;
      }
      const code = url.searchParams.get("code");
      const params = new URLSearchParams({
        code,
        client_id: googleConfig(state).clientId,
        client_secret: googleConfig(state).clientSecret,
        redirect_uri: `${publicOrigin(req)}/auth/google/callback`,
        grant_type: "authorization_code"
      });
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: params
      });
      const tokens = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokens.error_description || tokens.error || "OAuth failed");
      const accountTokens = {
        ...tokens,
        expires_at: Date.now() + (tokens.expires_in || 3600) * 1000
      };
      const profile = await gmailFetchWithToken(accountTokens.access_token, "/profile");
      const email = profile.emailAddress;
      state.google.accounts = {
        ...(state.google.accounts || {}),
        [email]: {
          email,
          tokens: accountTokens,
          connectedAt: new Date().toISOString()
        }
      };
      state.google.tokens = accountTokens;
      state.google.email = email;
      state.google.activeEmail = email;
      state.google.oauthState = null;
      await writeState(state);
      redirect(res, "/");
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/messages") {
      const query = url.searchParams.get("q") || "in:inbox newer_than:30d";
      const maxParam = url.searchParams.get("max") || "20";
      const max = maxParam === "all" ? "all" : Math.min(Number(maxParam || 20), 5000);
      const mode = url.searchParams.get("mode") || (max === "all" || Number(max) > 200 ? "metadata" : "full");
      const account = url.searchParams.get("account") || state.google.activeEmail || state.google.email;
      const messages =
        account === "all"
          ? await listMessagesAcrossAccounts(state, query, max, mode)
          : await listMessages(withActiveAccount(state, account), query, max, mode);
      sendJson(res, 200, { messages });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/messages/")) {
      const id = decodeURIComponent(url.pathname.split("/").pop());
      const account = url.searchParams.get("account") || state.google.activeEmail || state.google.email;
      const accountState = withActiveAccount(state, account);
      const full = await gmailFetch(accountState, `/messages/${id}?format=full`);
      sendJson(res, 200, { message: { ...summarizeMessage(full), accountEmail: account } });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/career/schedule") {
      const max = Math.min(Number(url.searchParams.get("max") || 120), 220);
      const account = url.searchParams.get("account") || "all";
      const query =
        url.searchParams.get("q") ||
        "newer_than:180d (採用 OR 新卒 OR 選考 OR 説明会 OR インターン OR 面接 OR 面談 OR 締切 OR 〆切 OR 適性検査 OR WEBテスト OR ウェブテスト OR エントリー OR 就活)";
      const messages =
        account === "all"
          ? await listMessagesAcrossAccounts(state, query, max)
          : await listMessages(withActiveAccount(state, account), query, max);
      sendJson(res, 200, { items: await extractCareerScheduleItems(state, messages), scanned: messages.length });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/digest") {
      const period = url.searchParams.get("period") || "week";
      const account = url.searchParams.get("account") || "all";
      const queryMap = {
        today: "newer_than:1d",
        week: "newer_than:7d",
        month: "newer_than:30d"
      };
      const query = queryMap[period] || queryMap.week;
      const max = Math.min(Number(url.searchParams.get("max") || 60), 100);
      const messages =
        account === "all"
          ? await listMessagesAcrossAccounts(state, query, max)
          : await listMessages(withActiveAccount(state, account), query, max);
      const important = messages
        .map((message) => ({ ...message, importance: importantScore(message) }))
        .filter((message) => message.importance > 0)
        .sort((a, b) => b.importance - a.importance || messageTime(b) - messageTime(a))
        .slice(0, 12);
      let digest = fallbackDigest(messages, period);
      if (configuredAI(state) && important.length) {
        digest = await chatComplete(
          state,
          [
            {
              role: "system",
              content:
                "あなたは就活と日常の重要メールを整理する秘書です。認証コード、広告、注文通知は原則省き、締切、説明会、面接、Webテスト、返信が必要なメールを優先して、日本語で短く要約してください。"
            },
            {
              role: "user",
              content: JSON.stringify(
                {
                  period,
                  emails: important.map((message) => ({
                    account: message.accountEmail,
                    from: message.from,
                    subject: message.subject,
                    date: message.date,
                    snippet: message.snippet,
                    body: (message.body || "").slice(0, 1600)
                  }))
                },
                null,
                2
              )
            }
          ],
          0.25
        );
      }
      sendJson(res, 200, { digest, messages: important, scanned: messages.length });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/reply") {
      const body = await parseBody(req);
      const message = body.message;
      const senderEmail = message?.from?.email?.toLowerCase();
      const sender = state.senders[senderEmail] || {
        name: message?.from?.name || "",
        relationship: "",
        tone: "自然な敬語",
        facts: "",
        avoid: ""
      };
      const reply = await generateReply({
        profile: state.profile,
        sender,
        message,
        instruction: body.instruction,
        state
      });
      sendJson(res, 200, { reply, sender });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/draft") {
      const body = await parseBody(req);
      const message = body.message;
      const raw = draftRaw({
        to: message.from.raw,
        cc: "",
        subject: message.subject || "",
        body: body.reply,
        inReplyTo: message.id
      });
      const draft = await gmailFetch(withActiveAccount(state, message.accountEmail || state.google.activeEmail), "/drafts", {
        method: "POST",
        body: JSON.stringify({
          message: {
            threadId: message.threadId,
            raw: encodeBase64Url(raw)
          }
        })
      });
      sendJson(res, 200, { draft });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/ai-command") {
      const { command } = await parseBody(req);
      if (!command) { sendJson(res, 400, { error: "コマンドを入力してください。" }); return; }
      const systemPrompt = `あなたはEmailAIアプリのコマンドインタープリターです。ユーザーの日本語コマンドを解析し、以下のJSON形式のみで返してください。マークダウンや説明文は不要です。

利用可能なアクション:
- { "action": "switch-tab", "tab": "inbox|starred|sent|drafts|important|unread|action|housing|career", "message": "説明" }
- { "action": "switch-filter", "filter": "all|action|notice|skip", "message": "説明" }
- { "action": "switch-ai", "provider": "gemini|anthropic|openai|grok", "message": "説明" }
- { "action": "set-max", "max": "10|20|50|500|year|all", "message": "説明" }
- { "action": "open-setup", "message": "説明" }
- { "action": "sync", "message": "説明" }
- { "action": "reply", "message": "できない・不明な場合の説明（100字以内）" }

タブ名対応: 受信=inbox, スター=starred, 送信済み=sent, 下書き=drafts, 最重要=important, 未読=unread, 要対応=action, 住まい=housing, 就活=career
フィルター: すべて=all, 返信/対応=action, 確認=notice, 通知=skip
AIプロバイダー: Gemini=gemini, Anthropic/Claude=anthropic, OpenAI/GPT=openai, Grok=grok`;
      let result = null;
      try {
        const answer = await chatComplete(state, [
          { role: "system", content: systemPrompt },
          { role: "user", content: command }
        ], 0.1);
        const text = (answer || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
        result = JSON.parse(text);
      } catch {}
      if (!result) result = fallbackCommandParse(command);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/send") {
      const body = await parseBody(req);
      const message = body.message;
      const raw = draftRaw({
        to: message.from.raw,
        cc: "",
        subject: message.subject || "",
        body: body.reply,
        inReplyTo: message.id
      });
      const sent = await gmailFetch(
        withActiveAccount(state, message.accountEmail || state.google.activeEmail),
        "/messages/send",
        {
          method: "POST",
          body: JSON.stringify({ threadId: message.threadId, raw: encodeBase64Url(raw) })
        }
      );
      sendJson(res, 200, { sent });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/jobs") {
      const data = await readJobsData();
      sendJson(res, 200, data);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs") {
      const body = await parseBody(req);
      await writeJobsData({ companies: body.companies || [], schedules: body.schedules || [] });
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/es-review") {
      const { companyName, question, answer, userProfile } = await parseBody(req);
      if (!companyName || !question || !answer) { sendJson(res, 400, { error: "企業名・設問・回答を入力してください。" }); return; }
      const profileCtx = buildProfileContext(userProfile);
      const system = `あなたは${companyName}の人事採用担当です。エントリーシートの書類選考を行います。

まず${companyName}の企業理念・価値観・求める人材像をあなたの知識で整理し、そのペルソナに基づいてESを評価・添削してください。

【評価観点】
1. 企業との適合性（カルチャーフィット）
2. 自己分析の深さと具体性
3. 論理構成（結論→根拠→具体例）
4. 表現力・語彙の適切さ
5. 独自性・インパクト

【出力形式（マークダウン）】
## ${companyName}について（求める人材像）
（企業の特徴と求める人物像を2〜3行で）

## 評価
**良かった点**
- （2〜3点、具体的に）

**改善が必要な点**
- （2〜3点、具体的に）

## 添削後の例文
（改善版の回答例を提示）

## 総評
（100字程度の総合コメント）`;
      const review = await jobsAiChat(state, system, `【設問】${question}\n\n【回答】\n${answer}${profileCtx}`);
      sendJson(res, 200, { review });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/webtest") {
      const { companyName } = await parseBody(req);
      if (!companyName) { sendJson(res, 400, { error: "企業名を入力してください。" }); return; }
      const system = "あなたは就職活動の専門家です。企業のWEBテスト（適性検査）に関する詳しい情報を提供します。";
      const user = `${companyName}のWEBテストについてマークダウンで以下の形式で教えてください：

## ${companyName}のWEBテスト情報

### テスト種類
（例: SPI3テストセンター形式、TG-WEB、GAB、CUBIC など）

### 出題科目・内容
（言語・非言語・構造的把握力など）

### 受験形式
（テストセンター/自宅受験/会場）

### 難易度・特徴
（難しい科目、よく出るパターン）

### 対策方法
（おすすめの参考書・練習サイト）

### 注意事項
（制限時間・計算機可否など）

※不確かな情報は「要確認」と記載してください。`;
      const info = await jobsAiChat(state, system, user);
      sendJson(res, 200, { info });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/interview-tips") {
      const { companyName, interviewType } = await parseBody(req);
      if (!companyName) { sendJson(res, 400, { error: "企業名を入力してください。" }); return; }
      const system = "あなたは就職活動支援の専門家です。企業の面接情報と対策を詳しく提供します。";
      const user = `${companyName}の${interviewType || "面接"}についてマークダウンで以下の形式でまとめてください：

## ${companyName}の面接情報

### 面接の形式・雰囲気
（個人/グループ、雰囲気、面接官の特徴など）

### よく聞かれる質問（10問程度）
- （箇条書き）

### 企業が重視するポイント
（この企業特有の評価基準）

### 逆質問のコツ
（おすすめの逆質問例）

### 対策のポイント
（この企業の面接を通過するための具体的アドバイス）

※体験談・レビューサイトの情報を参考にした推測を含みます。`;
      const tips = await jobsAiChat(state, system, user);
      sendJson(res, 200, { tips });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/interview-feedback") {
      const { companyName, interviewType, experience, questionsAsked } = await parseBody(req);
      if (!experience) { sendJson(res, 400, { error: "面接体験を入力してください。" }); return; }
      const system = "あなたは就職活動のプロコーチです。面接体験を分析し、具体的なフィードバックを提供します。";
      const user = `以下の面接体験についてマークダウンでフィードバックしてください。

【企業】${companyName || "不明"}　【種別】${interviewType || "面接"}
【聞かれた質問】${questionsAsked || "（記載なし）"}
【体験・感想】${experience}

## 面接体験のフィードバック

### 良かった点
- （2〜3点）

### 改善できる点
- （2〜3点）

### 次の面接に向けたアドバイス
（具体的な行動提案）

### 主要な質問への回答改善案
（主要な質問についての改善アドバイス）

### 総評
（100字程度）`;
      const feedback = await jobsAiChat(state, system, user);
      sendJson(res, 200, { feedback });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/es-advice") {
      const { companyName, question, userProfile } = await parseBody(req);
      if (!companyName || !question) { sendJson(res, 400, { error: "企業名と設問を入力してください。" }); return; }
      const profileCtx = buildProfileContext(userProfile);
      const system = `あなたは${companyName}の人事採用担当です。ESの設問に対して、応募者が回答を作成するためのアドバイスを提供します。応募者のプロフィール情報がある場合はそれを踏まえた具体的なアドバイスをしてください。`;
      const user = `【企業】${companyName}
【設問】${question}${profileCtx}

以下の観点でアドバイスをマークダウンで提供してください：

## 回答のアプローチ
（この設問で企業が見たいこと、どう答えれば好印象か）

## 構成の提案
1. （結論）
2. （根拠・エピソード）
3. （学び・成長）
4. （企業への応用）

## 避けるべき表現・内容
- （NG例）

## 参考例文（100字程度）
${profileCtx ? "（応募者のプロフィールを活かした書き出し例）" : "（書き出しの例）"}`;
      const advice = await jobsAiChat(state, system, user);
      sendJson(res, 200, { advice });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/es-strategy") {
      const { companyName, esEntries, userProfile } = await parseBody(req);
      if (!companyName) { sendJson(res, 400, { error: "企業名を入力してください。" }); return; }
      const questionsStr = (esEntries || []).map(e => `- ${e.question}`).join("\n") || "（設問未登録）";
      const profileCtx = buildProfileContext(userProfile);
      const system = "あなたは就職活動の専門家です。企業のES（エントリーシート）対策に関する詳しい情報を提供します。応募者のプロフィールがある場合は、その人に合った具体的なアドバイスをしてください。";
      const user = `${companyName}のES対策についてマークダウンで以下の形式で教えてください：

【登録されている設問】
${questionsStr}${profileCtx}

## ${companyName}のES対策

### 企業の求める人物像
（${companyName}がESで重視するポイント）

### よく出るES設問
- （例年の傾向）

### 文章を書くときのポイント
- （この企業特有のアドバイス）

### 通過率を上げるコツ
${profileCtx ? "（上記応募者のプロフィールを踏まえた差別化ポイント）" : "（差別化のポイント）"}

### 注意事項
（字数制限、書式など）

※不確かな情報は「要確認」と記載してください。`;
      const strategy = await jobsAiChat(state, system, user);
      sendJson(res, 200, { strategy });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/iv-review") {
      const { companyName, interviewType, question, answer, userProfile } = await parseBody(req);
      if (!question || !answer) { sendJson(res, 400, { error: "設問と回答を入力してください。" }); return; }
      const profileCtx = buildProfileContext(userProfile);
      const system = `あなたは${companyName || "企業"}の面接官です。面接の回答を添削します。${profileCtx ? "応募者のプロフィールを参考に、その人の経験を活かした具体的なフィードバックをしてください。" : ""}`;
      const user = `【企業】${companyName || "不明"}　【面接種別】${interviewType || "面接"}
【設問】${question}
【回答】${answer}${profileCtx}

以下の観点でマークダウンで添削してください：

## 評価
**良かった点**
- （2〜3点）

**改善が必要な点**
- （2〜3点）

## 改善案
${profileCtx ? "（応募者のプロフィールを活かした、より良い回答例）" : "（より良い回答例）"}

## 総評
（80字程度）`;
      const review = await jobsAiChat(state, system, user);
      sendJson(res, 200, { review });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/iv-advice") {
      const { companyName, interviewType, question, userProfile } = await parseBody(req);
      if (!question) { sendJson(res, 400, { error: "設問を入力してください。" }); return; }
      const profileCtx = buildProfileContext(userProfile);
      const system = `あなたは就職活動の専門家です。面接の設問に対する回答のアドバイスを提供します。応募者のプロフィールがある場合は、その人の実際の経験・強みを使った具体的なアドバイスをしてください。`;
      const user = `【企業】${companyName || "不明"}　【面接種別】${interviewType || "面接"}
【設問】${question}${profileCtx}

この設問への回答アドバイスをマークダウンで提供してください：

## この設問の意図
（面接官が何を見たいか）

## 回答の構成
1. （結論・主張）
2. （根拠・エピソード）
3. （学び・成果）
4. （入社後への展開）

## 効果的なポイント
${profileCtx ? "（応募者のプロフィールを活かした具体的なアドバイス）" : "- （具体的なアドバイス）"}

## 回答例（120字程度）
${profileCtx ? "（応募者のガクチカ・自己PRを踏まえた書き出し例）" : "（参考になる書き出し）"}`;
      const advice = await jobsAiChat(state, system, user);
      sendJson(res, 200, { advice });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/iv-strategy") {
      const { companyName, userProfile } = await parseBody(req);
      if (!companyName) { sendJson(res, 400, { error: "企業名を入力してください。" }); return; }
      const profileCtx = buildProfileContext(userProfile);
      const system = "あなたは就職活動支援の専門家です。企業の面接情報と対策を詳しく提供します。応募者のプロフィールがある場合は、その人に合った個別の対策を含めてください。";
      const user = `${companyName}の面接対策についてマークダウンで以下の形式でまとめてください：${profileCtx}

## ${companyName}の面接対策情報

### 面接の形式・雰囲気
（個人/グループ、雰囲気、面接官の特徴など）

### よく聞かれる質問（10問程度）
- （箇条書き）

### 企業が重視するポイント
（この企業特有の評価基準）

### 逆質問のコツ
（おすすめの逆質問例）

### 対策のポイント
${profileCtx ? "（上記応募者のプロフィールを踏まえた、この企業の面接を通過するための具体的アドバイス）" : "（この企業の面接を通過するための具体的アドバイス）"}

※体験談・レビューサイトの情報を参考にした推測を含みます。`;
      const strategy = await jobsAiChat(state, system, user);
      sendJson(res, 200, { strategy });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/generate-email") {
      const { companyName, industry, selectionType, emailType, selfPr, status, userProfile } = await parseBody(req);
      if (!companyName) { sendJson(res, 400, { error: "企業名を入力してください。" }); return; }
      const profileCtx = buildProfileContext(userProfile);
      const effectiveSelfPr = selfPr || userProfile?.selfPr || "";
      const system = "あなたは就職活動の文章作成のプロです。採用担当者に好印象を与える、礼儀正しく熱意が伝わるメールを作成します。";
      const user = `以下の情報をもとに、${emailType || "応募"}メールを作成してください。

【企業名】${companyName}
【業界】${industry || "不明"}
【選考タイプ】${selectionType || "インターン"}
【メール種別】${emailType || "応募"}メール
【自己PR/アピールポイント】${effectiveSelfPr || "（未記載）"}${profileCtx}

件名も含めて、実際に送れる完成形のメールを作成してください。
・丁寧で簡潔な文体
・${companyName}への具体的な関心を盛り込む
・件名: 〇〇（適切な件名）
・本文: 書き出し〜締めまで完全に`;
      const email = await jobsAiChat(state, system, user);
      sendJson(res, 200, { email });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/scan-job") {
      const { companyName, jobUrl, jobText, userProfile } = await parseBody(req);
      if (!jobUrl && !jobText) { sendJson(res, 400, { error: "URLまたはテキストを入力してください。" }); return; }
      const profileCtx = buildProfileContext(userProfile);
      const system = "あなたは就職活動の情報分析の専門家です。求人情報から重要な情報を正確に抽出します。応募者のプロフィールがある場合は、その人との相性・アピールポイントも分析してください。";
      let content = jobText || "";
      if (jobUrl && !content) {
        try {
          const r = await fetch(jobUrl, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(8000) });
          const html = await r.text();
          content = html.replace(/<[^>]+>/g, " ").replace(/\s{2,}/g, " ").slice(0, 3000);
        } catch { content = `URL: ${jobUrl}`; }
      }
      const user = `以下の求人情報を分析してください。
企業名: ${companyName || "不明"}
内容: ${content.slice(0, 2500)}${profileCtx}

## 求人情報分析

### 企業情報
（企業の特徴・事業内容）

### 求める人物像
（必須スキル・歓迎スキル・性格・経験）

### 仕事内容・配属
（インターン/選考内容の詳細）

### 選考プロセス
（応募→内定までのステップ）

### アピールすべきポイント
${profileCtx ? "（上記応募者のプロフィールを踏まえた、この企業への応募で特に強調すべき点）" : "（この企業への応募で特に強調すべき点）"}`;
      const result = await jobsAiChat(state, system, user);
      sendJson(res, 200, { result });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/optimize-selfpr") {
      const { companyName, industry, selectionType, basePr, esEntries, userProfile } = await parseBody(req);
      const effectiveBasePr = basePr || userProfile?.selfPr || "";
      if (!companyName || !effectiveBasePr) { sendJson(res, 400, { error: "企業名と自己PRを入力してください。" }); return; }
      const esInfo = (esEntries || []).filter(e => e.answer).map(e => `Q: ${e.question}\nA: ${e.answer}`).join("\n\n");
      const profileCtx = buildProfileContext(userProfile);
      const system = `あなたは${companyName}の人事採用担当AIです。${companyName}の企業理念・価値観・求める人材像をもとに、応募者の自己PRを最適化します。`;
      const user = `【企業】${companyName}（${industry || "業界不明"}）【選考タイプ】${selectionType || "インターン"}

【ベース自己PR】
${effectiveBasePr}

${esInfo ? `【ESの回答（参考）】\n${esInfo}` : ""}${profileCtx}

以下の観点で最適化した自己PRを作成してください：
1. ${companyName}の企業理念・求める人物像との整合性を高める
2. 具体的なエピソードと数値を盛り込む
3. 企業への志望意欲を自然に織り込む
4. 200〜400字程度の最適化バージョンを提示
5. 改善ポイントの解説も付ける

## 最適化された自己PR（そのまま使える版）
（最適化後のテキスト）

## 改善ポイント
- （何をどう変えたか）`;
      const optimized = await jobsAiChat(state, system, user);
      sendJson(res, 200, { optimized });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/gap-analysis") {
      const { companyName, industry, selectionType, esEntries, selfPr, notes, userProfile } = await parseBody(req);
      if (!companyName) { sendJson(res, 400, { error: "企業名を入力してください。" }); return; }
      const esInfo = (esEntries || []).filter(e => e.question).map(e => `Q: ${e.question}\nA: ${e.answer || "（未回答）"}`).join("\n\n");
      const effectiveSelfPr = selfPr || userProfile?.selfPr || "";
      const effectiveGakuchika = userProfile?.gakuchika || "";
      const system = `あなたは${companyName}の人事採用担当AIです。企業が求めるものと応募者が持っているものを比較し、ギャップを明確に分析します。`;
      const user = `【企業】${companyName}（${industry || ""}）【選考タイプ】${selectionType || "インターン"}

【応募者の現状】
自己PR: ${effectiveSelfPr || "（未記載）"}
ガクチカ: ${effectiveGakuchika || "（未記載）"}
志望動機の軸: ${userProfile?.motivation || "（未記載）"}
スキル・資格: ${userProfile?.skills || "（未記載）"}
メモ・志望動機: ${notes || "（未記載）"}
ESの内容:
${esInfo || "（未記載）"}

## ギャップ分析

### 企業が求めるもの（${companyName}の求める人物像）
- （3〜5点）

### あなたが持っているもの（現状の強み）
- （記載内容から判断）

### ギャップ（補強が必要な点）
- （具体的に）

### 今すぐできる対策
1. （優先順位付きで3〜5項目）

### 面接・ESで強調すべきポイント
（この企業に対して特にアピールすべき内容）`;
      const analysis = await jobsAiChat(state, system, user);
      sendJson(res, 200, { analysis });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/mock-interview-start") {
      const { companyName, interviewType, userProfile } = await parseBody(req);
      if (!companyName) { sendJson(res, 400, { error: "企業名を入力してください。" }); return; }
      const profileCtx = buildProfileContext(userProfile);
      const system = `あなたは${companyName}の面接官です。${companyName}の企業理念と求める人物像を踏まえて面接を行います。${profileCtx ? "応募者のプロフィールを参考にして、その人に合った質問をしてください。" : ""}`;
      const user = `${companyName}の${interviewType || "一次面接"}として最初の質問を1つだけ考えてください。
また、この面接の評価基準・コンテキストを簡潔にまとめてください。${profileCtx}

出力形式（JSON）:
{
  "question": "面接の最初の質問（自己紹介を含む自然な導入）",
  "context": "この面接の評価基準・重視するポイント（100字以内）"
}

JSONのみを返してください。`;
      const raw = await jobsAiChat(state, system, user);
      let question = "自己紹介をお願いします。";
      let context = "";
      try {
        const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
        question = parsed.question || question;
        context = parsed.context || "";
      } catch { question = raw.split("\n")[0].replace(/^["{\s]*"question"\s*:\s*"?/, "").replace(/"?\s*[,}].*/, "").trim() || question; }
      sendJson(res, 200, { question, context });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/mock-interview-next") {
      const { companyName, interviewType, question, answer, history, context, userProfile } = await parseBody(req);
      if (!question || !answer) { sendJson(res, 400, { error: "質問と回答を入力してください。" }); return; }
      const profileCtx = buildProfileContext(userProfile);
      const system = `あなたは${companyName}の面接官です。評価基準: ${context || "企業理念に基づく評価"}${profileCtx ? "\n" + profileCtx : ""}`;
      const histStr = (history || []).map(h => `Q: ${h.q}\nA: ${h.a}`).join("\n\n");
      const user = `面接の流れ:
${histStr ? histStr + "\n\n" : ""}Q: ${question}
A: ${answer}

上記の回答に対して：
1. 簡潔なフィードバック（良い点・改善点、100字以内）
2. 次の質問（前の回答を踏まえた自然な質問）

出力形式（JSON）:
{
  "feedback": "フィードバック（100字以内）",
  "nextQuestion": "次の質問"
}

JSONのみを返してください。`;
      const raw = await jobsAiChat(state, system, user);
      let feedback = "";
      let nextQuestion = "他に自己PRはありますか？";
      try {
        const parsed = JSON.parse(raw.replace(/```json\n?|\n?```/g, "").trim());
        feedback = parsed.feedback || "";
        nextQuestion = parsed.nextQuestion || nextQuestion;
      } catch { nextQuestion = raw.split("\n").find(l => l.includes("?") || l.includes("？")) || nextQuestion; }
      sendJson(res, 200, { feedback, nextQuestion });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/jobs/ai/analysis") {
      const { companies, schedules } = await parseBody(req);
      const byStatus = {};
      (companies || []).forEach((c) => { byStatus[c.status] = (byStatus[c.status] || 0) + 1; });
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = (schedules || []).filter((s) => s.date >= today).length;
      const system = "あなたは就職活動のプロコーチです。就活データを分析し、具体的なアドバイスを提供します。";
      const user = `以下の就活データを分析してマークダウンでフィードバックしてください。

【登録企業数】${(companies || []).length}社
【ステータス別】${JSON.stringify(byStatus)}
【今後の予定】${upcoming}件
【企業一覧】${(companies || []).map((c) => `${c.name}(${c.status})`).join("、")}

## 就活進捗分析

### 現在の状況
（客観的な進捗サマリー）

### 強み・うまくいっている点
- （具体的に）

### 課題・改善が必要な点
- （具体的に）

### 今週やるべきこと
1. （優先順位付きで3〜5項目）

### 長期的な戦略アドバイス
（就活全体の戦略）`;
      const analysis = await jobsAiChat(state, system, user);
      sendJson(res, 200, { analysis });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/quiz/answer") {
      const { question, type, imageBase64, imageMimeType, images, noExplanation } = await parseBody(req);
      const hasImage = imageBase64 || (Array.isArray(images) && images.length > 0);
      if (!question && !hasImage) { sendJson(res, 400, { error: "問題文または画像を入力してください。" }); return; }
      if (!configuredAI(state)) {
        const err = new Error("AIサービスが設定されていません。設定からAPIキーを入力してください。");
        err.status = 400;
        throw err;
      }
      const typeDescriptions = {
        verbal: "言語（国語・読解・語彙・文章整序など）",
        nonverbal: "非言語（数学・計算・推論・図形・場合の数など）",
        english: "英語（読解・文法・語彙など）",
        personality: "性格検査（傾向の説明と一般的な回答のポイント）",
        other: "その他の適性検査"
      };
      const typeHint = typeDescriptions[type] || "言語・非言語・英語など各種Webテスト問題";
      const answerFormat = noExplanation
        ? `【回答の形式】
問題が複数ある場合は「**第1問:** A」「**第2問:** C」のように問題ごとに1行で答える。
問題が1問だけの場合は正解（選択肢記号または答え）を1〜2行で簡潔に答えるだけ。解説不要。`
        : `【回答の形式】
問題が複数ある場合は「## 第1問」「## 第2問」のように問題ごとにセクションを分けて答える。
問題が1問だけの場合:
1. まず「## 解答」として正解（選択肢記号または答え）を明示する
2. 「## 解説」として解き方・考え方を段階的に説明する
3. 「## ポイント」として類題で使えるコツや公式を簡潔にまとめる

解答は必ず根拠とともに示し、受験者が理解できるよう丁寧に説明してください。
計算問題は途中の計算過程も示してください。
選択肢がある場合は、各選択肢が正しい/誤りの理由も説明してください。`;
      const system = `あなたはSPI・TG-WEB・GABなど日本のWebテスト（適性検査）の専門家です。
受験者から問題が送られてきたら、正確な解答${noExplanation ? "" : "と丁寧な解説"}を提供してください。

【対応する問題タイプ】${typeHint}

${answerFormat}`;

      let answer;
      if (hasImage) {
        // 複数画像対応: imagesが配列ならそのまま、旧形式の単一imageBase64にも対応
        const imgList = Array.isArray(images) && images.length
          ? images.map(img => ({ base64: img.base64, mime: img.mime || "image/png" }))
          : [{ base64: imageBase64, mime: imageMimeType || "image/png" }];
        const userText = question || "画像の問題をすべて読み取り、各問の正解を示してください。";
        answer = await quizAiWithImages(state, system, userText, imgList);
      } else {
        answer = await jobsAiChat(state, system, question);
      }
      sendJson(res, 200, { answer });
      return;
    }

    if (req.method === "GET") {
      const pathname = url.pathname === "/" ? "/index.html"
        : (url.pathname === "/jobs" || url.pathname === "/jobs/") ? "/jobs/index.html"
        : (url.pathname === "/quiz" || url.pathname === "/quiz/") ? "/quiz/index.html"
        : url.pathname;
      const safePath = path.normalize(path.join(publicDir, pathname));
      if (!safePath.startsWith(publicDir)) {
        sendText(res, 403, "Forbidden");
        return;
      }
      const file = await fs.readFile(safePath);
      const type = safePath.endsWith(".css")
        ? "text/css; charset=utf-8"
        : safePath.endsWith(".js")
          ? "text/javascript; charset=utf-8"
          : safePath.endsWith(".webmanifest")
            ? "application/manifest+json; charset=utf-8"
            : safePath.endsWith(".svg")
              ? "image/svg+xml; charset=utf-8"
              : "text/html; charset=utf-8";
      sendText(res, 200, file, type);
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    sendJson(res, error.status || 500, { error: error.message || String(error) });
  }
}

http.createServer(route).listen(port, host, () => {
  console.log(`Email AI Gmail is running at http://localhost:${port}`);
});
