import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { ActivityDay, ActivityModelStat, ActivityRangeData, ActivityRangeKey, ActivityTimelinePoint } from "@/components/dashboard/activity-heatmap-utils";
import { formatActivityApiCost, formatActivityCalls, formatActivityRecharge } from "@/components/dashboard/activity-heatmap-utils";

const RANGE_OPTIONS: Array<{ key: ActivityRangeKey; label: string }> = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
];

function buildDonutBackground(stats: ActivityModelStat[]) {
  const total = stats.reduce((sum, item) => sum + Number(item.calls || 0), 0);
  if (!total) return "conic-gradient(#e2e8f0 0deg 360deg)";
  let cursor = 0;
  const stops = stats.map((item) => {
    const sweep = (Number(item.calls || 0) / total) * 360;
    const start = cursor;
    cursor += sweep;
    return `${item.color} ${start}deg ${cursor}deg`;
  });
  if (cursor < 360) stops.push(`#e2e8f0 ${cursor}deg 360deg`);
  return `conic-gradient(${stops.join(", ")})`;
}

function ModelShareDonut({ stats }: { stats: ActivityModelStat[] }) {
  const totalCalls = stats.reduce((sum, item) => sum + Number(item.calls || 0), 0);
  const background = buildDonutBackground(stats);

  return (
    <div className="activity-detail-donut-wrap">
      <div className="activity-detail-donut" style={{ background } as CSSProperties}>
        <div>
          <strong>{totalCalls.toLocaleString("zh-CN")}</strong>
          <span>总调用</span>
        </div>
      </div>
    </div>
  );
}

function buildVisibleTimelineLabels(timeline: ActivityTimelinePoint[]) {
  if (timeline.length <= 8) return new Set(timeline.map((item) => item.label));
  const step = timeline.length <= 12 ? 2 : timeline.length <= 24 ? 4 : 5;
  return new Set(timeline.filter((_, index) => index % step === 0 || index === timeline.length - 1).map((item) => item.label));
}

