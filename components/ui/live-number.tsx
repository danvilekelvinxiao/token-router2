import { useEffect, useRef, useState } from "react";

interface LiveNumberProps {
  value: number | string;
  prefix?: string;
  suffix?: string;
  decimals?: number;
  className?: string;
}

export default function LiveNumber({
  value,
  prefix = "",
  suffix = "",
  decimals,
  className = "",
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

  const displayValue =
    typeof value === "number" && decimals !== undefined
      ? value.toFixed(decimals)
      : String(value);

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
