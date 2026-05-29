const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY         = "jobs-data";

function fetchWithTimeout(url, opts, ms = 8000) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

async function getData() {
  if (!REDIS_URL || !REDIS_TOKEN) return { companies: [], schedules: [], profile: {}, updatedAt: 0 };
  try {
    const res  = await fetchWithTimeout(`${REDIS_URL}/get/${KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await res.json();
    if (!json.result) return { companies: [], schedules: [], profile: {}, updatedAt: 0 };
    return JSON.parse(json.result);
  } catch {
    return { companies: [], schedules: [], profile: {}, updatedAt: 0 };
  }
}

async function setData(data) {
  if (!REDIS_URL || !REDIS_TOKEN) return false;
  try {
    await fetchWithTimeout(`${REDIS_URL}/set/${KEY}`, {
      method:  "POST",
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, "Content-Type": "application/json" },
      body:    JSON.stringify([JSON.stringify(data)]),
    });
    return true;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  try {
    if (req.method === "GET") {
      const data = await getData();
      return res.status(200).json(data);
    }
    if (req.method === "POST") {
      const body = req.body || {};
      await setData({
        companies: body.companies || [],
        schedules: body.schedules || [],
        profile:   body.profile   || {},
        updatedAt: body.updatedAt || Date.now(),
      });
      return res.status(200).json({ ok: true });
    }
    return res.status(405).json({ error: "Method not allowed" });
  } catch (e) {
    return res.status(500).json({ error: e.message || "Internal error" });
  }
}
