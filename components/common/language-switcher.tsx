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
        aria-expanded={open}
        className="flow-toolbar-control"
        style={{ minWidth: 46 }}
      >
        {current}
      </button>
      {open ? (
        <div className="flow-toolbar-popover" style={{ minWidth: 130 }}>
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
                className={`flow-toolbar-popover-item${isActive ? " is-active" : ""}`}
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
