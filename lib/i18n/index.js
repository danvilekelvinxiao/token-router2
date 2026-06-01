import zhCN from "./messages.zh-CN";
import enUS from "./messages.en-US";
import { getLocalePriceMultiplier, normalizeLocale } from "@/lib/pricing/locale-pricing";

export const FLOWAPI_LOCALE_KEY = "flowapi_locale";

const MESSAGES = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

function getByPath(obj, path) {
  return String(path || "")
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

export function getMessages(locale) {
  return MESSAGES[normalizeLocale(locale)] || zhCN;
}

export function t(locale, key, fallback = "") {
  const value = getByPath(getMessages(locale), key);
  return typeof value === "string" ? value : fallback || key;
}

export function getLocaleMeta(locale) {
  const normalized = normalizeLocale(locale);
  return {
    locale: normalized,
    multiplier: getLocalePriceMultiplier(normalized),
  };
}
