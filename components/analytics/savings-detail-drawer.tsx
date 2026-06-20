import LiveNumber from "@/components/ui/live-number";
import { formatSmallCny } from "@/lib/analytics/savings";
import CallSavingsList from "./call-savings-list";
import ModelSavingsTable from "./model-savings-table";
import SavingsRankCard from "./savings-rank-card";

type SavingsDetailDrawerProps = {
  open: boolean;
  onClose: () => void;
  data: any;
  loading?: boolean;
  period: string;
  onPeriodChange: (period: string) => void;
};

const PERIODS = [
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
  { key: "month", label: "本月" },
  { key: "all", label: "全部" },
];

export default function SavingsDetailDrawer({
  open,
  onClose,
  data,
  loading = false,
  period,
  onPeriodChange,
}: SavingsDetailDrawerProps) {
  if (!open) return null;

  const source = data?.source || "empty";
  const summary = data?.summary;
  const hasData = source === "real" && summary;

  return (
    <div className="savings-drawer-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <aside className="savings-drawer">
        <header>
          <div>
            <span>Cost Advantage</span>
            <h2>节省金额详情</h2>
            <p>对比官方直连价格和 FlowAPI 实际调用价格，查看你每个模型、每一笔调用节省了多少。</p>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </header>

        <div className="savings-period-tabs">
          {PERIODS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={period === item.key ? "active" : ""}
              onClick={() => onPeriodChange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="savings-empty-block">
            <strong>—</strong>
            <span>—</span>
          </div>
        ) : !hasData ? (
          <div className="savings-empty-block">
            <strong>—</strong>
            <span>—</span>
          </div>
        ) : (
          <>
            <div className="savings-summary-grid">
              <div><span>官方预估费用</span><strong><LiveNumber value={formatSmallCny(summary.officialCostCny).replace("¥", "")} prefix="¥" /></strong></div>
              <div><span>FlowAPI 实际费用</span><strong><LiveNumber value={formatSmallCny(summary.actualCostCny).replace("¥", "")} prefix="¥" /></strong></div>
              <div className="saving-positive"><span>已节省费用</span><strong><LiveNumber value={formatSmallCny(summary.savedAmountCny).replace("¥", "")} prefix="¥" /></strong></div>
              <div><span>平均节省比例</span><strong><LiveNumber value={Number(summary.savedPercent || 0)} suffix="%" decimals={1} /></strong></div>
            </div>

            <SavingsRankCard rank={data?.savingRank} />

            {Number(data?.skippedNoOfficialPrice || 0) > 0 ? (
              <div className="savings-warning">
                部分模型官方价格未配置，暂不参与节省金额计算。
              </div>
            ) : null}

            <section className="savings-detail-section">
              <h3>模型节省明细</h3>
              <ModelSavingsTable items={data?.modelSavings || []} />
            </section>

            <section className="savings-detail-section">
              <h3>调用节省流水</h3>
              <CallSavingsList items={data?.callSavings || []} />
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
