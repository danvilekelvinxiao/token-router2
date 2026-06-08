import { requireAdmin, requireCron } from "@/lib/admin-auth";
import { listTokenPoolCheckLogs, runTokenPoolCheck } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = req.headers["x-flowapi-cron-secret"]
    ? requireCron(req, res)
    : await requireAdmin(req, res);
  if (!admin) return;
  try {
    if (req.method === "POST") return res.status(200).json({ ok: true, logs: await runTokenPoolCheck({ adminId: admin.id }) });
    if (req.method === "GET") return res.status(200).json({ ok: true, logs: await listTokenPoolCheckLogs({ limit: Number(req.query.limit || 100) }) });
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "Token 巡检失败" });
  }
}
