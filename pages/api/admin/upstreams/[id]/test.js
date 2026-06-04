import { requireAdmin } from "@/lib/admin-auth";
import { testUpstreamConnection, writeAdminAuditLog } from "@/lib/admin-commercial-config";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });

  try {
    const result = await testUpstreamConnection(req.query.id);
    await writeAdminAuditLog({
      adminId: admin.id || admin.email || "admin",
      action: "test_upstream",
      targetType: "upstream",
      targetId: req.query.id,
      syncResult: result,
    });
    return res.status(result.ok ? 200 : 502).json(result);
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || "测试连接失败" });
  }
}
