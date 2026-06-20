import { getContent } from "@/lib/content-cms";
import { getDashboard, listCustomerCalls, listCustomers } from "@/lib/customer-store";
import { requireCustomerSession } from "@/lib/session";
import { buildSavingsRank, calculateCustomerSavings, normalizeSavingsPeriod } from "@/lib/analytics/savings";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = requireCustomerSession(req, res);
  if (!session) return;

  const period = normalizeSavingsPeriod(req.query.period || "30d");
  const customer = await getDashboard(session.customerId);
  if (!customer) return res.status(404).json({ error: "用户不存在" });
  const customerCalls = await listCustomerCalls(session.customerId);

  const modelConfigs = getContent("models");
  const savings = calculateCustomerSavings({
    calls: customerCalls,
    modelConfigs,
    period,
  });

  if (!savings.hasRealCalls || !savings.hasSavingsData) {
    return res.status(200).json({
      success: true,
      source: "empty",
      period,
      message: savings.hasRealCalls
        ? "部分模型官方价格未配置，暂不参与节省金额计算。"
        : "暂无节省金额数据",
      summary: null,
      savingRank: null,
      modelSavings: [],
      callSavings: [],
      skippedNoOfficialPrice: savings.skippedNoOfficialPrice,
      updatedAt: new Date().toISOString(),
    });
  }

  let savingRank = null;
  try {
    const customers = await listCustomers();
    const rankedSavings = await Promise.all((customers || []).map(async (item) => {
      const calls = await listCustomerCalls(item.id);
      const result = calculateCustomerSavings({
        calls,
        modelConfigs,
        period: "all",
      });
      return {
        customerId: item.id,
        savedAmountCny: Number(result.summary?.savedAmountCny || 0),
      };
    }));
    savingRank = buildSavingsRank(session.customerId, rankedSavings);
  } catch {
    savingRank = null;
  }

  return res.status(200).json({
    success: true,
    source: "real",
    period,
    updatedAt: new Date().toISOString(),
    summary: savings.summary,
    savingRank,
    modelSavings: savings.modelSavings,
    callSavings: savings.callSavings.slice(0, 50),
    skippedNoOfficialPrice: savings.skippedNoOfficialPrice,
  });
}
