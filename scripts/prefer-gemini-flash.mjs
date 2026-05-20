import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../server.mjs", import.meta.url);
let source = readFileSync(file, "utf8");
let changed = false;

function replaceAll(from, to) {
  if (!source.includes(from)) return;
  source = source.split(from).join(to);
  changed = true;
}

replaceAll('geminiModel: "gemini-2.5-flash"', 'geminiModel: "gemini-3-flash-preview"');
replaceAll('state.config.geminiModel || "gemini-2.5-flash"', 'state.config.geminiModel || "gemini-3-flash-preview"');
replaceAll('body.geminiModel || state.config.geminiModel || "gemini-2.5-flash"', 'body.geminiModel || state.config.geminiModel || "gemini-3-flash-preview"');

if (!source.includes("function geminiModelFallbacks")) {
  const marker = `function grokConfig(state) {`;
  const helper = `function geminiModelFallbacks(config) {
  const preferredModel = /pro/i.test(config.model || "") ? "gemini-3-flash-preview" : config.model;
  const envFallbacks = String(env.GEMINI_FALLBACK_MODEL || "")
    .split(",")
    .map((model) => model.trim())
    .filter(Boolean);
  return [
    preferredModel,
    ...envFallbacks,
    "gemini-2.5-flash"
  ]
    .map((model) => (/pro/i.test(model) ? "gemini-3-flash-preview" : model))
    .filter((model, index, all) => model && all.indexOf(model) === index);
}

`;
  if (source.includes(marker)) {
    source = source.replace(marker, helper + marker);
    changed = true;
  }
}

const textGeminiFetch = `      const response = await fetch(
        \`https://generativelanguage.googleapis.com/v1beta/models/\${config.model}:generateContent?key=\${config.key}\`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
            contents,
            generationConfig: { temperature, maxOutputTokens: 4096 }
          })
        }
      );
      const body = await response.json();
      return response.ok ? (body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "") : null;`;

const textGeminiFallback = `      for (const model of geminiModelFallbacks(config)) {
        const response = await fetch(
          \`https://generativelanguage.googleapis.com/v1beta/models/\${model}:generateContent?key=\${config.key}\`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
              contents,
              generationConfig: { temperature, maxOutputTokens: 4096 }
            })
          }
        );
        const body = await response.json();
        if (response.ok) return body.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
      }
      return null;`;

replaceAll(textGeminiFetch, textGeminiFallback);

if (changed) {
  writeFileSync(file, source);
  console.log("Gemini fallback order: GEMINI_MODEL -> GEMINI_FALLBACK_MODEL -> gemini-2.5-flash");
}
