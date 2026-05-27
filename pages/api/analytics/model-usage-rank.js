/**
 * /api/analytics/model-usage-rank
 * FlowAPI internal model usage ranking based on real call logs.
 * Data source: New API logs / customer call data.
 */

import { getNewApiUsage } from "@/lib/new-api/client";
import { formatTokens } from "@/lib/model-format";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const period = ["today", "week", "month"].includes(req.query.period) ? req.query.period : "week";

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
        success: true,
        source: "empty",
        updatedAt: null,
        period,
        dataSource: "empty",
        models: [],
        message: "暂无站内模型调用数据",
      });
    }

    const now = Date.now();
    const day = 24 * 60 * 60 * 1000;
    const periodStart = new Date(now);
    const previousStart = new Date(now);
    const previousEnd = new Date(now);
    if (period === "today") {
      periodStart.setHours(0, 0, 0, 0);
      previousStart.setDate(periodStart.getDate() - 1);
      previousStart.setHours(0, 0, 0, 0);
      previousEnd.setTime(periodStart.getTime());
    } else if (period === "week") {
      periodStart.setTime(now - 7 * day);
      previousStart.setTime(now - 14 * day);
      previousEnd.setTime(now - 7 * day);
    } else if (period === "month") {
      periodStart.setDate(1);
      periodStart.setHours(0, 0, 0, 0);
      previousStart.setMonth(periodStart.getMonth() - 1);
      previousStart.setDate(1);
      previousStart.setHours(0, 0, 0, 0);
      previousEnd.setTime(periodStart.getTime());
    }

    const inWindow = (row, start, end = new Date()) => {
      const ts = row.createdAt || row.created_at || row.timestamp;
      if (!ts) return false;
      const time = new Date(ts);
      return time >= start && time < end;
    };

    const filteredRows = rows.filter((row) => inWindow(row, periodStart));
    const previousRows = rows.filter((row) => inWindow(row, previousStart, previousEnd));

    if (!filteredRows.length) {
      return res.status(200).json({
        success: true,
        source: "empty",
        updatedAt: null,
        period,
        dataSource: "empty",
        models: [],
        message: "暂无站内模型调用数据",
      });
    }

    const aggregate = (items) => {
      const modelMap = new Map();
      items.forEach((row) => {
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
        entry.tokens += getRowTokens(row);
        entry.costCny += Number(row.cost || row.costCny || row.cost_cny || 0);
      });
      return modelMap;
    };

    const modelMap = aggregate(filteredRows);
    const previousMap = aggregate(previousRows);
    const modelRows = Array.from(modelMap.values()).filter((item) => Number(item.tokens) > 0);

    if (!modelRows.length) {
      return res.status(200).json({
        success: true,
        source: "empty",
        updatedAt: null,
        period,
        dataSource: "empty",
        models: [],
        message: "暂无站内模型调用数据",
      });
    }

    const totalTokens = modelRows.reduce((s, m) => s + m.tokens, 0);
    const totalCost = modelRows.reduce((s, m) => s + m.costCny, 0);

    const models = modelRows
      .sort((a, b) => b.tokens - a.tokens)
      .map((m, i) => ({
        rank: i + 1,
        model: m.model,
        provider: m.provider,
        requests: m.requests,
        tokens: m.tokens,
        tokensLabel: formatTokens(m.tokens),
        costCny: Number(m.costCny.toFixed(2)),
        share: totalTokens > 0 ? Number(((m.tokens / totalTokens) * 100).toFixed(1)) : 0,
        shareCost: totalCost > 0 ? Number(((m.costCny / totalCost) * 100).toFixed(1)) : 0,
        changePercent: getChangePercent(m, previousMap),
        isNew: !previousMap.get(m.model),
      }))
      .slice(0, 20);

    return res.status(200).json({
      success: true,
      source: "real",
      updatedAt: new Date().toISOString(),
      period,
      dataSource: "real",
      models,
    });
  } catch (e) {
    console.error("[model-usage-rank]", e);
    return res.status(200).json({
      success: true,
      source: "empty",
      updatedAt: null,
      period,
      dataSource: "error",
      models: [],
      message: "数据同步中，请稍后查看。",
    });
  }
}

function getChangePercent(model, previousMap) {
  const previous = previousMap.get(model.model);
  if (!previous || !Number(previous.tokens)) return null;
  return Math.round(((model.tokens - previous.tokens) / previous.tokens) * 100);
}

function getRowTokens(row) {
  const directTotal = Number(row.tokens || row.totalTokens || row.total_tokens || 0);
  if (Number.isFinite(directTotal) && directTotal > 0) return directTotal;
  return Number(row.promptTokens || row.prompt_tokens || 0) + Number(row.completionTokens || row.completion_tokens || 0);
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
