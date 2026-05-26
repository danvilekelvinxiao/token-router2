import { useEffect, useMemo, useState } from "react";
import ModelLeaderboardRow from "./model-leaderboard-row";

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 680px)");
    const update = () => setIsMobile(media.matches);

    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  return isMobile;
}

function formatUpdatedAt(updatedAt) {
  if (!updatedAt) {
    return "";
  }

  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function LeaderboardSkeleton() {
  return (
    <div className="leaderboard-columns">
      {[0, 1].map((column) => (
        <div className="leaderboard-column" key={column}>
          <div className="leaderboard-column-title">
            <span className="skeleton-line skeleton-line-short" />
            <span className="skeleton-line skeleton-line-mini" />
          </div>
          {Array.from({ length: 5 }).map((_, index) => (
            <div className="leaderboard-row skeleton-row" key={`${column}-${index}`}>
              <div className="leaderboard-row-main">
                <div className="leaderboard-rank skeleton-circle" />
                <div className="model-brand-icon skeleton-brand" />
                <div className="leaderboard-model-copy">
                  <span className="skeleton-line" />
                  <span className="skeleton-line skeleton-line-short" />
                </div>
                <div className="leaderboard-metrics">
                  <span className="skeleton-line skeleton-line-short" />
                  <span className="skeleton-line skeleton-line-mini" />
                </div>
              </div>
            </div>
          ))}
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
  items = [],
  loading = false,
  emptyText = "暂无数据",
  period,
  onPeriodChange,
}) {
  const isMobile = useIsMobile();
  const [expandedRank, setExpandedRank] = useState(null);
  const visibleItems = useMemo(() => items.slice(0, 20), [items]);
  const leftItems = useMemo(() => visibleItems.slice(0, 10), [visibleItems]);
  const rightItems = useMemo(() => visibleItems.slice(10, 20), [visibleItems]);
  const showSingleColumn = isMobile || rightItems.length === 0;
  const columns = showSingleColumn ? [visibleItems] : [leftItems, rightItems];
  const updatedLabel = formatUpdatedAt(updatedAt);

  return (
    <section className="panel-box leaderboard-panel">
      <div className="leaderboard-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <div className="leaderboard-head-meta">
          {period && onPeriodChange && (
            <div className="leaderboard-periods" role="tablist" aria-label={`${title} 时间范围`}>
              {["today", "week", "month"].map((key) => (
                <button
                  key={key}
                  type="button"
                  className={period === key ? "leaderboard-period is-active" : "leaderboard-period"}
                  onClick={() => onPeriodChange(key)}
                >
                  {key === "today" ? "今日" : key === "week" ? "本周" : "本月"}
                </button>
              ))}
            </div>
          )}
          <div className={`leaderboard-source ${sourceLabel?.includes("同步") ? "is-syncing" : ""}`}>
            {sourceLabel || "暂无数据"}
          </div>
          {updatedLabel && <div className="leaderboard-updated">更新于 {updatedLabel}</div>}
        </div>
      </div>

      {loading ? (
        <LeaderboardSkeleton />
      ) : visibleItems.length ? (
        <div className={`leaderboard-columns ${showSingleColumn ? "is-single" : ""}`}>
          {columns.map((columnItems, index) => {
            if (index === 1 && columnItems.length === 0) {
              return null;
            }

            const columnLabel = showSingleColumn
              ? "1 - 20"
              : index === 0
                ? "1 - 10"
                : "11 - 20";

            return (
              <div className="leaderboard-column" key={columnLabel}>
                <div className="leaderboard-column-title">
                  <span>{columnLabel}</span>
                  <span>{columnItems.length}</span>
                </div>
                <div className="leaderboard-list">
                  {columnItems.map((item) => (
                    <ModelLeaderboardRow
                      key={`${item.rank}-${item.model}`}
                      item={item}
                      expanded={expandedRank === item.rank}
                      onToggle={() => setExpandedRank((current) => (current === item.rank ? null : item.rank))}
                      showDetail={Boolean(item.requests !== undefined || item.costCny !== undefined || item.share !== undefined)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="leaderboard-empty">{emptyText}</div>
      )}
    </section>
  );
}
