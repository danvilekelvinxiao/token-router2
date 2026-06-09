import Link from "next/link";
import { useEffect, useState } from "react";
import FlowApiBrandText from "@/components/brand/flowapi-brand-text";
import ThemeToggle from "@/components/ThemeToggle";

const adminMenuGroups = [
  {
    key: "home",
    label: "后台首页",
    helper: "今天赚了多少、系统是否正常",
    items: [
      { key: "overview", label: "管理概览", href: "/admin", icon: IconOverview },
      { key: "commercialHealth", label: "商业闭环检查", href: "/admin/commercial-health", icon: IconMaintenance },
    ],
  },
  {
    key: "models",
    label: "模型管理",
    helper: "上游、模型、价格、发布",
    items: [
	      { key: "modelWizard", label: "模型接入向导", href: "/admin/model-wizard", icon: IconBossWizard, aliases: ["/admin/boss-wizard"] },
	      { key: "upstreams", label: "上游渠道", href: "/admin/upstreams", icon: IconChannels, aliases: ["/admin/channels"] },
      { key: "backupProviderReview", label: "备用线路审核", href: `/admin/providers/${["ai", "cards"].join("")}`, icon: IconChannels },
	      { key: "routes", label: "智能路由", href: "/admin/routes", icon: IconRouting, aliases: ["/admin/routing", "/admin/model-mapping"] },
      { key: "modelMarket", label: "模型广场", href: "/admin/model-market", icon: IconModels },
      { key: "imageModels", label: "图片模型", href: "/admin/image-models", icon: IconModels },
      { key: "models", label: "模型测试", href: "/admin/models", icon: IconModels },
      { key: "billing", label: "价格规则", href: "/admin/billing-rules", icon: IconBilling },
    ],
  },
  {
    key: "users",
    label: "用户管理",
    helper: "用户、团队、API Key、邀请",
    items: [
      { key: "users", label: "用户与 API Key", href: "/admin/users", icon: IconUsers },
      { key: "teams", label: "团队管理", href: "/admin/teams", icon: IconUsers },
      { key: "insights", label: "用户画像", href: "/admin/user-insights", icon: IconInsights },
      { key: "referrals", label: "邀请返佣", href: "/admin/referrals", icon: IconReferrals },
    ],
  },
  {
    key: "orders",
    label: "订单与支付",
    helper: "充值、套餐、激活码",
    items: [
      { key: "recharges", label: "充值审核", href: "/admin/recharges", icon: IconRecharges },
      { key: "membership", label: "套餐会员", href: "/admin/membership", icon: IconBilling },
      { key: "redeemCodes", label: "激活码", href: "/admin/redeem-codes", icon: IconRedeem },
    ],
  },
  {
    key: "ops",
    label: "运营配置",
    helper: "前台内容、公告、称号",
    items: [
      { key: "contentMap", label: "前后台对应", href: "/admin/content-map", icon: IconAnnouncements },
      { key: "content", label: "前台内容", href: "/admin/content", icon: IconAnnouncements },
      { key: "announcements", label: "系统公告", href: "/admin/announcements", icon: IconAnnouncements },
      { key: "titleRules", label: "称号规则", href: "/admin/title-rules", icon: IconHonors },
    ],
  },
  {
    key: "logs",
    label: "数据与日志",
    helper: "调用、团队、导出",
    items: [
      { key: "profit", label: "毛利审计", href: "/admin/profit", icon: IconBilling },
      { key: "logs", label: "调用日志", href: "/admin/logs", icon: IconLogs },
      { key: "teamReports", label: "团队报表", href: "/admin/team-reports", icon: IconLogs },
      { key: "teamUsageLogs", label: "团队日志", href: "/admin/team-usage-logs", icon: IconLogs },
    ],
  },
  {
    key: "monitor",
    label: "系统监控",
    helper: "健康、渠道、告警",
    items: [
      { key: "healthCheck", label: "功能健康检查", href: "/admin/health-check", icon: IconMaintenance },
      { key: "upstreamStatus", label: "上游状态", href: "/admin/upstream-status", icon: IconTokenPool, aliases: ["/admin/token-pool/status"] },
      { key: "tokenAlerts", label: "Token 告警", href: "/admin/token-alerts", icon: IconSecurity },
      { key: "operatorGuide", label: "老板操作指南", href: "/admin/operator-guide", icon: IconBossWizard },
    ],
  },
  {
    key: "settings",
    label: "系统设置",
    helper: "安全与高级技术入口",
    items: [
      { key: "settings", label: "站点设置", href: "/admin/settings", icon: IconSettings },
      { key: "security", label: "安全风控", href: "/admin/security", icon: IconSecurity },
      { key: "advanced", label: "高级技术入口", href: "/admin/advanced", icon: IconRouting },
    ],
  },
];

function IconModels() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="3" width="7" height="4" rx="1"/><rect x="14" y="3" width="7" height="4" rx="1"/><rect x="3" y="10" width="7" height="4" rx="1"/><rect x="14" y="10" width="7" height="4" rx="1"/><rect x="3" y="17" width="7" height="4" rx="1"/><rect x="14" y="17" width="7" height="4" rx="1"/></svg>; }
function IconBossWizard() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19h16"/><path d="M6 16l3-8 3 5 3-9 3 12"/><path d="M8 5h.01M16 5h.01"/><path d="M5 12h4M15 12h4"/></svg>; }

