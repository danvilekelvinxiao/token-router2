import type { UserBadge } from "@/lib/profile/badges";
import UserBadgeChip from "./user-badge-chip";

type UserBadgeDrawerProps = {
  open: boolean;
  onClose: () => void;
  badges?: UserBadge[];
  summary?: {
    totalBadges?: number;
    legendaryCount?: number;
    topPercentCount?: number;
  };
};

function formatMetric(badge: UserBadge) {
  const value = Number(badge.metricValue || 0);
  if (badge.metricUnit === "¥") return `¥${value.toFixed(value >= 1 ? 2 : 6)}`;
  if (badge.metricUnit === "Token") return `${value.toLocaleString()} Token`;
  return `${value.toLocaleString()} ${badge.metricUnit}`;
}

function formatTime(value?: string) {
  if (!value) return "刚刚";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function groupBadges(badges: UserBadge[] = []) {
  return [
    { key: "high_value", title: "高含金量称号", items: badges.filter((badge) => badge.category === "high_value" || badge.rank === 1 || badge.level === "diamond" || badge.level === "platinum" || badge.level === "red") },
    { key: "model", title: "模型称号", items: badges.filter((badge) => badge.category === "model" || badge.type.startsWith("model_")) },
    { key: "asset", title: "资产称号", items: badges.filter((badge) => badge.category === "asset" && !badge.type.startsWith("model_")) },
    { key: "growth", title: "成长称号", items: badges.filter((badge) => badge.category === "growth") },
  ].map((group) => ({ ...group, items: group.items.filter((item, index, list) => list.findIndex((next) => next.id === item.id) === index) }));
}

export default function UserBadgeDrawer({ open, onClose, badges = [], summary }: UserBadgeDrawerProps) {
  if (!open) return null;
  const groups = groupBadges(badges);

  return (
    <div className="user-badge-drawer-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="user-badge-drawer">
        <header>
          <div>
            <span>FlowAPI Honors</span>
            <h2>我的 FlowAPI 称号</h2>
            <p>称号根据你的真实充值、Token 消耗、模型使用和调用数据自动生成。</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="user-badge-summary">
          <div><span>全部称号</span><strong>{Number(summary?.totalBadges || badges.length)}</strong></div>
          <div><span>传奇称号</span><strong>{Number(summary?.legendaryCount || 0)}</strong></div>
          <div><span>前 1%</span><strong>{Number(summary?.topPercentCount || 0)}</strong></div>
        </div>

        {badges.length ? groups.map((group) => group.items.length ? (
          <section key={group.key} className="user-badge-section">
            <h3>{group.title}</h3>
            <div className="user-badge-detail-grid">
              {group.items.map((badge) => (
                <article key={badge.id} className={`user-badge-detail-card level-${badge.level}`}>
                  <UserBadgeChip badge={badge} compact />
                  <strong>{badge.title}</strong>
                  <p>{badge.description}</p>
                  <dl>
                    <div><dt>等级</dt><dd>{badge.level}</dd></div>
                    <div><dt>排名 / 百分比</dt><dd>{badge.rank && badge.rank <= 10 ? `第 ${badge.rank}` : badge.percentileTop ? `前 ${badge.percentileTop}%` : "-"}</dd></div>
                    <div><dt>统计维度</dt><dd>{badge.dimension}</dd></div>
                    <div><dt>统计周期</dt><dd>{badge.period}</dd></div>
                    <div><dt>指标值</dt><dd>{formatMetric(badge)}</dd></div>
                    <div><dt>更新时间</dt><dd>{formatTime(badge.updatedAt)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          </section>
        ) : null) : (
          <div className="user-badge-empty">
            <strong>暂无称号</strong>
            <p>完成更多真实模型调用、充值或邀请后，系统会根据你的使用数据自动生成称号。</p>
          </div>
        )}
      </aside>
    </div>
  );
}
