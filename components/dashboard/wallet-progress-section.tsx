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
  const membership = walletProgress?.membership || {};
  const balanceToken = walletProgress?.balanceToken || {};
  const compact = variant === "compact";

  return (
    <section className={`wallet-asset-progress-section ${compact ? "is-compact" : ""}`}>
      <div className="wallet-asset-progress-head">
        <div>
          <span>套餐进度</span>
          <h3>{compact ? "Token / 到期 / 会员" : "当前套餐 Token、到期时间和黑金会员剩余天数。"}</h3>
        </div>
      </div>

      <div className="wallet-asset-progress-list">
        <AssetProgressBar
          type="plan"
          title={compact ? (plan.planName || "当前套餐 Token") : plan.enabled ? (plan.planName || (plan.planType === "monthly" ? "月卡套餐" : plan.planType === "weekly" ? "周卡套餐" : "当前套餐 Token")) : "当前套餐 Token"}
          subtitle={plan.enabled
            ? (
              plan.remainingTokens
                ? `剩余 ${formatWalletTokens(plan.remainingTokens)}${Number.isFinite(Number(plan.remainingDays)) ? ` · 剩余 ${plan.remainingDays} 天` : ""}`
                : `剩余 ${formatWalletCny(plan.remainingCny)}${Number.isFinite(Number(plan.remainingDays)) ? ` · 剩余 ${plan.remainingDays} 天` : ""}`
            )
            : "0 Token"}
          currentValue={plan.remainingTokens ?? plan.remainingCny}
          totalValue={plan.totalTokens ?? plan.totalCny}
          percent={plan.tokenPercent}
          leftLabel={plan.totalTokens ? `已用 ${formatWalletTokens(plan.usedTokens)}` : (plan.enabled ? `已用 ${formatWalletCny(plan.usedCny)}` : "已用 0 Token")}
          rightLabel={plan.totalTokens ? `总 ${formatWalletTokens(plan.totalTokens)}` : (plan.enabled ? `总 ${formatWalletCny(plan.totalCny)}` : "总 0 Token")}
          unit={plan.totalTokens ? "Token" : "CNY"}
          expiresAt={plan.expiresAt}
          remainingDays={plan.remainingDays}
          status={getPlanStatus(plan)}
          actionLabel={undefined}
          footnote={undefined}
          secondaryPercent={plan.timePercent}
          secondaryTitle="套餐时间已使用"
          secondaryLeftLabel={Number.isFinite(Number(plan.usedDays)) && Number.isFinite(Number(plan.totalDays)) ? `已使用 ${plan.usedDays} / ${plan.totalDays} 天` : "时间进度暂不可用"}
          secondaryRightLabel={Number.isFinite(Number(plan.remainingDays)) ? `剩余 ${plan.remainingDays} 天` : "等待真实到期时间"}
          onClick={() => onOpenDetail?.(plan.enabled ? "套餐详情" : "购买套餐")}
          compact={compact}
        />
        {!compact ? (
          <>
            <AssetProgressBar
              type="plan"
              title="套餐剩余天数"
              subtitle={Number.isFinite(Number(plan.remainingDays)) ? `剩余 ${plan.remainingDays} 天` : "0 天"}
              currentValue={Number.isFinite(Number(plan.remainingDays)) ? Number(plan.remainingDays) : 0}
              totalValue={Number.isFinite(Number(plan.totalDays)) ? Number(plan.totalDays) : 0}
              percent={Number.isFinite(Number(plan.timePercent)) ? Number(plan.timePercent) : 0}
              leftLabel={Number.isFinite(Number(plan.usedDays)) && Number.isFinite(Number(plan.totalDays)) ? `已用 ${plan.usedDays} / ${plan.totalDays} 天` : "已用 0 天"}
              rightLabel={Number.isFinite(Number(plan.remainingDays)) ? `剩余 ${plan.remainingDays} 天` : "剩余 0 天"}
              unit="day"
              expiresAt={plan.expiresAt}
              status={getPlanStatus(plan)}
              onClick={() => onOpenDetail?.("套餐到期时间")}
              compact
            />
            <AssetProgressBar
              type="membership"
              title="黑金会员剩余天数"
              subtitle={Number.isFinite(Number(membership.remainingDays)) ? `剩余 ${membership.remainingDays} 天` : "0 天"}
              currentValue={Number.isFinite(Number(membership.remainingDays)) ? Number(membership.remainingDays) : 0}
              totalValue={Number.isFinite(Number(membership.totalDays)) ? Number(membership.totalDays) : 0}
              percent={Number.isFinite(Number(membership.percent)) ? Number(membership.percent) : 0}
              leftLabel={Number.isFinite(Number(membership.usedDays)) && Number.isFinite(Number(membership.totalDays)) ? `已用 ${membership.usedDays} / ${membership.totalDays} 天` : "已用 0 天"}
              rightLabel={Number.isFinite(Number(membership.remainingDays)) ? `剩余 ${membership.remainingDays} 天` : "剩余 0 天"}
              unit="day"
              expiresAt={membership.expiresAt}
              status={membership.status === "expired" ? "expired" : membership.enabled ? "normal" : "empty"}
              onClick={() => onOpenDetail?.("黑金会员")}
              compact
            />
            <AssetProgressBar
              type="balance"
              title="余额 Token"
              subtitle={balanceToken.remainingTokens ? `剩余 ${formatWalletTokens(balanceToken.remainingTokens)}` : "0 Token"}
              currentValue={balanceToken.remainingTokens || 0}
              totalValue={balanceToken.totalTokens || 0}
              percent={balanceToken.percent || 0}
              leftLabel={balanceToken.usedTokens ? `已用 ${formatWalletTokens(balanceToken.usedTokens)}` : "已用 0 Token"}
              rightLabel={balanceToken.remainingTokens ? `剩余 ${formatWalletTokens(balanceToken.remainingTokens)}` : "剩余 0 Token"}
              unit="Token"
              status={balanceToken.enabled ? "normal" : "empty"}
              onClick={() => onOpenDetail?.("余额 Token")}
              compact
            />
          </>
        ) : null}
      </div>
    </section>
  );
}
