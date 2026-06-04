import Link from "next/link";
import { useEffect, useState } from "react";
import FlowApiBrandText from "@/components/brand/flowapi-brand-text";
import ThemeToggle from "@/components/ThemeToggle";

const adminMenuItems = [
  { key: "overview", label: "管理概览", href: "/admin", icon: IconOverview },
  { key: "channels", label: "上游渠道管理", href: "/admin/channels", icon: IconChannels },
  { key: "tokenPool", label: "团队 Token 池", href: "/admin/token-pool", icon: IconTokenPool },
  { key: "teams", label: "团队管理", href: "/admin/teams", icon: IconUsers },
  { key: "rateLimits", label: "限流规则", href: "/admin/rate-limits", icon: IconRouting },
  { key: "teamReports", label: "团队报表", href: "/admin/team-reports", icon: IconLogs },
  { key: "users", label: "用户与 Token 权限", href: "/admin/users", icon: IconUsers },
  { key: "billing", label: "计费规则", href: "/admin/billing-rules", icon: IconBilling },
  { key: "routing", label: "全局转发规则", href: "/admin/routing", icon: IconRouting },
  { key: "security", label: "安全风控", href: "/admin/security", icon: IconSecurity },
  { key: "insights", label: "用户画像分析", href: "/admin/user-insights", icon: IconInsights },
  { key: "logs", label: "调用日志", href: "/admin/logs", icon: IconLogs },
  { key: "announcements", label: "系统公告管理", href: "/admin/announcements", icon: IconAnnouncements },
  { key: "referrals", label: "邀请返佣管理", href: "/admin/referrals", icon: IconReferrals },
  { key: "titleRules", label: "称号规则", href: "/admin/title-rules", icon: IconHonors },
  { key: "membership", label: "会员管理", href: "/admin/membership", icon: IconBilling },
  { key: "settings", label: "系统设置", href: "/admin/settings", icon: IconSettings },
  { key: "recharges", label: "充值审核", href: "/admin/recharges", icon: IconRecharges },
  { key: "newapi", label: "New API 管理", href: "/admin/new-api", icon: IconNewApi },
  { key: "passthrough", label: "Token 直通白名单", href: "/admin/newapi-passthrough", icon: IconPassthrough },
  { key: "importToken", label: "导入 New API Token", href: "/admin/api-keys/import-newapi-token", icon: IconImportToken },
  { key: "redeemCodes", label: "激活码管理", href: "/admin/redeem-codes", icon: IconRedeem },
  { key: "models", label: "模型与上游管理", href: "/admin/models", icon: IconModels },
];

function IconModels() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="4" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="3" y="10" width="7" height="4" rx="1"/><rect x="14" y="10" width="7" height="4" rx="1"/><rect x="3" y="17" width="7" height="4" rx="1"/><rect x="14" y="17" width="7" height="4" rx="1"/></svg>; }

function IconTokenPool() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/></svg>; }

function IconRedeem() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 10l3 3 5-5"/><line x1="12" y1="18" x2="12" y2="13"/></svg>; }

function IconOverview() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>; }
function IconChannels() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M2 16.1A5 5 0 015.9 12M8 12a5 5 0 017 0M18 12a5 5 0 013.9 4.1"/><line x1="12" y1="2" x2="12" y2="7"/><circle cx="12" cy="10" r="2"/></svg>; }
function IconUsers() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="4"/><path d="M1 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/><circle cx="18" cy="7" r="3"/><path d="M14 21c0-2.4 1.8-4.3 4-4.3s4 1.9 4 4.3"/></svg>; }
function IconBilling() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="16" cy="16" r="2"/></svg>; }
function IconRouting() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4M5.6 5.6l2.8 2.8m7.2 7.2l2.8 2.8M5.6 18.4l2.8-2.8m7.2-7.2l2.8-2.8"/></svg>; }
function IconSecurity() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l8 4v6c0 5.5-3.8 10.7-8 12-4.2-1.3-8-6.5-8-12V6l8-4z"/><circle cx="12" cy="12" r="2"/></svg>; }
function IconLogs() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>; }
function IconAnnouncements() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5h16v11H7l-3 3V5z"/><path d="M8 9h8M8 13h5"/></svg>; }
function IconReferrals() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="8" cy="8" r="3"/><circle cx="17" cy="7" r="2.5"/><circle cx="16" cy="17" r="3"/><path d="M10.6 9.5l3.8 5.2M10.9 7.7l3.7-.5M10.5 16.2l2.8.5"/></svg>; }
function IconHonors() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3l2.7 5.4 6 .9-4.3 4.2 1 6-5.4-2.8-5.4 2.8 1-6-4.3-4.2 6-.9L12 3Z"/><path d="M9 12.5l2 2 4-5"/></svg>; }
function IconSettings() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 1v2m0 18v2M4.22 4.22l1.42 1.42m12.72 12.72l1.42 1.42M1 12h2m18 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>; }
function IconRecharges() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="1" y="5" width="22" height="14" rx="2"/><path d="M7 15l4-6 4 4 4-8"/></svg>; }
function IconInsights() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="9" cy="7" r="4"/><path d="M1 21c0-4.4 3.6-8 8-8"/><circle cx="18" cy="9" r="3"/><path d="M12 21c0-2.8 2.2-5 5-5"/><path d="M19 16v5M17 18h4"/></svg>; }
function IconNewApi() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>; }
function IconPassthrough() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 2l8 4v6c0 5.5-3.8 10.7-8 12-4.2-1.3-8-6.5-8-12V6l8-4z"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="9" y1="12" x2="15" y2="12"/></svg>; }
function IconImportToken() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 16V4M12 4L8 8M12 4L16 8"/><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"/></svg>; }

