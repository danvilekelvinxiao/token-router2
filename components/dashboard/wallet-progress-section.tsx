import AssetProgressBar from "@/components/dashboard/asset-progress-bar";
import { formatWalletCny, formatWalletTokens } from "@/lib/wallet/format-wallet";

type WalletProgressSectionProps = {
  walletProgress?: any;
  onOpenDetail?: (focusTitle?: string) => void;
  variant?: "default" | "compact";
};

function getPlanStatus(plan: any) {
  if (!plan?.enabled) return "empty";
  if (plan.status === "expired" || Number(plan.remainingDays || 0) <= 0) return "expired";
  if (Number(plan.remainingDays || 0) <= 3) return "warning";
  return "normal";
}

export default function WalletProgressSection({ walletProgress, onOpenDetail, variant = "default" }: WalletProgressSectionProps) {
  const plan = walletProgress?.plan || {};
  const compact = variant === "compact";

  return (
    <section className={`wallet-asset-progress-section ${compact ? "is-compact" : ""}`}>
      <div className="wallet-asset-progress-head">
        <div>
          <span>套餐进度</span>
          <h3>{compact ? "当前套餐 Token 和到期进度。" : "只展示当前套餐、剩余 Token、已用 Token 和到期时间。"}</h3>
        </div>
      </div>

      <div className="wallet-asset-progress-list">
        <AssetProgressBar
          type="plan"
          title={compact ? (plan.planName || "当前套餐") : plan.enabled ? (plan.planName || (plan.planType === "monthly" ? "月卡套餐" : plan.planType === "weekly" ? "周卡套餐" : "当前套餐")) : "暂无套餐"}
          subtitle={plan.enabled
            ? (
              plan.remainingTokens
                ? `剩余 ${formatWalletTokens(plan.remainingTokens)}${Number.isFinite(Number(plan.remainingDays)) ? ` · 剩余 ${plan.remainingDays} 天` : ""}`
                : `剩余 ${formatWalletCny(plan.remainingCny)}${Number.isFinite(Number(plan.remainingDays)) ? ` · 剩余 ${plan.remainingDays} 天` : ""}`
            )
            : "购买周卡或月卡后，这里会显示套餐 Token 和到期进度。"}
          currentValue={plan.remainingTokens ?? plan.remainingCny}
          totalValue={plan.totalTokens ?? plan.totalCny}
          percent={plan.tokenPercent}
          leftLabel={plan.totalTokens ? `已用 ${formatWalletTokens(plan.usedTokens)}` : (plan.enabled ? `已用 ${formatWalletCny(plan.usedCny)}` : "暂无套餐")}
          rightLabel={plan.totalTokens ? `总 ${formatWalletTokens(plan.totalTokens)}` : (plan.enabled ? `总 ${formatWalletCny(plan.totalCny)}` : "去购买套餐")}
          unit={plan.totalTokens ? "Token" : "CNY"}
          expiresAt={plan.expiresAt}
          remainingDays={plan.remainingDays}
          status={getPlanStatus(plan)}
          actionLabel={plan.enabled ? undefined : "去购买套餐"}
          footnote={plan.enabled ? `${plan.planName || "当前套餐"}${plan.expiresAt ? ` · ${plan.expiresAt}` : ""}` : "暂无套餐"}
          secondaryPercent={plan.timePercent}
          secondaryTitle="套餐时间已使用"
          secondaryLeftLabel={Number.isFinite(Number(plan.usedDays)) && Number.isFinite(Number(plan.totalDays)) ? `已使用 ${plan.usedDays} / ${plan.totalDays} 天` : "时间进度暂不可用"}
          secondaryRightLabel={Number.isFinite(Number(plan.remainingDays)) ? `剩余 ${plan.remainingDays} 天` : "等待真实到期时间"}
          onClick={() => onOpenDetail?.(plan.enabled ? "套餐详情" : "购买套餐")}
          compact={compact}
        />
      </div>
    </section>
  );
}
