export type WalletType =
  | "member_bonus"
  | "member_quota"
  | "package_quota"
  | "balance_credit"
  | "referral_credit"
  | "admin_grant";

export type BillingPriorityMode = "package_first" | "balance_first";

export const LOCKED_WALLET_PRIORITY: WalletType[] = ["member_bonus", "member_quota"];

export const WALLET_TYPE_LABELS: Record<WalletType, string> = {
  member_bonus: "会员赠送余额",
  member_quota: "黑金会员余额",
  package_quota: "套餐余额",
  balance_credit: "充值余额",
  referral_credit: "邀请奖励余额",
  admin_grant: "管理员赠送余额",
};

const fallbackStore = globalThis.__FLOWAPI_BILLING_PREFERENCES__ || {};
globalThis.__FLOWAPI_BILLING_PREFERENCES__ = fallbackStore;

export function normalizePriorityMode(value?: string | null): BillingPriorityMode {
  return value === "balance_first" ? "balance_first" : "package_first";
}

export function getBillingPreference(userId: string) {
  const item = fallbackStore[userId] || {};
  return {
    priorityMode: normalizePriorityMode(item.priorityMode),
    lockedPriority: LOCKED_WALLET_PRIORITY,
    userSwitchable: ["package_quota", "balance_credit"] as WalletType[],
    updatedAt: item.updatedAt || new Date().toISOString(),
  };
}

export function setBillingPreference(userId: string, priorityMode: BillingPriorityMode | string) {
  const normalized = normalizePriorityMode(priorityMode);
  fallbackStore[userId] = {
    priorityMode: normalized,
    updatedAt: new Date().toISOString(),
  };
  return getBillingPreference(userId);
}

export function resolveDeductionOrder(userId: string, wallets: Array<{ type: WalletType; status?: string; balanceCnyEquivalent?: number | null; balanceTokens?: number | null }> = []) {
  const preference = getBillingPreference(userId);
  const switchable: WalletType[] = preference.priorityMode === "balance_first"
    ? ["balance_credit", "package_quota"]
    : ["package_quota", "balance_credit"];
  const order: WalletType[] = [...LOCKED_WALLET_PRIORITY, ...switchable, "referral_credit", "admin_grant"];
  const availableTypes = new Set(wallets
    .filter((wallet) => wallet.status !== "expired")
    .filter((wallet) => Number(wallet.balanceCnyEquivalent || 0) > 0 || Number(wallet.balanceTokens || 0) > 0)
    .map((wallet) => wallet.type));
  return order.filter((type) => availableTypes.size ? availableTypes.has(type) : true);
}

export function buildFallbackDeductionBreakdown({ costCny, tokens, walletType = "balance_credit" }: { costCny?: number; tokens?: number; walletType?: WalletType }) {
  const amount = Number(costCny || 0);
  if (amount <= 0 && Number(tokens || 0) <= 0) return [];
  return [{
    walletType,
    walletName: WALLET_TYPE_LABELS[walletType],
    tokensDeducted: Number(tokens || 0) || undefined,
    amountCnyDeducted: amount || undefined,
  }];
}

export function deductUsageCost({
  userId,
  tokens,
  costCny,
  wallets = [],
}: {
  userId: string;
  tokens: number;
  costCny: number;
  model?: string;
  wallets?: Array<{ type: WalletType; name?: string; balanceCnyEquivalent?: number | null; balanceTokens?: number | null; status?: string }>;
}) {
  const order = resolveDeductionOrder(userId, wallets as any);
  const byType = new Map(wallets.map((wallet) => [wallet.type, { ...wallet }]));
  let remainingCost = Number(costCny || 0);
  let remainingTokens = Number(tokens || 0);
  const deductionBreakdown: Array<{ walletType: WalletType; walletName: string; tokensDeducted?: number; amountCnyDeducted?: number }> = [];

  for (const walletType of order) {
    if (remainingCost <= 0 && remainingTokens <= 0) break;
    const wallet = byType.get(walletType);
    if (!wallet || wallet.status === "expired") continue;
    const availableCny = Number(wallet.balanceCnyEquivalent || 0);
    const takeCny = Math.min(Math.max(0, remainingCost), availableCny);
    const availableTokens = Number(wallet.balanceTokens || 0);
    const takeTokens = Math.min(Math.max(0, remainingTokens), availableTokens);
    if (takeCny <= 0 && takeTokens <= 0) continue;
    deductionBreakdown.push({
      walletType,
      walletName: wallet.name || WALLET_TYPE_LABELS[walletType],
      tokensDeducted: takeTokens || undefined,
      amountCnyDeducted: takeCny || undefined,
    });
    remainingCost = Number((remainingCost - takeCny).toFixed(6));
    remainingTokens = Math.max(0, remainingTokens - takeTokens);
  }

  return {
    ok: remainingCost <= 0,
    remainingCostCny: remainingCost,
    deductionBreakdown,
  };
}
