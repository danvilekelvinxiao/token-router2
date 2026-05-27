import { getContent } from "@/lib/content-cms";
import { grantTemporaryCredit } from "@/lib/customer-store";

const store = globalThis.__FLOWAPI_MEMBERSHIP_STORE__ || {
  config: {
    id: "black_gold",
    name: "FLOWAPI 黑金会员",
    level: "black_gold",
    priceCny: 99,
    period: "month",
    dailyBonusTokens: 50000,
    memberQuotaTokens: 300000,
    freeModelMarketAccess: true,
    enabled: true,
  },
  users: {},
  dailyClaims: {},
};

globalThis.__FLOWAPI_MEMBERSHIP_STORE__ = store;

function chinaDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function chinaDayEndIso(dayKey = chinaDayKey()) {
  const [year, month, day] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 15, 59, 59)).toISOString();
}

export function getMembershipConfig() {
  return { ...store.config };
}

export function updateMembershipConfig(next = {}) {
  store.config = {
    ...store.config,
    ...next,
    dailyBonusTokens: Number(next.dailyBonusTokens ?? store.config.dailyBonusTokens),
    memberQuotaTokens: Number(next.memberQuotaTokens ?? store.config.memberQuotaTokens),
    priceCny: Number(next.priceCny ?? store.config.priceCny),
    enabled: next.enabled !== false,
    updatedAt: new Date().toISOString(),
  };
  return getMembershipConfig();
}

export function getUserMembership(userId) {
  const config = getMembershipConfig();
  const item = store.users[userId];
  if (!item) {
    return {
      enabled: config.enabled,
      level: null,
      name: config.name,
      status: "none",
      dailyBonusTokens: config.dailyBonusTokens,
      todayClaimed: false,
      expiresAt: null,
      freeModelMarketAccess: false,
    };
  }
  const expired = item.expiresAt && new Date(item.expiresAt) < new Date();
  const dayKey = chinaDayKey();
  const claim = store.dailyClaims[`${userId}:${dayKey}`];
  return {
    enabled: config.enabled,
    level: item.level,
    name: config.name,
    status: expired ? "expired" : item.status || "active",
    dailyBonusTokens: Number(item.dailyBonusTokens ?? config.dailyBonusTokens),
    memberQuotaTokens: Number(item.memberQuotaTokens ?? config.memberQuotaTokens),
    todayClaimed: Boolean(claim),
    startedAt: item.startedAt,
    expiresAt: item.expiresAt,
    freeModelMarketAccess: Boolean(config.freeModelMarketAccess && !expired),
  };
}

export function upsertUserMembership(userId, data = {}) {
  const config = getMembershipConfig();
  const now = new Date();
  const defaultExpires = new Date(now);
  defaultExpires.setMonth(defaultExpires.getMonth() + 1);
  store.users[userId] = {
    userId,
    level: "black_gold",
    status: data.status || "active",
    startedAt: data.startedAt || now.toISOString(),
    expiresAt: data.expiresAt || defaultExpires.toISOString(),
    dailyBonusTokens: Number(data.dailyBonusTokens ?? config.dailyBonusTokens),
    memberQuotaTokens: Number(data.memberQuotaTokens ?? config.memberQuotaTokens),
    updatedAt: new Date().toISOString(),
  };
  return getUserMembership(userId);
}

export async function claimDailyBonus(userId) {
  const membership = getUserMembership(userId);
  if (membership.status !== "active" || membership.level !== "black_gold") {
    return { success: false, message: "当前账号不是 FLOWAPI 黑金会员" };
  }
  const dayKey = chinaDayKey();
  const key = `${userId}:${dayKey}`;
  if (store.dailyClaims[key]) {
    return {
      success: true,
      claimed: false,
      message: "今日已领取",
      bonusTokens: membership.dailyBonusTokens,
      expiresAt: store.dailyClaims[key].expiresAt,
    };
  }
  store.dailyClaims[key] = {
    userId,
    dayKey,
    bonusTokens: Number(membership.dailyBonusTokens || 0),
    expiresAt: chinaDayEndIso(dayKey),
    createdAt: new Date().toISOString(),
  };
  await grantTemporaryCredit(userId, {
    amount: Number((Number(membership.dailyBonusTokens || 0) / 10000).toFixed(6)),
    reason: "black_gold_daily_bonus",
    detail: "黑金会员每日赠送 Token 额度",
  });
  return {
    success: true,
    claimed: true,
    bonusTokens: Number(membership.dailyBonusTokens || 0),
    expiresAt: store.dailyClaims[key].expiresAt,
    message: "今日黑金会员赠送 Token 已到账",
  };
}

export function getMemberWallets(userId) {
  const membership = getUserMembership(userId);
  if (membership.status !== "active") return [];
  const dayKey = chinaDayKey();
  const claim = store.dailyClaims[`${userId}:${dayKey}`];
  const wallets = [];
  if (claim) {
    wallets.push({
      type: "member_bonus",
      name: "会员赠送额度",
      balanceTokens: Number(claim.bonusTokens || 0),
      balanceCnyEquivalent: Number(((Number(claim.bonusTokens || 0) / 10000) || 0).toFixed(6)),
      expiresAt: claim.expiresAt,
      priority: 1,
      locked: true,
      status: "active",
    });
  }
  wallets.push({
    type: "member_quota",
    name: "黑金会员额度",
    balanceTokens: Number(membership.memberQuotaTokens || 0),
    balanceCnyEquivalent: Number(((Number(membership.memberQuotaTokens || 0) / 10000) || 0).toFixed(6)),
    expiresAt: membership.expiresAt,
    priority: 2,
    locked: true,
    status: "active",
  });
  return wallets;
}

export function userCanUseMemberModel(userId, model = {}) {
  if (!model?.isMemberOnly) return true;
  const membership = getUserMembership(userId);
  return membership.status === "active" && membership.level === (model.memberLevelRequired || "black_gold");
}

export function getMemberModels() {
  return getContent("models").filter((model) => model.isMemberOnly || model.isFreeModel);
}
