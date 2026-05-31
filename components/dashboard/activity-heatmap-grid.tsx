import { useState } from "react";

type ActivityDay = {
  date?: string;
  day?: number;
  level?: number;
  requests?: number;
  tokens?: number;
  spend?: number;
};

type ActivityHeatmapGridProps = {
  weeks: Array<Array<ActivityDay | null>>;
  onSelectDay?: (day: ActivityDay) => void;
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

function formatDate(value?: string) {
  return value ? value.replace(/-/g, "/") : "日期同步中";
}

function formatToken(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "暂无数据";
  if (number >= 1_000_000) return `${Number((number / 1_000_000).toFixed(1))}M`;
  if (number >= 1_000) return `${Number((number / 1_000).toFixed(1))}K`;
  return `${Math.round(number)}`;
}

function formatCny(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "暂无数据";
  return `¥${number.toFixed(number > 0 && number < 0.01 ? 6 : 2)}`;
}

export default function ActivityHeatmapGrid({ weeks, onSelectDay }: ActivityHeatmapGridProps) {
  const [tooltip, setTooltip] = useState<{ day: ActivityDay; x: number; y: number } | null>(null);

  return (
    <div className="activity-heatmap-grid-wrap">
      <div className="activity-heatmap-weekdays">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>
      <div className="activity-heatmap-grid">
        {weeks.map((week, weekIndex) => (
          <div className="activity-heatmap-week" key={`week-${weekIndex}`}>
            {week.map((day, dayIndex) => day ? (
              <button
                type="button"
                key={day.date}
                className={`activity-heatmap-cell level-${day.level || 0}`}
                aria-label={`${formatDate(day.date)} 调用 ${day.requests || 0} 次`}
                onClick={() => onSelectDay?.(day)}
                onMouseEnter={(event) => setTooltip({ day, x: event.clientX, y: event.clientY })}
                onMouseMove={(event) => setTooltip({ day, x: event.clientX, y: event.clientY })}
                onMouseLeave={() => setTooltip(null)}
              >
                {day.day}
              </button>
            ) : (
              <span className="activity-heatmap-cell is-empty" key={`empty-${weekIndex}-${dayIndex}`} />
            ))}
          </div>
        ))}
      </div>
      {tooltip ? (
        <div className="activity-heatmap-tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
          <strong>{formatDate(tooltip.day.date)}</strong>
          <span>调用：{Number(tooltip.day.requests || 0)} 次</span>
          <span>Token：{formatToken(tooltip.day.tokens)}</span>
          <span>花费：{formatCny(tooltip.day.spend)}</span>
        </div>
      ) : null}
    </div>
  );
}
