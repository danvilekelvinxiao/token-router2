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

function getMembershipStatus(membership: any) {
  if (!membership?.enabled) return "empty";
  if (membership.status === "expired" || Number(membership.remainingDays || 0) <= 0) return "expired";
  if (Number(membership.remainingDays || 0) <= 3) return "warning";
  return "normal";
}

export default function WalletProgressSection({ walletProgress, onOpenDetail, variant = "default" }: WalletProgressSectionProps) {
  const balance = walletProgress?.balanceToken || {};
  const plan = walletProgress?.plan || {};
  const membership = walletProgress?.membership || {};
  const compact = variant === "compact";

  return (
    <section className={`wallet-asset-progress-section ${compact ? "is-compact" : ""}`}>
      <div className="wallet-asset-progress-head">
        <div>
          <span>资产进度</span>
          <h3>{compact ? "余额、套餐、会员一眼确认。" : "查看余额可用情况、套餐已使用进度和黑金会员期限。"}</h3>
        </div>
      </div>

      <div className="wallet-asset-progress-list">
        <AssetProgressBar
          type="balance"
          title={compact ? "余额可用" : "余额可用估算"}
          subtitle={balance.totalTokens
            ? `剩余 ${formatWalletTokens(balance.remainingTokens)}`
            : `当前可用余额 ${formatWalletCny(balance.remainingCny)}`}
          currentValue={balance.totalTokens ? balance.remainingTokens : balance.estimatedRemainingTokens}
          totalValue={balance.totalTokens}
          percent={balance.percent}
          leftLabel={balance.totalTokens ? `已用 ${formatWalletTokens(balance.usedTokens)}` : "真实调用越多，估算越准确"}
          rightLabel={balance.totalTokens ? `剩余 ${formatWalletTokens(balance.remainingTokens)}` : (balance.estimatedRemainingTokens ? `约可调用 ${formatWalletTokens(balance.estimatedRemainingTokens)}` : "完成更多真实调用后再估算")}
          unit="Token"
          status={balance.totalTokens ? "normal" : "empty"}
          footnote={balance.totalTokens ? "可用于所有支持的模型调用。" : "没有总 Token 时，系统按真实调用成本估算可用 Token。"}
          onClick={() => onOpenDetail?.("余额 Token 进度")}
          compact={compact}
        />

        <AssetProgressBar
          type="plan"
          title={compact ? "套餐已用" : plan.enabled ? (plan.planType === "monthly" ? "月卡已使用进度" : plan.planType === "weekly" ? "周卡已使用进度" : "套餐已使用进度") : "暂无套餐"}
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

        <AssetProgressBar
          type="membership"
          title={compact ? "黑金会员" : "FLOWAPI 黑金会员"}
          subtitle={membership.enabled
            ? `剩余 ${Number(membership.remainingDays || 0)} 天`
            : "开通后每日领取会员 Token，并解锁黑金会员专属模型。"}
          currentValue={membership.remainingDays}
          totalValue={membership.totalDays}
          percent={membership.percent}
          leftLabel={membership.enabled && Number.isFinite(Number(membership.usedDays)) ? `已使用 ${membership.usedDays} 天` : "未开通"}
          rightLabel={membership.enabled && Number.isFinite(Number(membership.remainingDays)) ? `${membership.remainingDays} 天后到期` : "开通黑金会员"}
          unit="day"
          expiresAt={membership.expiresAt}
          remainingDays={membership.remainingDays}
          status={getMembershipStatus(membership)}
          actionLabel={membership.enabled ? undefined : "开通黑金会员"}
          footnote={membership.enabled
            ? `每日赠送 ${formatWalletTokens(membership.dailyBonusTokens)} · 会员专属模型 · 优先体验新功能`
            : "黑金会员可获得每日赠送 Token、会员专属模型和优先体验资格。"}
          onClick={() => onOpenDetail?.(membership.enabled ? "黑金会员详情" : "开通黑金会员")}
          compact={compact}
        />
      </div>
    </section>
  );
}
