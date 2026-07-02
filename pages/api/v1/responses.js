/**
 * /v1/responses adapter
 *
 * Converts the common OpenAI Responses API shape into Chat Completions,
 * sends it through FlowAPI's existing /api/v1/chat/completions route, then
 * converts the result back into a minimal Responses-compatible JSON payload.
 *
 * This intentionally reuses the FlowAPI main route so auth, balance reserve,
 * usage logs, model routing, and Chinese error handling stay consistent.
 */

import { MODEL_CATALOG, getCatalogModel, getPublicModelRequestId, normalizeModelLookup } from "@/lib/models";
import { appendRouteCodeToRequestId } from "@/lib/route-code";

const SUPPORTED_MODEL_IDS = new Set(MODEL_CATALOG.map((model) => model.modelId));

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, x-api-key, idempotency-key, x-request-id");
  res.setHeader("Access-Control-Max-Age", "86400");
}

function normalizeContent(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        return item.text || item.content || item.input_text || "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    return content.text || content.content || content.input_text || JSON.stringify(content);
  }
  return "";
}

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) return [];

  return messages
    .map((message) => {
      const role = message?.role === "assistant" ? "assistant" : message?.role === "system" ? "system" : "user";
      const content = normalizeContent(message?.content || message?.text || message?.input_text);
      return content ? { role, content } : null;
    })
    .filter(Boolean);
}

function inputToMessages(input, instructions) {
  const messages = [];
  if (instructions) {
    messages.push({ role: "system", content: normalizeContent(instructions) });
  }

  if (typeof input === "string") {
    messages.push({ role: "user", content: input });
  } else if (Array.isArray(input)) {
    for (const item of input) {
      if (typeof item === "string") {
        messages.push({ role: "user", content: item });
      } else if (item?.role) {
        messages.push({
          role: item.role === "assistant" ? "assistant" : item.role === "system" ? "system" : "user",
          content: normalizeContent(item.content || item.text || item.input_text),
        });
      } else {
        const content = normalizeContent(item);
        if (content) messages.push({ role: "user", content });
      }
    }
  }

  if (messages.length === 0) {
    messages.push({ role: "user", content: "ping" });
  }

  return messages;
}

function normalizeResponsesModel(model) {
  const rawModel = String(model || "").trim();
  const normalizedModel = normalizeModelLookup(rawModel);
  if (!rawModel) return "";
  if (SUPPORTED_MODEL_IDS.has(rawModel) || getCatalogModel(normalizedModel)) {
    return getPublicModelRequestId(normalizedModel);
  }
  return normalizedModel || rawModel;
}

function responsesToChatCompletions(body = {}) {
  const chatMessages = normalizeMessages(body.messages);
  const messages = chatMessages.length > 0
    ? chatMessages
    : inputToMessages(body.input, body.instructions);

  return {
    model: normalizeResponsesModel(body.model),
    messages,
    ...(body.temperature != null ? { temperature: body.temperature } : {}),
    ...(body.max_output_tokens ? { max_tokens: body.max_output_tokens } : {}),
  };
}

function chatCompletionToResponse(chatBody, chatResponse) {
  const choice = chatResponse?.choices?.[0] || {};
  const message = choice.message || {};
  const usage = chatResponse?.usage || {};
  const text = typeof message.content === "string"
    ? message.content
    : normalizeContent(message.content);

  return {
    id: `resp_${Date.now().toString(36)}`,
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: chatBody.model,
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    ],
    output_text: text,
    usage: {
      input_tokens: usage.prompt_tokens || 0,
      output_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
    },
  };
}

function getInternalChatUrl() {
  const configured = process.env.INTERNAL_FLOWAPI_BASE_URL?.replace(/\/+$/, "");
  if (configured) return `${configured}/api/v1/chat/completions`;
  const port = process.env.FLOWAPI_INTERNAL_PORT || process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/v1/chat/completions`;
}

export default async function handler(req, res) {
  setCors(res);

  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return res.status(405).json({
      error: {
        message: "请使用 POST 请求调用 /v1/responses。",
        type: "method_not_allowed",
      },
    });
  }

  const chatBody = responsesToChatCompletions(req.body || {});
  if (!chatBody.model) {
    return res.status(400).json({
      error: {
        message: "请显式提供 model 参数，FlowAPI 不会自动替换模型。",
        type: "invalid_request_error",
      },
    });
  }

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
        error: {
          message: "FlowAPI Responses 适配失败，请检查 API Key、Base URL 和模型名。",
          type: "flowapi_responses_adapter_error",
        },
      });
    }

    const response = chatCompletionToResponse(chatBody, chatJson);
    response.id = appendRouteCodeToRequestId(response.id || `resp_${Date.now().toString(36)}`, String(chatJson?.token_router?.request_id || chatJson?.token_router?.route_code || "").trim().slice(-1));
    return res.status(200).json(response);
  } catch (error) {
    console.error("[v1/responses]", error);
    return res.status(502).json({
      error: {
        message: "FlowAPI Responses 适配服务暂时不可用，请稍后重试。",
        type: "upstream_error",
      },
    });
  }
}
