import type { UserBadge } from "@/lib/profile/badges";

type UserBadgeChipProps = {
  badge: UserBadge;
  compact?: boolean;
  onClick?: () => void;
};

function levelLabel(level: string) {
  return {
    legendary: "传奇",
    diamond: "钻石",
    platinum: "铂金",
    red: "前 1%",
    gold: "前 5%",
    normal: "前 10%",
  }[level] || "称号";
}

export default function UserBadgeChip({ badge, compact = false, onClick }: UserBadgeChipProps) {
  const isRankBadge = Number(badge.rank || 0) > 0 && Number(badge.rank || 0) <= 10;
  const isTopOne = badge.level === "red" || (Number(badge.percentileTop || 0) <= 1 && Number(badge.rank || 0) > 10);
  const className = [
    "user-badge-chip",
    `level-${badge.level}`,
    badge.animated || isRankBadge ? "badge-animated" : "",
    isTopOne ? "text-top-one-percent" : "",
    compact ? "compact" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      type="button"
      className={className}
      title={badge.rank === 1 ? "站内第一" : badge.description}
      onClick={onClick}
    >
      {badge.level === "legendary" ? <span className="badge-crown">♕</span> : null}
      <span>{badge.title}</span>
      {!compact ? <em>{levelLabel(badge.level)}</em> : null}
    </button>
  );
}
