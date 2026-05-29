export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(200).end(); return; }

  if (req.method === "GET") {
    res.status(200).json({ companies: [], schedules: [], profile: {}, updatedAt: 0 });
    return;
  }

  if (req.method === "POST") {
    // TODO: Upstash storage
    res.status(200).json({ ok: true });
    return;
  }

  res.status(405).json({ error: "Method not allowed" });
}
