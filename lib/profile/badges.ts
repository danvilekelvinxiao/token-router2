import { calculateCustomerSavings } from "@/lib/analytics/savings";
import { getContent } from "@/lib/content-cms";
import { getDashboard, listCustomers } from "@/lib/customer-store";

type BadgeType =
  | "spend"
  | "token"
  | "model_token"
  | "model_spend"
  | "request_count"
  | "saving"
  | "referral"
  | "activity";

type BadgeLevel = "legendary" | "diamond" | "platinum" | "red" | "gold" | "normal";

type UserBadge = {
  id: string;
  title: string;
  type: BadgeType;
  level: BadgeLevel;
  rank?: number | null;
  percentileTop?: number | null;
  metricValue: number;
  metricUnit: "¥" | "Token" | "次" | "人";
  model?: string | null;
  provider?: string | null;
  description: string;
  displayPriority: number;
  animated: boolean;
  highlight: boolean;
  updatedAt: string;
  category: "high_value" | "model" | "asset" | "growth";
  dimension: string;
  period: string;
};

function toNumber(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeModel(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\s_:/.-]+/g, "")
    .trim();
}

function ordinal(rank: number) {
  return ["", "第一", "第二", "第三", "第四", "第五", "第六", "第七", "第八", "第九", "第十"][rank] || `第 ${rank}`;
}

function getBadgeRankInfo(rank: number, totalUsers: number) {
  if (!rank || !totalUsers) return null;
  if (rank <= 10) {
    return {
      level: rank === 1 ? "legendary" : rank <= 3 ? "diamond" : "platinum",
      label: ordinal(rank),
      rank,
      percentileTop: null,
      rankScore: rank === 1 ? 100 : rank <= 3 ? 90 : 80,
      animated: true,
      highlight: rank === 1,
    };
  }

  if (totalUsers < 20) return null;
  const percentileTop = Math.ceil((rank / totalUsers) * 100);
  if (percentileTop > 10) return null;
  if (percentileTop <= 1) {
    return { level: "red", label: "前 1%", rank, percentileTop: 1, rankScore: 70, animated: false, highlight: true };
  }
  if (percentileTop <= 5) {
    return { level: "gold", label: "前 5%", rank, percentileTop: 5, rankScore: 50, animated: false, highlight: false };
  }
  return { level: "normal", label: "前 10%", rank, percentileTop: 10, rankScore: 30, animated: false, highlight: false };
}

function getTypeWeight(type: BadgeType) {
  return {
    spend: 20,
    model_token: 18,
    token: 15,
    saving: 12,
    request_count: 10,
    model_spend: 9,
    referral: 8,
    activity: 6,
  }[type] || 0;
}

function rankMetric(items: Array<{ userId: string; value: number }>, userId: string) {
  const ranked = items
    .filter((item) => toNumber(item.value) > 0)
    .sort((a, b) => b.value - a.value);
  const index = ranked.findIndex((item) => item.userId === userId);
  if (index < 0) return null;
  return {
    rank: index + 1,
    totalUsers: ranked.length,
    metricValue: ranked[index].value,
  };
}

function createBadge({
  userId,
  type,
  titlePrefix,
  metricUnit,
  metricValue,
  rank,
  totalUsers,
  model = null,
  provider = null,
  dimension,
  category,
  updatedAt,
}: {
  userId: string;
  type: BadgeType;
  titlePrefix: string;
  metricUnit: "¥" | "Token" | "次" | "人";
  metricValue: number;
  rank: number;
  totalUsers: number;
  model?: string | null;
  provider?: string | null;
  dimension: string;
  category: UserBadge["category"];
  updatedAt: string;
}): UserBadge | null {
  const rankInfo = getBadgeRankInfo(rank, totalUsers);
  if (!rankInfo) return null;

  const title = `${titlePrefix}${rankInfo.label}`;
  const displayPriority = rankInfo.rankScore + getTypeWeight(type);
  const beatsPercent = Math.max(0, Math.round(((totalUsers - rank) / totalUsers) * 100));
  const description = rank <= 10
    ? `你是 FlowAPI 站内${dimension}排名第 ${rank} 的用户。`
    : `你在 FlowAPI 站内${dimension}中超过了 ${beatsPercent}% 的用户。`;

  return {
    id: `badge_${userId}_${type}_${normalizeModel(titlePrefix)}_${rankInfo.percentileTop || rank}`,
    title,
    type,
    level: rankInfo.level as BadgeLevel,
    rank,
    percentileTop: rankInfo.percentileTop,
    metricValue,
    metricUnit,
    model,
    provider,
    description,
    displayPriority,
    animated: rankInfo.animated,
    highlight: rankInfo.highlight,
    updatedAt,
    category,
    dimension,
    period: "累计",
  };
}

