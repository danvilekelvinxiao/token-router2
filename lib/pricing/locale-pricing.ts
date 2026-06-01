export type FlowApiLocale = "zh-CN" | "en-US";

export function normalizeLocale(input: unknown): FlowApiLocale {
  return String(input || "").toLowerCase() === "en-us" ? "en-US" : "zh-CN";
}

export function getLocalePriceMultiplier(locale: unknown): number {
  const normalized = normalizeLocale(locale);
  return normalized === "en-US" ? 1.25 : 1;
}

export function applyLocalePrice(value: number, locale: unknown): number {
  const num = Number(value || 0);
  return Number((num * getLocalePriceMultiplier(locale)).toFixed(6));
}
