import { MODEL_CATALOG, USD_TO_CNY_RATE } from "@/lib/models";
import { sortModelsForDisplay } from "@/lib/models/model-sorter";
import { normalizeModelDisplayLabel } from "@/lib/models/model-name-normalizer";

export default function handler(req, res) {
  const models = sortModelsForDisplay([...MODEL_CATALOG]).map((model) => {
    const displayName = normalizeModelDisplayLabel(model);
    return {
      ...model,
      name: displayName || model.name,
      displayOrder: model.displayOrder,
      featured: Boolean(model.featured || model.hot || model.recommended),
      providerFamily: model.providerFamily || "",
      releaseDate: model.releaseDate || model.officialReleaseDate || "",
      popularityScore: Number(model.popularityScore || 0),
      inputPriceCny: Number((model.inputPrice * USD_TO_CNY_RATE).toFixed(4)),
      outputPriceCny: Number((model.outputPrice * USD_TO_CNY_RATE).toFixed(4)),
      currency: "CNY",
      unit: "per_1m_tokens",
    };
  });

  return res.status(200).json({ models });
}
