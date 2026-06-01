import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/providers/locale-provider";

const options = [
  { key: "zh-CN", label: "中文" },
  { key: "en-US", label: "English" },
];

export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      const target = event.target as Node;
      if (ref.current && !ref.current.contains(target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = locale === "en-US" ? t("common.localeShort", "EN") : t("common.localeLabel", "中文");

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={t("common.languageMenuLabel", "语言切换")}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 46,
          height: 34,
          padding: "0 10px",
          borderRadius: 8,
          border: "1px solid var(--console-account-border)",
          background: "var(--console-account-bg)",
          color: "var(--console-account-text)",
          cursor: "pointer",
          fontSize: 12,
          fontWeight: 700,
          lineHeight: 1,
          transition: "all 0.15s ease",
        }}
      >
        {current}
      </button>
      {open ? (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 6px)",
            right: 0,
            minWidth: 130,
            zIndex: 140,
            background: "var(--console-dropdown-bg)",
            border: "1px solid var(--console-dropdown-border)",
            borderRadius: 10,
            padding: 4,
            boxShadow: "var(--console-dropdown-shadow)",
          }}
        >
          {options.map((option) => {
            const isActive = option.key === locale;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => {
                  setLocale(option.key);
                  setOpen(false);
                }}
                style={{
                  width: "100%",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  padding: "8px 10px",
                  fontSize: 13,
                  fontWeight: isActive ? 700 : 500,
                  textAlign: "left",
                  background: isActive ? "var(--console-sidebar-active-bg)" : "transparent",
                  color: isActive ? "var(--console-sidebar-active-text)" : "var(--console-dropdown-text)",
                }}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
