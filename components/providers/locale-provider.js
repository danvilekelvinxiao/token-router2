import { createContext, useContext, useMemo, useState } from "react";
import { FLOWAPI_LOCALE_KEY, getLocaleMeta, t as i18nT } from "@/lib/i18n";

const LocaleContext = createContext({
  locale: "zh-CN",
  setLocale: () => {},
  t: (key, fallback = "") => fallback || key,
  priceMultiplier: 1,
});

export function LocaleProvider({ children }) {
  const [locale, setLocaleState] = useState(() => {
    if (typeof window === "undefined") return "zh-CN";
    const stored = window.localStorage.getItem(FLOWAPI_LOCALE_KEY);
    return getLocaleMeta(stored).locale;
  });

  const setLocale = (nextLocale) => {
    const normalized = getLocaleMeta(nextLocale).locale;
    setLocaleState(normalized);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(FLOWAPI_LOCALE_KEY, normalized);
    }
  };

  const value = useMemo(() => {
    const meta = getLocaleMeta(locale);
    return {
      locale: meta.locale,
      setLocale,
      priceMultiplier: meta.multiplier,
      t: (key, fallback = "") => i18nT(meta.locale, key, fallback),
    };
  }, [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  return useContext(LocaleContext);
}
