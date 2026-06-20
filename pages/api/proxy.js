import { requireAdmin } from "@/lib/admin-auth";
import { sanitizeSecretText } from "@/lib/safe-upstream-url";
import { getUpstreamConfigsAsync } from "@/lib/upstream";

const ALLOWED_ENDPOINTS = [
  "chat/completions",
  "responses",
  "embeddings",
];

function normalizeTarget(target) {
  if (!target) return "chat/completions";
  return String(target).replace(/^\/+/, "").trim();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Only POST is allowed" });
  }

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const upstreams = await getUpstreamConfigsAsync({ includeReviewOnly: true }).catch(() => []);
  const upstream = upstreams[0] || null;
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
