import { requireAdmin } from "@/lib/admin-auth";
import {
  bootstrapModelMarketPack,
  listModelPricing,
  listPublishedModels,
  upsertPublishedModel,
  checkAdminSyncConsistency,
} from "@/lib/admin-commercial-config";
import { listModelProductsWithConfig } from "@/lib/model-products-server";
import { getAllModelConfigs } from "@/lib/model-store";
import { invalidateModelCaches } from "@/lib/cache-manager";
import { sortModelsForDisplay } from "@/lib/models/model-sorter";

function modelTypeFromProduct(product = {}) {
  const id = String(product.publicModelId || product.id || "").toLowerCase();
  const group = String(product.group || "").toLowerCase();
  if (id.includes("codex") || group.includes("codex")) return "coding";
  if (id.includes("image") || group.includes("image")) return "image";
  if (id.includes("vision") || group.includes("vision")) return "vision";
  return "text";
}

function mapSystemProductForAdmin(product = {}, pricing = null, configs = {}) {
  const modelId = product.publicModelId || product.id;
  const config = configs?.[modelId] || configs?.[product.id] || {};
  const enabled = config.isAvailable !== undefined ? Boolean(config.isAvailable) : Boolean(product.isAvailable);
  return {
    id: `system:${modelId}`,
    importedModelId: "",
    modelId,
    upstreamModelId: config.actualModelId || product.actualModelId || modelId,
    actualModelId: config.actualModelId || product.actualModelId || modelId,
    displayName: product.displayName || modelId,
    provider: "FlowAPI",
    logo: "FlowAPI",
    modelType: modelTypeFromProduct(product),
    description: product.description || "",
    tags: product.useCases || product.tags || [],
    officialReleaseDate: config.officialReleaseDate || product.officialReleaseDate || "",
    sortOrder: Number(product.sortOrder || 999),
    recommended: Boolean(product.recommended || product.sortOrder <= 40),
    hot: Boolean(product.hot || String(modelId).includes("gpt") || String(modelId).includes("codex")),
    free: Boolean(product.free),
    memberOnly: Boolean(product.isMemberOnly),
    blackGoldOnly: Boolean(product.blackGoldOnly),
    enabled,
    showInModelSquare: enabled,
    showInApiKeyCreate: enabled && product.canCreateKey !== false,
    showInImageGeneration: false,
    source: "system",
    isManagedPreset: true,
    pricing: pricing || product.pricing || null,
  };
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  try {
    if (req.method === "GET") {
      const [models, pricing, configs, sync, products] = await Promise.all([
        listPublishedModels(),
        listModelPricing().catch(() => []),
        getAllModelConfigs().catch(() => ({})),
        checkAdminSyncConsistency().catch((error) => ({ ok: false, issues: [{ message: error.message }] })),
        listModelProductsWithConfig({ includeUnavailable: true }).catch(() => []),
      ]);
      const priceMap = new Map(pricing.map((item) => [item.modelId, item]));
      const publishedIds = new Set(models.map((model) => model.modelId));
      const systemModels = products
        .filter((product) => product.publicModelId || product.id)
        .filter((product) => !publishedIds.has(product.publicModelId || product.id))
        .map((product) => {
          const modelId = product.publicModelId || product.id;
          return mapSystemProductForAdmin(product, priceMap.get(modelId), configs);
        });
      const mergedModels = sortModelsForDisplay([
        ...models.map((model) => ({
          ...model,
          source: "published",
          actualModelId: configs?.[model.modelId]?.actualModelId || model.upstreamModelId || model.modelId,
          pricing: priceMap.get(model.modelId) || null,
        })),
        ...systemModels,
      ]);
      return res.status(200).json({
        ok: true,
        models: mergedModels,
        sync,
        updatedAt: new Date().toISOString(),
      });
    }

    if (req.method === "POST") {
      if (req.body?.action === "bootstrap_model_pack") {
        const result = await bootstrapModelMarketPack({
          pack: req.body?.pack || "starter",
          adminId: admin.customer?.id || admin.customer?.email || "admin",
        });
        invalidateModelCaches();
        return res.status(200).json({
          ok: result.ok,
          message: result.ok
            ? result.acceptance?.summary || `已开通 ${result.publishedCount} 个 FlowAPI 推荐模型。`
            : "没有模型被开通，请检查成本、售价或上游模型 ID。",
          ...result,
        });
      }
      const result = await upsertPublishedModel(req.body || {}, admin.customer?.id || admin.customer?.email || "admin");
      invalidateModelCaches();
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
