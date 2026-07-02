import FlowApiBrandText from "@/components/brand/flowapi-brand-text";
import LiveNumber from "@/components/ui/live-number";
import { clampWalletProgress, formatWalletCny, formatWalletDate, formatWalletTokens } from "@/lib/wallet/format-wallet";

type AssetProgressBarProps = {
  type: "balance" | "plan" | "membership";
  title: string;
  subtitle?: string;
  currentValue?: number | null;
  totalValue?: number | null;
  percent?: number | null;
  leftLabel?: string;
  rightLabel?: string;
  unit?: "Token" | "CNY" | "day";
  expiresAt?: string | null;
  remainingDays?: number | null;
  totalDays?: number | null;
  status?: "normal" | "warning" | "danger" | "exhausted" | "expired" | "empty";
  animated?: boolean;
  glow?: boolean;
  onClick?: () => void;
  actionLabel?: string;
  footnote?: string;
  secondaryPercent?: number | null;
  secondaryLeftLabel?: string;
  secondaryRightLabel?: string;
  secondaryTitle?: string;
  compact?: boolean;
};

function renderValue(value?: number | null, unit?: AssetProgressBarProps["unit"]) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) {
    if (unit === "CNY") return "￥0.00";
    if (unit === "day") return "0 天";
    return "0 Token";
  }
  if (unit === "CNY") return formatWalletCny(value);
  if (unit === "day") return `${Math.max(0, Math.round(Number(value)))} 天`;
  return formatWalletTokens(value);
}

function renderHeadline({
  currentValue,
  totalValue,
  title,
  type,
  unit,
  remainingDays,
}: Pick<AssetProgressBarProps, "currentValue" | "totalValue" | "title" | "type" | "unit" | "remainingDays">) {
  if (type === "membership") {
    if (!Number.isFinite(Number(currentValue))) return "未开通";
    return <>剩余 <LiveNumber value={Number(currentValue || 0)} suffix=" 天" /></>;
  }
  if (type === "plan") {
    const tokenPart = Number.isFinite(Number(currentValue)) ? renderValue(currentValue, unit) : null;
    const dayPart = Number.isFinite(Number(remainingDays)) ? `剩余 ${remainingDays} 天` : null;
    if (tokenPart && dayPart) return `${tokenPart} · ${dayPart}`;
    if (tokenPart) return `剩余 ${tokenPart}`;
    if (dayPart) return dayPart;
    return title.includes("暂无") ? "0 Token" : "0";
  }
  if (Number.isFinite(Number(currentValue)) && Number.isFinite(Number(totalValue))) {
    return `剩余 ${renderValue(currentValue, unit)} / 总 ${renderValue(totalValue, unit)}`;
  }
  if (Number.isFinite(Number(currentValue))) {
    return `剩余 ${renderValue(currentValue, unit)}`;
  }
  return "0 Token";
}

function isExhaustedStatus(status: AssetProgressBarProps["status"], currentValue?: number | null, totalValue?: number | null, remainingDays?: number | null) {
  if (status === "exhausted") return true;
  if (status === "expired" || status === "empty") return true;
  const total = Number(totalValue || 0);
  const current = Number(currentValue || 0);
  if (total > 0 && current <= 0) return true;
  if (Number.isFinite(Number(remainingDays)) && Number(remainingDays) <= 0) return true;
  return false;
}

function resolveStatusTone(status: AssetProgressBarProps["status"], progress: number, currentValue?: number | null, totalValue?: number | null, remainingDays?: number | null) {
  if (isExhaustedStatus(status, currentValue, totalValue, remainingDays)) return "exhausted" as const;
  if (status === "expired" || status === "empty") return status;
  if (status === "danger") return "danger";
  if (status === "warning") return "warning";
  if (progress >= 100) return "exhausted" as const;
  return "normal" as const;
}

