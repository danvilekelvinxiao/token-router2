import { requireAdmin } from "@/lib/admin-auth";
import { deleteProvider, getProvider, saveProvider } from "@/lib/provider-store";

function error(res, status, code, message) {
  return res.status(status).json({ ok: false, code, message });
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { id } = req.query || {};

  try {
    if (req.method === "GET") {
      const provider = await getProvider(id);
      if (!provider) return error(res, 404, "PROVIDER_NOT_FOUND", "渠道不存在");
      return res.status(200).json({ ok: true, data: { provider }, provider });
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      const provider = await saveProvider({ ...(req.body || {}), id }, admin.id || admin.email || "admin");
      return res.status(200).json({ ok: true, message: "渠道更新成功", data: { provider }, provider });
    }

    if (req.method === "DELETE") {
      await deleteProvider(id);
      return res.status(200).json({ ok: true, message: "渠道已删除", data: {} });
    }

    res.setHeader("Allow", "GET, PUT, PATCH, DELETE");
    return error(res, 405, "METHOD_NOT_ALLOWED", "请求方法不支持");
  } catch (err) {
    return error(res, 400, "PROVIDER_OPERATION_FAILED", err.message || "渠道操作失败，请检查后重试。");
  }
}
