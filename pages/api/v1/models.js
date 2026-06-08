import { findCustomerByToken } from "@/lib/customer-store";
import { isTokenWhitelisted } from "@/lib/new-api/passthrough";
import { getUpstreamConfigs } from "@/lib/upstream";
import { listModelProductsWithConfig } from "@/lib/model-products-server";

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
  const isLocalKey = !!(clientToken && await findCustomerByToken(clientToken));

  if (!isLocalKey) {
    // Only admin-whitelisted New API tokens may query upstream models.
    // Unknown New API tokens must not bypass FlowAPI's local api_keys table.
    if (!(clientToken && await isTokenWhitelisted(clientToken))) {
      return res.status(401).json({
        error: { message: "Invalid FlowAPI API Key", type: "invalid_api_key" },
      });
    }
    // Forward to New API /v1/models
    const upstreams = getUpstreamConfigs();
    if (upstreams.length > 0) {
      try {
        const upRes = await fetch(upstreams[0].modelsUrl, {
          headers: { Authorization: `Bearer ${clientToken}` },
        });
        const upData = await upRes.json().catch(() => null);
        res.status(upRes.status);
        res.setHeader("Content-Type", upRes.headers.get("content-type") || "application/json");
        return res.send(JSON.stringify(upData));
      } catch {
        // Fall through to local catalog
      }
    }
  }

  const created = Math.floor(Date.now() / 1000);
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
      owned_by: String(model.provider || "flowapi").toLowerCase(),
      name: model.displayName || model.publicModelId || model.id,
    })),
  ];

  return res.status(200).json({
    object: "list",
    data: models,
  });
}
