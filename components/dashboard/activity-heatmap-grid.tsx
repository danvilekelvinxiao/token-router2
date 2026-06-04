import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { getClampedTooltipPosition } from "@/components/charts/flowapi-chart-interaction";

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
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<{ day: ActivityDay; x: number; y: number } | null>(null);
  const canPortal = typeof document !== "undefined";

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  function showTooltip(day: ActivityDay, x: number, y: number) {
    pendingRef.current = { day, x, y };
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const pending = pendingRef.current;
      if (!pending) return;
      setTooltip(pending);
    });
  }

  function hideTooltip() {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingRef.current = null;
    setTooltip(null);
  }

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
                onClick={(event) => {
                  event.preventDefault();
                  event.currentTarget.blur();
                  onSelectDay?.(day);
                }}
                onMouseEnter={(event) => showTooltip(day, event.clientX, event.clientY)}
                onMouseMove={(event) => showTooltip(day, event.clientX, event.clientY)}
                onMouseLeave={hideTooltip}
                onTouchStart={(event) => {
                  if (event.touches?.[0]) showTooltip(day, event.touches[0].clientX, event.touches[0].clientY);
                }}
              >
                {day.day}
              </button>
            ) : (
              <span className="activity-heatmap-cell is-empty" key={`empty-${weekIndex}-${dayIndex}`} />
            ))}
          </div>
        ))}
      </div>
      {tooltip && canPortal ? createPortal((
        <div
          className="activity-heatmap-tooltip flowapi-chart-tooltip"
          data-visible="true"
          style={{
            left: 0,
            top: 0,
            "--tooltip-x": `${getClampedTooltipPosition({ clientX: tooltip.x, clientY: tooltip.y, width: 220, height: 145, offsetX: 14, offsetY: 14 }).x}px`,
            "--tooltip-y": `${getClampedTooltipPosition({ clientX: tooltip.x, clientY: tooltip.y, width: 220, height: 145, offsetX: 14, offsetY: 14 }).y}px`,
          } as CSSProperties}
        >
          <strong>{formatDate(tooltip.day.date)}</strong>
          <span>调用：{Number(tooltip.day.requests || 0)} 次</span>
          <span>Token：{formatToken(tooltip.day.tokens)}</span>
          <span>花费：{formatCny(tooltip.day.spend)}</span>
        </div>
      ), document.body) : null}
    </div>
  );
}
