function buildConfig() {
  return {
    geminiApiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || "gemini-3.5-flash",
    geminiFallbackModel: process.env.GEMINI_FALLBACK_MODEL || "gemini-3.1-flash-lite",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    anthropicModel: process.env.ANTHROPIC_MODEL || "claude-opus-4-5",
    openAiKey: process.env.OPENAI_API_KEY,
    openAiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",
    grokApiKey: process.env.GROK_API_KEY || process.env.XAI_API_KEY,
    grokModel: process.env.GROK_MODEL || process.env.XAI_MODEL || "grok-4",
  };
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

async function callGeminiApi(key, model, reqBody) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(reqBody) }
  );
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}

async function tryProviderChat(provider, config, messages, temperature) {
  switch (provider) {
    case "gemini": {
      if (!config.geminiApiKey) return null;
      const system = messages.find((m) => m.role === "system")?.content || "";
      const contents = messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
      const reqBody = {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents,
        generationConfig: { temperature, maxOutputTokens: 4096 },
      };
      let { ok, status, body } = await callGeminiApi(config.geminiApiKey, config.geminiModel, reqBody);
      if (!ok && config.geminiFallbackModel !== config.geminiModel) {
        console.log(`Gemini ${config.geminiModel} failed (${status}), trying fallback ${config.geminiFallbackModel}`);
        ({ ok, body } = await callGeminiApi(config.geminiApiKey, config.geminiFallbackModel, reqBody));
      }
      return ok ? (body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "") : null;
    }
    case "anthropic": {
      if (!config.anthropicApiKey) return null;
      const system = messages.find((m) => m.role === "system")?.content || "";
      const filtered = messages.filter((m) => m.role !== "system");
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": config.anthropicApiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: config.anthropicModel,
          max_tokens: 4096,
          ...(system ? { system } : {}),
          messages: filtered,
        }),
      });
      const body = await response.json();
      return response.ok ? (body.content?.[0]?.text?.trim() || "") : null;
    }
    case "openai": {
      if (!config.openAiKey) return null;
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${config.openAiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: config.openAiModel, messages, temperature }),
      });
      const body = await response.json();
      return response.ok ? (body.choices?.[0]?.message?.content?.trim() || "") : null;
    }
    case "grok": {
      if (!config.grokApiKey) return null;
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${config.grokApiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: config.grokModel, messages, temperature }),
      });
      const body = await response.json();
      return response.ok ? (body.choices?.[0]?.message?.content?.trim() || "") : null;
    }
    default:
      return null;
  }
}

async function jobsAiChat(config, systemPrompt, userContent) {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userContent },
  ];
  const providerOrder = ["gemini", "anthropic", "openai", "grok"];
  for (const provider of providerOrder) {
    try {
      const result = await tryProviderChat(provider, config, messages, 0.7);
      if (result !== null) return result;
    } catch {}
  }
  const err = new Error("AIサービスが設定されていません。設定からAPIキーを入力してください。");
  err.status = 400;
  throw err;
}

module.exports = { buildConfig, buildProfileContext, callGeminiApi, tryProviderChat, jobsAiChat };
