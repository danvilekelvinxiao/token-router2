const DEFAULT_API_RATE = 5;
const DECIMAL_SCALE = 12;
const SCALE_FACTOR = 10n ** BigInt(DECIMAL_SCALE);

function toFiniteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeDecimalInput(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value.toString();
  }
  const text = String(value).trim();
  return text ? text : null;
}

export function decimalToScaled(value, scale = DECIMAL_SCALE) {
  const input = normalizeDecimalInput(value);
  if (input === null) return 0n;
  const negative = input.startsWith("-");
  const cleaned = negative || input.startsWith("+") ? input.slice(1) : input;
  const [integerPartRaw, fractionPartRaw = ""] = cleaned.split(".");
  const integerPart = integerPartRaw.replace(/\D/g, "") || "0";
  const fractionPart = fractionPartRaw.replace(/\D/g, "");
  const paddedFraction = `${fractionPart}${"0".repeat(scale)}`.slice(0, scale);
  const raw = BigInt(integerPart || "0") * (10n ** BigInt(scale)) + BigInt(paddedFraction || "0");
  return negative ? -raw : raw;
}

export function scaledToDecimalString(value, scale = DECIMAL_SCALE) {
  const scaled = typeof value === "bigint" ? value : decimalToScaled(value, scale);
  const negative = scaled < 0n;
  const absolute = negative ? -scaled : scaled;
  const integerPart = absolute / (10n ** BigInt(scale));
  const fractionPart = (absolute % (10n ** BigInt(scale))).toString().padStart(scale, "0");
  return `${negative ? "-" : ""}${integerPart.toString()}.${fractionPart}`;
}

export function roundDecimal(value, digits = 6) {
  const scaled = decimalToScaled(value, digits + 1);
  const sign = scaled < 0n ? -1n : 1n;
  const absolute = scaled < 0n ? -scaled : scaled;
  const rounded = ((absolute + 5n) / 10n) * sign;
  return scaledToDecimalString(rounded, digits);
}

export function addDecimal(left, right, digits = 12) {
  return scaledToDecimalString(decimalToScaled(left, digits) + decimalToScaled(right, digits), digits);
}

export function subtractDecimal(left, right, digits = 12) {
  return scaledToDecimalString(decimalToScaled(left, digits) - decimalToScaled(right, digits), digits);
}

export function multiplyDecimal(left, right, digits = 12) {
  const scale = BigInt(digits);
  const leftScaled = decimalToScaled(left, digits);
  const rightScaled = decimalToScaled(right, digits);
  const product = (leftScaled * rightScaled) / (10n ** scale);
  return scaledToDecimalString(product, digits);
}

export function compareDecimal(left, right, digits = 12) {
  const diff = decimalToScaled(left, digits) - decimalToScaled(right, digits);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

export function parseDecimalAmount(value, fallback = 0) {
  const number = toFiniteNumber(value);
  return number === null ? Number(fallback || 0) : number;
}

export function formatApiMoney(value, emptyText = "暂无数据") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  return `$ API ${number.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatApiMoneyPrecise(value, digits = 6, emptyText = "暂无数据") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  return `$ API ${number.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatRmb(value, emptyText = "暂无数据") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  return `¥${number.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatApiCredit(value, emptyText = "暂无数据") {
  const number = toFiniteNumber(value);
  if (number === null) return emptyText;
  return `$${number.toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} API`;
}

export function formatRechargeRate(rate = DEFAULT_API_RATE) {
  const number = toFiniteNumber(rate);
  if (number === null) return `¥1 = $ API ${DEFAULT_API_RATE}`;
  return `¥1 = $ API ${number.toLocaleString("zh-CN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 4,
  })}`;
}

export function toMoneyText(value, { precise = false, digits = 6 } = {}) {
  return precise ? formatApiMoneyPrecise(value, digits) : formatApiMoney(value);
}
