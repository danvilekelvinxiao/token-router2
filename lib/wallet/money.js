const API_MONEY_SCALE = 6;
const RMB_MONEY_SCALE = 2;

export const API_MONEY_UNIT = "$ API";
export const RMB_MONEY_UNIT = "¥";
export const DEFAULT_RECHARGE_RATE = String(process.env.FLOWAPI_RECHARGE_RATE || "5");

function normalizeDecimalString(value = "0") {
  const raw = String(value ?? "").trim();
  if (!raw) return "0";
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = raw.replace(/^[+-]/, "");
  if (!/^\d*(?:\.\d*)?$/.test(unsigned) || unsigned === ".") return "0";
  const [integerRaw = "0", fractionRaw = ""] = unsigned.split(".");
  const integer = integerRaw.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionRaw.replace(/0+$/, "");
  const normalized = fraction ? `${integer}.${fraction}` : integer;
  return normalized === "0" ? "0" : `${sign}${normalized}`;
}

function decimalParts(value = "0") {
  const normalized = normalizeDecimalString(value);
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [integer = "0", fraction = ""] = unsigned.split(".");
  return { negative, integer, fraction };
}

function toScaledBigInt(value = "0", scale = API_MONEY_SCALE) {
  const { negative, integer, fraction } = decimalParts(value);
  const padded = `${fraction}${"0".repeat(scale)}`.slice(0, scale);
  const nextDigit = Number(fraction[scale] || 0);
  let scaled = BigInt(`${integer}${padded}` || "0");
  if (nextDigit >= 5) scaled += 1n;
  return negative ? -scaled : scaled;
}

function fromScaledBigInt(value, scale = API_MONEY_SCALE) {
  const negative = value < 0n;
  const abs = negative ? -value : value;
  const divisor = 10n ** BigInt(scale);
  const integer = abs / divisor;
  const fraction = String(abs % divisor).padStart(scale, "0");
  const result = scale > 0 ? `${integer}.${fraction}` : String(integer);
  return normalizeDecimalString(`${negative && abs !== 0n ? "-" : ""}${result}`);
}

export function decimalAdd(a, b, scale = API_MONEY_SCALE) {
  return fromScaledBigInt(toScaledBigInt(a, scale) + toScaledBigInt(b, scale), scale);
}

export function decimalSubtract(a, b, scale = API_MONEY_SCALE) {
  return fromScaledBigInt(toScaledBigInt(a, scale) - toScaledBigInt(b, scale), scale);
}

export function decimalCompare(a, b, scale = API_MONEY_SCALE) {
  const left = toScaledBigInt(a, scale);
  const right = toScaledBigInt(b, scale);
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

export function decimalMultiply(a, b, scale = API_MONEY_SCALE) {
  const left = toScaledBigInt(a, scale);
  const right = toScaledBigInt(b, scale);
  const divisor = 10n ** BigInt(scale);
  const sign = (left < 0n) !== (right < 0n) ? -1n : 1n;
  const absProduct = (left < 0n ? -left : left) * (right < 0n ? -right : right);
  const rounded = (absProduct + divisor / 2n) / divisor;
  return fromScaledBigInt(sign * rounded, scale);
}

export function decimalMin(a, b, scale = API_MONEY_SCALE) {
  return decimalCompare(a, b, scale) <= 0 ? toFixedDecimalString(a, scale) : toFixedDecimalString(b, scale);
}

export function decimalMultiplyRatio(value = 0, numerator = 0, denominator = 1, scale = API_MONEY_SCALE) {
  const safeNumerator = BigInt(Math.max(0, Math.floor(Number(numerator || 0))));
  const safeDenominator = BigInt(Math.max(1, Math.floor(Number(denominator || 0))));
  if (safeNumerator <= 0n) return toFixedDecimalString(0, scale);

  const scaledValue = toScaledBigInt(value, scale);
  const negative = scaledValue < 0n;
  const absValue = negative ? -scaledValue : scaledValue;
  const rounded = (absValue * safeNumerator + safeDenominator / 2n) / safeDenominator;
  return fromScaledBigInt(negative ? -rounded : rounded, scale);
}

export function toDecimalString(value = 0, scale = API_MONEY_SCALE) {
  return fromScaledBigInt(toScaledBigInt(value, scale), scale).replace(/\.$/, "");
}

export function toFixedDecimalString(value = 0, scale = API_MONEY_SCALE) {
  const normalized = fromScaledBigInt(toScaledBigInt(value, scale), scale);
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [integer = "0", fraction = ""] = unsigned.split(".");
  return `${negative && (integer !== "0" || /[1-9]/.test(fraction)) ? "-" : ""}${integer}.${fraction.padEnd(scale, "0").slice(0, scale)}`;
}

export function toApiMoneyString(value = 0) {
  return toFixedDecimalString(value, API_MONEY_SCALE);
}

export function toRmbMoneyString(value = 0) {
  return toFixedDecimalString(value, RMB_MONEY_SCALE);
}

export function calculateRechargeCreditApi(paymentAmountRmb, rate = DEFAULT_RECHARGE_RATE) {
  return toFixedDecimalString(decimalMultiply(paymentAmountRmb, rate, API_MONEY_SCALE), API_MONEY_SCALE);
}

export function toNumber(value = 0) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

export function isPositiveDecimal(value) {
  return decimalCompare(value, "0", API_MONEY_SCALE) > 0;
}
