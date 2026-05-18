import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const serverPath = path.join(rootDir, "server.mjs");
let source = await fs.readFile(serverPath, "utf8");

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

  if (!source.includes("function sendJson")) {
    throw new Error("server.mjsに復元用ヘルパーを差し込めませんでした。");
  }
  if (!source.includes('    if (req.method === "POST" && url.pathname === "/api/config") {')) {
    throw new Error("server.mjsに復元用APIを差し込めませんでした。");
  }

  source = source.replace("\nfunction sendJson", `\n${helpers}function sendJson`);
  source = source.replace(
    '    if (req.method === "POST" && url.pathname === "/api/config") {',
    `${routes}    if (req.method === "POST" && url.pathname === "/api/config") {`
  );

  await fs.writeFile(serverPath, source);
  console.log("Gmail session restore endpoints installed.");
}
