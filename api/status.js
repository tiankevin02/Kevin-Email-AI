const { buildConfig } = require("./_lib/ai.js");

module.exports = function handler(req, res) {
  const cfg = buildConfig();
  res.status(200).json({
    ok: true,
    ai: {
      gemini: !!cfg.geminiApiKey,
      anthropic: !!cfg.anthropicApiKey,
      openai: !!cfg.openAiKey,
      grok: !!cfg.grokApiKey,
    },
    storage: !!process.env.UPSTASH_REDIS_REST_URL,
  });
};
