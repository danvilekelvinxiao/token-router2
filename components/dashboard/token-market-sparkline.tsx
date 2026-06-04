import MiniMetricChart from "@/components/charts/mini-metric-chart";
import { formatRequestCount, formatSmallCny, formatToken } from "@/lib/format/number-format";

type TokenMarketSparklineProps = {
  points?: Array<Record<string, any>>;
  metric?: string;
  color?: "purple" | "cyan" | "green" | "yellow" | "orange" | "red";
  height?: number;
};

function metricValue(point: Record<string, any>, metric: string) {
  if (metric === "official_price") return point.officialPrice;
  if (metric === "flowapi_price") return point.flowapiPrice;
  if (metric === "requests") return point.requests;
  if (metric === "saving") return point.savedAmountCny;
  if (metric === "spend") return point.spendCny;
  return point.tokens;
}

function formatValue(value: number, metric: string) {
  if (metric === "official_price" || metric === "flowapi_price" || metric === "saving" || metric === "spend") {
    return formatSmallCny(value, "数据同步中");
  }
  if (metric === "requests") return formatRequestCount(value, "数据同步中");
  return formatToken(value, { compact: false, emptyText: "数据同步中" });
}

export default function TokenMarketSparkline({
  points = [],
  metric = "token",
  color = "cyan",
  height = 64,
}: TokenMarketSparklineProps) {
  const data = points.map((point) => ({
    label: point.label,
    value: metricValue(point, metric) ?? null,
    meta: point,
  }));

  return (
    <MiniMetricChart
      data={data}
      type="sparkline"
      color={color}
      height={height}
      emptyText=""
      showTooltip={false}
      valueFormatter={(value) => formatValue(value, metric)}
      tooltipRenderer={(point) => {
        const meta = point.meta || {};
        return (
          <>
            <strong>{point.label}</strong>
            <span>{formatValue(Number(point.value || 0), metric)}</span>
            <small>官方价：{meta.officialPrice ? `${formatSmallCny(meta.officialPrice)} / M` : "同步中"}</small>
            <small>FlowAPI：{meta.flowapiPrice ? `${formatSmallCny(meta.flowapiPrice)} / M` : "同步中"}</small>
            <small>{formatRequestCount(meta.requests, "数据同步中")} · {formatToken(meta.tokens, { compact: false, emptyText: "数据同步中" })}</small>
          </>
        );
      }}
    />
  );
}
