import { estimateCnyCost, selectModelForPrompt } from "@/lib/models";
import { findCustomerByToken, recordCallByToken } from "@/lib/customer-store";

function getClientToken(req) {
  const auth = req.headers.authorization || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
}

function getPromptFromMessages(messages = []) {
  const lastUserMessage = [...messages].reverse().find((message) => message.role === "user");
  return typeof lastUserMessage?.content === "string" ? lastUserMessage.content : "";
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

  const clientToken = getClientToken(req);
  const customerMatch = findCustomerByToken(clientToken);

  if (!customerMatch) {
    return res.status(401).json({ error: "API Key 无效" });
  }

  if (customerMatch.customer.balance <= 0) {
    return res.status(402).json({ error: "人民币余额不足，请先充值" });
  }

  const body = req.body || {};
  const prompt = getPromptFromMessages(body.messages);
  const selected = body.model && body.model !== "auto"
    ? { modelId: body.model, name: body.model, provider: "Manual" }
    : selectModelForPrompt(prompt);

  if (!process.env.OPENROUTER_API_KEY) {
    recordCallByToken(clientToken, {
      endpoint: "/v1/chat/completions",
      requestedModel: body.model || "auto",
      routedModel: selected.name,
      provider: selected.provider,
      status: 500,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
      error: "Missing OPENROUTER_API_KEY",
    });
    return res.status(500).json({ error: "Missing OPENROUTER_API_KEY" });
  }

  try {
    const upstreamResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PROXY_HTTP_REFERER || "http://localhost:3000",
        "X-Title": process.env.PROXY_TITLE || "Token Router China",
      },
      body: JSON.stringify({
        ...body,
        model: selected.modelId,
      }),
    });

    const data = await upstreamResponse.json();
    const cost = estimateCnyCost(selected.modelId, data.usage);

    const customer = recordCallByToken(clientToken, {
      endpoint: "/v1/chat/completions",
      requestedModel: body.model || "auto",
      routedModel: selected.name,
      provider: selected.provider,
      status: upstreamResponse.status,
      promptTokens: data.usage?.prompt_tokens || 0,
      completionTokens: data.usage?.completion_tokens || 0,
      cost,
      ...getRequestMeta(req),
    });

    return res.status(upstreamResponse.status).json({
      ...data,
      token_router: {
        routed_model: selected.name,
        routed_model_id: selected.modelId,
        estimated_cost_cny: cost,
        balance_cny: customer?.balance,
      },
    });
  } catch (error) {
    recordCallByToken(clientToken, {
      endpoint: "/v1/chat/completions",
      requestedModel: body.model || "auto",
      routedModel: selected.name,
      provider: selected.provider,
      status: 502,
      promptTokens: 0,
      completionTokens: 0,
      cost: 0,
      ...getRequestMeta(req),
    });

    return res.status(502).json({ error: error.message || "Upstream request failed" });
  }
}
