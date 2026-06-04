import { requireAdmin } from "@/lib/admin-auth";
import { runMaintenanceTask } from "@/lib/team-token-pool";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    return res.status(200).json({ ok: true, ...(await runMaintenanceTask(String(req.query.key || ""), admin.id)) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message || "维护任务执行失败" });
  }
}
