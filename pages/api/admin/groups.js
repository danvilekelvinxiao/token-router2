import { requireAdmin } from "@/lib/admin-auth";
import { deleteApiGroup, listApiGroups, publicApiGroup, upsertApiGroup } from "@/lib/api-groups";
import { listModelProductsWithConfig } from "@/lib/model-products-server";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    try {
      const [groups, models] = await Promise.all([
        listApiGroups({ includeUnavailable: true }),
        listModelProductsWithConfig({ includeUnavailable: true }).catch(() => []),
      ]);
      return res.status(200).json({
        ok: true,
        groups: groups.map((group) => ({
          ...publicApiGroup(group, models),
          newApiGroup: group.newApiGroup || group.id,
          channelStrategy: group.channelStrategy || "auto",
          updatedAt: group.updatedAt || null,
        })),
        models: models.map((model) => ({
          id: model.id,
          publicModelId: model.publicModelId,
          displayName: model.displayName,
          provider: model.provider,
        })),
      });
    } catch (error) {
      console.error("[api/admin/groups:get]", error);
      return res.status(500).json({ ok: false, error: "获取分组配置失败" });
    }
  }

  if (req.method === "POST" || req.method === "PUT") {
    try {
      const group = await upsertApiGroup(req.body || {});
      return res.status(200).json({
        ok: true,
        group: {
          ...publicApiGroup(group),
          newApiGroup: group.newApiGroup || group.id,
          channelStrategy: group.channelStrategy || "auto",
        },
        message: `${group.displayName} 分组已保存`,
      });
    } catch (error) {
      return res.status(400).json({
        ok: false,
        error: error?.message || "保存分组失败",
        code: error?.code || "SAVE_GROUP_FAILED",
      });
    }
  }

  if (req.method === "DELETE") {
    const id = req.body?.id || req.query?.id;
    const deleted = await deleteApiGroup(id);
    return res.status(200).json({ ok: true, deleted });
  }

  res.setHeader("Allow", "GET, POST, PUT, DELETE");
  return res.status(405).json({ error: "Method not allowed" });
}
