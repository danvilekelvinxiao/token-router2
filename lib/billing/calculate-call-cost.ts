export interface CallCostInput {
  inputTokens: number;
  outputTokens: number;
  originalInputPricePerM: number;
  originalOutputPricePerM: number;
  discountRate: number;
}

export interface CallCostResult {
  originalCostCny: number;
  actualCostCny: number;
  savedCostCny: number;
  savedPercent: number;
  finalInputPricePerM: number;
  finalOutputPricePerM: number;
}

export function calculateCallCost({
  inputTokens,
  outputTokens,
  originalInputPricePerM,
  originalOutputPricePerM,
  discountRate,
}: CallCostInput): CallCostResult {
  const finalInputPricePerM = originalInputPricePerM * discountRate;
  const finalOutputPricePerM = originalOutputPricePerM * discountRate;

  const originalCostCny =
    (inputTokens / 1_000_000) * originalInputPricePerM +
    (outputTokens / 1_000_000) * originalOutputPricePerM;

  const actualCostCny =
    (inputTokens / 1_000_000) * finalInputPricePerM +
    (outputTokens / 1_000_000) * finalOutputPricePerM;

  const savedCostCny = originalCostCny - actualCostCny;
  const savedPercent = originalCostCny > 0 ? (savedCostCny / originalCostCny) * 100 : 0;

  return {
    originalCostCny: Number(originalCostCny.toFixed(8)),
    actualCostCny: Number(actualCostCny.toFixed(8)),
    savedCostCny: Number(savedCostCny.toFixed(8)),
    savedPercent: Number(savedPercent.toFixed(1)),
    finalInputPricePerM: Number(finalInputPricePerM.toFixed(4)),
    finalOutputPricePerM: Number(finalOutputPricePerM.toFixed(4)),
  };
}

/**
 * Format $ API amounts with precision appropriate to the magnitude.
 * >= 1: 2 decimal places
 * >= 0.01: 2-4 decimal places
 * < 0.01: up to 6 decimal places (no scientific notation)
 */
export function formatSmallCny(value: number | null | undefined): string {
  if (value === null || value === undefined) return "暂无数据";
  if (!Number.isFinite(value)) return "暂无数据";
  if (value === 0) return "$0";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1) return `${sign}$${abs.toFixed(2)}`;
  if (abs >= 0.01) return `${sign}$${abs.toFixed(2)}`;
  return `${sign}$${abs.toFixed(6)}`;
}

/**
 * Format a per-M price for display.
 */
export function formatPricePerM(value: number): string {
  if (!Number.isFinite(value)) return "$0 / M";
  return `$${value.toFixed(value >= 1 ? 2 : value >= 0.1 ? 1 : 0)} / M`;
}

/**
 * Format discount rate as readable text.
 */
export function formatDiscount(discountRate: number): string {
  if (discountRate >= 1) return "无折扣";
  if (discountRate >= 0.99) return `${(discountRate * 10).toFixed(1)} 折`;
  return `${(discountRate * 10).toFixed(1)} 折`;
}
