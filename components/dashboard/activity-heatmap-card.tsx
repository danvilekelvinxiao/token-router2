import { useState } from "react";
import ActivityHeatmapGrid from "@/components/dashboard/activity-heatmap-grid";
import ActivityDayDetailModal from "@/components/dashboard/activity-day-detail-modal";
import type { ActivityCalendar, ActivityDay } from "@/components/dashboard/activity-heatmap-utils";

type ActivityHeatmapCardProps = {
  calendar: ActivityCalendar;
  hasData?: boolean;
  sourceLabel?: string;
  onPreviousMonth?: () => void;
  onNextMonth?: () => void;
};

export default function ActivityHeatmapCard({
  calendar,
  hasData = false,
  sourceLabel,
  onPreviousMonth,
  onNextMonth,
}: ActivityHeatmapCardProps) {
  const [selectedDay, setSelectedDay] = useState<ActivityDay | null>(null);

  return (
    <article className="activity-heatmap-card">
      <div className="activity-heatmap-head">
        <div>
          <span>ACTIVITY MAP</span>
          <h2>活跃热力图</h2>
          <p>{hasData ? "查看你每天的 API 调用活跃度，并展开当日/本周/本月分析。" : "完成首次 API 调用后，这里会显示你的每日调用活跃情况。"}</p>
        </div>
        <div className="activity-heatmap-month">
          <button type="button" onClick={onPreviousMonth} aria-label="上个月">‹</button>
          <strong>{calendar.label || "月份同步中"}</strong>
          <button type="button" onClick={onNextMonth} aria-label="下个月">›</button>
        </div>
      </div>
      {sourceLabel ? <span className="activity-heatmap-source">{sourceLabel}</span> : null}

      {hasData ? (
        <>
          <ActivityHeatmapGrid weeks={calendar.weeks || []} todayKey={calendar.todayKey} onSelectDay={setSelectedDay} />
          <div className="activity-heatmap-legend">
            <span>低活跃</span>
            {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`level-${level}`} />)}
            <span>高活跃</span>
          </div>
        </>
      ) : (
        <div className="activity-heatmap-empty">
          <strong>暂无活跃记录</strong>
          <p>完成首次 API 调用后，这里会显示你的每日调用活跃情况。</p>
        </div>
      )}

      <ActivityDayDetailModal key={selectedDay?.date || "activity-detail"} day={selectedDay} onClose={() => setSelectedDay(null)} />
    </article>
  );
}
