import LiveNumber from "@/components/ui/live-number";
import ModelLogo from "@/components/ModelLogo";
import TokenMarketSparkline from "@/components/dashboard/token-market-sparkline";
import {
  formatChangeCny,
  formatCny,
  formatPercent,
  formatSmallCny,
  formatTokenCompact,
  formatTrendPercent,
} from "@/lib/format/number-format";

type TokenMarketRowProps = {
  model: Record<string, any>;
  metric: string;
  onClick: (model: Record<string, any>) => void;
};

function formatPrice(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? formatSmallCny(number, "同步中") : "同步中";
}

function changeClass(value: unknown) {
  const number = Number(Number(value || 0).toFixed(2));
  if (number > 0) return "market-up";
  if (number < 0) return "market-down";
  return "market-flat";
}

function sparkColor(model: Record<string, any>) {
  const change = Number(model.tokenChangePercent ?? model.spendChangePercent ?? 0);
  if (change < 0) return "red";
  if (change > 0) return "green";
  return "cyan";
}

export default function TokenMarketRow({ model, metric, onClick }: TokenMarketRowProps) {
  const hasOfficialPricing = Number(model.officialSpendCny || 0) > 0 || Number(model.officialInputPricePerM || 0) > 0;
  return (
    <button type="button" className="token-market-row" onClick={() => onClick(model)}>
      <span className="token-market-rank">{model.rank}</span>
      <span className="token-market-model-cell">
        <ModelLogo model={model.modelId || model.displayName} provider={model.provider} size={34} />
        <span>
          <strong>{model.displayName || model.model}</strong>
          <small>{model.provider || "FlowAPI"} · {model.modelId}</small>
        </span>
      </span>
      <span className="token-market-price-pair">
        <b>{formatPrice(model.officialInputPricePerM)} / M</b>
        <small>输出 {formatPrice(model.officialOutputPricePerM)} / M</small>
      </span>
      <span className="token-market-price-pair">
        <b>{formatPrice(model.flowapiInputPricePerM)} / M</b>
        <small>输出 {formatPrice(model.flowapiOutputPricePerM)} / M</small>
      </span>
      <span className="token-market-number">
        <b><LiveNumber value={formatTokenCompact(model.currentTokens)} /></b>
        <small>{Number(model.tokenChange || 0) >= 0 ? "+" : ""}{formatTokenCompact(model.tokenChange)} Token</small>
      </span>
      <span className={`token-market-change ${changeClass(model.spendChangeCny)}`}>
        <b><LiveNumber value={formatChangeCny(model.spendChangeCny)} /></b>
      </span>
      <span className={`token-market-change-percent ${changeClass(model.spendChangeCny)}`}>
        <b>{formatTrendPercent(model.spendChangePercent)}</b>
      </span>
      <span className="token-market-chart">
        <TokenMarketSparkline points={model.trend || []} metric={metric} color={sparkColor(model)} height={58} />
      </span>
      <span className="token-market-saving">
        <b>{hasOfficialPricing ? formatCny(model.savedAmountCny, "同步中") : "同步中"}</b>
      </span>
      <span className="token-market-saving-percent">
        <b>{hasOfficialPricing ? formatPercent(model.savedPercent) : "同步中"}</b>
      </span>
    </button>
  );
}
