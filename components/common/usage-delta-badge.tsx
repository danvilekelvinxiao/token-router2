import LiveNumber from "@/components/ui/live-number";

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
    hasTokens ? `消耗 ${formatToken(Number(tokens))}` : "—",
    hasCost ? `花费 ${formatMoney(Number(costCny))}` : "—",
    durationMs ? `耗时 ${Number(durationMs)}ms` : "",
  ].filter(Boolean);

  return (
    <div className={["usage-delta", animated ? "is-animated" : ""].filter(Boolean).join(" ")} title={titleParts.join(" · ")}>
      <strong className="usage-delta-token">{hasTokens ? <LiveNumber value={Number(tokens)} prefix="-" suffix=" Token" decimals={1} /> : "—"}</strong>
      <strong className="usage-delta-money">{hasCost ? <LiveNumber value={Number(costCny)} prefix="-¥" decimals={2} /> : "—"}</strong>
      {hasSaved ? <span className="usage-delta-saved">已省 <LiveNumber value={Number(savedCny)} prefix="¥" decimals={2} /></span> : null}
    </div>
  );
}
