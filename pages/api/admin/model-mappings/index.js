import { requireAdmin } from "@/lib/admin-auth";
import { listModelMappings, saveModelMapping } from "@/lib/provider-store";

function error(res, status, code, message) {
  return res.status(status).json({ ok: false, code, message });
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const mappings = await listModelMappings({ includeDisabled: req.query.includeDisabled === "true" });
      return res.status(200).json({ ok: true, data: { mappings }, mappings });
    }

    if (req.method === "POST") {
      const mapping = await saveModelMapping(req.body || {});
      return res.status(200).json({ ok: true, message: "模型映射保存成功", data: { mapping }, mapping });
    }

    res.setHeader("Allow", "GET, POST");
    return error(res, 405, "METHOD_NOT_ALLOWED", "请求方法不支持");
  } catch (err) {
    return error(res, 400, "MODEL_MAPPING_SAVE_FAILED", err.message || "模型映射保存失败，请检查内容后重试。");
  }
}
