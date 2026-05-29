import { getJobsData, setJobsData } from "../_lib/storage.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  try {
    if (req.method === "GET") {
      const data = await getJobsData();
      res.status(200).json(data);
    } else if (req.method === "POST") {
      const body = req.body || {};
      await setJobsData({
        companies: body.companies || [],
        schedules: body.schedules || [],
        profile: body.profile || {},
        updatedAt: body.updatedAt || Date.now(),
      });
      res.status(200).json({ ok: true });
    } else {
      res.status(405).json({ error: "Method not allowed" });
    }
  } catch (e) {
    res.status(500).json({ error: e.message || "Internal server error" });
  }
}

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };
