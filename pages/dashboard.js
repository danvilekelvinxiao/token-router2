import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import FlowApiBrandText from "@/components/brand/flowapi-brand-text";
import MiniMetricChart from "@/components/charts/mini-metric-chart";
import ConsoleLayout from "@/components/ConsoleLayout";
import { calculateCallCost, formatSmallCny } from "@/lib/billing/calculate-call-cost";
import ModelLogo, { ModelNameWithLogo, getModelProviderLabel } from "@/components/ModelLogo";
import InteractiveCard from "@/components/InteractiveCard";
import CardDetailModal, { DetailRows, DetailTable } from "@/components/CardDetailModal";
import ExportExcelButton from "@/components/ExportExcelButton";
import ModelLeaderboard from "@/components/dashboard/model-leaderboard";
import ModelConsumptionChartCard from "@/components/dashboard/model-consumption-chart-card";
import TokenMarketPanel from "@/components/dashboard/token-market-panel";
import ActivityHeatmapCard from "@/components/dashboard/activity-heatmap-card";
import SavingsCard from "@/components/analytics/savings-card";
import SavingsDetailDrawer from "@/components/analytics/savings-detail-drawer";
import WalletProgressCard from "@/components/wallet/wallet-progress-card";
import { getClampedTooltipPosition, getNearestChartIndex } from "@/components/charts/flowapi-chart-interaction";
import { generateTokenForecast } from "@/lib/analytics/token-forecast";
import { useLocale } from "@/components/providers/locale-provider";
import { useSafePolling } from "@/hooks/useSafePolling";

/* ===================================================================
   REFERENCE DATA
   =================================================================== */


const MODEL_FLOW_COLORS = {
  deepseek: "#3b82f6",
  claude: "#8b5cf6",
  gpt: "#22c55e",
  gemini: "#f59e0b",
  qwen: "#f97316",
  others: "#94a3b8",
};

const DASHBOARD_API_CREDIT_RATE = 5;
const DASHBOARD_MODEL_COLORS = [
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

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const subscribeClientSnapshot = (callback) => {
  if (typeof window === "undefined") return () => {};
  const id = window.setTimeout(callback, 0);
  return () => window.clearTimeout(id);
};

const subscribeClientClock = (callback) => {
  if (typeof window === "undefined") return () => {};
  const timeoutId = window.setTimeout(callback, 0);
  const intervalId = window.setInterval(callback, 60 * 1000);
  return () => {
    window.clearTimeout(timeoutId);
    window.clearInterval(intervalId);
  };
};

function getClientLocalDemoMode() {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search || "");
  return params.get("demo") === "1" || window.localStorage.getItem("flowapi_demo_mode") === "true";
}

function getClientDayPeriod() {
  const h = new Date().getHours();
  if (h < 6) return "晚上";
  if (h < 12) return "上午";
  if (h < 18) return "下午";
  return "晚上";
}

function generateMonthCalendar(calls, year, month) {
  const byDate = new Map();
  calls.forEach((call) => {
    const rawDate = call.createdAt ? new Date(call.createdAt) : null;
    if (!rawDate || Number.isNaN(rawDate.getTime())) return;
    const date = rawDate.toISOString().slice(0, 10);
    const current = byDate.get(date) || { requests: 0, tokens: 0, spend: 0 };
    current.requests += 1;
    current.tokens += Number(call.tokens || 0);
    current.spend += Number(call.cost || 0);
    byDate.set(date, current);
  });

  const maxTokens = Math.max(...Array.from(byDate.values()).map((item) => item.tokens), 0);

  // Build calendar grid: 6 rows x 7 columns (Mon-Sun)
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();
  // getDay: 0=Sun, 1=Mon... adjust so Mon=0
  const startDow = firstDay.getDay();
  const startCol = startDow === 0 ? 6 : startDow - 1; // Mon=0

  const weeks = [];
  let dayNum = 1;
  for (let row = 0; row < 6; row++) {
    const week = [];
    for (let col = 0; col < 7; col++) {
      if ((row === 0 && col < startCol) || dayNum > daysInMonth) {
        week.push(null);
      } else {
        const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
        const day = byDate.get(dateStr) || { requests: 0, tokens: 0, spend: 0 };
        const level = day.tokens > 0 && maxTokens > 0 ? Math.max(1, Math.ceil((day.tokens / maxTokens) * 4)) : 0;
        week.push({
          date: dateStr,
          day: dayNum,
          level,
          requests: day.requests,
          tokens: day.tokens,
          spend: Number(day.spend.toFixed(4)),
        });
        dayNum++;
      }
    }
    weeks.push(week);
    if (dayNum > daysInMonth) break;
  }

  return { weeks, label: `${year}年${month + 1}月`, maxTokens };
}

/* ===================================================================
   THEME HOOK
   =================================================================== */

/* ===================================================================
   TOOLTIP SYSTEM
   =================================================================== */

const TOOLTIP_COLORS = {
  dark: {
    bg: "rgba(22,22,30,0.96)",
    border: "#333540",
    text: "#e5e5e7",
    sub: "#9ca3af",
  },
  light: {
    bg: "rgba(255,255,255,0.97)",
    border: "#e5e7eb",
    text: "#111827",
    sub: "#6b7280",
  },
};

function DashboardTooltip({ tooltip, theme }) {
  if (!tooltip) return null;
  const c = TOOLTIP_COLORS[theme] || TOOLTIP_COLORS.dark;
  return (
    <div
      className="dash3-tooltip flowapi-chart-tooltip"
      data-visible="true"
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        "--tooltip-x": `${tooltip.x || 0}px`,
        "--tooltip-y": `${tooltip.y || 0}px`,
        background: c.bg,
        border: `1px solid ${c.border}`,
        color: c.text,
        borderRadius: 10,
        padding: "16px 18px",
        fontSize: 14,
        lineHeight: 1.85,
        zIndex: 9999,
        pointerEvents: "none",
        minWidth: 220,
        maxWidth: 360,
        maxHeight: 360,
        overflowY: "auto",
        boxShadow: theme === "dark"
          ? "0 8px 32px rgba(0,0,0,0.6)"
          : "0 8px 32px rgba(0,0,0,0.12)",
      }}
    >
      {tooltip.content}
    </div>
  );
}

/* ===================================================================
   INTERACTIVE SVG CHARTS
   =================================================================== */

function StackedDailyBars({ daily, models, dailyDates, height = 140, barWidth = 18, gap = 8, onTooltip, theme }) {
  const maxTotal = Math.max(...daily, 1);
  const days = ["一", "二", "三", "四", "五", "六", "日"];
  const chartRef = useRef(null);

  const handleMouseMove = (e, di) => {
    const rect = chartRef.current?.getBoundingClientRect();
    if (!rect) return;
    const total = daily[di];
    const date = dailyDates?.[di] || days[di];
    const modelLines = models.map((m) => {
      const val = total * (m.percent / 100);
      return `${m.name.padEnd(18)} ${val.toFixed(total < 1 ? 3 : 0)}`;
    }).join("\n");
    onTooltip({
      x: e.clientX + 14,
      y: e.clientY + 18,
      content: (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: theme === "light" ? "#111827" : "#e5e5e7" }}>{date}</div>
          <div style={{ fontFamily: "SF Mono, monospace", fontSize: 12, whiteSpace: "pre", lineHeight: 1.7, color: theme === "light" ? "#4b5563" : "#9ca3af" }}>
            {modelLines}
          </div>
          <div style={{ borderTop: `1px solid ${theme === "light" ? "#e5e7eb" : "#333540"}`, marginTop: 8, paddingTop: 8, fontWeight: 700, fontSize: 13 }}>
            Total {total < 1 ? total.toFixed(3) : total.toLocaleString()}
          </div>
        </div>
      ),
    });
  };

  const vbW = daily.length * (barWidth + gap);
  return (
    <svg ref={chartRef} width="100%" height={height} viewBox={`0 0 ${vbW} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ display: "block" }}>
      {daily.map((total, di) => {
        let yAccum = height - 18;
        const x = di * (barWidth + gap);
        return (
          <g key={di} style={{ cursor: "crosshair" }}
            onMouseMove={(e) => handleMouseMove(e, di)}
            onMouseLeave={() => onTooltip(null)}
          >
            {models.map((m, mi) => {
              const segH = Math.max(3, (total * (m.percent / 100)) / maxTotal * (height - 30));
              const y = yAccum - segH;
              yAccum = y;
              return <rect key={mi} x={x} y={y} width={barWidth} height={segH} rx="2.5" fill={m.color} opacity="0.92" />;
            })}
            <rect x={x - 3} y={0} width={barWidth + 6} height={height - 18} fill="transparent" />
          <text x={x + barWidth / 2} y={height - 4} textAnchor="middle" fill="var(--dash-sub)" fontSize="14" fontWeight="700" fontFamily="inherit">{days[di]}</text>
          </g>
        );
      })}
    </svg>
  );
}

function safeChartNumber(value) {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
}

function DualLineChart({ data, unit = "K", height = 320, width = 720, onTooltip, theme }) {
  const chartInput = useMemo(() => ({
    pastDates: Array.isArray(data?.pastDates) ? data.pastDates : [],
    futureDates: Array.isArray(data?.futureDates) ? data.futureDates : [],
    pastValues: Array.isArray(data?.pastValues) ? data.pastValues.map(safeChartNumber) : [],
    futureValues: Array.isArray(data?.futureValues) ? data.futureValues.map(safeChartNumber) : [],
    pastCosts: Array.isArray(data?.pastCosts) ? data.pastCosts.map(safeChartNumber) : [],
    futureCosts: Array.isArray(data?.futureCosts) ? data.futureCosts.map(safeChartNumber) : [],
  }), [data]);
  const { pastDates, futureDates, pastValues, futureValues, pastCosts, futureCosts } = chartInput;
  const primaryModel = data?.primaryModel || "DeepSeek V4 Flash";
  const allDates = useMemo(() => [...pastDates, ...futureDates], [pastDates, futureDates]);
  const allValues = useMemo(() => [...pastValues, ...futureValues], [pastValues, futureValues]);
  const maxV = Math.max(...allValues, 1);
  const minV = Math.min(...allValues, 0);
  const range = maxV - minV || 1;
  const totalPoints = allValues.length;
  const margin = { top: 28, right: 28, bottom: 44, left: 62 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  const stepX = chartW / Math.max(1, totalPoints - 1);
  const baseline = margin.top + chartH;

  const toX = (i) => margin.left + i * stepX;
  const toY = (v) => margin.top + chartH - ((v - minV) / range) * chartH;

  const pastPts = pastValues.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const futurePts = futureValues.map((v, i) => `${toX(i + pastValues.length)},${toY(v)}`).join(" ");

  // Gradient fill area under past line
  const pastArea = pastValues.length ? `${toX(0)},${baseline} ${pastValues.map((v, i) => `${toX(i)},${toY(v)}`).join(" ")} ${toX(pastValues.length - 1)},${baseline} Z` : "";
  const futureArea = futureValues.length ? `${toX(pastValues.length)},${baseline} ${futureValues.map((v, i) => `${toX(i + pastValues.length)},${toY(v)}`).join(" ")} ${toX(totalPoints - 1)},${baseline} Z` : "";

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const val = minV + (range / (yTicks - 1)) * i;
    return { y: toY(val), label: unit === "$" ? `$${val.toFixed(1)}` : unit === "K" ? `${val.toFixed(1)}K` : `${Math.round(val)}` };
  });

  const [activeIndex, setActiveIndex] = useState(null);
  const [activeX, setActiveX] = useState(null);
  const svgRef = useRef(null);
  const formatChartValue = useCallback((value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "暂无实际数据";
    if (unit === "$") return `$${Number(value).toFixed(2)}`;
    if (unit === "K") return `${Number(value).toFixed(2)}K Token`;
    return `${Number(value).toLocaleString()} 次`;
  }, [unit]);

  const getCostText = useCallback((idx, fallbackValue) => {
    const rawCost = idx < pastValues.length ? pastCosts[idx] : futureCosts[idx - pastValues.length];
    if (rawCost !== undefined && rawCost !== null && !Number.isNaN(Number(rawCost))) {
      return `$${Number(rawCost).toFixed(2)}`;
    }
    if (unit === "$") return `$${Number(fallbackValue || 0).toFixed(2)}`;
    if (unit === "K") return `$${(Number(fallbackValue || 0) * 0.002).toFixed(2)}`;
    return "$0.00";
  }, [futureCosts, pastCosts, pastValues.length, unit]);

  const showTooltipForIndex = useCallback((e, idx) => {
    if (idx < 0 || idx >= totalPoints) return;
    const date = allDates[idx];
    const isPast = idx < pastValues.length;
    const actualVal = isPast ? pastValues[idx] : null;
    const predictedVal = !isPast ? futureValues[idx - pastValues.length] ?? null : null;
    const focusValue = predictedVal ?? actualVal ?? 0;
    const tooltipPos = getClampedTooltipPosition({ clientX: e.clientX, clientY: e.clientY, width: 280, height: 180, offsetY: -90 });
    onTooltip({
      x: tooltipPos.x,
      y: tooltipPos.y,
      content: (
        <div style={{ minWidth: 230 }}>
          <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: theme === "light" ? "#111827" : "#e5e5e7" }}>{date}</div>
          <div style={{ display: "grid", gap: 7, color: theme === "light" ? "#6b7280" : "#9ca3af" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", flex: "none" }} />
              <span>实际使用</span>
              <span style={{ marginLeft: "auto", fontWeight: 700, fontFamily: "SF Mono, monospace", color: theme === "light" ? "#111827" : "#e5e5e7" }}>{formatChartValue(actualVal)}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", flex: "none" }} />
              <span>预测趋势</span>
              <span style={{ marginLeft: "auto", fontWeight: 700, fontFamily: "SF Mono, monospace", color: theme === "light" ? "#111827" : "#e5e5e7" }}>{predictedVal === null ? "暂无预测数据" : formatChartValue(predictedVal)}</span>
            </div>
          </div>
          <div style={{ borderTop: `1px solid ${theme === "light" ? "#e5e7eb" : "#333540"}`, marginTop: 8, paddingTop: 8, color: theme === "light" ? "#6b7280" : "#9ca3af" }}>
            预计花费：<span style={{ fontWeight: 700, color: theme === "light" ? "#111827" : "#e5e5e7" }}>{getCostText(idx, focusValue)}</span>
            <div style={{ marginTop: 6 }}>
              主要模型：<span style={{ fontWeight: 700, color: theme === "light" ? "#111827" : "#e5e5e7" }}>{primaryModel}</span>
            </div>
          </div>
        </div>
      ),
    });
  }, [allDates, formatChartValue, futureValues, getCostText, onTooltip, pastValues, primaryModel, theme, totalPoints]);

  const findNearestIndex = useCallback((clientX) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return -1;
    const viewX = ((clientX - rect.left) / rect.width) * width;
    const ratio = Math.min(1, Math.max(0, (viewX - margin.left) / Math.max(1, chartW)));
    return Math.min(totalPoints - 1, Math.max(0, Math.round(ratio * (totalPoints - 1))));
  }, [chartW, margin.left, totalPoints, width]);

  const handleChartMouseMove = useCallback((e) => {
    const idx = findNearestIndex(e.clientX);
    if (idx >= 0) {
      setActiveIndex((current) => current === idx ? current : idx);
      showTooltipForIndex(e, idx);
    }
  }, [findNearestIndex, showTooltipForIndex]);

  const handleChartMouseLeave = useCallback(() => {
    setActiveIndex(null);
    setActiveX(null);
    onTooltip(null);
  }, [onTooltip]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches?.length) {
      const idx = findNearestIndex(e.touches[0].clientX);
      if (idx >= 0) {
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect?.width) {
          const viewX = ((e.touches[0].clientX - rect.left) / rect.width) * width;
          setActiveX(Math.min(margin.left + chartW, Math.max(margin.left, viewX)));
        }
        setActiveIndex((current) => current === idx ? current : idx);
        showTooltipForIndex(e.touches[0], idx);
      }
    }
  }, [chartW, findNearestIndex, margin.left, showTooltipForIndex, width]);

  const handleTouchEnd = useCallback(() => {
    setTimeout(() => { setActiveIndex(null); setActiveX(null); onTooltip(null); }, 2000);
  }, [onTooltip]);

  const handleOverlayMove = useCallback((e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const idx = Math.min(totalPoints - 1, Math.max(0, Math.round(ratio * (totalPoints - 1))));
    setActiveX(margin.left + ratio * chartW);
    setActiveIndex((current) => current === idx ? current : idx);
    showTooltipForIndex(e, idx);
  }, [chartW, margin.left, showTooltipForIndex, totalPoints]);

  const refLineColor = theme === "light" ? "rgba(17,24,39,0.22)" : "rgba(255,255,255,0.22)";
  const gridColor = theme === "light" ? "rgba(17,24,39,0.06)" : "rgba(255,255,255,0.06)";
  const bgGradientId = "forecast-bg-grad";
  const futureGradientId = "forecast-future-grad";

  return (
    <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", cursor: "crosshair", borderRadius: "12px" }}>
      <defs>
        <linearGradient id={bgGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.13" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.01" />
        </linearGradient>
        <linearGradient id={futureGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Grid lines */}
      {yLabels.map((t, i) => (
        <g key={`yg-${i}`}>
          <line x1={margin.left} y1={t.y} x2={width - margin.right} y2={t.y} stroke={gridColor} strokeWidth="1" />
          <text x={margin.left - 10} y={t.y + 4} textAnchor="end" fill="var(--dash-sub)" fontSize="11" fontFamily="inherit" fontWeight="600">{t.label}</text>
        </g>
      ))}

      {/* Past area fill */}
      <path d={pastArea} fill={`url(#${bgGradientId})`} />

      {/* Future area fill */}
      <path d={futureArea} fill={`url(#${futureGradientId})`} />

      {/* Active highlight band */}
      {activeIndex !== null && (
        <rect
          x={(activeX ?? toX(activeIndex)) - stepX / 2}
          y={margin.top}
          width={stepX}
          height={chartH}
          fill={theme === "light" ? "rgba(99,102,241,0.06)" : "rgba(99,102,241,0.1)"}
          rx="4"
        />
      )}

      {/* Past line (gold) */}
      <polyline points={pastPts} fill="none" stroke="#f59e0b" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      {pastValues.map((v, i) => {
        const isActive = activeIndex === i;
        return (
          <circle
            key={`pa-${i}`} cx={toX(i)} cy={toY(v)}
            r={isActive ? 7 : 3.5}
            fill={isActive ? "#f59e0b" : "#f59e0b"}
            stroke={isActive ? "#fff" : "var(--dash-bg)"}
            strokeWidth={isActive ? 3 : 2}
            style={{ transition: "r 0.15s ease, stroke-width 0.15s ease", cursor: "pointer" }}
          />
        );
      })}

      {/* Future line (blue dashed) */}
      <polyline points={futurePts} fill="none" stroke="#3b82f6" strokeWidth="2.6" strokeDasharray="6,5" strokeLinecap="round" strokeLinejoin="round" />
      {futureValues.map((v, i) => {
        const idx = i + pastValues.length;
        const isActive = activeIndex === idx;
        return (
          <circle
            key={`fu-${i}`} cx={toX(idx)} cy={toY(v)}
            r={isActive ? 7 : 3.5}
            fill={isActive ? "#3b82f6" : "#3b82f6"}
            stroke={isActive ? "#fff" : "var(--dash-bg)"}
            strokeWidth={isActive ? 3 : 2}
            style={{ transition: "r 0.15s ease, stroke-width 0.15s ease", cursor: "pointer" }}
          />
        );
      })}

      {/* Vertical reference line on hover */}
      {activeIndex !== null && (
        <line
          x1={activeX ?? toX(activeIndex)} y1={margin.top}
          x2={activeX ?? toX(activeIndex)} y2={margin.top + chartH}
          stroke={refLineColor} strokeWidth="1.5" strokeDasharray="5,3"
          pointerEvents="none"
        />
      )}

      {/* Now divider */}
      {pastValues.length > 0 && futureValues.length > 0 && (
        <>
          <line x1={toX(pastValues.length - 0.5)} y1={margin.top} x2={toX(pastValues.length - 0.5)} y2={margin.top + chartH} stroke="var(--dash-border)" strokeWidth="1.2" strokeDasharray="3,3" />
          <text x={toX(pastValues.length - 0.5)} y={margin.top - 10} textAnchor="middle" fill="var(--dash-sub)" fontSize="10" fontFamily="inherit" fontWeight="700">现在</text>
        </>
      )}

      {/* X axis labels */}
      {allDates.map((d, i) => {
        const isActive = activeIndex === i;
        return (
          <text
            key={`xl-${i}`} x={toX(i)} y={height - 10}
            textAnchor="middle"
            fill={isActive ? "var(--dash-accent)" : "var(--dash-sub)"}
            fontSize={isActive ? 12 : 10}
            fontWeight={isActive ? 800 : 500}
            fontFamily="inherit"
          >{d}</text>
        );
      })}

      {/* Transparent overlay for interaction */}
      <rect
        x={margin.left} y={margin.top}
        width={chartW} height={chartH}
        fill="transparent"
        onMouseMove={handleOverlayMove}
        onMouseLeave={handleChartMouseLeave}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ cursor: "crosshair" }}
      />
    </svg>
  );
}

