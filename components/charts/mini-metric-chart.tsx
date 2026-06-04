import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode, Touch } from "react";

export type MiniMetricChartPoint = {
  label: string;
  value: number | null;
  secondaryValue?: number | null;
  meta?: Record<string, any>;
};

type MiniMetricChartProps = {
  data: MiniMetricChartPoint[];
  type?: "line" | "step" | "bar" | "area" | "sparkline";
  color?: "purple" | "cyan" | "green" | "yellow" | "orange" | "red";
  valueFormatter?: (value: number) => string;
  secondaryFormatter?: (value: number) => string;
  tooltipRenderer?: (point: MiniMetricChartPoint) => ReactNode;
  height?: number;
  emptyText?: string;
  showGlowPoint?: boolean;
  showTooltip?: boolean;
};

const COLORS = {
  purple: "#8b5cf6",
  cyan: "#22d3ee",
  green: "#22c55e",
  yellow: "#facc15",
  orange: "#f97316",
  red: "#ef4444",
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatDefault(value: number) {
  return Number(value || 0).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export default function MiniMetricChart({
  data,
  type = "line",
  color = "purple",
  valueFormatter = formatDefault,
  secondaryFormatter,
  tooltipRenderer,
  height = 72,
  emptyText = "数据同步中",
  showGlowPoint = true,
  showTooltip = true,
}: MiniMetricChartProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingClientXRef = useRef<number | null>(null);
  const activeRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const width = 260;
  const pad = { top: 8, right: 10, bottom: 12, left: 10 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const tone = COLORS[color] || COLORS.purple;
  const points = useMemo(() => data.filter((item) => item.value !== null && item.value !== undefined), [data]);
  const hasData = points.length > 0;
  const values = points.map((item) => Number(item.value || 0));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const range = Math.max(1, max - min);
  const getX = (index: number) => points.length <= 1 ? pad.left + plotW / 2 : pad.left + (index / (points.length - 1)) * plotW;
  const getY = (value: number) => points.length <= 1 ? pad.top + plotH * 0.52 : pad.top + plotH - ((value - min) / range) * plotH;
  const coords = points.map((point, index) => ({ ...point, x: getX(index), y: getY(Number(point.value || 0)) }));
  const singlePointPath = coords.length === 1
    ? `M ${(coords[0].x - 44).toFixed(2)} ${coords[0].y.toFixed(2)} L ${(coords[0].x + 44).toFixed(2)} ${coords[0].y.toFixed(2)}`
    : "";
  const linePath = coords.length === 1 ? singlePointPath : coords.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const stepPath = coords.map((point, index) => {
    if (index === 0) return `M ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    const prev = coords[index - 1];
    const midX = (prev.x + point.x) / 2;
    return `L ${midX.toFixed(2)} ${prev.y.toFixed(2)} L ${midX.toFixed(2)} ${point.y.toFixed(2)} L ${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
  }).join(" ");
  const path = type === "step" ? stepPath : linePath;
  const areaPath = coords.length ? `${path} L ${coords[coords.length - 1].x.toFixed(2)} ${(pad.top + plotH).toFixed(2)} L ${coords[0].x.toFixed(2)} ${(pad.top + plotH).toFixed(2)} Z` : "";
  const active = activeIndex !== null ? coords[activeIndex] : null;

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    };
  }, []);

  const handleMove = (event: MouseEvent<HTMLDivElement> | Touch) => {
    if (!hasData || !showTooltip) return;
    pendingClientXRef.current = event.clientX;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      const rect = wrapRef.current?.getBoundingClientRect();
      const clientX = pendingClientXRef.current;
      if (!rect || clientX === null) return;
      const viewX = ((clientX - rect.left) / Math.max(1, rect.width)) * width;
      const ratio = clamp((viewX - pad.left) / Math.max(1, plotW), 0, 1);
      const nearest = clamp(Math.round(ratio * (points.length - 1)), 0, points.length - 1);
      if (activeRef.current !== nearest) {
        activeRef.current = nearest;
        setActiveIndex(nearest);
      }
    });
  };

  const clearActive = () => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingClientXRef.current = null;
    activeRef.current = null;
    setActiveIndex(null);
  };

  if (!hasData) {
    return (
      <div className="mini-metric-chart empty" style={{ height }}>
        <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <path className="mini-metric-placeholder" d={`M ${pad.left} ${height * 0.62} C ${width * 0.28} ${height * 0.45}, ${width * 0.52} ${height * 0.78}, ${width - pad.right} ${height * 0.55}`} />
        </svg>
        {emptyText ? <span>{emptyText}</span> : null}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`mini-metric-chart tone-${color}`}
      style={{ height }}
      onMouseMove={handleMove}
      onMouseLeave={clearActive}
      onTouchMove={(event) => {
        if (event.touches?.[0]) handleMove(event.touches[0]);
      }}
      onTouchEnd={() => window.setTimeout(clearActive, 1600)}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id={`mini-area-${color}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={tone} stopOpacity="0.24" />
            <stop offset="100%" stopColor={tone} stopOpacity="0" />
          </linearGradient>
        </defs>
        {type === "bar" ? (
          coords.map((point, index) => {
            const barW = Math.max(5, plotW / Math.max(coords.length, 1) * 0.46);
            const y = getY(Number(point.value || 0));
            return <rect key={`${point.label}-${index}`} x={point.x - barW / 2} y={y} width={barW} height={pad.top + plotH - y} rx="3" fill={tone} opacity={activeIndex === index ? 0.95 : 0.58} />;
          })
        ) : (
          <>
            {(type === "area" || type === "line" || type === "step") && areaPath ? <path d={areaPath} fill={`url(#mini-area-${color})`} /> : null}
            <path d={path} fill="none" stroke={tone} strokeWidth="2.35" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {coords.length === 1 ? <circle cx={coords[0].x} cy={coords[0].y} r="4" fill={tone} opacity="0.95" /> : null}
          </>
        )}
        {active ? (
          <>
            <line x1={active.x} x2={active.x} y1={pad.top} y2={pad.top + plotH} className="mini-metric-guide" />
            {showGlowPoint ? <circle cx={active.x} cy={active.y} r="8" fill={tone} opacity="0.18" /> : null}
            <circle cx={active.x} cy={active.y} r="4" fill={tone} stroke="var(--dash-card-bg, #0f172a)" strokeWidth="2" />
          </>
        ) : null}
      </svg>
      {active && showTooltip ? (
        <div className="mini-metric-tooltip" style={{ left: `${clamp((active.x / width) * 100, 18, 82)}%` }}>
          {tooltipRenderer ? (
            tooltipRenderer(active)
          ) : (
            <>
              <strong>{active.label}</strong>
              <span>{valueFormatter(Number(active.value || 0))}</span>
              {active.secondaryValue !== null && active.secondaryValue !== undefined && secondaryFormatter ? <small>{secondaryFormatter(Number(active.secondaryValue || 0))}</small> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
