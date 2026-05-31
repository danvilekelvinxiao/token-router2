import TokenMarketRow from "@/components/dashboard/token-market-row";

type TokenMarketTableProps = {
  models: Array<Record<string, any>>;
  metric: string;
  onSelectModel: (model: Record<string, any>) => void;
};

export default function TokenMarketTable({ models, metric, onSelectModel }: TokenMarketTableProps) {
  return (
    <div className="token-market-table" role="table" aria-label="AI Token 行情表">
      <div className="token-market-table-head" role="row">
        <span>排名</span>
        <span>模型</span>
        <span>官方价格</span>
        <span>FlowAPI 价格</span>
        <span>消耗 Token</span>
        <span>变化金额</span>
        <span>变化百分比</span>
        <span>趋势图</span>
        <span>节省金额</span>
        <span>节省比例</span>
      </div>
      <div className="token-market-table-body">
        {models.map((model) => (
          <TokenMarketRow
            key={`${model.modelId || model.model}-${model.rank}`}
            model={model}
            metric={metric}
            onClick={onSelectModel}
          />
        ))}
      </div>
    </div>
  );
}
