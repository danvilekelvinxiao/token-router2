type FormatTokenOptions = {
  compact?: boolean;
  withUnit?: boolean;
  emptyText?: string;
};

function toFiniteNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatWithCommas(value: number, digits = 0) {
  return value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatCny(value: unknown, emptyText = "暂无数据") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  return `¥${formatWithCommas(number, 2)}`;
}

export function formatSmallCny(value: unknown, emptyText = "暂无数据") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  if (number > 0 && number < 0.01) return `¥${number.toFixed(6)}`;
  if (number < 0 && Math.abs(number) < 0.01) return `-¥${Math.abs(number).toFixed(6)}`;
  if (number < 0) return `-¥${formatWithCommas(Math.abs(number), 2)}`;
  return formatCny(number, emptyText);
}

export function formatChangeCny(value: unknown, emptyText = "数据同步中") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  const abs = Math.abs(number).toFixed(2);
  if (abs === "0.00") return "¥0.00";
  if (number > 0) return `+¥${abs}`;
  if (number < 0) return `-¥${abs}`;
  return "¥0.00";
}

export function formatTokenCompact(value: unknown, emptyText = "暂无数据") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  const sign = number < 0 ? "-" : "";
  const abs = Math.abs(number);
  const compact = (divisor: number, suffix: string) => {
    const result = abs / divisor;
    const digits = result >= 100 ? 0 : result >= 10 ? 1 : 1;
    return `${sign}${Number(result.toFixed(digits))}${suffix}`;
  };
  if (abs >= 1_000_000_000) return compact(1_000_000_000, "B");
  if (abs >= 1_000_000) return compact(1_000_000, "M");
  if (abs >= 1_000) return compact(1_000, "K");
  return `${sign}${Math.round(abs).toLocaleString("zh-CN")}`;
}

export function formatToken(value: unknown, options: FormatTokenOptions = {}) {
  const { compact = true, withUnit = true, emptyText = "暂无数据" } = options;
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  const label = compact ? formatTokenCompact(number, emptyText) : Math.round(number).toLocaleString("zh-CN");
  return withUnit ? `${label} Token` : label;
}

export function formatRequestCount(value: unknown, emptyText = "暂无数据") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  return `${Math.round(number).toLocaleString("zh-CN")} 次`;
}

export function formatPercent(value: unknown, emptyText = "暂无数据") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  const rounded = Number.isInteger(number) ? number.toFixed(0) : number.toFixed(1).replace(/\.0$/, "");
  return `${rounded}%`;
}

export function formatTrendPercent(value: unknown, emptyText = "数据同步中") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  const percent = formatPercent(Math.abs(number), emptyText);
  if (number > 0) return `↑${percent}`;
  if (number < 0) return `↓${percent}`;
  return "→0%";
}

export function formatDateTime(value: unknown, emptyText = "数据同步中") {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return emptyText;
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).replace(/\//g, "/");
}

export function formatShortDate(value: unknown, emptyText = "数据同步中") {
  const date = new Date(String(value || ""));
  if (Number.isNaN(date.getTime())) return emptyText;
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
