import Link from "next/link";
import { useMemo, useState } from "react";
import type { CSSProperties, MouseEvent } from "react";
import { createPortal } from "react-dom";
import ModelLogo from "@/components/ModelLogo";
import { getClampedTooltipPosition } from "@/components/charts/flowapi-chart-interaction";

type ModelConsumptionPoint = {
  modelId?: string;
  displayName?: string;
  provider?: string;
  logo?: string | null;
  color?: string;
  costCny?: number;
  tokens?: number;
  requests?: number;
};

type ModelConsumptionSeries = {
  time: string;
  label: string;
  models: ModelConsumptionPoint[];
  total?: {
    costCny?: number;
    tokens?: number;
    requests?: number;
  };
};

type ModelConsumptionChart = {
  range?: {
    from?: string;
    to?: string;
    timezone?: string;
  };
  summary?: {
    totalCostCny?: number;
    totalTokens?: number;
    totalRequests?: number;
  };
  series?: ModelConsumptionSeries[];
};

type TooltipState = {
  x: number;
  y: number;
  day: ModelConsumptionSeries;
} | null;

type Props = {
  data?: ModelConsumptionChart | null;
};

function modelKey(model: ModelConsumptionPoint) {
  return model.modelId || model.displayName || "unknown";
}

function formatCny(value?: number) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  if (amount >= 1000) return `￥${amount.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
  if (amount >= 1) return `￥${amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  return `￥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function formatToken(value?: number) {
  const tokens = Number(value);
  if (!Number.isFinite(tokens)) return "—";
  if (tokens >= 100000000) return `${(tokens / 100000000).toFixed(2)} 亿`;
  if (tokens >= 10000) return `${(tokens / 10000).toFixed(1)} 万`;
  return tokens.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function safeNumber(value?: number) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function ConsumptionTooltip({ tooltip }: { tooltip: TooltipState }) {
  if (!tooltip || typeof document === "undefined") return null;
  const rows = [...(tooltip.day.models || [])]
    .filter((model) => safeNumber(model.costCny) > 0 || safeNumber(model.tokens) > 0 || safeNumber(model.requests) > 0)
    .sort((a, b) => safeNumber(b.costCny) - safeNumber(a.costCny));
  const totalCost = rows.reduce((sum, item) => sum + Number(safeNumber(item.costCny) || 0), 0);
  const totalTokens = rows.reduce((sum, item) => sum + Number(safeNumber(item.tokens) || 0), 0);
  const totalRequests = rows.reduce((sum, item) => sum + Number(safeNumber(item.requests) || 0), 0);
  const pos = getClampedTooltipPosition({ clientX: tooltip.x, clientY: tooltip.y, width: 320, height: 260, offsetX: 0, offsetY: 0 });

  return createPortal(
    <div
      className="model-consumption-tooltip flowapi-chart-tooltip"
      data-visible="true"
      style={{ left: 0, top: 0, "--tooltip-x": `${pos.x}px`, "--tooltip-y": `${pos.y}px` } as CSSProperties}
      role="tooltip"
    >
      <strong>{tooltip.day.label}</strong>
      <div className="model-consumption-tooltip-list">
        {rows.slice(0, 8).map((item) => (
          <div key={modelKey(item)} className="model-consumption-tooltip-row">
            <span>
              <i style={{ background: item.color || "#8b5cf6" }} />
              <em>{item.displayName || item.modelId || "未知模型"}</em>
            </span>
            <b>{formatCny(item.costCny)}</b>
            <small>{formatToken(item.tokens)} Token · {safeNumber(item.requests)} 次</small>
          </div>
        ))}
      </div>
      <div className="model-consumption-tooltip-total">
        <span>总计</span>
        <b>{formatCny(totalCost)}</b>
        <small>{formatToken(totalTokens)} Token · {totalRequests} 次</small>
      </div>
    </div>,
    document.body
  );
}

export default function ModelConsumptionChartCard({ data }: Props) {
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const series = useMemo(() => Array.isArray(data?.series) ? data.series : [], [data]);
  const hasData = series.some((day) => (day.models || []).some((model) => Number(safeNumber(model.costCny) || 0) > 0 || Number(safeNumber(model.tokens) || 0) > 0 || Number(safeNumber(model.requests) || 0) > 0));

  const modelTotals = useMemo(() => {
    const map = new Map<string, ModelConsumptionPoint>();
    series.forEach((day) => {
      (day.models || []).forEach((model) => {
        const key = modelKey(model);
        const current = map.get(key) || {
          modelId: key,
          displayName: model.displayName || key,
          provider: model.provider || "FlowAPI",
          logo: model.logo,
          color: model.color || "#8b5cf6",
          costCny: 0,
          tokens: 0,
          requests: 0,
        };
        current.costCny = Number(safeNumber(current.costCny) || 0) + Number(safeNumber(model.costCny) || 0);
        current.tokens = Number(safeNumber(current.tokens) || 0) + Number(safeNumber(model.tokens) || 0);
        current.requests = Number(safeNumber(current.requests) || 0) + Number(safeNumber(model.requests) || 0);
        map.set(key, current);
      });
    });
    return Array.from(map.values()).sort((a, b) => safeNumber(b.costCny) - safeNumber(a.costCny));
  }, [series]);

  const visibleSeries = useMemo(() => {
    const hidden = new Set(hiddenIds);
    return series.map((day) => ({
      ...day,
      models: (day.models || []).filter((model) => !hidden.has(modelKey(model))),
    }));
  }, [series, hiddenIds]);

  const summary = data?.summary || {};
  const totals = visibleSeries.map((day) => (day.models || []).reduce((sum, model) => sum + Number(safeNumber(model.costCny) || 0), 0));
  const maxTotal = Math.max(...totals, 1);

  const toggleModel = (key: string) => {
    setHiddenIds((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= Math.max(0, modelTotals.length - 1)) return current;
      return [...current, key];
    });
  };

  const showDayTooltip = (event: MouseEvent<HTMLElement>, day: ModelConsumptionSeries, index: number) => {
    setActiveIndex(index);
    setTooltip({ x: event.clientX, y: event.clientY, day });
  };

  const showDayTooltipFromElement = (element: HTMLElement, day: ModelConsumptionSeries, index: number) => {
    const rect = element.getBoundingClientRect();
    setActiveIndex(index);
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top + 18, day });
  };

  const clearHover = () => {
    setActiveIndex(null);
    setTooltip(null);
  };

  return (
    <article className="model-consumption-card">
      <header className="model-consumption-head">
        <div>
          <span>模型消耗结构</span>
          <h3>总计消耗模型</h3>
          <p>按真实调用日志汇总近 7 天各模型的金额、Token 和请求数。</p>
        </div>
        <Link href="/dashboard/logs?range=7d&groupBy=model" className="model-consumption-detail-link" aria-label="查看模型消耗明细">
          <svg viewBox="0 0 24 24" focusable="false" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 17 17 7M9 7h8v8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </Link>
      </header>

      <div className="model-consumption-summary" aria-label="模型消耗总览">
        <div>
          <span>总金额</span>
          <strong>{formatCny(summary.totalCostCny)}</strong>
        </div>
        <div>
          <span>总 Token</span>
          <strong>{formatToken(summary.totalTokens)}</strong>
        </div>
        <div>
          <span>总请求</span>
          <strong>{safeNumber(summary.totalRequests)} 次</strong>
        </div>
      </div>

      {!hasData ? (
        <div className="model-consumption-empty">
          <strong>￥0.00</strong>
          <span>0 Token</span>
        </div>
      ) : (
        <>
          <div className="model-consumption-chart-wrap">
            <div className="model-consumption-axis">
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => (
                <div key={tick} className="model-consumption-axis-row">
                  <span>{formatCny(maxTotal * tick)}</span>
                  <i />
                </div>
              ))}
            </div>
            <div className="model-consumption-columns" role="img" aria-label="近 7 天模型消耗堆叠柱状图" onMouseLeave={clearHover}>
              {visibleSeries.map((day, index) => {
                const dayTotal = totals[index] || 0;
                const isActive = activeIndex === index;
                return (
                  <button
                    key={`${day.time}-${day.label}`}
                    type="button"
                    className={`model-consumption-column${isActive ? " active" : ""}`}
                    aria-label={`${day.label} 总消耗 ${formatCny(dayTotal)}`}
                    onMouseEnter={(event) => showDayTooltip(event, day, index)}
                    onMouseMove={(event) => showDayTooltip(event, day, index)}
                    onFocus={(event) => showDayTooltipFromElement(event.currentTarget, day, index)}
                    onBlur={clearHover}
                  >
                    <div className="model-consumption-stack">
                      {(day.models || [])
                        .filter((model) => Number(safeNumber(model.costCny) || 0) > 0)
                        .map((model) => {
                          const value = Number(safeNumber(model.costCny) || 0);
                          const segmentH = Math.max(4, (value / maxTotal) * 100);
                          return (
                            <span
                              key={modelKey(model)}
                              className="model-consumption-bar-segment"
                              style={{ height: `${segmentH}%`, background: model.color || "#8b5cf6", opacity: activeIndex === null || isActive ? 0.96 : 0.46 }}
                            />
                          );
                        })}
                    </div>
                    <span className="model-consumption-column-label">{day.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="model-consumption-legend" aria-label="模型图例筛选">
            {modelTotals.slice(0, 8).map((model) => {
              const key = modelKey(model);
              const active = !hiddenIds.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  className={active ? "active" : ""}
                  aria-pressed={active}
                  onClick={() => toggleModel(key)}
                  title={active ? "点击隐藏该模型" : "点击显示该模型"}
                >
                  <i style={{ background: model.color || "#8b5cf6" }} />
                  <ModelLogo model={model.displayName || model.modelId} provider={model.provider} size={20} />
                  <span>{model.displayName || model.modelId}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      <ConsumptionTooltip tooltip={tooltip} />
    </article>
  );
}
