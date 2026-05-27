/**
 * GET /api/newapi/keys/:keyId/usage
 * Returns per-key usage analytics: metrics, trends, model ranking, call records.
 * Phase 1: mock data with realistic structure. Ready for real New API integration.
 */
import { getCustomer } from "@/lib/customer-store";
import { assertCustomerOwner } from "@/lib/session";

function maskToken(token = "") {
  if (token.length <= 14) return token;
  return `${token.slice(0, 8)}${"*".repeat(token.length - 14)}${token.slice(-6)}`;
}

function makeDate(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

function mockTrend(days) {
  return Array.from({ length: days }, (_, i) => {
    const input = Math.floor(Math.random() * 8000) + 2000;
    const output = Math.floor(Math.random() * 12000) + 3000;
    return {
      date: new Date(Date.now() - (days - 1 - i) * 86400000).toISOString().slice(0, 10),
      inputTokens: input,
      outputTokens: output,
      totalTokens: input + output,
      spendCny: Number(((input + output) / 1_000_000 * 5.5).toFixed(6)),
    };
  });
}

const MOCK_MODELS = [
  { rank: 1, model: "DeepSeek V4 Flash", provider: "DeepSeek", requests: 240, tokens: 680000, spendCny: 8.2, share: 44 },
  { rank: 2, model: "Claude Sonnet 4.6", provider: "Anthropic", requests: 88, tokens: 320000, spendCny: 6.4, share: 34 },
  { rank: 3, model: "GPT-5.3-Codex", provider: "OpenAI", requests: 52, tokens: 156000, spendCny: 3.12, share: 17 },
  { rank: 4, model: "GPT-5.5", provider: "OpenAI", requests: 12, tokens: 24000, spendCny: 0.92, share: 5 },
];

const MOCK_CALLS = Array.from({ length: 8 }, (_, i) => ({
  id: `call_mock_${i}`,
  createdAt: new Date(Date.now() - i * 3600000 * (i + 1)).toISOString(),
  model: MOCK_MODELS[i % 4].model,
  provider: MOCK_MODELS[i % 4].provider,
  inputTokens: Math.floor(Math.random() * 2000) + 100,
  outputTokens: Math.floor(Math.random() * 3000) + 200,
  totalTokens: 0,
  costCny: Number((Math.random() * 0.05 + 0.001).toFixed(6)),
  latencyMs: Math.floor(Math.random() * 2000) + 400,
  status: i === 2 ? "failed" : "success",
  requestIp: "47.238.81.210",
  originalInputPricePerM: 5,
  originalOutputPricePerM: 30,
  discountRate: 0.88,
  finalInputPricePerM: 4.4,
  finalOutputPricePerM: 26.4,
})).map((c) => ({ ...c, totalTokens: c.inputTokens + c.outputTokens }));

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { keyId } = req.query || {};
  if (!keyId) return res.status(400).json({ error: "缺少 keyId" });

  try {
    // Find the key in customer store
    const customer = await getCustomer("cus_admin");
    const apiKeys = customer?.apiKeys || [];
    const key = apiKeys.find((k) => k.id === keyId);
    if (!key) {
      return res.status(200).json({
        success: true,
        source: "empty",
        message: "该 API Key 已删除，无法查看使用数据。",
        key: null,
      });
    }

    const totalRequests = 428;
    const successCount = 425;
    const totalTokens = 1280000;
    const totalSpend = 18.64;

    return res.status(200).json({
      success: true,
      source: "mock",
      key: {
        id: key.id,
        name: key.label || "默认 API 密匙",
        maskedKey: maskToken(key.token),
        status: key.disabledAt ? "disabled" : (key.expiresAt && new Date(key.expiresAt) < new Date() ? "expired" : "active"),
        group: key.modelGroup || "default",
        createdAt: key.createdAt || new Date().toISOString(),
        lastUsedAt: makeDate(0),
        expiresAt: key.expiresAt || null,
      },
      summary: {
        totalSpendCny: totalSpend,
        totalTokens,
        totalRequests,
        successRate: Number(((successCount / totalRequests) * 100).toFixed(1)),
        avgLatencyMs: 820,
      },
      periodUsage: {
        today: { spendCny: 0.86, tokens: 29200, requests: 47 },
        week: { spendCny: 6.42, tokens: 218000, requests: 392 },
        month: { spendCny: 28.60, tokens: 1020000, requests: 1846 },
      },
      limits: {
        remainingBalanceCny: 20,
        totalQuotaCny: 100,
        dailyRequestLimit: null,
        dailyTokenLimit: null,
        rpm: null,
        tpm: null,
        allowedModels: ["deepseek/deepseek-chat", "deepseek-reasoner"],
      },
      trends: mockTrend(7),
      modelRanking: MOCK_MODELS,
      recentCalls: MOCK_CALLS,
    });
  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
