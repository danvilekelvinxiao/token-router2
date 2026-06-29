import { requireAdmin } from "@/lib/admin-auth";
import { listProviderLogs } from "@/lib/provider-store";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "GET") return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "请求方法不支持" });
  try {
    const logs = await listProviderLogs({ providerId: req.query.id, limit: req.query.limit || 100 });
    return res.status(200).json({ ok: true, data: { logs }, logs });
  } catch (err) {
    return res.status(400).json({ ok: false, code: "PROVIDER_LOGS_FAILED", message: err.message || "日志读取失败" });
  }
}
