type UsageDeltaBadgeProps = {
  tokens?: number | null;
  costCny?: number | null;
  savedCny?: number | null;
  durationMs?: number | null;
  animated?: boolean;
};

function hasUsageValue(value: number | null | undefined) {
  return value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) > 0;
}

function formatToken(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 1 : 2)}K Token`;
  return `${value.toFixed(1)} Token`;
}

function formatMoney(value: number) {
  return `¥${value.toFixed(2)}`;
}

export default function UsageDeltaBadge({
  tokens,
  costCny,
  savedCny,
  durationMs,
  animated = true,
}: UsageDeltaBadgeProps) {
  const hasTokens = hasUsageValue(tokens);
  const hasCost = hasUsageValue(costCny);
  const hasSaved = hasUsageValue(savedCny);
  const titleParts = [
    hasTokens ? `消耗 ${formatToken(Number(tokens))}` : "Token 数据同步中",
    hasCost ? `花费 ${formatMoney(Number(costCny))}` : "金额数据同步中",
    durationMs ? `耗时 ${Number(durationMs)}ms` : "",
  ].filter(Boolean);

  return (
    <div className={["usage-delta", animated ? "is-animated" : ""].filter(Boolean).join(" ")} title={titleParts.join(" · ")}>
      <strong className="usage-delta-token">{hasTokens ? `-${formatToken(Number(tokens))}` : "Token 数据同步中"}</strong>
      <strong className="usage-delta-money">{hasCost ? `-${formatMoney(Number(costCny))}` : "¥ 数据同步中"}</strong>
      {hasSaved ? <span className="usage-delta-saved">已省 {formatMoney(Number(savedCny))}</span> : null}
    </div>
  );
}
