import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";

const themes = [
  { key: "system", label: "跟随系统", icon: MonitorIcon },
  { key: "light", label: "浅色", icon: SunIcon },
  { key: "dark", label: "深色", icon: MoonIcon },
];

function MonitorIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

export default function ThemeToggle() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    queueMicrotask(() => setMounted(true));
  }, []);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!mounted) return <div style={{ width: 34, height: 34 }} />;

  const currentTheme = themes.find((t) => t.key === theme) || themes[0];
  const CurrentIcon = currentTheme.icon;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label="切换主题"
        aria-expanded={open}
        className="flow-toolbar-control"
      >
        <CurrentIcon />
      </button>

      {open && (
        <div className="flow-toolbar-popover">
          {themes.map((t) => {
            const Icon = t.icon;
            const isActive = theme === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => { setTheme(t.key); setOpen(false); }}
                className={`flow-toolbar-popover-item${isActive ? " is-active" : ""}`}
              >
                <span style={{ display: "flex", color: isActive ? "var(--console-sidebar-active-text)" : "var(--console-dropdown-desc)" }}>
                  <Icon />
                </span>
                <span>{t.label}</span>
                {isActive && <span style={{ marginLeft: "auto", fontSize: 11 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
