const MODEL_MAP = {
  DeepSeek: "deepseek/deepseek-chat",
  Qwen: "qwen/qwen3-32b",
  "GPT-4o": "openai/gpt-4o-mini",
};

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

  if (!process.env.OPENROUTER_API_KEY) {
    return res.status(500).json({ error: "缺少 OpenRouter API Key" });
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.PROXY_HTTP_REFERER || "http://localhost:3000",
        "X-Title": process.env.PROXY_TITLE || "Token Router AI",
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
        error: data.error?.message || "OpenRouter 请求失败",
      });
    }

    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({ error: "OpenRouter 没有返回有效内容" });
    }

    return res.status(200).json({ content });
  } catch (error) {
    return res.status(500).json({
      error: error.message || "服务暂时不可用",
    });
  }
}
