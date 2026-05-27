import { getJobsData, setJobsData } from "../_lib/storage.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "GET") {
    const data = await getJobsData();
    res.status(200).json(data);
  } else if (req.method === "POST") {
    const body = req.body;
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
}

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };
