"use client";

import { useEffect, useMemo, useState } from "react";
import CardDetailModal, { DetailRows, DetailTable } from "@/components/CardDetailModal";
import { ModelNameWithLogo } from "@/components/ModelLogo";
import LiveNumber from "@/components/ui/live-number";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Scope = "user" | "workspace" | "team" | "global";
type Range = "7d" | "30d" | "90d";

type ModelUsageSummary = {
  totalRequests: number;
  successSessions: number;
  totalTokens: number;
  totalCostCny: number;
};

type RequestDistributionItem = {
  modelId: string;
  displayName: string;
  provider: string;
  requests: number;
  percentage: number;
  costCny?: number;
};

type TokenResourceItem = {
  modelId: string;
  displayName: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  imageTokens?: number;
  totalTokens: number;
};

type GrowthTrendItem = {
  date: string;
  label: string;
  requests: number;
  tokens: number;
  costCny: number;
};

type ModelDetailItem = {
  modelId: string;
  displayName: string;
  provider: string;
  status: "available" | "maintenance" | "unavailable" | "idle";
  requests: number;
  successRate: number;
  inputTokens: number;
  outputTokens: number;
  imageTokens: number;
  totalTokens: number;
  costCny: number;
};

type Payload = {
  success?: boolean;
  scope?: Scope;
  teamId?: string;
  range?: Range;
  summary?: ModelUsageSummary;
  requestDistribution?: RequestDistributionItem[];
  tokenResources?: TokenResourceItem[];
  growthTrend?: GrowthTrendItem[];
  modelDetails?: ModelDetailItem[];
};

type Props = {
  scope?: Scope;
  teamId?: string;
  title: string;
  subtitle: string;
  className?: string;
  compact?: boolean;
};

const RANGE_OPTIONS: { key: Range; label: string }[] = [
  { key: "7d", label: "7 天" },
  { key: "30d", label: "30 天" },
  { key: "90d", label: "90 天" },
];

const COLOR_SET = [
  "#6366f1",
  "#8b5cf6",
  "#22d3ee",
  "#14b8a6",
  "#22c55e",
  "#f59e0b",
  "#f97316",
  "#ec4899",
];

