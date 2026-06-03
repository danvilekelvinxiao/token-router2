import Link from "next/link";
import ModelLogo from "@/components/ModelLogo";
import { formatRequestCount, formatSmallCny, formatTokenCompact } from "@/lib/format/number-format";

type ModelLeaderboardRowProps = {
  item: {
    rank: number;
    model: string;
    provider: string;
    logo?: string;
    tokens?: number | null;
    tokensLabel?: string;
    changePercent?: number | null;
    isNew?: boolean;
    requests?: number;
    costCny?: number;
    share?: number;
  };
  showTooltip?: boolean;
};

function formatTrend(item: ModelLeaderboardRowProps["item"]) {
  if (item.isNew) {
    return { label: "new", className: "is-new" };
  }

  const value = Number(item.changePercent);
  if (!Number.isFinite(value)) {
    return { label: "", className: "" };
  }

  if (value > 0) return { label: `↑${Math.round(value)}%`, className: "is-up" };
  if (value < 0) return { label: `↓${Math.abs(Math.round(value))}%`, className: "is-down" };
  return { label: "0%", className: "is-flat" };
}

export default function ModelLeaderboardRow({ item, showTooltip = false }: ModelLeaderboardRowProps) {
  const trend = formatTrend(item);
  const hasTokenNumber = item.tokens !== null && item.tokens !== undefined && Number.isFinite(Number(item.tokens)) && Number(item.tokens) > 0;
  const tokenLabel = item.tokensLabel || formatTokenCompact(item.tokens, "数据同步中");
  const provider = item.provider || item.logo || "unknown";
  const hasTooltip = showTooltip && (item.requests !== undefined || item.costCny !== undefined || item.share !== undefined);

  return (
    <Link href={`/models?model=${encodeURIComponent(item.model)}`} className={`model-leaderboard-row ${item.rank <= 3 ? "is-top" : ""}`}>
      <div className="model-leaderboard-rank">{item.rank}</div>
      <ModelLogo model={item.model} provider={provider} size={36} />
      <div className="model-leaderboard-main">
        <div className="model-leaderboard-name" title={item.model}>{item.model}</div>
        <div className="model-leaderboard-provider" title={provider}>{provider}</div>
      </div>
      <div className="model-leaderboard-metric">
        <div className="model-leaderboard-token">{tokenLabel}{hasTokenNumber ? <span>Token</span> : null}</div>
        {trend.label ? <div className={`model-leaderboard-trend ${trend.className}`}>{trend.label}</div> : null}
      </div>
      {hasTooltip ? (
        <div className="model-leaderboard-tooltip" role="tooltip">
          <strong>{item.model}</strong>
          <span>Provider：{provider}</span>
          <span>{hasTokenNumber ? `Token：${tokenLabel} Token` : `状态：${tokenLabel}`}</span>
          <span>请求次数：{formatRequestCount(item.requests)}</span>
          <span>消耗金额：{formatSmallCny(item.costCny)}</span>
          <span>占比：{Number(item.share || 0).toFixed(1)}%</span>
          {trend.label ? <span>趋势：{trend.label}</span> : null}
        </div>
      ) : null}
    </Link>
  );
}
