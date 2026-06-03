export function isLocalDemoRequest(req) {
  if (process.env.FLOWAPI_ENABLE_LOCAL_DEMO !== "true") return false;
  const queryDemo = req?.query?.demo === "1" || req?.query?.demo === "true";
  const headerDemo = req?.headers?.["x-flowapi-demo"] === "1" || req?.headers?.["x-flowapi-demo"] === "true";
  return Boolean(queryDemo || headerDemo);
}

export function buildLocalDemoCalls() {
  const models = [
    { model: "gpt-4o-mini", provider: "OpenAI", inputPricePerM: 1.2, outputPricePerM: 4.8, baseTokens: 8200 },
    { model: "deepseek-chat", provider: "DeepSeek", inputPricePerM: 0.8, outputPricePerM: 2.4, baseTokens: 12600 },
    { model: "claude-3-5-sonnet", provider: "Anthropic", inputPricePerM: 18, outputPricePerM: 90, baseTokens: 5200 },
    { model: "gemini-1.5-pro", provider: "Google", inputPricePerM: 8, outputPricePerM: 24, baseTokens: 6800 },
    { model: "qwen-max", provider: "Qwen", inputPricePerM: 6, outputPricePerM: 18, baseTokens: 7400 },
  ];
  const now = new Date();
  return Array.from({ length: 36 }, (_, index) => {
    const model = models[index % models.length];
    const createdAt = new Date(now);
    createdAt.setDate(now.getDate() - Math.floor(index / 5));
    createdAt.setHours(Math.max(9, 22 - (index % 7) * 2), (index * 13) % 60, 0, 0);
    const promptTokens = Math.round(model.baseTokens * (0.46 + (index % 4) * 0.05));
    const completionTokens = Math.round(model.baseTokens * (0.28 + (index % 3) * 0.06));
    const tokens = promptTokens + completionTokens;
    const officialCost = ((promptTokens / 1000000) * model.inputPricePerM) + ((completionTokens / 1000000) * model.outputPricePerM);
    const cost = Number((officialCost * 0.42).toFixed(4));
    return {
      id: `demo-call-${index + 1}`,
      requestId: `demo-req-${String(index + 1).padStart(4, "0")}`,
      apiKeyId: index % 3 === 0 ? "demo_key_backup" : "demo_key_primary",
      requestedModel: model.model,
      routedModel: model.model,
      provider: model.provider,
      createdAt: createdAt.toISOString(),
      status: 200,
      promptTokens,
      completionTokens,
      tokens,
      cost,
      originalCostCny: Number(officialCost.toFixed(4)),
      savedCostCny: Number(Math.max(0, officialCost - cost).toFixed(4)),
      discountRate: 0.42,
      inputPricePerM: Number((model.inputPricePerM * 0.42).toFixed(4)),
      outputPricePerM: Number((model.outputPricePerM * 0.42).toFixed(4)),
      latencyMs: 720 + (index % 9) * 135,
      endpoint: "/v1/chat/completions",
      channelName: "FlowAPI 智能路由",
      channelType: "relay",
      upstreamHost: "flowapi.local-demo",
      finishReason: "stop",
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export function buildLocalDemoDashboard(base = {}) {
  const calls = buildLocalDemoCalls();
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - 18);
  const totalSpend = calls.reduce((sum, call) => sum + Number(call.cost || 0), 0);
  return {
    ...base,
    id: base.id || "local_demo_customer",
    name: base.name || "FlowAPI 用户",
    email: base.email || "local-demo@flowapi.fun",
    balance: 58.8,
    paidBalance: 56.8,
    temporaryBalance: 2,
    availableBalance: 58.8,
    totalSpend: Number(totalSpend.toFixed(2)),
    createdAt: createdAt.toISOString(),
    apiKeys: [
      { id: "demo_key_primary", label: "生产调用 Key", token: "sk-local-demo-primary", createdAt: createdAt.toISOString(), lastUsedAt: calls[0]?.createdAt || null },
      { id: "demo_key_backup", label: "测试环境 Key", token: "sk-local-demo-backup", createdAt: createdAt.toISOString(), lastUsedAt: calls[2]?.createdAt || null },
    ],
    calls,
    source: "local-demo",
  };
}
