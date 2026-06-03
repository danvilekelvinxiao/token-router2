function toNumber(value, fallback = 0) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function clampPercent(value) {
  if (!Number.isFinite(Number(value))) return null;
  return Number(Math.max(0, Math.min(100, Number(value))).toFixed(2));
}

function toTimestamp(value) {
  const ts = value ? new Date(value).getTime() : NaN;
  return Number.isFinite(ts) ? ts : 0;
}

function isWithinRange(value, start, end) {
  const ts = toTimestamp(value);
  if (!ts) return false;
  const startTs = start ? toTimestamp(start) : 0;
  const endTs = end ? toTimestamp(end) : Number.MAX_SAFE_INTEGER;
  return ts >= startTs && ts <= endTs;
}

export function parseQuotaTokens(quotaText = "") {
  const text = String(quotaText || "").replace(/,/g, "").trim();
  if (!text) return null;

  const matched = text.match(/(\d+(?:\.\d+)?)\s*(万亿|亿|万|千|K|M|B)?/i);
  if (!matched) return null;

  const base = Number(matched[1]);
  if (!Number.isFinite(base) || base <= 0) return null;

  const unit = String(matched[2] || "").toLowerCase();
  const multiplier = (() => {
    if (unit === "万亿") return 1_000_000_000_000;
    if (unit === "亿") return 100_000_000;
    if (unit === "万") return 10_000;
    if (unit === "千" || unit === "k") return 1_000;
    if (unit === "m") return 1_000_000;
    if (unit === "b") return 1_000_000_000;
    return 1;
  })();

  return Math.round(base * multiplier);
}

function buildBalanceProgress({ wallet = {}, token = {}, calls = [] } = {}) {
  const safeWallet = wallet || {};
  const safeToken = token || {};
  const balanceCny = toNumber(safeWallet.balanceCny);
  const knownTotalTokens = Number.isFinite(Number(safeToken.totalTokens)) && Number(safeToken.totalTokens) > 0 ? Number(safeToken.totalTokens) : null;
  const knownUsedTokens = knownTotalTokens ? toNumber(safeToken.usedTokens) : null;
  const knownRemainingTokens = knownTotalTokens ? Math.max(0, knownTotalTokens - toNumber(safeToken.usedTokens)) : null;

  const average = calls.reduce((memo, call) => {
    const cost = toNumber(call?.cost);
    const callTokens = toNumber(call?.tokens, toNumber(call?.promptTokens) + toNumber(call?.completionTokens));
    if (cost > 0 && callTokens > 0) {
      memo.cost += cost;
      memo.tokens += callTokens;
    }
    return memo;
  }, { cost: 0, tokens: 0 });

  const estimatedRemainingTokens = average.cost > 0 && average.tokens > 0 && balanceCny > 0
    ? Math.floor(balanceCny / (average.cost / average.tokens))
    : null;

  return {
    enabled: Boolean(balanceCny > 0 || knownTotalTokens || estimatedRemainingTokens),
    remainingTokens: knownRemainingTokens,
    usedTokens: knownUsedTokens,
    totalTokens: knownTotalTokens,
    percent: knownTotalTokens ? clampPercent((toNumber(knownUsedTokens) / knownTotalTokens) * 100) : null,
    estimated: !knownTotalTokens && estimatedRemainingTokens !== null,
    estimatedRemainingTokens,
    remainingCny: balanceCny,
  };
}

function inferPlanType(plan = {}) {
  const name = String(plan?.planName || "");
  if (name.includes("月")) return "monthly";
  if (name.includes("周")) return "weekly";
  return "custom";
}

function buildPlanProgress({ wallet = {}, plan = null, calls = [], now = new Date() } = {}) {
  const safeWallet = wallet || {};
  if (!plan) {
    return {
      enabled: false,
      planName: null,
      planType: null,
      message: "暂无套餐",
    };
  }

  const totalTokens = parseQuotaTokens(plan.quotaText);
  const planCalls = calls.filter((call) => isWithinRange(call?.createdAt, plan.startedAt, plan.expiresAt));
  const usedTokens = totalTokens
    ? planCalls.reduce((sum, call) => sum + toNumber(call?.tokens, toNumber(call?.promptTokens) + toNumber(call?.completionTokens)), 0)
    : null;
  const remainingTokens = totalTokens && usedTokens !== null ? Math.max(0, totalTokens - usedTokens) : null;
  const remainingDays = Number.isFinite(Number(plan.remainingDays))
    ? Math.max(0, Number(plan.remainingDays))
    : (plan.expiresAt ? Math.max(0, Math.ceil((toTimestamp(plan.expiresAt) - now.getTime()) / 86_400_000)) : null);
  const totalDays = plan.startedAt && plan.expiresAt
    ? Math.max(1, Math.ceil((toTimestamp(plan.expiresAt) - toTimestamp(plan.startedAt)) / 86_400_000))
    : null;
  const usedDays = totalDays !== null && remainingDays !== null ? Math.max(0, totalDays - remainingDays) : null;

  return {
    enabled: true,
    planName: plan.planName || "套餐进度",
    planType: inferPlanType(plan),
    remainingTokens,
    usedTokens,
    totalTokens,
    tokenPercent: totalTokens && usedTokens !== null ? clampPercent((usedTokens / totalTokens) * 100) : null,
    remainingDays,
    usedDays,
    totalDays,
    timePercent: totalDays !== null && usedDays !== null ? clampPercent((usedDays / totalDays) * 100) : null,
    expiresAt: plan.expiresAt || null,
    remainingCny: toNumber(safeWallet.remainingQuotaCny),
    totalCny: toNumber(safeWallet.totalQuotaCny),
    usedCny: toNumber(safeWallet.usedQuotaCny),
    quotaText: plan.quotaText || "",
    status: plan.status || "active",
  };
}

function buildMembershipProgress({ membership = null, now = new Date() } = {}) {
  if (!membership || membership.status === "none") {
    return {
      enabled: false,
      name: "FLOWAPI 黑金会员",
      message: "未开通",
    };
  }

  const remainingDays = membership.expiresAt
    ? Math.max(0, Math.ceil((toTimestamp(membership.expiresAt) - now.getTime()) / 86_400_000))
    : null;
  const totalDays = membership.startedAt && membership.expiresAt
    ? Math.max(1, Math.ceil((toTimestamp(membership.expiresAt) - toTimestamp(membership.startedAt)) / 86_400_000))
    : null;
  const usedDays = totalDays !== null && remainingDays !== null ? Math.max(0, totalDays - remainingDays) : null;

  return {
    enabled: membership.status === "active" || membership.status === "expired",
    name: membership.name || "FLOWAPI 黑金会员",
    remainingDays,
    usedDays,
    totalDays,
    percent: totalDays !== null && usedDays !== null ? clampPercent((usedDays / totalDays) * 100) : null,
    dailyBonusTokens: toNumber(membership.dailyBonusTokens),
    memberQuotaTokens: toNumber(membership.memberQuotaTokens),
    expiresAt: membership.expiresAt || null,
    status: membership.status || "none",
    todayClaimed: Boolean(membership.todayClaimed),
    message: membership.status === "expired" ? "已过期" : undefined,
  };
}

export function buildWalletProgress({ wallet = {}, token = {}, plan = null, calls = [], membership = null, now = new Date() } = {}) {
  return {
    balanceToken: buildBalanceProgress({ wallet, token, calls }),
    plan: buildPlanProgress({ wallet, plan, calls, now }),
    membership: buildMembershipProgress({ membership, now }),
  };
}
