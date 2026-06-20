import { findCustomerByToken } from "@/lib/customer-store";
import { listModelProductsWithConfig } from "@/lib/model-products-server";
import { CACHE_TTLS, getCacheManager } from "@/lib/cache-manager";

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function getClientToken(req) {
  const auth = req.headers.authorization || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.headers["x-api-key"] || "").trim();
  while (token.toLowerCase().startsWith("bearer ")) token = token.slice(7).trim();
  return token.replace(/^["']|["']$/g, "");
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method === "HEAD") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET, HEAD, OPTIONS");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const clientToken = getClientToken(req);
  let isLocalKey = false;
  try {
    isLocalKey = !!(clientToken && await findCustomerByToken(clientToken));
  } catch {
    isLocalKey = false;
  }

  if (!isLocalKey) {
    return res.status(401).json({
      error: { message: "Invalid FlowAPI API Key", type: "invalid_api_key" },
    });
  }

  const created = Math.floor(Date.now() / 1000);
  const cache = getCacheManager();
  const cached = cache.get("modelList", "v1-models");
  if (cached) {
    res.setHeader("X-FlowAPI-Cache", "HIT");
    return res.status(200).json(cached);
  }
  const products = await listModelProductsWithConfig({ includeUnavailable: false }).catch(() => []);
  const models = [
    {
      id: "auto",
      object: "model",
      created,
      owned_by: "flowapi",
      name: "FlowAPI Auto Router",
    },
    ...products
      .filter((model) => model.canCreateKey !== false)
      .map((model) => ({
      id: model.publicModelId || model.id,
      object: "model",
      created,
      owned_by: "flowapi",
      name: model.displayName || model.publicModelId || model.id,
    })),
  ];

  const payload = {
    object: "list",
    data: models,
  };
  cache.set("modelList", "v1-models", payload, CACHE_TTLS.modelList);
  res.setHeader("X-FlowAPI-Cache", "MISS");
  return res.status(200).json(payload);
}
