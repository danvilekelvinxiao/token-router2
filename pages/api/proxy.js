import { requireAdmin } from "@/lib/admin-auth";
import { sanitizeSecretText } from "@/lib/safe-upstream-url";

const ALLOWED_ENDPOINTS = [
  "chat/completions",
  "responses",
  "embeddings",
];

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

function normalizeTarget(target) {
  if (!target) return "chat/completions";
  return String(target).replace(/^\/+/, "").trim();
}

function normalizeUpstreamBaseUrl(value = "") {
  return String(value || "").trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function getUpstreamConfig() {
  const sub2ApiBase = normalizeUpstreamBaseUrl(process.env.SUB2API_BASE_URL || process.env.SUB2API_INTERNAL_URL);
  const sub2ApiKey = process.env.SUB2API_API_KEY || process.env.SUB2API_API_KEY_SECONDARY;
  const newApiBase = process.env.NEW_API_BASE_URL;
  const newApiKey = process.env.NEW_API_KEY || process.env.NEW_API_ADMIN_TOKEN;
  const openAiBase = process.env.OPENAI_API_BASE_URL || process.env.OFFICIAL_OPENAI_API_BASE_URL;
  const openAiKey = process.env.OPENAI_API_KEY || process.env.OFFICIAL_OPENAI_API_KEY;
  const openRouterKey = process.env.OPENROUTER_API_KEY;

  if (sub2ApiBase && sub2ApiKey) {
    return {
      name: "sub2api",
      baseUrl: sub2ApiBase,
      apiKey: sub2ApiKey,
    };
  }

  if (newApiBase && newApiKey) {
    return {
      name: "new-api",
      baseUrl: newApiBase.replace(/\/+$/, ""),
      apiKey: newApiKey,
    };
  }

  if (openAiBase && openAiKey) {
    return {
      name: "official-openai",
      baseUrl: openAiBase.replace(/\/+$/, ""),
      apiKey: openAiKey,
    };
  }

  if (openRouterKey) {
    return {
      name: "openrouter",
      baseUrl: "https://openrouter.ai/api",
      apiKey: openRouterKey,
    };
  }

  return null;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Only POST is allowed" });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const upstream = getUpstreamConfig();
  if (!upstream) {
    return res.status(500).json({ error: "未配置上游 API" });
  }

  const target = normalizeTarget(req.query.target);
  if (!ALLOWED_ENDPOINTS.includes(target)) {
    return res.status(400).json({
      error: "Invalid target. Allowed: chat/completions, responses, embeddings",
    });
  }

  const body = req.body;
  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  try {
    const headers = {
      Authorization: `Bearer ${upstream.apiKey}`,
      "Content-Type": "application/json",
    };

    if (upstream.name === "openrouter") {
      headers["HTTP-Referer"] = process.env.PROXY_HTTP_REFERER || "https://token-router.local";
      headers["X-Title"] = process.env.PROXY_TITLE || "Token Router Proxy";
    }

    const upstreamResponse = await fetch(`${upstream.baseUrl}/v1/${target}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const text = sanitizeSecretText(await upstreamResponse.text());
    res.status(upstreamResponse.status);
    res.setHeader("Content-Type", upstreamResponse.headers.get("content-type") || "application/json");
    return res.send(text);
  } catch (error) {
    return res.status(502).json({
      error: sanitizeSecretText(error?.message || "Upstream request failed"),
    });
  }
}
