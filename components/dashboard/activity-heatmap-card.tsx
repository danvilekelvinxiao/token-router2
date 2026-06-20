import { useState } from "react";
import ActivityHeatmapGrid from "@/components/dashboard/activity-heatmap-grid";
import ActivityDayDetailDrawer from "@/components/dashboard/activity-day-detail-drawer";

type ActivityDay = {
  date?: string;
  day?: number;
  level?: number;
  requests?: number;
  tokens?: number;
  spend?: number;
};

type ActivityHeatmapCardProps = {
  calendar: {
    label?: string;
    weeks?: Array<Array<ActivityDay | null>>;
    maxTokens?: number;
  };
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
          <p>{hasData ? "查看你每天的 API 调用活跃度。" : "完成首次 API 调用后，这里会显示你的每日调用活跃情况。"}</p>
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
          <ActivityHeatmapGrid weeks={calendar.weeks || []} onSelectDay={setSelectedDay} />
          <div className="activity-heatmap-legend">
            <span>少</span>
            {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`level-${level}`} />)}
            <span>多</span>
          </div>
        </>
      ) : (
        <div className="activity-heatmap-empty">
          <strong>—</strong>
          <p>—</p>
        </div>
      )}

      <ActivityDayDetailDrawer day={selectedDay} onClose={() => setSelectedDay(null)} />
    </article>
  );
}
