import { formatApiMoney, formatToken } from "@/lib/format/number-format";

// Legacy function name kept for compatibility. Wallet balance is station `$ API`, not RMB.
export function formatWalletCny(value?: number | null) {
  return formatApiMoney(value, "暂无数据");
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
  return formatToken(value, { emptyText: "暂无数据" });
}

export function clampWalletProgress(value?: number | null) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
}