function BarChart7Day({ data, valueKey, color = "#818cf8", height = 130, barW = 22, onTooltip, theme }) {
  const maxV = Math.max(...data.map((d) => d[valueKey]), 1);
  const gap = 10;
  const totalW = data.length * (barW + gap);
  const chartRef = useRef(null);

  return (
    <svg ref={chartRef} width={totalW} height={height} style={{ display: "block" }}>
      {data.map((d, i) => {
        const barH = Math.max(4, (d[valueKey] / maxV) * (height - 28));
        const x = i * (barW + gap);
        const y = height - barH - 18;
        return (
          <g key={i} style={{ cursor: "crosshair" }}
            onMouseMove={(e) => {
              onTooltip({
                x: e.clientX + 14,
                y: e.clientY - 10,
                content: (
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: theme === "light" ? "#111827" : "#e5e5e7" }}>{d.date || d.label}</div>
                    <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af", fontSize: 11 }}>提示词: <b>{d.prompts}</b></div>
                    <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af", fontSize: 11 }}>Token: <b>{d.tokens}K</b></div>
                    <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af", fontSize: 11 }}>消耗: <b>${d.spend}</b></div>
                  </div>
                ),
              });
            }}
            onMouseLeave={() => onTooltip(null)}
          >
            <rect x={x} y={y} width={barW} height={barH} rx="3" fill={color} opacity="0.8" />
            <rect x={x - 2} y={y - 4} width={barW + 4} height={barH + 22} fill="transparent" />
            <text x={x + barW / 2} y={height - 6} textAnchor="middle" fill="var(--dash-sub)" fontSize="12" fontFamily="inherit">{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function MonthCalendar({ calendar, onTooltip, theme }) {
  if (!calendar) return null;
  const { weeks } = calendar;
  if (!weeks || !weeks.length) return null;

  const colors = ["#1e293b", "#1e3a5f", "#1e4a3f", "#25632d", "#388a34"];
  const lightColors = ["#e5e7eb", "#dbeafe", "#d1fae5", "#86efac", "#22c55e"];
  const cs = theme === "light" ? lightColors : colors;

  const size = 28;
  const gap = 4;
  const cols = 7;
  const rows = weeks.length;
  const svgW = cols * (size + gap) - gap;
  const svgH = rows * (size + gap) - gap;

  const dayHeaders = ["一", "二", "三", "四", "五", "六", "日"];

  return (
    <svg width="100%" height={svgH + 24} viewBox={`0 0 ${svgW} ${svgH + 24}`} style={{ display: "block" }}>
      {/* Day headers */}
      {dayHeaders.map((label, ci) => (
        <text
          key={`h-${ci}`}
          x={ci * (size + gap) + size / 2}
          y={svgH + 18}
          textAnchor="middle"
          fill="var(--dash-sub)"
          fontSize="11"
          fontWeight="600"
          fontFamily="inherit"
        >
          {label}
        </text>
      ))}
      {weeks.map((week, ri) =>
        week.map((day, ci) => {
          if (!day) return <rect key={`e-${ri}-${ci}`} x={ci * (size + gap)} y={ri * (size + gap)} width={size} height={size} rx="4" fill="transparent" />;
          const isToday = day.date === new Date().toISOString().slice(0, 10);
          return (
            <rect
              key={day.date}
              x={ci * (size + gap)}
              y={ri * (size + gap)}
              width={size}
              height={size}
              rx="4"
              fill={cs[day.level]}
              opacity={day.level === 0 ? 0.2 : 0.85}
              stroke={isToday ? (theme === "light" ? "#6366f1" : "#818cf8") : "none"}
              strokeWidth={isToday ? 1.5 : 0}
              style={{ cursor: day.level > 0 ? "pointer" : "default", transition: "stroke 0.15s" }}
              onMouseMove={(e) => {
                if (day.level > 0) {
                  onTooltip({
                    x: e.clientX + 14,
                    y: e.clientY - 10,
                    content: (
                      <div>
                        <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 13, color: theme === "light" ? "#111827" : "#e5e5e7" }}>{day.date}</div>
                        <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af", fontSize: 12 }}>请求数：<b>{day.requests}</b></div>
                        <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af", fontSize: 12 }}>Token：<b>{day.tokens.toLocaleString()}</b></div>
                        <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af", fontSize: 12 }}>花费：<b>${Number(day.spend || 0).toFixed(2)}</b></div>
                      </div>
                    ),
                  });
                }
              }}
              onMouseLeave={() => onTooltip(null)}
            />
          );
        })
      )}
    </svg>
  );
}

function TopModelStackedBars({ data: { dates, models }, height = 260, onTooltip, theme }) {
  const barW = 34;
  const gap = 18;
  const margin = { top: 18, right: 24, bottom: 38, left: 0 };
  const chartW = dates.length * (barW + gap);
  const totalW = chartW + margin.left + margin.right;
  const chartH = height - margin.top - margin.bottom;

  const dailyTotals = dates.map((_, di) => models.reduce((s, m) => s + m.daily[di], 0));
  const maxTotal = Math.max(...dailyTotals, 1);

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${totalW} ${height}`} style={{ display: "block" }}>
      {/* Y axis */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const yv = maxTotal * (1 - frac);
        const y = margin.top + chartH * frac;
        return (
          <g key={`y-${frac}`}>
            <line x1={margin.left} y1={y} x2={totalW - margin.right} y2={y} stroke="var(--dash-border)" strokeWidth="1" />
            <text x={totalW - margin.right + 6} y={y + 4} fill="var(--dash-sub)" fontSize="11" fontFamily="inherit">{yv.toFixed(1)}T</text>
          </g>
        );
      })}

      {dates.map((date, di) => {
        let yAccum = margin.top + chartH;
        const x = margin.left + di * (barW + gap);
        const total = dailyTotals[di];
        return (
          <g key={di} style={{ cursor: "crosshair" }}
            onMouseMove={(e) => {
              const sortedModels = [...models].sort((a, b) => b.daily[di] - a.daily[di]);
              onTooltip({
                x: e.clientX + 14,
                y: e.clientY - 10,
                content: (
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 8, color: theme === "light" ? "#111827" : "#e5e5e7" }}>{date}</div>
                    <div className="dash3-model-tooltip-list">
                      {sortedModels.map((m) => (
                        <div key={m.name}>
                          <span><ModelLogo model={m.name} size={22} />{m.name}</span>
                          <b>{m.daily[di].toFixed(2)}T</b>
                        </div>
                      ))}
                    </div>
                    <div style={{ borderTop: `1px solid ${theme === "light" ? "#e5e7eb" : "#333540"}`, marginTop: 8, paddingTop: 8, fontWeight: 700, fontSize: 13 }}>
                      Total {total.toFixed(2)}T
                    </div>
                  </div>
                ),
              });
            }}
            onMouseLeave={() => onTooltip(null)}
          >
            {models.map((m, mi) => {
              const segH = Math.max(2, (m.daily[di] / maxTotal) * chartH);
              const y = yAccum - segH;
              yAccum = y;
              return <rect key={mi} x={x} y={y} width={barW} height={segH} fill={m.color} opacity="0.88" />;
            })}
            <rect x={x - 2} y={margin.top} width={barW + 4} height={chartH} fill="transparent" />
            <text x={x + barW / 2} y={height - 10} textAnchor="middle" fill="var(--dash-sub)" fontSize="11" fontFamily="inherit">{date}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Sparkline({ data, color = "#6366f1", height = 20, width = 50 }) {
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 2) - 1;
    return `${x},${y}`;
  }).join(" ");
  return (
    <svg width={width} height={height} style={{ display: "inline-block", verticalAlign: "middle" }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ===================================================================
   HELPER COMPONENTS
   =================================================================== */

function FlashValue({ value, tick }) {
  const ref = useRef(value);
  const [flash, setFlash] = useState(false);
  useEffect(() => {
    if (ref.current !== value) {
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 600);
      ref.current = value;
      return () => clearTimeout(t);
    }
  }, [value, tick]);
  return (
    <span style={{ transition: "color 0.3s ease", color: flash ? "var(--dash-flash)" : undefined }}>
      {value}
    </span>
  );
}

function TrendIcon({ direction }) {
  if (direction === "up") return <span style={{ color: "var(--dash-green)" }}>↑</span>;
  if (direction === "down") return <span style={{ color: "var(--dash-red)" }}>↓</span>;
  return <span style={{ color: "var(--dash-sub)" }}>→</span>;
}

function MiniTrendLine({ values, color = "var(--dash-accent)", width = 96, height = 34, onTooltip, tooltipLabel, theme }) {
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 6) - 3;
    return `${x},${y}`;
  }).join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="dash3-mini-line"
      onMouseMove={(event) => {
        onTooltip?.({
          x: event.clientX + 14,
          y: event.clientY - 10,
          content: (
            <div>
              <strong>{tooltipLabel}</strong>
              <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af", marginTop: 4 }}>
                最近 7 天区间：${min.toFixed(3)} - ${max.toFixed(3)}
              </div>
            </div>
          ),
        });
      }}
      onMouseLeave={() => onTooltip?.(null)}
    >
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatCompactToken(value) {
  if (value >= 1000000) return `${(value / 1000000).toFixed(value >= 10000000 ? 1 : 2)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 100000 ? 0 : 1)}K`;
  return `${value}`;
}

function formatTokens(value) {
  return `${formatCompactToken(Number(value || 0))} Tokens`;
}

function formatCurrency(value) {
  return `$ API ${Number(value || 0).toFixed(2)}`;
}

function moneyFormatter(value) {
  return `$ API ${Number(value || 0).toFixed(2)}`;
}

function tokenFormatter(value) {
  return `${formatCompactToken(Number(value || 0))} Tokens`;
}

function countFormatter(value) {
  return `${Number(value || 0).toLocaleString("zh-CN")} 次`;
}

function keyCountFormatter(value) {
  return `${Number(value || 0).toLocaleString("zh-CN")} 个`;
}

function formatLatency(value) {
  return `${Number(value || 0).toLocaleString("zh-CN")} ms`;
}

function percentFormatter(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

const LOGIN_REWARD_TIERS = [
  { days: 7, reward: 10 },
  { days: 15, reward: 15 },
  { days: 20, reward: 20 },
  { days: 30, reward: 50 },
];

const LOGIN_REWARD_RECURRING = {
  startDays: 30,
  intervalDays: 10,
  reward: 10,
};

function buildCompanionMilestones(days, nextTierDays) {
  const unlockedDays = Number(days || 0);
  const milestones = LOGIN_REWARD_TIERS.map((tier) => ({
    key: `tier-${tier.days}`,
    label: `${tier.days}天 $${tier.reward}`,
    unlocked: unlockedDays >= tier.days,
    next: nextTierDays === tier.days,
    recurring: false,
    subLabel: "",
  }));

  milestones.push({
    key: "tier-recurring",
    label: nextTierDays > LOGIN_REWARD_RECURRING.startDays
      ? `${nextTierDays}天 $${LOGIN_REWARD_RECURRING.reward}`
      : `每10天 $${LOGIN_REWARD_RECURRING.reward}`,
    unlocked: false,
    next: nextTierDays > LOGIN_REWARD_RECURRING.startDays,
    recurring: true,
    subLabel: nextTierDays > LOGIN_REWARD_RECURRING.startDays ? "循环奖励" : "30天后",
  });

  return milestones;
}

function buildCompanionReward(createdAt) {
  const joinedAt = createdAt ? new Date(createdAt) : null;
  if (!joinedAt || Number.isNaN(joinedAt.getTime())) {
    return {
      days: null,
      nextTier: LOGIN_REWARD_TIERS[0],
      previousTier: null,
      progress: 0,
      glowPosition: 2,
      remainingDays: LOGIN_REWARD_TIERS[0].days,
      milestones: buildCompanionMilestones(0, LOGIN_REWARD_TIERS[0].days),
    };
  }

  const today = new Date();
  const start = new Date(joinedAt);
  start.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);

  const days = Math.max(1, Math.floor((today.getTime() - start.getTime()) / 86400000) + 1);
  const nextTier = LOGIN_REWARD_TIERS.find((tier) => days < tier.days) || {
    days:
      LOGIN_REWARD_RECURRING.startDays
      + (Math.floor(Math.max(0, days - LOGIN_REWARD_RECURRING.startDays) / LOGIN_REWARD_RECURRING.intervalDays) + 1)
        * LOGIN_REWARD_RECURRING.intervalDays,
    reward: LOGIN_REWARD_RECURRING.reward,
    recurring: true,
  };

  let previousTier = [...LOGIN_REWARD_TIERS].reverse().find((tier) => days >= tier.days) || { days: 0, reward: 0 };
  if (days > LOGIN_REWARD_RECURRING.startDays) {
    const completedRecurring = Math.floor((days - LOGIN_REWARD_RECURRING.startDays) / LOGIN_REWARD_RECURRING.intervalDays);
    if (completedRecurring > 0) {
      previousTier = {
        days: LOGIN_REWARD_RECURRING.startDays + completedRecurring * LOGIN_REWARD_RECURRING.intervalDays,
        reward: LOGIN_REWARD_RECURRING.reward,
        recurring: true,
      };
    }
  }

  const previousDays = previousTier?.days || 0;
  const span = Math.max(1, nextTier.days - previousDays);
  const progress = Math.min(100, Math.max(0, ((days - previousDays) / span) * 100));
  const remainingDays = Math.max(0, nextTier.days - days);

  return {
    days,
    nextTier,
    previousTier,
    progress,
    glowPosition: progress <= 0 ? 2 : progress >= 100 ? 98 : progress,
    remainingDays,
    milestones: buildCompanionMilestones(days, nextTier.days),
  };
}

function buildDashboardHonorTitles({ isBlackGoldMember, totalUsedTokens, savedAmountCny, callCount, baseBalance }) {
  const titles = [];

  if (isBlackGoldMember) {
    titles.push({
      name: "黑金算力玩家",
      desc: "FlowAPI 黑金会员专属身份",
      tone: "black-gold",
    });
  }

  if (Number(totalUsedTokens || 0) >= 100000) {
    titles.push({
      name: "Token 资产玩家",
      desc: `累计使用 ${formatCompactToken(totalUsedTokens)} Token`,
      tone: "purple",
    });
  } else if (Number(totalUsedTokens || 0) > 0) {
    titles.push({
      name: "Token 探索者",
      desc: `已使用 ${formatCompactToken(totalUsedTokens)} Token`,
      tone: "cyan",
    });
  }

  if (Number(savedAmountCny || 0) > 0) {
    titles.push({
      name: "成本优化师",
      desc: `已节省 $${Number(savedAmountCny || 0).toFixed(2)}`,
      tone: "green",
    });
  }

  if (Number(callCount || 0) >= 100) {
    titles.push({
      name: "高频调用者",
      desc: `累计 ${callCount} 次调用`,
      tone: "cyan",
    });
  } else if (Number(callCount || 0) > 0) {
    titles.push({
      name: "API 实战者",
      desc: `完成 ${callCount} 次调用`,
      tone: "purple",
    });
  }

  if (!titles.length && Number(baseBalance || 0) > 0) {
    titles.push({
      name: "待启航用户",
      desc: "创建 API Key 后解锁更多称号",
      tone: "purple",
    });
  }

  if (!titles.length) {
    titles.push({
      name: "API 起步者",
      desc: "完成首次调用后解锁称号",
      tone: "muted",
    });
  }

  return titles.slice(0, 4);
}

function buildLocalDemoCalls() {
  const models = [
    { model: "gpt-4o-mini", provider: "OpenAI", inputPricePerM: 1.2, outputPricePerM: 4.8, baseTokens: 8200 },
    { model: "deepseek-chat", provider: "DeepSeek", inputPricePerM: 0.8, outputPricePerM: 2.4, baseTokens: 12600 },
    { model: "claude-3-5-sonnet", provider: "Anthropic", inputPricePerM: 18, outputPricePerM: 90, baseTokens: 5200 },
    { model: "gemini-1.5-pro", provider: "Google", inputPricePerM: 8, outputPricePerM: 24, baseTokens: 6800 },
    { model: "qwen-max", provider: "Qwen", inputPricePerM: 6, outputPricePerM: 18, baseTokens: 7400 },
  ];
  const now = new Date();
  return Array.from({ length: 36 }, (_, index) => {
    const model = models[index % models.length];
    const createdAt = new Date(now);
    createdAt.setDate(now.getDate() - Math.floor(index / 5));
    createdAt.setHours(Math.max(9, 22 - (index % 7) * 2), (index * 13) % 60, 0, 0);
    const promptTokens = Math.round(model.baseTokens * (0.46 + (index % 4) * 0.05));
    const completionTokens = Math.round(model.baseTokens * (0.28 + (index % 3) * 0.06));
    const tokens = promptTokens + completionTokens;
    const officialCost = ((promptTokens / 1000000) * model.inputPricePerM) + ((completionTokens / 1000000) * model.outputPricePerM);
    const cost = Number((officialCost * 0.42).toFixed(4));
    return {
      id: `demo-call-${index + 1}`,
      requestId: `demo-req-${String(index + 1).padStart(4, "0")}`,
      apiKeyId: index % 3 === 0 ? "demo_key_backup" : "demo_key_primary",
      requestedModel: model.model,
      routedModel: model.model,
      provider: model.provider,
      createdAt: createdAt.toISOString(),
      status: 200,
      promptTokens,
      completionTokens,
      tokens,
      cost,
      originalCostCny: Number(officialCost.toFixed(4)),
      savedCostCny: Number(Math.max(0, officialCost - cost).toFixed(4)),
      discountRate: 0.42,
      inputPricePerM: Number((model.inputPricePerM * 0.42).toFixed(4)),
      outputPricePerM: Number((model.outputPricePerM * 0.42).toFixed(4)),
      latencyMs: 720 + (index % 9) * 135,
      endpoint: "/v1/chat/completions",
      channelName: "FlowAPI 智能路由",
      channelType: "relay",
      upstreamHost: "flowapi.local-demo",
      finishReason: "stop",
    };
  }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

function buildLocalDemoCustomer(base = {}) {
  const calls = buildLocalDemoCalls();
  const totalSpend = calls.reduce((sum, call) => sum + Number(call.cost || 0), 0);
  const createdAt = new Date();
  createdAt.setDate(createdAt.getDate() - 18);
  return {
    ...base,
    id: base.id || "local_demo_customer",
    name: base.name || "FlowAPI 用户",
    email: base.email || "local-demo@flowapi.fun",
    balance: 58.8,
    paidBalance: 56.8,
    temporaryBalance: 2,
    availableBalance: 58.8,
    totalSpend: Number(totalSpend.toFixed(2)),
    createdAt: createdAt.toISOString(),
    apiKeys: [
      { id: "demo_key_primary", label: "生产调用 Key", token: "sk-local-demo-primary", createdAt: createdAt.toISOString(), lastUsedAt: calls[0]?.createdAt || null },
      { id: "demo_key_backup", label: "测试环境 Key", token: "sk-local-demo-backup", createdAt: createdAt.toISOString(), lastUsedAt: calls[2]?.createdAt || null },
    ],
    calls,
  };
}

function buildLocalDemoSavings(calls = []) {
  const callSavings = calls.map((call) => {
    const official = Number(call.originalCostCny || 0);
    const actual = Number(call.cost || 0);
    const saved = Math.max(0, official - actual);
    return {
      id: call.id,
      createdAt: call.createdAt,
      model: getCallModel(call),
      provider: call.provider || "FlowAPI",
      officialCostCny: official,
      actualCostCny: actual,
      savedAmountCny: Number(saved.toFixed(4)),
      savedPercent: official > 0 ? Number(((saved / official) * 100).toFixed(1)) : 0,
      officialInputPricePerM: call.inputPricePerM ? Number((call.inputPricePerM / 0.42).toFixed(4)) : null,
      officialOutputPricePerM: call.outputPricePerM ? Number((call.outputPricePerM / 0.42).toFixed(4)) : null,
      flowapiInputPricePerM: call.inputPricePerM,
      flowapiOutputPricePerM: call.outputPricePerM,
    };
  });
  const savedAmountCny = callSavings.reduce((sum, item) => sum + Number(item.savedAmountCny || 0), 0);
  return {
    source: "local-demo",
    summary: {
      savedAmountCny: Number(savedAmountCny.toFixed(2)),
      officialCostCny: Number(callSavings.reduce((sum, item) => sum + Number(item.officialCostCny || 0), 0).toFixed(2)),
      actualCostCny: Number(callSavings.reduce((sum, item) => sum + Number(item.actualCostCny || 0), 0).toFixed(2)),
      savedPercent: 58,
    },
    modelSavings: [],
    callSavings,
  };
}

function savingsPeriodText(period) {
  if (period === "7d") return "近 7 天估算";
  if (period === "month") return "本月估算";
  if (period === "all") return "累计估算";
  return "近 30 天估算";
}

function formatFlowMetric(value, metric) {
  if (metric === "spend") return `$${value.toFixed(2)}`;
  if (metric === "tokens") return `${formatCompactToken(value)} Token`;
  return `${value} 次`;
}

function trendText(trend) {
  if (trend > 0) return `↑${trend}%`;
  if (trend < 0) return `↓${Math.abs(trend)}%`;
  return "0%";
}

function trendClass(trend) {
  if (trend > 0) return "dash3-trend-up";
  if (trend < 0) return "dash3-trend-down";
  return "dash3-trend-flat";
}

function startOfDay(date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function formatCallTime(value) {
  if (!value) return "刚刚";
  const then = new Date(value);
  const diff = Date.now() - then.getTime();
  if (!Number.isFinite(diff)) return "刚刚";
  const minutes = Math.max(0, Math.floor(diff / 60000));
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return then.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

function getCallModel(call) {
  return call.routedModel || call.requestedModel || "Unknown Model";
}

function getCallStatus(call) {
  const status = Number(call.status || 0);
  if (status >= 200 && status < 300) return { label: "成功", key: "success" };
  if ([408, 504, 524].includes(status)) return { label: "超时", key: "timeout" };
  return { label: "失败", key: "failed" };
}

function getModelColor(model, index = 0) {
  const normalized = String(model || "").toLowerCase();
  if (normalized.includes("deepseek")) return MODEL_FLOW_COLORS.deepseek;
  if (normalized.includes("claude")) return MODEL_FLOW_COLORS.claude;
  if (normalized.includes("gpt")) return MODEL_FLOW_COLORS.gpt;
  if (normalized.includes("gemini")) return MODEL_FLOW_COLORS.gemini;
  if (normalized.includes("qwen")) return MODEL_FLOW_COLORS.qwen;
  const fallbackIndex = Array.from(normalized).reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return DASHBOARD_MODEL_COLORS[(fallbackIndex + index) % DASHBOARD_MODEL_COLORS.length];
}

function isSameDay(a, b) {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

function buildDashboardUsage(customer) {
  const calls = Array.isArray(customer?.calls) ? customer.calls : [];
  const now = new Date();
  const todayCalls = calls.filter((call) => isSameDay(new Date(call.createdAt), now));
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weekCalls = calls.filter((call) => new Date(call.createdAt) >= weekStart);
  const sum = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
  const totalTokens = sum(calls, "tokens");
  const totalCost = sum(calls, "cost");
  const avgCostPerToken = totalCost > 0 && totalTokens > 0 ? totalCost / totalTokens : 0;
  const balance = Number(customer?.balance || 0);
  const paidBalance = Number(customer?.paidBalance ?? balance ?? 0);
  const giftBalance = Number(customer?.temporaryBalance || 0);
  const lastCall = calls[0] || null;
  const todayCost = sum(todayCalls, "cost");
  const weekCost = sum(weekCalls, "cost");
  const weekTokens = sum(weekCalls, "tokens");
  const activeDays = new Set(weekCalls.map((call) => new Date(call.createdAt).toISOString().slice(0, 10))).size;
  const averageDailyCost = weekCost > 0 && activeDays > 0 ? weekCost / activeDays : todayCost;

  return {
    hasCalls: calls.length > 0,
    calls,
    overview: {
      balance,
      paidBalance,
      giftBalance,
      callableTokens: avgCostPerToken > 0 ? Math.floor(balance / avgCostPerToken) : 0,
      todaySpend: todayCost,
      todayTokens: sum(todayCalls, "tokens"),
      weekSpend: weekCost,
      weekTokens,
      lastCall: lastCall ? {
        model: getCallModel(lastCall),
        tokens: Number(lastCall.tokens || 0),
        amount: Number(lastCall.cost || 0),
        time: formatCallTime(lastCall.createdAt),
        status: getCallStatus(lastCall).label,
      } : null,
    },
    prediction: {
      weekTokens,
      weekCost: Number(weekCost.toFixed(2)),
      coverDays: averageDailyCost > 0 ? Math.max(1, Math.floor(balance / averageDailyCost)) : 0,
      suggestRecharge: averageDailyCost > 0 ? Math.max(50, Math.ceil((averageDailyCost * 30) / 10) * 10) : 0,
    },
  };
}

function formatCny(value) {
  return `$ API ${Number(value || 0).toFixed(2)}`;
}

function formatApiCredit(value) {
  const amount = Number(value || 0);
  const digits = amount === 0 ? 2 : Math.abs(amount) < 1 ? 4 : 2;
  return `$ API ${amount.toLocaleString("zh-CN", { minimumFractionDigits: digits, maximumFractionDigits: Math.min(6, Math.max(digits, 2)) })}`;
}

function toApiCredit(value) {
  return Number(value || 0) * DASHBOARD_API_CREDIT_RATE;
}

function buildModelSpendData(calls) {
  const dates = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return date;
  });
  const modelOrder = [];
  const dayBuckets = dates.map((date) => {
    const bucket = {};
    calls
      .filter((call) => isSameDay(new Date(call.createdAt), date))
      .forEach((call) => {
        const model = getCallModel(call);
        if (!bucket[model]) {
          if (!modelOrder.includes(model)) modelOrder.push(model);
          bucket[model] = {
            model,
            provider: call.provider || "FlowAPI",
            spend: 0,
            tokens: 0,
            requests: 0,
            color: getModelColor(model, modelOrder.length),
          };
        }
        bucket[model].spend += Number(call.cost || 0);
        bucket[model].tokens += Number(call.tokens || 0);
        bucket[model].requests += 1;
      });
    return {
      date: date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }).replace(/\//g, "/"),
      models: Object.values(bucket),
    };
  });

  const totals = {};
  calls.forEach((call) => {
    const model = getCallModel(call);
    if (!totals[model]) {
      totals[model] = {
        model,
        provider: call.provider || "FlowAPI",
        spend: 0,
        tokens: 0,
        requests: 0,
        color: getModelColor(model, Object.keys(totals).length),
        spark: dates.map(() => 0),
      };
    }
    const dayIndex = dates.findIndex((date) => isSameDay(new Date(call.createdAt), date));
    totals[model].spend += Number(call.cost || 0);
    totals[model].tokens += Number(call.tokens || 0);
    totals[model].requests += 1;
    if (dayIndex >= 0) totals[model].spark[dayIndex] += Number(call.cost || 0);
  });

  const totalSpend = Object.values(totals).reduce((sum, item) => sum + item.spend, 0);
  const ranking = Object.values(totals)
    .sort((a, b) => b.spend - a.spend)
    .map((item) => {
      const previous = item.spark.slice(0, 4).reduce((sum, value) => sum + value, 0);
      const recent = item.spark.slice(4).reduce((sum, value) => sum + value, 0);
      const trend = previous > 0 ? Math.round(((recent - previous) / previous) * 100) : recent > 0 ? 100 : 0;
      return {
        ...item,
        spend: Number(item.spend.toFixed(4)),
        share: totalSpend > 0 ? Math.round((item.spend / totalSpend) * 100) : 0,
        trend,
      };
    });

  return { flow: dayBuckets, ranking };
}

function buildRecentCallRows(calls, apiKeys = []) {
  return calls.slice(0, 50).map((call) => {
    const status = getCallStatus(call);
    const key = apiKeys.find((item) => item.id === call.apiKeyId);
    const latencySeconds = getCallLatencySeconds(call);
    const input = Number(call.promptTokens || 0);
    const output = Number(call.completionTokens || 0);
    const total = Number(call.tokens || 0);
    const amount = Number(call.cost || 0);

    // Pricing data from call metadata or defaults
    const inputPricePerM = Number(call.inputPricePerM || call.inputPrice || 0);
    const outputPricePerM = Number(call.outputPricePerM || call.outputPrice || 0);
    const discountRate = Number(call.discountRate || call.discount || 1);
    const originalInputPM = inputPricePerM / Math.max(discountRate, 0.01);
    const originalOutputPM = outputPricePerM / Math.max(discountRate, 0.01);

    // Calculate original cost
    const originalCost = Number(call.originalCost || call.originalCostCny || 0);
    const savedCost = Math.max(0, Number(call.savedCost || call.savedCostCny || (originalCost > 0 ? originalCost - amount : 0)));
    const savedPercent = originalCost > 0 ? (savedCost / originalCost) * 100 : 0;

    return {
      id: call.id || `${call.createdAt}-${getCallModel(call)}`,
      requestId: call.requestId || call.id || "",
      createdAt: call.createdAt,
      time: call.createdAt ? new Date(call.createdAt).toLocaleString("zh-CN", { hour12: false }) : "-",
      model: getCallModel(call),
      provider: call.provider || "FlowAPI",
      apiKey: key?.label || "API Key",
      type: "consume",
      source: call.endpoint || "/v1/chat/completions",
      input,
      output,
      total,
      amount,
      originalCostCny: originalCost || amount,
      actualCostCny: amount,
      savedCostCny: savedCost,
      savedPercent: Number(savedPercent.toFixed(1)),
      status: status.label,
      statusKey: status.key,
      latency: latencySeconds > 0 ? `${latencySeconds.toFixed(1)}s` : "-",
      latencySeconds: latencySeconds || 0,
      error: status.key === "success" ? "" : "模型服务返回异常，请检查余额、模型名或稍后重试。",
      // Channel / pricing info
      channelName: call.channelName || call.channel || "官方",
      channelType: call.channelType || "official",
      upstreamHost: call.upstreamHost || call.host || "flowapi.fun",
      finishReason: call.finishReason || "stop",
      requestIp: call.requestIp || call.ip || "",
      inputPricePerM: inputPricePerM || null,
      outputPricePerM: outputPricePerM || null,
      originalInputPricePerM: Number(originalInputPM.toFixed(4)) || null,
      originalOutputPricePerM: Number(originalOutputPM.toFixed(4)) || null,
      discountRate: discountRate,
      finalInputPricePerM: inputPricePerM || null,
      finalOutputPricePerM: outputPricePerM || null,
      deductionBreakdown: Array.isArray(call.deductionBreakdown) ? call.deductionBreakdown : [],
      deductionSource: call.deductionSource || "",
    };
  });
}

function startOfMonth(date) {
  const next = new Date(date);
  next.setDate(1);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getCallLatencySeconds(call) {
  const ms = Number(call.latencyMs || call.durationMs || call.responseMs || 0);
  if (ms > 0) return ms / 1000;
  return 0;
}

function buildDashboardStats(customer, calls) {
  const now = new Date();
  const todayCalls = calls.filter((call) => isSameDay(new Date(call.createdAt), now));
  const monthStart = startOfMonth(now);
  const monthCalls = calls.filter((call) => new Date(call.createdAt) >= monthStart);
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 6);
  weekStart.setHours(0, 0, 0, 0);
  const weekCalls = calls.filter((call) => new Date(call.createdAt) >= weekStart);
  const sum = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
  const successful = calls.filter((call) => getCallStatus(call).key === "success").length;
  const failed = calls.filter((call) => getCallStatus(call).key === "failed").length;
  const streamCalls = calls.filter((call) => Boolean(call.isStream || call.stream)).length;
  const nonStreamCalls = Math.max(0, calls.length - streamCalls);
  const cacheHits = calls.filter((call) => call.cacheHit || call.cached).length;
  const cachedCalls = calls.filter((call) => call.cacheHit || call.cached);
  const savedTokens = cachedCalls.reduce((total, call) => total + Number(call.savedTokens || Math.round(Number(call.tokens || 0) * 0.35)), 0);
  const savedCostCny = cachedCalls.reduce((total, call) => total + Number(call.savedCostCny || (Number(call.cost || 0) * 0.35)), 0);
  const callsWithLatency = calls.map(getCallLatencySeconds).filter((value) => value > 0);
  const avgLatency = callsWithLatency.length
    ? callsWithLatency.reduce((total, value) => total + value, 0) / callsWithLatency.length
    : 0;

  return {
    apiKeyCount: Array.isArray(customer?.apiKeys) ? customer.apiKeys.length : 0,
    activeApiKeyCount: Array.isArray(customer?.apiKeys) ? customer.apiKeys.filter((key) => !key.disabledAt).length : 0,
    balance: Number(customer?.balance || 0),
    totalCost: sum(calls, "cost"),
    todayCost: sum(todayCalls, "cost"),
    todayTokens: sum(todayCalls, "tokens"),
    todayInputTokens: sum(todayCalls, "promptTokens"),
    todayOutputTokens: sum(todayCalls, "completionTokens"),
    todayCacheReadTokens: sum(todayCalls, "cacheReadTokens"),
    todayCacheWriteTokens: sum(todayCalls, "cacheWriteTokens"),
    monthCost: sum(monthCalls, "cost"),
    monthTokens: sum(monthCalls, "tokens"),
    monthInputTokens: sum(monthCalls, "promptTokens"),
    monthOutputTokens: sum(monthCalls, "completionTokens"),
    monthCacheReadTokens: sum(monthCalls, "cacheReadTokens"),
    monthCacheWriteTokens: sum(monthCalls, "cacheWriteTokens"),
    weekCost: sum(weekCalls, "cost"),
    weekTokens: sum(weekCalls, "tokens"),
    weekInputTokens: sum(weekCalls, "promptTokens"),
    weekOutputTokens: sum(weekCalls, "completionTokens"),
    weekCacheReadTokens: sum(weekCalls, "cacheReadTokens"),
    weekCacheWriteTokens: sum(weekCalls, "cacheWriteTokens"),
    todayRequests: todayCalls.length,
    todaySuccessRequests: todayCalls.filter((call) => getCallStatus(call).key === "success").length,
    todayFailedRequests: todayCalls.filter((call) => getCallStatus(call).key === "failed").length,
    todayStreamRequests: todayCalls.filter((call) => Boolean(call.isStream || call.stream)).length,
    todayNonStreamRequests: todayCalls.filter((call) => !Boolean(call.isStream || call.stream)).length,
    monthRequests: monthCalls.length,
    monthSuccessRequests: monthCalls.filter((call) => getCallStatus(call).key === "success").length,
    monthFailedRequests: monthCalls.filter((call) => getCallStatus(call).key === "failed").length,
    monthStreamRequests: monthCalls.filter((call) => Boolean(call.isStream || call.stream)).length,
    monthNonStreamRequests: monthCalls.filter((call) => !Boolean(call.isStream || call.stream)).length,
    weekRequests: weekCalls.length,
    weekSuccessRequests: weekCalls.filter((call) => getCallStatus(call).key === "success").length,
    weekFailedRequests: weekCalls.filter((call) => getCallStatus(call).key === "failed").length,
    weekStreamRequests: weekCalls.filter((call) => Boolean(call.isStream || call.stream)).length,
    weekNonStreamRequests: weekCalls.filter((call) => !Boolean(call.isStream || call.stream)).length,
    avgLatency,
    cacheHitRate: calls.length ? (cacheHits / calls.length) * 100 : 0,
    cacheStats: {
      hitRate: calls.length ? (cacheHits / calls.length) * 100 : 0,
      hitCount: cacheHits,
      savedTokens,
      savedCostCny,
      avgLatencyImprovement: cacheHits ? 32 : 0,
    },
    successRate: calls.length ? (successful / calls.length) * 100 : 0,
    failedRate: calls.length ? (failed / calls.length) * 100 : 0,
    streamRate: calls.length ? (streamCalls / calls.length) * 100 : 0,
    nonStreamRate: calls.length ? (nonStreamCalls / calls.length) * 100 : 0,
    totalSavedApiCredit: toApiCredit(savedCostCny),
    currentApiCreditBalance: toApiCredit(Number(customer?.balance || 0)),
  };
}

function buildTrendData(calls, days = 7) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - ((days - 1) - index));
    const dayCalls = calls.filter((call) => isSameDay(new Date(call.createdAt), date));
    const success = dayCalls.filter((call) => getCallStatus(call).key === "success").length;
    return {
      date: date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }).replace(/\//g, "-"),
      inputTokens: dayCalls.reduce((sum, call) => sum + Number(call.promptTokens || 0), 0),
      outputTokens: dayCalls.reduce((sum, call) => sum + Number(call.completionTokens || 0), 0),
      tokens: dayCalls.reduce((sum, call) => sum + Number(call.tokens || 0), 0),
      cost: dayCalls.reduce((sum, call) => sum + Number(call.cost || 0), 0),
      requests: dayCalls.length,
      success,
      failed: Math.max(0, dayCalls.length - success),
    };
  });
}

function hasMiniSeriesData(points = []) {
  return points.some((point) => Number(point.value || 0) > 0);
}

function buildDailyMiniSeries(trendData, key, days = 7) {
  return trendData.slice(-days).map((item) => ({
    label: item.date,
    value: Number(item[key] || 0),
    secondaryValue: key === "cost" ? Number(item.tokens || 0) : key === "tokens" ? Number(item.cost || 0) : null,
  }));
}

function buildTodayHourlyMiniSeries(calls) {
  const now = new Date();
  const buckets = Array.from({ length: 8 }, (_, index) => {
    const hour = Math.max(0, now.getHours() - (7 - index));
    return { label: `${String(hour).padStart(2, "0")}:00`, value: 0, secondaryValue: 0 };
  });
  calls
    .filter((call) => call.createdAt && isSameDay(new Date(call.createdAt), now))
    .forEach((call) => {
      const hour = new Date(call.createdAt).getHours();
      const bucket = buckets.find((item) => Number(item.label.slice(0, 2)) === hour);
      if (!bucket) return;
      bucket.value += Number(call.cost || 0);
      bucket.secondaryValue += Number(call.tokens || 0);
    });
  return buckets.map((item) => ({
    ...item,
    value: Number(item.value.toFixed(4)),
  }));
}

function buildDailyAverageCostMiniSeries(trendData, days = 7) {
  return trendData.slice(-days).map((item) => {
    const requests = Number(item.requests || 0);
    return {
      label: item.date,
      value: requests > 0 ? Number((Number(item.cost || 0) / requests).toFixed(4)) : 0,
    };
  });
}

function buildCacheRateMiniSeries(trendData) {
  return trendData.slice(-7).map((item) => {
    const total = Number(item.requests || 0);
    const success = Number(item.success || 0);
    return {
      label: item.date,
      value: total > 0 ? (success / total) * 100 : 0,
      secondaryValue: total,
    };
  });
}

function buildSavingsMiniSeries(savingsData, days = 7) {
  const rows = Array.isArray(savingsData?.callSavings) ? savingsData.callSavings : [];
  const dates = Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - ((days - 1) - index));
    return date;
  });
  return dates.map((date) => {
    const dayRows = rows.filter((item) => item.createdAt && isSameDay(new Date(item.createdAt), date));
    return {
      label: date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }).replace(/\//g, "-"),
      value: Number(dayRows.reduce((sum, item) => sum + Number(item.savedAmountCny || 0), 0).toFixed(4)),
    };
  });
}

function buildSavingsCostSeries(savingsData, trendData, field = "savedAmountCny", days = 7) {
  const rows = Array.isArray(savingsData?.callSavings) ? savingsData.callSavings : [];
  return trendData.slice(-days).map((day) => {
    const dayRows = rows.filter((item) => {
      if (!item.createdAt) return false;
      const label = new Date(item.createdAt).toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }).replace(/\//g, "-");
      return label === day.date;
    });
    const fallback = field === "actualCostCny" ? Number(day.cost || 0) : null;
    const value = dayRows.length
      ? dayRows.reduce((sum, item) => sum + Number(item[field] || 0), 0)
      : fallback;
    return {
      label: day.date,
      value: value === null ? null : Number(value.toFixed(6)),
      secondaryValue: day.tokens,
    };
  });
}

function sumSavingsRows(rows = [], predicate = () => true) {
  return rows.filter(predicate).reduce((acc, row) => ({
    official: acc.official + Number(row.officialCostCny || 0),
    actual: acc.actual + Number(row.actualCostCny || 0),
    saved: acc.saved + Number(row.savedAmountCny || 0),
  }), { official: 0, actual: 0, saved: 0 });
}

function buildModelSparkSeries(model, trendData, key = "spend") {
  const values = Array.isArray(model?.spark) ? model.spark : [];
  return trendData.slice(-7).map((day, index) => ({
    label: day.date,
    value: Number(values[index] || 0),
  }));
}

function buildSimpleMetricDetail({ title, description, badge = "数据面板", rows = [], trend = [], chartTitle = "趋势", chartFormatter = moneyFormatter, chartColor = "purple", tableRows = [] }) {
  return {
    title,
    description,
    badge,
    sections: [
      { title: "核心数据", content: <DetailRows rows={rows} /> },
      {
        title: chartTitle,
        content: (
          <div className="dash3-simple-detail-chart">
            <MiniMetricChart data={trend} type="area" color={chartColor} valueFormatter={chartFormatter} height={96} emptyText="" />
          </div>
        ),
      },
      tableRows.length ? {
        title: "相关调用",
        content: <DetailTable columns={[
          { key: "time", label: "时间" },
          { key: "model", label: "模型" },
          { key: "totalTokens", label: "总 Token" },
          { key: "cost", label: "成本" },
          { key: "status", label: "状态" },
        ]} rows={tableRows} />,
      } : null,
    ].filter(Boolean),
  };
}

function getFutureDateLabels(days = 7) {
  return Array.from({ length: days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() + index + 1);
    return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit" }).replace(/\//g, "/");
  });
}

function buildPredictionFromTrend(trendData, metric, balance) {
  const activeDays = trendData.filter((item) => Number(item.cost || 0) > 0 || Number(item.tokens || 0) > 0 || Number(item.requests || 0) > 0);
  const lastSeven = trendData.slice(-7);
  const activeSeven = lastSeven.filter((item) => Number(item.cost || 0) > 0 || Number(item.tokens || 0) > 0 || Number(item.requests || 0) > 0);
  const averageBase = activeSeven.length ? activeSeven : activeDays;
  const averageDays = averageBase.length || 1;
  const totalCost = averageBase.reduce((sum, item) => sum + Number(item.cost || 0), 0);
  const totalTokens = averageBase.reduce((sum, item) => sum + Number(item.tokens || 0), 0);
  const totalRequests = averageBase.reduce((sum, item) => sum + Number(item.requests || 0), 0);
  const dailyAverageCost = totalCost / averageDays;
  const dailyAverageTokens = totalTokens / averageDays;
  const dailyAverageRequests = totalRequests / averageDays;
  const costPerToken = totalTokens > 0 ? totalCost / totalTokens : 0;
  const requestsPerToken = totalTokens > 0 ? totalRequests / totalTokens : 0;
  const tokenForecast = generateTokenForecast(lastSeven.map((item) => ({
    date: item.date,
    tokens: Number(item.tokens || 0),
    totalTokens: Number(item.tokens || 0),
  })), 7);

  const metricConfig = {
    spend: {
      unit: "$",
      pastValues: trendData.map((item) => Number(item.cost || 0)),
      futureValue: dailyAverageCost,
    },
    requests: {
      unit: "",
      pastValues: trendData.map((item) => Number(item.requests || 0)),
      futureValue: dailyAverageRequests,
    },
    tokens: {
      unit: "K",
      pastValues: trendData.map((item) => Number(((Number(item.tokens || 0)) / 1000).toFixed(2))),
      futureValue: dailyAverageTokens / 1000,
    },
  }[metric] || {
    unit: "K",
    pastValues: trendData.map((item) => Number(((Number(item.tokens || 0)) / 1000).toFixed(2))),
    futureValue: dailyAverageTokens / 1000,
  };

  const hasData = activeDays.length > 0;
  if (!hasData) {
    return {
      data: {
        pastDates: [],
        pastValues: [],
        pastCosts: [],
        futureDates: getFutureDateLabels(7),
        futureValues: [],
        futureCosts: [],
        unit: metricConfig.unit,
        primaryModel: "0",
        source: "empty",
      },
      summary: {
        weekTokens: 0,
        weekCost: 0,
        coverDays: 0,
        suggestRecharge: 0,
        dailyAverageCost: 0,
        message: "暂无足够数据生成预测，完成更多真实调用后会自动生成。",
        hasData: false,
        source: "empty",
      },
    };
  }
  const futureValues = tokenForecast.map((tokens) => {
    if (metric === "spend") return Number((tokens * costPerToken).toFixed(4));
    if (metric === "requests") return Number(Math.max(0, tokens * requestsPerToken).toFixed(2));
    return Number((tokens / 1000).toFixed(2));
  });
  const estimatedDaysLeft = dailyAverageCost > 0 ? Math.max(1, Math.floor(Number(balance || 0) / dailyAverageCost)) : 0;
  const weekTokens = tokenForecast.reduce((sum, value) => sum + Number(value || 0), 0) || Math.round(dailyAverageTokens * 7);
  const weekCost = Number(((tokenForecast.reduce((sum, value) => sum + Number(value || 0), 0) * costPerToken) || (dailyAverageCost * 7)).toFixed(2));

  return {
    data: {
      pastDates: trendData.map((item) => item.date.replace("-", "/")),
      pastValues: metricConfig.pastValues,
      pastCosts: trendData.map((item) => Number(item.cost || 0)),
      futureDates: getFutureDateLabels(7),
      futureValues,
      futureCosts: tokenForecast.map((tokens) => Number((Number(tokens || 0) * costPerToken).toFixed(4))),
      unit: metricConfig.unit,
      primaryModel: "DeepSeek V4 Flash",
      source: "real",
    },
    summary: {
      weekTokens,
      weekCost,
      coverDays: estimatedDaysLeft,
      suggestRecharge: dailyAverageCost > 0 ? Math.max(50, Math.ceil((dailyAverageCost * 30) / 10) * 10) : 0,
      dailyAverageCost,
      message: dailyAverageCost > 0
        ? `按最近 7 天平均消耗，当前余额预计可使用 ${estimatedDaysLeft} 天。`
        : "暂无足够数据生成预测，继续使用后将自动生成。",
      hasData,
      source: "real",
    },
  };
}

function buildModelUsage(ranking) {
  return ranking.slice(0, 5).map((item, index) => ({
    model: item.model,
    provider: item.provider || "FlowAPI",
    requests: item.requests,
    tokens: item.tokens,
    cost: item.spend,
    avgLatency: 0,
    successRate: 0,
    color: item.color,
  }));
}

function buildModelUsageTrend(trendData, modelUsage) {
  const top3 = modelUsage.slice(0, 3);
  const rest = modelUsage.slice(3);
  const topTokens = top3.reduce((s, m) => s + Number(m.tokens || 0), 0);
  const restTokens = rest.reduce((s, m) => s + Number(m.tokens || 0), 0);
  const allTokens = topTokens + restTokens;
  if (!trendData.length || !modelUsage.length || allTokens <= 0) return [];

  return trendData.map((day) => {
    const totalTokens = Number(day.tokens || 0);
    const mapped = top3.map((model) => ({
      model: model.model,
      provider: model.provider,
      color: model.color || "#6366f1",
      tokens: Math.round(totalTokens * (Number(model.tokens || 0) / allTokens)),
    }));
    if (restTokens > 0) {
      mapped.push({
        model: `其他 ${rest.length} 个模型`,
        provider: "",
        color: "#9ca3af",
        tokens: Math.round(totalTokens * (restTokens / allTokens)),
      });
    }
    return { date: day.date, totalTokens, models: mapped };
  });
}

function CoreMetricCard({ label, value, detail, tooltip, onTooltip, theme, onClick, chartData = [], chartType = "area", chartColor = "purple", chartFormatter = formatCurrency, chartEmptyText = "" }) {
  return (
    <InteractiveCard className="dash3-core-metric-card" title={label} hint="点击查看指标明细" onClick={onClick}>
      <div>
        <span>{label}</span>
        {tooltip ? (
          <button
            type="button"
            className="dash3-info-dot"
            onMouseMove={(event) => onTooltip({
              x: event.clientX + 14,
              y: event.clientY - 10,
              content: (
                <div>
                  <strong>{label}</strong>
                  <p style={{ margin: "8px 0 0", color: theme === "light" ? "#6b7280" : "#9ca3af" }}>{tooltip}</p>
                </div>
              ),
            })}
            onMouseLeave={() => onTooltip(null)}
            aria-label={`${label}说明`}
          >
            ?
          </button>
        ) : null}
      </div>
      <strong className="dash3-core-metric-value">{value}</strong>
      <p>{detail}</p>
      <MiniMetricChart
        data={chartData}
        type={chartType}
        color={chartColor}
        valueFormatter={chartFormatter}
        emptyText={chartEmptyText}
        height={58}
      />
    </InteractiveCard>
  );
}

function CacheStatsStrip({ stats = {} }) {
  const items = [
    { label: "缓存命中率", value: `${Number(stats.hitRate || 0).toFixed(1)}%`, note: "重复请求复用比例" },
    { label: "缓存命中次数", value: `${Number(stats.hitCount || 0).toLocaleString()} 次`, note: "本周期命中的请求" },
    { label: "缓存节省 Token", value: `${formatCompactToken(Number(stats.savedTokens || 0))} Token`, note: "估算少消耗的 Token" },
    { label: "缓存节省金额", value: `$${Number(stats.savedCostCny || 0).toFixed(2)}`, note: "估算节省成本" },
    { label: "平均响应提升", value: `${Number(stats.avgLatencyImprovement || 0).toFixed(0)}%`, note: "命中缓存后的速度提升" },
  ];
  return (
    <article className="dash3-cache-strip">
      <div className="dash3-cache-copy">
        <span>缓存命中率</span>
        <p>缓存命中率越高，说明重复请求被复用得越多，通常可以节省 Token 成本并提升响应速度。</p>
      </div>
      <div className="dash3-cache-grid">
        {items.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.note}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function TokenTrendMiniChart({ data, onTooltip, theme }) {
  const width = 620;
  const height = 230;
  const margin = { top: 24, right: 20, bottom: 34, left: 56 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  const maxTokens = Math.max(...data.map((item) => item.tokens), 1);
  const maxCost = Math.max(...data.map((item) => item.cost), 1);
  const toX = (index) => margin.left + (index / Math.max(1, data.length - 1)) * chartW;
  const toTokenY = (value) => margin.top + chartH - (value / maxTokens) * chartH;
  const toCostY = (value) => margin.top + chartH - (value / maxCost) * chartH;
  const tokenPoints = data.map((item, index) => `${toX(index)},${toTokenY(item.tokens)}`).join(" ");
  const inputPoints = data.map((item, index) => `${toX(index)},${toTokenY(item.inputTokens || 0)}`).join(" ");
  const outputPoints = data.map((item, index) => `${toX(index)},${toTokenY(item.outputTokens || 0)}`).join(" ");
  const costPoints = data.map((item, index) => `${toX(index)},${toCostY(item.cost)}`).join(" ");
  const labelEvery = data.length > 45 ? 14 : data.length > 14 ? 5 : 1;

  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="dash3-ops-chart">
      {[0, 0.5, 1].map((frac) => {
        const y = margin.top + chartH - chartH * frac;
        return <line key={frac} x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke="var(--dash-border)" />;
      })}
      <polyline points={tokenPoints} fill="none" stroke="#6366f1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={inputPoints} fill="none" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <polyline points={outputPoints} fill="none" stroke="#06b6d4" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7" />
      <polyline points={costPoints} fill="none" stroke="#f59e0b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="6,4" />
      {data.map((item, index) => (
        <g
          key={item.date}
          onMouseMove={(event) => onTooltip({
            x: event.clientX + 14,
            y: event.clientY - 40,
            content: (
              <div>
                <strong>{item.date}</strong>
                <div style={{ marginTop: 8, color: theme === "light" ? "#6b7280" : "#9ca3af" }}>总 Token：<b>{formatTokens(item.tokens)}</b></div>
                <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af" }}>输入 Token：<b>{formatTokens(item.inputTokens || 0)}</b></div>
                <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af" }}>输出 Token：<b>{formatTokens(item.outputTokens || 0)}</b></div>
                <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af" }}>消耗：<b>${item.cost.toFixed(2)}</b></div>
                <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af" }}>请求：<b>{item.requests} 次</b></div>
              </div>
            ),
          })}
          onMouseLeave={() => onTooltip(null)}
        >
          <rect x={toX(index) - 24} y={margin.top} width={48} height={chartH} fill="transparent" />
          <circle cx={toX(index)} cy={toTokenY(item.tokens)} r="4" fill="#6366f1" />
        </g>
      ))}
      {data.map((item, index) => (
        index % labelEvery === 0 || index === data.length - 1 ? (
          <text key={`x-${item.date}`} x={toX(index)} y={height - 10} textAnchor="middle" fill="var(--dash-sub)" fontSize="12">{item.date}</text>
        ) : null
      ))}
    </svg>
  );
}

function ModelDistributionDonut({ models, onTooltip, theme }) {
  const size = 230;
  const radius = 82;
  const cx = size / 2;
  const cy = size / 2;
  const total = Math.max(1, models.reduce((sum, item) => sum + item.cost, 0));
  const arcs = models.reduce((state, item) => {
    const start = (state.sum / total) * Math.PI * 2;
    const nextSum = state.sum + item.cost;
    const end = (nextSum / total) * Math.PI * 2;
    const large = end - start > Math.PI ? 1 : 0;
    const x1 = cx + Math.cos(start - Math.PI / 2) * radius;
    const y1 = cy + Math.sin(start - Math.PI / 2) * radius;
    const x2 = cx + Math.cos(end - Math.PI / 2) * radius;
    const y2 = cy + Math.sin(end - Math.PI / 2) * radius;
    return {
      sum: nextSum,
      items: [...state.items, { item, d: `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z` }],
    };
  }, { sum: 0, items: [] }).items;

  return (
    <div className="dash3-donut-layout">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {arcs.map(({ item, d }) => (
          <path
            key={item.model}
            d={d}
            fill={item.color}
            opacity="0.9"
            onMouseMove={(event) => onTooltip({
              x: event.clientX + 14,
              y: event.clientY - 10,
              content: (
                <div>
                  <ModelNameWithLogo model={item.model} provider={item.provider} size={24} />
                  <div style={{ marginTop: 8, color: theme === "light" ? "#6b7280" : "#9ca3af" }}>金额：${item.cost.toFixed(2)}</div>
                  <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af" }}>Token：{formatCompactToken(item.tokens)} Token</div>
                </div>
              ),
            })}
            onMouseLeave={() => onTooltip(null)}
          />
        ))}
        <circle cx={cx} cy={cy} r="52" fill="var(--dash-card-bg)" />
        <text x={cx} y={cy - 2} textAnchor="middle" fill="var(--dash-text)" fontSize="18" fontWeight="900">模型</text>
        <text x={cx} y={cy + 20} textAnchor="middle" fill="var(--dash-sub)" fontSize="12">成本占比</text>
      </svg>
      <div className="dash3-donut-legend">
        {models.map((item) => (
          <div key={item.model}>
            <span className="model-name-cell">
              <ModelLogo model={item.model} provider={item.provider} size={24} />
              <span className="model-text">
                <strong className="model-name">{item.model}</strong>
                <small className="model-provider">{item.provider || getModelProviderLabel(item.model)}</small>
              </span>
            </span>
            <b>${item.cost.toFixed(2)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function ModelUsageTrendChart({ data, onTooltip, theme }) {
  const maxTokens = Math.max(...data.map((item) => item.totalTokens || 0), 1);
  const hasData = data.some((item) => item.totalTokens > 0);
  if (!hasData) {
    return (
      <div className="dash3-empty-chart compact">
        <strong>暂无模型使用趋势</strong>
        <span>完成更多模型调用后，这里会展示不同模型的使用占比变化。</span>
      </div>
    );
  }

  return (
    <div className="dash3-model-usage-trend">
      <div className="dash3-model-usage-bars">
      {data.map((day) => {
        let currentBottom = 0;
        return (
          <div
            key={day.date}
            className="dash3-model-usage-day"
            onMouseMove={(event) => onTooltip({
              x: event.clientX + 14,
              y: event.clientY - 20,
              content: (
                <div>
                  <strong>{day.date}</strong>
                  <div className="dash3-model-tooltip-list">
                    {day.models.map((item) => (
                      <div key={item.model}>
                        <span><ModelLogo model={item.model} provider={item.provider} size={22} />{item.model}</span>
                        <b>{formatCompactToken(item.tokens)} Token</b>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, color: theme === "light" ? "#6b7280" : "#9ca3af" }}>总量：<b>{formatCompactToken(day.totalTokens)} Token</b></div>
                </div>
              ),
            })}
            onMouseLeave={() => onTooltip(null)}
          >
            <span className="dash3-model-usage-stack">
              {day.models.map((item) => {
                const height = Math.max(item.tokens > 0 ? 4 : 0, (item.tokens / maxTokens) * 150);
                const style = { height, bottom: currentBottom, background: item.color };
                currentBottom += height;
                return <i key={item.model} style={style} />;
              })}
            </span>
            <small>{day.date.slice(3)}</small>
          </div>
        );
      })}
      </div>
      <div className="dash3-mini-legend dash3-model-usage-legend">
        {(data[0]?.models || []).slice(0, 4).map((item) => (
          <span key={item.model}>
            <i style={{ background: item.color }} />
            <ModelLogo model={item.model} provider={item.provider} size={16} />
            {item.model.length > 22 ? item.model.slice(0, 20) + "…" : item.model}
          </span>
        ))}
      </div>
    </div>
  );
}

function DashboardOperationsSection({ stats, trendData, trendRange, setTrendRange, modelUsage, recentRows, onTooltip, theme, onOpenMetric, onOpenModel }) {
  const modelUsageTrend = buildModelUsageTrend(trendData, modelUsage);
  const totalCost = Number(stats.totalCost ?? stats.monthCost ?? 0);
  const costMini = buildDailyMiniSeries(trendData, "cost", 7);
  const tokenMini = buildDailyMiniSeries(trendData, "tokens", 7);
  const requestMini = buildDailyMiniSeries(trendData, "requests", 7);
  const apiKeyMini = Number(stats.apiKeyCount || 0) > 0 ? [{ label: "当前 API Key", value: Number(stats.apiKeyCount || 0), secondaryValue: Number(stats.activeApiKeyCount || 0) }] : [];
  const cacheMini = Number(stats.cacheHitRate || 0) > 0 ? [{ label: "当前命中率", value: Number(stats.cacheHitRate || 0), secondaryValue: Number(stats.cacheStats?.hitCount || 0) }] : [];
  const exportSheets = [
    { sheetName: "核心指标", data: [
      { metric: "总消耗金额", value: `$${totalCost.toFixed(2)}`, description: "累计 API 调用消耗金额" },
      { metric: "今日消耗", value: `$ API ${stats.todayCost.toFixed(2)}`, tokens: stats.todayTokens },
      { metric: "本月消耗", value: `$ API ${stats.monthCost.toFixed(2)}`, tokens: stats.monthTokens },
      { metric: "请求次数", value: `${stats.todayRequests}/${stats.monthRequests}`, description: "今日 / 本月请求次数" },
      { metric: "平均响应时间", value: `${stats.avgLatency.toFixed(1)}s` },
      { metric: "缓存命中率", value: `${stats.cacheHitRate.toFixed(1)}%` },
    ] },
    { sheetName: "缓存命中率", data: [stats.cacheStats || {}] },
    { sheetName: "Token趋势", data: trendData },
    { sheetName: "模型成本排行", data: modelUsage },
    { sheetName: "最近调用记录", data: recentRows },
  ];
  return (
    <section className="dash3-section">
      <SectionTitle
        title="消耗与稳定性概览"
        subtitle="把 Token、金额、请求成功率和接口速度放在一起看，方便判断是否需要充值、换模型或排查接口。"
        right={<ExportExcelButton fileName="数据面板_全部统计" sheets={exportSheets}>导出数据面板统计</ExportExcelButton>}
      />
      <div className="dash3-core-metrics-grid">
        <CoreMetricCard label="总消耗金额" value={<MetricValueInline prefix="$ API " value={totalCost.toFixed(2)} />} detail="累计 API 调用消耗金额" chartData={hasMiniSeriesData(costMini) ? costMini : []} chartColor="purple" chartFormatter={moneyFormatter} chartEmptyText="" onClick={() => onOpenMetric("totalCost")} />
        <CoreMetricCard label="API Key" value={<MetricValueInline value={stats.apiKeyCount} unit="个" />} detail={`可用 ${stats.activeApiKeyCount} 个，默认脱敏展示`} chartData={apiKeyMini} chartType="bar" chartColor="purple" chartFormatter={countFormatter} chartEmptyText="" onClick={() => onOpenMetric("keys")} />
        <CoreMetricCard label="今日消耗" value={<MetricValueInline prefix="$ API " value={stats.todayCost.toFixed(2)} />} detail={`${formatCompactToken(stats.todayTokens)} Token`} chartData={hasMiniSeriesData(costMini) ? costMini : []} chartColor="yellow" chartFormatter={moneyFormatter} chartEmptyText="" onClick={() => onOpenMetric("today")} />
        <CoreMetricCard label="本月消耗" value={<MetricValueInline prefix="$ API " value={stats.monthCost.toFixed(2)} />} detail={`${formatCompactToken(stats.monthTokens)} Token，帮助判断预算`} chartData={hasMiniSeriesData(costMini) ? costMini : []} chartColor="orange" chartFormatter={moneyFormatter} chartEmptyText="" onClick={() => onOpenMetric("month")} />
        <CoreMetricCard label="请求次数" value={<MetricValueInline value={`${stats.todayRequests} / ${stats.monthRequests}`} unit="次" />} detail="今日 / 本月请求次数" chartData={hasMiniSeriesData(requestMini) ? requestMini : []} chartType="bar" chartColor="cyan" chartFormatter={countFormatter} chartEmptyText="" onClick={() => onOpenMetric("requests")} />
        <CoreMetricCard label="Token 消耗" value={<MetricValueInline value={formatCompactToken(stats.monthTokens)} unit="Token" />} detail={`今日 ${formatCompactToken(stats.todayTokens)} Token`} chartData={hasMiniSeriesData(tokenMini) ? tokenMini : []} chartColor="cyan" chartFormatter={tokenFormatter} chartEmptyText="" onClick={() => onOpenMetric("tokens")} />
      </div>
      <CacheStatsStrip stats={stats.cacheStats} />

      <div className="dash3-ops-grid">
        <article className="dash3-card dash3-ops-card large">
          <div className="dash3-card-title-row">
            <div className="dash3-card-subtitle">Token 消耗趋势</div>
            <div className="dash3-range-tabs">
              {[
                { key: "7d", label: "7 天" },
                { key: "30d", label: "30 天" },
                { key: "90d", label: "90 天" },
              ].map((item) => (
                <button key={item.key} type="button" className={trendRange === item.key ? "active" : ""} onClick={() => setTrendRange(item.key)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <p className="dash3-ops-desc">基于真实调用日志生成，展示 Token 数与消耗金额变化。</p>
          <TokenTrendMiniChart data={trendData} onTooltip={onTooltip} theme={theme} />
          <div className="dash3-mini-legend"><span><i style={{ background: "#6366f1" }} />总 Token</span><span><i style={{ background: "#22c55e" }} />输入 Token</span><span><i style={{ background: "#06b6d4" }} />输出 Token</span><span><i style={{ background: "#f59e0b" }} />金额</span></div>
        </article>
        <article className="dash3-card dash3-ops-card">
          <div className="dash3-card-subtitle">模型消耗分布</div>
          <p className="dash3-ops-desc">看清钱主要花在哪些模型上。</p>
          <ModelDistributionDonut models={modelUsage} onTooltip={onTooltip} theme={theme} />
        </article>
        <article className="dash3-card dash3-ops-card">
          <div className="dash3-card-subtitle">模型使用占比趋势</div>
          <p className="dash3-ops-desc">查看最近 7 天不同模型的使用占比变化，帮助判断主要消耗来自哪些模型。</p>
          <ModelUsageTrendChart data={modelUsageTrend} onTooltip={onTooltip} theme={theme} />
          <p className="dash3-chart-note">如果某个高价模型占比过高，可以考虑将简单任务切换到高性价比模型。</p>
        </article>
        <article className="dash3-card dash3-ops-card">
          <div className="dash3-card-subtitle">模型成本排行榜</div>
          <p className="dash3-ops-desc">看清楚你的 AI Token 主要花在哪些模型上，帮助你判断是否需要换模型、降成本或补充余额。</p>
          <div className="dash3-ops-ranking">
            <div className="model-cost-row model-cost-header">
              <span className="model-cost-rank">#</span>
              <span className="model-cost-info">模型</span>
              <span className="model-cost-number">Token</span>
              <span className="model-cost-number">金额</span>
              <span className="model-cost-number">占比</span>
            </div>
            {modelUsage.map((item, index) => {
              const totalCost = modelUsage.reduce((s, m) => s + Number(m.cost || 0), 0) || 1;
              const pct = ((Number(item.cost || 0) / totalCost) * 100).toFixed(1);
              return (
                <button type="button" className="model-cost-row" onClick={() => onOpenModel(item)} key={item.model}>
                  <span className="model-cost-rank">{index + 1}</span>
                  <span className="model-cost-info">
                    <ModelNameWithLogo model={item.model} provider={item.provider || getModelProviderLabel(item.model)} size={22} gap={10} />
                  </span>
                  <span className="model-cost-number sub">{formatCompactToken(item.tokens)}</span>
                  <span className="model-cost-number primary">$ API {Number(item.cost || 0).toFixed(2)}</span>
                  <span className="model-cost-number sub">{pct}%</span>
                </button>
              );
            })}
          </div>
        </article>
      </div>
    </section>
  );
}

function buildMetricDetail(metricKey, { stats, trendData, modelUsage, recentRows }) {
  const updatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const commonTrend = trendData.map((item) => ({
    time: item.date,
    requests: item.requests,
    inputTokens: Math.round(item.tokens * 0.58),
    outputTokens: Math.round(item.tokens * 0.42),
    totalTokens: item.tokens,
    cost: item.cost,
    successRate: item.requests ? `${((item.success / item.requests) * 100).toFixed(1)}%` : "0.0%",
    avgLatency: "1.2s",
  }));
  const models = modelUsage.map((item) => ({
    model: item.model,
    requests: item.requests,
    totalTokens: item.tokens,
    cost: item.cost,
    avgLatency: `${item.avgLatency.toFixed(1)}s`,
    successRate: `${item.successRate.toFixed(1)}%`,
  }));
  const calls = recentRows.map((row) => ({
    time: row.time,
    model: row.model,
    apiKey: row.apiKey,
    inputTokens: row.input,
    outputTokens: row.output,
    totalTokens: row.total,
    cost: row.amount,
    status: row.status,
    avgLatency: row.latency,
  }));

  const configs = {
    totalCost: {
      title: "总消耗金额详情",
      description: "查看你累计 API 调用消耗的金额、Token 和主要模型。",
      rows: [
        { label: "总消耗金额", value: `$ API ${Number(stats.totalCost ?? stats.monthCost ?? 0).toFixed(2)}`, note: "累计 API 调用消耗金额" },
        { label: "累计 Token", value: `${formatCompactToken(modelUsage.reduce((total, item) => total + Number(item.tokens || 0), 0))} Token` },
        { label: "主要消耗模型", value: modelUsage[0]?.model || "暂无" },
        { label: "最近更新时间", value: updatedAt },
      ],
      extraTitle: "模型消耗明细",
      extraRows: models,
      sheets: [
        { sheetName: "总消耗概览", data: [
          { metric: "总消耗金额", value: `$ API ${Number(stats.totalCost ?? stats.monthCost ?? 0).toFixed(2)}`, description: "累计 API 调用消耗金额", updatedAt },
        ] },
        { sheetName: "模型消耗明细", data: models },
        { sheetName: "调用明细", data: calls },
      ],
    },
    keys: {
      title: "API Key 详情",
      description: "查看当前 API Key 数量、可用状态和最近调用来源。",
      rows: [
        { label: "API Key 总数", value: `${Number(stats.apiKeyCount || 0)} 个` },
        { label: "可用 API Key", value: `${Number(stats.activeApiKeyCount || 0)} 个` },
        { label: "安全状态", value: "默认脱敏展示，完整值只在复制时使用" },
        { label: "最近更新时间", value: updatedAt },
      ],
      extraTitle: "最近调用来源",
      extraRows: calls,
      sheets: [
        { sheetName: "API Key概览", data: [{ apiKeyCount: stats.apiKeyCount, activeApiKeyCount: stats.activeApiKeyCount, note: "API Key 默认脱敏展示" }] },
        { sheetName: "调用来源", data: calls },
      ],
    },
    balance: {
      title: "当前余额详情",
      description: "查看余额、可用 Token 等值余额、充值记录和最近消耗。",
      rows: [
        { label: "当前余额", value: `$ API ${stats.balance.toFixed(2)}`, note: "当前账户可用余额" },
        { label: "可用 Token 等值余额", value: `${formatCompactToken(Math.floor(stats.balance / 0.0000065))} Token`, note: "按当前平均成本粗略估算" },
        { label: "余额预估可用天数", value: `约 ${Math.max(1, Math.floor(stats.balance / Math.max(stats.todayCost, 0.1)))} 天` },
        { label: "最近更新时间", value: updatedAt },
      ],
      extraTitle: "消耗记录",
      extraRows: calls,
      sheets: [
        { sheetName: "余额概览", data: [
          { metric: "当前余额", value: `$ API ${stats.balance.toFixed(2)}`, description: "当前账户可用余额", updatedAt },
          { metric: "可用 Token 等值余额", value: Math.floor(stats.balance / 0.0000065), description: "估算值", updatedAt },
        ] },
        { sheetName: "充值记录", data: [{ time: updatedAt, amount: "-", paymentMethod: "-", orderId: "-", status: "暂无真实充值明细" }] },
        { sheetName: "消耗记录", data: calls },
      ],
    },
    today: {
      title: "今日消耗详情",
      description: "查看今天已经消耗的金额、Token、请求数和模型分布。",
      rows: [
        { label: "今日消耗金额", value: `$ API ${stats.todayCost.toFixed(2)}` },
        { label: "今日 Token 数", value: `${formatCompactToken(stats.todayTokens)} Token` },
        { label: "今日请求次数", value: `${stats.todayRequests} 次` },
        { label: "今日最常用模型", value: modelUsage[0]?.model || "暂无" },
        { label: "今日最耗钱模型", value: modelUsage[0]?.model || "暂无" },
      ],
      extraTitle: "按小时 / 日期消耗趋势",
      extraRows: commonTrend,
      sheets: [
        { sheetName: "今日消耗概览", data: [{ amount: stats.todayCost, totalTokens: stats.todayTokens, requests: stats.todayRequests, model: modelUsage[0]?.model || "-" }] },
        { sheetName: "按小时消耗", data: commonTrend },
        { sheetName: "今日模型消耗明细", data: models },
      ],
    },
    month: {
      title: "本月消耗详情",
      description: "查看本月累计消耗、日均消耗、月底预测和模型成本排行。",
      rows: [
        { label: "本月累计消耗金额", value: `$ API ${stats.monthCost.toFixed(2)}` },
        { label: "本月累计 Token", value: `${formatCompactToken(stats.monthTokens)} Token` },
        { label: "日均消耗", value: `$ API ${(stats.monthCost / Math.max(1, new Date().getDate())).toFixed(2)}` },
        { label: "预计月底消耗", value: `$ API ${((stats.monthCost / Math.max(1, new Date().getDate())) * 30).toFixed(2)}` },
      ],
      extraTitle: "本月模型成本排行",
      extraRows: models,
      sheets: [
        { sheetName: "本月消耗概览", data: [{ amount: stats.monthCost, totalTokens: stats.monthTokens, note: "按当前已产生数据估算" }] },
        { sheetName: "最近30天趋势", data: commonTrend },
        { sheetName: "模型成本排行", data: models },
      ],
    },
    requests: {
      title: "请求次数详情",
      description: "查看成功请求、失败请求、错误率和 API Key 来源分布。",
      rows: [
        { label: "今日请求次数", value: `${stats.todayRequests} 次` },
        { label: "本月请求次数", value: `${stats.monthRequests} 次` },
        { label: "成功请求", value: `${Math.round(stats.monthRequests * stats.successRate / 100)} 次` },
        { label: "失败请求", value: `${Math.max(0, stats.monthRequests - Math.round(stats.monthRequests * stats.successRate / 100))} 次` },
        { label: "错误率", value: `${(100 - stats.successRate).toFixed(1)}%` },
      ],
      extraTitle: "请求明细",
      extraRows: calls,
      sheets: [
        { sheetName: "请求概览", data: [{ requests: stats.monthRequests, successRate: `${stats.successRate.toFixed(1)}%`, errorRate: `${(100 - stats.successRate).toFixed(1)}%` }] },
        { sheetName: "API Key分布", data: calls },
      ],
    },
    tokens: {
      title: "Token 消耗详情",
      description: "查看本月 Token 消耗、今日 Token 消耗和模型分布。",
      rows: [
        { label: "本月 Token", value: `${formatCompactToken(stats.monthTokens)} Token` },
        { label: "今日 Token", value: `${formatCompactToken(stats.todayTokens)} Token` },
        { label: "主要消耗模型", value: modelUsage[0]?.model || "暂无" },
        { label: "最近更新时间", value: updatedAt },
      ],
      extraTitle: "Token 消耗趋势",
      extraRows: commonTrend,
      sheets: [
        { sheetName: "Token概览", data: [{ monthTokens: stats.monthTokens, todayTokens: stats.todayTokens, mainModel: modelUsage[0]?.model || "-" }] },
        { sheetName: "Token趋势", data: commonTrend },
        { sheetName: "模型Token分布", data: models },
      ],
    },
    latency: {
      title: "平均响应时间详情",
      description: "查看 P50、P90、P99、最慢模型排行和慢请求明细。",
      rows: [
        { label: "平均响应时间", value: `${stats.avgLatency.toFixed(1)}s` },
        { label: "P50 响应时间", value: `${Math.max(0.7, stats.avgLatency * 0.8).toFixed(1)}s` },
        { label: "P90 响应时间", value: `${(stats.avgLatency * 1.8).toFixed(1)}s` },
        { label: "P99 响应时间", value: `${(stats.avgLatency * 2.6).toFixed(1)}s` },
      ],
      extraTitle: "最慢模型排行",
      extraRows: models.sort((a, b) => parseFloat(b.avgLatency) - parseFloat(a.avgLatency)),
      sheets: [
        { sheetName: "响应时间概览", data: [{ avgLatency: `${stats.avgLatency.toFixed(1)}s`, p50: `${(stats.avgLatency * 0.8).toFixed(1)}s`, p90: `${(stats.avgLatency * 1.8).toFixed(1)}s`, p99: `${(stats.avgLatency * 2.6).toFixed(1)}s` }] },
        { sheetName: "慢请求明细", data: calls },
      ],
    },
    cache: {
      title: "缓存命中率详情",
      description: "查看缓存命中、未命中、节省成本估算和适合开启缓存的任务类型。",
      rows: [
        { label: "缓存命中率", value: `${stats.cacheHitRate.toFixed(1)}%`, note: "命中率越高，通常响应更快、成本更低。" },
        { label: "命中请求数", value: `${Number(stats.cacheStats?.hitCount || 0).toLocaleString()} 次` },
        { label: "未命中请求数", value: `${Math.max(0, stats.monthRequests - Number(stats.cacheStats?.hitCount || 0)).toLocaleString()} 次` },
        { label: "缓存节省 Token", value: `${formatCompactToken(Number(stats.cacheStats?.savedTokens || 0))} Token` },
        { label: "节省成本估算", value: `$${Number(stats.cacheStats?.savedCostCny || 0).toFixed(2)}` },
        { label: "平均响应提升", value: `${Number(stats.cacheStats?.avgLatencyImprovement || 0).toFixed(0)}%` },
        { label: "说明", value: "重复提示词、固定模板、批量任务通常更容易命中缓存。" },
      ],
      extraTitle: "缓存命中模型分布",
      extraRows: models,
      sheets: [
        { sheetName: "缓存概览", data: [{ value: `${stats.cacheHitRate.toFixed(1)}%`, requests: stats.monthRequests, note: "缓存命中率表示有多少请求命中了缓存。命中率越高，通常代表响应更快、成本更低。" }] },
        { sheetName: "缓存模型分布", data: models },
      ],
    },
  };
  const config = configs[metricKey] || configs.balance;
  return {
    title: config.title,
    description: config.description,
    badge: "数据面板",
    exportFileName: `数据面板_${config.title.replace("详情", "")}`,
    exportSheets: config.sheets,
    sections: [
      { title: "核心数据", content: <DetailRows rows={config.rows} /> },
      { title: config.extraTitle, content: <DetailTable columns={[
        { key: "time", label: "时间" },
        { key: "model", label: "模型" },
        { key: "requests", label: "请求次数" },
        { key: "totalTokens", label: "总 Token" },
        { key: "cost", label: "成本" },
        { key: "status", label: "状态" },
        { key: "avgLatency", label: "平均耗时" },
        { key: "successRate", label: "成功率" },
      ]} rows={config.extraRows} /> },
    ],
  };
}

function buildModelUsageDetail(model, trendData, recentRows) {
  const calls = recentRows.filter((row) => row.model === model.model || model.model.includes(row.model));
  const rows = [
    { label: "模型名称", value: model.model },
    { label: "模型服务", value: model.provider || "FlowAPI" },
    { label: "请求次数", value: `${model.requests} 次` },
    { label: "总 Token", value: `${formatCompactToken(model.tokens)} Token` },
    { label: "总成本", value: `$${model.cost.toFixed(2)}` },
    { label: "平均单次成本", value: `$${(model.cost / Math.max(1, model.requests)).toFixed(4)}` },
    { label: "平均响应时间", value: `${model.avgLatency.toFixed(1)}s` },
    { label: "成功率", value: `${model.successRate.toFixed(1)}%` },
    { label: "错误次数", value: `${Math.max(0, Math.round(model.requests * (100 - model.successRate) / 100))} 次` },
  ];
  const trendRows = trendData.map((item) => ({
    date: item.date,
    model: model.model,
    totalTokens: Math.round(item.tokens * 0.42),
    cost: Number((item.cost * 0.42).toFixed(4)),
    requests: Math.round(item.requests * 0.42),
  }));
  return {
    title: `${model.model} 成本详情`,
    description: "查看这个模型的 Token、成本、响应时间、成功率和最近调用。",
    badge: "模型成本排行",
    exportFileName: `数据面板_模型成本排行_${model.model.replace(/[/:]/g, "")}`,
    exportSheets: [
      { sheetName: "模型概览", data: rows.map((item) => ({ metric: item.label, value: item.value })) },
      { sheetName: "每日消耗趋势", data: trendRows },
      { sheetName: "调用明细", data: calls.length ? calls : recentRows.slice(0, 5) },
      { sheetName: "错误记录", data: [{ model: model.model, errorMessage: "暂无错误记录", status: "正常" }] },
    ],
    sections: [
      { title: "模型概览", content: <DetailRows rows={rows} /> },
      { title: "最近 7 天消耗趋势", content: <DetailTable columns={[
        { key: "date", label: "日期" },
        { key: "model", label: "模型" },
        { key: "requests", label: "请求次数" },
        { key: "totalTokens", label: "总 Token" },
        { key: "cost", label: "成本" },
      ]} rows={trendRows} /> },
      { title: "使用建议", content: <div className="card-detail-empty">如果该模型成本占比过高，请考虑将部分简单任务切换到更低成本模型，或设置模型重定向和缓存策略。</div> },
    ],
  };
}

function SectionTitle({ title, subtitle, right }) {
  return (
    <div className="dash3-section-header">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {right}
    </div>
  );
}

function AssetDetailMiniChart({ data = [], onTooltip, theme }) {
  const maxValue = Math.max(...data.map((item) => Number(item.value || 0)), 1);
  return (
    <div className="dash3-asset-detail-chart">
      {data.map((item) => (
        <div
          key={item.label}
          className="dash3-asset-detail-bar"
          onMouseMove={(event) => onTooltip?.({
            x: event.clientX + 14,
            y: event.clientY - 24,
            content: (
              <div>
                <strong>{item.label}</strong>
                <p style={{ margin: "8px 0 0", color: theme === "light" ? "#6b7280" : "#9ca3af" }}>{item.tooltip}</p>
              </div>
            ),
          })}
          onMouseLeave={() => onTooltip?.(null)}
        >
          <span>{item.label}</span>
          <div>
            <i style={{ width: `${Math.max(6, (Number(item.value || 0) / maxValue) * 100)}%`, background: item.color }} />
          </div>
          <strong>{item.display}</strong>
        </div>
      ))}
    </div>
  );
}

function buildTimeWindowStats(trendData = [], savingsData = [], windowKey = "today") {
  const now = new Date();
  const start = windowKey === "month"
    ? startOfMonth(now)
    : windowKey === "week"
      ? new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0)
      : startOfDay(now);
  const end = new Date(now);
  const scopeCalls = trendData.filter((item) => {
    if (!item.createdAt) return true;
    const ts = new Date(item.createdAt);
    return ts >= start && ts <= end;
  });
  const savingsRows = Array.isArray(savingsData?.callSavings) ? savingsData.callSavings : [];
  const scopeSavings = savingsRows.filter((item) => {
    if (!item.createdAt) return true;
    const ts = new Date(item.createdAt);
    return ts >= start && ts <= end;
  });
  const sum = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
  const totalCost = sum(scopeCalls, "cost");
  const totalTokens = sum(scopeCalls, "tokens");
  const inputTokens = sum(scopeCalls, "promptTokens");
  const outputTokens = sum(scopeCalls, "completionTokens");
  const cacheReadTokens = sum(scopeCalls, "cacheReadTokens");
  const cacheWriteTokens = sum(scopeCalls, "cacheWriteTokens");
  const requests = scopeCalls.length;
  const successRequests = scopeCalls.filter((call) => getCallStatus(call).key === "success").length;
  const failedRequests = scopeCalls.filter((call) => getCallStatus(call).key === "failed").length;
  const streamRequests = scopeCalls.filter((call) => Boolean(call.isStream || call.stream)).length;
  const nonStreamRequests = Math.max(0, requests - streamRequests);
  const averageLatency = scopeCalls.length
    ? scopeCalls.reduce((total, item) => total + Number(item.latencyMs || item.durationMs || item.responseMs || 0), 0) / scopeCalls.length
    : 0;
  const mostUsedModels = (() => {
    const counts = new Map();
    scopeCalls.forEach((call) => {
      const model = getCallModel(call);
      counts.set(model, (counts.get(model) || 0) + 1);
    });
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([model, count]) => ({ model, count, share: requests > 0 ? Math.round((count / requests) * 100) : 0 }));
  })();
  const mostUsedModel = mostUsedModels[0] || null;
  const mostExpensiveModels = (() => {
    const costMap = new Map();
    scopeCalls.forEach((call) => {
      const model = getCallModel(call);
      costMap.set(model, (costMap.get(model) || 0) + Number(call.cost || 0));
    });
    const totalModelCost = Array.from(costMap.values()).reduce((sum, value) => sum + value, 0) || 1;
    return Array.from(costMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([model, cost]) => ({ model, cost, share: Math.round((cost / totalModelCost) * 100) }));
  })();
  const recentCalls = scopeCalls.slice(0, 5).map((call) => ({
    requestId: call.requestId || call.id || "-",
    model: getCallModel(call),
    time: formatCallTime(call.createdAt),
    status: getCallStatus(call).label,
    cost: Number(call.cost || 0),
    tokens: Number(call.tokens || 0),
  }));
  const savedApiCredit = scopeSavings.reduce((total, item) => total + Number(item.savedAmountCny || 0), 0);
  const savedSources = {
    cache: scopeSavings.filter((item) => Number(item.savedAmountCny || 0) > 0).reduce((total, item) => total + Number(item.savedAmountCny || 0) * 0.35, 0),
    discount: scopeSavings.filter((item) => Number(item.discountAmountCny || 0) > 0).reduce((total, item) => total + Number(item.discountAmountCny || 0), 0),
    package: scopeSavings.filter((item) => Number(item.packageSavedAmountCny || 0) > 0).reduce((total, item) => total + Number(item.packageSavedAmountCny || 0), 0),
    channel: scopeSavings.filter((item) => Number(item.channelSavedAmountCny || 0) > 0).reduce((total, item) => total + Number(item.channelSavedAmountCny || 0), 0),
  };
  return {
    totalCost,
    totalTokens,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    requests,
    successRequests,
    failedRequests,
    streamRequests,
    nonStreamRequests,
    averageLatency,
    savedApiCredit,
    savedSources,
    mostUsedModels,
    mostUsedModel,
    mostExpensiveModels,
    recentCalls,
  };
}

function buildAssetOverviewDetail(assetKey, { overview, trendData, recentRows, onTooltip, theme }) {
  const updatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const tokenChart = trendData.map((item) => ({
    label: item.date,
    value: item.tokens,
    display: `${formatCompactToken(item.tokens)} Token`,
    tooltip: `${item.date} 消耗 ${formatCompactToken(item.tokens)} Token，金额 $${Number(item.cost || 0).toFixed(2)}`,
    color: "#6366f1",
  }));
  const costChart = trendData.map((item) => ({
    label: item.date,
    value: item.cost,
    display: `$${Number(item.cost || 0).toFixed(2)}`,
    tooltip: `${item.date} 消耗金额 $${Number(item.cost || 0).toFixed(2)}，请求 ${item.requests} 次`,
    color: "#8b5cf6",
  }));
  const recentCallRows = recentRows.slice(0, 8).map((row) => ({
    time: row.time,
    model: row.model,
    totalTokens: `${formatCompactToken(row.total)} Token`,
    cost: `$${Number(row.amount || 0).toFixed(4)}`,
    status: row.status,
  }));
  const configs = {
    balance: {
      title: "当前余额详情",
      description: "查看当前可用余额、赠送余额和最近 7 天消耗趋势。",
      rows: [
        { label: "当前余额", value: `$ API ${overview.balance.toFixed(2)}`, note: "账户当前可用总余额" },
        { label: "赠送余额", value: `$ API ${Number(overview.giftBalance || 0).toFixed(2)}`, note: "今日有效，调用模型时优先使用" },
        { label: "约可调用", value: `${formatCompactToken(overview.callableTokens)} Token`, note: "按当前平均成本粗略估算" },
        { label: "最近更新时间", value: updatedAt },
      ],
      chartTitle: "最近 7 天金额消耗",
      chartData: costChart,
      tableTitle: "最近调用记录",
      tableRows: recentCallRows,
      advice: "建议：赠送余额当天有效，适合优先完成测试调用；正式业务建议保持充值余额充足。",
    },
    today: {
      title: "今日消耗详情",
      description: "查看今天的金额流出、Token 消耗和调用记录。",
      rows: [
        { label: "本日消耗", value: `$${overview.todaySpend.toFixed(2)}` },
        { label: "本日 Token", value: `${formatCompactToken(overview.todayTokens)} Token` },
        { label: "最近调用", value: overview.lastCall?.model || "0" },
        { label: "最近更新时间", value: updatedAt },
      ],
      chartTitle: "最近 7 天 Token 消耗",
      chartData: tokenChart,
      tableTitle: "今日与近期调用",
      tableRows: recentCallRows,
      advice: "建议：如果今日消耗突然上升，优先检查高成本模型和长输出任务。",
    },
    week: {
      title: "本周消耗详情",
      description: "查看最近 7 天的 Token 使用节奏和成本变化。",
      rows: [
        { label: "本周消耗", value: `$${overview.weekSpend.toFixed(2)}` },
        { label: "本周 Token", value: `${formatCompactToken(overview.weekTokens)} Token` },
        { label: "日均消耗", value: `$${(overview.weekSpend / 7).toFixed(2)}` },
        { label: "最近更新时间", value: updatedAt },
      ],
      chartTitle: "最近 7 天金额消耗",
      chartData: costChart,
      tableTitle: "近期调用记录",
      tableRows: recentCallRows,
      advice: "建议：本周消耗可以作为充值和套餐选择的基础参考。",
    },
    lastCall: {
      title: "最近调用详情",
      description: "查看最近一次 API 调用的模型、Token 和金额。",
      rows: [
        { label: "模型", value: overview.lastCall?.model || "0" },
        { label: "消耗 Token", value: overview.lastCall ? `${formatCompactToken(overview.lastCall.tokens)} Token` : "0 Token" },
        { label: "消耗金额", value: overview.lastCall ? `$${overview.lastCall.amount.toFixed(4)}` : "$0.00 API" },
        { label: "调用时间", value: overview.lastCall?.time || "0" },
      ],
      chartTitle: "最近 7 天 Token 消耗",
      chartData: tokenChart,
      tableTitle: "最近调用记录",
      tableRows: recentCallRows,
      advice: "建议：最近调用是排查 API Key、模型名和扣费是否正常的第一入口。",
    },
  };
  const config = configs[assetKey] || configs.balance;
  return {
    title: config.title,
    description: config.description,
    badge: "资产总览",
    sections: [
      { title: "核心数据", content: <DetailRows rows={config.rows} /> },
      {
        title: config.chartTitle,
        content: <AssetDetailMiniChart data={config.chartData} onTooltip={onTooltip} theme={theme} />,
      },
      {
        title: config.tableTitle,
        content: <DetailTable columns={[
          { key: "time", label: "时间" },
          { key: "model", label: "模型" },
          { key: "totalTokens", label: "总 Token" },
          { key: "cost", label: "成本" },
          { key: "status", label: "状态" },
        ]} rows={config.tableRows} />,
      },
      { title: "资产建议", content: <p className="dash3-asset-detail-advice">{config.advice}</p> },
    ],
  };
}

function buildTimeWindowDetail(windowKey, stats) {
  const labels = {
    today: "今日",
    week: "本周",
    month: "本月",
  };
  const titlePrefix = labels[windowKey] || "今日";
  const savedSources = stats.savedSources || {};
  return buildSimpleMetricDetail({
    title: `${titlePrefix}详情`,
    description: `查看${titlePrefix}的花费、Token、节省、请求和调用走势。`,
    badge: "数据面板",
    rows: [
      { label: `${titlePrefix}总花费`, value: formatApiCredit(Number(stats.totalCost || 0) * DASHBOARD_API_CREDIT_RATE) },
      { label: `${titlePrefix}模型调用花费`, value: formatApiCredit(Number(stats.totalCost || 0) * DASHBOARD_API_CREDIT_RATE) },
      { label: `${titlePrefix}缓存相关花费`, value: formatApiCredit(Number(stats.cacheRelatedSpend || 0)) },
      { label: `${titlePrefix}折扣前花费`, value: formatApiCredit(Number(stats.beforeDiscountSpend || Number(stats.totalCost || 0) * DASHBOARD_API_CREDIT_RATE)) },
      { label: `${titlePrefix}折扣 / 优惠抵扣`, value: formatApiCredit(Number(stats.discountSavings || 0)) },
      { label: `${titlePrefix}实际扣除`, value: formatApiCredit(Number(stats.totalCost || 0) * DASHBOARD_API_CREDIT_RATE) },
      { label: `${titlePrefix}消耗 Token`, value: `${formatCompactToken(Number(stats.totalTokens || 0))} Tokens` },
      { label: `${titlePrefix}请求次数`, value: `${Number(stats.requests || 0)} 次` },
      { label: `${titlePrefix}成功请求`, value: `${Number(stats.successRequests || 0)} 次` },
      { label: `${titlePrefix}失败请求`, value: `${Number(stats.failedRequests || 0)} 次` },
      { label: `${titlePrefix}流式请求`, value: `${Number(stats.streamRequests || 0)} 次` },
      { label: `${titlePrefix}非流式请求`, value: `${Number(stats.nonStreamRequests || 0)} 次` },
      { label: `${titlePrefix}平均延迟`, value: `${Number(stats.averageLatency || 0).toFixed(0)} ms` },
    ],
    trend: stats.trend || [],
    chartTitle: `${titlePrefix}趋势`,
    chartFormatter: moneyFormatter,
    chartColor: "cyan",
    tableRows: stats.recentCalls || [],
  });
}

function buildRequestedThemeDetail(themeKey, stats) {
  const titleMap = {
    spend: "累计花费详情",
    tokens: "消耗 Token 详情",
    savings: "节省详情",
    requests: "请求次数详情",
    model: "最常用模型详情",
    expense: "最耗费模型详情",
    recent: "最近调用详情",
  };
  const rowsMap = {
    spend: [
      { label: "总花费", value: formatApiCredit(stats.totalCost * DASHBOARD_API_CREDIT_RATE) },
      { label: "模型调用花费", value: formatApiCredit(stats.totalCost * DASHBOARD_API_CREDIT_RATE) },
      { label: "缓存相关花费", value: formatApiCredit(Number(stats.cacheRelatedSpend || 0)) },
      { label: "折扣前花费", value: formatApiCredit(Number(stats.beforeDiscountSpend || stats.totalCost * DASHBOARD_API_CREDIT_RATE)) },
      { label: "折扣 / 优惠抵扣", value: formatApiCredit(Number(stats.discountSavings || 0)) },
      { label: "实际扣除", value: formatApiCredit(stats.totalCost * DASHBOARD_API_CREDIT_RATE) },
    ],
    tokens: [
      { label: "输入 Token", value: `${formatCompactToken(stats.inputTokens)} Tokens` },
      { label: "输出 Token", value: `${formatCompactToken(stats.outputTokens)} Tokens` },
      { label: "缓存读取 Token", value: `${formatCompactToken(stats.cacheReadTokens)} Tokens` },
      { label: "缓存写入 Token", value: `${formatCompactToken(stats.cacheWriteTokens)} Tokens` },
      { label: "总 Token", value: `${formatCompactToken(stats.totalTokens)} Tokens` },
    ],
    savings: [
      { label: "缓存节省", value: formatApiCredit(Number(stats.savedSources?.cache || 0)) },
      { label: "折扣节省", value: formatApiCredit(Number(stats.savedSources?.discount || 0)) },
      { label: "套餐抵扣", value: formatApiCredit(Number(stats.savedSources?.package || 0)) },
      { label: "渠道价差节省", value: formatApiCredit(Number(stats.savedSources?.channel || 0)) },
      { label: "今日累计节省", value: formatApiCredit(Number(stats.savedApiCredit || 0)) },
    ],
    requests: [
      { label: "成功请求", value: `${stats.successRequests} 次` },
      { label: "失败请求", value: `${stats.failedRequests} 次` },
      { label: "流式请求", value: `${stats.streamRequests} 次` },
      { label: "非流式请求", value: `${stats.nonStreamRequests} 次` },
      { label: "平均延迟", value: `${Number(stats.averageLatency || 0).toFixed(0)} ms` },
    ],
    model: (stats.mostUsedModels || []).slice(0, 5).map((item, index) => ({
      label: `${index + 1}. ${item.model}`,
      value: `${item.count} 次`,
      note: `占比 ${item.share}%`,
    })),
    expense: (stats.mostExpensiveModels || []).slice(0, 5).map((item, index) => ({
      label: `${index + 1}. ${item.model}`,
      value: formatApiCredit(item.cost * DASHBOARD_API_CREDIT_RATE),
      note: `占比 ${item.share}%`,
    })),
    recent: (stats.recentCalls || []).map((item, index) => ({
      label: `${index + 1}. ${item.model}`,
      value: `${formatApiCredit(item.cost * DASHBOARD_API_CREDIT_RATE)}`,
      note: `${item.requestId} · ${item.time} · ${item.status} · ${formatCompactToken(item.tokens)} Tokens`,
    })),
  };
  const title = titleMap[themeKey] || "详情";
  const rows = rowsMap[themeKey] || [];
  return buildSimpleMetricDetail({
    title,
    description: "每个卡片都展示自己的主题数据，避免不同指标共享同一套详情。",
    badge: "数据面板",
    rows,
    trend: [],
    chartTitle: "详情说明",
    chartFormatter: moneyFormatter,
    chartColor: "cyan",
    tableRows: themeKey === "recent" ? stats.recentCalls || [] : themeKey === "model" ? stats.mostUsedModels || [] : [],
  });
}

function DashboardMiniCard({ title, value, detail, onClick, color = "var(--dash-accent)", subtitle, progress = null, progressLabel = "", children }) {
  return (
    <button type="button" className="dash3-time-card" onClick={onClick}>
      <span className="dash3-time-card-title">{title}</span>
      <strong className="dash3-time-card-value" style={{ color }}>{value}</strong>
      {detail ? <p className="dash3-time-card-detail">{detail}</p> : null}
      {subtitle ? <small className="dash3-time-card-subtitle">{subtitle}</small> : null}
      {progress !== null ? (
        <div className="dash3-time-card-progress-wrap">
          <div className="dash3-time-card-progress-track">
            <i style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
          </div>
          {progressLabel ? <span className="dash3-time-card-progress-label">{progressLabel}</span> : null}
        </div>
      ) : null}
      {children}
    </button>
  );
}

function TimeWindowSection({
  title,
  windowKey,
  stats,
  onOpenDetail,
  modelChart,
  onOpenModel,
  modelDetail,
}) {
  const labels = {
    today: "今日",
    week: "本周",
    month: "本月",
  };
  const prefix = labels[windowKey] || title;
  const totalApiCredit = stats.totalCost * DASHBOARD_API_CREDIT_RATE;
  const totalTokens = stats.totalTokens || 0;
  const totalSavedApiCredit = stats.savedApiCredit || 0;
  const savedSources = stats.savedSources || {};
  const modelRows = stats.mostUsedModels || [];
  const expensiveRows = stats.mostExpensiveModels || [];
  const topModel = modelRows[0];
  const topExpense = expensiveRows[0];

  return (
    <section className="dash3-section dash3-time-window-section">
      <SectionTitle title={title} subtitle={`${prefix}时间维度只统计当前时间范围内的数据。`} />
      <div className="dash3-exchange-grid dash3-exchange-grid-four">
        <DashboardMiniCard
          title={`${prefix}累计花费`}
          value={formatApiCredit(totalApiCredit)}
          detail={`${prefix}模型调用累计扣费`}
          subtitle={`${prefix}花费只看 API 余额`}
          onClick={() => onOpenDetail(buildRequestedThemeDetail("spend", {
            ...stats,
            totalCost: Number(stats.totalCost || 0),
            cacheRelatedSpend: Number(stats.cacheRelatedSpend || 0),
            beforeDiscountSpend: Number(stats.beforeDiscountSpend || totalApiCredit),
            discountSavings: Number(stats.discountSavings || 0),
          }))}
        />
        <DashboardMiniCard
          title={`${prefix}消耗 Token`}
          value={`${formatCompactToken(totalTokens)} Tokens`}
          detail={`${prefix} input / output / cache Token 构成`}
          subtitle={`${formatCompactToken(stats.inputTokens || 0)} in · ${formatCompactToken(stats.outputTokens || 0)} out`}
          onClick={() => onOpenDetail(buildRequestedThemeDetail("tokens", stats))}
        />
        <DashboardMiniCard
          title={`${prefix}节省`}
          value={formatApiCredit(totalSavedApiCredit)}
          detail={`${prefix}缓存、折扣、套餐和渠道差价节省`}
          subtitle={`${prefix}节省只统计 API 余额`}
          onClick={() => onOpenDetail(buildRequestedThemeDetail("savings", {
            ...stats,
            savedSources,
            savedApiCredit: Number(stats.savedApiCredit || 0),
          }))}
        />
      </div>
      <div className="dash3-exchange-grid dash3-exchange-grid-two dash3-model-summary-layer">
        <DashboardMiniCard
          title={`${prefix}总密钥数`}
          value={keyCountFormatter(stats.totalApiKeys || 0)}
          detail={`${prefix}启用与禁用密钥总和`}
          subtitle={`启用 ${keyCountFormatter(stats.activeApiKeys || 0)} · 禁用 ${keyCountFormatter(stats.disabledApiKeys || 0)}`}
          onClick={() => onOpenDetail(buildSimpleMetricDetail({
            title: `${prefix}密钥详情`,
            description: `查看${prefix}的 API Key 数量和状态分布。`,
            badge: "数据面板",
            rows: [
              { label: "总密钥数", value: keyCountFormatter(stats.totalApiKeys || 0), note: "用户创建的全部密钥" },
              { label: "启用密钥", value: keyCountFormatter(stats.activeApiKeys || 0), note: "当前可用密钥" },
              { label: "禁用密钥", value: keyCountFormatter(stats.disabledApiKeys || 0), note: "已停用密钥" },
            ],
            trend: [],
            chartTitle: "密钥状态",
            chartFormatter: countFormatter,
            chartColor: "cyan",
            tableRows: [],
          }))}
        />
        <DashboardMiniCard
          title={`${prefix}总请求数`}
          value={`${Number(stats.totalRequests || stats.requests || 0).toLocaleString("zh-CN")} 次`}
          detail={`${prefix}成功 / 失败请求总量`}
          subtitle={`平均延迟 ${formatLatency(stats.averageLatency || 0)}`}
          onClick={() => onOpenDetail(buildRequestedThemeDetail("requests", {
            ...stats,
            requests: Number(stats.totalRequests || stats.requests || 0),
          }))}
        />
      </div>
      <div className="dash3-exchange-grid dash3-exchange-grid-two dash3-model-summary-layer">
        <DashboardMiniCard
          title={`${prefix}最常用模型`}
          value={topModel?.model || "暂无"}
          detail={topModel ? `${topModel.count} 次 · 占比 ${topModel.share}%` : "暂无真实调用"}
          subtitle={topModel?.provider || ""}
          onClick={() => onOpenDetail(buildRequestedThemeDetail("model", stats))}
        />
        <DashboardMiniCard
          title={`${prefix}最耗费模型`}
          value={topExpense?.model || "暂无"}
          detail={topExpense ? `${formatApiCredit(topExpense.cost * DASHBOARD_API_CREDIT_RATE)}` : "暂无真实调用"}
          subtitle={topExpense ? `${topExpense.count} 次 · 占比 ${topExpense.share}%` : ""}
          onClick={() => onOpenDetail(buildRequestedThemeDetail("expense", stats))}
        />
      </div>
      <div className="dash3-time-window-footer">
        <ModelConsumptionChartCard data={modelChart} />
      </div>
    </section>
  );
}

function DashboardExchangeCard({
  label,
  value,
  detail,
  chartData = [],
  chartType = "area",
  chartColor = "purple",
  chartFormatter = moneyFormatter,
  empty = false,
  onClick,
  children,
}) {
  return (
    <button type="button" className={`dash3-exchange-card ${empty ? "is-empty" : ""}`} onClick={onClick}>
      <span className="dash3-exchange-card-label">{label}</span>
      <strong className="dash3-exchange-card-value">{value}</strong>
      <p>{detail}</p>
      {children}
      <MiniMetricChart
        data={chartData}
        type={chartType}
        color={chartColor}
        valueFormatter={chartFormatter}
        height={68}
        emptyText=""
      />
      <span className="dash3-detail-corner-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" focusable="false">
          <path d="M7 17 17 7M9 7h8v8" />
        </svg>
      </span>
    </button>
  );
}

function TotalAssetOverviewSection({ data, onOpenDetail }) {
  const balanceApiCredit = Number(data.balance || 0) * DASHBOARD_API_CREDIT_RATE;
  const walletHealth = Math.max(0, Math.min(100, Number(data.walletProgressPercent ?? 72)));
  const rows = [
    { label: "当前可用余额", value: formatApiCredit(balanceApiCredit), note: "当前可用于 API 调用" },
    { label: "累计充值$ API", value: formatCny(data.totalRechargeCny || 0), note: "只统计真实充值" },
    { label: "累计兑换余额", value: formatApiCredit(data.totalConvertedApiCredit || 0), note: "充值兑换得到的余额" },
    { label: "累计赠送余额", value: formatApiCredit(data.totalGiftApiCredit || 0), note: "赠送、活动和补偿累计" },
    { label: "今日到期余额", value: formatApiCredit(data.todayExpiringApiCredit || 0), note: "今日会过期的临时余额" },
    { label: "长期有效余额", value: formatApiCredit(data.longTermApiCredit || 0), note: "长期有效的余额" },
  ];
  const assetOverviewDetail = buildSimpleMetricDetail({
    title: "资产钱包详情",
    description: "查看资产钱包、充值来源和有效期构成。",
    rows,
    trend: data.costMini || [],
    chartTitle: "近 7 天花费趋势",
    chartFormatter: moneyFormatter,
    chartColor: "purple",
    tableRows: (data.recentCalls || []).slice(0, 8).map((row) => ({
      time: row.time,
      model: row.model,
      totalTokens: `${formatCompactToken(row.total || 0)} Tokens`,
      cost: formatApiCredit((row.amount || 0) * DASHBOARD_API_CREDIT_RATE),
      status: row.status,
    })),
  });
  const savedUsd = Number(data.totalSavedApiCredit || 0) / DASHBOARD_API_CREDIT_RATE;
  return (
    <section className="dash3-section dash3-asset-overview-section">
      <SectionTitle title="AI Token 资产总览" subtitle="余额、消费、Token 与节省金额按统一 $ API 口径展示。" />
      <div className="dash3-exchange-grid dash3-asset-overview-grid">
        <DashboardExchangeCard
          label="可用余额"
          value={<MetricValueInline value={formatApiCredit(balanceApiCredit)} />}
          detail="永久余额 + 今日未过期临时余额"
          chartData={data.costMini || []}
          chartColor="green"
          onClick={() => onOpenDetail(assetOverviewDetail)}
        >
          <div className="dash3-wallet-progress-shell" aria-label="可用余额详情">
            <div className="dash3-wallet-progress-head"><span>钱包健康度</span><b>{walletHealth.toFixed(0)}%</b></div>
            <div className="dash3-wallet-progress-track dash3-wallet-progress-track-animated"><i /></div>
            <div className="dash3-wallet-progress-meta"><span>临时余额优先扣</span><span>长期余额兜底</span></div>
          </div>
        </DashboardExchangeCard>
        <DashboardExchangeCard
          label="累计花费 $ API"
          value={<MetricValueInline value={formatApiCredit(data.totalSpentApiCredit || 0)} />}
          detail="所有 API 消费流水累计"
          chartData={data.costMini || []}
          chartColor="purple"
          onClick={() => onOpenDetail(buildSimpleMetricDetail({
            title: "累计花费 $ API",
            description: "所有 API 调用消费流水累计。",
            rows: [{ label: "累计花费", value: formatApiCredit(data.totalSpentApiCredit || 0), note: "来源：API 调用消费" }],
            trend: data.costMini || [],
            chartTitle: "近 7 天花费趋势",
            chartFormatter: moneyFormatter,
            chartColor: "purple",
            tableRows: [],
          }))}
        />
        <DashboardExchangeCard
          label="总消耗 Token"
          value={<MetricValueInline value={formatCompactToken(data.totalTokens || 0)} />}
          detail="所有 API 调用 token 消耗累计"
          chartData={data.tokenMini || []}
          chartColor="cyan"
          chartFormatter={tokenFormatter}
          onClick={() => onOpenDetail(buildSimpleMetricDetail({
            title: "总消耗 Token",
            description: "历史 API 调用 Token 消耗总量。",
            rows: [{ label: "总消耗 Token", value: `${formatCompactToken(data.totalTokens || 0)} Token`, note: "包含输入与输出 Token" }],
            trend: data.tokenMini || [],
            chartTitle: "Token 消耗趋势",
            chartFormatter: tokenFormatter,
            chartColor: "cyan",
            tableRows: [],
          }))}
        />
        <DashboardExchangeCard
          label="累计节省多少 $"
          value={<MetricValueInline value={`$${savedUsd.toFixed(2)}`} />}
          detail="按理论官网价格 - 实际消费价格估算"
          chartData={data.savingMini || []}
          chartColor="orange"
          onClick={() => onOpenDetail(buildSimpleMetricDetail({
            title: "累计节省多少 $",
            description: "如果缺少完整官网价格字段，则按现有节省统计兼容估算。",
            rows: [{ label: "累计节省", value: `$${savedUsd.toFixed(2)}`, note: "理论官网价格 - 实际消费价格" }],
            trend: data.savingMini || [],
            chartTitle: "节省金额趋势",
            chartFormatter: moneyFormatter,
            chartColor: "orange",
            tableRows: [],
          }))}
        />
      </div>
    </section>
  );
}

function ModelSpendFlowChart({ data, metric, onTooltip, theme }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const svgRef = useRef(null);
  const activeIndexRef = useRef(null);
  const moveFrameRef = useRef(null);
  const pendingPointRef = useRef(null);
  const width = 720;
  const height = 320;
  const margin = { top: 28, right: 20, bottom: 44, left: 56 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  useEffect(() => {
    return () => {
      if (moveFrameRef.current) window.cancelAnimationFrame(moveFrameRef.current);
    };
  }, []);

  if (!data.length) {
    return (
      <div className="dash3-empty-chart">
        <strong>0</strong>
        <span>0 Token</span>
      </div>
    );
  }

  const totals = data.map((day) => day.models.reduce((sum, item) => sum + item[metric], 0));
  const maxTotal = Math.max(...totals, 1);
  const barGap = 20;
  const barW = Math.max(52, (chartW - barGap * (data.length - 1)) / data.length);
  const axisColor = theme === "light" ? "rgba(17,24,39,0.14)" : "rgba(255,255,255,0.14)";
  const gridColor = theme === "light" ? "rgba(17,24,39,0.06)" : "rgba(255,255,255,0.05)";

  const getX = (index) => margin.left + index * (barW + barGap);
  const getBarCenter = (index) => getX(index) + barW / 2;
  const getBarHeight = (value) => (value / maxTotal) * chartH;

  const showTooltip = (event, index) => {
    const day = data[index];
    if (!day) return;
    const sorted = [...day.models].sort((a, b) => b[metric] - a[metric]);
    const totalSpend = day.models.reduce((sum, item) => sum + item.spend, 0);
    const totalTokens = day.models.reduce((sum, item) => sum + item.tokens, 0);
    const totalRequests = day.models.reduce((sum, item) => sum + item.requests, 0);
    const mainModel = sorted[0]?.model || "-";
    const tooltipPos = getClampedTooltipPosition({ clientX: event.clientX, clientY: event.clientY, width: 320, height: 260, offsetY: -76 });
    onTooltip({
      x: tooltipPos.x,
      y: tooltipPos.y,
      content: (
        <div className="dash3-flow-tooltip">
          <strong>{day.date}</strong>
          <div className="dash3-flow-tooltip-list">
            {sorted.slice(0, 5).map((item) => (
              <div key={item.model} className="dash3-flow-tooltip-row">
                <span><i style={{ background: item.color }} />{item.model.length > 16 ? item.model.slice(0, 14) + "…" : item.model}</span>
                <b>{metric === "spend" ? `$${item.spend.toFixed(2)}` : metric === "tokens" ? `${formatCompactToken(item.tokens)}` : `${item.requests} 次`}</b>
              </div>
            ))}
          </div>
          <div className="dash3-flow-tooltip-total">
            <span>{metric === "spend" ? `总计 $${totalSpend.toFixed(2)}` : metric === "tokens" ? `总计 ${formatCompactToken(totalTokens)} Token` : `总计 ${totalRequests} 次`} · 主要 {mainModel}</span>
          </div>
        </div>
      ),
    });
  };

  const handleMove = (event) => {
    pendingPointRef.current = { clientX: event.clientX, clientY: event.clientY };
    if (moveFrameRef.current) return;
    moveFrameRef.current = window.requestAnimationFrame(() => {
      moveFrameRef.current = null;
      const point = pendingPointRef.current;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!point || !rect) return;
      const nearest = getNearestChartIndex({
        clientX: point.clientX,
        rect,
        count: data.length,
        viewWidth: width,
        plotLeft: margin.left,
        plotWidth: chartW,
      });
      if (nearest < 0) return;
      if (activeIndexRef.current !== nearest) {
        activeIndexRef.current = nearest;
        setActiveIndex(nearest);
      }
      showTooltip(point, nearest);
    });
  };

  const handleLeave = () => {
    if (moveFrameRef.current) {
      window.cancelAnimationFrame(moveFrameRef.current);
      moveFrameRef.current = null;
    }
    pendingPointRef.current = null;
    activeIndexRef.current = null;
    setActiveIndex(null);
    onTooltip(null);
  };

  return (
    <svg ref={svgRef} width="100%" height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", cursor: "crosshair" }}>
      {/* Gradient for bars */}
      <defs>
        {data.length > 0 && data[0].models.map((item) => (
          <linearGradient key={item.model} id={`flow-grad-${item.model.replace(/[^a-zA-Z0-9]/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={item.color} stopOpacity="0.95" />
            <stop offset="100%" stopColor={item.color} stopOpacity="0.6" />
          </linearGradient>
        ))}
      </defs>

      {/* Grid */}
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const y = margin.top + chartH - chartH * frac;
        const val = maxTotal * frac;
        const label = metric === "spend" ? `$${val.toFixed(0)}` : metric === "tokens" ? formatCompactToken(val) : `${Math.round(val)}`;
        return (
          <g key={frac}>
            <line x1={margin.left} y1={y} x2={width - margin.right} y2={y} stroke={gridColor} strokeWidth="1" />
            <text x={margin.left - 10} y={y + 4} textAnchor="end" fill="var(--dash-sub)" fontSize="11" fontWeight="600">{label}</text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((day, index) => {
        let y = margin.top + chartH;
        const x = getX(index);
        const isActive = activeIndex === index;
        const total = totals[index];
        return (
          <g key={day.date}>
            {/* Active highlight background */}
            {isActive && (
              <rect
                x={x - 8} y={margin.top}
                width={barW + 16} height={chartH}
                rx="12"
                fill={theme === "light" ? "rgba(99,102,241,0.06)" : "rgba(99,102,241,0.1)"}
              />
            )}
            {/* Stacked segments */}
            {day.models.map((item) => {
              const h = Math.max(item[metric] > 0 ? 3 : 0, getBarHeight(item[metric]));
              y -= h;
              return (
                <rect
                  key={item.model}
                  x={x}
                  y={y}
                  width={barW}
                  height={h}
                  rx={Math.min(5, h / 2)}
                  fill={`url(#flow-grad-${item.model.replace(/[^a-zA-Z0-9]/g, "")})`}
                  opacity={isActive ? 1 : 0.82}
                  style={{ transition: "opacity 0.15s ease" }}
                />
              );
            })}
            {/* Top value label on hover */}
            {isActive && (
              <text
                x={getBarCenter(index)} y={margin.top - 6}
                textAnchor="middle" fill="var(--dash-accent)" fontSize="12" fontWeight="900" fontFamily="inherit"
              >
                {metric === "spend" ? `$${total.toFixed(1)}` : metric === "tokens" ? formatCompactToken(total) : `${total}`}
              </text>
            )}
            {/* Vertical guide line */}
            {isActive && (
              <line
                x1={getBarCenter(index)} y1={margin.top}
                x2={getBarCenter(index)} y2={margin.top + chartH}
                stroke={axisColor} strokeWidth="1" strokeDasharray="3,3"
              />
            )}
            {/* Date label */}
            <text
              x={getBarCenter(index)} y={height - 12}
              textAnchor="middle"
              fill={isActive ? "var(--dash-accent)" : "var(--dash-sub)"}
              fontSize={isActive ? 13 : 11}
              fontWeight={isActive ? 800 : 500}
              fontFamily="inherit"
            >{day.date}</text>
          </g>
        );
      })}

      {/* Interactive overlay */}
      <rect
        x={margin.left} y={margin.top}
        width={chartW} height={chartH}
        fill="transparent"
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        onTouchMove={(event) => {
          if (event.touches?.[0]) handleMove(event.touches[0]);
        }}
        onTouchEnd={() => window.setTimeout(handleLeave, 1800)}
        style={{ cursor: "crosshair" }}
      />
    </svg>
  );
}

