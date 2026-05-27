import LiveNumber from "@/components/ui/live-number";
import { formatSmallCny } from "@/lib/analytics/savings";

type SavingsRankCardProps = {
  rank?: {
    savedAmountCny?: number;
    percentileTop?: number;
    beatsUsersPercent?: number;
    rankUpdatedAt?: string;
  } | null;
};

function formatUpdate(value?: string) {
  if (!value) return "排名数据生成中";
  const diff = Date.now() - new Date(value).getTime();
  if (Number.isFinite(diff) && diff < 60_000) return "刚刚";
  return new Date(value).toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export default function SavingsRankCard({ rank }: SavingsRankCardProps) {
  if (!rank) {
    return (
      <section className="savings-rank-card empty">
        <span>你的节省排名</span>
        <strong>排名数据生成中</strong>
        <p>平台节省金额样本不足时，不展示虚假排名。</p>
      </section>
    );
  }

  return (
    <section className="savings-rank-card">
      <span>你的节省排名</span>
      <strong>前 <LiveNumber value={Number(rank.percentileTop || 0)} suffix="%" /></strong>
      <p>你已超过平台 <b>{Number(rank.beatsUsersPercent || 0)}%</b> 的用户</p>
      <div>
        <small>累计节省</small>
        <b>{formatSmallCny(rank.savedAmountCny)}</b>
      </div>
      <em>排名更新时间：{formatUpdate(rank.rankUpdatedAt)}</em>
    </section>
  );
}
