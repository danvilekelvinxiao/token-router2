export function formatWalletCny(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "暂无数据";
  return `¥${Number(value).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatWalletDate(value?: string | null) {
  if (!value) return "暂无套餐";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "暂无套餐";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function formatWalletTokens(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "暂无数据";
  const num = Number(value);
  if (num >= 1_000_000_000_000) return `${(num / 1_000_000_000_000).toFixed(2).replace(/\.?0+$/, "")}T Token`;
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, "")}B Token`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M Token`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2).replace(/\.?0+$/, "")}K Token`;
  return `${num.toLocaleString()} Token`;
}

export function clampWalletProgress(value?: number | null) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
}
