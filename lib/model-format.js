export function formatTokens(value) {
  if (value === null || value === undefined) return "同步中";

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "同步中";
  if (numeric === 0) return "暂无数据";

  const format = (divisor, suffix) => {
    const result = numeric / divisor;
    const digits = result >= 100 ? 0 : result >= 10 ? 1 : 2;
    return `${Number(result.toFixed(digits))}${suffix}`;
  };

  if (numeric >= 1e12) return format(1e12, "T");
  if (numeric >= 1e9) return format(1e9, "B");
  if (numeric >= 1e6) return format(1e6, "M");
  if (numeric >= 1e3) return format(1e3, "K");

  return String(Math.round(numeric));
}
