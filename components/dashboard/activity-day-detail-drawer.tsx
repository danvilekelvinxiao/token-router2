import { createPortal } from "react-dom";

type ActivityDay = {
  date?: string;
  requests?: number;
  tokens?: number;
  spend?: number;
};

type ActivityDayDetailDrawerProps = {
  day: ActivityDay | null;
  onClose: () => void;
};

function formatDate(value?: string) {
  if (!value) return "日期同步中";
  return value.replace(/-/g, "/");
}

function formatToken(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "暂无数据";
  if (number >= 1_000_000) return `${Number((number / 1_000_000).toFixed(1))}M Token`;
  if (number >= 1_000) return `${Number((number / 1_000).toFixed(1))}K Token`;
  return `${Math.round(number)} Token`;
}

function formatCny(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "暂无数据";
  return `¥${number.toFixed(number > 0 && number < 0.01 ? 6 : 2)}`;
}

export default function ActivityDayDetailDrawer({ day, onClose }: ActivityDayDetailDrawerProps) {
  if (!day) return null;
  if (typeof document === "undefined") return null;

  return createPortal((
    <div className="activity-day-drawer-layer" role="presentation" onClick={onClose}>
      <aside className="activity-day-drawer" role="dialog" aria-modal="true" aria-label="当日调用详情" onClick={(event) => event.stopPropagation()}>
        <button type="button" onClick={onClose}>关闭</button>
        <span>当日调用详情</span>
        <h3>{formatDate(day.date)}</h3>
        <div className="activity-day-drawer-grid">
          <article>
            <span>调用次数</span>
            <strong>{Number(day.requests || 0)} 次</strong>
          </article>
          <article>
            <span>Token</span>
            <strong>{formatToken(day.tokens)}</strong>
          </article>
          <article>
            <span>花费</span>
            <strong>{formatCny(day.spend)}</strong>
          </article>
        </div>
        <p>该数据来自真实 API 调用流水，用于核对当天的活跃情况和 Token 消耗。</p>
      </aside>
    </div>
  ), document.body);
}
