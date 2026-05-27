import type { UserBadge } from "@/lib/profile/badges";
import Link from "next/link";
import UserBadgeChip from "./user-badge-chip";

type UserBadgesProps = {
  badges?: UserBadge[];
  total?: number;
  loading?: boolean;
  onOpen: () => void;
};

export default function UserBadges({ badges = [], total = 0, loading = false, onOpen }: UserBadgesProps) {
  const overflow = Math.max(0, total - badges.length);

  return (
    <section className="profile-user-badges">
      <div className="profile-user-badges-head">
        <span>我的称号</span>
        {total > 0 ? <button type="button" onClick={onOpen}>查看全部</button> : null}
      </div>

      {loading ? (
        <div className="profile-badge-empty compact">称号生成中</div>
      ) : badges.length ? (
        <div className="profile-badge-list">
          {badges.map((badge) => <UserBadgeChip key={badge.id} badge={badge} compact onClick={onOpen} />)}
          {overflow > 0 ? <button type="button" className="user-badge-more" onClick={onOpen}>+{overflow}</button> : null}
        </div>
      ) : (
        <div className="profile-badge-empty">
          <strong>暂无称号</strong>
          <p>完成更多模型调用后，系统会根据你的 Token 消耗、模型使用和充值数据生成称号。</p>
          <div>
            <Link href="/models">查看大模型接入</Link>
            <Link href="/recharge">立即充值</Link>
          </div>
        </div>
      )}
    </section>
  );
}
