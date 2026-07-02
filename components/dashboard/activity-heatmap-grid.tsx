import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { getClampedTooltipPosition } from "@/components/charts/flowapi-chart-interaction";
import type { ActivityDay } from "@/components/dashboard/activity-heatmap-utils";
import { formatActivityApiCost, formatActivityCalls, formatActivityDate, formatActivityRecharge } from "@/components/dashboard/activity-heatmap-utils";

type ActivityHeatmapGridProps = {
  weeks: Array<Array<ActivityDay | null>>;
  todayKey?: string;
  onSelectDay?: (day: ActivityDay) => void;
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export default function ActivityHeatmapGrid({ weeks, todayKey, onSelectDay }: ActivityHeatmapGridProps) {
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

  const tooltipHeight = Number(tooltip?.day?.rechargeAmount || 0) > 0 ? 142 : 114;
  const tooltipPosition = tooltip
    ? getClampedTooltipPosition({ clientX: tooltip.x, clientY: tooltip.y, width: 240, height: tooltipHeight, offsetX: 14, offsetY: 16 })
    : { x: 0, y: 0 };

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
                className={`activity-heatmap-cell level-${day.level || 0}${day.date === todayKey || day.isToday ? " is-today" : ""}`}
                aria-label={`${formatActivityDate(day.date)} 调用 ${day.requests || 0} 次`}
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
            "--tooltip-x": `${tooltipPosition.x}px`,
            "--tooltip-y": `${tooltipPosition.y}px`,
          } as CSSProperties}
        >
          <strong>{formatActivityDate(tooltip.day.date)}</strong>
          {Number(tooltip.day.rechargeAmount || 0) > 0 ? <span className="is-recharge">💚 充值 {formatActivityRecharge(tooltip.day.rechargeAmount)}</span> : null}
          <span className="is-cost">🔶 API 消费：{formatActivityApiCost(tooltip.day.spend)}</span>
          <span>🔢 调用次数：{formatActivityCalls(tooltip.day.requests)}</span>
        </div>
      ), document.body) : null}
    </div>
  );
}
