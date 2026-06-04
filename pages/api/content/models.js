import { getContent } from "@/lib/content-cms";
import { listModelProductsWithConfig } from "@/lib/model-products-server";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const data = getContent("models");
  let payload = data;

  try {
    const products = await listModelProductsWithConfig({ includeUnavailable: true });
    const releaseMap = new Map();
    products.forEach((product) => {
      const value = product.officialReleaseDate || "";
      [product.id, product.publicModelId, product.actualModelId, product.displayName]
        .filter(Boolean)
        .forEach((key) => releaseMap.set(String(key).toLowerCase(), value));
    });
    payload = data.map((model) => {
      const key = [model.id, model.modelId, model.publicModelId, model.displayName]
        .map((item) => String(item || "").toLowerCase())
        .find((item) => releaseMap.has(item));
      return key ? { ...model, officialReleaseDate: releaseMap.get(key) || model.officialReleaseDate || "" } : model;
    });
  } catch {
    payload = data;
  }

  return res.status(200).json({
    success: true,
    ok: true,
    source: "real",
    type: "models",
    models: payload,
    data: payload,
    updatedAt: new Date().toISOString(),
  });
}