function formatCompact(value: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return "—";
  if (next >= 100000000) return `${(next / 100000000).toFixed(2)} 亿`;
  if (next >= 10000) return `${(next / 10000).toFixed(1)} 万`;
  return next.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function formatToken(value: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return "—";
  if (next >= 100000000) return `${(next / 100000000).toFixed(2)} 亿 Token`;
  if (next >= 1000000) return `${(next / 1000000).toFixed(2)}M Token`;
  if (next >= 10000) return `${(next / 10000).toFixed(1)} 万 Token`;
  return `${next.toLocaleString("zh-CN", { maximumFractionDigits: 0 })} Token`;
}

function formatCurrency(value: number) {
  const next = Number(value);
  if (!Number.isFinite(next)) return "—";
  return `￥${next.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatEmptyNumber(value: number | null | undefined, formatter: (next: number) => string) {
  const next = Number(value);
  return Number.isFinite(next) ? formatter(next) : "—";
}

function hasRealUsageData(payload: Payload | null) {
  const summary = payload?.summary || { totalRequests: 0, successSessions: 0, totalTokens: 0, totalCostCny: 0 };
  return Boolean(
    Number(summary.totalRequests || 0) > 0
    || Number(summary.successSessions || 0) > 0
    || Number(summary.totalTokens || 0) > 0
    || Number(summary.totalCostCny || 0) > 0
    || (payload?.requestDistribution || []).length > 0
    || (payload?.tokenResources || []).length > 0
    || (payload?.growthTrend || []).some((item) => Number(item.requests || 0) > 0 || Number(item.tokens || 0) > 0 || Number(item.costCny || 0) > 0)
    || (payload?.modelDetails || []).length > 0
  );
}

function hasMeaningfulUsageData(payload: Payload | null) {
  const summary = payload?.summary || { totalRequests: 0, successSessions: 0, totalTokens: 0, totalCostCny: 0 };
  return Boolean(
    Number(summary.totalRequests || 0) > 0
    || Number(summary.successSessions || 0) > 0
    || Number(summary.totalTokens || 0) > 0
    || Number(summary.totalCostCny || 0) > 0
    || (payload?.requestDistribution || []).some((item) => Number(item.requests || 0) > 0)
    || (payload?.tokenResources || []).some((item) => Number(item.totalTokens || 0) > 0)
    || (payload?.growthTrend || []).some((item) => Number(item.requests || 0) > 0 || Number(item.tokens || 0) > 0 || Number(item.costCny || 0) > 0)
    || (payload?.modelDetails || []).some((item) => Number(item.requests || 0) > 0 || Number(item.totalTokens || 0) > 0)
  );
}

function clampNumber(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function isBrowser() {
  return typeof window !== "undefined";
}

function useActiveTeamId() {
  const [teamId, setTeamId] = useState("");

  useEffect(() => {
    if (!isBrowser()) return undefined;
    const read = () => {
      try {
        setTeamId(window.localStorage.getItem("flowapi_active_team_id") || "");
      } catch {
        setTeamId("");
      }
    };
    read();
    const handleSpaceChange = (event: Event) => {
      const custom = event as CustomEvent<{ teamId?: string }>;
      setTeamId(String(custom.detail?.teamId || ""));
    };
    window.addEventListener("storage", read);
    window.addEventListener("flowapi-space-change", handleSpaceChange as EventListener);
    return () => {
      window.removeEventListener("storage", read);
      window.removeEventListener("flowapi-space-change", handleSpaceChange as EventListener);
    };
  }, []);

  return teamId;
}

function useModelUsageData({ scope, teamId, range }: { scope: Scope; teamId?: string; range: Range; }) {
  const activeTeamId = useActiveTeamId();
  const resolvedScope = scope === "workspace" && activeTeamId ? "team" : scope;
  const resolvedTeamId = resolvedScope === "team" ? (teamId || activeTeamId || "") : "";
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isBrowser()) return undefined;
    const controller = new AbortController();
    const params = new URLSearchParams({ scope: resolvedScope, range });
    if (resolvedTeamId) params.set("teamId", resolvedTeamId);
    setLoading(true);
    setError("");
    fetch(`/api/dashboard/model-usage-visualization?${params.toString()}`, {
      signal: controller.signal,
      credentials: "same-origin",
    })
      .then(async (response) => {
        const json = await response.json().catch(() => null);
        if (!response.ok) throw new Error(json?.error || "加载失败");
        return json;
      })
      .then((json) => setData(json))
      .catch((nextError) => {
        if (controller.signal.aborted) return;
        setError(nextError?.message || "加载失败");
        setData({
          success: true,
          scope: resolvedScope,
          teamId: resolvedTeamId,
          range,
          summary: { totalRequests: 0, successSessions: 0, totalTokens: 0, totalCostCny: 0 },
          requestDistribution: [],
          tokenResources: [],
          growthTrend: [],
          modelDetails: [],
        });
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [range, resolvedScope, resolvedTeamId]);

  return { data, loading, error, resolvedScope, resolvedTeamId };
}

function MetricGlyph({ tone }: { tone: "requests" | "success" | "tokens" | "cost" }) {
  return (
    <span className={`flowapi-usage-glyph tone-${tone}`} aria-hidden="true">
      {tone === "requests" ? (
        <>
          <i /><i /><i />
        </>
      ) : null}
      {tone === "success" ? <b /> : null}
      {tone === "tokens" ? <em><i /><i /></em> : null}
      {tone === "cost" ? <u /> : null}
    </span>
  );
}

function MetricCard({
  tone,
  label,
  value,
  hint,
  onClick,
  loading = false,
  prefix = "",
  suffix = "",
  decimals,
  useGrouping = true,
}: {
  tone: "requests" | "success" | "tokens" | "cost";
  label: string;
  value: number | null | undefined;
  hint?: string;
  onClick?: () => void;
  loading?: boolean;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  useGrouping?: boolean;
}) {
  const isClickable = typeof onClick === "function";
  const hasRawValue = value !== null && value !== undefined && value !== "";
  const numericValue = hasRawValue ? Number(value) : null;
  const hasValue = numericValue !== null && Number.isFinite(numericValue);
  const emptyValue = !loading && !hasValue;
  const content = (
    <>
      <MetricGlyph tone={tone} />
      <div>
        <span>{label}</span>
        <strong>
          {loading
            ? "—"
            : emptyValue
              ? "—"
              : hasValue
              ? <LiveNumber value={numericValue} animate={!loading} prefix={prefix} suffix={suffix} decimals={decimals} useGrouping={useGrouping} />
              : "—"}
        </strong>
        {hint ? <small>{hint}</small> : null}
      </div>
    </>
  );

  if (isClickable) {
    return (
      <button type="button" className="flowapi-metric-card is-clickable" onClick={onClick}>
        {content}
      </button>
    );
  }

  return <article className="flowapi-metric-card">{content}</article>;
}

function SectionHeader({ title, subtitle, meta }: { title: string; subtitle: string; meta?: string }) {
  return (
    <div className="flowapi-usage-section-head">
      <div>
        <span className="flowapi-usage-eyebrow">Model Usage Dashboard</span>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {meta ? <em>{meta}</em> : null}
    </div>
  );
}

function getStatusTone(status: ModelDetailItem["status"]) {
  if (status === "available") return "available";
  if (status === "maintenance") return "maintenance";
  if (status === "idle") return "idle";
  return "unavailable";
}

function tooltipBody(lines = []) {
  return (
    <div className="flowapi-usage-tooltip-body">
      {lines.map((line, index) => (
        <span key={`${line}-${index}`}>{line}</span>
      ))}
    </div>
  );
}

function TooltipShell({ title, lines, footer }: { title: string; lines: string[]; footer?: string }) {
  return (
    <div className="flowapi-recharts-tooltip-card">
      <strong>{title}</strong>
      {tooltipBody(lines)}
      {footer ? <small>{footer}</small> : null}
    </div>
  );
}

function ModelUsageDonut({
  items,
  loading,
}: {
  items: RequestDistributionItem[];
  loading: boolean;
}) {
  const total = items.reduce((sum, item) => sum + Number(item.requests || 0), 0);
  const hasData = total > 0;
  const chartData = useMemo(
    () => items.slice(0, 6).map((item, index) => ({
      ...item,
      name: item.displayName,
      value: Number(item.requests || 0),
      color: COLOR_SET[index % COLOR_SET.length],
    })),
    [items]
  );

  return (
    <div className="flowapi-donut-card">
      <div className="flowapi-card-title">
        <div>
          <strong>请求分布</strong>
          <p>实时统计各模型的请求占比</p>
        </div>
        <span>{hasData ? `${items.length} 个模型` : "—"}</span>
      </div>
      <div className="flowapi-donut-body">
        <div className="flowapi-donut-chart-wrap">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={62}
                  outerRadius={92}
                  paddingAngle={1.5}
                  startAngle={90}
                  endAngle={-270}
                  stroke="transparent"
                  isAnimationActive={!loading}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.modelId} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  cursor={false}
                  allowEscapeViewBox={{ x: true, y: true }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const entry = payload[0]?.payload;
                    if (!entry) return null;
                    return <TooltipShell title={entry.displayName} lines={[`${Number(entry.requests || 0).toLocaleString("zh-CN")} 次`, `${Number(entry.percentage || 0).toFixed(2)}%`]} />;
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
          <div className="flowapi-donut-empty-ring" aria-hidden="true"><span>—</span></div>
          )}
          <div className="flowapi-donut-center-copy" aria-hidden="true">
            <span>总请求量</span>
            <strong>{hasData ? formatCompact(total) : "—"}</strong>
          </div>
        </div>
        <div className="flowapi-donut-legend">
          {items.slice(0, 6).map((item, index) => (
            <div key={item.modelId} className="flowapi-donut-legend-item" title={item.displayName}>
              <i style={{ background: COLOR_SET[index % COLOR_SET.length] }} />
              <span>{item.displayName}</span>
              <b>{item.percentage.toFixed(1)}%</b>
            </div>
          ))}
          {items.length > 6 ? <div className="flowapi-donut-legend-more">其他已合并到「其他」</div> : null}
        </div>
      </div>
    </div>
  );
}

function TokenResourceBars({
  items,
  loading,
}: {
  items: TokenResourceItem[];
  loading: boolean;
}) {
  const chartData = useMemo(() => items.slice(0, 6).map((item) => ({
    ...item,
    name: item.displayName,
    input: Number(item.inputTokens || 0),
    output: Number(item.outputTokens || 0) + Number(item.imageTokens || 0),
    total: Number(item.totalTokens || 0),
  })), [items]);
  const maxTokens = Math.max(...chartData.map((item) => item.total || 0), 1);
  const chartHeight = Math.max(220, chartData.length * 54 + 40);
  const hasData = chartData.some((item) => item.total > 0);

  return (
    <div className="flowapi-token-card">
      <div className="flowapi-card-title">
        <div>
          <strong>Token 资源消耗</strong>
          <p>输入与输出 Token 的对比构成</p>
        </div>
        <span>{hasData ? `Top ${items.length}` : "—"}</span>
      </div>
      <div className="flowapi-token-chart-wrap">
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart
            data={chartData.length ? chartData : []}
            layout="vertical"
            margin={{ top: 8, right: 12, bottom: 8, left: 24 }}
            barCategoryGap={12}
          >
            <CartesianGrid horizontal={false} stroke="rgba(148,163,184,0.14)" strokeDasharray="4 6" />
            <XAxis
              type="number"
              allowDecimals={false}
              domain={[0, (dataMax) => Math.max(Number(dataMax) || 0, maxTokens || 1)]}
              tickFormatter={(value) => formatCompact(Number(value))}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={118}
              tickLine={false}
              axisLine={false}
              interval={0}
              tick={{ fill: "var(--page-sub)", fontSize: 12, fontWeight: 700 }}
              tickFormatter={(value) => {
                const text = String(value || "");
                return text.length > 16 ? `${text.slice(0, 16)}…` : text;
              }}
            />
            <Tooltip
              cursor={{ fill: "rgba(99,102,241,0.06)" }}
              allowEscapeViewBox={{ x: true, y: true }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const entry = payload[0]?.payload;
                if (!entry) return null;
                return (
                  <TooltipShell
                    title={entry.displayName}
                    lines={[
                      `输入：${formatToken(entry.input)}`,
                      `输出：${formatToken(entry.output)}`,
                      `合计：${formatToken(entry.total)}`,
                    ]}
                  />
                );
              }}
            />
            <Bar dataKey="input" stackId="tokens" fill="#6366f1" radius={[999, 0, 0, 999]} isAnimationActive={!loading} />
            <Bar dataKey="output" stackId="tokens" fill="#22d3ee" radius={[0, 999, 999, 0]} isAnimationActive={!loading} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="flowapi-token-list">
        {chartData.map((item) => (
          <div key={item.modelId} className="flowapi-token-row">
            <div className="flowapi-token-row-head">
              <ModelNameWithLogo model={item.displayName} provider={item.provider} size={22} />
              <em>{formatToken(item.total)}</em>
            </div>
            <div className="flowapi-token-track" aria-hidden="true">
              <i className="input" style={{ width: `${item.total > 0 ? (item.input / item.total) * 100 : 0}%` }} />
              <i className="output" style={{ width: `${item.total > 0 ? (item.output / item.total) * 100 : 0}%` }} />
            </div>
            <div className="flowapi-token-meta">
              <span>输入 {formatToken(item.input)}</span>
              <span>输出 {formatToken(item.output)}</span>
            </div>
          </div>
        ))}
        {!hasData && !loading ? <div className="flowapi-empty-minimal" aria-label="empty token chart">—</div> : null}
      </div>
    </div>
  );
}

function TrendChart({
  items,
  loading,
  range,
  onRangeChange,
}: {
  items: GrowthTrendItem[];
  loading: boolean;
  range: Range;
  onRangeChange: (next: Range) => void;
}) {
  const chartData = useMemo(() => items.map((item) => ({
    ...item,
    requestsValue: Number(item.requests || 0),
    tokensValue: Number(item.tokens || 0),
  })), [items]);
  const requestsMax = Math.max(...chartData.map((item) => item.requestsValue), 1);
  const tokensMax = Math.max(...chartData.map((item) => item.tokensValue), 1);
  const hasData = chartData.some((item) => item.requestsValue > 0 || item.tokensValue > 0);

  return (
    <div className="flowapi-trend-card">
      <div className="flowapi-card-title">
        <div>
          <strong>周期性增长趋势</strong>
          <p>请求量与 Token 消耗的时序演变</p>
        </div>
        <div className="flowapi-range-tabs">
          {RANGE_OPTIONS.map((item) => (
            <button key={item.key} type="button" className={range === item.key ? "active" : ""} onClick={() => onRangeChange(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flowapi-trend-chart-wrap">
        <ResponsiveContainer width="100%" height={340}>
          <LineChart data={chartData.length ? chartData : [{ label: "—", requestsValue: 0, tokensValue: 0 }]} margin={{ top: 20, right: 24, bottom: 18, left: 12 }}>
            <CartesianGrid stroke="rgba(148,163,184,0.16)" strokeDasharray="4 6" vertical={false} />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--page-subtle)", fontSize: 11, fontWeight: 700 }}
            />
            <YAxis
              yAxisId="requests"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--page-sub)", fontSize: 11, fontWeight: 700 }}
              domain={[0, (dataMax) => Math.max(Number(dataMax) || 0, requestsMax || 1)]}
              tickFormatter={(value) => formatCompact(Number(value))}
            />
            <YAxis
              yAxisId="tokens"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tick={{ fill: "var(--page-sub)", fontSize: 11, fontWeight: 700 }}
              domain={[0, (dataMax) => Math.max(Number(dataMax) || 0, tokensMax || 1)]}
              tickFormatter={(value) => formatToken(Number(value)).replace(" Token", "")}
            />
            <Tooltip
              cursor={{ stroke: "rgba(99,102,241,0.22)", strokeWidth: 1 }}
              allowEscapeViewBox={{ x: true, y: true }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const entry = payload[0]?.payload;
                if (!entry) return null;
                return (
                  <TooltipShell
                    title={String(label || entry.label)}
                    lines={[
                      `请求数：${formatCompact(entry.requestsValue)}`,
                      `Token：${formatToken(entry.tokensValue)}`,
                    ]}
                    footer={`费用：${formatCurrency(entry.costCny || 0)}`}
                  />
                );
              }}
            />
            <Line
              yAxisId="requests"
              type="monotone"
              dataKey="requestsValue"
              stroke="#6366f1"
              strokeWidth={3}
              dot={{ r: 4, strokeWidth: 2, fill: "#6366f1" }}
              activeDot={{ r: 6 }}
              isAnimationActive={!loading}
            />
            <Line
              yAxisId="tokens"
              type="monotone"
              dataKey="tokensValue"
              stroke="#22d3ee"
              strokeWidth={3}
              dot={{ r: 4, strokeWidth: 2, fill: "#22d3ee" }}
              activeDot={{ r: 6 }}
              isAnimationActive={!loading}
            />
          </LineChart>
        </ResponsiveContainer>
        {!hasData && !loading ? <div className="flowapi-trend-empty" aria-label="empty trend chart">—</div> : null}
      </div>
      <div className="flowapi-trend-legend">
        <span><i className="requests" />请求数</span>
        <span><i className="tokens" />Token 消耗</span>
      </div>
    </div>
  );
}

function ModelDetailTable({ items, loading }: { items: ModelDetailItem[]; loading: boolean }) {
  const totalRequests = Math.max(...items.map((item) => item.requests), 1);
  const totalTokens = Math.max(...items.map((item) => item.totalTokens), 1);
  const hasData = items.some((item) => Number(item.requests || 0) > 0 || Number(item.totalTokens || 0) > 0);

  return (
    <div className="flowapi-detail-card">
      <div className="flowapi-card-title">
        <div>
          <strong>模型明细看板</strong>
          <p>Detailed View</p>
        </div>
        <span>{hasData ? `${items.length} 个模型` : "—"}</span>
      </div>

      <div className="flowapi-detail-desktop">
        <table>
          <thead>
            <tr>
              <th>模型名称</th>
              <th>请求总额</th>
              <th>调用成功率</th>
              <th>Token 消耗对账</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const requestWidth = (item.requests / totalRequests) * 100;
              const inputWidth = item.totalTokens > 0 ? (item.inputTokens / item.totalTokens) * 100 : 0;
              const outputWidth = item.totalTokens > 0 ? ((item.outputTokens + item.imageTokens) / item.totalTokens) * 100 : 0;
              return (
                <tr key={item.modelId}>
                  <td>
                    <div className="flowapi-model-cell">
                      <span className={`flowapi-status-dot ${getStatusTone(item.status)}`} />
                      <ModelNameWithLogo model={item.displayName} provider={item.provider} size={24} />
                    </div>
                  </td>
                  <td>
                    <div className="flowapi-detail-metric">
                      <strong>{formatCompact(item.requests)}</strong>
                      <div className="flowapi-detail-bar"><i style={{ width: `${requestWidth}%` }} /></div>
                    </div>
                  </td>
                  <td>
                    <div className="flowapi-detail-rate">
                      <strong>{item.successRate.toFixed(0)}%</strong>
                      <div className="flowapi-detail-rate-track">
                        <i style={{ width: `${clampNumber(item.successRate / 100, 0, 1) * 100}%` }} />
                      </div>
                    </div>
                  </td>
                  <td>
                    <div className="flowapi-token-audit">
                      <div className="flowapi-token-audit-legend">
                        <span>输入 {formatToken(item.inputTokens)}</span>
                        <span>输出 {formatToken(item.outputTokens + item.imageTokens)}</span>
                        <b>合计 {formatToken(item.totalTokens)}</b>
                      </div>
                      <div className="flowapi-token-audit-bar">
                        <i className="input" style={{ width: `${inputWidth}%` }} />
                        <i className="output" style={{ width: `${outputWidth}%` }} />
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!hasData ? (
              <tr>
              <td colSpan={4} className="flowapi-detail-empty-cell">—</td>
            </tr>
          ) : null}
          </tbody>
        </table>
      </div>

      <div className="flowapi-detail-mobile">
        {items.map((item) => (
          <article key={item.modelId} className="flowapi-detail-mobile-card">
            <div className="flowapi-detail-mobile-head">
              <div className="flowapi-model-cell">
                <span className={`flowapi-status-dot ${getStatusTone(item.status)}`} />
                <ModelNameWithLogo model={item.displayName} provider={item.provider} size={24} />
              </div>
              <strong>{item.successRate.toFixed(0)}%</strong>
            </div>
            <div className="flowapi-detail-mobile-grid">
              <div><span>请求总额</span><b>{formatCompact(item.requests)}</b></div>
              <div><span>Token</span><b>{formatToken(item.totalTokens)}</b></div>
            </div>
            <div className="flowapi-token-audit-legend compact">
              <span>输入 {formatToken(item.inputTokens)}</span>
              <span>输出 {formatToken(item.outputTokens + item.imageTokens)}</span>
            </div>
            <div className="flowapi-token-audit-bar">
              <i className="input" style={{ width: `${item.totalTokens > 0 ? (item.inputTokens / item.totalTokens) * 100 : 0}%` }} />
              <i className="output" style={{ width: `${item.totalTokens > 0 ? ((item.outputTokens + item.imageTokens) / item.totalTokens) * 100 : 0}%` }} />
            </div>
          </article>
        ))}
        {!items.length ? <div className="flowapi-empty-minimal">—</div> : null}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return <div className="flowapi-skeleton" aria-hidden="true" />;
}

export default function ModelUsageVisualization({ scope = "workspace", teamId = "", title, subtitle, className = "", compact = false }: Props) {
  const [range, setRange] = useState<Range>("7d");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailMode, setDetailMode] = useState<"summary" | "requests" | "tokens" | "trend" | "models">("summary");
  const { data, loading, error, resolvedScope, resolvedTeamId } = useModelUsageData({ scope, teamId, range });
  const summary = data?.summary || { totalRequests: 0, successSessions: 0, totalTokens: 0, totalCostCny: 0 };
  const requestDistribution = data?.requestDistribution || [];
  const tokenResources = data?.tokenResources || [];
  const growthTrend = data?.growthTrend || [];
  const modelDetails = data?.modelDetails || [];
  const hasData = hasRealUsageData(data);
  const scopeLabel = resolvedScope === "team" ? "团队空间" : resolvedScope === "global" ? "全站数据" : scope === "workspace" ? "工作区" : "个人空间";
  const updatedLabel = growthTrend.length ? `${growthTrend[growthTrend.length - 1]?.label || ""} 更新` : "实时更新";
  const totalRequestsValue = Number(summary.totalRequests || 0);
  const successSessionsValue = Number(summary.successSessions || 0);
  const totalTokensValue = Number(summary.totalTokens || 0);
  const totalCostValue = Number(summary.totalCostCny || 0);
  const showSummaryNumber = hasData;

  const detailSections = useMemo(() => {
    const rows = [
      { label: "总请求量", value: hasData ? totalRequestsValue.toLocaleString("zh-CN") : "—", note: "成功 + 失败调用总数" },
      { label: "成功会话", value: hasData ? successSessionsValue.toLocaleString("zh-CN") : "—", note: "status = success / completed" },
      { label: "Token 消耗", value: hasData ? `${totalTokensValue.toLocaleString("zh-CN")} Token` : "—", note: "input + output + image" },
      { label: "费用支出", value: hasData ? formatCurrency(totalCostValue) : "—", note: "实际扣费金额" },
    ];

    if (detailMode === "requests") {
      return [
        { title: "指标概览", content: <DetailRows rows={rows} /> },
        {
          title: "请求分布",
          content: requestDistribution.length ? (
            <DetailTable
              columns={[
                { key: "displayName", label: "模型" },
                { key: "provider", label: "品牌" },
                { key: "requests", label: "请求次数" },
                { key: "percentage", label: "占比" },
              ]}
              rows={requestDistribution.map((item) => ({
                ...item,
                requests: Number(item.requests || 0).toLocaleString("zh-CN"),
                percentage: `${Number(item.percentage || 0).toFixed(1)}%`,
              }))}
            />
          ) : <DetailRows rows={[{ label: "请求分布", value: "—", note: "暂无可展示数据" }]} />,
        },
      ];
    }

    if (detailMode === "tokens") {
      return [
        { title: "指标概览", content: <DetailRows rows={rows} /> },
        {
          title: "Token 资源",
          content: tokenResources.length ? (
            <DetailTable
              columns={[
                { key: "displayName", label: "模型" },
                { key: "inputTokens", label: "输入" },
                { key: "outputTokens", label: "输出" },
                { key: "totalTokens", label: "合计" },
              ]}
              rows={tokenResources.map((item) => ({
                ...item,
                inputTokens: formatToken(item.inputTokens),
                outputTokens: formatToken(Number(item.outputTokens || 0) + Number(item.imageTokens || 0)),
                totalTokens: formatToken(item.totalTokens),
              }))}
            />
          ) : <DetailRows rows={[{ label: "Token 资源", value: "—", note: "暂无可展示数据" }]} />,
        },
      ];
    }

    if (detailMode === "trend") {
      return [
        { title: "指标概览", content: <DetailRows rows={rows} /> },
        {
          title: "周期趋势",
          content: growthTrend.length ? (
            <DetailTable
              columns={[
                { key: "label", label: "日期" },
                { key: "requests", label: "请求数" },
                { key: "tokens", label: "Token" },
                { key: "costCny", label: "费用" },
              ]}
              rows={growthTrend.map((item) => ({
                ...item,
                requests: Number(item.requests || 0).toLocaleString("zh-CN"),
                tokens: formatToken(item.tokens),
                costCny: formatCurrency(item.costCny),
              }))}
            />
          ) : <DetailRows rows={[{ label: "周期趋势", value: "—", note: "暂无可展示数据" }]} />,
        },
      ];
    }

    if (detailMode === "models") {
      return [
        { title: "指标概览", content: <DetailRows rows={rows} /> },
        {
          title: "模型明细",
          content: modelDetails.length ? (
            <DetailTable
              columns={[
                { key: "displayName", label: "模型" },
                { key: "provider", label: "品牌" },
                { key: "requests", label: "请求" },
                { key: "successRate", label: "成功率" },
                { key: "totalTokens", label: "Token" },
              ]}
              rows={modelDetails.map((item) => ({
                ...item,
                requests: Number(item.requests || 0).toLocaleString("zh-CN"),
                successRate: `${Number(item.successRate || 0).toFixed(0)}%`,
                totalTokens: formatToken(item.totalTokens),
              }))}
            />
          ) : <DetailRows rows={[{ label: "模型明细", value: "—", note: "暂无可展示数据" }]} />,
        },
      ];
    }

    return [
      {
        title: "指标概览",
        content: <DetailRows rows={rows} />,
      },
      {
        title: "模型明细",
        content: modelDetails.length ? (
          <DetailTable
            columns={[
              { key: "displayName", label: "模型" },
              { key: "provider", label: "品牌" },
              { key: "requests", label: "请求" },
              { key: "successRate", label: "成功率" },
              { key: "totalTokens", label: "Token" },
            ]}
            rows={modelDetails.map((item) => ({
              ...item,
              requests: Number(item.requests || 0).toLocaleString("zh-CN"),
              successRate: `${Number(item.successRate || 0).toFixed(0)}%`,
              totalTokens: formatToken(item.totalTokens),
            }))}
          />
        ) : <DetailRows rows={[{ label: "模型明细", value: "—", note: "暂无可展示数据" }]} />,
      },
    ];
  }, [detailMode, growthTrend, hasData, modelDetails, requestDistribution, successSessionsValue, totalCostValue, totalTokensValue, totalRequestsValue, tokenResources]);

  function openDetail(nextMode: "summary" | "requests" | "tokens" | "trend" | "models") {
    setDetailMode(nextMode);
    setDetailOpen(true);
  }

  return (
    <section className={`flowapi-model-usage-dashboard${className ? ` ${className}` : ""}${compact ? " is-compact" : ""}`}>
      <div className="flowapi-model-usage-head">
        <div>
          <span className="flowapi-model-usage-eyebrow">{scopeLabel}</span>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="flowapi-model-usage-meta">
          <span>{scopeLabel}</span>
          <strong>{resolvedTeamId ? `Team ${resolvedTeamId.slice(0, 8)}` : updatedLabel}</strong>
          {error ? <small>{error}</small> : <small>真实数据库 · 无 mock 数据</small>}
        </div>
      </div>

      <div className="flowapi-range-toolbar">
        <div className="flowapi-range-tabs">
          {RANGE_OPTIONS.map((item) => (
            <button key={item.key} type="button" className={range === item.key ? "active" : ""} onClick={() => setRange(item.key)}>
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flowapi-metric-grid">
        <MetricCard
          tone="requests"
          label="总请求量"
          value={showSummaryNumber ? totalRequestsValue : null}
          loading={loading}
          onClick={() => openDetail("requests")}
        />
        <MetricCard
          tone="success"
          label="成功会话"
          value={showSummaryNumber ? successSessionsValue : null}
          loading={loading}
          onClick={() => openDetail("summary")}
        />
        <MetricCard
          tone="tokens"
          label="Token 消耗"
          value={showSummaryNumber ? totalTokensValue : null}
          loading={loading}
          suffix=" Token"
          onClick={() => openDetail("tokens")}
        />
        <MetricCard
          tone="cost"
          label="费用支出"
          value={showSummaryNumber ? totalCostValue : null}
          loading={loading}
          prefix="￥"
          decimals={2}
          onClick={() => openDetail("trend")}
        />
      </div>

      <div className="flowapi-chart-grid">
        <ModelUsageDonut items={requestDistribution} loading={loading} />
        <TokenResourceBars items={tokenResources} loading={loading} />
      </div>

      <TrendChart items={growthTrend} loading={loading} range={range} onRangeChange={setRange} />
      <ModelDetailTable items={modelDetails} loading={loading} />

      {loading ? (
        <div className="flowapi-loading-grid" aria-hidden="true" style={{ display: "grid", gap: "10px", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      ) : null}

      <CardDetailModal
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        title={detailMode === "requests" ? "请求分布详情" : detailMode === "tokens" ? "Token 资源详情" : detailMode === "trend" ? "周期性增长详情" : detailMode === "models" ? "模型明细详情" : "模型使用总览"}
        description={detailMode === "summary" ? "当前模型使用的关键指标总览。" : "点击卡片打开的明细弹窗。"}
        badge="模型使用看板"
        updatedAt={updatedLabel}
        sections={detailSections}
        actions={<button type="button" className="flowapi-primary-action" onClick={() => setDetailOpen(false)}>关闭</button>}
      />

      <style jsx>{`
        .flowapi-model-usage-dashboard {
          position: relative;
          display: grid;
          gap: 22px;
          padding: 26px;
          border: 1px solid var(--page-card-border);
          border-radius: 24px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.55), transparent 18%),
            var(--page-card-bg);
          box-shadow: 0 18px 48px rgba(15, 23, 42, 0.06);
          overflow: hidden;
        }
        .flowapi-model-usage-dashboard.is-compact {
          padding: 22px;
          gap: 18px;
        }
        .flowapi-model-usage-dashboard::before {
          content: "";
          position: absolute;
          inset: 0 0 auto;
          height: 1px;
          background: linear-gradient(90deg, rgba(99, 102, 241, 0.24), rgba(34, 211, 238, 0.18), transparent 82%);
          pointer-events: none;
        }
        .flowapi-model-usage-head {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
        }
        .flowapi-model-usage-head h2 {
          margin: 4px 0 8px;
          font-size: clamp(22px, 2.2vw, 30px);
          line-height: 1.12;
          letter-spacing: -0.04em;
          color: var(--page-heading);
        }
        .flowapi-model-usage-head p {
          margin: 0;
          color: var(--page-sub);
          font-size: 14px;
          line-height: 1.7;
        }
        .flowapi-model-usage-eyebrow {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          color: var(--page-accent);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.18em;
          text-transform: uppercase;
        }
        .flowapi-model-usage-meta {
          min-width: 180px;
          display: grid;
          gap: 6px;
          justify-items: end;
          text-align: right;
        }
        .flowapi-model-usage-meta span {
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--page-subtle);
          font-weight: 800;
        }
        .flowapi-model-usage-meta strong {
          color: var(--page-heading);
          font-size: 14px;
          font-weight: 800;
        }
        .flowapi-model-usage-meta small {
          color: var(--page-sub);
          font-size: 12px;
        }
        .flowapi-range-toolbar,
        .flowapi-card-title {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
        }
        .flowapi-range-tabs {
          display: inline-flex;
          padding: 4px;
          border-radius: 999px;
          background: var(--page-soft-bg);
          border: 1px solid var(--page-soft-border);
          gap: 4px;
        }
        .flowapi-range-tabs button {
          border: 0;
          background: transparent;
          color: var(--page-sub);
          font-size: 12px;
          font-weight: 800;
          padding: 8px 12px;
          border-radius: 999px;
          cursor: pointer;
          transition: background .18s ease, color .18s ease, transform .18s ease;
        }
        .flowapi-range-tabs button.active {
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.16), rgba(34, 211, 238, 0.16));
          color: var(--page-heading);
          box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.18);
        }
        .flowapi-range-tabs button:hover {
          transform: translateY(-1px);
          color: var(--page-heading);
        }
        .flowapi-metric-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
        }
        .flowapi-metric-card {
          display: flex;
          align-items: center;
          gap: 16px;
          min-height: 110px;
          padding: 18px;
          border-radius: 20px;
          background: var(--page-card-bg);
          border: 1px solid var(--page-card-border);
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.04);
        }
        .flowapi-metric-card span {
          display: block;
          color: var(--page-sub);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .flowapi-metric-card strong {
          color: var(--page-heading);
          font-size: clamp(22px, 2vw, 30px);
          line-height: 1;
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.04em;
        }
        .flowapi-usage-glyph {
          width: 48px;
          height: 48px;
          border-radius: 15px;
          display: grid;
          place-items: center;
          position: relative;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.16), rgba(34, 211, 238, 0.12));
          border: 1px solid rgba(99, 102, 241, 0.18);
          flex: none;
        }
        .flowapi-usage-glyph i,
        .flowapi-usage-glyph b,
        .flowapi-usage-glyph em,
        .flowapi-usage-glyph u {
          display: block;
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          background: currentColor;
          color: var(--page-accent);
        }
        .flowapi-usage-glyph.tone-requests i {
          width: 3px;
          bottom: 12px;
          border-radius: 999px;
        }
        .flowapi-usage-glyph.tone-requests i:nth-child(1) { height: 12px; margin-left: -9px; }
        .flowapi-usage-glyph.tone-requests i:nth-child(2) { height: 20px; }
        .flowapi-usage-glyph.tone-requests i:nth-child(3) { height: 16px; margin-left: 9px; }
        .flowapi-usage-glyph.tone-success b {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 2px solid currentColor;
          background: transparent;
        }
        .flowapi-usage-glyph.tone-success b::after {
          content: "";
          position: absolute;
          width: 8px;
          height: 4px;
          border-left: 2px solid currentColor;
          border-bottom: 2px solid currentColor;
          transform: translate(-1px, -1px) rotate(-45deg);
          top: 6px;
          left: 4px;
        }
        .flowapi-usage-glyph.tone-tokens em {
          width: 18px;
          height: 18px;
          border-radius: 999px;
          border: 2px solid currentColor;
          background: transparent;
        }
        .flowapi-usage-glyph.tone-tokens em i {
          display: block;
          position: absolute;
          top: 5px;
          width: 3px;
          border-radius: 999px;
          background: currentColor;
        }
        .flowapi-usage-glyph.tone-tokens em i:nth-child(1) { height: 10px; left: 4px; transform: none; }
        .flowapi-usage-glyph.tone-tokens em i:nth-child(2) { height: 14px; left: 9px; transform: none; }
        .flowapi-usage-glyph.tone-cost u {
          width: 18px;
          height: 18px;
          border-radius: 8px;
          border: 2px solid currentColor;
          background: transparent;
        }
        .flowapi-chart-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1.32fr);
          gap: 14px;
        }
        .flowapi-donut-card,
        .flowapi-token-card,
        .flowapi-trend-card,
        .flowapi-detail-card {
          padding: 18px;
          border-radius: 18px;
          background: var(--page-card-bg);
          border: 1px solid var(--page-card-border);
          box-shadow: 0 8px 28px rgba(15, 23, 42, 0.04);
        }
        .flowapi-card-title {
          align-items: flex-start;
          margin-bottom: 14px;
        }
        .flowapi-card-title strong {
          display: block;
          color: var(--page-heading);
          font-size: 18px;
          letter-spacing: -0.03em;
        }
        .flowapi-card-title p {
          margin: 6px 0 0;
          color: var(--page-sub);
          font-size: 13px;
          line-height: 1.6;
        }
        .flowapi-card-title span {
          color: var(--page-sub);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .flowapi-donut-body {
          display: grid;
          grid-template-columns: minmax(0, 1.12fr) minmax(0, 0.88fr);
          gap: 14px;
          align-items: center;
        }
        .flowapi-donut-chart-wrap {
          position: relative;
          display: grid;
          place-items: center;
          min-height: 260px;
        }
        .flowapi-donut-empty-ring {
          width: 156px;
          height: 156px;
          border-radius: 50%;
          border: 18px solid rgba(148, 163, 184, 0.18);
          border-right-color: rgba(99, 102, 241, 0.18);
          border-top-color: rgba(34, 211, 238, 0.18);
          position: relative;
          margin: 0 auto;
        }
        .flowapi-donut-empty-ring::after {
          content: "";
          position: absolute;
          inset: 30px;
          border-radius: 50%;
          background: var(--surface-card, #fff);
        }
        .flowapi-donut-center-copy {
          position: absolute;
          inset: 50% auto auto 50%;
          transform: translate(-50%, -50%);
          display: grid;
          gap: 4px;
          justify-items: center;
          pointer-events: none;
          text-align: center;
        }
        .flowapi-donut-center-copy span {
          color: var(--page-sub);
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .flowapi-donut-center-copy strong {
          color: var(--page-heading);
          font-size: 20px;
          font-weight: 900;
          letter-spacing: -0.04em;
          font-variant-numeric: tabular-nums;
        }
        .flowapi-donut-chart {
          width: min(100%, 280px);
          height: auto;
        }
        .flowapi-donut-center-label,
        .flowapi-donut-center-value,
        .flowapi-trend-axis-label,
        .flowapi-trend-side-label {
          fill: var(--page-sub);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.06em;
          font-family: inherit;
        }
        .flowapi-donut-center-label {
          font-size: 11px;
          letter-spacing: 0.12em;
          text-transform: uppercase;
        }
        .flowapi-donut-center-value {
          fill: var(--page-heading);
          font-size: 20px;
          font-weight: 900;
          letter-spacing: -0.04em;
        }
        .flowapi-donut-legend {
          display: grid;
          gap: 10px;
        }
        .flowapi-donut-legend-item {
          display: grid;
          grid-template-columns: 12px minmax(0, 1fr) auto;
          gap: 10px;
          align-items: center;
          border: 1px solid transparent;
          background: var(--page-soft-bg);
          color: var(--page-text);
          border-radius: 12px;
          padding: 11px 12px;
          text-align: left;
          cursor: default;
        }
        .flowapi-donut-legend-item i {
          width: 12px;
          height: 12px;
          border-radius: 4px;
          display: block;
        }
        .flowapi-donut-legend-item span {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--page-heading);
          font-size: 13px;
          font-weight: 700;
        }
        .flowapi-donut-legend-item b,
        .flowapi-donut-legend-more {
          color: var(--page-sub);
          font-size: 12px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .flowapi-donut-legend-more {
          padding: 2px 6px 0;
        }
        .flowapi-token-list {
          display: grid;
          gap: 12px;
        }
        .flowapi-token-chart-wrap {
          min-height: 220px;
          border-radius: 16px;
          background: linear-gradient(180deg, rgba(99, 102, 241, 0.04), transparent);
          padding: 2px 0 4px;
          margin-bottom: 14px;
        }
        .flowapi-token-row {
          display: grid;
          gap: 10px;
          padding: 14px;
          border-radius: 14px;
          background: var(--page-soft-bg);
          border: 1px solid var(--page-soft-border);
          text-align: left;
          cursor: default;
          min-height: 94px;
        }
        .flowapi-token-row-head,
        .flowapi-token-meta {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }
        .flowapi-token-row-head em {
          color: var(--page-heading);
          font-size: 12px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .flowapi-token-track,
        .flowapi-token-audit-bar,
        .flowapi-detail-bar,
        .flowapi-detail-rate-track {
          position: relative;
          overflow: hidden;
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: rgba(148, 163, 184, 0.14);
        }
        .flowapi-token-track i,
        .flowapi-token-audit-bar i,
        .flowapi-detail-bar i,
        .flowapi-detail-rate-track i {
          display: block;
          height: 100%;
          border-radius: inherit;
        }
        .flowapi-token-track i.input,
        .flowapi-token-audit-bar i.input {
          background: linear-gradient(90deg, rgba(99, 102, 241, 0.95), rgba(99, 102, 241, 0.65));
        }
        .flowapi-token-track i.output,
        .flowapi-token-audit-bar i.output {
          background: linear-gradient(90deg, rgba(34, 211, 238, 0.92), rgba(34, 211, 238, 0.52));
        }
        .flowapi-token-meta,
        .flowapi-token-audit-legend {
          color: var(--page-sub);
          font-size: 12px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
        }
        .flowapi-token-audit-legend {
          display: grid;
          gap: 5px;
          margin-bottom: 10px;
        }
        .flowapi-token-audit-legend.compact {
          display: flex;
          justify-content: space-between;
        }
        .flowapi-trend-chart-wrap {
          position: relative;
          border-radius: 16px;
          background: linear-gradient(180deg, rgba(99, 102, 241, 0.05), transparent);
          padding: 6px 0 0;
        }
        .flowapi-trend-chart {
          width: 100%;
          height: auto;
          display: block;
        }
        .flowapi-trend-grid-line {
          stroke: rgba(148, 163, 184, 0.16);
          stroke-width: 1;
          stroke-dasharray: 3 6;
        }
        .flowapi-trend-zero-line {
          stroke: rgba(148, 163, 184, 0.22);
          stroke-width: 1.2;
          stroke-dasharray: 4 6;
        }
        .flowapi-trend-line {
          fill: none;
          stroke-width: 3.2;
          stroke-linecap: round;
          stroke-linejoin: round;
          filter: drop-shadow(0 6px 18px rgba(99, 102, 241, 0.12));
        }
        .flowapi-trend-line.requests {
          stroke: var(--flow-brand-b);
        }
        .flowapi-trend-line.tokens {
          stroke: var(--flow-brand-cyan);
        }
        .flowapi-trend-dot {
          stroke: var(--page-card-bg);
          stroke-width: 3;
        }
        .flowapi-trend-dot.requests {
          fill: var(--flow-brand-b);
        }
        .flowapi-trend-dot.tokens {
          fill: var(--flow-brand-cyan);
        }
        .flowapi-trend-axis-label {
          fill: var(--page-subtle);
          font-size: 11px;
        }
        .flowapi-trend-side-label {
          fill: var(--page-sub);
          font-size: 11px;
        }
        .flowapi-trend-legend {
          display: flex;
          gap: 18px;
          margin-top: 8px;
          color: var(--page-sub);
          font-size: 12px;
          font-weight: 700;
        }
        .flowapi-trend-legend span {
          display: inline-flex;
          gap: 8px;
          align-items: center;
        }
        .flowapi-trend-legend i {
          width: 10px;
          height: 10px;
          border-radius: 999px;
          display: block;
        }
        .flowapi-trend-legend i.requests { background: var(--flow-brand-b); }
        .flowapi-trend-legend i.tokens { background: var(--flow-brand-cyan); }
        .flowapi-detail-card table {
          width: 100%;
          border-collapse: collapse;
          table-layout: fixed;
        }
        .flowapi-detail-card th,
        .flowapi-detail-card td {
          border-bottom: 1px solid var(--page-row-divider);
          padding: 14px 10px;
          vertical-align: top;
        }
        .flowapi-detail-card th {
          text-align: left;
          color: var(--page-sub);
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .flowapi-detail-card td {
          color: var(--page-text);
          font-size: 13px;
        }
        .flowapi-model-cell {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .flowapi-status-dot {
          width: 8px;
          height: 8px;
          border-radius: 999px;
          flex: none;
          background: #94a3b8;
          box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.14);
        }
        .flowapi-status-dot.available { background: #22c55e; box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.16); }
        .flowapi-status-dot.maintenance { background: #f59e0b; box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.16); }
        .flowapi-status-dot.unavailable { background: #ef4444; box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.16); }
        .flowapi-status-dot.idle { background: #94a3b8; box-shadow: 0 0 0 4px rgba(148, 163, 184, 0.16); }
        .flowapi-detail-metric,
        .flowapi-detail-rate,
        .flowapi-token-audit {
          display: grid;
          gap: 8px;
        }
        .flowapi-detail-metric strong,
        .flowapi-detail-rate strong,
        .flowapi-token-audit b {
          color: var(--page-heading);
          font-size: 14px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .flowapi-detail-rate-track {
          height: 8px;
        }
        .flowapi-token-audit-legend {
          display: flex;
          flex-wrap: wrap;
          gap: 8px 14px;
          color: var(--page-sub);
          font-size: 12px;
          font-weight: 700;
        }
        .flowapi-token-audit-legend span,
        .flowapi-token-audit-legend b {
          font-variant-numeric: tabular-nums;
        }
        .flowapi-detail-empty-cell {
          padding: 24px 16px;
          text-align: center;
          color: var(--page-sub);
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 0.04em;
        }
        .flowapi-detail-mobile {
          display: none;
          gap: 12px;
        }
        .flowapi-detail-mobile-card {
          padding: 14px;
          border-radius: 16px;
          background: var(--page-soft-bg);
          border: 1px solid var(--page-soft-border);
          display: grid;
          gap: 12px;
        }
        .flowapi-detail-mobile-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 12px;
        }
        .flowapi-detail-mobile-head strong,
        .flowapi-detail-mobile-grid b {
          color: var(--page-heading);
          font-size: 14px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }
        .flowapi-detail-mobile-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }
        .flowapi-detail-mobile-grid span,
        .flowapi-token-audit-legend.compact span {
          color: var(--page-sub);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .flowapi-usage-tooltip-body {
          display: grid;
          gap: 4px;
        }
        .flowapi-recharts-tooltip-card {
          display: grid;
          gap: 4px;
          min-width: 180px;
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(15, 23, 42, 0.9);
          color: #f8fafc;
          border: 1px solid rgba(148, 163, 184, 0.18);
          box-shadow: 0 18px 38px rgba(15, 23, 42, 0.18);
          backdrop-filter: blur(16px);
          -webkit-backdrop-filter: blur(16px);
        }
        :global(.recharts-tooltip-wrapper) {
          outline: none;
        }
        .flowapi-usage-tooltip-body strong {
          color: inherit;
          font-size: 13px;
          font-weight: 800;
        }
        .flowapi-usage-tooltip-body span,
        .flowapi-usage-tooltip-body small {
          color: inherit;
          font-size: 12px;
          opacity: 0.86;
        }
        .flowapi-recharts-tooltip-card strong {
          color: inherit;
          font-size: 13px;
          font-weight: 800;
        }
        .flowapi-recharts-tooltip-card small {
          color: inherit;
          font-size: 12px;
          opacity: 0.82;
        }
        .flowapi-skeleton {
          height: 18px;
          border-radius: 999px;
          background: linear-gradient(90deg, rgba(148,163,184,0.12), rgba(148,163,184,0.28), rgba(148,163,184,0.12));
          background-size: 200% 100%;
          animation: flowapiShimmer 1.4s ease-in-out infinite;
        }
        .flowapi-loading-grid {
          display: none;
        }
        .flowapi-empty-minimal,
        .flowapi-trend-empty {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 44px;
          padding: 0 12px;
          border-radius: 999px;
          border: 1px dashed rgba(148, 163, 184, 0.28);
          color: var(--page-sub);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        @keyframes flowapiShimmer {
          0% { background-position: 0 0; }
          100% { background-position: 200% 0; }
        }

        @media (max-width: 1180px) {
          .flowapi-metric-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
          .flowapi-chart-grid {
            grid-template-columns: minmax(0, 1fr);
          }
        }

        @media (max-width: 760px) {
          .flowapi-model-usage-dashboard {
            padding: 16px;
            gap: 14px;
            border-radius: 18px;
          }
          .flowapi-model-usage-head {
            flex-direction: column;
          }
          .flowapi-model-usage-meta {
            justify-items: start;
            text-align: left;
          }
          .flowapi-metric-grid {
            grid-template-columns: 1fr;
          }
          .flowapi-donut-body {
            grid-template-columns: 1fr;
          }
          .flowapi-trend-legend {
            flex-wrap: wrap;
            gap: 10px 16px;
          }
          .flowapi-detail-desktop {
            display: none;
          }
          .flowapi-detail-mobile {
            display: grid;
          }
          .flowapi-loading-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .flowapi-skeleton {
            height: 56px;
          }
        }
      `}</style>
    </section>
  );
}