function TimelineChart({ range }: { range: ActivityRangeData }) {
  const timeline = Array.isArray(range.timeline) ? range.timeline : [];
  const values = timeline.map((item) => Number(item.value || 0));
  const maxValue = Math.max(...values, 1);
  const peakIndex = values.findIndex((value) => value === Math.max(...values, 0));
  const labelSet = buildVisibleTimelineLabels(timeline);
  const stepX = timeline.length > 16 ? 26 : 34;
  const chartWidth = Math.max(420, timeline.length * stepX);
  const chartHeight = 208;
  const bottom = 170;
  const barWidth = Math.max(8, Math.min(18, stepX - 10));

  if (!timeline.length) {
    return <div className="activity-detail-empty-chart">暂无时间线数据</div>;
  }

  return (
    <div className="activity-detail-timeline-wrap">
      <div className="activity-detail-timeline-scroll">
        <svg
          className="activity-detail-timeline-chart"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="xMinYMin meet"
          style={{ width: chartWidth, height: chartHeight } as CSSProperties}
          role="img"
          aria-label={`${range.title}调用时间线`}
        >
          {[0, 1, 2, 3].map((index) => {
            const y = 28 + (index * 36);
            return <line key={index} x1="20" y1={y} x2={String(chartWidth - 16)} y2={y} className="activity-detail-grid-line" />;
          })}
          {timeline.map((item, index) => {
            const value = Number(item.value || 0);
            const x = 24 + (index * stepX);
            const barHeight = Math.max(value > 0 ? 8 : 2, Math.round((value / maxValue) * 128));
            const y = bottom - barHeight;
            const isPeak = index === peakIndex && value > 0;
            return (
              <g key={`${item.label}-${index}`}>
                <title>{`${item.fullLabel || item.label}：${value.toLocaleString("zh-CN")} 次`}</title>
                <rect
                  x={x}
                  y={y}
                  rx="8"
                  ry="8"
                  width={barWidth}
                  height={barHeight}
                  className={isPeak ? "activity-detail-bar is-peak" : "activity-detail-bar"}
                />
                {isPeak ? <circle cx={x + (barWidth / 2)} cy={y - 8} r="4" className="activity-detail-peak-dot" /> : null}
                {labelSet.has(item.label) ? (
                  <text x={x + (barWidth / 2)} y="194" textAnchor="middle" className="activity-detail-axis-label">{item.label}</text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function OverviewCard({ label, value, tone }: { label: string; value: string; tone: "green" | "orange" | "violet" }) {
  return (
    <article className={`activity-detail-overview-card tone-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default function ActivityDayDetailModal({ day, onClose }: { day: ActivityDay | null; onClose: () => void }) {
  const [rangeKey, setRangeKey] = useState<ActivityRangeKey>("today");

  useEffect(() => {
    if (!day || typeof document === "undefined") return undefined;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [day, onClose]);

  const activeRange = useMemo(() => {
    if (!day?.detail) return null;
    return day.detail.ranges[rangeKey];
  }, [day, rangeKey]);

  if (!day?.detail || !activeRange) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="activity-detail-modal-layer" role="presentation" onClick={onClose}>
      <section className="activity-detail-modal" role="dialog" aria-modal="true" aria-label="活跃热力图详情" onClick={(event) => event.stopPropagation()}>
        <header className="activity-detail-modal-header">
          <div>
            <span>LOWAPI INSIGHTS</span>
            <h3>{day.detail.titleDate} · API 调用总览</h3>
            <p>切换时间维度，查看充值、消费、模型排行与调用趋势。</p>
          </div>
          <button type="button" aria-label="关闭详情弹窗" onClick={onClose}>×</button>
        </header>

        <div className="activity-detail-range-switcher" role="tablist" aria-label="时间范围切换">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={rangeKey === option.key}
              className={rangeKey === option.key ? "is-active" : ""}
              onClick={() => setRangeKey(option.key)}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div className="activity-detail-modal-body">
          <section className="activity-detail-section">
            <div className="activity-detail-section-head">
              <h4>核心总览</h4>
              <span>{activeRange.title}</span>
            </div>
            <div className="activity-detail-overview-grid">
              <OverviewCard label="充值金额" value={formatActivityRecharge(activeRange.rechargeAmount)} tone="green" />
              <OverviewCard label="API 消费" value={formatActivityApiCost(activeRange.costApi)} tone="orange" />
              <OverviewCard label="调用次数" value={formatActivityCalls(activeRange.callTimes)} tone="violet" />
            </div>
          </section>

          <section className="activity-detail-section">
            <div className="activity-detail-section-head">
              <h4>💰 资金流水记录</h4>
              <span>{activeRange.rechargeRecords.length ? `最近 ${activeRange.rechargeRecords.length} 条` : "暂无充值"}</span>
            </div>
            {activeRange.rechargeRecords.length ? (
              <div className="activity-detail-records">
                {activeRange.rechargeRecords.map((record) => (
                  <article key={record.id} className="activity-detail-record-row">
                    <time>{record.time}</time>
                    <span>{record.method}</span>
                    <strong>+{formatActivityRecharge(record.amount)}</strong>
                  </article>
                ))}
              </div>
            ) : (
              <div className="activity-detail-empty-state">暂无当{activeRange.key === "today" ? "日" : activeRange.key === "week" ? "周" : "月"}充值记录，当前消费正由账户余额支付。</div>
            )}
          </section>

          <section className="activity-detail-section activity-detail-chart-section">
            <div className="activity-detail-section-head">
              <h4>📊 模型/接口消耗排行</h4>
              <span>按调用次数聚合</span>
            </div>
            {activeRange.modelStats.length ? (
              <div className="activity-detail-model-grid">
                <ModelShareDonut stats={activeRange.modelStats} />
                <div className="activity-detail-model-list">
                  {activeRange.modelStats.map((item) => (
                    <article key={item.name} className="activity-detail-model-item">
                      <i style={{ background: item.color } as CSSProperties} />
                      <div>
                        <strong>{item.name}</strong>
                        <span>{formatActivityApiCost(item.cost)} ({item.calls.toLocaleString("zh-CN")} 次)</span>
                      </div>
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="activity-detail-empty-state">暂无模型调用数据</div>
            )}
          </section>

          <section className="activity-detail-section activity-detail-chart-section">
            <div className="activity-detail-section-head">
              <h4>📈 调用时间线分布</h4>
              <span>{activeRange.key === "today" ? "24 小时" : activeRange.key === "week" ? "周一至周日" : "自然月"}</span>
            </div>
            <TimelineChart range={activeRange} />
            <div className="activity-detail-insight">{activeRange.insight}</div>
          </section>
        </div>
      </section>
    </div>,
    document.body,
  );
}
