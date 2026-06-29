type FormatTokenOptions = {
  compact?: boolean;
  withUnit?: boolean;
  emptyText?: string;
};

type MoneyFormatOptions = {
  emptyText?: string;
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  trimTrailingZeros?: boolean;
  signDisplay?: "auto" | "always" | "never";
};

const API_MONEY_PREFIX = "$ API";
const RMB_PREFIX = "¥";
const DEFAULT_RECHARGE_RATE = 5;

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

function formatFlexibleNumber(value: number, options: MoneyFormatOptions = {}) {
  const {
    minimumFractionDigits = 2,
    maximumFractionDigits = 2,
    trimTrailingZeros = false,
  } = options;
  let formatted = value.toLocaleString("zh-CN", {
    minimumFractionDigits,
    maximumFractionDigits,
  });
  if (trimTrailingZeros && formatted.includes(".")) {
    formatted = formatted.replace(/0+$/, "").replace(/\.$/, "");
  }
  return formatted;
}

function signFor(value: number, signDisplay: MoneyFormatOptions["signDisplay"] = "never") {
  if (signDisplay === "never") return "";
  if (signDisplay === "always") return value >= 0 ? "+" : "-";
  return value < 0 ? "-" : "";
}

export function formatApiMoney(value: unknown, options: MoneyFormatOptions | string = {}) {
  const resolvedOptions = typeof options === "string" ? { emptyText: options } : options;
  const number = toFiniteNumber(value);
  if (number === null) return resolvedOptions.emptyText || "暂无数据";
  const sign = signFor(number, resolvedOptions.signDisplay);
  return `${sign}${API_MONEY_PREFIX} ${formatFlexibleNumber(Math.abs(number), {
    minimumFractionDigits: resolvedOptions.minimumFractionDigits ?? 2,
    maximumFractionDigits: resolvedOptions.maximumFractionDigits ?? 2,
    trimTrailingZeros: resolvedOptions.trimTrailingZeros ?? false,
  })}`;
}

export function formatApiMoneyPrecise(value: unknown, options: MoneyFormatOptions | string = {}) {
  const resolvedOptions = typeof options === "string" ? { emptyText: options } : options;
  const number = toFiniteNumber(value);
  if (number === null) return resolvedOptions.emptyText || "暂无数据";
  const abs = Math.abs(number);
  const maximumFractionDigits = resolvedOptions.maximumFractionDigits ?? (abs > 0 && abs < 0.01 ? 6 : 4);
  const minimumFractionDigits = resolvedOptions.minimumFractionDigits ?? (abs > 0 && abs < 0.01 ? 6 : 4);
  const sign = signFor(number, resolvedOptions.signDisplay);
  return `${sign}${API_MONEY_PREFIX} ${formatFlexibleNumber(abs, {
    minimumFractionDigits,
    maximumFractionDigits,
    trimTrailingZeros: resolvedOptions.trimTrailingZeros ?? false,
  })}`;
}

export function formatRmb(value: unknown, options: MoneyFormatOptions | string = {}) {
  const resolvedOptions = typeof options === "string" ? { emptyText: options } : options;
  const number = toFiniteNumber(value);
  if (number === null) return resolvedOptions.emptyText || "暂无数据";
  const sign = signFor(number, resolvedOptions.signDisplay);
  return `${sign}${RMB_PREFIX}${formatFlexibleNumber(Math.abs(number), {
    minimumFractionDigits: resolvedOptions.minimumFractionDigits ?? 2,
    maximumFractionDigits: resolvedOptions.maximumFractionDigits ?? 2,
    trimTrailingZeros: resolvedOptions.trimTrailingZeros ?? false,
  })}`;
}

export function formatRechargeRate(value: unknown = DEFAULT_RECHARGE_RATE, emptyText = "¥1 = $ API 5") {
  const rate = toFiniteNumber(value);
  if (rate === null || rate <= 0) return emptyText;
  const display = Number.isInteger(rate) ? String(rate) : formatFlexibleNumber(rate, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 6,
    trimTrailingZeros: true,
  });
  return `¥1 = $ API ${display}`;
}

export function parseDecimalAmount(value: unknown) {
  const raw = String(value ?? "").trim().replace(/,/g, "");
  if (!raw || !/^\d+(?:\.\d{0,6})?$/.test(raw)) return null;
  const number = Number(raw);
  if (!Number.isFinite(number) || number < 0) return null;
  return raw;
}

// Legacy aliases: historical code names these values CNY, but user-facing station wallet
// amounts are now standardized as internal `$ API`, not real RMB/USD.
export function formatCny(value: unknown, emptyText = "暂无数据") {
  return formatApiMoney(value, emptyText);
}

export function formatSmallCny(value: unknown, emptyText = "暂无数据") {
  return formatApiMoneyPrecise(value, emptyText);
}

export function formatChangeCny(value: unknown, emptyText = "数据同步中") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  if (Math.abs(number) < 0.000001) return `${API_MONEY_PREFIX} 0.00`;
  return formatApiMoneyPrecise(number, { signDisplay: "always" });
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
  return "0%";
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
