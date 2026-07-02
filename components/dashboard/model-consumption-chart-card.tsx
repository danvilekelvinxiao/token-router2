import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MouseEvent, Touch } from "react";
import { createPortal } from "react-dom";
import ModelLogo from "@/components/ModelLogo";
import { getClampedTooltipPosition, getNearestChartIndex } from "@/components/charts/flowapi-chart-interaction";

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

const MODEL_COLOR_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#9333ea",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#4f46e5",
  "#db2777",
  "#059669",
];

function modelKey(model: ModelConsumptionPoint) {
  return model.modelId || model.displayName || "unknown";
}

function hashString(value?: string) {
  return String(value || "").split("").reduce((hash, char) => (((hash << 5) - hash) + char.charCodeAt(0)) >>> 0, 0);
}

function getStableColor(model: ModelConsumptionPoint) {
  return model.color || MODEL_COLOR_PALETTE[hashString(modelKey(model)) % MODEL_COLOR_PALETTE.length];
}

function formatCny(value?: number) {
  const amount = Number(value || 0);
  if (amount >= 1000) return `￥${amount.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
  if (amount >= 1) return `￥${amount.toLocaleString("zh-CN", { maximumFractionDigits: 2 })}`;
  return `￥${amount.toLocaleString("zh-CN", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
}

function formatToken(value?: number) {
  const tokens = Number(value || 0);
  if (tokens >= 100000000) return `${(tokens / 100000000).toFixed(2)} 亿`;
  if (tokens >= 10000) return `${(tokens / 10000).toFixed(1)} 万`;
  return tokens.toLocaleString("zh-CN", { maximumFractionDigits: 0 });
}

function safeNumber(value?: number) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function ConsumptionTooltip({ tooltip }: { tooltip: TooltipState }) {
  if (!tooltip || typeof document === "undefined") return null;
  const rows = [...(tooltip.day.models || [])]
    .filter((model) => safeNumber(model.costCny) > 0 || safeNumber(model.tokens) > 0 || safeNumber(model.requests) > 0)
    .sort((a, b) => safeNumber(b.costCny) - safeNumber(a.costCny));
  const totalCost = rows.reduce((sum, item) => sum + safeNumber(item.costCny), 0);
  const totalTokens = rows.reduce((sum, item) => sum + safeNumber(item.tokens), 0);
  const totalRequests = rows.reduce((sum, item) => sum + safeNumber(item.requests), 0);
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
              <i style={{ background: getStableColor(item) }} />
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
  const svgRef = useRef<SVGSVGElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingXRef = useRef<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const series = useMemo(() => Array.isArray(data?.series) ? data.series : [], [data]);
  const hasData = series.some((day) => (day.models || []).some((model) => safeNumber(model.costCny) > 0 || safeNumber(model.tokens) > 0 || safeNumber(model.requests) > 0));

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
          color: getStableColor(model),
          costCny: 0,
          tokens: 0,
          requests: 0,
        };
        current.costCny = safeNumber(current.costCny) + safeNumber(model.costCny);
        current.tokens = safeNumber(current.tokens) + safeNumber(model.tokens);
        current.requests = safeNumber(current.requests) + safeNumber(model.requests);
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
  const width = 760;
  const height = 310;
  const margin = { top: 22, right: 20, bottom: 42, left: 58 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  const totals = visibleSeries.map((day) => (day.models || []).reduce((sum, model) => sum + safeNumber(model.costCny), 0));
  const maxTotal = Math.max(...totals, 1);
  const gap = Math.max(12, Math.min(24, chartW / Math.max(visibleSeries.length, 1) * 0.18));
  const barW = Math.max(28, (chartW - gap * Math.max(visibleSeries.length - 1, 0)) / Math.max(visibleSeries.length, 1));

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const toggleModel = (key: string) => {
    setHiddenIds((current) => {
      if (current.includes(key)) return current.filter((item) => item !== key);
      if (current.length >= Math.max(0, modelTotals.length - 1)) return current;
      return [...current, key];
    });
  };

  const showDayTooltip = (index: number) => {
    const day = visibleSeries[index];
    const rect = svgRef.current?.getBoundingClientRect();
    if (!day || !rect) return;
    const x = margin.left + index * (barW + gap) + barW / 2;
    const clientX = rect.left + (x / width) * rect.width;
    const clientY = rect.top + ((margin.top + 18) / height) * rect.height;
    setTooltip({ x: clientX, y: clientY, day });
  };

  const handleMove = (event: MouseEvent<SVGRectElement> | Touch) => {
    pendingXRef.current = event.clientX;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const rect = svgRef.current?.getBoundingClientRect();
      const clientX = pendingXRef.current;
      if (!rect || clientX === null) return;
      const index = getNearestChartIndex({
        clientX,
        rect,
        count: visibleSeries.length,
        viewWidth: width,
        plotLeft: margin.left,
        plotWidth: chartW,
      });
      if (index < 0) return;
      if (activeRef.current !== index) {
        activeRef.current = index;
        setActiveIndex(index);
      }
      showDayTooltip(index);
    });
  };

  const clearHover = () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingXRef.current = null;
    activeRef.current = null;
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
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M7 17 17 7M9 7h8v8" />
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
            <svg
              ref={svgRef}
              width="100%"
              height={height}
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label="近 7 天模型消耗堆叠柱状图"
              onMouseLeave={clearHover}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                const y = margin.top + chartH - chartH * tick;
                return (
                  <g key={tick}>
                    <line x1={margin.left} x2={width - margin.right} y1={y} y2={y} className="model-consumption-grid-line" />
                    <text x={margin.left - 12} y={y + 4} textAnchor="end" className="model-consumption-axis-text">
                      {formatCny(maxTotal * tick)}
                    </text>
                  </g>
                );
              })}

              {visibleSeries.map((day, index) => {
                const x = margin.left + index * (barW + gap);
                let y = margin.top + chartH;
                const dayTotal = totals[index] || 0;
                const isActive = activeIndex === index;
                return (
                  <g
                    key={`${day.time}-${day.label}`}
                    onFocus={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect();
                      setActiveIndex(index);
                      setTooltip({ x: rect.left + rect.width / 2, y: rect.top + 18, day });
                    }}
                    onBlur={clearHover}
                    tabIndex={0}
                    aria-label={`${day.label} 总消耗 ${formatCny(dayTotal)}`}
                  >
                    {isActive ? <rect x={x - 8} y={margin.top} width={barW + 16} height={chartH} rx="14" className="model-consumption-active-band" /> : null}
                    {(day.models || []).map((model) => {
                      const value = safeNumber(model.costCny);
                      const segmentH = Math.max(value > 0 ? 3 : 0, (value / maxTotal) * chartH);
                      y -= segmentH;
                      return (
                        <rect
                          key={modelKey(model)}
                          x={x}
                          y={y}
                          width={barW}
                          height={segmentH}
                          rx={Math.min(7, segmentH / 2)}
                          fill={getStableColor(model)}
                          className="model-consumption-bar-segment"
                          opacity={activeIndex === null || isActive ? 0.96 : 0.46}
                        />
                      );
                    })}
                    <text x={x + barW / 2} y={height - 13} textAnchor="middle" className="model-consumption-axis-text">
                      {day.label}
                    </text>
                  </g>
                );
              })}
              <rect
                x={margin.left}
                y={margin.top}
                width={chartW}
                height={chartH}
                fill="transparent"
                className="model-consumption-hit-area"
                onMouseMove={handleMove}
                onTouchMove={(event) => {
                  if (event.touches?.[0]) handleMove(event.touches[0]);
                }}
                onTouchEnd={() => window.setTimeout(clearHover, 1800)}
              />
            </svg>
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
                  <i style={{ background: getStableColor(model) }} />
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
