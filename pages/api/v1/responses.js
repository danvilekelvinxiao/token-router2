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

import { MODEL_CATALOG } from "@/lib/models";

const SUPPORTED_MODEL_IDS = new Set(MODEL_CATALOG.map((model) => model.modelId));

function setCors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
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
  if (SUPPORTED_MODEL_IDS.has(rawModel)) return rawModel;

  const name = rawModel.toLowerCase();

  if (name.includes("reasoner") || name.includes("r1")) return "deepseek-reasoner";
  if (name.includes("deepseek")) return "deepseek-chat";
  if (name.includes("qwen") || name.includes("alibaba")) return "qwen/qwen3-32b";
  if (name.includes("claude") || name.includes("anthropic")) return "anthropic/claude-3.5-haiku";
  if (name.includes("gpt-4o-mini")) return "openai/gpt-4o-mini";
  if (name.includes("gpt") || name.includes("openai") || name.includes("codex")) return "deepseek-chat";

  return "deepseek-chat";
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

function getInternalChatUrl(req) {
  const configured = process.env.INTERNAL_FLOWAPI_BASE_URL?.replace(/\/+$/, "");
  if (configured) return `${configured}/api/v1/chat/completions`;

  const host = req.headers.host || "localhost:3000";
  const protocol = host.includes("localhost") || host.includes("127.0.0.1") ? "http" : "https";
  return `${protocol}://${host}/api/v1/chat/completions`;
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

  try {
    const chatRes = await fetch(getInternalChatUrl(req), {
      method: "POST",
      headers: {
        Authorization: req.headers.authorization || "",
        "Content-Type": "application/json",
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

    return res.status(200).json(chatCompletionToResponse(chatBody, chatJson));
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
