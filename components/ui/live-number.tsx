import { useEffect, useRef, useState } from "react";

interface LiveNumberProps {
  value: number | string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
  useGrouping?: boolean;
  locale?: string;
}

export default function LiveNumber({
  value,
  prefix = "",
  suffix = "",
  decimals,
  className = "",
  useGrouping = true,
  locale = "zh-CN",
}: LiveNumberProps) {
  const prevRef = useRef<number | string>("");
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    const num = typeof value === "string" ? parseFloat(value) : value;
    const prevNum = typeof prev === "string" ? parseFloat(prev) : prev;

    if (prevRef.current !== "" && !isNaN(num) && !isNaN(prevNum) && prevNum !== num) {
      setFlash(num > prevNum ? "up" : "down");
      const timer = setTimeout(() => setFlash(null), 700);
      prevRef.current = value;
      return () => clearTimeout(timer);
    }
    prevRef.current = value;
  }, [value]);

  const displayValue = (() => {
    if (typeof value === "number" && Number.isFinite(value)) {
      if (decimals !== undefined) {
        return value.toLocaleString(locale, {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals,
          useGrouping,
        });
      }
      return value.toLocaleString(locale, { useGrouping });
    }
    return String(value);
  })();

  const colorClass =
    flash === "up"
      ? "live-number-up"
      : flash === "down"
      ? "live-number-down"
      : "";

  return (
    <span
      className={`live-number ${colorClass} ${className}`}
      style={{ fontVariantNumeric: "tabular-nums" }}
      aria-label={`${prefix}${displayValue}${suffix}`}
    >
      {prefix}
      <span className="live-number-value">{displayValue}</span>
      {suffix}
    </span>
  );
}
