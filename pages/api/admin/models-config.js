/**
 * GET /api/admin/models-config — list all model products with configs
 * PUT /api/admin/models-config — update a model product config (enable/disable, set actualModelId, etc.)
 */
import { requireAdmin } from "@/lib/admin-auth";
import { getModelProduct } from "@/lib/model-products";
import { listModelProductsWithConfig } from "@/lib/model-products-server";
import { getAllModelConfigs, updateModelConfig } from "@/lib/model-store";
import { listUpstreamModels } from "@/lib/model-store";

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === "GET") {
    try {
      const [products, configs, upstreamModels] = await Promise.all([
        listModelProductsWithConfig({ includeUnavailable: true }),
        getAllModelConfigs().catch(() => ({})),
        listUpstreamModels().catch(() => []),
      ]);

      return res.status(200).json({
        ok: true,
        products,
        configs,
        upstreamModels,
        totalProducts: products.length,
        totalUpstream: upstreamModels.length,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "获取模型配置失败",
        detail: error.message,
      });
    }
  }

  if (req.method === "PUT") {
    const { productId, updates } = req.body || {};
    if (!productId) {
      return res.status(400).json({ ok: false, error: "缺少 productId" });
    }
    if (!updates || typeof updates !== "object") {
      return res.status(400).json({ ok: false, error: "缺少 updates 参数" });
    }

    const product = getModelProduct(productId);
    if (!product) {
      return res.status(404).json({ ok: false, error: "模型产品不存在" });
    }

    const allowedFields = [
      "isAvailable",
      "isComingSoon",
      "actualModelId",
      "status",
      "statusLabel",
      "lastHealthCheckAt",
      "lastError",
      "canCreateKey",
      "upstreamChannel",
      "officialReleaseDate",
    ];

    const filtered = {};
    for (const key of allowedFields) {
      if (updates[key] !== undefined) {
        filtered[key] = updates[key];
      }
    }

    if (filtered.isAvailable !== undefined) {
      filtered.isComingSoon = !filtered.isAvailable;
      if (filtered.isAvailable) {
        filtered.status = filtered.status || "available";
        filtered.statusLabel = filtered.statusLabel || "可用";
      } else if (!filtered.statusLabel) {
        filtered.status = filtered.status || "coming_soon";
        filtered.statusLabel = filtered.statusLabel || "即将开放";
      }
    }

    if (filtered.officialReleaseDate !== undefined) {
      const value = String(filtered.officialReleaseDate || "").trim();
      if (value && !/^\d{4}-(0[1-9]|1[0-2])(-([0-2]\d|3[01]))?$/.test(value)) {
        return res.status(400).json({
          ok: false,
          error: "官方发布时间格式必须是 YYYY-MM-DD 或 YYYY-MM，留空表示待确认",
        });
      }
      filtered.officialReleaseDate = value;
    }

    try {
      const config = await updateModelConfig(product.id, filtered);
      return res.status(200).json({
        ok: true,
        productId: product.id,
        config,
        message: `模型 ${product.displayName} 配置已更新`,
      });
    } catch (error) {
      return res.status(500).json({
        ok: false,
        error: "保存模型配置失败",
        detail: error.message,
      });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
