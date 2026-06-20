import { useEffect, useRef, useState } from "react";

interface LiveNumberProps {
  value: number | string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  useGrouping?: boolean;
  locale?: string;
  animate?: boolean;
  durationMs?: number;
}

function toNumericValue(value: number | string) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  const matched = String(value).replace(/,/g, "").match(/[-+]?\d*\.?\d+/)?.[0];
  if (!matched) return null;
  const parsed = Number.parseFloat(matched);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatValue(value: number, locale: string, decimals: number | undefined, useGrouping: boolean) {
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals ?? 0,
    maximumFractionDigits: decimals ?? 2,
    useGrouping,
  });
}

export default function LiveNumber({
  value,
  prefix = "",
  suffix = "",
  decimals,
  className = "",
  useGrouping = true,
  locale = "zh-CN",
  animate = true,
  durationMs = 720,
}: LiveNumberProps) {
  const animationFrameRef = useRef<number | null>(null);
  const animationStartRef = useRef<number | null>(null);
  const previousNumericRef = useRef<number | null>(null);
  const flashValueRef = useRef<number | null>(null);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [displayValue, setDisplayValue] = useState<string>(() => {
    const numeric = toNumericValue(value);
    return numeric === null ? String(value) : formatValue(numeric, locale, decimals, useGrouping);
  });
  const numericValue = toNumericValue(value);
  const motionReduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const isMeaningfulZero = numericValue === 0 && String(value).trim() !== "";

  useEffect(() => {
    const current = numericValue;
    const previous = flashValueRef.current;
    if (previous !== null && current !== null && previous !== current) {
      setFlash(current > previous ? "up" : "down");
      const timer = window.setTimeout(() => setFlash(null), 700);
      flashValueRef.current = current;
      return () => window.clearTimeout(timer);
    }
    flashValueRef.current = current;
  }, [numericValue]);

  useEffect(() => {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (!animate || motionReduced || numericValue === null) {
      setDisplayValue(String(value));
      previousNumericRef.current = null;
      return undefined;
    }

    const target = numericValue;
    const start = previousNumericRef.current ?? 0;
    previousNumericRef.current = target;

    if (start === target) {
      setDisplayValue(formatValue(target, locale, decimals, useGrouping));
      return undefined;
    }

    animationStartRef.current = null;

    const tick = (timestamp: number) => {
      if (animationStartRef.current === null) animationStartRef.current = timestamp;
      const elapsed = timestamp - animationStartRef.current;
      const progress = Math.min(1, elapsed / Math.max(120, durationMs));
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + (target - start) * eased;
      setDisplayValue(formatValue(current, locale, decimals, useGrouping));
      if (progress < 1) {
        animationFrameRef.current = window.requestAnimationFrame(tick);
        return;
      }
      animationFrameRef.current = null;
      setDisplayValue(formatValue(target, locale, decimals, useGrouping));
    };

    animationFrameRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [animate, decimals, durationMs, locale, motionReduced, numericValue, useGrouping, value]);

  const colorClass =
    flash === "up"
      ? "live-number-up"
      : flash === "down"
      ? "live-number-down"
      : "";

  const displayText = numericValue === null
    ? String(value)
    : isMeaningfulZero
      ? formatValue(0, locale, decimals, useGrouping)
      : displayValue;

  return (
    <span
      className={`live-number ${colorClass} ${className}`}
      style={{ fontVariantNumeric: "tabular-nums" }}
      aria-label={`${prefix}${displayText}${suffix}`}
    >
      {prefix}
      <span className="live-number-value">{displayText}</span>
      {suffix}
    </span>
  );
}