function ModelDistributionBars({ ranking, metric, onTooltip, onOpenModel, theme }) {
  const total = ranking.reduce((sum, item) => sum + Number(metric === "tokens" ? item.tokens : metric === "requests" ? item.requests : item.spend), 0);
  if (!ranking.length || total <= 0) {
    return (
      <div className="dash3-empty-list">
        <strong>0</strong>
        <span>0 Token</span>
      </div>
    );
  }
  return (
    <div className="dash3-model-share-bars">
      {ranking.slice(0, 7).map((item, index) => {
        const value = Number(metric === "tokens" ? item.tokens : metric === "requests" ? item.requests : item.spend);
        const pct = total > 0 ? (value / total) * 100 : 0;
        const valueLabel = metric === "tokens" ? formatCompactToken(item.tokens) : metric === "requests" ? `${item.requests} 次` : `$${item.spend.toFixed(2)}`;
        return (
          <button
            type="button"
            key={item.model}
            className="dash3-model-share-row"
            onClick={() => onOpenModel?.(item)}
            onMouseMove={(event) => onTooltip?.({
              x: event.clientX + 14,
              y: event.clientY - 20,
              content: (
                <div>
                  <strong>{item.model}</strong>
                  <p style={{ margin: "8px 0 0", color: theme === "light" ? "#6b7280" : "#9ca3af" }}>
                    金额 ${item.spend.toFixed(2)} · {formatCompactToken(item.tokens)} Token · {item.requests} 次 · 占比 {pct.toFixed(1)}%
                  </p>
                </div>
              ),
            })}
            onMouseLeave={() => onTooltip?.(null)}
          >
            <span className="dash3-model-share-rank">{index + 1}</span>
            <span className="dash3-model-share-model">
              <ModelLogo model={item.model} provider={item.provider} size={28} />
              <span>
                <strong>{item.model}</strong>
                <small>{item.provider || getModelProviderLabel(item.model)}</small>
              </span>
            </span>
            <span className="dash3-model-share-value">{valueLabel}</span>
            <span className="dash3-model-share-track"><i style={{ width: `${Math.max(4, pct)}%`, background: item.color }} /></span>
            <span className="dash3-model-share-pct">{pct.toFixed(1)}%</span>
          </button>
        );
      })}
    </div>
  );
}

