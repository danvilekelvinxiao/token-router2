import ModelBrandIcon from "./model-brand-icon";
import { formatChangeTrend, formatTokens } from "@/lib/model-format";

export default function ModelLeaderboardRow({
  item,
  expanded = false,
  onToggle,
  showDetail = false,
}) {
  const trend = formatChangeTrend(item.changePercent, item.isNew);
  const hasDetail = showDetail && (item.requests !== undefined || item.costCny !== undefined || item.share !== undefined);

  return (
    <button
      type="button"
      className={`leaderboard-row ${item.rank <= 3 ? "leaderboard-row-top" : ""} ${expanded ? "is-expanded" : ""}`}
      onClick={hasDetail && onToggle ? onToggle : undefined}
      aria-expanded={hasDetail ? expanded : undefined}
    >
      <div className="leaderboard-row-main">
        <div className="leaderboard-rank">{item.rank}</div>
        <ModelBrandIcon brand={item.logo || item.provider} label={item.model} title={item.provider} />
        <div className="leaderboard-model-copy">
          <div className="leaderboard-model-name" title={item.model}>
            {item.model}
          </div>
          <div className="leaderboard-model-provider" title={item.provider}>
            by {item.provider}
          </div>
        </div>
        <div className="leaderboard-metrics">
          <div className="leaderboard-token-value">{item.tokensLabel || formatTokens(item.tokens)}</div>
          <div className={`leaderboard-trend ${trend?.tone || ""}`}>
            {trend ? trend.label : ""}
          </div>
        </div>
      </div>

      {hasDetail && (
        <div className={`leaderboard-tooltip ${expanded ? "is-open" : ""}`}>
          <div>
            <span>Token</span>
            <strong>{item.tokensLabel || formatTokens(item.tokens)} Token</strong>
          </div>
          {item.requests !== undefined && (
            <div>
              <span>请求次数</span>
              <strong>{item.requests.toLocaleString("zh-CN")} 次</strong>
            </div>
          )}
          {item.costCny !== undefined && (
            <div>
              <span>消耗金额</span>
              <strong>¥{Number(item.costCny).toFixed(2)}</strong>
            </div>
          )}
          {item.share !== undefined && (
            <div>
              <span>占比</span>
              <strong>{Number(item.share).toFixed(1)}%</strong>
            </div>
          )}
          <div>
            <span>趋势</span>
            <strong>{trend ? trend.label : "暂无数据"}</strong>
          </div>
        </div>
      )}
    </button>
  );
}