function getCallModel(call: any, modelConfigs: any[] = []) {
  const candidates = [call?.requestedModel, call?.routedModel, call?.model].map(normalizeModel).filter(Boolean);
  const config = modelConfigs.find((item) => {
    const values = [item?.id, item?.displayName, item?.modelId, item?.publicModelId].map(normalizeModel).filter(Boolean);
    return values.some((value) => candidates.some((candidate) => value === candidate || value.includes(candidate) || candidate.includes(value)));
  });
  return {
    model: config?.displayName || call?.routedModel || call?.requestedModel || "Unknown Model",
    provider: config?.provider || call?.provider || "FlowAPI",
  };
}

function summarizeCustomer(customer: any, modelConfigs: any[] = []) {
  const calls = Array.isArray(customer?.calls) ? customer.calls : [];
  const models = new Map<string, { model: string; provider: string; tokens: number; spend: number; requests: number }>();
  for (const call of calls) {
    const info = getCallModel(call, modelConfigs);
    const key = normalizeModel(`${info.provider}:${info.model}`);
    if (!models.has(key)) models.set(key, { model: info.model, provider: info.provider, tokens: 0, spend: 0, requests: 0 });
    const bucket = models.get(key)!;
    bucket.tokens += toNumber(call?.tokens, toNumber(call?.promptTokens) + toNumber(call?.completionTokens));
    bucket.spend += toNumber(call?.cost);
    bucket.requests += 1;
  }
  return {
    userId: customer?.id,
    totalSpendCny: toNumber(customer?.totalSpend, calls.reduce((sum: number, call: any) => sum + toNumber(call?.cost), 0)),
    totalTokens: calls.reduce((sum: number, call: any) => sum + toNumber(call?.tokens, toNumber(call?.promptTokens) + toNumber(call?.completionTokens)), 0),
    totalRequests: calls.length,
    modelUsage: Array.from(models.values()).filter((item) => item.tokens > 0 || item.spend > 0),
  };
}

function dedupeDisplayBadges(badges: UserBadge[]) {
  const sorted = [...badges].sort((a, b) => b.displayPriority - a.displayPriority);
  const usedModels = new Set<string>();
  const usedTypes = new Set<string>();
  const result: UserBadge[] = [];

  for (const badge of sorted) {
    if (result.length >= 4) break;
    const modelKey = badge.model ? normalizeModel(badge.model) : "";
    const typeKey = badge.type.replace(/^model_/, "model");
    if (modelKey && usedModels.has(modelKey)) continue;
    if (!modelKey && usedTypes.has(typeKey)) continue;
    result.push(badge);
    if (modelKey) usedModels.add(modelKey);
    usedTypes.add(typeKey);
  }

  return result;
}

