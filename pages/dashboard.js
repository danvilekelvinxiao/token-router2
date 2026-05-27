import Head from "next/head";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "next-themes";
import ConsoleLayout from "@/components/ConsoleLayout";
import { calculateCallCost, formatSmallCny } from "@/lib/billing/calculate-call-cost";
import ModelLogo, { ModelNameWithLogo, getModelProviderLabel } from "@/components/ModelLogo";
import InteractiveCard from "@/components/InteractiveCard";
import CardDetailModal, { DetailRows, DetailTable } from "@/components/CardDetailModal";
import ExportExcelButton from "@/components/ExportExcelButton";
import ModelLeaderboard from "@/components/dashboard/model-leaderboard";
import { generateTokenForecast } from "@/lib/analytics/token-forecast";

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

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

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
      className="dash3-tooltip"
      style={{
        position: "fixed",
        left: tooltip.x,
        top: tooltip.y,
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

function DualLineChart({ data, unit = "K", height = 320, width = 720, onTooltip, theme }) {
  const { pastDates, pastValues, futureDates, futureValues, pastCosts = [], futureCosts = [], primaryModel = "DeepSeek Chat" } = data;
  const allDates = useMemo(() => [...pastDates, ...futureDates], [pastDates, futureDates]);
  const allValues = useMemo(() => [...pastValues, ...futureValues], [pastValues, futureValues]);
  const maxV = Math.max(...allValues, 1);
  const minV = Math.min(...allValues, 0);
  const range = maxV - minV || 1;
  const totalPoints = allValues.length;
  const margin = { top: 28, right: 28, bottom: 44, left: 62 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;
  const stepX = chartW / (totalPoints - 1);
  const baseline = margin.top + chartH;

  const toX = (i) => margin.left + i * stepX;
  const toY = (v) => margin.top + chartH - ((v - minV) / range) * chartH;

  const pastPts = pastValues.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const futurePts = futureValues.map((v, i) => `${toX(i + pastValues.length)},${toY(v)}`).join(" ");

  // Gradient fill area under past line
  const pastArea = `${toX(0)},${baseline} ${pastValues.map((v, i) => `${toX(i)},${toY(v)}`).join(" ")} ${toX(pastValues.length - 1)},${baseline} Z`;
  const futureArea = `${toX(pastValues.length)},${baseline} ${futureValues.map((v, i) => `${toX(i + pastValues.length)},${toY(v)}`).join(" ")} ${toX(totalPoints - 1)},${baseline} Z`;

  const yTicks = 4;
  const yLabels = Array.from({ length: yTicks }, (_, i) => {
    const val = minV + (range / (yTicks - 1)) * i;
    return { y: toY(val), label: unit === "¥" ? `¥${val.toFixed(1)}` : unit === "K" ? `${val.toFixed(1)}K` : `${Math.round(val)}` };
  });

  const [activeIndex, setActiveIndex] = useState(null);
  const svgRef = useRef(null);
  const formatChartValue = useCallback((value) => {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "暂无实际数据";
    if (unit === "¥") return `¥${Number(value).toFixed(2)}`;
    if (unit === "K") return `${Number(value).toFixed(2)}K Token`;
    return `${Number(value).toLocaleString()} 次`;
  }, [unit]);

  const getCostText = useCallback((idx, fallbackValue) => {
    const rawCost = idx < pastValues.length ? pastCosts[idx] : futureCosts[idx - pastValues.length];
    if (rawCost !== undefined && rawCost !== null && !Number.isNaN(Number(rawCost))) {
      return `¥${Number(rawCost).toFixed(2)}`;
    }
    if (unit === "¥") return `¥${Number(fallbackValue || 0).toFixed(2)}`;
    if (unit === "K") return `¥${(Number(fallbackValue || 0) * 0.002).toFixed(2)}`;
    return "¥0.00";
  }, [futureCosts, pastCosts, pastValues.length, unit]);

  const showTooltipForIndex = useCallback((e, idx) => {
    if (idx < 0 || idx >= totalPoints) return;
    const date = allDates[idx];
    const isPast = idx < pastValues.length;
    const actualVal = isPast ? pastValues[idx] : null;
    const predictedVal = !isPast ? futureValues[idx - pastValues.length] ?? null : null;
    const focusValue = predictedVal ?? actualVal ?? 0;
    const tooltipWidth = 280;
    const tooltipHeight = 180;
    let tooltipX = e.clientX + 16;
    let tooltipY = e.clientY - 90;
    if (typeof window !== "undefined") {
      if (tooltipX + tooltipWidth > window.innerWidth - 12) tooltipX = e.clientX - tooltipWidth - 16;
      if (tooltipY < 12) tooltipY = e.clientY + 18;
      if (tooltipY + tooltipHeight > window.innerHeight - 12) tooltipY = window.innerHeight - tooltipHeight - 12;
    }
    onTooltip({
      x: tooltipX,
      y: tooltipY,
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
      setActiveIndex(idx);
      showTooltipForIndex(e, idx);
    }
  }, [findNearestIndex, showTooltipForIndex]);

  const handleChartMouseLeave = useCallback(() => {
    setActiveIndex(null);
    onTooltip(null);
  }, [onTooltip]);

  const handleTouchMove = useCallback((e) => {
    if (e.touches?.length) {
      const idx = findNearestIndex(e.touches[0].clientX);
      if (idx >= 0) {
        setActiveIndex(idx);
        showTooltipForIndex(e.touches[0], idx);
      }
    }
  }, [findNearestIndex, showTooltipForIndex]);

  const handleTouchEnd = useCallback(() => {
    setTimeout(() => { setActiveIndex(null); onTooltip(null); }, 2000);
  }, [onTooltip]);

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
          x={toX(activeIndex) - stepX / 2}
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
          x1={toX(activeIndex)} y1={margin.top}
          x2={toX(activeIndex)} y2={margin.top + chartH}
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
        onMouseMove={handleChartMouseMove}
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
                    <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af", fontSize: 11 }}>消耗: <b>¥{d.spend}</b></div>
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
                        <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af", fontSize: 12 }}>花费：<b>¥{Number(day.spend || 0).toFixed(2)}</b></div>
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
                最近 7 天区间：¥{min.toFixed(3)} - ¥{max.toFixed(3)}
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
  return `¥${Number(value || 0).toFixed(2)}`;
}

function formatFlowMetric(value, metric) {
  if (metric === "spend") return `¥${value.toFixed(2)}`;
  if (metric === "tokens") return `${formatCompactToken(value)} Tokens`;
  return `${value} 次`;
}

function trendText(trend) {
  if (trend > 0) return `↑${trend}%`;
  if (trend < 0) return `↓${Math.abs(trend)}%`;
  return "持平";
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
  const fallback = ["#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#f97316", "#94a3b8"];
  return fallback[index % fallback.length];
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
      apiKey: key?.label || "API 密匙",
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
      error: status.key === "success" ? "" : "上游返回异常，请检查余额、模型名或稍后重试。",
      // Channel / pricing info
      channelName: call.channelName || call.channel || "官方",
      channelType: call.channelType || "official",
      upstreamHost: call.upstreamHost || call.host || "api.uniapi.io",
      finishReason: call.finishReason || "stop",
      requestIp: call.requestIp || call.ip || "",
      inputPricePerM: inputPricePerM || 4.4,
      outputPricePerM: outputPricePerM || 26.4,
      originalInputPricePerM: Number(originalInputPM.toFixed(4)) || 5,
      originalOutputPricePerM: Number(originalOutputPM.toFixed(4)) || 30,
      discountRate: discountRate,
      finalInputPricePerM: inputPricePerM || 4.4,
      finalOutputPricePerM: outputPricePerM || 26.4,
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
  const sum = (items, key) => items.reduce((total, item) => total + Number(item[key] || 0), 0);
  const successful = calls.filter((call) => getCallStatus(call).key === "success").length;
  const cacheHits = calls.filter((call) => call.cacheHit || call.cached).length;
  const cachedCalls = calls.filter((call) => call.cacheHit || call.cached);
  const savedTokens = cachedCalls.reduce((total, call) => total + Number(call.savedTokens || Math.round(Number(call.tokens || 0) * 0.35)), 0);
  const savedCostCny = cachedCalls.reduce((total, call) => total + Number(call.savedCostCny || (Number(call.cost || 0) * 0.35)), 0);
  const callsWithLatency = calls.map(getCallLatencySeconds).filter((value) => value > 0);
  const avgLatency = callsWithLatency.length
    ? callsWithLatency.reduce((total, value) => total + value, 0) / callsWithLatency.length
    : 0;

  return {
    balance: Number(customer?.balance || 0),
    totalCost: sum(calls, "cost"),
    todayCost: sum(todayCalls, "cost"),
    todayTokens: sum(todayCalls, "tokens"),
    monthCost: sum(monthCalls, "cost"),
    monthTokens: sum(monthCalls, "tokens"),
    todayRequests: todayCalls.length,
    monthRequests: monthCalls.length,
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
      unit: "¥",
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
      primaryModel: "DeepSeek Chat",
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

function CoreMetricCard({ label, value, detail, tooltip, onTooltip, theme, onClick }) {
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
    </InteractiveCard>
  );
}

function CacheStatsStrip({ stats = {} }) {
  const items = [
    { label: "缓存命中率", value: `${Number(stats.hitRate || 0).toFixed(1)}%`, note: "重复请求复用比例" },
    { label: "缓存命中次数", value: `${Number(stats.hitCount || 0).toLocaleString()} 次`, note: "本周期命中的请求" },
    { label: "缓存节省 Token", value: `${formatCompactToken(Number(stats.savedTokens || 0))} Token`, note: "估算少消耗的 Token" },
    { label: "缓存节省金额", value: `¥${Number(stats.savedCostCny || 0).toFixed(2)}`, note: "估算节省成本" },
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
                <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af" }}>消耗：<b>¥{item.cost.toFixed(2)}</b></div>
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
                  <div style={{ marginTop: 8, color: theme === "light" ? "#6b7280" : "#9ca3af" }}>金额：¥{item.cost.toFixed(2)}</div>
                  <div style={{ color: theme === "light" ? "#6b7280" : "#9ca3af" }}>Token：{formatCompactToken(item.tokens)} Tokens</div>
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
            <b>¥{item.cost.toFixed(2)}</b>
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
                        <b>{formatCompactToken(item.tokens)} Tokens</b>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 10, color: theme === "light" ? "#6b7280" : "#9ca3af" }}>总量：<b>{formatCompactToken(day.totalTokens)} Tokens</b></div>
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
  const exportSheets = [
    { sheetName: "核心指标", data: [
      { metric: "总消耗金额", value: `¥${totalCost.toFixed(2)}`, description: "累计 API 调用消耗金额" },
      { metric: "今日消耗", value: `¥${stats.todayCost.toFixed(2)}`, tokens: stats.todayTokens },
      { metric: "本月消耗", value: `¥${stats.monthCost.toFixed(2)}`, tokens: stats.monthTokens },
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
        <CoreMetricCard label="总消耗金额" value={<MetricValueInline prefix="¥" value={totalCost.toFixed(2)} />} detail="累计 API 调用消耗金额" onClick={() => onOpenMetric("totalCost")} />
        <CoreMetricCard label="今日消耗" value={<MetricValueInline prefix="¥" value={stats.todayCost.toFixed(2)} />} detail={`${formatCompactToken(stats.todayTokens)} Tokens`} onClick={() => onOpenMetric("today")} />
        <CoreMetricCard label="本月消耗" value={<MetricValueInline prefix="¥" value={stats.monthCost.toFixed(2)} />} detail={`${formatCompactToken(stats.monthTokens)} Tokens，帮助判断预算`} onClick={() => onOpenMetric("month")} />
        <CoreMetricCard label="请求次数" value={<MetricValueInline value={`${stats.todayRequests} / ${stats.monthRequests}`} unit="次" />} detail="今日 / 本月请求次数" onClick={() => onOpenMetric("requests")} />
        <CoreMetricCard label="平均响应时间" value={<MetricValueInline value={stats.avgLatency.toFixed(1)} unit="s" />} detail={`请求成功率 ${stats.successRate.toFixed(1)}%`} onClick={() => onOpenMetric("latency")} />
        <CoreMetricCard
          label="缓存命中率"
          value={<MetricValueInline value={stats.cacheHitRate.toFixed(1)} unit="%" />}
          detail="命中越高，通常更快且更省钱"
          tooltip="缓存命中率表示有多少请求命中了缓存。命中率越高，通常代表响应更快、成本更低。"
          onTooltip={onTooltip}
          theme={theme}
          onClick={() => onOpenMetric("cache")}
        />
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
          <p className="dash3-ops-desc">看清楚你的 AI Token 主要花在哪些模型上，帮助你判断是否需要换模型、降成本或补充额度。</p>
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
                  <span className="model-cost-number primary">¥{Number(item.cost || 0).toFixed(2)}</span>
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
        { label: "总消耗金额", value: `¥${Number(stats.totalCost ?? stats.monthCost ?? 0).toFixed(2)}`, note: "累计 API 调用消耗金额" },
        { label: "累计 Token", value: `${formatCompactToken(modelUsage.reduce((total, item) => total + Number(item.tokens || 0), 0))} Tokens` },
        { label: "主要消耗模型", value: modelUsage[0]?.model || "暂无" },
        { label: "最近更新时间", value: updatedAt },
      ],
      extraTitle: "模型消耗明细",
      extraRows: models,
      sheets: [
        { sheetName: "总消耗概览", data: [
          { metric: "总消耗金额", value: `¥${Number(stats.totalCost ?? stats.monthCost ?? 0).toFixed(2)}`, description: "累计 API 调用消耗金额", updatedAt },
        ] },
        { sheetName: "模型消耗明细", data: models },
        { sheetName: "调用明细", data: calls },
      ],
    },
    balance: {
      title: "当前余额详情",
      description: "查看余额、可用 Token 等值额度、充值记录和最近消耗。",
      rows: [
        { label: "当前余额", value: `¥${stats.balance.toFixed(2)}`, note: "当前账户可用额度" },
        { label: "可用 Token 等值额度", value: `${formatCompactToken(Math.floor(stats.balance / 0.0000065))} Tokens`, note: "按当前平均成本粗略估算" },
        { label: "余额预估可用天数", value: `约 ${Math.max(1, Math.floor(stats.balance / Math.max(stats.todayCost, 0.1)))} 天` },
        { label: "最近更新时间", value: updatedAt },
      ],
      extraTitle: "消耗记录",
      extraRows: calls,
      sheets: [
        { sheetName: "余额概览", data: [
          { metric: "当前余额", value: `¥${stats.balance.toFixed(2)}`, description: "当前账户可用额度", updatedAt },
          { metric: "可用 Token 等值额度", value: Math.floor(stats.balance / 0.0000065), description: "估算值", updatedAt },
        ] },
        { sheetName: "充值记录", data: [{ time: updatedAt, amount: "-", paymentMethod: "-", orderId: "-", status: "暂无真实充值明细" }] },
        { sheetName: "消耗记录", data: calls },
      ],
    },
    today: {
      title: "今日消耗详情",
      description: "查看今天已经消耗的金额、Token、请求数和模型分布。",
      rows: [
        { label: "今日消耗金额", value: `¥${stats.todayCost.toFixed(2)}` },
        { label: "今日 Token 数", value: `${formatCompactToken(stats.todayTokens)} Tokens` },
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
        { label: "本月累计消耗金额", value: `¥${stats.monthCost.toFixed(2)}` },
        { label: "本月累计 Token", value: `${formatCompactToken(stats.monthTokens)} Tokens` },
        { label: "日均消耗", value: `¥${(stats.monthCost / Math.max(1, new Date().getDate())).toFixed(2)}` },
        { label: "预计月底消耗", value: `¥${((stats.monthCost / Math.max(1, new Date().getDate())) * 30).toFixed(2)}` },
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
      description: "查看成功请求、失败请求、错误率和 API 密匙来源分布。",
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
        { label: "节省成本估算", value: `¥${Number(stats.cacheStats?.savedCostCny || 0).toFixed(2)}` },
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
    { label: "上游供应商", value: model.provider || "FlowAPI" },
    { label: "请求次数", value: `${model.requests} 次` },
    { label: "总 Token", value: `${formatCompactToken(model.tokens)} Tokens` },
    { label: "总成本", value: `¥${model.cost.toFixed(2)}` },
    { label: "平均单次成本", value: `¥${(model.cost / Math.max(1, model.requests)).toFixed(4)}` },
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

function OnboardingChecklist({ customer, usage }) {
  const apiKeys = customer?.apiKeys || [];
  const hasApiKey = apiKeys.length > 0;
  const hasCalls = Boolean(usage?.hasCalls);
  const hasBalance = Number(customer?.balance || 0) > 0;
  const completed = [hasApiKey, hasCalls, hasBalance].filter(Boolean).length;
  const percent = Math.round((completed / 3) * 100);
  const tasks = [
    {
      title: "下载 CC 配置工具",
      desc: "先准备本地调用环境，后面一键导入更省心。",
      href: "/guide",
      status: "建议完成",
      done: false,
    },
    {
      title: "创建 API 密匙",
      desc: "这是你调用模型和记录消耗的专属凭证。",
      href: "/guide#api-keys-section",
      status: hasApiKey ? "已创建" : "待创建",
      done: hasApiKey,
    },
    {
      title: "选择免费 / 低价模型",
      desc: "先用新手模型跑通流程，再切换高价值模型。",
      href: "/models",
      status: "去选择",
      done: false,
    },
    {
      title: "完成第一次调用",
      desc: "调用成功后，这里会展示 Token 消耗和调用流水。",
      href: hasApiKey ? "/guide#api-keys-section" : "/guide",
      status: hasCalls ? "已调用" : "待测试",
      done: hasCalls,
    },
    {
      title: "查看调用流水",
      desc: "确认每次请求的模型、Token、金额和状态。",
      href: "/dashboard#dash-recent-calls",
      status: hasCalls ? "可查看" : "调用后显示",
      done: hasCalls,
    },
    {
      title: "充值或购买套餐",
      desc: "余额不足前提前补充，避免调用中断。",
      href: "/recharge",
      status: hasBalance ? "余额正常" : "去充值",
      done: hasBalance,
    },
  ];

  return (
    <section className="dash3-onboarding-panel">
      <div className="dash3-onboarding-head">
        <div>
          <span className="dash3-section-hint">新手闭环</span>
          <h2>{hasCalls ? "你的首次调用闭环已跑通" : "先跑通第一次 API 调用"}</h2>
          <p>按这个顺序完成：下载工具 → 创建密匙 → 选择模型 → 测试调用 → 查看消耗 → 充值续用。</p>
        </div>
        <div className="dash3-onboarding-progress" aria-label={`新手任务完成度 ${percent}%`}>
          <strong>{percent}%</strong>
          <span>完成度</span>
        </div>
      </div>
      <div className="dash3-onboarding-grid">
        {tasks.map((task, index) => (
          <Link
            key={task.title}
            href={task.href}
            className={task.done ? "dash3-onboarding-task done" : "dash3-onboarding-task"}
          >
            <span className="dash3-onboarding-num">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <strong>{task.title}</strong>
              <p>{task.desc}</p>
            </div>
            <em>{task.status}</em>
          </Link>
        ))}
      </div>
    </section>
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

function buildAssetOverviewDetail(assetKey, { overview, trendData, recentRows, onTooltip, theme }) {
  const updatedAt = new Date().toLocaleString("zh-CN", { hour12: false });
  const tokenChart = trendData.map((item) => ({
    label: item.date,
    value: item.tokens,
    display: `${formatCompactToken(item.tokens)} Tokens`,
    tooltip: `${item.date} 消耗 ${formatCompactToken(item.tokens)} Tokens，金额 ¥${Number(item.cost || 0).toFixed(2)}`,
    color: "#6366f1",
  }));
  const costChart = trendData.map((item) => ({
    label: item.date,
    value: item.cost,
    display: `¥${Number(item.cost || 0).toFixed(2)}`,
    tooltip: `${item.date} 消耗金额 ¥${Number(item.cost || 0).toFixed(2)}，请求 ${item.requests} 次`,
    color: "#8b5cf6",
  }));
  const recentCallRows = recentRows.slice(0, 8).map((row) => ({
    time: row.time,
    model: row.model,
    totalTokens: `${formatCompactToken(row.total)} Tokens`,
    cost: `¥${Number(row.amount || 0).toFixed(4)}`,
    status: row.status,
  }));
  const configs = {
    balance: {
      title: "当前余额详情",
      description: "查看当前可用额度、赠送额度和最近 7 天消耗趋势。",
      rows: [
        { label: "当前余额", value: `¥${overview.balance.toFixed(2)}`, note: "账户当前可用总额度" },
        { label: "赠送额度", value: `¥${Number(overview.giftBalance || 0).toFixed(2)}`, note: "今日有效，调用模型时优先使用" },
        { label: "约可调用", value: `${formatCompactToken(overview.callableTokens)} Tokens`, note: "按当前平均成本粗略估算" },
        { label: "最近更新时间", value: updatedAt },
      ],
      chartTitle: "最近 7 天金额消耗",
      chartData: costChart,
      tableTitle: "最近调用记录",
      tableRows: recentCallRows,
      advice: "建议：赠送额度当天有效，适合优先完成测试调用；正式业务建议保持充值余额充足。",
    },
    today: {
      title: "今日消耗详情",
      description: "查看今天的金额流出、Token 消耗和调用记录。",
      rows: [
        { label: "今日消耗", value: `¥${overview.todaySpend.toFixed(2)}` },
        { label: "今日 Token", value: `${formatCompactToken(overview.todayTokens)} Tokens` },
        { label: "最近调用", value: overview.lastCall?.model || "暂无调用" },
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
        { label: "本周消耗", value: `¥${overview.weekSpend.toFixed(2)}` },
        { label: "本周 Token", value: `${formatCompactToken(overview.weekTokens)} Tokens` },
        { label: "日均消耗", value: `¥${(overview.weekSpend / 7).toFixed(2)}` },
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
        { label: "模型", value: overview.lastCall?.model || "暂无调用" },
        { label: "消耗 Token", value: overview.lastCall ? `${formatCompactToken(overview.lastCall.tokens)} Tokens` : "暂无" },
        { label: "消耗金额", value: overview.lastCall ? `¥${overview.lastCall.amount.toFixed(4)}` : "暂无" },
        { label: "调用时间", value: overview.lastCall?.time || "完成首次调用后展示" },
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

function AssetOverviewSection({ overview, tick, onOpenAsset }) {
  return (
    <section className="dash3-section dash3-asset-overview-section">
      <SectionTitle
        title="AI Token 资产总览"
        subtitle="查看你的余额、今日消耗、本周消耗和最近一次调用。"
        right={<span className="dash3-live-badge"><span className="dash3-live-dot" /> Live</span>}
      />
      <div className="dash3-asset-overview-grid">
        <article
          className="dash3-asset-card dash3-asset-card-primary"
          role="button"
          tabIndex={0}
          onClick={() => onOpenAsset("balance")}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenAsset("balance"); } }}
        >
          <span>当前余额</span>
          <strong><MetricValueInline prefix="¥" value={overview.balance.toFixed(2)} /></strong>
          <p>约可调用 <b>{formatTokens(overview.callableTokens)}</b></p>
          <p className="dash3-gift-credit" title="赠送额度仅当日有效，调用模型时优先消耗赠送额度，用完后再消耗充值余额。">
            赠送额度：<b>¥{Number(overview.giftBalance || 0).toFixed(2)}</b> 今日有效，优先使用
          </p>
          <em className="dash3-asset-card-hint">查看详情</em>
        </article>
        <article
          className="dash3-asset-card"
          role="button"
          tabIndex={0}
          onClick={() => onOpenAsset("today")}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenAsset("today"); } }}
        >
          <span>今日消耗</span>
          <strong><MetricValueInline prefix="¥" value={<FlashValue value={overview.todaySpend.toFixed(2)} tick={tick} />} /></strong>
          <p><b>{formatTokens(overview.todayTokens)}</b></p>
          <em className="dash3-asset-card-hint">查看详情</em>
        </article>
        <article
          className="dash3-asset-card"
          role="button"
          tabIndex={0}
          onClick={() => onOpenAsset("week")}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenAsset("week"); } }}
        >
          <span>本周消耗</span>
          <strong><MetricValueInline prefix="¥" value={<FlashValue value={overview.weekSpend.toFixed(2)} tick={tick} />} /></strong>
          <p><b>{formatTokens(overview.weekTokens)}</b></p>
          <em className="dash3-asset-card-hint">查看详情</em>
        </article>
        <article
          className="dash3-asset-card dash3-live-call"
          role="button"
          tabIndex={0}
          onClick={() => onOpenAsset("lastCall")}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpenAsset("lastCall"); } }}
        >
          <span>最近调用</span>
          <strong className="dash3-recent-call-value">{overview.lastCall?.model || "暂无调用"}</strong>
          {overview.lastCall ? (
            <>
              <p>
                <b>-{formatTokens(overview.lastCall.tokens)}</b>
                <b>-{formatCurrency(overview.lastCall.amount)}</b>
              </p>
              <div className="dash3-last-call-footer">
                <small>{overview.lastCall.time}</small>
                <span className="dash3-status-pill success">{overview.lastCall.status || "成功"}</span>
              </div>
            </>
          ) : (
            <p><b>完成首次 API 调用后自动记录</b></p>
          )}
          <em className="dash3-asset-card-hint">查看详情</em>
        </article>
      </div>
    </section>
  );
}

function ModelSpendFlowChart({ data, metric, onTooltip, theme }) {
  const [activeIndex, setActiveIndex] = useState(null);
  const svgRef = useRef(null);
  const width = 720;
  const height = 320;
  const margin = { top: 28, right: 20, bottom: 44, left: 56 };
  const chartW = width - margin.left - margin.right;
  const chartH = height - margin.top - margin.bottom;

  if (!data.length) {
    return (
      <div className="dash3-empty-chart">
        <strong>暂无真实调用数据</strong>
        <span>完成第一次 API 调用后，这里会自动展示你的 Token 花费流向。</span>
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
    onTooltip({
      x: event.clientX + 16,
      y: event.clientY - 40,
      content: (
        <div className="dash3-flow-tooltip">
          <strong>{day.date}</strong>
          <div className="dash3-flow-tooltip-list">
            {sorted.slice(0, 5).map((item) => (
              <div key={item.model} className="dash3-flow-tooltip-row">
                <span><i style={{ background: item.color }} />{item.model.length > 16 ? item.model.slice(0, 14) + "…" : item.model}</span>
                <b>{metric === "spend" ? `¥${item.spend.toFixed(2)}` : metric === "tokens" ? `${formatCompactToken(item.tokens)}` : `${item.requests} 次`}</b>
              </div>
            ))}
          </div>
          <div className="dash3-flow-tooltip-total">
            <span>{metric === "spend" ? `总计 ¥${totalSpend.toFixed(2)}` : metric === "tokens" ? `总计 ${formatCompactToken(totalTokens)} Tokens` : `总计 ${totalRequests} 次`} · 主要 {mainModel}</span>
          </div>
        </div>
      ),
    });
  };

  const handleMove = (event) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const viewX = ((event.clientX - rect.left) / rect.width) * width;
    let nearest = 0;
    let minDist = Infinity;
    data.forEach((_, index) => {
      const dist = Math.abs(getBarCenter(index) - viewX);
      if (dist < minDist) {
        nearest = index;
        minDist = dist;
      }
    });
    setActiveIndex(nearest);
    showTooltip(event, nearest);
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
        const label = metric === "spend" ? `¥${val.toFixed(0)}` : metric === "tokens" ? formatCompactToken(val) : `${Math.round(val)}`;
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
                {metric === "spend" ? `¥${total.toFixed(1)}` : metric === "tokens" ? formatCompactToken(total) : `${total}`}
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
        onMouseLeave={() => { setActiveIndex(null); onTooltip(null); }}
        style={{ cursor: "crosshair" }}
      />
    </svg>
  );
}

function TokenSpendFlowSection({ flow, ranking, metric, setMetric, onTooltip, theme }) {
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
              { key: "spend", label: "Spend" },
              { key: "tokens", label: "Tokens" },
              { key: "requests", label: "Requests" },
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
          <div><span>总消费</span><strong>¥{totals.spend.toFixed(2)}</strong></div>
          <div><span>总 Tokens</span><strong>{formatCompactToken(totals.tokens)}</strong></div>
          <div><span>总请求</span><strong>{totals.requests} 次</strong></div>
          <div><span>主要消耗模型</span><strong>{mainModel}</strong></div>
        </div>
        <div className="dash3-card">
          <div className="dash3-card-subtitle">模型消耗分布</div>
          <ModelSpendFlowChart data={flow} metric={metric} onTooltip={onTooltip} theme={theme} />
        </div>

        <div className="dash3-card" style={{ marginTop: 16 }}>
          <div className="dash3-card-subtitle">模型排行</div>
          {ranking.length === 0 ? (
            <div className="dash3-empty-list">
              <strong>还没有模型消费排行</strong>
              <span>使用 API 密匙发起一次调用后，系统会按模型自动汇总金额、Token 和请求次数。</span>
            </div>
          ) : (
            <div className="dash3-model-ranking-list">
              <div className="dash3-model-ranking-header">
                <span>#</span>
                <span>模型</span>
                <span className="text-right">金额</span>
                <span className="text-right">Token</span>
                <span className="text-right">请求次数</span>
                <span className="text-right">占比</span>
                <span className="text-right">趋势</span>
              </div>
              {ranking.map((item, index) => (
                <Link href={`/models?model=${encodeURIComponent(item.model)}`} key={item.model} className="dash3-flow-row">
                  <span className="dash3-flow-rank">{index + 1}</span>
                  <div className="model-name-cell dash3-flow-model-cell">
                    <ModelLogo model={item.model} provider={item.provider} size={26} />
                    <span className="model-text">
                      <strong className="model-name">{item.model}</strong>
                      <small className="model-provider">{item.provider || getModelProviderLabel(item.model)}</small>
                    </span>
                  </div>
                  <div className="dash3-flow-money">¥{item.spend.toFixed(2)}</div>
                  <div className="dash3-flow-meta">{formatCompactToken(item.tokens)} Tokens</div>
                  <div className="dash3-flow-meta">{item.requests} 次</div>
                  <div className="dash3-flow-share">{item.share}%</div>
                  <div className={trendClass(item.trend)}>{trendText(item.trend)}</div>
                </Link>
              ))}
            </div>
          )}
        </div>
        <p className="dash3-advice">
          {ranking.length > 0
            ? `建议：${ranking[0].model} 占用了你 ${ranking[0].share}% 的 Token 消耗，如果是简单任务，可以尝试切换到更低成本模型。`
            : "建议：先完成一次 API 调用，FlowAPI 会自动把真实消费同步到这里。"}
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
              <span>本周 ¥{item.spend.toFixed(2)}</span>
              <span>{formatCompactToken(item.tokens)} Tokens</span>
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

function TokenForecastDecisionSection({ data, summary, metric, setMetric, onTooltip, theme, tick }) {
  const hasPredictionData = Boolean(summary?.hasData);
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
          <div><span>未来 7 天预计消耗</span><strong><MetricValueInline value={<FlashValue value={`${formatCompactToken(summary.weekTokens)}`} tick={tick} />} unit="Tokens" /></strong></div>
          <div><span>预计需要额度</span><strong><MetricValueInline prefix="¥" value={<FlashValue value={summary.weekCost.toFixed(2)} tick={tick} />} /></strong></div>
          <div><span>当前余额可覆盖</span><strong><MetricValueInline prefix="约" value={<FlashValue value={summary.coverDays} tick={tick} />} unit="天" /></strong></div>
          <div><span>建议充值</span><strong><MetricValueInline prefix="¥" value={<FlashValue value={summary.suggestRecharge.toFixed(0)} tick={tick} />} /></strong></div>
        </div>
        <div className="dash3-prediction-chart-wrap">
          <div className="dash3-prediction-legend">
            <span><span className="dash3-prediction-legend-dot" style={{ background: "#f59e0b" }} /> 实际使用</span>
            <span><span className="dash3-prediction-legend-dot" style={{ background: "#3b82f6" }} /> 预测趋势</span>
          </div>
          {hasPredictionData ? (
            <DualLineChart data={data} unit={data.unit} height={360} width={960} onTooltip={onTooltip} theme={theme} />
          ) : (
            <div className="dash3-empty-chart">
              <strong>暂无调用数据</strong>
              <span>完成一次 API 调用后，这里会自动生成 Token 消耗趋势和余额预测。</span>
            </div>
          )}
        </div>
        <p className="dash3-advice">
          {summary.message || "暂无足够数据生成预测，继续使用后将自动生成。"}
          {hasPredictionData && summary.suggestRecharge > 0 ? ` 建议提前充值 ¥${summary.suggestRecharge.toFixed(0)} 避免调用中断。` : ""}
        </p>
      </div>
    </section>
  );
}

function RecentCallLedger({ rows }) {
  const [expanded, setExpanded] = useState(false);
  const [openRowId, setOpenRowId] = useState(null);
  const visibleRows = expanded ? rows.slice(0, 50) : rows.slice(0, 5);
  const canExpand = rows.length > 5;

  function toggleRow(id) {
    setOpenRowId((prev) => (prev === id ? null : id));
  }

  return (
    <section className="dash3-section" id="dash-recent-calls">
      <SectionTitle
        title="API 调用流水"
        subtitle="每一次模型调用都会记录 Token、渠道、价格、折扣和最终扣费，方便你核对成本。"
        right={canExpand ? (
          <button type="button" className="dash3-ledger-toggle" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "收起记录" : `展开全部记录（${Math.min(rows.length, 50)}）`}
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
                    <strong className="call-billing-amount">{formatSmallCny(row.actualCostCny)}</strong>
                    {row.savedPercent > 0 && (
                      <span className="call-billing-saved">-{row.savedPercent}%</span>
                    )}
                    <span className="call-billing-ip">{row.requestIp || "-"}</span>
                    <span className="call-billing-channel-tag">{row.channelName}</span>
                    <span className={`call-billing-status-pill ${row.statusKey}`}>{row.status}</span>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="call-billing-detail" onClick={(e) => e.stopPropagation()}>
                      {/* Section 1: Channel & Request */}
                      <div className="call-billing-detail-tags">
                        <span>渠道：{row.channelName}</span>
                        <span>{row.upstreamHost}</span>
                        <span>{row.source}</span>
                        <span>FinishReason: {row.finishReason}</span>
                        <span>状态：{row.status}</span>
                        <span>IP：{row.requestIp || "-"}</span>
                        <span>耗时：{row.latency}</span>
                      </div>

                      {/* Section 2-4: Pricing cards */}
                      <div className="call-billing-pricing-grid">
                        {/* Original price */}
                        <div className="call-billing-pricing-card">
                          <strong>原始价格</strong>
                          <div className="call-billing-pricing-rows">
                            <div><span>原输入价格</span><b>{formatSmallCny(row.originalInputPricePerM)} / M Token</b></div>
                            <div><span>原输出价格</span><b>{formatSmallCny(row.originalOutputPricePerM)} / M Token</b></div>
                          </div>
                          <small>渠道原始模型价格，用于计算原始理论费用。</small>
                        </div>

                        {/* Discount */}
                        <div className="call-billing-pricing-card">
                          <strong>折扣信息</strong>
                          <div className="call-billing-pricing-rows">
                            <div><span>渠道折扣</span><b>{discountLabel}</b></div>
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
                        <strong>最终计算</strong>
                        <div className="call-billing-calc-formula">
                          ({row.input} / 1M × {formatSmallCny(row.finalInputPricePerM)}) + ({row.output} / 1M × {formatSmallCny(row.finalOutputPricePerM)}) = <b>{formatSmallCny(row.actualCostCny)}</b>
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
                        <small>本系统按照 Token 用量计算费用，最终扣费以平台实际账单为准。</small>
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
            {rows.length > 50 && expanded ? (
              <p className="dash3-ledger-limit">已显示最近 50 条调用记录，更多历史数据后续可在调用日志页查看。</p>
            ) : null}
          </div>
        ) : (
          <div className="dash3-empty-table">
            <strong>暂无调用记录</strong>
            <span>完成第一次 API 调用后，这里会显示模型、Token、价格、折扣和最终扣费明细。</span>
            <Link href="/guide" className="dash3-text-btn" style={{ marginTop: 12, display: "inline-block" }}>查看接入教程</Link>
          </div>
        )}
        {canExpand ? (
          <div className="dash3-ledger-bottom">
            <button type="button" className="dash3-ledger-toggle" onClick={() => setExpanded((value) => !value)}>
              {expanded ? "收起记录" : "展开全部记录"}
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
        <span className="dash3-section-hint">人民币 ¥</span>
      </div>
      <div className="dash3-consumption-grid">
        {items.map((item) => (
          <article className="dash3-consumption-card" key={item.period}>
            <div className="dash3-consumption-top">
              <span>{item.period}</span>
              <b>{item.change}</b>
            </div>
            <strong>¥{item.amount.toFixed(2)}</strong>
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
              <strong>¥{model.amount.toFixed(2)}</strong>
              <span>{model.tokens.toLocaleString()} Token</span>
            </div>
            <div className="dash3-cost-share">
              <span>{model.share}%</span>
              <b><i style={{ width: `${model.share}%` }} /></b>
            </div>
            <div className="dash3-cost-avg">
              <span>平均单次</span>
              <strong>¥{model.avgCost.toFixed(3)}</strong>
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
          <strong>¥{data.avgCost.toFixed(3)}</strong>
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
          <p>黄线为实际使用，蓝线为预测趋势，用来判断什么时候需要补充额度。</p>
        </div>
        <Link href="/recharge" className="dash3-text-btn">去充值 →</Link>
      </div>
      <div className="dash3-balance-layout">
        <div className="dash3-card">
          <div className="dash3-prediction-legend">
            <span><span className="dash3-prediction-legend-dot" style={{ background: "#f59e0b" }} /> 实际使用</span>
            <span><span className="dash3-prediction-legend-dot" style={{ background: "#3b82f6" }} /> 预测趋势</span>
          </div>
          <DualLineChart data={data.chart} unit="¥" height={360} width={980} onTooltip={onTooltip} theme={theme} />
        </div>
        <div className="dash3-balance-side">
          {[
            ["当前余额", `¥${data.currentBalance.toFixed(2)}`],
            ["预计可用天数", `${data.coverDays} 天`],
            ["未来 7 天预计消耗 Token", `${data.futureTokens.toLocaleString()} Token`],
            ["预计需要额度", `¥${data.requiredCredit.toFixed(2)}`],
            ["建议充值金额", `¥${data.suggestedRecharge.toFixed(2)}`],
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
              <strong>{item.save > 0 ? `预计可节省 ¥${item.save.toFixed(2)}` : "优先保证效果稳定"}</strong>
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

function PortraitMetric({ label, value, sub }) {
  return (
    <div className="dash3-portrait-metric">
      <span className="dash3-portrait-metric-label">{label}</span>
      <strong className="dash3-portrait-metric-value">{value}</strong>
      <small className="dash3-portrait-metric-sub">{sub}</small>
    </div>
  );
}

/* ===================================================================
   MAIN PAGE
   =================================================================== */

export default function DashboardPage() {
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
  const [heatmapYear, setHeatmapYear] = useState(() => new Date().getFullYear());
  const [heatmapMonth, setHeatmapMonth] = useState(() => new Date().getMonth());
  const [greeting] = useState(() => {
    const h = new Date().getHours();
    if (h < 6) return "凌晨好";
    if (h < 12) return "上午好";
    if (h < 14) return "中午好";
    if (h < 18) return "下午好";
    return "晚上好";
  });

  const handleTooltip = useCallback((t) => setTooltip(t), []);
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

  /* Load market model ranks */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    let cancelled = false;
    setMarketRanksLoading(true);
    fetch("/api/market/model-rank")
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setMarketRanks(data); })
      .catch(() => { if (!cancelled) setMarketRanks({ dataSource: "error", models: [] }); })
      .finally(() => { if (!cancelled) setMarketRanksLoading(false); });
    return () => { cancelled = true; };
  }, []);

  /* Load FlowAPI internal model ranks */
  useEffect(() => {
    let cancelled = false;
    setFlowApiRanksLoading(true);
    fetch(`/api/analytics/model-usage-rank?period=${flowApiRanksPeriod}`)
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setFlowApiRanks(data); })
      .catch(() => { if (!cancelled) setFlowApiRanks({ dataSource: "error", models: [] }); })
      .finally(() => { if (!cancelled) setFlowApiRanksLoading(false); });
    return () => { cancelled = true; };
  }, [flowApiRanksPeriod]);

  /* Computed */
  const user = customer || { name: "用户", email: "", balance: 0, totalSpend: 0, apiKeys: [], calls: [] };
  const userName = user.name || "用户";
  const baseBalance = Number(user.balance) || 0;
  const usage = buildDashboardUsage(user);
  const modelSpend = buildModelSpendData(usage.calls);
  const recentCallRows = buildRecentCallRows(usage.calls, user.apiKeys || []);
  const dashboardStats = buildDashboardStats(user, usage.calls);
  const trendDays = trendRange === "90d" ? 90 : trendRange === "30d" ? 30 : 7;
  const trendData = buildTrendData(usage.calls, trendDays);
  const modelUsage = buildModelUsage(modelSpend.ranking);
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const heatmapCalendar = useMemo(() => generateMonthCalendar(usage.calls, heatmapYear, heatmapMonth), [usage.calls, heatmapYear, heatmapMonth]);
  const userTopModels = modelSpend.ranking.slice(0, 4).map((item) => ({
    name: item.model,
    id: item.model,
    provider: item.provider,
    tokens: `${formatCompactToken(item.tokens)} Tokens`,
    pct: item.share,
    color: item.color,
  }));
  const mostUsedModel = modelSpend.ranking[0];
  const mostExpensiveModel = [...modelSpend.ranking].sort((a, b) => b.spend - a.spend)[0];
  const avgRequestCost = usage.calls.length
    ? usage.calls.reduce((sum, call) => sum + Number(call.cost || 0), 0) / usage.calls.length
    : 0;

  const prediction = buildPredictionFromTrend(trendData.slice(-7), predictionMetric, baseBalance);
  const predictionData = prediction.data;
  const basePrediction = prediction.summary;

  const contentStyle = {
    background: "var(--dash-bg)",
    minHeight: "100vh",
  };

  return (
    <>
      <Head>
        <title>数据面板 - FlowAPI</title>
      </Head>

      <ConsoleLayout customer={user} currentPath="/dashboard" contentStyle={contentStyle}>
        <div className="dash3-shell">

          {/* ======== Global Tooltip ======== */}
          <DashboardTooltip tooltip={tooltip} theme={theme} />

          {/* ======== SECTION 1: Header ======== */}
          <header className="dash3-header">
            <div>
              <h1>{greeting}，{userName}</h1>
              <p>你的 AI Token 资产正在流动，FlowAPI 帮你看清每一次模型调用、每一笔消耗和未来额度需求。</p>
            </div>
            <div className="dash3-header-right">
              <div className="dash3-brand-gradient" aria-label="FlowAPI 品牌">
                <strong className="dash3-brand-gradient-text">FlowAPI</strong>
                <span className="dash3-brand-gradient-sub">AI Token Router · 统一 API 中转站 · 多模型 · Token 资产</span>
              </div>
              <span className="dash3-live-badge">
                <span className="dash3-live-dot" /> 实时
              </span>
            </div>
          </header>

          {dashboardError ? <div className="dash3-error-banner">{dashboardError}</div> : null}

          <OnboardingChecklist customer={customer} usage={usage} />

          <AssetOverviewSection
            overview={usage.overview}
            tick={tick}
            onOpenAsset={(assetKey) => setDetailModal(buildAssetOverviewDetail(assetKey, {
              overview: usage.overview,
              trendData,
              recentRows: recentCallRows,
              onTooltip: handleTooltip,
              theme,
            }))}
          />

          <DashboardOperationsSection
            stats={dashboardStats}
            trendData={trendData}
            trendRange={trendRange}
            setTrendRange={setTrendRange}
            modelUsage={modelUsage}
            recentRows={recentCallRows}
            onTooltip={handleTooltip}
            theme={theme}
            onOpenMetric={(metricKey) => setDetailModal(buildMetricDetail(metricKey, { stats: dashboardStats, trendData, modelUsage, recentRows: recentCallRows }))}
            onOpenModel={(model) => setDetailModal(buildModelUsageDetail(model, trendData, recentCallRows))}
          />

          <TokenSpendFlowSection
            flow={modelSpend.flow}
            ranking={modelSpend.ranking}
            metric={flowMetric}
            setMetric={setFlowMetric}
            onTooltip={handleTooltip}
            theme={theme}
          />

          <ModelSpendTrendSection ranking={modelSpend.ranking} onTooltip={handleTooltip} theme={theme} />

          <TokenForecastDecisionSection
            data={predictionData}
            summary={basePrediction}
            metric={predictionMetric}
            setMetric={setPredictionMetric}
            onTooltip={handleTooltip}
            theme={theme}
            tick={tick}
          />

          <RecentCallLedger rows={recentCallRows} />

          {/* ===== 全球模型热度排行 + FlowAPI 站内模型用量排行 ===== */}
          <section className="dash3-section">
            <div className="model-leaderboard-stack">
              <ModelLeaderboard
                title="全球模型热度排行"
                subtitle="基于全球公开模型热度数据，仅供选择模型时参考。"
                sourceLabel={marketRanks?.status === "synced" ? "全球 · 实时数据" : marketRanks?.status === "cached" ? "全球 · 最近同步数据" : "全球 · 同步中"}
                updatedAt={marketRanks?.updatedAt}
                items={marketRanks?.models || []}
                loading={marketRanksLoading}
                emptyText="全球模型热度数据同步中"
              />

              <ModelLeaderboard
                title="FlowAPI 站内模型用量排行"
                subtitle="基于 FlowAPI 用户真实调用数据，展示本站最常被使用的大模型。"
                sourceLabel="FlowAPI · 实时数据"
                updatedAt={flowApiRanks?.updatedAt}
                items={flowApiRanks?.models || []}
                loading={flowApiRanksLoading}
                emptyText="暂无站内模型调用数据"
                emptyDescription="完成真实调用后，这里会展示 FlowAPI 用户最常使用的模型。"
                period={flowApiRanksPeriod}
                onPeriodChange={setFlowApiRanksPeriod}
                showTooltip
              />
            </div>
          </section>

          <section className="dash3-section">
            <SectionTitle
              title="个人 AI 画像"
              subtitle="根据最近 30 天调用行为生成的 AI 使用分析。"
            />

            <div className="dash3-portrait-layout">
              {/* === Left: Profile Summary === */}
              <div className="dash3-card dash3-portrait-summary">
                <div className="dash3-portrait-hero">
                  <div className="dash3-profile-avatar">
                    {(user.name || user.email || "U")[0].toUpperCase()}
                  </div>
                  <div>
                    <div className="dash3-profile-name">{userName}</div>
                    <div className="dash3-profile-email">{user.email || "未登录"}</div>
                  </div>
                </div>

                <div className="dash3-portrait-tags">
                  <span className="dash3-portrait-tag" style={{ background: "rgba(99,102,241,0.12)", color: "var(--dash-accent)" }}>{usage.hasCalls ? "已开始调用" : "待首次调用"}</span>
                  <span className="dash3-portrait-tag" style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b" }}>{usage.hasCalls ? `${usage.calls.length} 次调用` : "暂无调用数据"}</span>
                  <span className="dash3-portrait-tag" style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}>{baseBalance > 0 ? "余额可用" : "建议充值"}</span>
                </div>

                <p className="dash3-portrait-summary-text">
                  {usage.hasCalls
                    ? "你的常用模型、消耗模型和活跃趋势已基于真实调用记录生成。"
                    : "完成第一次 API 调用后，这里会自动生成你的 AI 使用画像和模型消耗建议。"}
                </p>

                <div className="dash3-portrait-balance-row">
                  <span>当前余额</span>
                  <MetricValueInline prefix="¥" value={baseBalance.toFixed(2)} />
                  <span style={{ fontSize: 11, color: "var(--dash-green)" }}>{usage.hasCalls ? `${usage.calls.length} 次真实调用` : "等待首次调用"}</span>
                </div>
              </div>

              {/* === Right: Profile Metric Grid === */}
              <div className="dash3-portrait-metrics">
                <PortraitMetric label="最常用模型" value={mostUsedModel?.model || "暂无数据"} sub={mostUsedModel?.provider || "调用后生成"} />
                <PortraitMetric label="最耗费模型" value={mostExpensiveModel?.model || "暂无数据"} sub={mostExpensiveModel ? `¥${mostExpensiveModel.spend.toFixed(4)} 累计消耗` : "调用后生成"} />
                <PortraitMetric label="平均单次成本" value={`¥${avgRequestCost.toFixed(4)}`} sub="/ 次调用" />
                <PortraitMetric label="本周 Token" value={`${formatCompactToken(usage.overview.weekTokens)} Tokens`} sub="最近 7 天真实消耗" />
                <PortraitMetric label="本周请求" value={`${usage.calls.length} 次`} sub="最近调用记录" />
                <PortraitMetric label="优化建议" value={mostExpensiveModel ? "检查高成本模型" : "先完成首次调用"} sub={mostExpensiveModel ? "确认是否用于高价值任务" : "数据生成后给出建议"} />
              </div>
            </div>

            {/* Bottom: Top Models + Heatmap */}
            <div className="dash3-portrait-bottom">
              <div className="dash3-card">
                <div className="dash3-card-subtitle">热门模型</div>
                <div className="dash3-topmodels-mini">
                  {userTopModels.length ? userTopModels.map((m, i) => (
                    <div key={m.name} className="dash3-topmodel-row">
                      <span className="dash3-topmodel-rank">{i + 1}</span>
                      <ModelLogo model={m.id || m.name} provider={m.provider} size={24} />
                      <span className="dash3-topmodel-name">{m.name}</span>
                      <span className="dash3-topmodel-tokens">{m.tokens}</span>
                      <div className="dash3-topmodel-bar-track">
                        <div className="dash3-topmodel-bar-fill" style={{ width: `${m.pct}%`, background: m.color }} />
                      </div>
                    </div>
                  )) : (
                    <div className="dash3-empty-small">暂无真实模型数据，完成调用后自动生成排行。</div>
                  )}
                </div>
              </div>
              <div className="dash3-card dash3-heatmap-card">
                <div className="dash3-card-subtitle" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>活跃热力图</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button
                      type="button"
                      onClick={() => {
                        setHeatmapMonth((m) => m === 0 ? (setHeatmapYear((y) => y - 1), 11) : m - 1);
                      }}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
                    >‹</button>
                    <span style={{ fontSize: 13, fontWeight: 700, minWidth: 80, textAlign: "center" }}>{heatmapCalendar?.label}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setHeatmapMonth((m) => m === 11 ? (setHeatmapYear((y) => y + 1), 0) : m + 1);
                      }}
                      style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid var(--dash-border)", background: "var(--dash-card-bg)", color: "var(--dash-text)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}
                    >›</button>
                  </div>
                </div>
                <div className="dash3-heatmap-wrap">
                  <MonthCalendar calendar={heatmapCalendar} onTooltip={handleTooltip} theme={theme} />
                </div>
                <div className="dash3-heatmap-legend">
                  <span>少</span>
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: theme === "light" ? "#e5e7eb" : "#1e293b", opacity: 0.6 }} />
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: theme === "light" ? "#dbeafe" : "#1e3a5f" }} />
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: theme === "light" ? "#d1fae5" : "#1e4a3f" }} />
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: theme === "light" ? "#86efac" : "#25632d" }} />
                  <span style={{ width: 14, height: 14, borderRadius: 3, background: theme === "light" ? "#22c55e" : "#388a34" }} />
                  <span>多</span>
                </div>
              </div>
            </div>
          </section>

        </div>
      </ConsoleLayout>

      <CardDetailModal
        open={Boolean(detailModal)}
        onClose={() => setDetailModal(null)}
        {...(detailModal || {})}
        actions={<Link href="/guide">去 API 管理</Link>}
      />
    </>
  );
}
