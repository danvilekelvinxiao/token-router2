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
 * Format CNY amounts with precision appropriate to the magnitude.
 * >= 1: 2 decimal places
 * >= 0.01: 2-4 decimal places
 * < 0.01: up to 6 decimal places (no scientific notation)
 */
export function formatSmallCny(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "¥0.00";
  if (value >= 1) return `¥${value.toFixed(2)}`;
  if (value >= 0.01) {
    // Show at least 2, up to 4 decimals for clarity
    const s = value.toFixed(4);
    return `¥${s.replace(/0+$/, "").replace(/\.$/, ".00")}`;
  }
  // Small amounts: up to 6 decimal places
  const fixed = value.toFixed(6);
  return `¥${fixed}`;
}

/**
 * Format a per-M price for display.
 */
export function formatPricePerM(value: number): string {
  if (!Number.isFinite(value)) return "¥0 / M";
  return `¥${value.toFixed(value >= 1 ? 2 : value >= 0.1 ? 1 : 0)} / M`;
}

/**
 * Format discount rate as readable text.
 */
export function formatDiscount(discountRate: number): string {
  if (discountRate >= 1) return "无折扣";
  if (discountRate >= 0.99) return `${(discountRate * 10).toFixed(1)} 折`;
  return `${(discountRate * 10).toFixed(1)} 折`;
}
