import { getDashboard } from "@/lib/customer-store";
import { getSessionPayload } from "@/lib/session";

function buildRanking(customer = {}) {
  const calls = Array.isArray(customer.calls) ? customer.calls : [];
  const totalSpendCny = Number(customer.totalSpend || calls.reduce((sum, call) => sum + Number(call.cost || 0), 0));
  const totalTokens = calls.reduce((sum, call) => sum + Number(call.tokens || 0), 0);
  const spendPercentileTop = totalSpendCny >= 300 ? 8 : totalSpendCny >= 100 ? 18 : totalSpendCny > 0 ? 36 : 88;
  const tokenPercentileTop = totalTokens >= 1000000 ? 1 : totalTokens >= 300000 ? 9 : totalTokens > 0 ? 28 : 92;

  return {
    totalSpendCny,
    totalTokens,
    spendPercentileTop,
    tokenPercentileTop,
    spendBeatsUsersPercent: Math.max(1, 100 - spendPercentileTop),
    tokenBeatsUsersPercent: Math.max(1, 100 - tokenPercentileTop),
    rankUpdatedAt: new Date().toISOString(),
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = getSessionPayload(req);
  const customerId = session?.customerId || req.query.customerId;
  if (!customerId) return res.status(401).json({ error: "请先登录后再查看资产排名" });

  if (session?.customerId && req.query.customerId && req.query.customerId !== session.customerId) {
    return res.status(403).json({ error: "无权查看其他用户的资产排名" });
  }

  const customer = await getDashboard(customerId);
  if (!customer) return res.status(404).json({ error: "用户不存在" });
  return res.status(200).json(buildRanking(customer));
}
