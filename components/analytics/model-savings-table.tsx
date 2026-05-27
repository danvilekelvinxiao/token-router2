import ModelLogo from "@/components/ModelLogo";
import { formatSmallCny } from "@/lib/analytics/savings";
import { formatTokens } from "@/lib/model-format";

type ModelSaving = {
  model: string;
  provider: string;
  officialInputPricePerM?: number;
  officialOutputPricePerM?: number;
  flowapiInputPricePerM?: number;
  flowapiOutputPricePerM?: number;
  requests?: number;
  totalTokens?: number;
  officialCostCny?: number;
  actualCostCny?: number;
  savedAmountCny?: number;
  savedPercent?: number;
};

export default function ModelSavingsTable({ items = [] }: { items?: ModelSaving[] }) {
  if (!items.length) {
    return (
      <div className="savings-empty-block">
        <strong>暂无模型节省明细</strong>
        <span>完成真实调用，并配置官方价格后，这里会显示每个模型节省了多少成本。</span>
      </div>
    );
  }

  return (
    <div className="model-savings-table">
      <div className="model-savings-head">
        <span>模型</span>
        <span>官方价格</span>
        <span>FlowAPI 价格</span>
        <span>调用</span>
        <span>官方预估</span>
        <span>实际费用</span>
        <span>节省</span>
      </div>
      {items.map((item) => (
        <article key={`${item.provider}-${item.model}`} className="model-savings-row">
          <div className="model-savings-model">
            <ModelLogo model={item.model} provider={item.provider} size={30} />
            <span>
              <strong>{item.model}</strong>
              <small>by {item.provider}</small>
            </span>
          </div>
          <div>
            <span>输入 {formatSmallCny(item.officialInputPricePerM)} / M Token</span>
            <span>输出 {formatSmallCny(item.officialOutputPricePerM)} / M Token</span>
          </div>
          <div>
            <span>输入 {formatSmallCny(item.flowapiInputPricePerM)} / M Token</span>
            <span>输出 {formatSmallCny(item.flowapiOutputPricePerM)} / M Token</span>
          </div>
          <div>
            <b>{Number(item.requests || 0).toLocaleString()} 次</b>
            <span>{formatTokens(Number(item.totalTokens || 0))} Token</span>
          </div>
          <b>{formatSmallCny(item.officialCostCny)}</b>
          <b>{formatSmallCny(item.actualCostCny)}</b>
          <div className={Number(item.savedAmountCny || 0) > 0 ? "saving-positive" : "saving-neutral"}>
            <b>{Number(item.savedAmountCny || 0) > 0 ? formatSmallCny(item.savedAmountCny) : "未节省"}</b>
            <span>{Number(item.savedPercent || 0) > 0 ? `${Number(item.savedPercent).toFixed(1)}%` : "0%"}</span>
          </div>
        </article>
      ))}
    </div>
  );
}
