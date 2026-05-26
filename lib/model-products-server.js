/**
 * Server-only model product functions that require the database/store.
 * Never import this module from client/browser code.
 */
import { MODEL_PRODUCTS, normalizeModelProduct } from "./model-products.js";
import { getAllModelConfigs } from "./model-store.js";

export async function listModelProductsWithConfig({ includeUnavailable = true } = {}) {
  let configs = {};
  try {
    configs = await getAllModelConfigs();
  } catch {
    // use empty configs if store unavailable
  }

  return MODEL_PRODUCTS
    .filter((item) => includeUnavailable || item.isAvailable)
    .sort((a, b) => Number(a.sortOrder || 0) - Number(b.sortOrder || 0))
    .map((product) => {
      const cfg = configs[product.id] || {};
      const merged = { ...product };

      if (cfg.actualModelId !== undefined) {
        merged.actualModelId = cfg.actualModelId;
      }
      if (cfg.isAvailable !== undefined) {
        merged.isAvailable = cfg.isAvailable;
        merged.isComingSoon = !cfg.isAvailable;
      }
      if (cfg.statusLabel) merged.statusLabel = cfg.statusLabel;
      if (cfg.lastHealthCheckAt) merged.lastHealthCheckAt = cfg.lastHealthCheckAt;
      if (cfg.lastError) merged.lastError = cfg.lastError;
      if (cfg.upstreamChannel) merged.upstreamChannel = cfg.upstreamChannel;

      return normalizeModelProduct(merged);
    });
}
