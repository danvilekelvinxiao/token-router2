import { requireAdmin } from "@/lib/admin-auth";
import { listProviders, saveProvider } from "@/lib/provider-store";

function error(res, status, code, message) {
  return res.status(status).json({ ok: false, code, message });
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const providers = await listProviders();
      return res.status(200).json({ ok: true, data: { providers }, providers });
    }

    if (req.method === "POST") {
      const provider = await saveProvider(req.body || {}, admin.id || admin.email || "admin");
      return res.status(200).json({ ok: true, message: "渠道保存成功", data: { provider }, provider });
    }

    res.setHeader("Allow", "GET, POST");
    return error(res, 405, "METHOD_NOT_ALLOWED", "请求方法不支持");
  } catch (err) {
    return error(res, 400, "PROVIDER_SAVE_FAILED", err.message || "渠道保存失败，请检查内容后重试。");
  }
}
