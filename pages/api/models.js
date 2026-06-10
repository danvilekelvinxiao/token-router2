import { MODEL_CATALOG, USD_TO_CNY_RATE } from "@/lib/models";

const HIDDEN_FIELDS = ["actualModelId", "upstreamChain", "provider", "routeKeywords"];

export default function handler(req, res) {
  const models = [...MODEL_CATALOG].sort((a, b) => {
    const aTotal = a.inputPrice + a.outputPrice;
    const bTotal = b.inputPrice + b.outputPrice;
    return aTotal - bTotal;
  }).map((model) => {
    const pub = {
      ...model,
      inputPriceCny: Number((model.inputPrice * USD_TO_CNY_RATE).toFixed(4)),
      outputPriceCny: Number((model.outputPrice * USD_TO_CNY_RATE).toFixed(4)),
      currency: "CNY",
      unit: "per_1m_tokens",
    };
    for (const f of HIDDEN_FIELDS) delete pub[f];
    return pub;
  });

  return res.status(200).json({ models });
}