function TokenSpendFlowSection({ flow, ranking, metric, setMetric, onTooltip, theme, onOpenModel }) {
  const totals = ranking.reduce((acc, item) => ({
    spend: acc.spend + item.spend,
    tokens: acc.tokens + item.tokens,
    requests: acc.requests + item.requests,
  }), { spend: 0, tokens: 0, requests: 0 });
  const mainModel = ranking[0]?.model || "-";

  return (
    <section className="dash3-section">
      <SectionTitle
        title="Token 花费流向"
        subtitle="按模型拆解你的 Token 消耗、消费金额、请求次数和占比。"
        right={(
          <div className="dash3-metric-tabs">
            {[
              { key: "spend", label: "金额" },
              { key: "tokens", label: "Token" },
              { key: "requests", label: "请求数" },
            ].map((tab) => (
              <button key={tab.key} className={`dash3-metric-tab ${metric === tab.key ? "active" : ""}`} onClick={() => setMetric(tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
      />
      <div className="dash3-flow-shell">
        <div className="dash3-flow-kpis">
          <div><span>总消费</span><strong>${totals.spend.toFixed(2)}</strong></div>
          <div><span>总 Token</span><strong>{formatCompactToken(totals.tokens)}</strong></div>
          <div><span>总请求</span><strong>{totals.requests} 次</strong></div>
          <div><span>主要消耗模型</span><strong>{mainModel}</strong></div>
        </div>
        <div className="dash3-flow-analysis-grid">
          <div className="dash3-card">
            <div className="dash3-card-subtitle">模型消耗分布图</div>
            <ModelDistributionBars ranking={ranking} metric={metric} onTooltip={onTooltip} onOpenModel={onOpenModel} theme={theme} />
          </div>

          <div className="dash3-card">
            <div className="dash3-card-subtitle">模型成本排行榜</div>
            {ranking.length === 0 ? (
              <div className="dash3-empty-list">
                <strong>0</strong>
                <span>0 次</span>
              </div>
            ) : (
              <div className="dash3-model-ranking-list">
                <div className="dash3-model-ranking-header">
                  <span>#</span>
                  <span>模型</span>
                  <span className="text-right">金额</span>
                  <span className="text-right">Token</span>
                  <span className="text-right">请求数</span>
                  <span className="text-right">占比</span>
                  <span className="text-right">趋势</span>
                </div>
                {ranking.map((item, index) => (
                  <button type="button" key={item.model} className="dash3-flow-row" onClick={() => onOpenModel?.(item)}>
                    <span className="dash3-flow-rank">{index + 1}</span>
                    <div className="model-name-cell dash3-flow-model-cell">
                      <ModelLogo model={item.model} provider={item.provider} size={26} />
                      <span className="model-text">
                        <strong className="model-name">{item.model}</strong>
                        <small className="model-provider">{item.provider || getModelProviderLabel(item.model)}</small>
                      </span>
                    </div>
                    <div className="dash3-flow-money">${item.spend.toFixed(2)}</div>
                    <div className="dash3-flow-meta">{formatCompactToken(item.tokens)}</div>
                    <div className="dash3-flow-meta">{item.requests} 次</div>
                    <div className="dash3-flow-share">{item.share}%</div>
                    <div className={trendClass(item.trend)}>{trendText(item.trend)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <p className="dash3-advice">
          {ranking.length > 0
            ? `建议：${ranking[0].model} 占用了你 ${ranking[0].share}% 的 Token 消耗，如果是简单任务，可以尝试切换到更低成本模型。`
            : "0%"}
        </p>
      </div>
    </section>
  );
}

function ModelSpendTrendSection({ ranking, onTooltip, theme }) {
  return (
    <section className="dash3-section">
      <SectionTitle
        title="模型消耗趋势"
        subtitle="观察不同模型的 Token 消耗变化，判断成本是否正在上升。"
      />
      {ranking.length === 0 ? (
        <div className="dash3-empty-panel">
          <strong>暂无真实模型趋势</strong>
          <span>模型趋势需要至少一次真实调用记录，后续会自动计算哪个模型消耗正在变高。</span>
        </div>
      ) : (
        <div className="dash3-model-trend-grid">
          {ranking.slice(0, 4).map((item) => (
          <Link href={`/models?model=${encodeURIComponent(item.model)}`} className="dash3-model-trend-card" key={item.model}>
            <div className="dash3-model-trend-head">
              <div className="model-name-cell">
                <ModelLogo model={item.model} provider={item.provider} size={28} />
                <span className="model-text">
                  <strong className="model-name">{item.model}</strong>
                  <small className="model-provider">{item.provider || getModelProviderLabel(item.model)}</small>
                </span>
              </div>
              <b className={trendClass(item.trend)}>{trendText(item.trend)}</b>
            </div>
            <div className="dash3-model-trend-body">
              <span>本周 ${item.spend.toFixed(2)}</span>
              <span>{formatCompactToken(item.tokens)} Token</span>
              <span>{item.requests} 次</span>
            </div>
            <MiniTrendLine values={item.spark} width={240} height={58} color={item.trend < 0 ? "var(--dash-red)" : "var(--dash-green)"} onTooltip={onTooltip} tooltipLabel={`${item.model} 本周消费趋势`} theme={theme} />
          </Link>
          ))}
        </div>
      )}
      <p className="dash3-advice">
        {ranking.length > 0 ? `建议：${ranking[0].model} 是当前主要消耗模型，请确认它是否用于高价值任务。` : "建议：先跑通首次调用，再根据真实趋势决定是否更换模型。"}
      </p>
    </section>
  );
}

function CostStabilitySection({ stats, trendData, modelUsage, recentRows, onOpenMetric, onOpenModel }) {
  const cacheStats = stats.cacheStats || {};
  const hasCacheData = Number(cacheStats.hitCount || 0) > 0 || Number(cacheStats.savedTokens || 0) > 0 || Number(cacheStats.savedCostCny || 0) > 0;
  const hasLatencyData = Number(stats.avgLatency || 0) > 0 && recentRows.length > 0;
  const hasSuccessData = trendData.some((item) => Number(item.requests || 0) > 0);
  const latencyMini = buildDailyMiniSeries(trendData, "requests", 7);
  const cacheMini = hasCacheData ? [{ label: "当前缓存", value: Number(cacheStats.hitRate || 0), secondaryValue: Number(cacheStats.hitCount || 0) }] : [];
  const successMini = trendData.slice(-7).map((item) => ({
    label: item.date,
    value: Number(item.requests || 0) > 0 ? (Number(item.success || 0) / Number(item.requests || 1)) * 100 : null,
  }));
  const highCostModel = [...modelUsage].sort((a, b) => Number(b.cost || 0) - Number(a.cost || 0))[0];
  const alternative = modelUsage.find((item) => item.model !== highCostModel?.model && Number(item.cost || 0) < Number(highCostModel?.cost || 0));
  const highAvgCost = highCostModel?.requests ? Number(highCostModel.cost || 0) / Number(highCostModel.requests || 1) : 0;
  const altAvgCost = alternative?.requests ? Number(alternative.cost || 0) / Number(alternative.requests || 1) : 0;
  const potentialSave = highCostModel && alternative
    ? Math.max(0, highAvgCost - altAvgCost) * Number(highCostModel.requests || 0)
    : 0;

  return (
    <section className="dash3-section">
      <SectionTitle
        title="成本优化与稳定性"
        subtitle="查看缓存命中率、响应速度、请求成功率和高成本模型提醒。"
      />
      {!hasCacheData ? (
        <div className="dash3-cache-empty-note">
          <strong>0%</strong>
          <span>0 次</span>
        </div>
      ) : null}
      <div className="dash3-stability-grid">
        <CoreMetricCard label="缓存命中率" value={hasCacheData ? <MetricValueInline value={Number(cacheStats.hitRate || 0).toFixed(1)} unit="%" /> : "0%"} detail={hasCacheData ? "命中越高，通常更快且更省钱" : "0%"} chartData={cacheMini} chartType="area" chartColor="green" chartFormatter={percentFormatter} chartEmptyText="" onClick={() => onOpenMetric("cache")} />
        <CoreMetricCard label="缓存命中次数" value={hasCacheData ? <MetricValueInline value={Number(cacheStats.hitCount || 0).toLocaleString("zh-CN")} unit="次" /> : "0 次"} detail={hasCacheData ? "本周期命中的请求" : "0 次"} chartData={cacheMini} chartType="bar" chartColor="cyan" chartFormatter={countFormatter} chartEmptyText="" onClick={() => onOpenMetric("cache")} />
        <CoreMetricCard label="缓存节省 Token" value={hasCacheData ? <MetricValueInline value={formatCompactToken(Number(cacheStats.savedTokens || 0))} unit="Token" /> : "0 Token"} detail={hasCacheData ? "估算少消耗的 Token" : "0 Token"} chartData={cacheMini} chartColor="green" chartFormatter={percentFormatter} chartEmptyText="" onClick={() => onOpenMetric("cache")} />
        <CoreMetricCard label="缓存节省金额" value={hasCacheData ? <MetricValueInline prefix="$ API " value={Number(cacheStats.savedCostCny || 0).toFixed(2)} /> : "$0.00 API"} detail={hasCacheData ? "缓存带来的成本优势" : "$0.00 API"} chartData={cacheMini} chartColor="green" chartFormatter={percentFormatter} chartEmptyText="" onClick={() => onOpenMetric("cache")} />
        <CoreMetricCard label="平均响应时间" value={hasLatencyData ? <MetricValueInline value={Number(stats.avgLatency || 0).toFixed(2)} unit="s" /> : "0s"} detail={hasLatencyData ? "最近调用平均响应速度" : "0s"} chartData={hasMiniSeriesData(latencyMini) ? latencyMini : []} chartType="bar" chartColor="cyan" chartFormatter={countFormatter} chartEmptyText="" onClick={() => onOpenMetric("latency")} />
        <CoreMetricCard label="请求成功率" value={hasSuccessData ? <MetricValueInline value={Number(stats.successRate || 0).toFixed(1)} unit="%" /> : "0%"} detail={hasSuccessData ? `${recentRows.length || 0} 条最近流水参与展示` : "0%"} chartData={hasMiniSeriesData(successMini) ? successMini : []} chartColor="purple" chartFormatter={percentFormatter} chartEmptyText="" onClick={() => onOpenMetric("requests")} />
      </div>
      <button type="button" className="dash3-high-cost-alert" onClick={() => highCostModel ? onOpenModel?.(highCostModel) : null}>
        <div>
          <span>高成本模型提醒</span>
          <strong>{highCostModel ? highCostModel.model : "0"}</strong>
          <p>
            {highCostModel
              ? alternative
                ? `${highCostModel.model} 是当前成本大头，可对比 ${alternative.model}。按当前请求量估算，理论可节省约 $${potentialSave.toFixed(2)}。`
                : "完成更多模型调用后，FlowAPI 会给出可替换的低成本模型建议。"
              : "0"}
          </p>
        </div>
        <em>{highCostModel ? "↗" : "0%"}</em>
      </button>
    </section>
  );
}

function TokenForecastDecisionSection({ data, summary, metric, setMetric, onTooltip, theme, tick }) {
  const hasPredictionData = Boolean(summary?.hasData);
  const shouldShowChart = hasPredictionData;
  return (
    <section className="dash3-section">
      <SectionTitle
        title="Token 消耗预测"
        subtitle="黄线 = 实际使用，蓝线 = 预测趋势。按照当前消耗速度，判断未来需要准备多少 Token。"
        right={(
          <div className="dash3-metric-tabs">
            {[
              { key: "tokens", label: "Token" },
              { key: "spend", label: "消耗" },
              { key: "requests", label: "请求数" },
            ].map((tab) => (
              <button key={tab.key} className={`dash3-metric-tab ${metric === tab.key ? "active" : ""}`} onClick={() => setMetric(tab.key)}>
                {tab.label}
              </button>
            ))}
          </div>
        )}
      />
      <div className="dash3-card dash3-forecast-card">
        <div className="dash3-forecast-metrics">
          <article>
            <span>未来 7 天预计消耗</span>
            <strong className="prediction-stat-value">{hasPredictionData ? <MetricValueInline value={<FlashValue value={formatCompactToken(summary.weekTokens)} tick={tick} />} unit="Token" /> : "0 Token"}</strong>
            <p>{hasPredictionData ? "按最近调用节奏推算" : "0 Token"}</p>
          </article>
          <article>
            <span>预计需要余额</span>
            <strong className="prediction-stat-value">{hasPredictionData ? <MetricValueInline prefix="$ API " value={<FlashValue value={summary.weekCost.toFixed(2)} tick={tick} />} /> : "$0.00 API"}</strong>
            <p>{hasPredictionData ? "未来 7 天预估扣费" : "$0.00 API"}</p>
          </article>
          <article>
            <span>当前余额可覆盖</span>
            <strong className="prediction-stat-value">{hasPredictionData ? <MetricValueInline prefix="约" value={<FlashValue value={summary.coverDays} tick={tick} />} unit="天" /> : "0 天"}</strong>
            <p>{hasPredictionData ? "基于当前余额估算" : "0 天"}</p>
          </article>
          <article>
            <span>建议充值</span>
            <strong className="prediction-stat-value">{hasPredictionData ? <MetricValueInline prefix="$ API " value={<FlashValue value={summary.suggestRecharge.toFixed(0)} tick={tick} />} /> : "$0.00 API"}</strong>
            <p>{hasPredictionData ? "避免后续调用中断" : "$0.00 API"}</p>
          </article>
        </div>
        <div className="dash3-prediction-chart-wrap">
          <div className="dash3-prediction-legend">
            <span><span className="dash3-prediction-legend-dot" style={{ background: "#f59e0b" }} /> 实际使用</span>
            <span><span className="dash3-prediction-legend-dot" style={{ background: "#3b82f6" }} /> 预测趋势</span>
          </div>
          {shouldShowChart ? (
            <DualLineChart data={data} unit={data.unit} height={300} width={960} onTooltip={onTooltip} theme={theme} />
          ) : (
            <div className="dash3-empty-chart">
              <strong>0 Token</strong>
              <span>$0.00 API</span>
            </div>
          )}
        </div>
        <p className="dash3-advice">
          {hasPredictionData ? summary.message : "0%"}
          {hasPredictionData && summary.suggestRecharge > 0 ? ` 建议提前充值 $${summary.suggestRecharge.toFixed(0)} 避免调用中断。` : ""}
        </p>
      </div>
    </section>
  );
}

function RecentCallLedger({ rows }) {
  const [expanded, setExpanded] = useState(false);
  const [openRowId, setOpenRowId] = useState(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const canExpand = rows.length > 5;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = expanded
    ? rows.slice((currentPage - 1) * pageSize, currentPage * pageSize)
    : rows.slice(0, 5);

  function toggleRow(id) {
    setOpenRowId((prev) => (prev === id ? null : id));
  }

  function toggleExpanded() {
    setExpanded((value) => {
      const next = !value;
      setPage(1);
      setOpenRowId(null);
      return next;
    });
  }

  return (
    <section className="dash3-section" id="dash-recent-calls">
      <SectionTitle
        title="API 调用流水"
        subtitle="每一次模型调用都会记录 Token、线路、价格、折扣和最终扣费，方便你核对成本。"
        right={canExpand ? (
          <button type="button" className="dash3-ledger-toggle" onClick={toggleExpanded}>
            {expanded ? "收起记录" : `展开记录（每页 10 行）`}
          </button>
        ) : null}
      />
      <div className="dash3-ledger-card">
        {visibleRows.length > 0 ? (
          <div className="call-billing-list">
            {visibleRows.map((row, index) => {
              const isOpen = openRowId === row.id;
              const discountLabel = row.discountRate >= 1 ? "无折扣" : `${(row.discountRate * 10).toFixed(1)} 折`;
              const rawCost = row.originalCostCny || row.actualCostCny;
              const deductionLabel = Array.isArray(row.deductionBreakdown) && row.deductionBreakdown.length
                ? row.deductionBreakdown.map((item) => {
                    const name = item.walletName || item.walletType || "余额";
                    const tokenText = Number(item.tokensDeducted || 0) > 0 ? ` ${formatCompactToken(item.tokensDeducted)} Token` : "";
                    const moneyText = Number(item.amountCnyDeducted || 0) > 0 ? ` ${formatSmallCny(item.amountCnyDeducted)}` : "";
                    return `${name}${tokenText || moneyText}`;
                  }).join(" · ")
                : row.deductionSource || "扣费来源同步中";
              return (
                <article
                  key={`${row.id}-${index}`}
                  className={`call-billing-item ${isOpen ? "open" : ""} ${row.statusKey === "failed" || row.statusKey === "timeout" ? "has-error" : ""}`}
                  onClick={() => toggleRow(row.id)}
                >
                  {/* Collapsed row: one-line summary */}
                  <div className="call-billing-row">
                    <time className="call-billing-time">{row.time}</time>
                    <span className="call-billing-key">{row.apiKey}</span>
                    <span className={`call-billing-type-pill ${row.statusKey}`}>
                      {row.statusKey === "success" ? "消费" : row.statusKey === "timeout" ? "超时" : "失败"}
                    </span>
                    <span className="call-billing-model">
                      <ModelLogo model={row.model} provider={row.provider} size={20} />
                      <span>{row.model}</span>
                    </span>
                    <span className="call-billing-latency">{row.latency}</span>
                    <span className="call-billing-tokens">
                      <span className="call-billing-token-in">{row.input}</span>
                      <span className="call-billing-token-sep">/</span>
                      <span className="call-billing-token-out">{row.output}</span>
                    </span>
                    <span className="call-billing-official">{row.hasSavingPricing ? formatSmallCny(row.originalCostCny) : "官方价格同步中"}</span>
                    <strong className="call-billing-amount">{formatSmallCny(row.actualCostCny)}</strong>
                    {row.savedPercent > 0 && (
                      <span className="call-billing-saved">-{row.savedPercent}%</span>
                    )}
                    <span className="call-billing-ip">{row.requestIp || "-"}</span>
                    <span className="call-billing-channel-tag">{row.channelName}</span>
                    <span className={`call-billing-status-pill ${row.statusKey}`}>{row.status}</span>
                    <span className="call-billing-deduction">{deductionLabel}</span>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="call-billing-detail" onClick={(e) => e.stopPropagation()}>
                      {/* Section 1-3: Pricing cards */}
                      <div className="call-billing-pricing-grid">
                        {/* Original price */}
                        <div className="call-billing-pricing-card">
                          <strong>原始价格</strong>
                          <div className="call-billing-pricing-rows">
                            <div><span>原输入价格</span><b>{formatSmallCny(row.originalInputPricePerM)} / M Token</b></div>
                            <div><span>原输出价格</span><b>{formatSmallCny(row.originalOutputPricePerM)} / M Token</b></div>
                          </div>
                          <small>模型线路原始价格，用于计算原始理论费用。</small>
                        </div>

                        {/* Discount */}
                        <div className="call-billing-pricing-card">
                          <strong>折扣信息</strong>
                          <div className="call-billing-pricing-rows">
                            <div><span>线路折扣</span><b>{discountLabel}</b></div>
                            <div><span>总折扣</span><b>{discountLabel}</b></div>
                          </div>
                          <small>{row.savedPercent > 0 ? `节省 ${row.savedPercent}%` : "暂无折扣"}</small>
                        </div>

                        {/* Actual price */}
                        <div className="call-billing-pricing-card">
                          <strong>实际价格</strong>
                          <div className="call-billing-pricing-rows">
                            <div><span>输入</span><b>{formatSmallCny(row.finalInputPricePerM)} / M Token</b></div>
                            <div><span>输出</span><b>{formatSmallCny(row.finalOutputPricePerM)} / M Token</b></div>
                          </div>
                          <small>本次调用实际使用的计费价格。</small>
                        </div>
                      </div>

                      {/* Section 5: Final calculation */}
                      <div className="call-billing-calc-card">
                        <strong>本次调用费用计算</strong>
                        {row.hasSavingPricing ? (
                          <div className="call-billing-calc-formula">
                            官方预估：({row.input} / 1M × {formatSmallCny(row.originalInputPricePerM)}) + ({row.output} / 1M × {formatSmallCny(row.originalOutputPricePerM)}) = <b>{formatSmallCny(row.originalCostCny)}</b>
                          </div>
                        ) : null}
                        <div className="call-billing-calc-formula">
                          FlowAPI 实际：({row.input} / 1M × {formatSmallCny(row.finalInputPricePerM)}) + ({row.output} / 1M × {formatSmallCny(row.finalOutputPricePerM)}) = <b>{formatSmallCny(row.actualCostCny)}</b>
                        </div>
                        <div className="call-billing-calc-rows">
                          {rawCost > row.actualCostCny && (
                            <div className="call-billing-calc-row">
                              <span>原始计费</span><b className="strikethrough">{formatSmallCny(rawCost)}</b>
                            </div>
                          )}
                          <div className="call-billing-calc-row">
                            <span>实际计费</span><b>{formatSmallCny(row.actualCostCny)}</b>
                          </div>
                          {row.savedPercent > 0 && (
                            <div className="call-billing-calc-row saved">
                              <span>节省</span><b>-{row.savedPercent}% (-{formatSmallCny(row.savedCostCny)})</b>
                            </div>
                          )}
                        </div>
                        <div className="call-billing-deduction-box">
                          <span>本次扣费来源</span>
                          <b>{deductionLabel}</b>
                        </div>
                        <small>本系统按照 Token 用量计算费用，最终扣费以平台实际账单为准。</small>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            {expanded && rows.length > pageSize ? (
              <div className="dash3-ledger-pagination">
                <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
                <span>第 {currentPage} / {totalPages} 页 · 共 {rows.length} 条</span>
                <button type="button" disabled={currentPage >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>下一页</button>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="dash3-empty-table">
            <strong>0 次</strong>
            <span>0 Token</span>
            <Link href="/help" className="dash3-text-btn" style={{ marginTop: 12, display: "inline-block" }}>查看接入教程</Link>
          </div>
        )}
        {canExpand ? (
          <div className="dash3-ledger-bottom">
            <button type="button" className="dash3-ledger-toggle" onClick={toggleExpanded}>
              {expanded ? "收起记录" : "展开记录"}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TokenConsumptionOverview({ items }) {
  return (
    <section className="dash3-section">
      <div className="dash3-section-header">
        <div>
          <h2>Token 消耗概览</h2>
          <p>用资产视角看今日、本周、本月的资金流出、Token 流量和请求频次。</p>
        </div>
        <span className="dash3-section-hint">$ API</span>
      </div>
      <div className="dash3-consumption-grid">
        {items.map((item) => (
          <article className="dash3-consumption-card" key={item.period}>
            <div className="dash3-consumption-top">
              <span>{item.period}</span>
              <b>{item.change}</b>
            </div>
            <strong>${item.amount.toFixed(2)}</strong>
            <div className="dash3-consumption-meta">
              <span>{item.tokens.toLocaleString()} Token</span>
              <span>{item.requests} 次请求</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function ModelCostRanking({ models, onTooltip, theme }) {
  return (
    <section className="dash3-section">
      <div className="dash3-section-header">
        <div>
          <h2>模型成本排行榜</h2>
          <p>按消耗金额排序，像看资产排行一样找到成本大头和优化机会。</p>
        </div>
        <span className="dash3-section-hint">点击模型查看接入</span>
      </div>
      <div className="dash3-cost-ranking">
        {models.map((model, index) => (
          <Link
            key={model.model}
            href={model.href || `/models?model=${encodeURIComponent(model.modelId)}`}
            className="dash3-cost-row"
            onMouseMove={(event) => {
              onTooltip({
                x: event.clientX + 14,
                y: event.clientY - 10,
                content: (
                  <div>
                    <strong>{model.model}</strong>
                    <p style={{ margin: "6px 0 0", color: theme === "light" ? "#6b7280" : "#9ca3af" }}>{model.note}</p>
                  </div>
                ),
              });
            }}
            onMouseLeave={() => onTooltip(null)}
          >
            <span className="dash3-cost-rank">#{index + 1}</span>
            <div className="dash3-cost-model">
              <div className="model-name-cell">
                <ModelLogo model={model.modelId || model.model} provider={model.provider} size={30} />
                <span className="model-text">
                  <strong className="model-name">{model.model}</strong>
                  <small className="model-provider">{model.provider || getModelProviderLabel(model.modelId || model.model)}</small>
                </span>
              </div>
            </div>
            <div className="dash3-cost-main">
              <strong>${model.amount.toFixed(2)}</strong>
              <span>{model.tokens.toLocaleString()} Token</span>
            </div>
            <div className="dash3-cost-share">
              <span>{model.share}%</span>
              <b><i style={{ width: `${model.share}%` }} /></b>
            </div>
            <div className="dash3-cost-avg">
              <span>平均单次</span>
              <strong>${model.avgCost.toFixed(3)}</strong>
            </div>
            <div className={model.direction === "up" ? "dash3-trend-up" : model.direction === "down" ? "dash3-trend-down" : "dash3-trend-flat"}>
              {model.trend} <TrendIcon direction={model.direction} />
            </div>
            <MiniTrendLine values={model.spark} color={model.direction === "down" ? "var(--dash-green)" : "var(--dash-yellow)"} onTooltip={onTooltip} tooltipLabel={`${model.model} 平均成本`} theme={theme} />
          </Link>
        ))}
      </div>
    </section>
  );
}

function AverageRequestCost({ data, onTooltip, theme }) {
  return (
    <section className="dash3-section">
      <div className="dash3-section-header">
        <div>
          <h2>单次请求平均成本</h2>
          <p>把每次调用拆成输入、输出、总 Token，判断成本是否被长上下文拉高。</p>
        </div>
      </div>
      <div className="dash3-average-layout">
        <div className="dash3-average-hero">
          <span>平均每次请求</span>
          <strong>${data.avgCost.toFixed(3)}</strong>
          <MiniTrendLine values={data.trend} width={210} height={58} color="var(--dash-accent)" onTooltip={onTooltip} tooltipLabel="最近 7 天平均请求成本" theme={theme} />
        </div>
        <div className="dash3-average-grid">
          <div><span>平均输入 Token</span><strong>{data.avgInputTokens.toLocaleString()}</strong></div>
          <div><span>平均输出 Token</span><strong>{data.avgOutputTokens.toLocaleString()}</strong></div>
          <div><span>平均总 Token</span><strong>{data.avgTotalTokens.toLocaleString()}</strong></div>
        </div>
      </div>
    </section>
  );
}

function BalanceForecast({ data, onTooltip, theme }) {
  return (
    <section className="dash3-section">
      <div className="dash3-section-header">
        <div>
          <h2>余额可用天数预测</h2>
          <p>黄线为实际使用，蓝线为预测趋势，用来判断什么时候需要补充余额。</p>
        </div>
        <Link href="/recharge" className="dash3-text-btn">去充值 →</Link>
      </div>
      <div className="dash3-balance-layout">
        <div className="dash3-card">
          <div className="dash3-prediction-legend">
            <span><span className="dash3-prediction-legend-dot" style={{ background: "#f59e0b" }} /> 实际使用</span>
            <span><span className="dash3-prediction-legend-dot" style={{ background: "#3b82f6" }} /> 预测趋势</span>
          </div>
          <DualLineChart data={data.chart} unit="$" height={360} width={980} onTooltip={onTooltip} theme={theme} />
        </div>
        <div className="dash3-balance-side">
          {[
            ["当前余额", `$${data.currentBalance.toFixed(2)}`],
            ["预计可用天数", `${data.coverDays} 天`],
            ["未来 7 天预计消耗 Token", `${data.futureTokens.toLocaleString()} Token`],
            ["预计需要余额", `$ API ${data.requiredCredit.toFixed(2)}`],
            ["建议充值金额", `$${data.suggestedRecharge.toFixed(2)}`],
          ].map(([label, value]) => (
            <div key={label} className="dash3-balance-metric">
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function BalanceAlertPanel({ data }) {
  return (
    <section className="dash3-section">
      <div className="dash3-section-header">
        <div>
          <h2>低余额自动提醒</h2>
          <p>当余额、可用天数或单日消耗触发阈值时提醒运营处理。</p>
        </div>
      </div>
      <div className="dash3-alert-panel">
        <div className={`dash3-alert-status ${data.status}`}>
          <span>当前状态</span>
          <strong>{data.statusText}</strong>
          <p>{data.summary}</p>
          <Link href="/recharge">去充值</Link>
        </div>
        <div className="dash3-alert-settings">
          {data.thresholds.map((item) => (
            <label key={item.label}>
              <input type="checkbox" defaultChecked={item.enabled} />
              <span>{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

function ModelValueRecommendations({ items }) {
  return (
    <section className="dash3-section">
      <div className="dash3-section-header">
        <div>
          <h2>模型性价比推荐</h2>
          <p>按任务类型推荐模型组合，减少不必要的高价模型消耗。</p>
        </div>
      </div>
      <div className="dash3-recommend-grid">
        {items.map((item) => (
          <article className="dash3-recommend-card" key={item.title}>
            <span>{item.title}</span>
            <h3>{item.model}</h3>
            <p>{item.reason}</p>
            <div>
              <strong>{item.save > 0 ? `预计可节省 $${item.save.toFixed(2)}` : "优先保证效果稳定"}</strong>
              <Link href={item.href}>查看模型</Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

/* ===================================================================
   INLINE METRIC / PORTRAIT HELPERS
   =================================================================== */

function MetricValueInline({ prefix, value, unit, className = "" }) {
  return (
    <span className={`dash3-metric-inline ${className}`.trim()}>
      {prefix != null && <span className="dash3-metric-prefix">{prefix}</span>}
      <span className="dash3-metric-number">{value}</span>
      {unit != null && <span className="dash3-metric-unit">{unit}</span>}
    </span>
  );
}

function PortraitMetric({ label, value, sub, chartData = [], chartType = "line", chartColor = "cyan", valueFormatter }) {
  return (
    <div className="dash3-portrait-metric">
      <div className="dash3-portrait-metric-copy">
        <span className="dash3-portrait-metric-label">{label}</span>
        <strong className="dash3-portrait-metric-value">{value}</strong>
        <small className="dash3-portrait-metric-sub">{sub}</small>
      </div>
      <MiniMetricChart
        data={chartData}
        type={chartType}
        color={chartColor}
        valueFormatter={valueFormatter}
        emptyText=""
        height={62}
      />
    </div>
  );
}

function ImageCapabilitySection({ data }) {
  if (!data?.summary) return null;
  const chartImages = (data.trend7d || []).map((item) => Number(item.images || 0));
  const chartTokens = (data.trend7d || []).map((item) => Number(item.tokenCost || 0));
  const chartMoney = (data.trend7d || []).map((item) => Number(item.moneyCost || 0));

  return (
    <section className="dash3-section">
      <SectionTitle
        title="图片生成能力"
        subtitle="让图片工作台和数据面板共用同一套真实账本，方便判断今天生成了多少、花了多少、还够用多久。"
        right={<Link href="/images">进入图片工作台</Link>}
      />
      <div className="dash3-recommend-grid">
        <article className="dash3-recommend-card">
          <PortraitMetric
            label="今日生成图片数"
            value={String(data.summary.todayGenerations || 0)}
            sub="最近 7 天图片生成趋势"
            chartData={chartImages}
            chartType="bar"
            chartColor="cyan"
          />
        </article>
        <article className="dash3-recommend-card">
          <PortraitMetric
            label="今日消耗 Token"
            value={`${Number(data.summary.todayTokens || 0).toFixed(1)} Token`}
            sub="最近 7 天图片 Token 消耗"
            chartData={chartTokens}
            chartType="line"
            chartColor="yellow"
          />
        </article>
        <article className="dash3-recommend-card">
          <PortraitMetric
            label="今日消耗金额"
            value={`$${Number(data.summary.todayMoney || 0).toFixed(2)}`}
            sub="最近 7 天图片金额消耗"
            chartData={chartMoney}
            chartType="line"
            chartColor="green"
          />
        </article>
        <article className="dash3-recommend-card">
          <span>图片生成成功率</span>
          <h3>{Number(data.summary.successRate || 0).toFixed(1)}%</h3>
          <p>失败会自动重试，最终失败则不扣费并保留 request_id 方便排查。</p>
          <div><strong>最常用模型：{data.summary.topModel || "暂无"}</strong><Link href="/dashboard/logs">查看日志</Link></div>
        </article>
        <article className="dash3-recommend-card">
          <span>预计还能生成多少张图</span>
          <h3>{Number(data.summary.estimatedRemainingImages || 0)} 张</h3>
          <p>按当前图片模型最低成本估算，仅供运营补货和预算判断参考。</p>
          <div><strong>当前图片余额：${Number(data.summary.currentBalance || 0).toFixed(2)}</strong><Link href="/recharge">去充值</Link></div>
        </article>
        <article className="dash3-recommend-card">
          <span>团队成员消耗排行</span>
          <h3>{data.role === "owner" || data.role === "admin" ? "队长可看" : "仅自己可看"}</h3>
          <p>队长 / 管理员可以查看团队成员分别用了多少、最近什么时候在用、成功率是否异常。</p>
          <div><strong>{data.role === "owner" || data.role === "admin" ? "进入团队记账查看成员明细" : "普通成员只能看自己的日志和图片历史"}</strong><Link href="/team/billing">团队记账</Link></div>
        </article>
      </div>
    </section>
  );
}

/* ===================================================================
   MAIN PAGE
   =================================================================== */

export default function DashboardPage() {
  const { t } = useLocale();
  const { resolvedTheme: theme } = useTheme();
  const [customer, setCustomer] = useState(null);
  const [tick, setTick] = useState(0);
  const [tooltip, setTooltip] = useState(null);
  const [detailModal, setDetailModal] = useState(null);
  const [flowMetric, setFlowMetric] = useState("spend");
  const [predictionMetric, setPredictionMetric] = useState("tokens");
  const [trendRange, setTrendRange] = useState("7d");
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardError, setDashboardError] = useState("");
  const [marketRanks, setMarketRanks] = useState(null);
  const [marketRanksLoading, setMarketRanksLoading] = useState(true);
  const [flowApiRanks, setFlowApiRanks] = useState(null);
  const [flowApiRanksPeriod, setFlowApiRanksPeriod] = useState("week");
  const [flowApiRanksLoading, setFlowApiRanksLoading] = useState(true);
  const [savingsPeriod, setSavingsPeriod] = useState("30d");
  const [savingsData, setSavingsData] = useState(null);
  const [savingsLoading, setSavingsLoading] = useState(true);
  const [savingsOpen, setSavingsOpen] = useState(false);
  const [walletData, setWalletData] = useState(null);
  const [walletLoading, setWalletLoading] = useState(true);
  const [imageSummary, setImageSummary] = useState(null);
  const localDemoMode = useSyncExternalStore(subscribeClientSnapshot, getClientLocalDemoMode, () => false);
  const [heatmapYear, setHeatmapYear] = useState(() => new Date().getFullYear());
  const [heatmapMonth, setHeatmapMonth] = useState(() => new Date().getMonth());
  const dayPeriod = useSyncExternalStore(subscribeClientClock, getClientDayPeriod, () => "上午");
  const tooltipFrameRef = useRef(null);
  const pendingTooltipRef = useRef(null);

  const handleTooltip = useCallback((nextTooltip) => {
    pendingTooltipRef.current = nextTooltip;
    if (tooltipFrameRef.current) return;
    tooltipFrameRef.current = window.requestAnimationFrame(() => {
      tooltipFrameRef.current = null;
      setTooltip(pendingTooltipRef.current);
    });
  }, []);

  useEffect(() => {
    return () => {
      if (tooltipFrameRef.current) window.cancelAnimationFrame(tooltipFrameRef.current);
    };
  }, []);

  const loadCustomer = useCallback(async (customerInput) => {
    const customerId = typeof customerInput === "string" ? customerInput : customerInput?.id;
    if (!customerId) return;
    const cachedCustomer = typeof customerInput === "object" ? customerInput : (() => {
      try {
        const stored = localStorage.getItem("flowapi_customer");
        const parsed = stored ? JSON.parse(stored) : null;
        return parsed?.id === customerId ? parsed : null;
      } catch {
        return null;
      }
    })();
    setLoadingDashboard(true);
    setDashboardError("");
    try {
      const sessionToken = cachedCustomer?.sessionToken || "";
      const response = sessionToken
        ? await fetch(`/api/customer?customerId=${encodeURIComponent(customerId)}`, {
          headers: { Authorization: `Bearer ${sessionToken}` },
        })
        : null;

      if (!response?.ok) {
        const fallback = await fetch(`/api/usage?customerId=${encodeURIComponent(customerId)}`).catch(() => null);
        if (!fallback?.ok) {
          if (cachedCustomer) {
            setCustomer(cachedCustomer);
            return;
          }
          const message = response?.status === 401
            ? "登录状态已过期，请重新登录后查看最新数据。"
            : "数据面板暂时无法连接，请稍后刷新。";
          throw new Error(message);
        }
        const fallbackData = await fallback.json();
        const mergedFallback = sessionToken ? { ...fallbackData, sessionToken } : fallbackData;
        setCustomer(mergedFallback);
        localStorage.setItem("flowapi_customer", JSON.stringify(mergedFallback));
        return;
      }
      const data = await response.json();
      const merged = sessionToken ? { ...data, sessionToken } : data;
      setCustomer(merged);
      localStorage.setItem("flowapi_customer", JSON.stringify(merged));
    } catch (error) {
      setDashboardError(error.message || "数据面板刷新失败，请稍后重试。");
    } finally {
      setLoadingDashboard(false);
    }
  }, []);

  const loadMarketRanks = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setMarketRanksLoading(true);
    try {
      const response = await fetch("/api/analytics/global-model-rank", { cache: "no-store" });
      const data = await response.json();
      setMarketRanks(data);
    } catch {
      setMarketRanks({ source: "global-model-directory", syncStatus: "failed", models: [] });
    } finally {
      setMarketRanksLoading(false);
    }
  }, []);

  const loadFlowApiRanks = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setFlowApiRanksLoading(true);
    try {
      const response = await fetch(`/api/analytics/model-usage-rank?period=${flowApiRanksPeriod}`, { cache: "no-store" });
      const data = await response.json();
      setFlowApiRanks(data);
    } catch {
      setFlowApiRanks({ dataSource: "error", status: "error", models: [] });
    } finally {
      setFlowApiRanksLoading(false);
    }
  }, [flowApiRanksPeriod]);

  /* Load customer */
  useEffect(() => {
    const stored = localStorage.getItem("flowapi_customer");
    if (!stored) return;
    try {
      const c = JSON.parse(stored);
      queueMicrotask(() => setCustomer(c));
      queueMicrotask(() => loadCustomer(c));
    } catch {/* ignore */}
  }, [loadCustomer]);

  useEffect(() => {
    if (!customer?.id) return undefined;
    let cancelled = false;
    fetch("/api/user/titles", { cache: "no-store" })
      .then((res) => res.ok ? res.json() : null)
      .then(() => { if (!cancelled) setTick((value) => value + 1); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [customer?.id]);

  /* Load market model ranks */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;

    loadMarketRanks().catch(() => {
      if (!cancelled) setMarketRanks({ dataSource: "error", status: "error", models: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [loadMarketRanks]);

  /* Load FlowAPI internal model ranks */
  useEffect(() => {
    let cancelled = false;

    loadFlowApiRanks().catch(() => {
      if (!cancelled) setFlowApiRanks({ dataSource: "error", status: "error", models: [] });
    });
    return () => {
      cancelled = true;
    };
  }, [loadFlowApiRanks]);

  useSafePolling({
    intervalMs: 60000,
    enabled: true,
    callback: () => loadMarketRanks({ silent: true }),
  });

  useSafePolling({
    intervalMs: 60000,
    enabled: true,
    callback: () => loadFlowApiRanks({ silent: true }),
  });

  useEffect(() => {
    let cancelled = false;
    setSavingsLoading(true);
    fetch(`/api/analytics/savings?period=${savingsPeriod}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setSavingsData(data); })
      .catch(() => { if (!cancelled) setSavingsData({ source: "empty", summary: null, modelSavings: [], callSavings: [] }); })
      .finally(() => { if (!cancelled) setSavingsLoading(false); });
    return () => { cancelled = true; };
  }, [savingsPeriod]);

  useEffect(() => {
    let cancelled = false;

    if (localDemoMode) {
      const now = new Date();
      const expiresAt = new Date(now);
      expiresAt.setDate(now.getDate() + 12);
      const startedAt = new Date(now);
      startedAt.setDate(now.getDate() - 18);
      setWalletData({
        source: "local-demo",
        wallet: {
          balanceCny: 58.8,
          totalQuotaCny: 100,
          usedQuotaCny: 41.2,
          remainingQuotaCny: 58.8,
          progressPercent: 41.2,
          paidBalanceCny: 56.8,
          giftBalanceCny: 2,
        },
        token: {
          totalTokens: 1000000,
          usedTokens: 412000,
          remainingTokens: 588000,
        },
        plan: {
          planName: "FlowAPI 黑金会员体验包",
          planAmountCny: 100,
          status: "active",
          startedAt: startedAt.toISOString(),
          expiresAt: expiresAt.toISOString(),
          remainingDays: 12,
          quotaText: "100 万",
        },
        membership: {
          status: "active",
          level: "black_gold",
          name: "FLOWAPI 黑金会员",
          startedAt: startedAt.toISOString(),
          dailyBonusTokens: 20000,
          memberQuotaTokens: 300000,
          todayClaimed: true,
          expiresAt: expiresAt.toISOString(),
          memberQuotaCny: 2,
        },
        billingPreference: { priorityMode: "package_first" },
        wallets: [
          { type: "member", name: "会员赠送余额", balanceCnyEquivalent: 2, locked: true },
          { type: "package", name: "套餐余额", balanceCnyEquivalent: 0, locked: false },
          { type: "paid", name: "充值余额", balanceCnyEquivalent: 56.8, locked: false },
        ],
      });
      setWalletLoading(false);
      return () => { cancelled = true; };
    }

    if (!customer?.id) {
      setWalletData({ source: "empty", wallet: null, plan: null });
      setWalletLoading(false);
      return () => { cancelled = true; };
    }

    setWalletLoading(true);
    fetch("/api/user/wallet-summary")
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setWalletData(data); })
      .catch(() => { if (!cancelled) setWalletData({ source: "empty", wallet: null, plan: null }); })
      .finally(() => { if (!cancelled) setWalletLoading(false); });

    return () => { cancelled = true; };
  }, [customer?.id, customer?.balance, localDemoMode]);

  useEffect(() => {
    if (!customer?.id || localDemoMode) {
      setImageSummary(null);
      return;
    }
    let cancelled = false;
    fetch("/api/images/summary")
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled) setImageSummary(data);
      })
      .catch(() => {
        if (!cancelled) setImageSummary(null);
      });
    return () => { cancelled = true; };
  }, [customer?.id, localDemoMode]);

  /* Computed */
  const rawUser = customer || { name: "用户", email: "", balance: 0, totalSpend: 0, apiKeys: [], calls: [] };
  const user = localDemoMode ? buildLocalDemoCustomer(rawUser) : rawUser;
  const effectiveSavingsData = localDemoMode ? buildLocalDemoSavings(user.calls || []) : savingsData;
  const userName = user.name || "用户";
  const baseBalance = Number(user.balance) || 0;
  const usage = buildDashboardUsage(user);
  const modelSpend = buildModelSpendData(usage.calls);
  const savingsByCallId = new Map((effectiveSavingsData?.callSavings || []).map((item) => [item.id, item]));
  const recentCallRows = buildRecentCallRows(usage.calls, user.apiKeys || []).map((row) => {
    const saving = savingsByCallId.get(row.id);
    if (!saving) return row;
    return {
      ...row,
      provider: saving.provider || row.provider,
      originalCostCny: Number(saving.officialCostCny || 0),
      actualCostCny: Number(saving.actualCostCny || row.actualCostCny || 0),
      savedCostCny: Number(saving.savedAmountCny || 0),
      savedPercent: Number(saving.savedPercent || 0),
      originalInputPricePerM: saving.officialInputPricePerM,
      originalOutputPricePerM: saving.officialOutputPricePerM,
      finalInputPricePerM: saving.flowapiInputPricePerM,
      finalOutputPricePerM: saving.flowapiOutputPricePerM,
      hasSavingPricing: true,
    };
  });
  const dashboardStats = buildDashboardStats(user, usage.calls);
  const trendDays = trendRange === "90d" ? 90 : trendRange === "30d" ? 30 : 7;
  const trendData = buildTrendData(usage.calls, trendDays);
  const dashboardAssetCharts = {
    balance: [],
    todaySpend: hasMiniSeriesData(buildTodayHourlyMiniSeries(usage.calls)) ? buildTodayHourlyMiniSeries(usage.calls) : [],
    weekSpend: hasMiniSeriesData(buildDailyMiniSeries(trendData, "cost", 7)) ? buildDailyMiniSeries(trendData, "cost", 7) : [],
    monthSpend: hasMiniSeriesData(buildDailyMiniSeries(trendData, "cost", 30)) ? buildDailyMiniSeries(trendData, "cost", 30) : [],
    recentCalls: hasMiniSeriesData(buildDailyMiniSeries(trendData, "requests", 7)) ? buildDailyMiniSeries(trendData, "requests", 7) : [],
    tokens: hasMiniSeriesData(buildDailyMiniSeries(trendData, "tokens", 7)) ? buildDailyMiniSeries(trendData, "tokens", 7) : [],
    averageCost: hasMiniSeriesData(buildDailyAverageCostMiniSeries(trendData, 7)) ? buildDailyAverageCostMiniSeries(trendData, 7) : [],
    savings: hasMiniSeriesData(buildSavingsMiniSeries(effectiveSavingsData, 7)) ? buildSavingsMiniSeries(effectiveSavingsData, 7) : [],
  };
  const modelUsage = buildModelUsage(modelSpend.ranking);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const heatmapCalendar = useMemo(() => generateMonthCalendar(usage.calls, heatmapYear, heatmapMonth), [usage.calls, heatmapYear, heatmapMonth]);
  const localDemoRankItems = modelSpend.ranking.map((item, index) => ({
    rank: index + 1,
    model: item.model,
    provider: item.provider || getModelProviderLabel(item.model),
    tokens: item.tokens,
    tokensLabel: formatCompactToken(item.tokens),
    changePercent: item.trend,
    requests: item.requests,
    costCny: item.spend,
    share: item.share,
  })).slice(0, 10);
  const effectiveMarketRanks = marketRanks;
  const effectiveFlowApiRanks = localDemoMode
    ? { status: "local-demo", updatedAt: new Date().toISOString(), models: localDemoRankItems }
    : flowApiRanks;
  const marketSyncStatus = effectiveMarketRanks?.syncStatus || effectiveMarketRanks?.status || "syncing";
  const marketUpdatedAt = effectiveMarketRanks?.updatedAt ? new Date(effectiveMarketRanks.updatedAt) : null;
  const marketUpdatedTime = marketUpdatedAt && !Number.isNaN(marketUpdatedAt.getTime())
    ? marketUpdatedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })
    : "";
  const openRouterSourceLabel = localDemoMode
    ? "全球模型 · 演示数据"
    : marketSyncStatus === "synced"
      ? `全球模型 · 最近同步${marketUpdatedTime ? ` ${marketUpdatedTime}` : ""}`
      : marketSyncStatus === "failed"
        ? "全球模型 · 同步失败"
        : "全球模型 · 0";
  const mostUsedModel = modelSpend.ranking[0];
  const mostExpensiveModel = [...modelSpend.ranking].sort((a, b) => b.spend - a.spend)[0];
  const savingsRows = Array.isArray(effectiveSavingsData?.callSavings) ? effectiveSavingsData.callSavings : [];
  const nowForDashboard = new Date();
  const weekStartForDashboard = new Date(nowForDashboard);
  weekStartForDashboard.setDate(nowForDashboard.getDate() - 6);
  weekStartForDashboard.setHours(0, 0, 0, 0);
  const isSavingsToday = (row) => row.createdAt && isSameDay(new Date(row.createdAt), nowForDashboard);
  const isSavingsThisWeek = (row) => row.createdAt && new Date(row.createdAt) >= weekStartForDashboard;
  const todaySavingsTotals = sumSavingsRows(savingsRows, isSavingsToday);
  const weekSavingsTotals = sumSavingsRows(savingsRows, isSavingsThisWeek);
  const hasOfficialSavingsData = Boolean(Number(effectiveSavingsData?.summary?.officialCostCny || 0))
    || savingsRows.some((row) => Number(row.officialCostCny || 0) > 0);
  const totalOfficialCostCny = usage.hasCalls && hasOfficialSavingsData
    ? Number(effectiveSavingsData?.summary?.officialCostCny || 0)
    : null;
  const totalActualCostCny = usage.hasCalls
    ? Number(effectiveSavingsData?.summary?.actualCostCny || dashboardStats.totalCost || 0)
    : 0;
  const totalSavingsCny = hasOfficialSavingsData ? Number(effectiveSavingsData?.summary?.savedAmountCny || 0) : 0;
  const officialTrend = hasOfficialSavingsData && hasMiniSeriesData(buildSavingsCostSeries(effectiveSavingsData, trendData, "officialCostCny", 7))
    ? buildSavingsCostSeries(effectiveSavingsData, trendData, "officialCostCny", 7)
    : [];
  const actualTrend = hasMiniSeriesData(buildSavingsCostSeries(effectiveSavingsData, trendData, "actualCostCny", 7))
    ? buildSavingsCostSeries(effectiveSavingsData, trendData, "actualCostCny", 7)
    : [];
  const savingTrend = hasOfficialSavingsData && hasMiniSeriesData(buildSavingsCostSeries(effectiveSavingsData, trendData, "savedAmountCny", 7))
    ? buildSavingsCostSeries(effectiveSavingsData, trendData, "savedAmountCny", 7)
    : [];
  const weekAvgCostTrend = buildDailyAverageCostMiniSeries(trendData, 7);
  const todayHourlySpend = buildTodayHourlyMiniSeries(usage.calls);
  const todayHourlyTokens = todayHourlySpend.map((item) => ({ label: item.label, value: Number(item.secondaryValue || 0), secondaryValue: Number(item.value || 0) }));
  const weekRequests = trendData.slice(-7).reduce((sum, item) => sum + Number(item.requests || 0), 0);
  const todayRequests = Number(dashboardStats.todayRequests || 0);
  const todayCallsForModel = usage.calls.filter((call) => call.createdAt && isSameDay(new Date(call.createdAt), nowForDashboard));
  const todayModelCounts = Array.from(todayCallsForModel.reduce((map, call) => {
    const model = call.routedModel || call.requestedModel || call.model || "未知模型";
    map.set(model, (map.get(model) || 0) + 1);
    return map;
  }, new Map()).entries()).sort((a, b) => b[1] - a[1]);
  const timeWindowStats = {
    today: {
      totalCost: Number(dashboardStats.todayCost || 0),
      totalTokens: Number(dashboardStats.todayTokens || 0),
      inputTokens: Number(dashboardStats.todayInputTokens || 0),
      outputTokens: Number(dashboardStats.todayOutputTokens || 0),
      cacheReadTokens: Number(dashboardStats.todayCacheReadTokens || 0),
      cacheWriteTokens: Number(dashboardStats.todayCacheWriteTokens || 0),
      savedApiCredit: Number(dashboardStats.todayCost || 0) * DASHBOARD_API_CREDIT_RATE * 0.08,
      requests: Number(dashboardStats.todayRequests || 0),
      successRequests: Number(dashboardStats.todaySuccessRequests || 0),
      failedRequests: Number(dashboardStats.todayFailedRequests || 0),
      streamRequests: Number(dashboardStats.todayStreamRequests || 0),
      nonStreamRequests: Number(dashboardStats.todayNonStreamRequests || 0),
      averageLatency: Number(dashboardStats.avgLatency || 0) * 1000,
      mostUsedModels: dashboardStats.todayRequests > 0 ? [{ model: todayModelCounts[0]?.[0] || "暂无", count: todayModelCounts[0]?.[1] || 0, share: todayRequests > 0 ? Math.round(((todayModelCounts[0]?.[1] || 0) / todayRequests) * 100) : 0, provider: getModelProviderLabel(todayModelCounts[0]?.[0] || "暂无") }] : [],
      recentCalls: recentCallRows.slice(0, 5).map((row) => ({ ...row, cost: row.actualCostCny || row.amount })),
      trend: dashboardAssetCharts.todaySpend,
      cacheRelatedSpend: 0,
      beforeDiscountSpend: Number(dashboardStats.todayCost || 0) * DASHBOARD_API_CREDIT_RATE,
      discountSavings: 0,
    },
    week: {
      totalCost: Number(usage.overview.weekSpend || 0),
      totalTokens: Number(usage.overview.weekTokens || 0),
      inputTokens: Number(dashboardStats.weekInputTokens || 0),
      outputTokens: Number(dashboardStats.weekOutputTokens || 0),
      cacheReadTokens: Number(dashboardStats.weekCacheReadTokens || 0),
      cacheWriteTokens: Number(dashboardStats.weekCacheWriteTokens || 0),
      savedApiCredit: Number(weekSavingsTotals.saved || 0) * DASHBOARD_API_CREDIT_RATE,
      requests: Number(dashboardStats.weekRequests || 0),
      successRequests: Number(dashboardStats.weekSuccessRequests || 0),
      failedRequests: Number(dashboardStats.weekFailedRequests || 0),
      streamRequests: Number(dashboardStats.weekStreamRequests || 0),
      nonStreamRequests: Number(dashboardStats.weekNonStreamRequests || 0),
      averageLatency: Number(dashboardStats.avgLatency || 0) * 1000,
      mostUsedModels: modelUsage.slice(0, 5).map((item) => ({ model: item.model, count: item.requests, share: item.requests && dashboardStats.weekRequests ? Math.round((item.requests / dashboardStats.weekRequests) * 100) : 0, provider: item.provider })),
      recentCalls: recentCallRows.slice(0, 5).map((row) => ({ ...row, cost: row.actualCostCny || row.amount })),
      trend: dashboardAssetCharts.weekSpend,
      cacheRelatedSpend: 0,
      beforeDiscountSpend: Number(usage.overview.weekSpend || 0) * DASHBOARD_API_CREDIT_RATE,
      discountSavings: 0,
    },
    month: {
      totalCost: Number(dashboardStats.monthCost || 0),
      totalTokens: Number(dashboardStats.monthTokens || 0),
      inputTokens: Number(dashboardStats.monthInputTokens || 0),
      outputTokens: Number(dashboardStats.monthOutputTokens || 0),
      cacheReadTokens: Number(dashboardStats.monthCacheReadTokens || 0),
      cacheWriteTokens: Number(dashboardStats.monthCacheWriteTokens || 0),
      savedApiCredit: Number(totalSavingsCny || 0) * DASHBOARD_API_CREDIT_RATE,
      requests: Number(dashboardStats.monthRequests || 0),
      successRequests: Number(dashboardStats.monthSuccessRequests || 0),
      failedRequests: Number(dashboardStats.monthFailedRequests || 0),
      streamRequests: Number(dashboardStats.monthStreamRequests || 0),
      nonStreamRequests: Number(dashboardStats.monthNonStreamRequests || 0),
      averageLatency: Number(dashboardStats.avgLatency || 0) * 1000,
      mostUsedModels: modelUsage.slice(0, 5).map((item) => ({ model: item.model, count: item.requests, share: item.requests && dashboardStats.monthRequests ? Math.round((item.requests / dashboardStats.monthRequests) * 100) : 0, provider: item.provider })),
      recentCalls: recentCallRows.slice(0, 5).map((row) => ({ ...row, cost: row.actualCostCny || row.amount })),
      trend: dashboardAssetCharts.weekSpend,
      cacheRelatedSpend: 0,
      beforeDiscountSpend: Number(dashboardStats.monthCost || 0) * DASHBOARD_API_CREDIT_RATE,
      discountSavings: 0,
    },
  };

  const prediction = buildPredictionFromTrend(trendData.slice(-7), predictionMetric, baseBalance);
  const predictionData = prediction.data;
  const basePrediction = prediction.summary;
  const companionReward = buildCompanionReward(user.createdAt);
  const contentStyle = {
    background: "var(--dash-bg)",
    minHeight: "100vh",
  };

  return (
    <>
      <Head>
        <title>数据面板 - FlowAPI</title>
      </Head>
      <style>{`
        .dashboard-part1 {
          --dash-space-1: 8px;
          --dash-space-2: 12px;
          --dash-space-3: 16px;
          --dash-space-4: 24px;
          --dash-space-5: 32px;
          display: grid;
          gap: 26px;
          margin: 0 0 48px;
          padding: 26px;
          border: 1px solid var(--card-border-light, rgba(15, 23, 42, 0.08));
          border-radius: 28px;
          background:
            radial-gradient(circle at 7% 0%, rgba(99, 102, 241, 0.08), transparent 34%),
            radial-gradient(circle at 96% 8%, rgba(34, 211, 238, 0.06), transparent 30%),
            var(--page-bg-gradient-light, #f8f9ff);
          box-shadow: var(--card-shadow-light, 0 12px 40px rgba(15, 23, 42, 0.06));
          overflow: hidden;
        }

        .dashboard-part1 .dash3-header {
          display: grid !important;
          grid-template-columns: minmax(280px, 0.95fr) minmax(340px, 1.05fr) minmax(420px, 1.25fr) !important;
          align-items: stretch !important;
          justify-content: stretch !important;
          width: 100% !important;
          margin: 0 !important;
          gap: 18px !important;
        }

        .dashboard-part1 .dash3-header > div {
          min-width: 0 !important;
        }

        .dashboard-part1 .dash3-header > div:first-child,
        .dashboard-part1 .dash3-header-center,
        .dashboard-part1-heatmap .activity-heatmap-card {
          min-height: 242px !important;
          border: 1px solid var(--card-border-light, rgba(15, 23, 42, 0.08)) !important;
          border-radius: 22px !important;
          background:
            radial-gradient(circle at 12% 0%, rgba(99, 102, 241, 0.08), transparent 36%),
            var(--page-card-bg, rgba(255, 255, 255, 0.86)) !important;
          box-shadow: var(--card-shadow-light, 0 12px 40px rgba(15, 23, 42, 0.06)) !important;
        }

        .dashboard-part1 .dash3-welcome-card {
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          justify-content: center !important;
          padding: 26px !important;
        }

        .dashboard-part1 .dash3-welcome-card h1 {
          max-width: 100% !important;
          margin: 0 !important;
          color: var(--dash-readable-number, var(--dash-text)) !important;
          font-size: clamp(34px, 3.2vw, 54px) !important;
          font-weight: 950 !important;
          line-height: 1.12 !important;
          letter-spacing: -0.035em !important;
          overflow-wrap: anywhere !important;
        }

        .dashboard-part1 .dash3-welcome-card p {
          max-width: 100% !important;
          margin: 0 !important;
          color: var(--dash-sub) !important;
          overflow-wrap: anywhere !important;
        }

        .dashboard-part1 .dash3-welcome-copy {
          margin-top: 10px !important;
          font-size: 16px !important;
          font-weight: 700 !important;
          line-height: 1.56 !important;
        }

        .dashboard-part1 .dash3-welcome-meta {
          margin-top: 18px !important;
          font-size: 13px !important;
          font-weight: 600 !important;
          line-height: 1.72 !important;
          color: var(--dash-sub) !important;
        }

        .dashboard-part1 .dash3-header-center {
          display: grid !important;
          align-content: center !important;
          gap: 18px !important;
          padding: 22px !important;
        }

        .dashboard-part1 .dash3-companion-head {
          display: flex !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          gap: 16px !important;
        }

        .dashboard-part1 .dash3-companion-copy {
          display: grid !important;
          gap: 10px !important;
          min-width: 0 !important;
        }

        .dashboard-part1 .dash3-companion-copy-label {
          font-size: 12px !important;
          font-weight: 800 !important;
          letter-spacing: 0.08em !important;
          color: var(--dash-sub) !important;
          text-transform: uppercase !important;
        }

        .dashboard-part1 .dash3-companion-title {
          display: flex !important;
          flex-wrap: wrap !important;
          align-items: baseline !important;
          gap: 7px !important;
          margin: 0 !important;
          color: var(--dash-readable-number, var(--dash-text)) !important;
          font-size: 16px !important;
          font-weight: 850 !important;
          line-height: 1.15 !important;
        }

        .dashboard-part1 .dash3-companion-days {
          margin: 0 !important;
          color: var(--dash-readable-number, var(--dash-text)) !important;
          font-size: clamp(38px, 3.4vw, 52px) !important;
          font-weight: 950 !important;
          line-height: 0.92 !important;
          letter-spacing: -0.04em !important;
        }

        .dashboard-part1 .dash3-companion-target {
          display: grid !important;
          justify-items: end !important;
          gap: 6px !important;
          min-width: 132px !important;
          padding: 12px 14px !important;
          border: 1px solid rgba(99, 102, 241, 0.16) !important;
          border-radius: 16px !important;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.12)) !important;
          color: var(--dash-sub) !important;
          font-size: 12px !important;
          line-height: 1.4 !important;
          text-align: right !important;
        }

        .dashboard-part1 .dash3-companion-target b {
          color: #6366f1 !important;
          font-weight: 900 !important;
        }

        .dashboard-part1 .dash3-companion-target strong {
          color: var(--dash-readable-number, var(--dash-text)) !important;
          font-size: 16px !important;
          font-weight: 900 !important;
        }

        .dashboard-part1 .dash3-companion-target em {
          color: #f59e0b !important;
          font-style: normal !important;
        }

        .dashboard-part1 .dash3-login-reward {
          display: grid !important;
          gap: 12px !important;
          margin-top: 2px !important;
        }

        .dashboard-part1 .dash3-login-reward-head {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          gap: 12px !important;
          color: var(--dash-sub) !important;
          font-size: 13px !important;
          font-weight: 800 !important;
        }

        .dashboard-part1 .dash3-login-reward-head strong {
          color: var(--dash-readable-number, var(--dash-text)) !important;
          font-size: 14px !important;
          font-weight: 900 !important;
        }

        .dashboard-part1 .dash3-login-reward-track {
          position: relative !important;
          overflow: visible !important;
          height: 8px !important;
          border-radius: 999px !important;
          background: rgba(148, 163, 184, 0.24) !important;
        }

        .dashboard-part1 .dash3-login-reward-track i {
          display: block !important;
          height: 100% !important;
          border-radius: inherit !important;
          background: linear-gradient(90deg, #60a5fa 0%, #7c3aed 60%, #a855f7 100%) !important;
          box-shadow: 0 8px 18px rgba(124, 58, 237, 0.18) !important;
        }

        .dashboard-part1 .dash3-login-reward-glow {
          position: absolute !important;
          top: 50% !important;
          width: 20px !important;
          height: 20px !important;
          border-radius: 999px !important;
          transform: translateY(-50%) !important;
          background: radial-gradient(circle, rgba(255,255,255,0.98) 0%, rgba(196,181,253,0.96) 34%, rgba(168,85,247,0.88) 58%, rgba(124,58,237,0.2) 100%) !important;
          box-shadow: 0 0 15px 5px rgba(168, 85, 247, 0.6) !important;
          animation: dash3-pulse 1.5s infinite !important;
          pointer-events: none !important;
        }

        .dashboard-part1 .dash3-login-reward-tiers {
          display: flex !important;
          flex-wrap: wrap !important;
          gap: 8px !important;
        }

        .dashboard-part1 .dash3-login-reward-tiers span {
          display: inline-flex !important;
          align-items: center !important;
          gap: 6px !important;
          min-height: 34px !important;
          padding: 0 12px !important;
          border-radius: 999px !important;
          border: 1px solid transparent !important;
          background: rgba(99, 102, 241, 0.08) !important;
          color: var(--dash-sub) !important;
          font-size: 12px !important;
          font-weight: 800 !important;
          line-height: 1 !important;
        }

        .dashboard-part1 .dash3-login-reward-tiers span small {
          font-size: 11px !important;
          font-weight: 700 !important;
          color: rgba(100, 116, 139, 0.92) !important;
        }

        .dashboard-part1 .dash3-login-reward-tiers span.active {
          background: linear-gradient(135deg, rgba(15, 23, 42, 0.96), rgba(51, 65, 85, 0.9)) !important;
          color: #f8fafc !important;
          box-shadow: 0 10px 24px rgba(15, 23, 42, 0.14) !important;
        }

        .dashboard-part1 .dash3-login-reward-tiers span.active small {
          color: rgba(226, 232, 240, 0.78) !important;
        }

        .dashboard-part1 .dash3-login-reward-tiers span.next {
          border-color: rgba(168, 85, 247, 0.45) !important;
          background: rgba(168, 85, 247, 0.08) !important;
          color: #6d28d9 !important;
          box-shadow: 0 0 0 1px rgba(168, 85, 247, 0.08) inset !important;
        }

        .dashboard-part1 .dash3-login-reward-tiers span.recurring {
          border-style: dashed !important;
        }

        @keyframes dash3-pulse {
          0%,
          100% {
            transform: translateY(-50%) scale(0.94) !important;
            box-shadow: 0 0 10px 3px rgba(168, 85, 247, 0.42) !important;
          }
          50% {
            transform: translateY(-50%) scale(1.08) !important;
            box-shadow: 0 0 18px 7px rgba(168, 85, 247, 0.7) !important;
          }
        }

        .dashboard-part1-heatmap {
          min-width: 0 !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-card {
          display: grid !important;
          align-content: center !important;
          gap: 10px !important;
          height: 100% !important;
          padding: 18px !important;
          background:
            radial-gradient(circle at 96% 0%, rgba(99, 102, 241, 0.08), transparent 34%),
            var(--page-card-bg, rgba(255, 255, 255, 0.86)) !important;
          box-shadow: var(--card-shadow-light, 0 12px 40px rgba(15, 23, 42, 0.06)) !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-head {
          display: flex !important;
          align-items: flex-start !important;
          justify-content: space-between !important;
          gap: 10px !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-head span {
          font-size: 10px !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-head h2 {
          margin: 4px 0 0 !important;
          font-size: 20px !important;
          line-height: 1.05 !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-head p,
        .dashboard-part1-heatmap .activity-heatmap-source {
          display: none !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-month {
          flex: none !important;
          gap: 6px !important;
          padding: 0 !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-month button {
          width: 28px !important;
          height: 28px !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-month strong {
          min-width: 78px !important;
          font-size: 12px !important;
          white-space: nowrap !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-grid-wrap {
          display: grid !important;
          justify-content: center !important;
          gap: 6px !important;
          min-width: 0 !important;
          overflow: visible !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-weekdays,
        .dashboard-part1-heatmap .activity-heatmap-week {
          gap: 5px !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-cell {
          width: 25px !important;
          height: 25px !important;
          min-width: 25px !important;
          border-radius: 8px !important;
          font-size: 10px !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-legend {
          margin-top: 2px !important;
          justify-content: flex-end !important;
          gap: 6px !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-legend i {
          width: 12px !important;
          height: 12px !important;
          border-radius: 4px !important;
        }

        .dashboard-part1-heatmap .activity-heatmap-empty {
          min-height: 118px !important;
          padding: 14px !important;
        }

        .dashboard-part1 .dash3-section,
        .dashboard-part1 .wallet-progress-card {
          margin: 0 !important;
        }

        .dashboard-part1 .dash3-section-header,
        .dashboard-part1 .dash3-section > .dash3-section-header {
          margin-bottom: var(--dash-space-4) !important;
        }

        .dashboard-part1 .dash3-section-header h2 {
          font-size: clamp(24px, 2vw, 32px) !important;
          line-height: 1.15 !important;
        }

        .dashboard-part1 .dash3-asset-overview-grid {
          grid-template-columns: minmax(320px, 1.2fr) !important;
          gap: var(--dash-space-3) !important;
        }

        .dashboard-part1 .dash3-asset-overview-grid-wallet-only {
          align-items: stretch !important;
        }

        .dash3-shell > .dash3-section {
          margin-top: var(--dash-space-5);
        }

        .dash3-shell button,
        .dash3-shell [role="button"] {
          transition: background-color 160ms ease, border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease, color 160ms ease;
        }

        .dash3-shell button:hover:not(:disabled),
        .dash3-shell [role="button"]:hover {
          border-color: rgba(99, 102, 241, 0.35);
        }

        .dash3-shell button:active:not(:disabled),
        .dash3-shell [role="button"]:active {
          transform: translateY(1px);
        }

        .dash3-shell button:focus-visible,
        .dash3-shell [role="button"]:focus-visible {
          outline: none;
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        .dash3-shell button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .dashboard-part1 .dash3-asset-card,
        .dashboard-part1 .savings-card {
          height: 278px !important;
          min-height: 278px !important;
          max-height: 278px !important;
          border-color: var(--card-border-light, rgba(15, 23, 42, 0.08)) !important;
          background:
            radial-gradient(circle at 18% 0%, rgba(99, 102, 241, 0.08), transparent 34%),
            var(--page-card-bg, rgba(255, 255, 255, 0.86)) !important;
          box-shadow: var(--card-shadow-light, 0 12px 40px rgba(15, 23, 42, 0.06)) !important;
        }

        .dashboard-part1 .dash3-asset-card .mini-metric-chart,
        .dashboard-part1 .savings-card .mini-metric-chart {
          max-height: 58px !important;
        }

        .dashboard-part1 .dash3-asset-card p {
          margin-top: 10px !important;
        }

        .dashboard-part1 .dash3-asset-card-primary {
          display: grid !important;
          grid-template-rows: auto minmax(74px, auto) auto auto !important;
          align-content: start !important;
          gap: 10px !important;
        }

        .dashboard-part1 .dash3-asset-card-primary > span {
          margin: 0 !important;
        }

        .dashboard-part1 .dash3-asset-card-primary > strong {
          display: block !important;
          min-width: 0 !important;
          margin: 0 !important;
        }

        .dashboard-part1 .dash3-asset-card-primary .dash3-metric-inline {
          display: inline-flex !important;
          width: min-content !important;
          max-width: 100% !important;
          align-items: baseline !important;
          gap: 6px !important;
          white-space: nowrap !important;
          line-height: 1 !important;
        }

        .dashboard-part1 .dash3-asset-card-primary .dash3-metric-prefix {
          color: var(--dash-sub) !important;
          font-size: clamp(20px, 1.6vw, 26px) !important;
          font-weight: 780 !important;
          line-height: 1 !important;
        }

        .dashboard-part1 .dash3-asset-card-primary .dash3-metric-number {
          color: var(--dash-readable-number, var(--dash-text)) !important;
          font-size: clamp(48px, 4.2vw, 64px) !important;
          font-weight: 850 !important;
          letter-spacing: 0 !important;
          line-height: 0.95 !important;
        }

        .dashboard-part1 .dash3-asset-card-primary .dash3-gift-credit {
          display: grid !important;
          width: 100% !important;
          max-width: 100% !important;
          min-height: 0 !important;
          max-height: none !important;
          gap: 4px !important;
          align-items: start !important;
          margin: 0 !important;
          padding: 0 !important;
          border: 0 !important;
          border-radius: 0 !important;
          background: transparent !important;
          color: var(--dash-sub) !important;
          font-size: 13px !important;
          font-weight: 850 !important;
          line-height: 1.35 !important;
          white-space: normal !important;
        }

        .dashboard-part1 .dash3-asset-card-primary .dash3-gift-credit span {
          display: block !important;
          margin: 0 !important;
          color: inherit !important;
          font-size: inherit !important;
          font-weight: inherit !important;
          line-height: inherit !important;
        }

        .dashboard-part1 .dash3-asset-card-primary .dash3-gift-credit b {
          color: var(--dash-readable-number, var(--dash-text)) !important;
          font-size: 14px !important;
          font-weight: 950 !important;
        }

        .dashboard-part1 .dash3-asset-card-primary .mini-metric-chart {
          display: none !important;
        }

        .dashboard-part1 .dash3-wallet-progress-shell {
          display: grid !important;
          gap: 8px !important;
        }

        .dashboard-part1 .dash3-wallet-progress-track,
        .dashboard-part1 .dash3-time-card-progress-track {
          position: relative !important;
          overflow: hidden !important;
        }

        .dashboard-part1 .dash3-wallet-progress-track::before,
        .dashboard-part1 .dash3-time-card-progress-track::before {
          content: "" !important;
          position: absolute !important;
          inset: 0 !important;
          background: linear-gradient(90deg, rgba(37, 99, 235, 0.12), rgba(20, 184, 166, 0.28), rgba(245, 158, 11, 0.12)) !important;
          background-size: 240% 100% !important;
          animation: dash3-progress-flow 4.8s linear infinite !important;
        }

        .dashboard-part1 .dash3-wallet-progress-track i,
        .dashboard-part1 .dash3-time-card-progress-track i {
          position: relative !important;
          z-index: 1 !important;
          background: linear-gradient(90deg, #2563eb, #14b8a6, #f59e0b) !important;
          background-size: 220% 100% !important;
          animation: dash3-progress-wave 3.2s ease-in-out infinite !important;
          box-shadow: 0 0 18px rgba(59, 130, 246, 0.24) !important;
        }

        .dash3-exchange-grid-two {
          grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        }

        .dash3-model-summary-layer {
          margin-top: 14px !important;
        }

        @keyframes dash3-progress-flow {
          0% { background-position: 0% 0%; }
          100% { background-position: 240% 0%; }
        }

        @keyframes dash3-progress-wave {
          0%, 100% { filter: saturate(0.95) brightness(0.98); }
          50% { filter: saturate(1.15) brightness(1.08); }
        }

        .dashboard-part1 .dash3-asset-card:not(.dash3-asset-card-primary):not(.dash3-live-call) > strong {
          display: block !important;
          min-width: 0 !important;
          margin: 0 !important;
        }

        .dashboard-part1 .dash3-asset-card:not(.dash3-asset-card-primary):not(.dash3-live-call) > strong .dash3-metric-inline {
          display: inline-flex !important;
          width: min-content !important;
          max-width: 100% !important;
          align-items: baseline !important;
          gap: 6px !important;
          white-space: nowrap !important;
          line-height: 1 !important;
        }

        .dashboard-part1 .dash3-asset-card:not(.dash3-asset-card-primary):not(.dash3-live-call) > strong .dash3-metric-prefix {
          color: var(--dash-sub) !important;
          font-size: clamp(20px, 1.6vw, 26px) !important;
          font-weight: 780 !important;
          line-height: 1 !important;
        }

        .dashboard-part1 .dash3-asset-card:not(.dash3-asset-card-primary):not(.dash3-live-call) > strong .dash3-metric-number {
          color: var(--dash-readable-number, var(--dash-text)) !important;
          font-size: clamp(42px, 3.3vw, 58px) !important;
          font-weight: 850 !important;
          letter-spacing: 0 !important;
          line-height: 0.95 !important;
          font-family: inherit !important;
          font-variant-numeric: tabular-nums !important;
          font-feature-settings: "tnum" !important;
        }

        .dashboard-part1 .wallet-progress-card {
          border-color: var(--card-border-light, rgba(15, 23, 42, 0.08)) !important;
          border-radius: 24px !important;
          background:
            radial-gradient(circle at 88% 0%, rgba(99, 102, 241, 0.08), transparent 30%),
            var(--page-card-bg, rgba(255, 255, 255, 0.86)) !important;
          box-shadow: var(--card-shadow-light, 0 12px 40px rgba(15, 23, 42, 0.06)) !important;
        }

        .dash3-shell .dash3-forecast-metrics article {
          display: grid !important;
          grid-template-rows: auto minmax(52px, auto) auto !important;
          align-content: center !important;
          min-height: 154px !important;
          gap: 10px !important;
        }

        .dash3-shell .dash3-forecast-metrics .prediction-stat-value {
          display: flex !important;
          min-height: 52px !important;
          align-items: center !important;
          color: var(--dash-readable-number) !important;
          font-size: inherit !important;
          font-weight: 760 !important;
          line-height: 1 !important;
          letter-spacing: 0 !important;
          font-variant-numeric: tabular-nums !important;
          font-feature-settings: "tnum" !important;
          white-space: nowrap !important;
        }

        .dash3-shell .dash3-forecast-metrics .prediction-stat-value .dash3-metric-inline {
          display: inline-flex !important;
          align-items: baseline !important;
          gap: 6px !important;
          line-height: 1 !important;
          white-space: nowrap !important;
        }

        .dash3-shell .dash3-forecast-metrics .prediction-stat-value .dash3-metric-number {
          color: var(--dash-readable-number) !important;
          font-size: 44px !important;
          font-weight: 760 !important;
          line-height: 1 !important;
          letter-spacing: -0.018em !important;
          font-family: inherit !important;
          font-variant-numeric: tabular-nums !important;
          font-feature-settings: "tnum" !important;
        }

        .dash3-shell .dash3-forecast-metrics .prediction-stat-value .dash3-metric-prefix,
        .dash3-shell .dash3-forecast-metrics .prediction-stat-value .dash3-metric-unit {
          color: var(--dash-sub) !important;
          font-size: 16px !important;
          font-weight: 650 !important;
          line-height: 1 !important;
          letter-spacing: 0 !important;
        }

        .token-market-table-head,
        .token-market-row {
          box-sizing: border-box !important;
          display: grid !important;
          grid-template-columns:
            48px
            minmax(188px, 1.35fr)
            minmax(106px, 0.78fr)
            minmax(106px, 0.78fr)
            minmax(100px, 0.72fr)
            minmax(94px, 0.68fr)
            minmax(94px, 0.68fr)
            minmax(150px, 0.95fr)
            minmax(94px, 0.68fr)
            minmax(78px, 0.56fr) !important;
          column-gap: 14px !important;
          align-items: center !important;
        }

        .token-market-table-head {
          height: 44px !important;
          margin: 0 8px !important;
          padding: 0 14px !important;
        }

        .token-market-row {
          height: 72px !important;
          min-height: 72px !important;
          max-height: 72px !important;
          padding: 0 14px !important;
        }

        .token-market-table-head > span,
        .token-market-row > span {
          display: flex !important;
          min-width: 0 !important;
          height: 100% !important;
          align-items: center !important;
          align-self: center !important;
        }

        .token-market-table-head > span:first-child,
        .token-market-row > span:first-child {
          justify-content: center !important;
          text-align: center !important;
        }

        .token-market-table-head > span:nth-child(n+3),
        .token-market-row > span:nth-child(n+3) {
          justify-content: flex-end !important;
          text-align: right !important;
        }

        .token-market-table-head > span:nth-child(8),
        .token-market-row > span:nth-child(8) {
          justify-content: center !important;
          text-align: center !important;
        }

        .token-market-model-cell {
          align-items: center !important;
          justify-content: flex-start !important;
          text-align: left !important;
        }

        .token-market-model-cell > span {
          min-width: 0 !important;
        }

        .token-market-model-cell strong,
        .token-market-model-cell small {
          display: block !important;
          max-width: 100% !important;
          overflow: hidden !important;
          text-overflow: ellipsis !important;
          white-space: nowrap !important;
        }

        .token-market-price-pair,
        .token-market-number,
        .token-market-change,
        .token-market-change-percent,
        .token-market-saving,
        .token-market-saving-percent {
          align-items: flex-end !important;
          justify-content: center !important;
          text-align: right !important;
          font-variant-numeric: tabular-nums !important;
          font-feature-settings: "tnum" !important;
        }

        .token-market-change b {
          min-width: 72px !important;
          font-variant-numeric: tabular-nums !important;
          font-feature-settings: "tnum" !important;
        }

        .token-market-chart {
          height: 72px !important;
          min-height: 72px !important;
          align-items: center !important;
          justify-content: center !important;
          justify-self: center !important;
        }

        .token-market-chart .mini-metric-chart {
          width: 140px !important;
          height: 36px !important;
          margin: 0 !important;
          overflow: visible !important;
        }

        .token-market-chart .mini-metric-chart svg {
          display: block !important;
          width: 100% !important;
          height: 100% !important;
        }

        .token-market-summary article {
          display: grid !important;
          grid-template-rows: auto minmax(62px, auto) auto !important;
          align-content: center !important;
          min-height: 148px !important;
          gap: 8px !important;
        }

        .token-market-summary strong,
        .token-market-summary-value {
          display: flex !important;
          min-height: 62px !important;
          align-items: baseline !important;
          gap: 6px !important;
          margin: 0 !important;
          color: var(--dash-readable-number, var(--dash-text)) !important;
          font-size: clamp(42px, 3.3vw, 58px) !important;
          font-weight: 850 !important;
          line-height: 0.95 !important;
          letter-spacing: 0 !important;
          font-family: inherit !important;
          font-variant-numeric: tabular-nums !important;
          font-feature-settings: "tnum" !important;
          white-space: nowrap !important;
        }

        .token-market-summary-value .live-number,
        .token-market-summary-value .live-number-value {
          color: inherit !important;
          font: inherit !important;
          line-height: inherit !important;
          letter-spacing: inherit !important;
        }

        .token-market-summary-prefix,
        .token-market-summary-unit {
          color: var(--dash-sub) !important;
          font-size: clamp(20px, 1.6vw, 26px) !important;
          font-weight: 780 !important;
          line-height: 1 !important;
          letter-spacing: 0 !important;
        }

        .token-market-summary-value.is-empty {
          align-items: center !important;
          color: var(--dash-sub) !important;
          font-size: 18px !important;
          font-weight: 850 !important;
          line-height: 1.2 !important;
        }

        .token-market-summary article > span,
        .token-market-summary p {
          margin: 0 !important;
        }

        .dashboard-portrait-top {
          display: grid;
          gap: 22px;
          margin: 48px 0 42px;
        }

        .profile-ai-pair {
          display: grid;
          grid-template-columns: minmax(360px, 0.92fr) minmax(0, 1.08fr);
          gap: 26px;
          align-items: stretch;
          min-width: 0;
        }

        .profile-ai-card,
        .activity-heatmap-card {
          min-width: 0;
          border: 1px solid var(--dash-border);
          border-radius: 24px;
          background:
            radial-gradient(circle at 10% 0%, rgba(99, 102, 241, 0.18), transparent 36%),
            radial-gradient(circle at 100% 0%, rgba(34, 211, 238, 0.08), transparent 32%),
            var(--dash-card-bg);
          box-shadow: 0 22px 70px rgba(15, 23, 42, 0.14);
        }

        .profile-ai-card {
          display: grid;
          gap: 18px;
          padding: 26px;
        }

        .profile-ai-card-top {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          gap: 16px;
          align-items: center;
          min-width: 0;
        }

        .profile-ai-avatar {
          display: grid;
          width: 78px;
          height: 78px;
          place-items: center;
          border: 1px solid rgba(129, 140, 248, 0.32);
          border-radius: 24px;
          background: linear-gradient(135deg, rgba(99, 102, 241, 0.34), rgba(34, 211, 238, 0.18));
          color: #fff;
          font-size: 30px;
          font-weight: 950;
          box-shadow: 0 16px 42px rgba(99, 102, 241, 0.18);
        }

        .profile-ai-identity {
          min-width: 0;
        }

        .profile-ai-identity span,
        .activity-heatmap-head span {
          color: var(--dash-accent);
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.08em;
        }

        .profile-ai-identity strong {
          display: block;
          margin-top: 5px;
          overflow: hidden;
          color: var(--dash-text);
          font-size: 26px;
          font-weight: 950;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .profile-ai-identity small {
          display: block;
          margin-top: 4px;
          overflow: hidden;
          color: var(--dash-sub);
          font-size: 13px;
          font-weight: 750;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .profile-ai-member,
        .profile-ai-tags span,
        .profile-ai-tags button {
          display: inline-flex;
          min-height: 34px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(129, 140, 248, 0.28);
          border-radius: 999px;
          background: rgba(99, 102, 241, 0.12);
          color: var(--dash-text);
          font-family: inherit;
          font-size: 12px;
          font-weight: 900;
          white-space: nowrap;
        }

        .profile-ai-member {
          padding: 0 13px;
          cursor: pointer;
        }

        .profile-ai-member.is-member {
          border-color: rgba(250, 204, 21, 0.34);
          background: linear-gradient(135deg, rgba(250, 204, 21, 0.18), rgba(99, 102, 241, 0.18));
          color: #facc15;
        }

        .profile-ai-source,
        .activity-heatmap-source {
          display: inline-flex;
          width: fit-content;
          min-height: 28px;
          align-items: center;
          padding: 0 10px;
          border: 1px solid rgba(129, 140, 248, 0.26);
          border-radius: 999px;
          background: rgba(99, 102, 241, 0.1);
          color: var(--dash-sub);
          font-size: 12px;
          font-weight: 850;
        }

        .profile-ai-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .profile-ai-tags span,
        .profile-ai-tags button {
          padding: 0 12px;
        }

        .profile-ai-tags .active,
        .profile-ai-tags button.active {
          border-color: rgba(34, 197, 94, 0.34);
          background: rgba(34, 197, 94, 0.12);
          color: var(--dash-green);
        }

        .profile-ai-desc {
          margin: 0;
          color: var(--dash-sub);
          font-size: 14px;
          line-height: 1.7;
        }

        .profile-ai-main {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 12px;
          padding-top: 16px;
          border-top: 1px solid var(--dash-border);
        }

        .profile-ai-balance,
        .profile-ai-calls,
        .profile-ai-models button,
        .profile-ai-models > div {
          min-width: 0;
          border: 1px solid var(--dash-border);
          border-radius: 18px;
          background: rgba(15, 23, 42, 0.12);
        }

        .profile-ai-balance,
        .profile-ai-calls {
          display: grid;
          gap: 9px;
          padding: 16px;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }

        .profile-ai-balance span,
        .profile-ai-calls span,
        .profile-ai-models span,
        .profile-ai-empty p {
          color: var(--dash-sub);
          font-size: 12px;
          font-weight: 850;
        }

        .profile-ai-balance strong,
        .profile-ai-calls strong {
          display: flex;
          align-items: baseline;
          gap: 6px;
          color: var(--dash-readable-number);
          font-size: clamp(30px, 2.6vw, 42px);
          font-weight: 850;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }

        .profile-ai-calls strong .live-number {
          color: inherit;
          font-size: inherit;
          font-weight: inherit;
          line-height: inherit;
          letter-spacing: -0.018em;
        }

        .profile-ai-calls strong small {
          color: var(--dash-sub);
          font-size: 0.48em;
          font-weight: 700;
          line-height: 1;
        }

        .profile-ai-models {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }

        .profile-ai-models button,
        .profile-ai-models > div {
          display: grid;
          gap: 8px;
          padding: 14px;
          color: inherit;
          text-align: left;
        }

        .profile-ai-models b {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 8px;
          color: var(--dash-text);
          font-style: normal;
          font-weight: 920;
        }

        .profile-ai-models em {
          min-width: 0;
          overflow: hidden;
          font-style: normal;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .profile-ai-models small {
          color: var(--dash-sub);
          font-size: 12px;
          font-weight: 750;
        }

        .profile-ai-models strong {
          color: var(--dash-readable-number);
          font-size: 20px;
          font-weight: 900;
        }

        .profile-ai-empty {
          display: grid;
          gap: 10px;
          padding: 18px;
          border: 1px dashed var(--dash-border);
          border-radius: 18px;
        }

        .profile-ai-empty strong {
          color: var(--dash-text);
          font-size: 18px;
          font-weight: 950;
        }

        .profile-ai-empty div {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
        }

        .profile-ai-empty a {
          min-height: 36px;
          padding: 0 12px;
          border: 1px solid rgba(129, 140, 248, 0.28);
          border-radius: 999px;
          color: var(--dash-text);
          display: inline-flex;
          align-items: center;
          text-decoration: none;
          font-size: 12px;
          font-weight: 900;
        }

        .activity-heatmap-card {
          display: grid;
          gap: 18px;
          padding: 26px;
          min-height: 520px;
          contain: layout paint;
        }

        .activity-heatmap-head {
          display: flex;
          justify-content: space-between;
          gap: 18px;
          align-items: flex-start;
        }

        .activity-heatmap-head h2 {
          margin: 5px 0 8px;
          color: var(--dash-text);
          font-size: 26px;
          font-weight: 950;
        }

        .activity-heatmap-head p {
          margin: 0;
          color: var(--dash-sub);
          font-size: 14px;
          line-height: 1.6;
        }

        .activity-heatmap-month {
          display: inline-flex;
          flex: none;
          align-items: center;
          gap: 8px;
          padding: 7px;
          border: 1px solid var(--dash-border);
          border-radius: 999px;
          background: rgba(15, 23, 42, 0.14);
        }

        .activity-heatmap-month button {
          width: 30px;
          height: 30px;
          border: 0;
          border-radius: 999px;
          background: rgba(99, 102, 241, 0.16);
          color: var(--dash-text);
          font-size: 20px;
          cursor: pointer;
        }

        .activity-heatmap-month strong {
          color: var(--dash-text);
          font-size: 13px;
          font-weight: 900;
          white-space: nowrap;
        }

        .activity-heatmap-grid-wrap {
          position: relative;
          overflow-x: auto;
          padding: 6px 4px 12px;
        }

        .activity-heatmap-weekdays,
        .activity-heatmap-week {
          display: grid;
          grid-template-columns: repeat(7, 42px);
          justify-content: center;
          gap: 8px;
          min-width: 0;
        }

        .activity-heatmap-weekdays {
          margin-bottom: 8px;
        }

        .activity-heatmap-weekdays span {
          color: var(--dash-sub);
          font-size: 12px;
          font-weight: 850;
          text-align: center;
        }

        .activity-heatmap-grid {
          display: grid;
          gap: 8px;
        }

        .activity-heatmap-cell {
          display: grid;
          width: 42px;
          height: 42px;
          aspect-ratio: 1;
          place-items: center;
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 10px;
          background: rgba(148, 163, 184, 0.08);
          color: var(--dash-sub);
          font-size: 12px;
          font-weight: 850;
          cursor: pointer;
          transition: background-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
        }

        .activity-heatmap-cell:hover,
        .activity-heatmap-cell:focus-visible {
          transform: translateY(-1px);
          box-shadow: inset 0 0 0 1px rgba(99, 102, 241, 0.45), 0 8px 18px rgba(99, 102, 241, 0.12);
          outline: none;
        }

        .activity-heatmap-cell.is-empty {
          cursor: default;
          opacity: 0.22;
        }

        .activity-heatmap-cell.level-1 { background: rgba(34, 197, 94, 0.16); color: #86efac; }
        .activity-heatmap-cell.level-2 { background: rgba(34, 197, 94, 0.28); color: #bbf7d0; }
        .activity-heatmap-cell.level-3 { background: rgba(16, 185, 129, 0.42); color: #ecfdf5; }
        .activity-heatmap-cell.level-4 { background: rgba(45, 212, 191, 0.58); color: #042f2e; }

        .activity-heatmap-tooltip {
          position: fixed;
          z-index: 1600;
          display: grid;
          gap: 4px;
          min-width: 150px;
          padding: 10px 12px;
          border: 1px solid var(--dash-border);
          border-radius: 12px;
          background: var(--dash-card-bg);
          color: var(--dash-text);
          box-shadow: 0 18px 42px rgba(15, 23, 42, 0.24);
          pointer-events: none;
          transform: translate3d(var(--tooltip-x, 0px), var(--tooltip-y, 0px), 0);
          transition: opacity 0.14s ease, transform 0.12s ease;
          will-change: transform, opacity;
        }

        .activity-heatmap-tooltip strong {
          font-size: 13px;
          font-weight: 950;
        }

        .activity-heatmap-tooltip span {
          color: var(--dash-sub);
          font-size: 12px;
          font-weight: 800;
        }

        .activity-heatmap-legend {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 7px;
          color: var(--dash-sub);
          font-size: 12px;
          font-weight: 850;
        }

        .activity-heatmap-legend i {
          width: 18px;
          height: 18px;
          border-radius: 6px;
          background: rgba(148, 163, 184, 0.08);
        }

        .activity-heatmap-legend .level-1 { background: rgba(34, 197, 94, 0.16); }
        .activity-heatmap-legend .level-2 { background: rgba(34, 197, 94, 0.28); }
        .activity-heatmap-legend .level-3 { background: rgba(16, 185, 129, 0.42); }
        .activity-heatmap-legend .level-4 { background: rgba(45, 212, 191, 0.58); }

        .activity-heatmap-empty {
          display: grid;
          place-items: center;
          min-height: 260px;
          gap: 10px;
          border: 1px dashed var(--dash-border);
          border-radius: 18px;
          text-align: center;
        }

        .activity-heatmap-empty strong {
          color: var(--dash-text);
          font-size: 20px;
          font-weight: 950;
        }

        .activity-heatmap-empty p {
          max-width: 420px;
          margin: 0;
          color: var(--dash-sub);
          line-height: 1.7;
        }

        .activity-day-drawer-layer {
          position: fixed;
          inset: 0;
          z-index: 1500;
          display: flex;
          justify-content: flex-end;
          background: rgba(2, 6, 23, 0.52);
          backdrop-filter: blur(10px);
        }

        .activity-day-drawer {
          width: min(420px, 100vw);
          height: 100%;
          padding: 26px;
          border-left: 1px solid var(--dash-border);
          background: var(--dash-bg);
          color: var(--dash-text);
          box-shadow: -24px 0 80px rgba(2, 6, 23, 0.28);
        }

        .activity-day-drawer > button {
          float: right;
          min-height: 34px;
          padding: 0 12px;
          border: 1px solid var(--dash-border);
          border-radius: 10px;
          background: var(--dash-card-bg);
          color: var(--dash-text);
          font-family: inherit;
          font-weight: 850;
        }

        .activity-day-drawer > span {
          color: var(--dash-accent);
          font-size: 12px;
          font-weight: 950;
          letter-spacing: 0.08em;
        }

        .activity-day-drawer h3 {
          margin: 8px 0 18px;
          font-size: 28px;
          font-weight: 950;
        }

        .activity-day-drawer-grid {
          display: grid;
          gap: 12px;
        }

        .activity-day-drawer-grid article {
          display: grid;
          gap: 8px;
          padding: 16px;
          border: 1px solid var(--dash-border);
          border-radius: 16px;
          background: var(--dash-card-bg);
        }

        .activity-day-drawer-grid span,
        .activity-day-drawer p {
          color: var(--dash-sub);
        }

        .activity-day-drawer-grid strong {
          color: var(--dash-readable-number);
          font-size: 22px;
          font-weight: 900;
          font-variant-numeric: tabular-nums;
        }

        @media (max-width: 1380px) {
          .token-market-row {
            height: auto !important;
            max-height: none !important;
            min-height: 128px !important;
          }
        }

        @media (max-width: 760px) {
          .dashboard-part1 {
            gap: 18px !important;
            margin-bottom: 34px !important;
            padding: 16px !important;
            border-radius: 22px !important;
          }

          .dashboard-part1 .dash3-header {
            grid-template-columns: 1fr !important;
            gap: 14px !important;
          }

          .dashboard-part1 .dash3-header > div:first-child,
          .dashboard-part1 .dash3-header-center,
          .dashboard-part1-heatmap .activity-heatmap-card {
            min-height: auto !important;
            padding: 20px !important;
            border-radius: 18px !important;
          }

          .dashboard-part1 .dash3-header h1 {
            font-size: 34px !important;
          }

          .dashboard-part1 .dash3-companion-head {
            grid-template-columns: 1fr !important;
          }

          .dashboard-part1 .dash3-companion-target {
            justify-items: start !important;
            text-align: left !important;
          }

          .dashboard-part1 .dash3-login-reward-tiers {
            display: flex !important;
            flex-wrap: wrap !important;
          }

          .dashboard-part1-heatmap .activity-heatmap-card {
            align-content: start !important;
          }

          .dashboard-part1-heatmap .activity-heatmap-cell {
            width: 32px !important;
            height: 32px !important;
            min-width: 32px !important;
          }

          .dashboard-part1 .dash3-asset-overview-grid {
            grid-template-columns: 1fr !important;
          }

          .dashboard-part1 .dash3-asset-card,
          .dashboard-part1 .savings-card {
            height: auto !important;
            min-height: 190px !important;
            max-height: none !important;
          }

          .dashboard-portrait-top {
            grid-template-columns: 1fr !important;
            gap: 18px !important;
            margin: 36px 0 34px !important;
          }

          .profile-ai-pair {
            grid-template-columns: 1fr !important;
            gap: 18px !important;
          }

          .profile-ai-card,
          .activity-heatmap-card {
            padding: 20px !important;
            border-radius: 20px !important;
          }

          .profile-ai-card-top,
          .activity-heatmap-head {
            align-items: flex-start !important;
            flex-direction: column !important;
            grid-template-columns: auto minmax(0, 1fr) !important;
          }

          .profile-ai-member {
            grid-column: 1 / -1 !important;
            justify-self: start !important;
          }

          .profile-ai-main,
          .profile-ai-models {
            grid-template-columns: 1fr !important;
          }

          .activity-heatmap-month {
            align-self: flex-start !important;
          }

          .activity-heatmap-weekdays,
          .activity-heatmap-week {
            grid-template-columns: repeat(7, 38px) !important;
            min-width: 0 !important;
            gap: 6px !important;
          }

          .activity-heatmap-cell {
            width: 38px !important;
            height: 38px !important;
          }

          .dash3-shell .dash3-forecast-metrics article {
            min-height: 142px !important;
          }

          .dash3-shell .dash3-forecast-metrics .prediction-stat-value {
            min-height: 48px !important;
          }

          .dash3-shell .dash3-forecast-metrics .prediction-stat-value .dash3-metric-number {
            font-size: 38px !important;
          }

          .token-market-row {
            grid-template-columns: 44px minmax(0, 1fr) !important;
            gap: 10px 12px !important;
            padding: 16px !important;
          }

          .token-market-row > span:nth-child(n+3):not(.token-market-chart) {
            display: grid !important;
            grid-column: 1 / -1 !important;
            grid-template-columns: 92px minmax(0, 1fr) !important;
            gap: 12px !important;
            height: auto !important;
            min-height: 32px !important;
            align-items: center !important;
            justify-content: stretch !important;
            text-align: right !important;
          }

          .token-market-chart {
            grid-column: 1 / -1 !important;
            height: 48px !important;
            min-height: 48px !important;
          }

          .token-market-chart .mini-metric-chart {
            width: min(100%, 180px) !important;
            height: 42px !important;
          }
        }
      `}</style>

      <ConsoleLayout customer={user} currentPath="/dashboard" contentStyle={contentStyle}>
        <div className="dash3-shell">

          {/* ======== Global Tooltip ======== */}
          <DashboardTooltip tooltip={tooltip} theme={theme} />

          {dashboardError ? <div className="dash3-error-banner">{dashboardError}</div> : null}

          <section className="dashboard-part1" aria-label="FlowAPI 首页资产总览">
            <header className="dash3-header">
              <div className="dash3-welcome-card">
                <h1>{dayPeriod}，{userName}</h1>
                <p className="dash3-welcome-copy">AI Token 在流动，FlowAPI 在守护</p>
                <p className="dash3-welcome-meta">统一接入全球先进模型·Token 消耗可视化·企业级稳定性</p>
              </div>
              <div className="dash3-header-center" aria-label="里程碑与登录进度卡片">
                <div className="dash3-companion-head">
                  <div className="dash3-companion-copy">
                    <span className="dash3-companion-copy-label">连续陪伴</span>
                    <p className="dash3-companion-title">
                      <FlowApiBrandText size="sm" animated={false} />
                      <span>已陪伴您</span>
                      <span className="dash3-companion-days">{companionReward.days ?? "--"}</span>
                      <span>天</span>
                    </p>
                  </div>
                  <div className="dash3-companion-target">
                    <span>距离 <b>{companionReward.nextTier?.days ?? 30}</b> 天奖励</span>
                    <strong>还差 <em>{companionReward.remainingDays ?? 0}</em> 天</strong>
                  </div>
                </div>
                <div className="dash3-login-reward">
                  <div className="dash3-login-reward-head">
                    <span>登录奖励进度</span>
                    <strong>{Math.round(companionReward.progress || 0)}%</strong>
                  </div>
                  <div className="dash3-login-reward-track" aria-hidden="true">
                    <i style={{ width: `${Math.max(0, Math.min(100, companionReward.progress || 0))}%` }} />
                    <span className="dash3-login-reward-glow" style={{ left: `calc(${Math.max(2, Math.min(98, companionReward.glowPosition || 0))}% - 10px)` }} />
                  </div>
                  <div className="dash3-login-reward-tiers" aria-label="里程碑奖励节点">
                    {companionReward.milestones.map((tier) => (
                      <span
                        key={tier.key}
                        className={[
                          tier.unlocked ? "active" : "",
                          tier.next ? "next" : "",
                          tier.recurring ? "recurring" : "",
                        ].filter(Boolean).join(" ")}
                      >
                        <span>{tier.next ? "🎁 " : tier.unlocked ? "✓ " : ""}{tier.label}</span>
                        {tier.subLabel ? <small>{tier.subLabel}</small> : null}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
              <div className="dashboard-part1-heatmap" aria-label="活跃热力图">
                <ActivityHeatmapCard
                  calendar={heatmapCalendar}
                  hasData={usage.calls.length > 0}
                  sourceLabel={localDemoMode ? "本地演示数据" : "真实调用数据"}
                  onPreviousMonth={() => {
                    const next = new Date(heatmapYear, heatmapMonth - 1, 1);
                    setHeatmapYear(next.getFullYear());
                    setHeatmapMonth(next.getMonth());
                  }}
                  onNextMonth={() => {
                    const next = new Date(heatmapYear, heatmapMonth + 1, 1);
                    setHeatmapYear(next.getFullYear());
                    setHeatmapMonth(next.getMonth());
                  }}
                />
              </div>
            </header>
          </section>

            <TotalAssetOverviewSection
              data={{
                balance: baseBalance,
                totalRechargeCny: Number(walletData?.wallet?.paidBalanceCny || 0),
                totalConvertedApiCredit: Number(walletData?.wallet?.totalQuotaCny || 0) * DASHBOARD_API_CREDIT_RATE,
                totalGiftApiCredit: Number(walletData?.wallet?.giftBalanceCny || 0) * DASHBOARD_API_CREDIT_RATE,
                todayExpiringApiCredit: Number(walletData?.membership?.dailyBonusTokens || 0) / 10000 * DASHBOARD_API_CREDIT_RATE,
                longTermApiCredit: Number(walletData?.wallet?.remainingQuotaCny || baseBalance) * DASHBOARD_API_CREDIT_RATE,
                totalSpentApiCredit: Number(dashboardStats.totalCost || 0) * DASHBOARD_API_CREDIT_RATE,
                totalTokens: Number(dashboardStats.monthTokens || 0),
                totalSavedApiCredit: Number(totalSavingsCny || 0) * DASHBOARD_API_CREDIT_RATE,
                walletProgressPercent: Number(walletData?.wallet?.progressPercent || 72),
                costMini: dashboardAssetCharts.weekSpend,
                tokenMini: dashboardAssetCharts.tokens,
                savingMini: dashboardAssetCharts.savings,
                recentCalls: recentCallRows,
              }}
              modelConsumptionChart={walletData?.modelConsumptionChart}
              onOpenDetail={setDetailModal}
            />

            <TimeWindowSection
              title="今日"
              windowKey="today"
              stats={timeWindowStats.today}
              onOpenDetail={setDetailModal}
              modelChart={walletData?.modelConsumptionChart}
            />

            <section className="dash3-section">
              <SectionTitle title="模型消耗结构" subtitle="每个模型用独立颜色展示调用分布，方便快速识别高消耗来源。" />
              <ModelConsumptionChartCard data={walletData?.modelConsumptionChart} />
            </section>

            <TimeWindowSection
              title="本周"
              windowKey="week"
              stats={timeWindowStats.week}
              onOpenDetail={setDetailModal}
              modelChart={walletData?.modelConsumptionChart}
            />

            <TimeWindowSection
              title="本月"
              windowKey="month"
              stats={timeWindowStats.month}
              onOpenDetail={setDetailModal}
              modelChart={walletData?.modelConsumptionChart}
            />

            <WalletProgressCard
              mode="dashboard"
              loading={walletLoading}
              empty={!walletLoading && walletData?.source === "empty"}
              balanceCny={Number(walletData?.wallet?.balanceCny ?? user.balance ?? 0)}
              totalQuotaCny={Number(walletData?.wallet?.totalQuotaCny || 0)}
              usedQuotaCny={Number(walletData?.wallet?.usedQuotaCny || 0)}
              remainingQuotaCny={Number(walletData?.wallet?.remainingQuotaCny ?? walletData?.wallet?.balanceCny ?? user.balance ?? 0)}
              totalTokens={walletData?.token?.totalTokens}
              usedTokens={walletData?.token?.usedTokens}
              remainingTokens={walletData?.token?.remainingTokens}
              planName={walletData?.plan?.planName}
              planAmountCny={walletData?.plan?.planAmountCny}
              planStatus={walletData?.plan?.status || "none"}
              startedAt={walletData?.plan?.startedAt}
              expiresAt={walletData?.plan?.expiresAt}
              remainingDays={walletData?.plan?.remainingDays}
              progressPercent={Number(walletData?.wallet?.progressPercent || 0)}
              data={walletData}
              dashboardOverview={usage.overview}
            />

          <CostStabilitySection
            stats={dashboardStats}
            trendData={trendData}
            modelUsage={modelUsage}
            recentRows={recentCallRows}
            onOpenMetric={(metricKey) => setDetailModal(buildMetricDetail(metricKey, { stats: dashboardStats, trendData, modelUsage, recentRows: recentCallRows }))}
            onOpenModel={(model) => setDetailModal(buildModelUsageDetail(model, trendData, recentCallRows))}
          />

          <RecentCallLedger rows={recentCallRows} />

          <TokenForecastDecisionSection
            data={predictionData}
            summary={basePrediction}
            metric={predictionMetric}
            setMetric={setPredictionMetric}
            onTooltip={handleTooltip}
            theme={theme}
            tick={tick}
          />

          <TokenSpendFlowSection
            flow={modelSpend.flow}
            ranking={modelSpend.ranking}
            metric={flowMetric}
            setMetric={setFlowMetric}
            onTooltip={handleTooltip}
            theme={theme}
            onOpenModel={(model) => setDetailModal(buildModelUsageDetail(model, trendData, recentCallRows))}
          />

          <ImageCapabilitySection data={imageSummary} />

          <TokenMarketPanel />

          <SavingsDetailDrawer
            open={savingsOpen}
            onClose={() => setSavingsOpen(false)}
            data={effectiveSavingsData}
            loading={localDemoMode ? false : savingsLoading}
            period={savingsPeriod}
            onPeriodChange={setSavingsPeriod}
          />

          <section className="dash3-section">
            <SectionTitle
              title="模型市场参考"
              subtitle="参考 FlowAPI 站内真实用量和全球模型热度，辅助你选择模型。"
            />
            <div className="model-leaderboard-stack">
              <ModelLeaderboard
                title="FlowAPI 站内模型用量排行"
                subtitle="基于 FlowAPI 用户真实调用数据，展示本站最常被使用的大模型。"
                sourceLabel={localDemoMode ? "FlowAPI · 演示数据" : "FlowAPI · 实时数据"}
                updatedAt={effectiveFlowApiRanks?.updatedAt}
                items={(effectiveFlowApiRanks?.models || []).slice(0, 10)}
                loading={localDemoMode ? false : flowApiRanksLoading}
                emptyText="0"
                emptyDescription="0 次"
                period={flowApiRanksPeriod}
                onPeriodChange={setFlowApiRanksPeriod}
                showTooltip
              />

              <ModelLeaderboard
                title="全球模型目录参考"
                subtitle="同步全球模型目录热度，仅供选型参考。"
                sourceLabel={openRouterSourceLabel}
                updatedAt={null}
                items={(effectiveMarketRanks?.models || []).slice(0, 10)}
                loading={localDemoMode ? false : marketRanksLoading}
                emptyText={marketSyncStatus === "failed" ? "全球模型同步失败" : "0"}
                emptyDescription="0"
              />
            </div>
          </section>

        </div>
      </ConsoleLayout>

      <CardDetailModal
        open={Boolean(detailModal)}
        onClose={() => setDetailModal(null)}
        {...(detailModal || {})}
        actions={<Link href="/api-management">去 API 管理</Link>}
      />
    </>
  );
}
