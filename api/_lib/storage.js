const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY         = "jobs-data";

function fetchWithTimeout(url, opts, ms = 8000) {
  const ctrl = new AbortController();
  const id   = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...opts, signal: ctrl.signal }).finally(() => clearTimeout(id));
}

async function getJobsData() {
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

async function setJobsData(data) {
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

module.exports = { getJobsData, setJobsData };
