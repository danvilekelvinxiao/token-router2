import { requireAdmin } from "@/lib/admin-auth";
import { setProviderEnabled } from "@/lib/provider-store";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "请求方法不支持" });
  try {
    const provider = await setProviderEnabled(req.query.id, false);
    return res.status(200).json({ ok: true, message: "渠道已禁用", data: { provider }, provider });
  } catch (err) {
    return res.status(400).json({ ok: false, code: "PROVIDER_DISABLE_FAILED", message: err.message || "禁用失败" });
  }
}
