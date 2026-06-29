import { MODEL_CATALOG, USD_TO_CNY_RATE } from "@/lib/models";

function normalizeModelName(value = "") {
  return String(value || "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dedupeCatalogModels(models = []) {
  const seen = new Set();
  const result = [];
  for (const model of Array.isArray(models) ? models : []) {
    const key = normalizeModelName(model?.name || model?.displayName || model?.key || model?.modelId || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(model);
  }
  return result;
}

export default function handler(req, res) {
  const models = dedupeCatalogModels([...MODEL_CATALOG]).sort((a, b) => {
    const aTotal = a.inputPrice + a.outputPrice;
    const bTotal = b.inputPrice + b.outputPrice;
    return aTotal - bTotal;
  }).map((model) => {
    return {
      ...model,
      inputPriceCny: Number((model.inputPrice * USD_TO_CNY_RATE).toFixed(4)),
      outputPriceCny: Number((model.outputPrice * USD_TO_CNY_RATE).toFixed(4)),
      currency: "$ API",
      unit: "per_1m_tokens",
    };
  });

  return res.status(200).json({ models });
}
