const CATEGORY_TABS = [
  { key: "hot", label: "热门模型" },
  { key: "up", label: "消耗上涨" },
  { key: "down", label: "消耗下降" },
  { key: "cost", label: "成本最高" },
  { key: "value", label: "性价比最高" },
  { key: "member", label: "会员专属" },
];

const PERIOD_TABS = [
  { key: "1h", label: "近 1 小时" },
  { key: "24h", label: "近 24 小时" },
  { key: "7d", label: "近 7 天" },
  { key: "30d", label: "近 30 天" },
];

const METRIC_TABS = [
  { key: "official_price", label: "官方价格" },
  { key: "flowapi_price", label: "FlowAPI 价格" },
  { key: "token", label: "消耗 Token" },
  { key: "requests", label: "请求次数" },
  { key: "saving", label: "节省金额" },
];

type TokenMarketTabsProps = {
  category: string;
  period: string;
  metric: string;
  onCategoryChange: (value: string) => void;
  onPeriodChange: (value: string) => void;
  onMetricChange: (value: string) => void;
};

function TabGroup({
  items,
  value,
  onChange,
  className = "",
}: {
  items: Array<{ key: string; label: string }>;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <div className={`token-market-tab-group ${className}`}>
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          className={value === item.key ? "active" : ""}
          onClick={() => onChange(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export default function TokenMarketTabs({
  category,
  period,
  metric,
  onCategoryChange,
  onPeriodChange,
  onMetricChange,
}: TokenMarketTabsProps) {
  return (
    <div className="token-market-tabs">
      <TabGroup items={CATEGORY_TABS} value={category} onChange={onCategoryChange} className="token-market-category-tabs" />
      <div className="token-market-filter-tabs">
        <TabGroup items={PERIOD_TABS} value={period} onChange={onPeriodChange} />
        <TabGroup items={METRIC_TABS} value={metric} onChange={onMetricChange} />
      </div>
    </div>
  );
}
