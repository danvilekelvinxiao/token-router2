/**
 * /v1/responses adapter — converts OpenAI Responses API requests
 * to Chat Completions and back, so CC-Switch / Codex clients that
 * default to Responses API can still use FlowAPI.
 */

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function responsesToChatCompletions(body) {
  // "input" can be a string or an array of content blocks
  const input = body.input;
  let userContent = "";

  if (typeof input === "string") {
    userContent = input;
  } else if (Array.isArray(input)) {
    userContent = input
      .map((block) => (typeof block === "string" ? block : block.text || ""))
      .join("\n");
  }

  return {
    model: body.model || "deepseek-chat",
    messages: [{ role: "user", content: userContent }],
    ...(body.max_output_tokens ? { max_tokens: body.max_output_tokens } : {}),
    ...(body.temperature != null ? { temperature: body.temperature } : {}),
  };
}

function chatCompletionToResponse(chatBody, upstreamBody, upstreamRes) {
  const choice = upstreamBody?.choices?.[0] || {};
  const message = choice.message || {};
  const usage = upstreamBody?.usage || {};

  return {
    object: "response",
    status: "completed",
    model: chatBody.model,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: message.content || "",
          },
        ],
      },
    ],
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
    },
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: "Only POST is allowed" });
  }

  const body = req.body || {};
  const clientToken = (req.headers.authorization || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  // Convert Responses → Chat Completions
  const chatBody = responsesToChatCompletions(body);

  // Forward to Chat Completions
  const newApiBase = process.env.NEW_API_BASE_URL || "http://localhost:3001";
  const upstreamUrl = `${newApiBase.replace(/\/+$/, "")}/v1/chat/completions`;

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(chatBody),
    });

    const upstreamBody = await upstreamRes.json().catch(() => null);

    if (!upstreamRes.ok || !upstreamBody) {
      return res.status(upstreamRes.status).json(
        upstreamBody || { error: { message: "Upstream request failed" } }
      );
    }

    // Convert Chat Completions → Responses
    const responseBody = chatCompletionToResponse(body, upstreamBody, upstreamRes);
    return res.status(200).json(responseBody);
  } catch {
    return res.status(502).json({
      error: { message: "Service unavailable", type: "upstream_error" },
    });
  }
}

export const dynamic = "force-dynamic";
