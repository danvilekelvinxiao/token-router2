import LiveNumber from "@/components/ui/live-number";
import { formatSmallCny } from "@/lib/analytics/savings";

type SavingsCardProps = {
  title: string;
  amount?: number | null;
  subtitle: string;
  description: string;
  loading?: boolean;
  source?: string;
  rankText?: string;
  onClick: () => void;
};

export default function SavingsCard({
  title,
  amount,
  subtitle,
  description,
  loading = false,
  source = "empty",
  rankText = "",
  onClick,
}: SavingsCardProps) {
  const hasRealData = source === "real" && amount !== null && amount !== undefined;
  const formatted = hasRealData ? formatSmallCny(amount) : "暂无数据";

  return (
    <article
      className={`savings-card ${hasRealData ? "is-real" : "is-empty"}`}
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
    >
      <div className="savings-card-head">
        <span>{title}</span>
        <em>{loading ? "同步中" : subtitle}</em>
      </div>
      <strong className="savings-card-value">
        {loading ? "同步中" : hasRealData ? <LiveNumber value={formatted.replace("¥", "")} prefix="¥" /> : formatted}
      </strong>
      {rankText ? <p className="savings-card-rank">{rankText}</p> : null}
      <p>{hasRealData ? description : "完成真实模型调用后，系统会根据官方价格和 FlowAPI 实际价格为你计算节省金额。"}</p>
      <small>点击查看详情</small>
    </article>
  );
}
