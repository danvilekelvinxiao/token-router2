import { findCustomerByToken } from "@/lib/customer-store";
import { sanitizeSecretText } from "@/lib/safe-upstream-url";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

const MODEL_MAP = {
  Qwen: "qwen/qwen3-32b",
  "qwen/qwen3-32b": "qwen/qwen3-32b",
  "GPT-4o": "gpt-4o-mini",
  "GPT-4o mini": "gpt-4o-mini",
  "GPT4o mini": "gpt-4o-mini",
  "GPT5.5": "gpt-5.5",
  "GPT5.4 mini": "gpt-5.4-mini",
  "GPT5.4 Pro": "gpt-5.4-pro",
  "gpt-5.5": "gpt-5.5",
  "gpt-4o-mini": "gpt-4o-mini",
  "gpt-5.4-mini": "gpt-5.4-mini",
  "gpt-5.4-pro": "gpt-5.4-pro",
};

function getClientToken(req) {
  const auth = req.headers.authorization || "";
  let token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : String(req.headers["x-api-key"] || "").trim();
  while (token.toLowerCase().startsWith("bearer ")) token = token.slice(7).trim();
  return token.replace(/^["']|["']$/g, "");
}

function getInternalChatUrl() {
  const configured = process.env.INTERNAL_FLOWAPI_BASE_URL?.replace(/\/+$/, "");
  if (configured) return `${configured}/api/v1/chat/completions`;
  const port = process.env.FLOWAPI_INTERNAL_PORT || process.env.PORT || "3000";
  return `http://127.0.0.1:${port}/api/v1/chat/completions`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "只支持 POST 请求" });
  }

  const prompt = req.body?.prompt?.trim();
  const selectedModel = req.body?.model;

  if (!prompt) {
    return res.status(400).json({ error: "请输入问题" });
  }

  if (!selectedModel || !MODEL_MAP[selectedModel]) {
    return res.status(400).json({ error: "模型参数无效" });
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

  try {
    const response = await fetch(getInternalChatUrl(), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${clientToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL_MAP[selectedModel],
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({
        error: "FlowAPI 请求未完成，请稍后重试或联系管理员排查。",
        code: data.error?.type || data.error?.code || "FLOWAPI_CHAT_FAILED",
        requestId: data.token_router?.request_id || data.request_id || "",
      });
    }

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: "模型服务没有返回有效内容，请稍后重试。" });
    }

    return res.status(200).json({ content });
  } catch (error) {
    return res.status(500).json({
      error: "FlowAPI 服务暂时不可用，请稍后重试。",
      detail: process.env.NODE_ENV === "production" ? undefined : sanitizeSecretText(error.message || ""),
    });
  }
}
