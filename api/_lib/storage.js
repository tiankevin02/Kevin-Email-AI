const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = "jobs-data";

const DEFAULT_DATA = { companies: [], schedules: [], profile: {}, updatedAt: 0 };

export async function getJobsData() {
  if (!REDIS_URL || !REDIS_TOKEN) return { ...DEFAULT_DATA };
  try {
    const res = await fetch(`${REDIS_URL}/get/${KEY}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    });
    const json = await res.json();
    if (!json.result) return { ...DEFAULT_DATA };
    return JSON.parse(json.result);
  } catch {
    return { ...DEFAULT_DATA };
  }
}

export async function setJobsData(data) {
  if (!REDIS_URL || !REDIS_TOKEN) return;
  try {
    await fetch(`${REDIS_URL}/set/${KEY}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([JSON.stringify(data)]),
    });
  } catch {
    // silently fail
  }
}
