/**
 * /api/analytics/model-usage-rank
 * FlowAPI internal model usage ranking based on real call logs.
 * Data source: New API logs / customer call data.
 */

import { getNewApiUsage } from "@/lib/new-api/client";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const period = req.query.period || "week"; // today | week | month

  try {
    // Fetch real usage data from New API
    let rows;
    try {
      const usage = await getNewApiUsage({});
      rows = Array.isArray(usage?.data)
        ? usage.data
        : Array.isArray(usage?.items)
          ? usage.items
          : [];
    } catch {
      rows = [];
    }

    if (!rows.length) {
      return res.status(200).json({
        updatedAt: new Date().toISOString(),
        period,
        dataSource: "empty",
        models: [],
        message: "暂无调用数据，开始使用 FlowAPI 后将自动生成排名。",
      });
    }

    // Filter by period
    const now = new Date();
    const periodStart = new Date();
    if (period === "today") {
      periodStart.setHours(0, 0, 0, 0);
    } else if (period === "week") {
      periodStart.setDate(now.getDate() - 7);
    } else if (period === "month") {
      periodStart.setDate(1);
      periodStart.setHours(0, 0, 0, 0);
    }

    const filteredRows = rows.filter((row) => {
      const ts = row.createdAt || row.created_at || row.timestamp;
      if (!ts) return false;
      return new Date(ts) >= periodStart;
    });

    if (!filteredRows.length) {
      return res.status(200).json({
        updatedAt: new Date().toISOString(),
        period,
        dataSource: "empty",
        models: [],
        message: `该时段暂无调用数据。`,
      });
    }

    // Aggregate by model
    const modelMap = new Map();
    filteredRows.forEach((row) => {
      const model = row.model || row.routedModel || row.requestedModel || "Unknown";
      const provider = row.provider || detectProviderFromModel(model);
      if (!modelMap.has(model)) {
        modelMap.set(model, {
          model,
          provider,
          requests: 0,
          tokens: 0,
          costCny: 0,
        });
      }
      const entry = modelMap.get(model);
      entry.requests += 1;
      entry.tokens += Number(row.tokens || row.totalTokens || row.total_tokens || 0);
      entry.costCny += Number(row.cost || row.costCny || row.cost_cny || 0);
    });

    const totalTokens = Array.from(modelMap.values()).reduce((s, m) => s + m.tokens, 0);
    const totalCost = Array.from(modelMap.values()).reduce((s, m) => s + m.costCny, 0);

    const models = Array.from(modelMap.values())
      .sort((a, b) => b.tokens - a.tokens)
      .map((m, i) => ({
        rank: i + 1,
        model: m.model,
        provider: m.provider,
        requests: m.requests,
        tokens: m.tokens,
        costCny: Number(m.costCny.toFixed(2)),
        share: totalTokens > 0 ? Number(((m.tokens / totalTokens) * 100).toFixed(1)) : 0,
        shareCost: totalCost > 0 ? Number(((m.costCny / totalCost) * 100).toFixed(1)) : 0,
      }));

    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      period,
      dataSource: "real",
      models,
    });
  } catch (e) {
    console.error("[model-usage-rank]", e);
    return res.status(200).json({
      updatedAt: new Date().toISOString(),
      period,
      dataSource: "error",
      models: [],
      message: "数据同步中，请稍后查看。",
    });
  }
}

function detectProviderFromModel(model) {
  const lower = String(model).toLowerCase();
  if (lower.includes("deepseek")) return "DeepSeek";
  if (lower.includes("claude")) return "Anthropic";
  if (lower.includes("gpt") || lower.includes("openai")) return "OpenAI";
  if (lower.includes("gemini")) return "Google";
  if (lower.includes("qwen")) return "Alibaba";
  if (lower.includes("kimi") || lower.includes("moonshot")) return "Moonshot";
  if (lower.includes("minimax")) return "MiniMax";
  if (lower.includes("llama") || lower.includes("meta")) return "Meta";
  if (lower.includes("mistral")) return "Mistral";
  if (lower.includes("cohere")) return "Cohere";
  if (lower.includes("grok") || lower.includes("xai")) return "xAI";
  return "FlowAPI";
}
