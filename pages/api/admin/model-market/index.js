import { requireAdmin } from "@/lib/admin-auth";
import {
  listModelPricing,
  listPublishedModels,
  upsertPublishedModel,
  checkAdminSyncConsistency,
} from "@/lib/admin-commercial-config";
import { getAllModelConfigs } from "@/lib/model-store";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const [models, pricing, configs, sync] = await Promise.all([
        listPublishedModels(),
        listModelPricing().catch(() => []),
        getAllModelConfigs().catch(() => ({})),
        checkAdminSyncConsistency().catch((error) => ({ ok: false, issues: [{ message: error.message }] })),
      ]);
      const priceMap = new Map(pricing.map((item) => [item.modelId, item]));
      return res.status(200).json({
        ok: true,
        models: models.map((model) => ({
          ...model,
          actualModelId: configs?.[model.modelId]?.actualModelId || model.modelId,
          pricing: priceMap.get(model.modelId) || null,
        })),
        sync,
        updatedAt: new Date().toISOString(),
      });
    }

    if (req.method === "POST") {
      const result = await upsertPublishedModel(req.body || {}, admin.customer?.id || admin.customer?.email || "admin");
      return res.status(200).json({
        ok: true,
        message: "模型已保存，并同步到前台配置",
        ...result,
      });
    }

    return res.status(405).json({ ok: false, error: "Method not allowed" });
  } catch (error) {
    return res.status(400).json({ ok: false, error: error.message || "模型广场配置失败" });
  }
}
