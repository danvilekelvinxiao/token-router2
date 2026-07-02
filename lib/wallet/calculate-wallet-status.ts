export type WalletPlanStatus = "active" | "expired" | "none";
export type WalletStatusTone = "healthy" | "watch" | "low" | "empty" | "expired" | "none";

export type WalletStatusResult = {
  label: string;
  tone: WalletStatusTone;
  actionLabel: string;
};

export function calculateWalletStatus({
  remainingQuotaCny,
  totalQuotaCny,
  planStatus,
  expiresAt,
}: {
  remainingQuotaCny?: number | null;
  totalQuotaCny?: number | null;
  planStatus?: WalletPlanStatus | string | null;
  expiresAt?: string | null;
}): WalletStatusResult {
  const now = Date.now();
  const expiry = expiresAt ? new Date(expiresAt).getTime() : 0;
  if (planStatus === "expired" || (expiry > 0 && expiry < now)) {
    return { label: "套餐已到期", tone: "expired", actionLabel: "续费 / 充值" };
  }

  const total = Number(totalQuotaCny || 0);
  const remaining = Number(remainingQuotaCny || 0);
  if (total <= 0) {
    if (remaining > 0) return { label: "普通余额", tone: "healthy", actionLabel: "继续充值" };
    return { label: "暂无套餐", tone: "none", actionLabel: "立即充值" };
  }

  if (remaining <= 0) return { label: "余额已用完", tone: "empty", actionLabel: "立即充值" };

  const ratio = remaining / total;
  if (ratio >= 0.3) return { label: "余额充足", tone: "healthy", actionLabel: "查看详情" };
  if (ratio >= 0.1) return { label: "建议关注", tone: "watch", actionLabel: "查看详情" };
  return { label: "建议充值", tone: "low", actionLabel: "立即充值" };
}
