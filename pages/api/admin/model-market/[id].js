import { requireAdmin } from "@/lib/admin-auth";
import { deletePublishedModel, upsertPublishedModel } from "@/lib/admin-commercial-config";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const modelId = String(req.query.id || "").trim();
  if (!modelId) return res.status(400).json({ ok: false, error: "缺少模型 ID" });

  try {
    if (req.method === "PATCH") {
      const result = await upsertPublishedModel(
        { ...(req.body || {}), modelId: req.body?.modelId || modelId },
        admin.customer?.id || admin.customer?.email || "admin"
      );
      return res.status(200).json({ ok: true, message: "模型已更新，并同步到前台", ...result });
    }

    if (req.method === "DELETE") {
      const result = await deletePublishedModel(modelId, admin.customer?.id || admin.customer?.email || "admin");
      return res.status(200).json({ ok: true, message: "模型已删除", ...result });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || "模型更新失败" });
  }
}
