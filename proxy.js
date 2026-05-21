import { NextResponse } from "next/server";

const NEW_API_BASE = (() => {
  try { return (process.env.NEW_API_BASE_URL || "").replace(/\/+$/, ""); } catch { return ""; }
})();

// ---- helpers for /v1/responses adaptation ----

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

function inputToMessages(input, instructions) {
  const messages = [];
  if (instructions) messages.push({ role: "system", content: normalizeContent(instructions) });
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
  if (messages.length === 0) messages.push({ role: "user", content: "ping" });
  return messages;
}

function normalizeMessages(messages = []) {
  if (!Array.isArray(messages)) return [];
  return messages
    .map((m) => {
      const role = m?.role === "assistant" ? "assistant" : m?.role === "system" ? "system" : "user";
      const content = normalizeContent(m?.content || m?.text || m?.input_text);
      return content ? { role, content } : null;
    })
    .filter(Boolean);
}

function responsesToChatCompletions(body = {}) {
  const chatMessages = normalizeMessages(body.messages);
  const messages = chatMessages.length > 0
    ? chatMessages
    : inputToMessages(body.input, body.instructions);

  let model = String(body.model || "deepseek-chat").trim().toLowerCase();
  if (model.includes("reasoner") || model.includes("r1")) model = "deepseek-reasoner";
  else if (model.includes("qwen") || model.includes("alibaba")) model = "qwen/qwen3-32b";
  else if (model.includes("claude") || model.includes("anthropic")) model = "anthropic/claude-3.5-haiku";
  else if (model.includes("gpt-4o-mini")) model = "openai/gpt-4o-mini";
  else if (!model.includes("deepseek")) model = "deepseek-chat";

  return {
    model,
    messages,
    ...(body.temperature != null ? { temperature: body.temperature } : {}),
    ...(body.max_output_tokens ? { max_tokens: body.max_output_tokens } : {}),
  };
}

function chatCompletionToResponses(chatBody, chatResponse) {
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
    output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text }] }],
    output_text: text,
    usage: { input_tokens: usage.prompt_tokens || 0, output_tokens: usage.completion_tokens || 0, total_tokens: usage.total_tokens || 0 },
  };
}

// ---- main proxy handler ----

export function proxy(request) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get("host") || "";

  // www -> apex redirect
  if (host.toLowerCase() === "www.flowapi.fun") {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "flowapi.fun";
    url.port = "";
    return NextResponse.redirect(url, 308);
  }

  // ---- /v1/* proxy to New API ----
  if (pathname.startsWith("/v1/") && NEW_API_BASE) {
    const method = request.method;

    // /v1/responses: adapt to chat/completions
    if (pathname === "/v1/responses" && method === "POST") {
      return handleResponses(request);
    }

    // All other /v1/*: direct proxy
    const upstreamUrl = `${NEW_API_BASE}${pathname}${request.nextUrl.search || ""}`;

    const forwardHeaders = new Headers();
    request.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "host" || lower === "x-forwarded-host") return;
      forwardHeaders.set(key, value);
    });
    forwardHeaders.set("x-forwarded-for", request.headers.get("x-forwarded-for") || request.ip || "127.0.0.1");
    forwardHeaders.set("x-forwarded-proto", request.nextUrl.protocol.replace(":", ""));

    return fetch(upstreamUrl, {
      method,
      headers: forwardHeaders,
      body: method !== "GET" && method !== "HEAD" ? request.body : undefined,
    })
      .then((upstreamRes) => {
        const resHeaders = new Headers();
        upstreamRes.headers.forEach((value, key) => {
          const lower = key.toLowerCase();
          if (lower === "transfer-encoding" && upstreamRes.headers.get("content-length")) return;
          resHeaders.set(key, value);
        });

        const ct = upstreamRes.headers.get("content-type") || "";
        if (ct.includes("text/event-stream")) {
          resHeaders.set("Cache-Control", "no-cache, no-transform");
          resHeaders.set("Connection", "keep-alive");
          resHeaders.set("X-Accel-Buffering", "no");
        }

        return new NextResponse(upstreamRes.body, {
          status: upstreamRes.status,
          statusText: upstreamRes.statusText,
          headers: resHeaders,
        });
      })
      .catch((error) => {
        console.error("[proxy /v1/*]", error);
        return new NextResponse(JSON.stringify({
          error: { message: "上游 API 不可用，请稍后重试。", type: "upstream_unavailable" },
        }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      });
  }

  return NextResponse.next();
}

// ---- /v1/responses handler ----

async function handleResponses(request) {
  try {
    const bodyText = await request.text();
    let body;
    try { body = JSON.parse(bodyText); } catch { body = {}; }

    const chatBody = responsesToChatCompletions(body);
    const chatUrl = `${NEW_API_BASE}/v1/chat/completions`;

    const chatRes = await fetch(chatUrl, {
      method: "POST",
      headers: {
        "Authorization": request.headers.get("authorization") || "",
        "Content-Type": "application/json",
        "x-forwarded-for": request.headers.get("x-forwarded-for") || request.ip || "127.0.0.1",
      },
      body: JSON.stringify(chatBody),
    });

    if (!chatRes.ok) {
      const errText = await chatRes.text();
      let errJson;
      try { errJson = JSON.parse(errText); } catch { errJson = { error: { message: errText } }; }
      return new NextResponse(JSON.stringify(errJson), {
        status: chatRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    const chatJson = await chatRes.json();
    const responsesBody = chatCompletionToResponses(chatBody, chatJson);
    return new NextResponse(JSON.stringify(responsesBody), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[proxy /v1/responses]", error);
    return new NextResponse(JSON.stringify({
      error: { message: "FlowAPI Responses 适配失败，请稍后重试。", type: "upstream_error" },
    }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const config = {
  matcher: "/:path*",
};
