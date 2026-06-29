import { requireAdmin, requireCron } from "@/lib/admin-auth";
import { getPoolStatusHealth, refreshPoolStatus } from "@/lib/pool-status";

export const config = {
  api: {
    responseLimit: false,
  },
  maxDuration: 120,
};

export default async function handler(req, res) {
  const auth = req.headers["x-flowapi-cron-secret"]
    ? requireCron(req, res)
    : await requireAdmin(req, res);
  if (!auth) return;

  try {
    if (req.method === "POST") {
      const data = await refreshPoolStatus({ runChecks: req.body?.runChecks !== false, adminId: auth.customer?.id || auth.id || "cron" });
      return res.status(200).json({ success: true, refreshed: true, status: data.status, statusLabel: data.statusLabel, generatedAt: data.generatedAt, summary: data.summary, cache: data.cache });
    }

    if (req.method === "GET") {
      const data = await getPoolStatusHealth();
      return res.status(data.ok ? 200 : 503).json(data);
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  } catch (error) {
    return res.status(500).json({ success: false, ok: false, error: error.message || "号池健康状态读取失败" });
  }
}
