import ModelLeaderboardRow from "@/components/dashboard/model-leaderboard-row";

export type ModelLeaderboardItem = {
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

type ModelLeaderboardProps = {
  title: string;
  subtitle?: string;
  sourceLabel?: string;
  updatedAt?: string | null;
  items: ModelLeaderboardItem[];
  loading?: boolean;
  emptyText?: string;
  emptyDescription?: string;
  period?: "today" | "week" | "month";
  onPeriodChange?: (period: "today" | "week" | "month") => void;
  showTooltip?: boolean;
};

const PERIODS = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
] as const;

function formatUpdatedAt(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SkeletonRows() {
  return (
    <div className="model-leaderboard-skeleton">
      {Array.from({ length: 10 }).map((_, index) => (
        <div key={index} className="model-leaderboard-skeleton-row">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export default function ModelLeaderboard({
  title,
  subtitle,
  sourceLabel,
  updatedAt,
  items,
  loading = false,
  emptyText = "暂无数据",
  emptyDescription,
  period,
  onPeriodChange,
  showTooltip = false,
}: ModelLeaderboardProps) {
  const safeItems = Array.isArray(items) ? items.slice(0, 20) : [];
  const leftItems = safeItems.slice(0, 10);
  const rightItems = safeItems.slice(10, 20);
  const updatedLabel = formatUpdatedAt(updatedAt);

  return (
    <section className="model-leaderboard-card">
      <header className="model-leaderboard-head">
        <div>
          <h3>{title}</h3>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="model-leaderboard-actions">
          {period && onPeriodChange ? (
            <div className="model-leaderboard-periods" aria-label="排行榜周期">
              {PERIODS.map((item) => (
                <button
                  key={item.key}
                  className={period === item.key ? "active" : ""}
                  type="button"
                  onClick={() => onPeriodChange(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : null}
          {sourceLabel ? (
            <span className="model-leaderboard-source">
              {sourceLabel}
              {updatedLabel ? <small>{updatedLabel}</small> : null}
            </span>
          ) : null}
        </div>
      </header>

      {loading ? (
        <div className="model-leaderboard-columns">
          <SkeletonRows />
          <SkeletonRows />
        </div>
      ) : safeItems.length === 0 ? (
        <div className="model-leaderboard-empty">
          <strong>{emptyText}</strong>
          {emptyDescription ? <span>{emptyDescription}</span> : null}
        </div>
      ) : (
        <div className={`model-leaderboard-columns ${rightItems.length ? "" : "single"}`}>
          <div className="model-leaderboard-list">
            {leftItems.map((item) => <ModelLeaderboardRow key={`${item.rank}-${item.model}`} item={item} showTooltip={showTooltip} />)}
          </div>
          {rightItems.length ? (
            <div className="model-leaderboard-list">
              {rightItems.map((item) => <ModelLeaderboardRow key={`${item.rank}-${item.model}`} item={item} showTooltip={showTooltip} />)}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
