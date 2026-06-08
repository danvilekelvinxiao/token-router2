/**
 * Minimal Anthropic Messages-compatible adapter.
 *
 * It reuses FlowAPI's chat completions route so authentication, balance,
 * billing, model routing, and logs stay on the same commercial ledger.
 */

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, anthropic-version, x-api-key, idempotency-key, x-request-id");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function normalizeText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        return item?.text || item?.content || "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") return content.text || content.content || JSON.stringify(content);
  return "";
}

function normalizeModel(model = "") {
  const value = String(model || "").trim().toLowerCase();
  if (!value) return "flowapi-claude-sonnet";
  if (value.includes("opus")) return "flowapi-claude-opus";
  if (value.includes("sonnet") || value.includes("claude")) return "flowapi-claude-sonnet";
  return String(model || "flowapi-claude-sonnet").trim();
}

function toChatBody(body = {}) {
  const messages = [];
  const system = normalizeText(body.system);
  if (system) messages.push({ role: "system", content: system });
  for (const message of Array.isArray(body.messages) ? body.messages : []) {
    const content = normalizeText(message?.content);
    if (!content) continue;
    messages.push({
      role: message?.role === "assistant" ? "assistant" : "user",
      content,
    });
  }
  if (!messages.some((message) => message.role === "user")) {
    messages.push({ role: "user", content: "ping" });
  }
  return {
    model: normalizeModel(body.model),
    messages,
    ...(body.temperature != null ? { temperature: body.temperature } : {}),
    ...(body.max_tokens ? { max_tokens: body.max_tokens } : {}),
  };
}

function getInternalChatUrl() {
  const configured = process.env.INTERNAL_FLOWAPI_BASE_URL?.replace(/\/+$/, "");
  if (configured) return `${configured}/api/v1/chat/completions`;
  const port = process.env.FLOWAPI_INTERNAL_PORT || process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/v1/chat/completions`;
}

function toAnthropicMessage(chatBody, chatResponse) {
  const choice = chatResponse?.choices?.[0] || {};
  const text = normalizeText(choice.message?.content);
  const usage = chatResponse?.usage || {};
  return {
    id: `msg_${Date.now().toString(36)}`,
    type: "message",
    role: "assistant",
    model: chatBody.model,
    content: [{ type: "text", text }],
    stop_reason: choice.finish_reason || "end_turn",
    stop_sequence: null,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
    },
  };
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({ error: { type: "method_not_allowed", message: "请使用 POST 请求调用 /v1/messages。" } });
  }
  if (req.body?.stream) {
    return res.status(400).json({
      error: {
        type: "unsupported_feature",
        message: "FlowAPI /v1/messages 当前支持非流式调用。需要流式输出时请使用 /v1/chat/completions。",
      },
    });
  }

  const chatBody = toChatBody(req.body || {});
  try {
    const chatRes = await fetch(getInternalChatUrl(), {
      method: "POST",
      headers: {
        Authorization: req.headers.authorization || (req.headers["x-api-key"] ? `Bearer ${req.headers["x-api-key"]}` : ""),
        "Content-Type": "application/json",
        ...(req.headers["idempotency-key"] ? { "Idempotency-Key": req.headers["idempotency-key"] } : {}),
        ...(req.headers["x-request-id"] ? { "x-request-id": req.headers["x-request-id"] } : {}),
      },
      body: JSON.stringify(chatBody),
    });
    const chatJson = await chatRes.json().catch(() => null);
    if (!chatRes.ok || !chatJson) {
      return res.status(chatRes.status || 502).json(chatJson || {
        error: { type: "flowapi_messages_adapter_error", message: "FlowAPI Messages 适配失败，请检查 API Key、Base URL 和模型名。" },
      });
    }
    return res.status(200).json(toAnthropicMessage(chatBody, chatJson));
  } catch (error) {
    console.error("[v1/messages]", error);
    return res.status(502).json({
      error: { type: "service_error", message: "FlowAPI Messages 适配服务暂时不可用，请稍后重试。" },
    });
  }
}
