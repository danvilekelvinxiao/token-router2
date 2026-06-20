import LiveNumber from "@/components/ui/live-number";
import MiniMetricChart, { type MiniMetricChartPoint } from "@/components/charts/mini-metric-chart";
import { formatSmallCny } from "@/lib/analytics/savings";

type SavingsCardProps = {
  title: string;
  amount?: number | null;
  subtitle: string;
  description: string;
  loading?: boolean;
  source?: string;
  rankText?: string;
  chartData?: MiniMetricChartPoint[];
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
  chartData = [],
  onClick,
}: SavingsCardProps) {
  const hasRealData = source === "real" && amount !== null && amount !== undefined;
  const formatted = hasRealData ? formatSmallCny(amount) : null;

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
        {loading ? "同步中" : hasRealData && formatted ? <LiveNumber value={formatted.replace("¥", "")} prefix="¥" /> : "—"}
      </strong>
      {rankText ? <p className="savings-card-rank">{rankText}</p> : null}
      <p>{hasRealData ? description : "等待真实调用后展示节省金额"}</p>
      <MiniMetricChart
        data={chartData}
        type="line"
        color="green"
        valueFormatter={(value) => `¥${Number(value || 0).toFixed(2)}`}
        height={62}
        emptyText=""
      />
      <span className="savings-card-detail-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </span>
    </article>
  );
}
