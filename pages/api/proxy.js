const ALLOWED_OPENROUTER_ENDPOINTS = [
  "chat/completions",
  "responses",
  "embeddings",
];

function getClientToken(req) {
  const auth = req.headers.authorization || "";

  if (!auth.startsWith("Bearer ")) {
    return "";
  }

  return auth.slice(7).trim();
}

function normalizeTarget(target) {
  if (!target) {
    return "chat/completions";
  }

  return String(target).replace(/^\/+/, "").trim();
}

function getRequestMeta(req) {
  return {
    ip: String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || req.socket?.remoteAddress || ""),
    userAgent: String(req.headers["user-agent"] || ""),
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Only POST is allowed" });
  }

  const upstreamApiKey = process.env.OPENROUTER_API_KEY;
  const proxyAccessToken = process.env.PROXY_ACCESS_TOKEN;

  if (!upstreamApiKey) {
    return res.status(500).json({ error: "Missing OPENROUTER_API_KEY" });
  }

  if (!proxyAccessToken) {
    return res.status(500).json({ error: "Missing PROXY_ACCESS_TOKEN" });
  }

  const clientToken = getClientToken(req);

  if (clientToken !== proxyAccessToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const target = normalizeTarget(req.query.target);

  if (!ALLOWED_OPENROUTER_ENDPOINTS.includes(target)) {
    return res.status(400).json({
      error: "Invalid target. Allowed: chat/completions, responses, embeddings",
    });
  }

  const body = req.body;

  if (!body || typeof body !== "object") {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  try {
    const upstreamResponse = await fetch(`https://openrouter.ai/api/v1/${target}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${upstreamApiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PROXY_HTTP_REFERER || "https://token-router.local",
        "X-Title": process.env.PROXY_TITLE || "Token Router Proxy",
      },
      body: JSON.stringify(body),
    });

    const text = await upstreamResponse.text();

    res.status(upstreamResponse.status);
    res.setHeader("Content-Type", upstreamResponse.headers.get("content-type") || "application/json");
    res.setHeader("x-flowapi-proxy-target", target);
    res.setHeader("x-flowapi-client-ip", getRequestMeta(req).ip);

    return res.send(text);
  } catch (error) {
    return res.status(502).json({
      error: error?.message || "Upstream request failed",
    });
  }
}
