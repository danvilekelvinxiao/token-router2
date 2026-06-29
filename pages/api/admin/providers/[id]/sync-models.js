import { requireAdmin } from "@/lib/admin-auth";
import { syncProviderModels } from "@/lib/provider-store";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "请求方法不支持" });
  try {
    const result = await syncProviderModels(req.query.id);
    return res.status(200).json({ ok: true, message: `已同步 ${result.count || 0} 个模型`, data: result, result });
  } catch (err) {
    return res.status(400).json({ ok: false, code: "PROVIDER_SYNC_MODELS_FAILED", message: err.message || "同步模型失败" });
  }
}
