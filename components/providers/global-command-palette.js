"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";

const ACTIONS = [
  { group: "导航", label: "打开数据面板", href: "/dashboard" },
  { group: "导航", label: "打开模型广场", href: "/models" },
  { group: "导航", label: "打开 API 管理", href: "/api-management" },
  { group: "导航", label: "打开使用日志", href: "/dashboard/logs" },
  { group: "导航", label: "打开个人资料", href: "/profile" },
  { group: "导航", label: "打开充值中心", href: "/recharge" },
  { group: "导航", label: "打开管理员模型页", href: "/admin/models" },
  { group: "导航", label: "打开管理员日志", href: "/admin/logs" },
  { group: "导航", label: "打开团队日志", href: "/team/logs" },
  { group: "快捷", label: "复制模型广场地址", copyKey: "models-url" },
  { group: "快捷", label: "复制 API Base URL", copyKey: "api-base-url" },
];

function normalizeText(value) {
  return String(value || "").toLowerCase().replace(/[\s_:-]+/g, "").trim();
}

export default function GlobalCommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef(null);
  const closeTimerRef = useRef(null);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (open) {
      setMounted(true);
      setQuery("");
      setActiveIndex(0);
      window.requestAnimationFrame(() => {
        inputRef.current?.focus?.();
      });
      return;
    }

    closeTimerRef.current = window.setTimeout(() => {
      setMounted(false);
    }, 180);

    return () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    };
  }, [open]);

  const visibleActions = useMemo(() => {
    const q = normalizeText(query);
    if (!q) return ACTIONS.map((action) => ({ ...action }));
    return ACTIONS.filter((action) => {
      const haystack = [action.group, action.label, action.href, action.copyKey].map(normalizeText).join(" ");
      return haystack.includes(q);
    });
  }, [query]);

  const groupedActions = useMemo(() => {
    const map = new Map();
    visibleActions.forEach((action, index) => {
      if (!map.has(action.group)) map.set(action.group, []);
      map.get(action.group).push({ action, index });
    });
    return Array.from(map.entries()).map(([group, items]) => ({ group, items }));
  }, [visibleActions]);

  useEffect(() => {
    if (activeIndex >= visibleActions.length) {
      setActiveIndex(Math.max(0, visibleActions.length - 1));
    }
  }, [activeIndex, visibleActions.length]);

  async function handleSelect(action) {
    if (!action) return;
    if (action.copyKey) {
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const copyMap = {
        "models-url": `${origin}/models`,
        "api-base-url": "https://flowapi.fun/v1",
      };
      await navigator.clipboard.writeText(copyMap[action.copyKey] || "").catch(() => {});
      setOpen(false);
      return;
    }
    if (action.href) {
      router.push(action.href);
      setOpen(false);
    }
  }

  if (!mounted) return null;

  function onKeyDown(event) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(visibleActions.length - 1, current + 1));
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      handleSelect(visibleActions[activeIndex]);
    }
  }

  return (
    <div
      className={`flowapi-cmdk-overlay ${open ? "is-open" : "is-closing"}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        className="flowapi-cmdk-panel"
        role="dialog"
        aria-modal="true"
        aria-label="全局命令面板"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flowapi-cmdk-topbar">
          <input
            ref={inputRef}
            autoFocus
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            placeholder="搜索页面 / 复制快捷项"
            className="flowapi-cmdk-input"
            aria-label="搜索页面 / 复制快捷项"
          />
          <button type="button" className="flowapi-cmdk-close" onClick={() => setOpen(false)}>
            Esc
          </button>
        </div>
        <div className="flowapi-cmdk-list" role="listbox" aria-label="命令列表">
          {groupedActions.length === 0 ? (
            <div className="flowapi-cmdk-empty">没有匹配结果</div>
          ) : (
            groupedActions.map(({ group, items }) => (
              <div key={group} className="flowapi-cmdk-group">
                <div className="flowapi-cmdk-group-heading">{group}</div>
                {items.map(({ action, index }) => {
                  const isActive = index === activeIndex;
                  return (
                    <button
                      key={`${group}-${action.label}`}
                      type="button"
                      role="option"
                      aria-selected={isActive}
                      className={`flowapi-cmdk-item${isActive ? " active" : ""}`}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => handleSelect(action)}
                    >
                      <span>{action.label}</span>
                      <small>{action.href || "复制"}</small>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
