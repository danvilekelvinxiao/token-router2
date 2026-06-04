import { requireAdmin } from "@/lib/admin-auth";
import { syncUpstreamModels, writeAdminAuditLog } from "@/lib/admin-commercial-config";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const models = await syncUpstreamModels(req.query.id);
    const result = { ok: true, total: models.length, models };
    await writeAdminAuditLog({
      adminId: admin.id || admin.email || "admin",
      action: "sync_upstream_models",
      targetType: "upstream",
      targetId: req.query.id,
      syncResult: { total: models.length },
    });
    return res.status(200).json(result);
  } catch (error) {
    return res.status(502).json({ ok: false, error: error.message || "自动拉取模型失败" });
  }
}
