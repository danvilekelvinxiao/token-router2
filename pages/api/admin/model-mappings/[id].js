import { requireAdmin } from "@/lib/admin-auth";
import { deleteModelMapping, listModelMappings, saveModelMapping } from "@/lib/provider-store";

function error(res, status, code, message) {
  return res.status(status).json({ ok: false, code, message });
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;
  const { id } = req.query || {};

  try {
    if (req.method === "GET") {
      const mapping = (await listModelMappings({ includeDisabled: true })).find((item) => item.id === id);
      if (!mapping) return error(res, 404, "MODEL_MAPPING_NOT_FOUND", "模型映射不存在");
      return res.status(200).json({ ok: true, data: { mapping }, mapping });
    }

    if (req.method === "PUT" || req.method === "PATCH") {
      const mapping = await saveModelMapping({ ...(req.body || {}), id });
      return res.status(200).json({ ok: true, message: "模型映射更新成功", data: { mapping }, mapping });
    }

    if (req.method === "DELETE") {
      await deleteModelMapping(id);
      return res.status(200).json({ ok: true, message: "模型映射已删除", data: {} });
    }

    res.setHeader("Allow", "GET, PUT, PATCH, DELETE");
    return error(res, 405, "METHOD_NOT_ALLOWED", "请求方法不支持");
  } catch (err) {
    return error(res, 400, "MODEL_MAPPING_OPERATION_FAILED", err.message || "模型映射操作失败，请检查后重试。");
  }
}
