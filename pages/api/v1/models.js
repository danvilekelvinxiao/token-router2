import { MODEL_CATALOG } from "@/lib/models";
import { findCustomerByToken } from "@/lib/customer-store";

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
  if (!clientToken || !(await findCustomerByToken(clientToken))) {
    return res.status(401).json({
      error: {
        message: "Invalid FlowAPI API Key",
        type: "invalid_api_key",
      },
    });
  }

  const created = Math.floor(Date.now() / 1000);
  const models = [
    {
      id: "auto",
      object: "model",
      created,
      owned_by: "flowapi",
      name: "FlowAPI Auto Router",
    },
    ...MODEL_CATALOG.map((model) => ({
      id: model.modelId,
      object: "model",
      created,
      owned_by: model.provider.toLowerCase(),
      name: model.name,
    })),
  ];

  return res.status(200).json({
    object: "list",
    data: models,
  });
}