function IconTokenPool() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="6" rx="2"/><rect x="3" y="14" width="18" height="6" rx="2"/><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6"/></svg>; }

function IconMaintenance() { return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v3M12 18v3M4.6 6.6l2.1 2.1M17.3 15.3l2.1 2.1M3 12h3M18 12h3M4.6 17.4l2.1-2.1M17.3 8.7l2.1-2.1"/><circle cx="12" cy="12" r="4"/></svg>; }

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

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 3200) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    const response = await fetch(url, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function AdminAccessState({ title, description, canRetry = false, onRetry = null, retrying = false }) {
  return (
    <main className="landing-shell admin-access-shell">
      <div className="admin-access-card">
        <span><FlowApiBrandText text="FlowAPI Admin" size="sm" /></span>
        <h1>{title}</h1>
        <p>{description}</p>
        <div className="admin-access-actions">
          {canRetry && typeof onRetry === "function" ? (
            <button type="button" onClick={onRetry} disabled={retrying}>
              {retrying ? "重新校验中..." : "重新校验"}
            </button>
          ) : null}
          <Link href="/dashboard">返回数据面板</Link>
          <Link href="/login">切换账号</Link>
        </div>
      </div>
    </main>
  );
}

export default function AdminLayout({ currentPath, children }) {
  const [access, setAccess] = useState("checking");
  const [checking, setChecking] = useState(true);

  async function verifyAdminAccess() {
    setChecking(true);
    try {
      const secret = typeof window === "undefined" ? "" : sessionStorage.getItem("flowapi_admin_secret") || "";
      const { response, data } = await fetchJsonWithTimeout("/api/admin-access", {
        headers: secret ? { "x-admin-secret": secret } : {},
      });
      if (response.ok && data?.ok && isAdminCustomer(data.customer)) {
        try {
          if (typeof window !== "undefined" && data.customer) {
            localStorage.setItem("flowapi_customer", JSON.stringify(data.customer));
          }
        } catch {}
        setAccess("allowed");
        setChecking(false);
        return;
      }

      const { response: fallbackResponse, data: fallbackData } = await fetchJsonWithTimeout("/api/admin/channels", {
        headers: secret ? { "x-admin-secret": secret } : {},
      });
      if (fallbackResponse.ok) {
        const customer = fallbackData?.customer || fallbackData?.admin || {
          id: "cus_admin",
          email: "xiaoyijie@flowapi.fun",
          role: "admin",
          isAdmin: true,
        };
        try {
          if (typeof window !== "undefined" && customer) {
            localStorage.setItem("flowapi_customer", JSON.stringify({
              ...customer,
              isAdmin: true,
            }));
          }
        } catch {}
        setAccess("allowed");
        setChecking(false);
        return;
      }
    } catch {}

    try {
      if (typeof window === "undefined") {
        setAccess("denied");
        return;
      }
      try {
        const stored = localStorage.getItem("flowapi_customer");
        const customer = stored ? JSON.parse(stored) : null;
        setAccess(isAdminCustomer(customer) ? "allowed" : "denied");
      } catch {
        setAccess("denied");
      }
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      verifyAdminAccess();
    });
  }, []);

  if (access === "checking" || checking) {
    return (
      <AdminAccessState
        title="正在校验管理员权限"
        description="请稍等，系统正在确认当前账号是否可以访问后台管理。即使本地缓存丢失，也会自动向服务器确认你的管理员身份。"
      />
    );
  }

  if (access === "denied") {
    return (
      <AdminAccessState
        title="你没有权限访问管理后台"
        description="管理后台只对管理员开放。若你刚登录或浏览器刚清理缓存，可点击重新校验；普通用户请继续使用数据面板、API 管理、充值和帮助指南。"
        canRetry
        retrying={checking}
        onRetry={() => {
          setAccess("checking");
          verifyAdminAccess();
        }}
      />
    );
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

      <aside style={{ position: "fixed", top: 65, left: 0, bottom: 0, width: 236, background: "var(--dash-card-bg)", borderRight: "1px solid var(--dash-border)", padding: "18px 12px 16px", zIndex: 80, overflowY: "auto" }}>
        {adminMenuGroups.map((group) => (
          <section key={group.key} style={{ marginBottom: 14 }}>
            <div style={{ padding: "6px 10px 7px" }}>
              <strong style={{ display: "block", fontSize: 12, fontWeight: 900, color: "var(--dash-text)" }}>{group.label}</strong>
              <span style={{ display: "block", marginTop: 2, fontSize: 10, lineHeight: 1.4, color: "var(--dash-sub)" }}>{group.helper}</span>
            </div>
            {group.items.map((item) => {
              const Icon = item.icon;
              const paths = [item.href, ...(item.aliases || [])];
              const active = paths.some((path) => currentPath === path || (path !== "/admin" && currentPath.startsWith(path)));
              return (
                <Link key={item.key} href={item.href} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "9px 10px", borderRadius: 8, marginBottom: 2,
                  color: active ? "var(--dash-accent)" : "var(--dash-sub)", background: active ? "var(--dash-card-hover)" : "transparent",
                  fontWeight: active ? 800 : 600, fontSize: 12, textDecoration: "none", transition: "transform .15s ease, background .15s ease, color .15s ease",
                }}>
                  <span style={{ display: "flex", flex: "none", opacity: active ? 1 : 0.68 }}><Icon /></span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </section>
        ))}
      </aside>

      <div style={{ padding: "24px 28px 32px 268px" }}>
        {children}
      </div>
    </main>
  );
}