export async function generateUserBadges(userId: string) {
  const [currentCustomer, customers] = await Promise.all([
    getDashboard(userId),
    listCustomers(),
  ]);
  if (!currentCustomer) return null;

  const modelConfigs = getContent("models");
  const updatedAt = new Date().toISOString();
  const fullCustomers = await Promise.all((customers || []).map((customer: any) => getDashboard(customer.id)));
  const summaries = fullCustomers.filter(Boolean).map((customer: any) => summarizeCustomer(customer, modelConfigs));
  const currentSummary = summaries.find((item) => item.userId === userId);
  if (!currentSummary) return null;

  const badges: UserBadge[] = [];
  const addBadge = (badge: UserBadge | null) => { if (badge) badges.push(badge); };

  const spendRank = rankMetric(summaries.map((item) => ({ userId: item.userId, value: item.totalSpendCny })), userId);
  if (spendRank) addBadge(createBadge({
    userId,
    type: "spend",
    titlePrefix: "花费",
    metricUnit: "¥",
    metricValue: spendRank.metricValue,
    rank: spendRank.rank,
    totalUsers: spendRank.totalUsers,
    dimension: "累计消费金额",
    category: "asset",
    updatedAt,
  }));

  const tokenRank = rankMetric(summaries.map((item) => ({ userId: item.userId, value: item.totalTokens })), userId);
  if (tokenRank) addBadge(createBadge({
    userId,
    type: "token",
    titlePrefix: "Token 消耗",
    metricUnit: "Token",
    metricValue: tokenRank.metricValue,
    rank: tokenRank.rank,
    totalUsers: tokenRank.totalUsers,
    dimension: "累计 Token 消耗",
    category: "asset",
    updatedAt,
  }));

  const requestRank = rankMetric(summaries.map((item) => ({ userId: item.userId, value: item.totalRequests })), userId);
  if (requestRank) addBadge(createBadge({
    userId,
    type: "request_count",
    titlePrefix: "调用次数",
    metricUnit: "次",
    metricValue: requestRank.metricValue,
    rank: requestRank.rank,
    totalUsers: requestRank.totalUsers,
    dimension: "累计 API 调用次数",
    category: "growth",
    updatedAt,
  }));

  const savingsByUser = fullCustomers.filter(Boolean).map((customer: any) => {
    const savings = calculateCustomerSavings({ calls: customer.calls || [], modelConfigs, period: "all" });
    return { userId: customer.id, value: Number(savings.summary?.savedAmountCny || 0) };
  });
  const savingRank = rankMetric(savingsByUser, userId);
  if (savingRank) addBadge(createBadge({
    userId,
    type: "saving",
    titlePrefix: "节省",
    metricUnit: "¥",
    metricValue: savingRank.metricValue,
    rank: savingRank.rank,
    totalUsers: savingRank.totalUsers,
    dimension: "累计节省金额",
    category: "asset",
    updatedAt,
  }));

  const modelKeys = new Map<string, { model: string; provider: string }>();
  for (const summary of summaries) {
    for (const item of summary.modelUsage) {
      const key = normalizeModel(`${item.provider}:${item.model}`);
      if (!modelKeys.has(key)) modelKeys.set(key, { model: item.model, provider: item.provider });
    }
  }

  for (const [key, info] of modelKeys) {
    const tokenItems = summaries.map((summary) => {
      const model = summary.modelUsage.find((item) => normalizeModel(`${item.provider}:${item.model}`) === key);
      return { userId: summary.userId, value: model?.tokens || 0 };
    });
    const modelRank = rankMetric(tokenItems, userId);
    if (modelRank) addBadge(createBadge({
      userId,
      type: "model_token",
      titlePrefix: `${info.model} `,
      metricUnit: "Token",
      metricValue: modelRank.metricValue,
      rank: modelRank.rank,
      totalUsers: modelRank.totalUsers,
      model: info.model,
      provider: info.provider,
      dimension: `${info.model} Token 消耗`,
      category: modelRank.rank <= 10 ? "high_value" : "model",
      updatedAt,
    }));
  }

  const allBadges = badges
    .sort((a, b) => b.displayPriority - a.displayPriority)
    .filter((badge, index, list) => list.findIndex((item) => item.id === badge.id) === index);
  const displayBadges = dedupeDisplayBadges(allBadges);

  return {
    success: true,
    source: allBadges.length ? "real" : "empty",
    updatedAt,
    message: allBadges.length ? "" : "暂无称号",
    summary: {
      totalBadges: allBadges.length,
      legendaryCount: allBadges.filter((badge) => badge.level === "legendary").length,
      topPercentCount: allBadges.filter((badge) => Number(badge.percentileTop || 0) <= 1 && badge.rank && badge.rank > 10).length,
    },
    displayBadges,
    allBadges,
  };
}

export type { UserBadge };
