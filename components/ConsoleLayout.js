import Link from "next/link";
import { useRef, useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

function IconDashboard() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconWallet() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M3 6.5A2.5 2.5 0 015.5 4h10A1.5 1.5 0 0117 5.5v9A1.5 1.5 0 0115.5 16h-10A2.5 2.5 0 013 13.5v-7z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M14 10.5h3v3h-3a1.5 1.5 0 010-3z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 7h11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconKey() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="6.5" cy="6.5" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 9.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 14l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M16 12l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconUser() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="6.5" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 18c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconAdmin() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconGuide() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 4.5A2.5 2.5 0 016.5 2H17v14.5H6.5A2.5 2.5 0 014 14V4.5z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 14.5A2.5 2.5 0 016.5 12H17" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 5.5h6M7.5 8h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconModels() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M5 7.5l5-3 5 3v5l-5 3-5-3v-5z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5.4 7.7L10 10.5l4.6-2.8M10 10.5v4.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 5.5l7-4 7 4M3 14.5l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity=".45" />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M8 4H4.5A1.5 1.5 0 003 5.5v9A1.5 1.5 0 004.5 16H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13 13l3-3-3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M16 10H8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7.5 8a2.5 2.5 0 014.2-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="10" cy="14" r="1" fill="currentColor" />
    </svg>
  );
}

const iconMap = {
  dashboard: IconDashboard,
  wallet: IconWallet,
  key: IconKey,
  user: IconUser,
  guide: IconGuide,
  models: IconModels,
  admin: IconAdmin,
  help: IconHelp,
};

const menuItems = [
  { key: "dashboard", label: "数据面板", href: "/dashboard", desc: "Token 消耗与资产总览" },
  { key: "wallet", label: "充值", href: "/recharge", desc: "充值 Token" },
  { key: "key", label: "API 管理", href: "/api-management", desc: "创建和管理 API Key" },
  { key: "models", label: "大模型接入", href: "/models", desc: "查看模型与模型 ID" },
  { key: "help", label: "帮助指南", href: "/help", desc: "配置教程与常见问题" },
  { key: "user", label: "个人资料", href: "/profile", desc: "编辑个人资料" },
  { key: "admin", label: "管理后台", href: "/admin", desc: "系统管理与精细化配置", adminOnly: true },
];

function isAdminCustomer(customer) {
  return Boolean(
    customer?.isAdmin ||
    customer?.id === "cus_admin" ||
    String(customer?.email || "").toLowerCase() === "xiaoyijie@flowapi.fun"
  );
}

function getVisibleMenuItems(customer) {
  const isAdmin = isAdminCustomer(customer);
  return menuItems.filter((item) => !item.adminOnly || isAdmin);
}

function Sidebar({ currentPath, customer }) {
  const visibleMenuItems = getVisibleMenuItems(customer);

  return (
    <aside className="flow-console-sidebar" aria-label="控制台导航">
      {visibleMenuItems.map((item) => {
        const Icon = iconMap[item.key];
        const active = currentPath === item.href || (item.key !== "dashboard" && currentPath.startsWith(item.href));
        return (
          <Link
            key={item.key}
            href={item.href}
            target={item.external ? "_blank" : undefined}
            rel={item.external ? "noopener noreferrer" : undefined}
            className={`flow-console-menu-link${active ? " active" : ""}`}
          >
            <span className="flow-console-menu-icon"><Icon /></span>
            <span className="flow-console-menu-label">{item.label}</span>
          </Link>
        );
      })}
    </aside>
  );
}

function AccountMenu({ customer }) {
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef(null);
  const visibleMenuItems = getVisibleMenuItems(customer);

  function onEnter() {
    clearTimeout(timeoutRef.current);
    setOpen(true);
  }

  function onLeave() {
    timeoutRef.current = setTimeout(() => setOpen(false), 180);
  }

  function handleLogout() {
    localStorage.removeItem("flowapi_customer");
    window.location.href = "/";
  }

  return (
    <div style={{ position: "relative" }} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "7px 10px", borderRadius: 999,
        border: "1px solid var(--console-account-border)",
        background: "var(--console-account-bg)",
        cursor: "default",
      }}>
        <div style={{
          width: 26, height: 26, borderRadius: "50%",
          background: "var(--flow-brand-gradient)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "#fff", fontSize: 13, fontWeight: 700,
        }}>
          {(customer.name || customer.email || "U")[0].toUpperCase()}
        </div>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--console-account-text)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {customer.name || customer.email || customer.company}
        </span>
      </div>

      <div style={{
        position: "absolute", top: "calc(100% + 8px)", right: 0,
        minWidth: 240, opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(-6px)",
        pointerEvents: open ? "auto" : "none",
        transition: "opacity 0.2s ease, transform 0.2s ease",
        zIndex: 130,
      }}>
        <div style={{
          background: "var(--console-dropdown-bg)",
          borderRadius: 14,
          border: "1px solid var(--console-dropdown-border)",
          boxShadow: "var(--console-dropdown-shadow)",
          overflow: "hidden",
        }}>
          <div style={{
            padding: "14px 16px",
            background: "var(--flow-brand-gradient)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              AI Flow 账户
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {customer.name || customer.email || customer.company}
            </div>
          </div>

          <div style={{ padding: "8px" }}>
            {visibleMenuItems.map((item) => {
              const Icon = iconMap[item.key];
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  target={item.external ? "_blank" : undefined}
                  rel={item.external ? "noopener noreferrer" : undefined}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "10px 12px", borderRadius: 8,
                    textDecoration: "none", color: "var(--console-dropdown-text)",
                  }}
                >
                  <span style={{ color: "var(--console-dropdown-desc)", display: "flex" }}><Icon /></span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 11, color: "var(--console-dropdown-desc)", marginTop: 1 }}>{item.desc}</div>
                  </div>
                </Link>
              );
            })}
          </div>

          <div style={{ borderTop: "1px solid var(--console-dropdown-divider)", padding: "8px" }}>
            <button
              onClick={handleLogout}
              style={{
                width: "100%", display: "flex", alignItems: "center", gap: 10,
                padding: "10px 12px", border: 0, borderRadius: 8,
                background: "transparent", color: "#ef4444", cursor: "pointer",
                fontSize: 14, fontWeight: 600,
              }}
            >
              <IconLogout />
              退出登录
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ConsoleLayout({ customer, currentPath, children, contentStyle = {} }) {
  return (
    <main className="landing-shell flow-console-shell">
      <nav className="landing-nav flow-console-nav">
        <div className="landing-nav-inner flow-console-nav-inner">
          <Link className="landing-logo" href="/" aria-label="返回 FlowAPI 首页">
            <span>Flow</span>API
          </Link>
          <div className="flow-console-nav-actions">
            <ThemeToggle />
            <AccountMenu customer={customer} />
          </div>
        </div>
      </nav>

      <Sidebar currentPath={currentPath} customer={customer} />

      <div className="flow-console-content" style={contentStyle}>
        {children}
      </div>
    </main>
  );
}
