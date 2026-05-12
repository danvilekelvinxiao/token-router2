import { MODEL_CATALOG, USD_TO_CNY_RATE } from "@/lib/models";

export default function handler(req, res) {
  const models = [...MODEL_CATALOG].sort((a, b) => {
    const aTotal = a.inputPrice + a.outputPrice;
    const bTotal = b.inputPrice + b.outputPrice;
    return aTotal - bTotal;
  }).map((model) => {
    return {
      ...model,
      inputPriceCny: Number((model.inputPrice * USD_TO_CNY_RATE).toFixed(4)),
      outputPriceCny: Number((model.outputPrice * USD_TO_CNY_RATE).toFixed(4)),
      currency: "CNY",
      unit: "per_1m_tokens",
    };
  });

  return res.status(200).json({ models });
}
