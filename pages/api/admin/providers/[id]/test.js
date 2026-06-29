import { requireAdmin } from "@/lib/admin-auth";
import { testProviderConnection } from "@/lib/provider-store";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, code: "METHOD_NOT_ALLOWED", message: "请求方法不支持" });
  }
  try {
    const result = await testProviderConnection(req.query.id);
    return res.status(200).json({ ok: result.ok, message: result.message, data: result, result });
  } catch (err) {
    return res.status(400).json({ ok: false, code: "PROVIDER_TEST_FAILED", message: err.message || "测试连接失败" });
  }
}