function isAdminCustomer(customer) {
  return Boolean(
    customer?.isAdmin ||
    customer?.id === "cus_admin" ||
    String(customer?.email || "").toLowerCase() === "xiaoyijie@flowapi.fun"
  );
}

function AdminAccessState({ title, description }) {
  return (
    <main className="landing-shell admin-access-shell">
      <div className="admin-access-card">
        <span><FlowApiBrandText text="FlowAPI Admin" size="sm" /></span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="admin-access-actions">
          <Link href="/dashboard">返回数据面板</Link>
          <Link href="/login">切换账号</Link>
        </div>
      </div>
    </main>
  );
}

export default function AdminLayout({ currentPath, children }) {
  const [access, setAccess] = useState("checking");

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const stored = localStorage.getItem("flowapi_customer");
        const customer = stored ? JSON.parse(stored) : null;
        setAccess(isAdminCustomer(customer) ? "allowed" : "denied");
      } catch {
        setAccess("denied");
      }
    });
  }, []);

  if (access === "checking") {
    return <AdminAccessState title="正在校验管理员权限" description="请稍等，系统正在确认当前账号是否可以访问后台管理。" />;
  }

  if (access === "denied") {
    return <AdminAccessState title="你没有权限访问管理后台" description="管理后台只对管理员开放。普通用户请继续使用数据面板、API 管理、充值和帮助指南。" />;
  }

  return (
    <main className="landing-shell" style={{ minHeight: "100vh", paddingTop: 65 }}>
      <nav className="landing-nav" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 120 }}>
        <div className="landing-nav-inner">
          <Link className="landing-logo" href="/" aria-label="FlowAPI">
            <FlowApiBrandText />
          </Link>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--dash-accent)", background: "var(--dash-card-bg)", border: "1px solid var(--dash-border)", padding: "4px 10px", borderRadius: 6 }}>管理员</span>
            <ThemeToggle />
            <Link href="/dashboard" style={{ fontSize: 13, fontWeight: 600, color: "var(--dash-sub)", textDecoration: "none" }}>返回控制台 →</Link>
          </div>
        </div>
      </nav>

      <aside style={{ position: "fixed", top: 65, left: 0, bottom: 0, width: 210, background: "var(--dash-card-bg)", borderRight: "1px solid var(--dash-border)", padding: "24px 12px 16px", zIndex: 80, overflowY: "auto" }}>
        {adminMenuItems.map((item) => {
          const Icon = item.icon;
          const active = currentPath === item.href || (item.key !== "overview" && currentPath.startsWith(item.href));
          return (
            <Link key={item.key} href={item.href} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, marginBottom: 2,
              color: active ? "var(--dash-accent)" : "var(--dash-sub)", background: active ? "var(--dash-card-hover)" : "transparent",
              fontWeight: active ? 700 : 500, fontSize: 13, textDecoration: "none", transition: "all 0.15s ease",
            }}>
              <span style={{ display: "flex", flex: "none", opacity: active ? 1 : 0.65 }}><Icon /></span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </aside>

      <div style={{ padding: "24px 28px 32px 240px" }}>
        {children}
      </div>
    </main>
  );
}
