/**
 * /api/newapi/usage/forecast
 * Returns token forecast data based on real user usage.
 * Data source: New API logs via getNewApiUsage().
 * Fallback: empty forecast with "insufficient data" message.
 */

import { getNewApiUsage } from "@/lib/new-api/client";
import { generateTokenForecast } from "@/lib/analytics/token-forecast";
import { requireAdmin } from "@/lib/admin-auth";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireAdmin(req, res))) return;

  try {
    const { tokenId, days = "14" } = req.query;
    const lookbackDays = Math.min(90, Math.max(7, Number(days) || 14));

    // Fetch real usage from New API
    let usageData;
    try {
      const usage = await getNewApiUsage({
        tokenId: tokenId || undefined,
      });
      const rows = Array.isArray(usage?.data)
        ? usage.data
        : Array.isArray(usage?.items)
          ? usage.items
          : [];

      usageData = rows;
    } catch {
      usageData = [];
    }

    if (!usageData || usageData.length === 0) {
      return res.status(200).json({
        success: true,
        dataSource: "empty",
        message: "暂无足够数据生成预测，完成更多调用后将自动生成 Token 消耗预测。",
        recentUsage: [],
        forecast: [],
        balanceForecast: null,
      });
    }

    // Build daily usage from logs
    const dailyMap = new Map();
    const now = new Date();
    for (let i = lookbackDays - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, actualTokens: 0, costCny: 0, mainModel: "" });
    }

    const modelCounts = new Map();
    usageData.forEach((row) => {
      const ts = row.createdAt || row.created_at || row.timestamp;
      if (!ts) return;
      const dateKey = new Date(ts).toISOString().slice(0, 10);
      const day = dailyMap.get(dateKey);
      if (!day) return;

      const tokens = Number(row.tokens || row.totalTokens || row.total_tokens || 0);
      const cost = Number(row.cost || row.costCny || row.cost_cny || 0);
      day.actualTokens += tokens;
      day.costCny += cost;

      const model = row.model || row.routedModel || row.requestedModel || "";
      if (model) {
        modelCounts.set(model, (modelCounts.get(model) || 0) + 1);
      }
    });

    // Find most used model
    let mainModel = "DeepSeek Chat";
    let maxCount = 0;
    modelCounts.forEach((count, model) => {
      if (count > maxCount) {
        maxCount = count;
        mainModel = model;
      }
    });

    const recentUsage = Array.from(dailyMap.values()).map((day) => ({
      ...day,
      costCny: Number(day.costCny.toFixed(4)),
      mainModel: mainModel,
    }));

    // Generate forecast from real data
    const activeDays = recentUsage.filter((d) => d.actualTokens > 0);
    if (activeDays.length < 2) {
      return res.status(200).json({
        success: true,
        dataSource: "real",
        message: "数据不足，需要至少 2 天有调用记录才能生成预测。",
        recentUsage,
        forecast: [],
        balanceForecast: null,
      });
    }

    const tokenForecast = generateTokenForecast(
      activeDays.map((d) => ({ date: d.date, tokens: d.actualTokens })),
    );

    const futureForecast = tokenForecast.filter((p) => p.isFuture);
    const forecast = futureForecast.map((p) => ({
      date: p.date,
      predictedTokens: p.predicted || 0,
      predictedCostCny: Number(((p.predicted || 0) * 0.000013).toFixed(4)),
    }));

    // Balance forecast
    const last7Active = activeDays.slice(-7);
    const avgDailyTokens =
      last7Active.reduce((s, d) => s + d.actualTokens, 0) / Math.max(1, last7Active.length);
    const avgDailyCost =
      last7Active.reduce((s, d) => s + d.costCny, 0) / Math.max(1, last7Active.length);

    const next7DaysTokens = Math.round(
      forecast.reduce((s, f) => s + f.predictedTokens, 0),
    );
    const next7DaysCostCny = Number(
      forecast.reduce((s, f) => s + f.predictedCostCny, 0).toFixed(2),
    );

    const balanceForecast = {
      estimatedDaysLeft: avgDailyCost > 0 ? Math.max(1, Math.floor(50 / avgDailyCost)) : 30,
      next7DaysTokens,
      next7DaysCostCny,
      suggestedRechargeCny: avgDailyCost > 0
        ? Math.max(50, Math.ceil((avgDailyCost * 30) / 10) * 10)
        : 50,
    };

    return res.status(200).json({
      success: true,
      dataSource: "real",
      recentUsage,
      forecast,
      balanceForecast,
      updatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[forecast]", e);
    return res.status(200).json({
      success: true,
      dataSource: "error",
      message: "数据同步中，请稍后查看预测。",
      recentUsage: [],
      forecast: [],
      balanceForecast: null,
    });
  }
}