export default function AssetProgressBar({
  type,
  title,
  subtitle,
  currentValue,
  totalValue,
  percent,
  leftLabel,
  rightLabel,
  unit = "Token",
  expiresAt,
  remainingDays,
  status = "normal",
  animated = true,
  glow = true,
  onClick,
  actionLabel,
  footnote,
  secondaryPercent,
  secondaryLeftLabel,
  secondaryRightLabel,
  secondaryTitle,
  compact = false,
}: AssetProgressBarProps) {
  const progress = clampWalletProgress(percent);
  const secondaryProgress = clampWalletProgress(secondaryPercent);
  const clickable = typeof onClick === "function";
  const exhausted = resolveStatusTone(status, progress, currentValue, totalValue, remainingDays) === "exhausted";
  const resolvedStatus = resolveStatusTone(status, progress, currentValue, totalValue, remainingDays);
  const displayStatus = exhausted ? "exhausted" : resolvedStatus;
  const shouldAnimate = animated && !exhausted;
  const shouldGlow = glow && progress > 0 && !exhausted;
  const progressLabel = exhausted ? "耗尽" : `${progress.toFixed(1)}%`;

  return (
    <button
      type="button"
      className={`asset-progress-card type-${type} status-${displayStatus} ${compact ? "is-compact" : ""} ${clickable ? "is-clickable" : ""}`}
      onClick={onClick}
      disabled={!clickable}
    >
      <div className="asset-progress-head">
        <div>
          {!compact ? (
            <span className="asset-progress-kicker">
              {type === "membership" ? <><FlowApiBrandText text="FLOWAPI" size="sm" animated /> 黑金会员</> : title}
            </span>
          ) : null}
          <strong>{compact ? title : type === "membership" ? "剩余会员天数" : title}</strong>
          <p>{subtitle || renderHeadline({ currentValue, totalValue, title, type, unit, remainingDays })}</p>
        </div>
        {actionLabel ? <em>{actionLabel}</em> : null}
      </div>

      <div className={`asset-progress-track type-${type} status-${displayStatus}`}>
        <div
          className={`asset-progress-fill type-${type} ${shouldAnimate ? "animated" : ""} ${exhausted ? "is-exhausted" : ""}`}
          style={{ width: `${progress}%` }}
          data-status={displayStatus}
        >
          {shouldGlow ? <i className={`asset-progress-glow type-${type}`} aria-hidden="true" /> : null}
          {exhausted ? <span className="asset-progress-endcap" aria-hidden="true" /> : null}
        </div>
      </div>

      <div className="asset-progress-meta">
        <span>{leftLabel || (Number.isFinite(Number(totalValue)) ? `已用 ${renderValue((Number(totalValue || 0) - Number(currentValue || 0)), unit)}` : "已用 0")}</span>
        <span>{rightLabel || (Number.isFinite(Number(currentValue)) ? `剩余 ${renderValue(currentValue, unit)}` : `剩余 ${renderValue(0, unit)}`)}</span>
      </div>

      {!compact && secondaryPercent !== null && secondaryPercent !== undefined ? (
        <div className="asset-progress-secondary">
          <div className="asset-progress-secondary-title">
            <span>{secondaryTitle || "到期时间进度"}</span>
            {expiresAt ? <small>{formatWalletDate(expiresAt)} 到期</small> : null}
          </div>
          <div className={`asset-progress-track type-${type} secondary status-${displayStatus}`}>
            <div
              className={`asset-progress-fill type-${type} secondary ${shouldAnimate ? "animated" : ""} ${exhausted ? "is-exhausted" : ""}`}
              style={{ width: `${secondaryProgress}%` }}
            />
          </div>
          <div className="asset-progress-meta compact">
            <span>{secondaryLeftLabel || "已使用"}</span>
            <span>{secondaryRightLabel || "剩余时间"}</span>
          </div>
        </div>
      ) : null}

      {!compact && footnote ? <div className="asset-progress-footnote">{footnote}</div> : null}
      {!compact ? <span className="asset-progress-state-label">{progressLabel}</span> : null}
    </button>
  );
}
